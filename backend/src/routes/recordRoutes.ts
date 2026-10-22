import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { buildRecordItems, searchItems } from '../services/health/context.js';
import { ENTRY_KINDS, parseEntry, parseSymptom, type EntryKind } from '../services/health/input.js';
import { apiError, clampInt, isUuid, serverError } from '../services/validation.js';
import { apiLimiter } from '../services/apiLimit.js';

/**
 * The patient's own record: health entries (conditions, medications, allergies, procedures, measurements, visits) and
 * symptoms. Every query is filtered by the signed-in patient's profile id taken from the session, never from the request,
 * so another patient's row is reported as "not found". Deleting is a soft delete with an undo.
 */
export const recordRouter = Router();
recordRouter.use(apiLimiter, authenticate, requirePatient);

const pid = (req: Request) => req.user!.patientProfileId!;

const audit = (req: Request, action: string, resourceType: string, resourceId?: string, details?: Record<string, unknown>) =>
  logAuditEvent({
    actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'patient', action, resourceType, resourceId, ipAddress: req.ip,
    // Ids and kinds only. Titles, notes and values are health content and never go into the log.
    details,
  });

const entryOut = (r: any) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  status: r.status,
  startDate: r.start_date ?? null,
  endDate: r.end_date ?? null,
  eventDate: r.event_date ?? null,
  dose: r.dose,
  frequency: r.frequency,
  reaction: r.reaction,
  severity: r.severity,
  value: r.value,
  unit: r.unit,
  providerName: r.provider_name,
  notes: r.notes,
  source: r.source,
  reviewStatus: r.review_status,
  sourceDocumentId: r.source_document_id,
  confirmedAt: r.confirmed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const ENTRY_COLS = `id, patient_id, kind, title, status, to_char(start_date,'YYYY-MM-DD') start_date, to_char(end_date,'YYYY-MM-DD') end_date,
  to_char(event_date,'YYYY-MM-DD') event_date, dose, frequency, reaction, severity, value, unit, provider_name, notes, source, review_status,
  source_document_id, confirmed_at, created_at, updated_at, deleted_at`;

// ---------------------------------------------------------------- entries

// GET /api/record/entries?kind=&status=&limit=&offset=&deleted=1
recordRouter.get('/entries', async (req: Request, res: Response): Promise<void> => {
  const kind = req.query.kind;
  if (kind !== undefined && !(ENTRY_KINDS as readonly string[]).includes(String(kind))) {
    return void res.status(400).json(apiError('VALIDATION_ERROR', `kind must be one of: ${ENTRY_KINDS.join(', ')}.`));
  }
  const limit = clampInt(req.query.limit, 100, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  const params: unknown[] = [pid(req)];
  let where = `patient_id = $1 AND deleted_at ${req.query.deleted === '1' ? 'IS NOT NULL' : 'IS NULL'}`;
  if (kind) {
    params.push(kind);
    where += ` AND kind = $${params.length}`;
  }
  if (req.query.status === 'active' || req.query.status === 'past') {
    params.push(req.query.status);
    where += ` AND status = $${params.length}`;
  }
  try {
    params.push(limit + 1, offset);
    const rows = await query(
      `SELECT ${ENTRY_COLS} FROM health_entries WHERE ${where}
       ORDER BY COALESCE(event_date, start_date, created_at::date) DESC, created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: rows.rows.slice(0, limit).map(entryOut), meta: { limit, offset, hasMore: rows.rows.length > limit } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/record/entries  { kind, title, ... , captured_via?: 'assistant' }
recordRouter.post('/entries', async (req: Request, res: Response): Promise<void> => {
  const parsed = parseEntry(req.body, { partial: false });
  if (!parsed.ok) return void res.status(400).json(apiError('VALIDATION_ERROR', parsed.message, { rule: parsed.rule, ...parsed.params }));
  const v = parsed.value;
  const kind = req.body.kind as EntryKind;
  const source = req.body.captured_via === 'assistant' ? 'assistant' : 'patient';
  try {
    const cols = ['patient_id', 'kind', 'source', ...Object.keys(v)];
    const vals = [pid(req), kind, source, ...Object.values(v)];
    const ins = await query(
      `INSERT INTO health_entries (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${ENTRY_COLS}`,
      vals
    );
    audit(req, 'HEALTH_ENTRY_CREATE', 'health_entry', ins.rows[0].id, { kind, source });
    res.status(201).json({ success: true, data: entryOut(ins.rows[0]) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/record/entries/:id
recordRouter.patch('/entries/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('ENTRY_NOT_FOUND', 'Entry not found.'));
  try {
    const cur = await query('SELECT kind FROM health_entries WHERE id = $1 AND patient_id = $2 AND deleted_at IS NULL', [id, pid(req)]);
    if (cur.rowCount === 0) return void res.status(404).json(apiError('ENTRY_NOT_FOUND', 'Entry not found.'));
    const parsed = parseEntry(req.body, { partial: true, kind: cur.rows[0].kind });
    if (!parsed.ok) return void res.status(400).json(apiError('VALIDATION_ERROR', parsed.message, { rule: parsed.rule, ...parsed.params }));
    const keys = Object.keys(parsed.value);
    if (keys.length === 0) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Nothing to change.'));
    const sets = keys.map((k, i) => `${k} = $${i + 3}`);
    const upd = await query(
      `UPDATE health_entries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND patient_id = $2 AND deleted_at IS NULL RETURNING ${ENTRY_COLS}`,
      [id, pid(req), ...Object.values(parsed.value)]
    );
    audit(req, 'HEALTH_ENTRY_UPDATE', 'health_entry', id, { fields: keys });
    res.json({ success: true, data: entryOut(upd.rows[0]) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

async function setDeleted(req: Request, res: Response, table: 'health_entries' | 'symptom_reports', deleted: boolean, action: string, resource: string) {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('NOT_FOUND', 'Not found.'));
  try {
    const upd = await query(
      `UPDATE ${table} SET deleted_at = ${deleted ? 'NOW()' : 'NULL'}, updated_at = NOW()
       WHERE id = $1 AND patient_id = $2 AND deleted_at IS ${deleted ? 'NULL' : 'NOT NULL'} RETURNING id`,
      [id, pid(req)]
    );
    if (upd.rowCount === 0) return void res.status(404).json(apiError('NOT_FOUND', 'Not found.'));
    audit(req, action, resource, id);
    res.json({ success: true, data: { id, deleted } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
}

recordRouter.delete('/entries/:id', (req, res) => setDeleted(req, res, 'health_entries', true, 'HEALTH_ENTRY_DELETE', 'health_entry'));
recordRouter.post('/entries/:id/restore', (req, res) => setDeleted(req, res, 'health_entries', false, 'HEALTH_ENTRY_RESTORE', 'health_entry'));

// ---------------------------------------------------------------- symptoms

const SYMPTOM_COLS = `id, symptom_description, severity, onset_date, duration_text, frequency, better_factors, worse_factors, notes, captured_via, created_at, updated_at, deleted_at`;

const symptomOut = (r: any, documentIds: string[] = []) => ({
  id: r.id,
  description: r.symptom_description,
  severity: r.severity,
  onsetDate: r.onset_date instanceof Date ? r.onset_date.toISOString() : r.onset_date,
  durationText: r.duration_text,
  frequency: r.frequency,
  betterFactors: r.better_factors,
  worseFactors: r.worse_factors,
  notes: r.notes,
  capturedVia: r.captured_via,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  documentIds,
});

/** Validates that every id is a live document of this patient. */
async function ownDocumentIds(patientId: string, ids: unknown): Promise<string[] | null> {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.length > 20 || !ids.every(isUuid)) return null;
  const unique = [...new Set(ids as string[])];
  if (unique.length === 0) return [];
  const r = await query('SELECT id FROM documents WHERE patient_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])', [patientId, unique]);
  return r.rowCount === unique.length ? unique : null;
}

async function linkedDocuments(symptomIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (symptomIds.length === 0) return map;
  const r = await query(
    `SELECT l.target_id, l.document_id FROM document_links l JOIN documents d ON d.id = l.document_id
     WHERE l.link_type = 'symptom' AND l.target_id = ANY($1::uuid[]) AND d.deleted_at IS NULL`,
    [symptomIds]
  );
  for (const row of r.rows) map.set(row.target_id, [...(map.get(row.target_id) ?? []), row.document_id]);
  return map;
}

// GET /api/record/symptoms?q=&from=&to=&limit=&offset=&deleted=1
recordRouter.get('/symptoms', async (req: Request, res: Response): Promise<void> => {
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  const params: unknown[] = [pid(req)];
  let where = `patient_id = $1 AND deleted_at ${req.query.deleted === '1' ? 'IS NOT NULL' : 'IS NULL'}`;
  for (const [key, op] of [['from', '>='], ['to', '<=']] as const) {
    const v = req.query[key];
    if (typeof v === 'string' && v) {
      if (Number.isNaN(Date.parse(v))) return void res.status(400).json(apiError('VALIDATION_ERROR', `${key} must be a date.`));
      params.push(v);
      where += ` AND onset_date ${op} $${params.length}`;
    }
  }
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    params.push(`%${req.query.q.trim().replace(/[\\%_]/g, '\\$&')}%`);
    where += ` AND (symptom_description ILIKE $${params.length} ESCAPE '\\' OR notes ILIKE $${params.length} ESCAPE '\\')`;
  }
  try {
    params.push(limit + 1, offset);
    const rows = await query(`SELECT ${SYMPTOM_COLS} FROM symptom_reports WHERE ${where} ORDER BY onset_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const page = rows.rows.slice(0, limit);
    const links = await linkedDocuments(page.map((r) => r.id));
    res.json({ success: true, data: page.map((r) => symptomOut(r, links.get(r.id))), meta: { limit, offset, hasMore: rows.rows.length > limit } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/record/symptoms
recordRouter.post('/symptoms', async (req: Request, res: Response): Promise<void> => {
  const parsed = parseSymptom(req.body, { partial: false });
  if (!parsed.ok) return void res.status(400).json(apiError('VALIDATION_ERROR', parsed.message, { rule: parsed.rule, ...parsed.params }));
  const via = ['form', 'assistant', 'voice'].includes(req.body.captured_via) ? req.body.captured_via : 'form';
  try {
    const docs = await ownDocumentIds(pid(req), req.body.document_ids);
    if (!docs) return void res.status(400).json(apiError('VALIDATION_ERROR', 'document_ids must be documents from your own vault.'));
    const v = parsed.value;
    const created = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO symptom_reports (patient_id, symptom_description, severity, onset_date, duration_text, frequency, better_factors, worse_factors, notes, captured_via)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${SYMPTOM_COLS}`,
        [pid(req), v.symptom_description, v.severity, v.onset_date, v.duration_text ?? null, v.frequency ?? null, v.better_factors ?? null, v.worse_factors ?? null, v.notes ?? null, via]
      );
      for (const d of docs) await client.query(`INSERT INTO document_links (document_id, link_type, target_id) VALUES ($1, 'symptom', $2) ON CONFLICT DO NOTHING`, [d, ins.rows[0].id]);
      return ins.rows[0];
    });
    audit(req, 'SYMPTOM_CREATE', 'symptom_report', created.id, { severity: v.severity, via });
    res.status(201).json({ success: true, data: symptomOut(created, docs) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/record/symptoms/:id
recordRouter.patch('/symptoms/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('SYMPTOM_NOT_FOUND', 'Symptom not found.'));
  const parsed = parseSymptom(req.body, { partial: true });
  if (!parsed.ok) return void res.status(400).json(apiError('VALIDATION_ERROR', parsed.message, { rule: parsed.rule, ...parsed.params }));
  try {
    const docs = req.body.document_ids === undefined ? null : await ownDocumentIds(pid(req), req.body.document_ids);
    if (req.body.document_ids !== undefined && !docs) return void res.status(400).json(apiError('VALIDATION_ERROR', 'document_ids must be documents from your own vault.'));
    const keys = Object.keys(parsed.value);
    const updated = await withTransaction(async (client) => {
      const exists = await client.query('SELECT 1 FROM symptom_reports WHERE id = $1 AND patient_id = $2 AND deleted_at IS NULL FOR UPDATE', [id, pid(req)]);
      if (exists.rowCount === 0) return null;
      let row: any;
      if (keys.length) {
        const sets = keys.map((k, i) => `${k} = $${i + 3}`);
        row = (await client.query(`UPDATE symptom_reports SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND patient_id = $2 RETURNING ${SYMPTOM_COLS}`, [id, pid(req), ...Object.values(parsed.value)])).rows[0];
      } else {
        row = (await client.query(`SELECT ${SYMPTOM_COLS} FROM symptom_reports WHERE id = $1`, [id])).rows[0];
      }
      if (docs) {
        await client.query(`DELETE FROM document_links WHERE link_type = 'symptom' AND target_id = $1`, [id]);
        for (const d of docs) await client.query(`INSERT INTO document_links (document_id, link_type, target_id) VALUES ($1, 'symptom', $2) ON CONFLICT DO NOTHING`, [d, id]);
      }
      return row;
    });
    if (!updated) return void res.status(404).json(apiError('SYMPTOM_NOT_FOUND', 'Symptom not found.'));
    audit(req, 'SYMPTOM_UPDATE', 'symptom_report', id, { fields: keys });
    const links = await linkedDocuments([id]);
    res.json({ success: true, data: symptomOut(updated, links.get(id)) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

recordRouter.delete('/symptoms/:id', (req, res) => setDeleted(req, res, 'symptom_reports', true, 'SYMPTOM_DELETE', 'symptom_report'));
recordRouter.post('/symptoms/:id/restore', (req, res) => setDeleted(req, res, 'symptom_reports', false, 'SYMPTOM_RESTORE', 'symptom_report'));

// ---------------------------------------------------------------- search and home

// GET /api/record/search?q=&lang=  (plain keyword search; works with no AI at all)
recordRouter.get('/search', async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2 || q.length > 100) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Search for 2 to 100 characters.'));
  try {
    const items = await buildRecordItems(pid(req), req.query.lang === 'en' ? 'en' : 'ar');
    res.json({ success: true, data: searchItems(items, q).slice(0, 40) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/record/home  (the few facts the Today screen needs; counts and ids only)
recordRouter.get('/home', async (req: Request, res: Response): Promise<void> => {
  const p = pid(req);
  try {
    const [counts, lastSymptom, nextAppt, nextVisit, draft, shares, pending, consent] = await Promise.all([
      query(
        `SELECT (SELECT COUNT(*)::int FROM health_entries WHERE patient_id = $1 AND deleted_at IS NULL) AS entries,
                (SELECT COUNT(*)::int FROM symptom_reports WHERE patient_id = $1 AND deleted_at IS NULL) AS symptoms,
                (SELECT COUNT(*)::int FROM documents WHERE patient_id = $1 AND deleted_at IS NULL AND visible_to_patient) AS documents`,
        [p]
      ),
      query(`SELECT id, symptom_description, onset_date FROM symptom_reports WHERE patient_id = $1 AND deleted_at IS NULL ORDER BY onset_date DESC LIMIT 1`, [p]),
      query(
        `SELECT id, to_char(appointment_date,'YYYY-MM-DD') AS date, start_time FROM appointments
         WHERE patient_id = $1 AND status IN ('pending','confirmed') AND (appointment_date + start_time) >= NOW() ORDER BY appointment_date, start_time LIMIT 1`,
        [p]
      ),
      query(`SELECT id, title, to_char(event_date,'YYYY-MM-DD') AS date FROM health_entries WHERE patient_id = $1 AND kind = 'visit' AND deleted_at IS NULL AND event_date >= CURRENT_DATE ORDER BY event_date LIMIT 1`, [p]),
      query(`SELECT id, to_char(visit_date,'YYYY-MM-DD') AS visit_date, status FROM visit_preps WHERE patient_id = $1 ORDER BY updated_at DESC LIMIT 1`, [p]),
      query(`SELECT COUNT(*)::int AS n FROM record_shares WHERE patient_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`, [p]),
      query(
        `SELECT COUNT(DISTINCT f.document_id)::int AS n FROM document_facts f JOIN documents d ON d.id = f.document_id
         WHERE f.patient_id = $1 AND d.deleted_at IS NULL AND f.patient_decision IS NULL AND f.review_status <> 'rejected' AND d.source_type = 'patient_uploaded'`,
        [p]
      ),
      query('SELECT ai_assistant_consent_at FROM patient_profiles WHERE id = $1', [p]),
    ]);
    const appt = nextAppt.rows[0];
    const visit = nextVisit.rows[0];
    const upcoming = [
      appt && { kind: 'appointment' as const, id: appt.id, date: appt.date, time: String(appt.start_time).slice(0, 5) },
      visit && { kind: 'visit' as const, id: visit.id, date: visit.date, title: visit.title },
    ]
      .filter(Boolean)
      .sort((a: any, b: any) => (a.date < b.date ? -1 : 1))[0] ?? null;
    res.json({
      success: true,
      data: {
        counts: counts.rows[0],
        lastSymptom: lastSymptom.rows[0] ? { id: lastSymptom.rows[0].id, description: lastSymptom.rows[0].symptom_description, onsetDate: lastSymptom.rows[0].onset_date } : null,
        upcoming,
        latestPrep: draft.rows[0] ? { id: draft.rows[0].id, visitDate: draft.rows[0].visit_date, status: draft.rows[0].status } : null,
        activeShares: shares.rows[0].n,
        documentsWithSuggestions: pending.rows[0].n,
        assistantConsent: !!consent.rows[0]?.ai_assistant_consent_at,
      },
    });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
