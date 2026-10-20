import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { query, withTransaction } from '../config/db.js';
import { ENV } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { parsePrepContent, verifyRefs } from '../services/health/prep.js';
import { deviceClass, generateToken, hashIp, hashToken, isTokenShape, parseLifetimeHours } from '../services/health/shareToken.js';
import { rateLimit, SlidingWindow } from '../services/rateLimit.js';
import { fileExists, resolveStoredPath } from '../services/storageService.js';
import { apiError, clampInt, isUuid, serverError } from '../services/validation.js';
import { apiLimiter } from '../services/apiLimit.js';

/**
 * Temporary, revocable, read-only sharing.
 *  - patientShareRouter  (/api/shares)      the signed-in patient creates, lists and revokes shares.
 *  - publicShareRouter   (/api/share-view)  the clinician opens a share with the token from the QR. No account, no app.
 *
 * A share holds a frozen copy of exactly what the patient approved. The token is shown once and only its SHA-256 is stored.
 */
export const patientShareRouter = Router();
patientShareRouter.use(apiLimiter, authenticate, requirePatient);

const pid = (req: Request) => req.user!.patientProfileId!;
const audit = (req: Request, action: string, id?: string, details?: Record<string, unknown>) =>
  logAuditEvent({ actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'patient', action, resourceType: 'record_share', resourceId: id, ipAddress: req.ip, details });

type State = 'active' | 'expired' | 'revoked';
const stateOf = (r: any): State => (r.revoked_at ? 'revoked' : new Date(r.expires_at).getTime() <= Date.now() ? 'expired' : 'active');

const shareOut = (r: any) => ({
  id: r.id,
  label: r.label,
  state: stateOf(r),
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  viewCount: r.view_count,
  lastViewedAt: r.last_viewed_at,
  documentCount: r.document_count ?? 0,
  prepId: r.prep_id,
});

const LIST_SQL = `SELECT s.id, s.label, s.created_at, s.expires_at, s.revoked_at, s.view_count, s.last_viewed_at, s.prep_id,
  (SELECT COUNT(*)::int FROM share_documents sd WHERE sd.share_id = s.id) AS document_count FROM record_shares s`;

// GET /api/shares
patientShareRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit = clampInt(req.query.limit, 50, 1, 100);
  try {
    const rows = await query(`${LIST_SQL} WHERE s.patient_id = $1 ORDER BY s.created_at DESC LIMIT $2`, [pid(req), limit]);
    res.json({ success: true, data: rows.rows.map(shareOut), meta: { maxHours: ENV.SHARE_MAX_HOURS } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/shares  { prep_id, expires_in_hours, document_ids?, include_identity?, label?, confirm: true }
patientShareRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const b = req.body || {};
  if (b.confirm !== true) return void res.status(400).json(apiError('CONFIRMATION_REQUIRED', 'Confirm that you want to create this share.'));
  if (!isUuid(b.prep_id)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Choose an approved visit summary.'));
  const hours = parseLifetimeHours(b.expires_in_hours);
  if (!hours) return void res.status(400).json(apiError('VALIDATION_ERROR', `Choose a duration from 1 to ${ENV.SHARE_MAX_HOURS} hours.`));
  const label = b.label === undefined || b.label === null || b.label === '' ? null : typeof b.label === 'string' && b.label.trim().length <= 120 ? b.label.trim() : false;
  if (label === false) return void res.status(400).json(apiError('VALIDATION_ERROR', 'The label is limited to 120 characters.'));
  const docIds: unknown = b.document_ids ?? [];
  if (!Array.isArray(docIds) || docIds.length > 20 || !docIds.every(isUuid)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'document_ids is invalid.'));
  try {
    const prepRes = await query(`SELECT id, status, content, to_char(visit_date,'YYYY-MM-DD') AS visit_date FROM visit_preps WHERE id = $1 AND patient_id = $2`, [b.prep_id, pid(req)]);
    const prep = prepRes.rows[0];
    if (!prep) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
    if (prep.status !== 'approved') return void res.status(409).json(apiError('PREP_NOT_APPROVED', 'Approve the visit summary before sharing it.'));
    const parsed = parsePrepContent(prep.content);
    if (!parsed.ok || !(await verifyRefs(pid(req), parsed.value))) return void res.status(409).json(apiError('PREP_OUTDATED', 'Some items no longer exist. Review the summary and approve it again.'));
    const content = parsed.value;

    // Documents: only live documents of this patient, chosen explicitly.
    const unique = [...new Set(docIds as string[])];
    const docs = unique.length
      ? (await query(
          `SELECT id, COALESCE(title, file_name) AS title, doc_type, provider_name, mime_type, file_size, to_char(document_date,'YYYY-MM-DD') AS document_date
           FROM documents WHERE patient_id = $1 AND deleted_at IS NULL AND visible_to_patient AND id = ANY($2::uuid[])`,
          [pid(req), unique]
        )).rows
      : [];
    if (docs.length !== unique.length) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Choose documents from your own vault.'));

    let patient: { name: string; dateOfBirth: string } | null = null;
    if (b.include_identity !== false) {
      const p = (await query(`SELECT full_name_ar, full_name_en, to_char(date_of_birth,'YYYY-MM-DD') AS dob FROM patient_profiles WHERE id = $1`, [pid(req)])).rows[0];
      patient = { name: content.lang === 'ar' ? p.full_name_ar || p.full_name_en : p.full_name_en || p.full_name_ar, dateOfBirth: p.dob };
    }

    const snapshot = {
      v: 1,
      lang: content.lang,
      createdAt: new Date().toISOString(),
      label,
      patient,
      visitDate: prep.visit_date ?? null,
      reason: content.reason,
      overview: content.overview,
      sections: content.sections
        .filter((s) => s.included && s.items.length > 0 && s.key !== 'documents')
        .map((s) => ({ key: s.key, items: s.items.map((i) => ({ text: i.text, date: i.date, source: i.source.label })) })),
      documents: docs.map((d) => ({ id: d.id, title: d.title, docType: d.doc_type, providerName: d.provider_name, mimeType: d.mime_type, fileSize: Number(d.file_size), documentDate: d.document_date })),
    };

    const token = generateToken();
    const expiresAt = new Date(Date.now() + hours * 3600_000);
    const share = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO record_shares (patient_id, prep_id, token_hash, label, snapshot, expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
        [pid(req), prep.id, hashToken(token), label, JSON.stringify(snapshot), expiresAt.toISOString()]
      );
      for (const d of docs) await client.query('INSERT INTO share_documents (share_id, document_id) VALUES ($1,$2)', [ins.rows[0].id, d.id]);
      return ins.rows[0];
    });
    audit(req, 'SHARE_CREATE', share.id, { hours, documents: docs.length, identity: !!patient, prepId: prep.id });
    // The token appears in this response only. It is not retrievable later; the patient creates a new share if the QR is lost.
    res.status(201).json({ success: true, data: { id: share.id, token, expiresAt: expiresAt.toISOString(), createdAt: share.created_at } });
  } catch (err) {
    console.error('Share create error:', (err as Error).message);
    res.status(500).json(serverError(err));
  }
});

// POST /api/shares/:id/revoke
patientShareRouter.post('/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('SHARE_NOT_FOUND', 'Share not found.'));
  try {
    const upd = await query(`UPDATE record_shares SET revoked_at = NOW() WHERE id = $1 AND patient_id = $2 AND revoked_at IS NULL RETURNING id`, [id, pid(req)]);
    if (upd.rowCount === 0) {
      const exists = await query('SELECT 1 FROM record_shares WHERE id = $1 AND patient_id = $2', [id, pid(req)]);
      return void res.status(exists.rowCount ? 200 : 404).json(exists.rowCount ? { success: true, data: { id, revoked: true } } : apiError('SHARE_NOT_FOUND', 'Share not found.'));
    }
    audit(req, 'SHARE_REVOKE', id);
    res.json({ success: true, data: { id, revoked: true } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/shares/:id/events  who opened it and when (no addresses, no content)
patientShareRouter.get('/:id/events', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  if (!isUuid(id)) return void res.status(404).json(apiError('SHARE_NOT_FOUND', 'Share not found.'));
  try {
    const own = await query('SELECT 1 FROM record_shares WHERE id = $1 AND patient_id = $2', [id, pid(req)]);
    if (own.rowCount === 0) return void res.status(404).json(apiError('SHARE_NOT_FOUND', 'Share not found.'));
    const rows = await query(`SELECT id, event, device, ip_hash, occurred_at FROM share_access_events WHERE share_id = $1 ORDER BY occurred_at DESC LIMIT $2`, [id, clampInt(req.query.limit, 50, 1, 200)]);
    // ip_hash is shortened further for display: enough to tell two devices apart.
    res.json({ success: true, data: rows.rows.map((r) => ({ id: r.id, event: r.event, device: r.device, deviceMark: r.ip_hash ? String(r.ip_hash).slice(0, 4) : null, occurredAt: r.occurred_at })) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// ============================================================================================ public (clinician) side

export const publicShareRouter = Router();

/** Every response on this surface is private, uncacheable, not indexed and carries no referrer. */
publicShareRouter.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
publicShareRouter.use(apiLimiter);
publicShareRouter.use(rateLimit({ windowMs: 60_000, max: 60, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute and try again.' }));

// Unknown tokens are counted per address: guessing a 256-bit token is hopeless, but a client that keeps failing is stopped early.
const failures = new SlidingWindow(10 * 60_000, 10);
const addressOf = (req: Request) => req.ip || 'unknown';

function guessBlocked(req: Request, res: Response): boolean {
  if (failures.count(addressOf(req)) >= 10) {
    res.setHeader('Retry-After', '600');
    res.status(429).json(apiError('RATE_LIMITED', 'Too many attempts. Please try again later.'));
    return true;
  }
  return false;
}

type Lookup = { share: any } | { error: 'not_found' | 'expired' | 'revoked'; shareId?: string };

async function lookup(token: unknown): Promise<Lookup> {
  if (!isTokenShape(token)) return { error: 'not_found' };
  const r = await query('SELECT id, patient_id, snapshot, expires_at, revoked_at FROM record_shares WHERE token_hash = $1', [hashToken(token)]);
  const s = r.rows[0];
  if (!s) return { error: 'not_found' };
  if (s.revoked_at) return { error: 'revoked', shareId: s.id };
  if (new Date(s.expires_at).getTime() <= Date.now()) return { error: 'expired', shareId: s.id };
  return { share: s };
}

const record = (req: Request, shareId: string, event: 'view' | 'document' | 'denied_expired' | 'denied_revoked') =>
  query('INSERT INTO share_access_events (share_id, event, device, ip_hash) VALUES ($1,$2,$3,$4)', [shareId, event, deviceClass(req.headers['user-agent']), hashIp(req.ip)]).catch(() => undefined);

function deny(req: Request, res: Response, found: { error: string; shareId?: string }) {
  if (found.error === 'not_found') {
    failures.hit(addressOf(req));
    return void res.status(404).json(apiError('SHARE_NOT_FOUND', 'This link is not valid.'));
  }
  if (found.shareId) void record(req, found.shareId, found.error === 'expired' ? 'denied_expired' : 'denied_revoked');
  res.status(410).json(apiError(found.error === 'expired' ? 'SHARE_EXPIRED' : 'SHARE_REVOKED', found.error === 'expired' ? 'This link has expired.' : 'The patient has stopped sharing this.'));
}

// POST /api/share-view/view  { token }
publicShareRouter.post('/view', async (req: Request, res: Response): Promise<void> => {
  if (guessBlocked(req, res)) return;
  try {
    const found = await lookup(req.body?.token);
    if (!('share' in found)) return deny(req, res, found);
    const s = found.share;
    await query('UPDATE record_shares SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = $1', [s.id]);
    await record(req, s.id, 'view');
    res.json({ success: true, data: { snapshot: s.snapshot, expiresAt: s.expires_at } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/share-view/document  { token, document_id }  streams one document that is part of this share
publicShareRouter.post('/document', async (req: Request, res: Response): Promise<void> => {
  if (guessBlocked(req, res)) return;
  try {
    const found = await lookup(req.body?.token);
    if (!('share' in found)) return deny(req, res, found);
    if (!isUuid(req.body?.document_id)) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    const doc = await query(
      `SELECT d.id, d.storage_path, d.mime_type, d.file_name FROM share_documents sd JOIN documents d ON d.id = sd.document_id
       WHERE sd.share_id = $1 AND sd.document_id = $2 AND d.deleted_at IS NULL`,
      [found.share.id, req.body.document_id]
    );
    const d = doc.rows[0];
    const full = d && resolveStoredPath(d.storage_path);
    if (!d || !full || !(await fileExists(d.storage_path))) return void res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
    await record(req, found.share.id, 'document');
    const safeName = String(d.file_name).replace(/[^\w.\- ]+/g, '_').slice(0, 150) || 'document';
    res.setHeader('Content-Type', d.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    fs.createReadStream(full).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

/**
 * Data minimization: once a share is expired or revoked for a day, the frozen copy of the summary is erased and its
 * document grants are removed. Access events stay (timestamps and device class only) so the patient keeps an access history.
 */
export async function scrubDeadShares(): Promise<number> {
  const dead = await query(
    `UPDATE record_shares SET snapshot = '{}'::jsonb
     WHERE snapshot <> '{}'::jsonb AND (COALESCE(revoked_at, expires_at) < NOW() - INTERVAL '1 day' OR (revoked_at IS NULL AND expires_at < NOW() - INTERVAL '1 day'))
     RETURNING id`
  );
  if (dead.rowCount) await query('DELETE FROM share_documents WHERE share_id = ANY($1::uuid[])', [dead.rows.map((r) => r.id)]);
  return dead.rowCount ?? 0;
}

