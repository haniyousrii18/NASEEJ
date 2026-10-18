import fs from 'fs';
import { query, withTransaction } from '../config/db.js';
import { aiStatus, getProvider } from './ai/index.js';
import { ProviderError } from './ai/types.js';
import { logAuditEvent } from './auditService.js';
import { resolveStoredPath } from './storageService.js';

/**
 * Runs the configured provider over one stored document and saves its output as UNREVIEWED suggestions.
 * Honest states only: queued -> processing -> completed | failed. Nothing is ever written to visits, labs, allergies
 * or prescriptions here; a clinician must accept a fact (documentReviewRoutes) before it counts for anything.
 */
export type StartResult = { started: true } | { started: false; reason: 'NOT_CONFIGURED' | 'ALREADY_RUNNING_OR_DONE' | 'FILE_UNAVAILABLE' | 'NOT_FOUND' };

export async function startProcessing(documentId: string, actor: { id: string; email: string; role: string }): Promise<StartResult> {
  const provider = getProvider();
  if (!provider || !provider.isConfigured()) return { started: false, reason: 'NOT_CONFIGURED' };

  const doc = await query('SELECT id, organization_id, patient_id, storage_path, mime_type FROM documents WHERE id = $1', [documentId]);
  if (doc.rowCount === 0) return { started: false, reason: 'NOT_FOUND' };
  const d = doc.rows[0];
  const full = resolveStoredPath(d.storage_path);
  if (!full || !fs.existsSync(full)) return { started: false, reason: 'FILE_UNAVAILABLE' };

  // One job per document. A new job can start only for a document with no job, a failed one, or one stuck 'processing' for 10+ minutes.
  const claim = await query(
    `INSERT INTO document_processing (document_id, organization_id, status, provider, model, requested_by, attempts, started_at)
     VALUES ($1, $2, 'processing', $3, $4, $5, 1, NOW())
     ON CONFLICT (document_id) DO UPDATE
       SET status = 'processing', provider = EXCLUDED.provider, model = EXCLUDED.model, requested_by = EXCLUDED.requested_by,
           attempts = document_processing.attempts + 1, started_at = NOW(), finished_at = NULL, error_code = NULL, updated_at = NOW()
       WHERE document_processing.status = 'failed'
          OR (document_processing.status IN ('processing', 'queued') AND document_processing.started_at < NOW() - INTERVAL '10 minutes')
     RETURNING document_id`,
    [documentId, d.organization_id, provider.name, provider.model, actor.id]
  );
  if (claim.rowCount === 0) return { started: false, reason: 'ALREADY_RUNNING_OR_DONE' };

  const audit = (action: string, details: Record<string, unknown>) =>
    logAuditEvent({
      organizationId: d.organization_id,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action,
      resourceType: 'document',
      resourceId: documentId,
      details: { documentId, patientId: d.patient_id, ...details },
    });
  audit('AI_DOCUMENT_PROCESS_START', { status: 'processing' });

  // Runs after the HTTP response; the caller polls the job state.
  void (async () => {
    try {
      const buffer = await fs.promises.readFile(full);
      const analysis = await provider.analyze({ buffer, mimeType: d.mime_type });
      await withTransaction(async (client) => {
        await client.query('DELETE FROM document_facts WHERE document_id = $1 AND review_status = $2', [documentId, 'unreviewed']);
        for (const f of analysis.facts) {
          await client.query(
            `INSERT INTO document_facts (document_id, organization_id, patient_id, kind, label, value, unit, fact_date, source_page, source_passage, confidence, rationale, original)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [documentId, d.organization_id, d.patient_id, f.kind, f.label, f.value, f.unit, f.date, f.page, f.passage, f.confidence, f.why, JSON.stringify(f)]
          );
        }
        await client.query(
          `UPDATE document_processing
           SET status = 'completed', model = $2, suggested_type = $3, suggested_type_confidence = $4, page_count = $5, finished_at = NOW(), updated_at = NOW()
           WHERE document_id = $1`,
          [documentId, analysis.model, analysis.documentType, analysis.documentTypeConfidence, analysis.pageCount]
        );
      });
      audit('AI_DOCUMENT_PROCESS_COMPLETE', { status: 'completed', count: analysis.facts.length });
    } catch (err) {
      const code = err instanceof ProviderError ? err.code : 'PROVIDER_ERROR';
      // Only the code is stored and logged: error text from a provider can echo document content.
      console.error(`[AI] document ${documentId} failed: ${code}`);
      await query(`UPDATE document_processing SET status = 'failed', error_code = $2, finished_at = NOW(), updated_at = NOW() WHERE document_id = $1`, [documentId, code]).catch(() => undefined);
      audit('AI_DOCUMENT_PROCESS_FAILED', { status: 'failed', code });
    }
  })();

  return { started: true };
}

export { aiStatus };
