import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { aiStatus, startProcessing } from '../services/documentProcessing.js';
import { fileExists, saveFile, sniffFileType } from '../services/storageService.js';
import { parseEntry, type EntryKind } from '../services/health/input.js';
import { apiError, clampInt, escapeLike, isIsoDate, isUuid, serverError } from '../services/validation.js';

/**
 * The patient's document vault. A vault document has no medical center: no clinician can see it, and it reaches
 * a clinician only through a share the patient creates. The original file stays available through
 * GET /api/documents/:id/download (same ownership rules as before).
 * AI reading is opt-in per document, and what it reads comes back as SUGGESTIONS the patient confirms or dismisses.
 */
export const vaultRouter = Router();
vaultRouter.use(authenticate, requirePatient);

const MAX_BYTES = 4 * 1024 * 1024;
export const DOC_TYPES = ['lab_report', 'imaging_report', 'prescription', 'discharge_summary', 'clinical_note', 'referral', 'vaccination_record', 'administrative', 'other'] as const;
const pid = (req: Request) => req.user!.patientProfileId!;

const audit = (req: Request, action: string, resourceId?: string, details?: Record<string, unknown>) =>
  logAuditEvent({ actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'patient', action, resourceType: 'document', resourceId, ipAddress: req.ip, details });

const SELECT = `SELECT d.id, COALESCE(d.title, d.file_name) AS title, d.file_name, d.mime_type, d.file_size, d.doc_type, d.provider_name, d.source_type, d.review_status,
    d.organization_id, to_char(d.document_date,'YYYY-MM-DD') AS document_date, d.created_at, d.deleted_at, d.ai_processing_allowed,
    o.name_ar AS org_ar, o.name_en AS org_en, dp.status AS ai_status, dp.error_code AS ai_error, dp.suggested_type,
    (SELECT COUNT(*)::int FROM document_facts f WHERE f.document_id = d.id AND f.patient_decision IS NULL AND f.review_status <> 'rejected') AS open_suggestions,
    COALESCE((SELECT json_agg(json_build_object('type', l.link_type, 'id', l.target_id)) FROM document_links l WHERE l.document_id = d.id), '[]') AS links
  FROM documents d LEFT JOIN organizations o ON o.id = d.organization_id LEFT JOIN document_processing dp ON dp.document_id = d.id`;

const out = (r: any) => ({
  id: r.id,
  title: r.title,
  fileName: r.file_name,
  mimeType: r.mime_type,
  fileSize: Number(r.file_size),
  docType: r.doc_type,
  providerName: r.provider_name,
  sourceType: r.source_type,
  clinicianReviewed: r.review_status === 'reviewed',
  center: r.organization_id ? { id: r.organization_id, name_ar: r.org_ar, name_en: r.org_en } : null,
  documentDate: r.document_date,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
  aiAllowed: r.ai_processing_allowed,
  aiStatus: r.ai_status ?? null,
  aiError: r.ai_error ?? null,
  suggestedType: r.suggested_type ?? null,
  openSuggestions: r.open_suggestions,
  links: r.links,
});

async function ownDoc(req: Request, id: string, includeDeleted = false): Promise<any | null> {
  if (!isUuid(id)) return null;
  const r = await query(`${SELECT} WHERE d.id = $1 AND d.patient_id = $2 AND d.visible_to_patient = TRUE ${includeDeleted ? '' : 'AND d.deleted_at IS NULL'}`, [id, pid(req)]);
  return r.rows[0] ?? null;
}

/** Targets of a link must belong to the same patient. Returns null when any id is not theirs. */
async function parseLinks(patientId: string, body: any): Promise<Array<{ type: 'symptom' | 'entry' | 'visit'; id: string }> | null> {
  const links: Array<{ type: 'symptom' | 'entry' | 'visit'; id: string }> = [];
  const groups: Array<['symptom' | 'entry' | 'visit', unknown, string]> = [
    ['symptom', body.symptom_ids, 'symptom_reports'],
    ['entry', body.entry_ids, 'health_entries'],
    ['visit', body.visit_ids, 'visits'],
  ];
  for (const [type, ids, table] of groups) {
    if (ids === undefined) continue;
    if (!Array.isArray(ids) || ids.length > 20 || !ids.every(isUuid)) return null;
    const unique = [...new Set(ids as string[])];
    if (unique.length === 0) continue;
    const live = table === 'visits' ? '' : 'AND deleted_at IS NULL';
    const r = await query(`SELECT id FROM ${table} WHERE patient_id = $1 ${live} AND id = ANY($2::uuid[])`, [patientId, unique]);
    if (r.rowCount !== unique.length) return null;
    unique.forEach((id) => links.push({ type, id }));
  }
  return links;
}

const replaceLinks = async (client: { query: (q: string, p?: unknown[]) => Promise<unknown> }, docId: string, links: Array<{ type: string; id: string }>) => {
  await client.query('DELETE FROM document_links WHERE document_id = $1', [docId]);
  for (const l of links) await client.query('INSERT INTO document_links (document_id, link_type, target_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [docId, l.type, l.id]);
};

// GET /api/vault/documents?q=&type=&from=&to=&provider=&trash=1&limit=&offset=
vaultRouter.get('/documents', async (req: Request, res: Response): Promise<void> => {
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  const params: unknown[] = [pid(req)];
  let where = `d.patient_id = $1 AND d.visible_to_patient = TRUE AND d.deleted_at ${req.query.trash === '1' ? 'IS NOT NULL' : 'IS NULL'}`;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    params.push(`%${escapeLike(q.slice(0, 100))}%`);
    where += ` AND (COALESCE(d.title, d.file_name) ILIKE $${params.length} ESCAPE '\\' OR d.provider_name ILIKE $${params.length} ESCAPE '\\')`;
  }
  if (typeof req.query.type === 'string' && req.query.type) {
    if (!(DOC_TYPES as readonly string[]).includes(req.query.type)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Unknown document type.'));
    params.push(req.query.type);
    where += ` AND d.doc_type = $${params.length}`;
  }
  for (const [key, op] of [['from', '>='], ['to', '<=']] as const) {
    const v = req.query[key];
    if (typeof v === 'string' && v) {
      if (!isIsoDate(v)) return void res.status(400).json(apiError('VALIDATION_ERROR', `${key} must use the YYYY-MM-DD format.`));
      params.push(v);
      where += ` AND COALESCE(d.document_date, d.created_at::date) ${op} $${params.length}`;
    }
  }
  try {
    params.push(limit + 1, offset);
    const rows = await query(`${SELECT} WHERE ${where} ORDER BY COALESCE(d.document_date::timestamptz, d.created_at) DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ success: true, data: rows.rows.slice(0, limit).map(out), meta: { limit, offset, hasMore: rows.rows.length > limit, ai: aiStatus() } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/vault/documents/:id
vaultRouter.get('/documents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = await ownDoc(req, String(req.params.id), true);
    if (!d) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    res.json({ success: true, data: out(d) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/vault/documents  { file_name, content_base64, title?, doc_type?, document_date?, provider_name?, symptom_ids?, entry_ids?, visit_ids? }
vaultRouter.post('/documents', async (req: Request, res: Response): Promise<void> => {
  const b = req.body || {};
  if (typeof b.file_name !== 'string' || !b.file_name.trim() || typeof b.content_base64 !== 'string' || !b.content_base64) {
    return void res.status(400).json(apiError('VALIDATION_ERROR', 'file_name and content_base64 are required.'));
  }
  if (b.content_base64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) return void res.status(413).json(apiError('FILE_TOO_LARGE', 'Files are limited to 4 MB.'));
  const title = b.title === undefined || b.title === null || b.title === '' ? null : typeof b.title === 'string' && b.title.trim().length <= 255 ? b.title.trim() : false;
  const provider = b.provider_name === undefined || b.provider_name === null || b.provider_name === '' ? null : typeof b.provider_name === 'string' && b.provider_name.trim().length <= 200 ? b.provider_name.trim() : false;
  const docType = b.doc_type === undefined || b.doc_type === null || b.doc_type === '' ? null : (DOC_TYPES as readonly string[]).includes(b.doc_type) ? b.doc_type : false;
  const date = b.document_date === undefined || b.document_date === null || b.document_date === '' ? null : isIsoDate(b.document_date) ? b.document_date : false;
  if (title === false || provider === false || docType === false || date === false) {
    return void res.status(400).json(apiError('VALIDATION_ERROR', 'Check the title, type, provider and date.'));
  }
  if (date && date > new Date().toISOString().slice(0, 10)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'The document date cannot be in the future.'));

  const buffer = Buffer.from(b.content_base64, 'base64');
  if (buffer.length === 0) return void res.status(400).json(apiError('VALIDATION_ERROR', 'The file is empty.'));
  if (buffer.length > MAX_BYTES) return void res.status(413).json(apiError('FILE_TOO_LARGE', 'Files are limited to 4 MB.'));
  const type = sniffFileType(buffer);
  if (!type) return void res.status(415).json(apiError('UNSUPPORTED_FILE_TYPE', 'Only PDF, PNG and JPEG files are accepted.'));

  try {
    const links = await parseLinks(pid(req), b);
    if (!links) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Links must point to your own symptoms, entries or visits.'));
    const aiAllowed = b.ai_processing_allowed === true; // an explicit, per-file choice made on the upload form
    const cleanName = b.file_name.trim().split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, '').slice(0, 200) || `document${type.extension}`;
    const storagePath = await saveFile(buffer, type.extension);
    const id = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO documents (organization_id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by, title, document_date, source_type,
                                review_status, visible_to_patient, ai_processing_allowed, doc_type, provider_name)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, 'patient_uploaded', 'unreviewed', TRUE, $9, $10, $11) RETURNING id`,
        [pid(req), cleanName, storagePath, type.mime, buffer.length, req.user!.id, title, date, aiAllowed, docType, provider]
      );
      await replaceLinks(client, ins.rows[0].id, links);
      return ins.rows[0].id as string;
    });
    let started = false;
    if (aiAllowed && aiStatus().configured) started = (await startProcessing(id, { id: req.user!.id, email: req.user!.email, role: 'patient' })).started;
    audit(req, 'VAULT_DOCUMENT_UPLOAD', id, { mime: type.mime, size: buffer.length, ai: aiAllowed });
    res.status(201).json({ success: true, data: { ...out((await ownDoc(req, id))!), aiProcessingStarted: started } });
  } catch (err) {
    console.error('Vault upload error:', (err as Error).message);
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/vault/documents/:id  { title?, doc_type?, document_date?, provider_name?, symptom_ids?, entry_ids?, visit_ids? }
vaultRouter.patch('/documents/:id', async (req: Request, res: Response): Promise<void> => {
  const b = req.body || {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length + 2}`);
  };
  if ('title' in b) {
    if (b.title !== null && b.title !== '' && (typeof b.title !== 'string' || b.title.trim().length > 255)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'The title is too long.'));
    add('title', b.title ? b.title.trim() : null);
  }
  if ('provider_name' in b) {
    if (b.provider_name !== null && b.provider_name !== '' && (typeof b.provider_name !== 'string' || b.provider_name.trim().length > 200)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'The provider name is too long.'));
    add('provider_name', b.provider_name ? b.provider_name.trim() : null);
  }
  if ('doc_type' in b) {
    if (b.doc_type !== null && b.doc_type !== '' && !(DOC_TYPES as readonly string[]).includes(b.doc_type)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Unknown document type.'));
    add('doc_type', b.doc_type || null);
  }
  if ('document_date' in b) {
    if (b.document_date !== null && b.document_date !== '' && !isIsoDate(b.document_date)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'The date must use the YYYY-MM-DD format.'));
    add('document_date', b.document_date || null);
  }
  try {
    const d = await ownDoc(req, String(req.params.id));
    if (!d) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const hasLinks = ['symptom_ids', 'entry_ids', 'visit_ids'].some((k) => k in b);
    const links = hasLinks ? await parseLinks(pid(req), { symptom_ids: b.symptom_ids ?? [], entry_ids: b.entry_ids ?? [], visit_ids: b.visit_ids ?? [] }) : null;
    if (hasLinks && !links) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Links must point to your own symptoms, entries or visits.'));
    if (sets.length === 0 && !hasLinks) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Nothing to change.'));
    await withTransaction(async (client) => {
      if (sets.length) await client.query(`UPDATE documents SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND patient_id = $2`, [d.id, pid(req), ...vals]);
      if (links) await replaceLinks(client, d.id, links);
    });
    audit(req, 'VAULT_DOCUMENT_UPDATE', d.id);
    res.json({ success: true, data: out((await ownDoc(req, d.id))!) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// DELETE (move to trash) / POST restore. The file stays on disk until it is purged, so an undo loses nothing.
async function trash(req: Request, res: Response, deleted: boolean) {
  try {
    const id = String(req.params.id);
    const d = await ownDoc(req, id, true);
    if (!d || (deleted && d.deleted_at) || (!deleted && !d.deleted_at)) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    await query(`UPDATE documents SET deleted_at = ${deleted ? 'NOW()' : 'NULL'}, updated_at = NOW() WHERE id = $1 AND patient_id = $2`, [id, pid(req)]);
    // A deleted document must stop being reachable through any share immediately.
    if (deleted) await query('DELETE FROM share_documents WHERE document_id = $1', [id]);
    audit(req, deleted ? 'VAULT_DOCUMENT_DELETE' : 'VAULT_DOCUMENT_RESTORE', id);
    res.json({ success: true, data: { id, deleted } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
}
vaultRouter.delete('/documents/:id', (req, res) => trash(req, res, true));
vaultRouter.post('/documents/:id/restore', (req, res) => trash(req, res, false));

// POST /api/vault/documents/:id/analyze  { confirm: true }  start (or retry) AI reading of THIS file after the patient confirmed it
vaultRouter.post('/documents/:id/analyze', async (req: Request, res: Response): Promise<void> => {
  if (req.body?.confirm !== true) return void res.status(400).json(apiError('CONFIRMATION_REQUIRED', 'Confirm that this file may be sent to the AI provider.'));
  try {
    const d = await ownDoc(req, String(req.params.id));
    if (!d) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    if (!aiStatus().configured) return void res.status(503).json(apiError('AI_NOT_CONFIGURED', 'AI reading is not connected on this server.'));
    if (!(await fileExists((await query('SELECT storage_path FROM documents WHERE id = $1', [d.id])).rows[0].storage_path))) {
      return void res.status(404).json(apiError('FILE_UNAVAILABLE', 'The stored file for this document is not available.'));
    }
    await query('UPDATE documents SET ai_processing_allowed = TRUE, updated_at = NOW() WHERE id = $1 AND patient_id = $2', [d.id, pid(req)]);
    const result = await startProcessing(d.id, { id: req.user!.id, email: req.user!.email, role: 'patient' });
    audit(req, 'VAULT_DOCUMENT_ANALYZE', d.id, { started: result.started });
    if (!result.started) {
      const reason = (result as { reason: string }).reason;
      return void res
        .status(reason === 'ALREADY_RUNNING_OR_DONE' ? 409 : 500)
        .json(apiError(reason === 'ALREADY_RUNNING_OR_DONE' ? 'AI_ALREADY_PROCESSED' : 'SERVER_ERROR', reason === 'ALREADY_RUNNING_OR_DONE' ? 'This document is already being read or has been read.' : 'Could not start reading this document.'));
    }
    res.status(202).json({ success: true, data: { status: 'processing' } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

const factOut = (f: any) => ({
  id: f.id,
  kind: f.kind,
  label: f.label,
  value: f.value,
  unit: f.unit,
  date: f.fact_date ?? null,
  page: f.source_page,
  passage: f.source_passage,
  confidence: f.confidence === null ? null : Number(f.confidence),
});

// GET /api/vault/documents/:id/suggestions  machine-read candidates the patient has not decided on yet. NOT part of the record.
vaultRouter.get('/documents/:id/suggestions', async (req: Request, res: Response): Promise<void> => {
  try {
    const d = await ownDoc(req, String(req.params.id));
    if (!d) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const rows = await query(
      `SELECT id, kind, label, value, unit, to_char(fact_date,'YYYY-MM-DD') fact_date, source_page, source_passage, confidence
       FROM document_facts WHERE document_id = $1 AND patient_decision IS NULL AND review_status <> 'rejected' ORDER BY source_page NULLS LAST, created_at`,
      [d.id]
    );
    res.json({ success: true, data: { status: d.ai_status ?? null, error: d.ai_error ?? null, suggestedType: d.suggested_type ?? null, facts: rows.rows.map(factOut) } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

const KIND_FOR_FACT: Record<string, EntryKind> = { condition: 'condition', medication: 'medication', allergy: 'allergy', procedure: 'procedure', lab_value: 'measurement' };

// POST /api/vault/documents/:id/suggestions/:factId/confirm  { kind?, title?, value?, unit?, date?, dose?, ... }
// Only here does a machine-read fact become a record entry, and only because the patient pressed confirm.
vaultRouter.post('/documents/:id/suggestions/:factId/confirm', async (req: Request, res: Response): Promise<void> => {
  const factId = String(req.params.factId);
  if (!isUuid(factId)) return void res.status(404).json(apiError('FACT_NOT_FOUND', 'Suggestion not found.'));
  try {
    const d = await ownDoc(req, String(req.params.id));
    if (!d) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const fact = (await query(`SELECT * FROM document_facts WHERE id = $1 AND document_id = $2 AND patient_decision IS NULL AND review_status <> 'rejected'`, [factId, d.id])).rows[0];
    if (!fact) return void res.status(404).json(apiError('FACT_NOT_FOUND', 'Suggestion not found or already decided.'));
    const body = req.body || {};
    const kind: EntryKind = (body.kind as EntryKind) ?? KIND_FOR_FACT[fact.kind] ?? 'measurement';
    const merged = {
      title: body.title ?? fact.label,
      value: body.value ?? fact.value ?? undefined,
      unit: body.unit ?? fact.unit ?? undefined,
      event_date: body.date ?? body.event_date ?? fact.fact_date_text ?? (fact.fact_date ? String(fact.fact_date).slice(0, 10) : undefined) ?? d.document_date ?? new Date().toISOString().slice(0, 10),
      dose: body.dose,
      frequency: body.frequency,
      reaction: body.reaction,
      severity: body.severity,
      status: body.status,
      start_date: body.start_date,
      notes: body.notes,
    };
    // Keep only what is defined so partial strings do not collide with the strict parser.
    const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const parsed = parseEntry({ ...clean, kind }, { partial: false, kind });
    if (!parsed.ok) return void res.status(400).json(apiError('VALIDATION_ERROR', parsed.message));
    const entry = await withTransaction(async (client) => {
      const cols = ['patient_id', 'kind', 'source', 'review_status', 'source_document_id', 'source_fact_id', 'confirmed_at', ...Object.keys(parsed.value)];
      const vals = [pid(req), kind, 'document', 'confirmed', d.id, factId, new Date().toISOString(), ...Object.values(parsed.value)];
      const ins = await client.query(`INSERT INTO health_entries (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
      await client.query(`UPDATE document_facts SET patient_decision = 'confirmed', patient_decided_at = NOW() WHERE id = $1`, [factId]);
      return ins.rows[0].id as string;
    });
    audit(req, 'VAULT_SUGGESTION_CONFIRM', d.id, { factId, entryId: entry, kind });
    res.status(201).json({ success: true, data: { entryId: entry, kind } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/vault/documents/:id/suggestions/:factId/dismiss
vaultRouter.post('/documents/:id/suggestions/:factId/dismiss', async (req: Request, res: Response): Promise<void> => {
  const factId = String(req.params.factId);
  if (!isUuid(factId)) return void res.status(404).json(apiError('FACT_NOT_FOUND', 'Suggestion not found.'));
  try {
    const d = await ownDoc(req, String(req.params.id));
    if (!d) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const upd = await query(`UPDATE document_facts SET patient_decision = 'rejected', patient_decided_at = NOW() WHERE id = $1 AND document_id = $2 AND patient_decision IS NULL RETURNING id`, [factId, d.id]);
    if (upd.rowCount === 0) return void res.status(404).json(apiError('FACT_NOT_FOUND', 'Suggestion not found or already decided.'));
    audit(req, 'VAULT_SUGGESTION_DISMISS', d.id, { factId });
    res.json({ success: true, data: { id: factId } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
