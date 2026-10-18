import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_ROLES, type NotificationRole } from '../services/notificationService.js';
import { apiError, clampInt, isUuid, serverError } from '../services/validation.js';

/**
 * /api/notifications: the signed-in person's own notifications.
 *
 * Every query is anchored on `recipient_user_id = req.user.id`; there is no way to name another user. Visibility is
 * re-evaluated on each read: a notification is shown only while the person still holds the role it was addressed to,
 * still belongs to its center (staff), and, for a caregiver's patient-related notification, while the delegation that
 * permitted it is still active and unexpired.
 *
 * Marking a notification read never changes anything about the underlying task. "Handled" is set by the server only
 * when the underlying record's state shows the task is done.
 */
export const notificationRouter = Router();
notificationRouter.use(authenticate);

type Action = { id: 'open' | 'confirm_appointment'; kind: 'navigate' | 'api' };

const rolesOf = (req: Request): NotificationRole[] => {
  const u = req.user!;
  const roles = new Set<NotificationRole>();
  if (u.system_role === 'platform_admin') roles.add('platform_admin');
  if (u.patientProfileId) roles.add('patient');
  for (const m of u.memberships) if ((NOTIFICATION_ROLES as string[]).includes(m.role)) roles.add(m.role as NotificationRole);
  return [...roles];
};

/** SQL shared by every read. Parameters: $1 user id, $2 allowed roles, $3 member org ids. */
const VISIBLE = `
  n.recipient_user_id = $1
  AND n.recipient_role = ANY($2::text[])
  AND (n.organization_id IS NULL OR n.recipient_role IN ('patient', 'caregiver', 'platform_admin') OR n.organization_id = ANY($3::uuid[]))
  AND (n.expires_at IS NULL OR n.expires_at > NOW())
  AND (n.destination_kind <> 'caregiver_patient' OR EXISTS (
        SELECT 1 FROM caregiver_delegations d
        WHERE d.id = n.destination_id AND d.caregiver_user_id = $1 AND d.status = 'active' AND d.expires_at > NOW()))`;

const baseParams = (req: Request) => [req.user!.id, rolesOf(req), req.user!.memberships.map((m) => m.organization_id)];

function filters(req: Request): { sql: string; params: unknown[] } | { error: string } {
  const params = baseParams(req);
  let sql = VISIBLE;
  const role = req.query.role;
  if (role !== undefined) {
    if (typeof role !== 'string' || !(NOTIFICATION_ROLES as string[]).includes(role)) return { error: 'role is not valid.' };
    params.push(role);
    sql += ` AND n.recipient_role = $${params.length}`;
  }
  const category = req.query.category;
  if (category !== undefined) {
    if (typeof category !== 'string' || !(NOTIFICATION_CATEGORIES as string[]).includes(category)) return { error: 'category is not valid.' };
    params.push(category);
    sql += ` AND n.category = $${params.length}`;
  }
  return { sql, params };
}

/** What the person can do with a notification right now, decided on the server from the current state of the record. */
function describe(row: any, appointments: Map<string, string>, messages: Map<string, string>, documents: Map<string, string>) {
  let state: 'current' | 'handled' | 'unavailable' = row.handled_at ? 'handled' : 'current';
  const actions: Action[] = [];
  const open: Action = { id: 'open', kind: 'navigate' };

  if (row.related_type === 'appointment') {
    const status = appointments.get(row.related_id);
    if (!status) state = 'unavailable';
    else {
      if (row.event_type === 'appointment.requested' && status !== 'pending') state = 'handled';
      if (row.event_type === 'appointment.requested' && status === 'pending' && row.recipient_role === 'reception') actions.push({ id: 'confirm_appointment', kind: 'api' });
      actions.push(open);
    }
  } else if (row.related_type === 'patient_message') {
    const status = messages.get(row.related_id);
    if (!status) state = 'unavailable';
    else {
      if (row.event_type === 'message.received' && status === 'resolved') state = 'handled';
      actions.push(open);
    }
  } else if (row.related_type === 'document') {
    const status = documents.get(row.related_id);
    if (!status) state = 'unavailable';
    else {
      if (row.event_type === 'document.awaiting_review' && status !== 'unreviewed') state = 'handled';
      actions.push(open);
    }
  } else {
    actions.push(open);
  }
  return { state, actions };
}

async function lookup(rows: any[]) {
  const ids = (type: string) => rows.filter((r) => r.related_type === type).map((r) => r.related_id);
  const map = async (sql: string, list: string[]) => new Map<string, string>(list.length ? (await query(sql, [list])).rows.map((r) => [r.id, r.s]) : []);
  return {
    appointments: await map('SELECT id, status AS s FROM appointments WHERE id = ANY($1::uuid[])', ids('appointment')),
    messages: await map('SELECT id, status AS s FROM patient_messages WHERE id = ANY($1::uuid[])', ids('patient_message')),
    documents: await map('SELECT id, review_status AS s FROM documents WHERE id = ANY($1::uuid[])', ids('document')),
  };
}

const dto = (row: any, extra: ReturnType<typeof describe>) => ({
  id: row.id,
  eventType: row.event_type,
  category: row.category,
  role: row.recipient_role,
  organizationId: row.organization_id,
  params: row.params,
  destination: { kind: row.destination_kind, id: row.destination_id },
  relatedType: row.related_type,
  relatedId: row.related_id,
  createdAt: row.created_at,
  read: !!row.read_at,
  dismissed: !!row.dismissed_at,
  state: extra.state,
  actions: extra.actions,
});

// GET /api/notifications?role=&category=&status=all|unread&limit=&offset=
notificationRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const f = filters(req);
  if ('error' in f) {
    res.status(400).json(apiError('VALIDATION_ERROR', f.error));
    return;
  }
  const status = req.query.status ?? 'all';
  if (status !== 'all' && status !== 'unread' && status !== 'archived') {
    res.status(400).json(apiError('VALIDATION_ERROR', 'status must be all, unread or archived.'));
    return;
  }
  const limit = clampInt(req.query.limit, 20, 1, 50);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  try {
    const where = `${f.sql} AND ${status === 'archived' ? 'n.dismissed_at IS NOT NULL' : 'n.dismissed_at IS NULL'}${status === 'unread' ? ' AND n.read_at IS NULL' : ''}`;
    const rows = await query(`SELECT n.* FROM notifications n WHERE ${where} ORDER BY n.created_at DESC, n.id LIMIT ${limit} OFFSET ${offset}`, f.params);
    const unread = await query(`SELECT COUNT(*)::int AS c FROM notifications n WHERE ${f.sql} AND n.dismissed_at IS NULL AND n.read_at IS NULL`, f.params);
    const total = await query(`SELECT COUNT(*)::int AS c FROM notifications n WHERE ${where}`, f.params);
    const state = await lookup(rows.rows);
    res.json({
      success: true,
      data: rows.rows.map((r) => dto(r, describe(r, state.appointments, state.messages, state.documents))),
      meta: { unreadCount: unread.rows[0].c, total: total.rows[0].c, limit, offset },
    });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/notifications/summary?role=: counts for the inbox header and its category filters (archived items excluded).
notificationRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const f = filters(req);
  if ('error' in f) {
    res.status(400).json(apiError('VALIDATION_ERROR', f.error));
    return;
  }
  try {
    const rows = await query(
      `SELECT n.category, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE n.read_at IS NULL)::int AS unread
       FROM notifications n WHERE ${f.sql} AND n.dismissed_at IS NULL GROUP BY n.category`,
      f.params
    );
    const archived = await query(`SELECT COUNT(*)::int AS c FROM notifications n WHERE ${f.sql} AND n.dismissed_at IS NOT NULL`, f.params);
    const byCategory: Record<string, { total: number; unread: number }> = {};
    for (const r of rows.rows) byCategory[r.category] = { total: r.total, unread: r.unread };
    res.json({
      success: true,
      data: {
        total: rows.rows.reduce((a, r) => a + r.total, 0),
        unread: rows.rows.reduce((a, r) => a + r.unread, 0),
        archived: archived.rows[0].c,
        byCategory,
      },
    });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/notifications/unread-count?role=
notificationRouter.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  const f = filters(req);
  if ('error' in f) {
    res.status(400).json(apiError('VALIDATION_ERROR', f.error));
    return;
  }
  try {
    const r = await query(`SELECT COUNT(*)::int AS c FROM notifications n WHERE ${f.sql} AND n.dismissed_at IS NULL AND n.read_at IS NULL`, f.params);
    res.json({ success: true, data: { unreadCount: r.rows[0].c } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/notifications/read-all  { role?, category? }
notificationRouter.post('/read-all', async (req: Request, res: Response): Promise<void> => {
  const fake = { ...req, query: { role: req.body?.role, category: req.body?.category } } as unknown as Request;
  const f = filters(fake);
  if ('error' in f) {
    res.status(400).json(apiError('VALIDATION_ERROR', f.error));
    return;
  }
  try {
    const r = await query(
      `UPDATE notifications n SET read_at = NOW() WHERE ${f.sql} AND n.dismissed_at IS NULL AND n.read_at IS NULL`,
      f.params
    );
    res.json({ success: true, data: { updated: r.rowCount ?? 0 } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

async function mutate(req: Request, res: Response, set: string): Promise<void> {
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(404).json(apiError('NOTIFICATION_NOT_FOUND', 'Notification not found.'));
    return;
  }
  try {
    const params = [...baseParams(req), id];
    const r = await query(
      `UPDATE notifications n SET ${set} WHERE ${VISIBLE} AND n.id = $${params.length} RETURNING n.*`,
      params
    );
    // Someone else's notification and a missing one look the same.
    if (r.rowCount === 0) {
      res.status(404).json(apiError('NOTIFICATION_NOT_FOUND', 'Notification not found.'));
      return;
    }
    const state = await lookup(r.rows);
    res.json({ success: true, data: dto(r.rows[0], describe(r.rows[0], state.appointments, state.messages, state.documents)) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
}

// POST /api/notifications/:id/read: "seen" only. It does not complete the task the notification is about.
notificationRouter.post('/:id/read', (req, res) => mutate(req, res, 'read_at = COALESCE(n.read_at, NOW())'));

// POST /api/notifications/:id/dismiss
notificationRouter.post('/:id/dismiss', (req, res) => mutate(req, res, 'dismissed_at = COALESCE(n.dismissed_at, NOW()), read_at = COALESCE(n.read_at, NOW())'));

// POST /api/notifications/:id/restore: brings an archived notification back to the inbox.
notificationRouter.post('/:id/restore', (req, res) => mutate(req, res, 'dismissed_at = NULL'));

// POST /api/notifications/:id/refresh: re-evaluates the underlying state (after a quick action, for example) and
// records "handled" when the record shows the task is done. The client cannot say a task is done; the server checks.
notificationRouter.post('/:id/refresh', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(404).json(apiError('NOTIFICATION_NOT_FOUND', 'Notification not found.'));
    return;
  }
  try {
    const params = [...baseParams(req), id];
    const found = await query(`SELECT n.* FROM notifications n WHERE ${VISIBLE} AND n.id = $${params.length}`, params);
    if (found.rowCount === 0) {
      res.status(404).json(apiError('NOTIFICATION_NOT_FOUND', 'Notification not found.'));
      return;
    }
    const state = await lookup(found.rows);
    const d = describe(found.rows[0], state.appointments, state.messages, state.documents);
    if (d.state === 'handled' && !found.rows[0].handled_at) {
      await query('UPDATE notifications SET handled_at = NOW() WHERE id = $1', [id]);
      found.rows[0].handled_at = new Date();
    }
    res.json({ success: true, data: dto(found.rows[0], d) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
