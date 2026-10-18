import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { blockPlatformAdminFromClinical, tenantUnlessPatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { aiStatus, startProcessing } from '../services/documentProcessing.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { apiError, isIsoDate, isUuid, serverError, trimmed } from '../services/validation.js';

/**
 * AI-assisted document review: processing state, candidate facts, and the clinician's accept / correct / reject.
 * Mounted before the main documents router so '/ai/status' and '/facts' are not read as a document id.
 *  - A clinician works on documents of their OWN center only. Other centers' facts are never exposed here.
 *  - A patient sees the processing state of their own documents and only facts a clinician has accepted or corrected.
 *  - A patient's own file is sent to an AI provider only after the patient allowed it for that document.
 */
export const documentReviewRouter = Router();
documentReviewRouter.use(authenticate, tenantUnlessPatient, blockPlatformAdminFromClinical);

type Actor = { kind: 'patient'; patientId: string } | { kind: 'doctor'; orgId: string };
function actorOf(req: Request): Actor | null {
  if (req.user?.patientProfileId) return { kind: 'patient', patientId: req.user.patientProfileId };
  if (req.currentMembership?.role === 'doctor' && req.tenantId) return { kind: 'doctor', orgId: req.tenantId };
  return null;
}
const refuse = (res: Response) => res.status(403).json(apiError('FORBIDDEN_ROLE', 'This is available to the treating clinicians and the patient only.'));

/** The document when this actor may work with it: a patient's own, or a document of the clinician's own center. */
async function ownDocument(actor: Actor, id: string): Promise<any | null> {
  if (!isUuid(id)) return null;
  const res = await query('SELECT id, organization_id, patient_id, source_type, ai_processing_allowed, visible_to_patient FROM documents WHERE id = $1', [id]);
  const d = res.rows[0];
  if (!d) return null;
  if (actor.kind === 'patient') return d.patient_id === actor.patientId ? d : null;
  return d.organization_id === actor.orgId && (await isPatientLinkedToOrg(d.patient_id, actor.orgId)) ? d : null;
}

const factOut = (f: any) => ({
  id: f.id,
  documentId: f.document_id,
  documentTitle: f.document_title ?? undefined,
  kind: f.kind,
  label: f.label,
  value: f.value,
  unit: f.unit,
  date: f.fact_date_text ?? null,
  page: f.source_page,
  passage: f.source_passage,
  confidence: f.confidence === null ? null : Number(f.confidence),
  why: f.rationale,
  reviewStatus: f.review_status,
  reviewedAt: f.reviewed_at,
  original: f.review_status === 'corrected' ? f.original : undefined,
});

const FACT_SELECT = `SELECT f.id, f.document_id, f.kind, f.label, f.value, f.unit, to_char(f.fact_date, 'YYYY-MM-DD') AS fact_date_text,
         f.source_page, f.source_passage, f.confidence, f.rationale, f.review_status, f.reviewed_at, f.original,
         COALESCE(d.title, d.file_name) AS document_title
  FROM document_facts f JOIN documents d ON d.id = f.document_id`;

// GET /api/documents/ai/status
documentReviewRouter.get('/ai/status', (req: Request, res: Response): void => {
  if (!actorOf(req)) return void refuse(res);
  res.json({ success: true, data: aiStatus() });
});

// GET /api/documents/facts?patientId=&status=  (clinician: suggestions across this center's documents for one patient)
documentReviewRouter.get('/facts', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor || actor.kind !== 'doctor') return void refuse(res);
  const patientId = req.query.patientId;
  if (!isUuid(patientId) || !(await isPatientLinkedToOrg(patientId, actor.orgId))) {
    res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
    return;
  }
  const status = req.query.status;
  const params: unknown[] = [actor.orgId, patientId];
  let where = 'f.organization_id = $1 AND f.patient_id = $2';
  if (typeof status === 'string' && status) {
    if (!['unreviewed', 'accepted', 'corrected', 'rejected'].includes(status)) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'status must be unreviewed, accepted, corrected or rejected.'));
      return;
    }
    params.push(status);
    where += ` AND f.review_status = $${params.length}`;
  }
  try {
    const rows = await query(`${FACT_SELECT} WHERE ${where} ORDER BY f.created_at DESC, f.source_page NULLS LAST LIMIT 300`, params);
    logAuditEvent({
      organizationId: actor.orgId, actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'doctor',
      action: 'AI_FACTS_READ', resourceType: 'document_fact', ipAddress: req.ip, details: { patientId, count: rows.rowCount ?? 0 },
    });
    res.json({ success: true, data: rows.rows.map(factOut) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/documents/:id/processing
documentReviewRouter.get('/:id/processing', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor) return void refuse(res);
  try {
    const doc = await ownDocument(actor, req.params.id);
    if (!doc) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const job = await query(
      `SELECT status, provider, model, suggested_type, suggested_type_confidence, page_count, error_code, attempts, started_at, finished_at,
              (SELECT COUNT(*)::int FROM document_facts WHERE document_id = $1 AND review_status = 'unreviewed') AS unreviewed,
              (SELECT COUNT(*)::int FROM document_facts WHERE document_id = $1) AS total
       FROM document_processing WHERE document_id = $1`,
      [doc.id]
    );
    const j = job.rows[0];
    res.json({
      success: true,
      data: {
        available: aiStatus().configured,
        allowed: doc.ai_processing_allowed || doc.source_type !== 'patient_uploaded',
        job: j
          ? {
              status: j.status,
              attempts: j.attempts,
              errorCode: j.error_code,
              finishedAt: j.finished_at,
              total: j.total,
              // The type suggestion and the clinician review backlog are clinician-facing; the patient sees state only.
              ...(actor.kind === 'doctor'
                ? { provider: j.provider, model: j.model, suggestedType: j.suggested_type, suggestedTypeConfidence: j.suggested_type_confidence === null ? null : Number(j.suggested_type_confidence), pageCount: j.page_count, unreviewed: j.unreviewed }
                : {}),
            }
          : null,
      },
    });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/documents/:id/process  (clinician of the document's center: start, or retry a failed job)
documentReviewRouter.post('/:id/process', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor || actor.kind !== 'doctor') return void refuse(res);
  try {
    const doc = await ownDocument(actor, req.params.id);
    if (!doc) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    if (doc.source_type === 'patient_uploaded' && !doc.ai_processing_allowed) {
      return void res.status(409).json(apiError('AI_NOT_ALLOWED', 'The patient has not allowed this file to be sent for AI processing.'));
    }
    const result = await startProcessing(doc.id, { id: req.user!.id, email: req.user!.email, role: 'doctor' });
    if (!result.started) return void sendNotStarted(res, result.reason);
    res.status(202).json({ success: true, data: { status: 'processing' } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

function sendNotStarted(res: Response, reason: string) {
  const map: Record<string, [number, string, string]> = {
    NOT_CONFIGURED: [503, 'AI_NOT_CONFIGURED', 'AI processing is not configured on this server.'],
    ALREADY_RUNNING_OR_DONE: [409, 'AI_ALREADY_PROCESSED', 'This document is already being processed or has been processed.'],
    FILE_UNAVAILABLE: [404, 'FILE_UNAVAILABLE', 'The stored file for this document is not available.'],
    NOT_FOUND: [404, 'DOCUMENT_NOT_FOUND', 'Document not found.'],
  };
  const [status, code, message] = map[reason] ?? [500, 'SERVER_ERROR', 'Could not start processing.'];
  res.status(status).json(apiError(code, message));
}

// POST /api/documents/:id/ai-consent  { allowed }  (patient: permit or withdraw sending THIS file for AI processing)
documentReviewRouter.post('/:id/ai-consent', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor || actor.kind !== 'patient') return void refuse(res);
  if (typeof req.body?.allowed !== 'boolean') {
    return void res.status(400).json(apiError('VALIDATION_ERROR', 'allowed must be true or false.'));
  }
  try {
    const doc = await ownDocument(actor, req.params.id);
    if (!doc || doc.source_type !== 'patient_uploaded') return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const allowed: boolean = req.body.allowed;
    const done = await query(`SELECT 1 FROM document_processing WHERE document_id = $1 AND status IN ('processing', 'completed')`, [doc.id]);
    if (!allowed && (done.rowCount ?? 0) > 0) {
      return void res.status(409).json(apiError('AI_ALREADY_PROCESSED', 'This file has already been sent for processing. The permission cannot be withdrawn for it.'));
    }
    await query('UPDATE documents SET ai_processing_allowed = $2, updated_at = NOW() WHERE id = $1', [doc.id, allowed]);
    logAuditEvent({
      organizationId: doc.organization_id, actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'patient',
      action: allowed ? 'AI_CONSENT_GRANT' : 'AI_CONSENT_WITHDRAW', resourceType: 'document', resourceId: doc.id, ipAddress: req.ip,
      details: { documentId: doc.id, patientId: doc.patient_id },
    });
    let started = false;
    if (allowed && aiStatus().configured) {
      started = (await startProcessing(doc.id, { id: req.user!.id, email: req.user!.email, role: 'patient' })).started;
    }
    res.json({ success: true, data: { allowed, processingStarted: started } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/documents/:id/facts
documentReviewRouter.get('/:id/facts', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor) return void refuse(res);
  try {
    const doc = await ownDocument(actor, req.params.id);
    if (!doc) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    // A patient sees only what a clinician has accepted or corrected; suggestions stay clinician-only.
    const filter = actor.kind === 'patient' ? `AND f.review_status IN ('accepted', 'corrected')` : '';
    const rows = await query(`${FACT_SELECT} WHERE f.document_id = $1 ${filter} ORDER BY f.source_page NULLS LAST, f.created_at`, [doc.id]);
    res.json({ success: true, data: rows.rows.map(factOut) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/documents/:id/facts/:factId/review  { action: 'accept'|'reject'|'correct', label?, value?, unit?, fact_date? }
documentReviewRouter.post('/:id/facts/:factId/review', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor || actor.kind !== 'doctor') return void refuse(res);
  const action = req.body?.action;
  if (!['accept', 'reject', 'correct'].includes(action) || !isUuid(req.params.factId)) {
    return void res.status(400).json(apiError('VALIDATION_ERROR', 'action must be accept, reject or correct.'));
  }
  let label: string | null = null;
  let value: string | null = null;
  let unit: string | null = null;
  let date: string | null = null;
  if (action === 'correct') {
    label = trimmed(req.body.label, 255);
    value = req.body.value === undefined || req.body.value === '' ? null : trimmed(req.body.value, 255);
    unit = req.body.unit === undefined || req.body.unit === '' ? null : trimmed(req.body.unit, 50);
    date = req.body.fact_date === undefined || req.body.fact_date === '' ? null : req.body.fact_date;
    if (!label || (req.body.value && !value) || (req.body.unit && !unit) || (date !== null && !isIsoDate(date))) {
      return void res.status(400).json(apiError('VALIDATION_ERROR', 'A correction needs a label, and any value, unit or date must be valid.'));
    }
  }
  try {
    const doc = await ownDocument(actor, req.params.id);
    if (!doc) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const status = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'corrected';
    const update =
      action === 'correct'
        ? await query(
            `UPDATE document_facts SET review_status = 'corrected', label = $3, value = $4, unit = $5, fact_date = $6, reviewed_by = $7, reviewed_at = NOW()
             WHERE id = $1 AND document_id = $2 RETURNING id`,
            [req.params.factId, doc.id, label, value, unit, date, req.user!.id]
          )
        : await query(
            `UPDATE document_facts SET review_status = $3, reviewed_by = $4, reviewed_at = NOW() WHERE id = $1 AND document_id = $2 RETURNING id`,
            [req.params.factId, doc.id, status, req.user!.id]
          );
    if (update.rowCount === 0) return void res.status(404).json(apiError('FACT_NOT_FOUND', 'Suggestion not found.'));
    logAuditEvent({
      organizationId: actor.orgId, actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'doctor',
      action: `AI_FACT_${action.toUpperCase()}`, resourceType: 'document_fact', resourceId: req.params.factId, ipAddress: req.ip,
      details: { documentId: doc.id, patientId: doc.patient_id, status },
    });
    const row = await query(`${FACT_SELECT} WHERE f.id = $1`, [req.params.factId]);
    res.json({ success: true, data: factOut(row.rows[0]) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
