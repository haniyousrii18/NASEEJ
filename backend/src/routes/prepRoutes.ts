import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { buildDraft, parsePrepContent, verifyRefs } from '../services/health/prep.js';
import { apiError, clampInt, isIsoDate, isUuid, serverError } from '../services/validation.js';

/**
 * Visit preparation drafts. The draft is built from the patient's record by code (see services/health/prep.ts), edited by
 * the patient, and must be approved before a share can be made from it. Editing an approved draft reopens it.
 */
export const prepRouter = Router();
prepRouter.use(authenticate, requirePatient);

const pid = (req: Request) => req.user!.patientProfileId!;
const audit = (req: Request, action: string, id?: string, details?: Record<string, unknown>) =>
  logAuditEvent({ actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'patient', action, resourceType: 'visit_prep', resourceId: id, ipAddress: req.ip, details });

const out = (r: any) => ({
  id: r.id,
  visitDate: r.visit_date_text ?? null,
  status: r.status,
  content: r.content,
  approvedAt: r.approved_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const COLS = `id, to_char(visit_date,'YYYY-MM-DD') AS visit_date_text, status, content, approved_at, created_at, updated_at`;

// GET /api/prep
prepRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit = clampInt(req.query.limit, 20, 1, 50);
  try {
    const rows = await query(`SELECT ${COLS} FROM visit_preps WHERE patient_id = $1 ORDER BY updated_at DESC LIMIT $2`, [pid(req), limit]);
    res.json({ success: true, data: rows.rows.map(out) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/prep  { visit_date?, reason?, lang? }  builds a new draft from the record
prepRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const b = req.body || {};
  const lang = b.lang === 'en' ? 'en' : 'ar';
  if (b.visit_date !== undefined && b.visit_date !== null && b.visit_date !== '' && !isIsoDate(b.visit_date)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'visit_date must use the YYYY-MM-DD format.'));
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 500) : '';
  try {
    const content = await buildDraft(pid(req), lang, reason);
    const ins = await query(`INSERT INTO visit_preps (patient_id, visit_date, content) VALUES ($1, $2, $3) RETURNING ${COLS}`, [pid(req), b.visit_date || null, JSON.stringify(content)]);
    audit(req, 'PREP_CREATE', ins.rows[0].id);
    res.status(201).json({ success: true, data: out(ins.rows[0]) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/prep/:id
prepRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
  try {
    const r = await query(`SELECT ${COLS} FROM visit_preps WHERE id = $1 AND patient_id = $2`, [id, pid(req)]);
    if (r.rowCount === 0) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
    res.json({ success: true, data: out(r.rows[0]) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// PUT /api/prep/:id  { visit_date?, content }  save the edited draft (an approved summary goes back to draft)
prepRouter.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
  const b = req.body || {};
  if (b.visit_date !== undefined && b.visit_date !== null && b.visit_date !== '' && !isIsoDate(b.visit_date)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'visit_date must use the YYYY-MM-DD format.'));
  const parsed = parsePrepContent(b.content);
  if (!parsed.ok) return void res.status(400).json(apiError('VALIDATION_ERROR', parsed.message));
  try {
    if (!(await verifyRefs(pid(req), parsed.value))) return void res.status(400).json(apiError('INVALID_SOURCE', 'An item points to a record that is not yours.'));
    const upd = await query(
      `UPDATE visit_preps SET content = $3, visit_date = CASE WHEN $4::boolean THEN $5::date ELSE visit_date END,
              status = 'draft', approved_at = NULL, updated_at = NOW()
       WHERE id = $1 AND patient_id = $2 RETURNING ${COLS}`,
      [id, pid(req), JSON.stringify(parsed.value), 'visit_date' in b, b.visit_date || null]
    );
    if (upd.rowCount === 0) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
    audit(req, 'PREP_UPDATE', id);
    res.json({ success: true, data: out(upd.rows[0]) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/prep/:id/approve  { confirm: true }  the patient states this is the version they stand behind
prepRouter.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
  if (req.body?.confirm !== true) return void res.status(400).json(apiError('CONFIRMATION_REQUIRED', 'Confirm that you have reviewed this summary.'));
  try {
    const cur = await query(`SELECT ${COLS} FROM visit_preps WHERE id = $1 AND patient_id = $2`, [id, pid(req)]);
    if (cur.rowCount === 0) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
    const content = cur.rows[0].content;
    const hasContent = Array.isArray(content?.sections) && content.sections.some((s: any) => s.included && s.items.length > 0);
    if (!hasContent && !content?.reason) return void res.status(400).json(apiError('EMPTY_PREP', 'Add a reason for the visit or at least one item before approving.'));
    // Re-check that every source still belongs to the patient (a record may have been deleted or changed since the last save).
    const parsed = parsePrepContent(content);
    if (!parsed.ok || !(await verifyRefs(pid(req), parsed.value))) return void res.status(409).json(apiError('PREP_OUTDATED', 'Some items no longer exist. Review the summary and save it again.'));
    const upd = await query(`UPDATE visit_preps SET status = 'approved', approved_at = NOW(), updated_at = NOW() WHERE id = $1 AND patient_id = $2 RETURNING ${COLS}`, [id, pid(req)]);
    audit(req, 'PREP_APPROVE', id);
    res.json({ success: true, data: out(upd.rows[0]) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// DELETE /api/prep/:id  (shares already made keep their own frozen copy until they expire or are revoked)
prepRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
  try {
    const del = await query('DELETE FROM visit_preps WHERE id = $1 AND patient_id = $2 RETURNING id', [id, pid(req)]);
    if (del.rowCount === 0) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
    audit(req, 'PREP_DELETE', id);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
