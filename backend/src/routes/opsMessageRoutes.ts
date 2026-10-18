import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { isActiveDoctorInOrg } from '../services/appointmentService.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { apiError, isUuid, serverError, trimmed } from '../services/validation.js';

/**
 * Operational messages between reception and clinicians of ONE center. They coordinate bookings, arrivals and
 * paperwork. They are not a clinical or urgent-care channel, and the body is plain text about logistics.
 * Reception sees the administrative patient name and appointment time only, never clinical content, so sending
 * or receiving a message never widens what a role can read elsewhere.
 * Managers and platform administrators have no route here.
 */
export const opsMessageRouter = Router();
opsMessageRouter.use(authenticate, requireTenant, requireRole(['reception', 'doctor']));

const CATEGORIES = ['scheduling', 'arrival', 'paperwork', 'logistics', 'other'];
const STATUSES = ['new', 'read', 'in_progress', 'resolved'];

type Role = 'reception' | 'doctor';
const roleOf = (req: Request): Role => (req.currentMembership!.role === 'doctor' ? 'doctor' : 'reception');

/** SQL condition: the messages this account takes part in (alias m). Parameters: $1 org, $2 user. */
const participantSql = (role: Role) =>
  role === 'doctor'
    ? `m.organization_id = $1 AND ((m.to_role = 'doctor' AND (m.to_user_id IS NULL OR m.to_user_id = $2)) OR m.from_user_id = $2)`
    : // $2 is referenced too: PostgreSQL rejects a bound parameter that the statement never uses.
      `m.organization_id = $1 AND $2::uuid IS NOT NULL AND (m.from_role = 'reception' OR m.to_role = 'reception')`;

/** True when this account is on the receiving side of the message. */
const isRecipient = (role: Role, m: any, userId: string) =>
  role === 'doctor' ? m.to_role === 'doctor' && (!m.to_user_id || m.to_user_id === userId) : m.to_role === 'reception';

const SELECT = `
  SELECT m.id, m.appointment_id, m.patient_id, m.category, m.subject, m.body, m.from_role, m.to_role, m.to_user_id, m.from_user_id,
         m.status, m.read_at, m.resolved_at, m.created_at, m.updated_at,
         fu.full_name_ar AS from_name_ar, fu.full_name_en AS from_name_en,
         tu.full_name_ar AS to_name_ar, tu.full_name_en AS to_name_en,
         p.full_name_ar AS patient_name_ar, p.full_name_en AS patient_name_en,
         to_char(a.appointment_date, 'YYYY-MM-DD') AS appointment_date, to_char(a.start_time, 'HH24:MI') AS appointment_time,
         (SELECT COUNT(*)::int FROM ops_message_replies r WHERE r.message_id = m.id) AS reply_count
  FROM ops_messages m
  JOIN users fu ON fu.id = m.from_user_id
  LEFT JOIN users tu ON tu.id = m.to_user_id
  LEFT JOIN patient_profiles p ON p.id = m.patient_id
  LEFT JOIN appointments a ON a.id = m.appointment_id`;

// GET /api/ops-messages?status=&box=inbox|sent|all&appointmentId=
opsMessageRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const role = roleOf(req);
  const me = req.user!.id;
  const params: unknown[] = [req.tenantId, me];
  let where = participantSql(role);

  const status = req.query.status;
  if (typeof status === 'string' && status) {
    if (!STATUSES.includes(status)) {
      res.status(400).json(apiError('VALIDATION_ERROR', `status must be one of: ${STATUSES.join(', ')}.`));
      return;
    }
    params.push(status);
    where += ` AND m.status = $${params.length}`;
  }
  const box = req.query.box;
  if (box === 'sent') where += ` AND m.from_role = '${role}'`;
  else if (box === 'inbox') where += ` AND m.to_role = '${role}'`;
  if (req.query.appointmentId !== undefined) {
    if (!isUuid(req.query.appointmentId)) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'appointmentId must be a valid identifier.'));
      return;
    }
    params.push(req.query.appointmentId);
    where += ` AND m.appointment_id = $${params.length}`;
  }

  try {
    const rows = await query(`${SELECT} WHERE ${where} ORDER BY (m.status = 'resolved'), m.created_at DESC LIMIT 200`, params);
    res.json({ success: true, data: rows.rows.map((r) => ({ ...r, direction: r.from_role === role ? 'sent' : 'received' })) });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/ops-messages/summary: how many new messages are waiting for this account
opsMessageRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const role = roleOf(req);
  try {
    const rows = await query(
      `SELECT COUNT(*) FILTER (WHERE m.status = 'new' AND m.to_role = '${role}')::int AS new_count,
              COUNT(*) FILTER (WHERE m.status IN ('new','read','in_progress') AND m.to_role = '${role}')::int AS open_count
       FROM ops_messages m WHERE ${participantSql(role)}`,
      [req.tenantId, req.user!.id]
    );
    res.json({ success: true, data: rows.rows[0] });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

/** A message this account takes part in, or null. Anything else is reported as not found. */
async function visibleMessage(req: Request): Promise<any | null> {
  if (!isUuid(req.params.id)) return null;
  const role = roleOf(req);
  const res = await query(`${SELECT} WHERE m.id = $3 AND ${participantSql(role)}`, [req.tenantId, req.user!.id, req.params.id]);
  return res.rows[0] ?? null;
}

// GET /api/ops-messages/:id  (opening it as the recipient marks it read)
opsMessageRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const role = roleOf(req);
  try {
    let message = await visibleMessage(req);
    if (!message) {
      res.status(404).json(apiError('MESSAGE_NOT_FOUND', 'Message not found.'));
      return;
    }
    if (message.status === 'new' && isRecipient(role, message, req.user!.id)) {
      await query(`UPDATE ops_messages SET status = 'read', read_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'new'`, [message.id]);
      message = { ...message, status: 'read' };
    }
    const replies = await query(
      `SELECT r.id, r.author_role, r.body, r.created_at, u.full_name_ar AS author_name_ar, u.full_name_en AS author_name_en
       FROM ops_message_replies r JOIN users u ON u.id = r.author_id WHERE r.message_id = $1 ORDER BY r.created_at`,
      [message.id]
    );
    res.json({ success: true, data: { ...message, direction: message.from_role === role ? 'sent' : 'received', replies: replies.rows } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/ops-messages  { subject, body, category?, appointment_id?, patient_id?, to_user_id? }
opsMessageRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const role = roleOf(req);
  const orgId = req.tenantId!;
  const { appointment_id, patient_id, to_user_id, category } = req.body || {};
  const subject = trimmed(req.body?.subject, 160);
  const body = trimmed(req.body?.body, 1000);
  if (!subject || !body) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A subject (up to 160 characters) and a message (up to 1000 characters) are required.'));
    return;
  }
  if (category !== undefined && !CATEGORIES.includes(category)) {
    res.status(400).json(apiError('VALIDATION_ERROR', `category must be one of: ${CATEGORIES.join(', ')}.`));
    return;
  }
  for (const [name, value] of [['appointment_id', appointment_id], ['patient_id', patient_id], ['to_user_id', to_user_id]] as const) {
    if (value !== undefined && value !== null && !isUuid(value)) {
      res.status(400).json(apiError('VALIDATION_ERROR', `${name} must be a valid identifier.`));
      return;
    }
  }

  try {
    let patientId: string | null = patient_id ?? null;
    let recipient: string | null = null;
    if (appointment_id) {
      const appt = await query('SELECT patient_id, clinician_id FROM appointments WHERE id = $1 AND organization_id = $2', [appointment_id, orgId]);
      if (appt.rowCount === 0) {
        res.status(404).json(apiError('APPOINTMENT_NOT_FOUND', 'Appointment not found in this medical center.'));
        return;
      }
      patientId = appt.rows[0].patient_id;
      // A message about an appointment goes to that appointment's clinician unless a recipient was chosen.
      if (role === 'reception' && !to_user_id) recipient = appt.rows[0].clinician_id;
    }
    if (patientId && !(await isPatientLinkedToOrg(patientId, orgId))) {
      res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
      return;
    }
    if (role === 'reception' && to_user_id) {
      if (!(await isActiveDoctorInOrg(to_user_id, orgId))) {
        res.status(404).json(apiError('CLINICIAN_NOT_FOUND', 'The selected clinician is not available at this center.'));
        return;
      }
      recipient = to_user_id;
    }
    // Clinicians write to the reception queue; the recipient is never a named person.
    const toRole: Role = role === 'reception' ? 'doctor' : 'reception';

    const insert = await query(
      `INSERT INTO ops_messages (organization_id, appointment_id, patient_id, category, subject, body, from_user_id, from_role, to_role, to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [orgId, appointment_id ?? null, patientId, category ?? 'scheduling', subject, body, req.user!.id, role, toRole, role === 'reception' ? recipient : null]
    );
    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: role,
      action: 'OPS_MESSAGE_SEND',
      resourceType: 'ops_message',
      resourceId: insert.rows[0].id,
      ipAddress: req.ip,
      // Message text is never copied into the audit trail.
      details: { count: 1, ...(patientId ? { patientId } : {}) },
    });
    const created = await query(`${SELECT} WHERE m.id = $1`, [insert.rows[0].id]);
    res.status(201).json({ success: true, data: { ...created.rows[0], direction: 'sent' } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/ops-messages/:id/replies  { body }
opsMessageRouter.post('/:id/replies', async (req: Request, res: Response): Promise<void> => {
  const role = roleOf(req);
  const body = trimmed(req.body?.body, 1000);
  if (!body) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A reply (up to 1000 characters) is required.'));
    return;
  }
  try {
    const message = await visibleMessage(req);
    if (!message) {
      res.status(404).json(apiError('MESSAGE_NOT_FOUND', 'Message not found.'));
      return;
    }
    const insert = await query(
      `INSERT INTO ops_message_replies (message_id, organization_id, author_id, author_role, body) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, author_role, body, created_at`,
      [message.id, req.tenantId, req.user!.id, role, body]
    );
    // A reply from the receiving side means someone is working on it; a reply to a resolved thread reopens it.
    if (isRecipient(role, message, req.user!.id) && message.status !== 'in_progress') {
      await query(`UPDATE ops_messages SET status = 'in_progress', resolved_at = NULL, resolved_by = NULL, updated_at = NOW() WHERE id = $1`, [message.id]);
    } else {
      await query(`UPDATE ops_messages SET updated_at = NOW() WHERE id = $1`, [message.id]);
    }
    logAuditEvent({
      organizationId: req.tenantId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: role,
      action: 'OPS_MESSAGE_REPLY',
      resourceType: 'ops_message',
      resourceId: message.id,
      ipAddress: req.ip,
      details: { count: 1 },
    });
    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/ops-messages/:id/status  { status: 'read' | 'in_progress' | 'resolved' }
opsMessageRouter.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const role = roleOf(req);
  const status = req.body?.status;
  if (!['read', 'in_progress', 'resolved'].includes(status)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'status must be one of: read, in_progress, resolved.'));
    return;
  }
  try {
    const message = await visibleMessage(req);
    if (!message) {
      res.status(404).json(apiError('MESSAGE_NOT_FOUND', 'Message not found.'));
      return;
    }
    // Either side may close the loop; only the receiving side moves a message through read / in progress.
    if (status !== 'resolved' && !isRecipient(role, message, req.user!.id)) {
      res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only the recipient can change this status.'));
      return;
    }
    await query(
      `UPDATE ops_messages
       SET status = $2::text, updated_at = NOW(),
           read_at = CASE WHEN $2::text <> 'new' AND read_at IS NULL THEN NOW() ELSE read_at END,
           resolved_at = CASE WHEN $2::text = 'resolved' THEN NOW() ELSE NULL END,
           resolved_by = CASE WHEN $2::text = 'resolved' THEN $3::uuid ELSE NULL END
       WHERE id = $1`,
      [message.id, status, req.user!.id]
    );
    logAuditEvent({
      organizationId: req.tenantId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: role,
      action: 'OPS_MESSAGE_STATUS',
      resourceType: 'ops_message',
      resourceId: message.id,
      ipAddress: req.ip,
      details: { from: message.status, to: status },
    });
    res.json({ success: true, data: { id: message.id, status } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
