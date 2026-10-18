import { query } from '../config/db.js';

/**
 * In-app notifications.
 *
 * Rules this module enforces:
 * - Notifications are created only here, on the server, after the business operation succeeded. Recipients are
 *   resolved from server-side role, membership and delegation rules; nothing comes from the client.
 * - A notification stores an event type and a few allow-listed, non-sensitive parameters (a date, a time). No names,
 *   no clinical content, no message or document text.
 * - Creating one never throws into the calling operation (a failed notification must not fail a booking), and
 *   a dedupe key makes a retried operation harmless.
 */

export type NotificationRole = 'patient' | 'caregiver' | 'doctor' | 'reception' | 'center_manager' | 'care_coordinator' | 'platform_admin';

export const NOTIFICATION_ROLES: NotificationRole[] = ['patient', 'caregiver', 'doctor', 'reception', 'center_manager', 'care_coordinator', 'platform_admin'];

export type NotificationCategory = 'appointments' | 'messages' | 'records' | 'access' | 'operations' | 'account' | 'administration';
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['appointments', 'messages', 'records', 'access', 'operations', 'account', 'administration'];

/** Where a notification leads. The client maps each kind to a route per role; a kind is never a URL. */
export type DestinationKind =
  | 'appointment'
  | 'patient_messages'
  | 'document'
  | 'records'
  | 'caregiver_access'
  | 'caregiver_patient'
  | 'ops_messages'
  | 'coordination_task'
  | 'demo_request'
  | 'account_security';

/** Every supported event: its category and where it leads. Adding an event means adding it here first. */
export const EVENTS = {
  'appointment.requested': { category: 'appointments', destination: 'appointment' },
  'appointment.confirmed': { category: 'appointments', destination: 'appointment' },
  'appointment.cancelled': { category: 'appointments', destination: 'appointment' },
  'appointment.rescheduled': { category: 'appointments', destination: 'appointment' },
  'appointment.checked_in': { category: 'appointments', destination: 'appointment' },
  'message.received': { category: 'messages', destination: 'patient_messages' },
  'message.replied': { category: 'messages', destination: 'patient_messages' },
  'document.awaiting_review': { category: 'records', destination: 'document' },
  'document.released': { category: 'records', destination: 'document' },
  'record.approved': { category: 'records', destination: 'records' },
  'delegation.invited': { category: 'access', destination: 'caregiver_access' },
  'delegation.accepted': { category: 'access', destination: 'caregiver_access' },
  'delegation.declined': { category: 'access', destination: 'caregiver_access' },
  'delegation.ended': { category: 'access', destination: 'caregiver_access' },
  'delegation.revoked': { category: 'access', destination: 'caregiver_access' },
  'ops.message': { category: 'operations', destination: 'ops_messages' },
  'ops.reply': { category: 'operations', destination: 'ops_messages' },
  'task.assigned': { category: 'operations', destination: 'coordination_task' },
  'demo_request.received': { category: 'administration', destination: 'demo_request' },
  'account.password_changed': { category: 'account', destination: 'account_security' },
} as const satisfies Record<string, { category: NotificationCategory; destination: DestinationKind }>;

export type EventType = keyof typeof EVENTS;

/** The only parameter keys a notification may carry, and only short scalar values. */
const PARAM_KEYS = ['date', 'time', 'oldDate', 'oldTime', 'recordKind'] as const;
const RECORD_KINDS = ['visit', 'prescription', 'lab_result'];

function safeParams(params: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PARAM_KEYS) {
    const v = params?.[key];
    if (typeof v !== 'string' || v.length > 20) continue;
    if (key === 'recordKind' ? RECORD_KINDS.includes(v) : /^[0-9:\-]{4,10}$/.test(v)) out[key] = v;
  }
  return out;
}

export interface Recipient {
  userId: string;
  role: NotificationRole;
  /** For a caregiver: the delegation that permits this notification. Used as the destination and re-checked on every read. */
  delegationId?: string;
}

export interface NotifyInput {
  recipients: Recipient[];
  event: EventType;
  organizationId?: string | null;
  related?: { type: 'appointment' | 'patient_message' | 'document' | 'ops_message' | 'care_task' | 'demo_request' | 'caregiver_delegation'; id: string };
  params?: Record<string, unknown>;
  dedupe: string;
  /** Who caused the event: they are never notified about their own action. */
  actorUserId?: string | null;
}

/** Creates one notification per recipient. Never throws: a notification problem must not fail the business operation. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const def = EVENTS[input.event];
    const params = JSON.stringify(safeParams(input.params));
    const seen = new Set<string>();
    for (const r of input.recipients) {
      if (!r.userId || r.userId === input.actorUserId) continue;
      const key = `${r.userId}:${r.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const destinationKind: DestinationKind = r.role === 'caregiver' && r.delegationId && def.destination !== 'caregiver_access' ? 'caregiver_patient' : def.destination;
      const destinationId = destinationKind === 'caregiver_patient' ? r.delegationId! : destinationKind === 'appointment' ? input.related?.id ?? null : input.related?.id ?? null;
      await query(
        `INSERT INTO notifications (recipient_user_id, recipient_role, organization_id, event_type, category, params,
                                    related_type, related_id, destination_kind, destination_id, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
         ON CONFLICT (recipient_user_id, recipient_role, dedupe_key) DO NOTHING`,
        [r.userId, r.role, input.organizationId ?? null, input.event, def.category, params, input.related?.type ?? null, input.related?.id ?? null, destinationKind, destinationId, input.dedupe]
      );
    }
  } catch (err) {
    console.error('[NOTIFICATION ERROR] Could not record notification:', input.event, err);
  }
}

/* ------------------------------------------------------------------ recipient resolvers (server-side rules) */

/** Active staff of one center with any of the given roles. */
export async function staffRecipients(orgId: string, roles: Array<'doctor' | 'reception' | 'center_manager' | 'care_coordinator'>): Promise<Recipient[]> {
  const rows = await query(
    `SELECT m.user_id, m.role FROM organization_memberships m
       JOIN users u ON u.id = m.user_id AND u.is_active
       JOIN organizations o ON o.id = m.organization_id AND o.status = 'active'
     WHERE m.organization_id = $1 AND m.status = 'active' AND m.role = ANY($2::text[])`,
    [orgId, roles]
  );
  return rows.rows.map((r) => ({ userId: r.user_id, role: r.role as NotificationRole }));
}

export async function oneStaff(orgId: string, userId: string | null | undefined, role: 'doctor' | 'reception'): Promise<Recipient[]> {
  if (!userId) return [];
  return (await staffRecipients(orgId, [role])).filter((r) => r.userId === userId);
}

/**
 * The patient and the caregivers who may be told about this patient. A caregiver is included only while an active,
 * unexpired delegation grants the permission that matches the information.
 */
export async function patientAudience(patientId: string, permission: 'appointments' | 'records' | 'messages'): Promise<Recipient[]> {
  const out: Recipient[] = [];
  const patient = await query('SELECT user_id FROM patient_profiles WHERE id = $1', [patientId]);
  if (patient.rows[0]?.user_id) out.push({ userId: patient.rows[0].user_id, role: 'patient' });
  const column = { appointments: 'can_manage_appointments', records: 'can_view_records', messages: 'can_send_messages' }[permission];
  const cg = await query(
    `SELECT id, caregiver_user_id FROM caregiver_delegations
     WHERE patient_id = $1 AND status = 'active' AND expires_at > NOW() AND caregiver_user_id IS NOT NULL AND ${column} = TRUE`,
    [patientId]
  );
  for (const d of cg.rows) out.push({ userId: d.caregiver_user_id, role: 'caregiver', delegationId: d.id });
  return out;
}

export async function patientUser(patientId: string): Promise<Recipient[]> {
  const r = await query('SELECT user_id FROM patient_profiles WHERE id = $1', [patientId]);
  return r.rows[0]?.user_id ? [{ userId: r.rows[0].user_id, role: 'patient' }] : [];
}

export async function platformAdmins(): Promise<Recipient[]> {
  const r = await query(`SELECT id FROM users WHERE system_role = 'platform_admin' AND is_active`);
  return r.rows.map((u) => ({ userId: u.id, role: 'platform_admin' as const }));
}

/* ------------------------------------------------------------------ event helpers called by the business routes */

interface AppointmentRef {
  id: string;
  organization_id: string;
  patient_id: string;
  clinician_id: string | null;
  appointment_date: unknown;
  start_time: unknown;
}

const ymd = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const hm = (v: unknown) => String(v).slice(0, 5);

export async function onAppointmentRequested(a: AppointmentRef, actorUserId: string): Promise<void> {
  try {
    const recipients = [...(await staffRecipients(a.organization_id, ['reception'])), ...(await oneStaff(a.organization_id, a.clinician_id, 'doctor'))];
    await notify({
      recipients, event: 'appointment.requested', organizationId: a.organization_id, related: { type: 'appointment', id: a.id },
      params: { date: ymd(a.appointment_date), time: hm(a.start_time) }, dedupe: `appointment.requested:${a.id}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] appointment.requested', err);
  }
}

/** Marks the "needs confirmation" notifications of an appointment as handled once it is no longer pending. */
export async function markAppointmentRequestHandled(appointmentId: string): Promise<void> {
  try {
    await query(
      `UPDATE notifications SET handled_at = NOW() WHERE related_type = 'appointment' AND related_id = $1
         AND event_type = 'appointment.requested' AND handled_at IS NULL`,
      [appointmentId]
    );
  } catch (err) {
    console.error('[NOTIFICATION ERROR] mark handled', err);
  }
}

export async function onAppointmentStatus(
  a: AppointmentRef & { status: string; updated_at: unknown },
  from: string,
  actor: { userId: string; role: string }
): Promise<void> {
  try {
    if (from === 'pending') await markAppointmentRequestHandled(a.id);
    const stamp = new Date(a.updated_at as string).getTime();
    const params = { date: ymd(a.appointment_date), time: hm(a.start_time) };
    const base = { organizationId: a.organization_id, related: { type: 'appointment' as const, id: a.id }, params, actorUserId: actor.userId };
    if (a.status === 'confirmed') {
      await notify({ ...base, recipients: await patientAudience(a.patient_id, 'appointments'), event: 'appointment.confirmed', dedupe: `appointment.confirmed:${a.id}:${stamp}` });
    } else if (a.status === 'cancelled') {
      const recipients = [...(await patientAudience(a.patient_id, 'appointments'))];
      if (actor.role === 'doctor') recipients.push(...(await staffRecipients(a.organization_id, ['reception'])));
      else recipients.push(...(await oneStaff(a.organization_id, a.clinician_id, 'doctor')));
      await notify({ ...base, recipients, event: 'appointment.cancelled', dedupe: `appointment.cancelled:${a.id}:${stamp}` });
    } else if (a.status === 'checked_in') {
      await notify({ ...base, recipients: await oneStaff(a.organization_id, a.clinician_id, 'doctor'), event: 'appointment.checked_in', dedupe: `appointment.checked_in:${a.id}:${stamp}` });
    }
  } catch (err) {
    console.error('[NOTIFICATION ERROR] appointment status', err);
  }
}

export async function onAppointmentRescheduled(
  a: AppointmentRef & { updated_at: unknown },
  before: { clinician_id: string | null; appointment_date: unknown; start_time: unknown },
  actorUserId: string
): Promise<void> {
  try {
    const recipients = [...(await patientAudience(a.patient_id, 'appointments')), ...(await oneStaff(a.organization_id, a.clinician_id, 'doctor'))];
    if (before.clinician_id && before.clinician_id !== a.clinician_id) recipients.push(...(await oneStaff(a.organization_id, before.clinician_id, 'doctor')));
    await notify({
      recipients, event: 'appointment.rescheduled', organizationId: a.organization_id, related: { type: 'appointment', id: a.id },
      params: { date: ymd(a.appointment_date), time: hm(a.start_time), oldDate: ymd(before.appointment_date), oldTime: hm(before.start_time) },
      dedupe: `appointment.rescheduled:${a.id}:${new Date(a.updated_at as string).getTime()}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] appointment.rescheduled', err);
  }
}

export async function onPatientMessage(message: { id: string; organization_id: string }, actorUserId: string): Promise<void> {
  try {
    await notify({
      recipients: await staffRecipients(message.organization_id, ['doctor']), event: 'message.received', organizationId: message.organization_id,
      related: { type: 'patient_message', id: message.id }, dedupe: `message.received:${message.id}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] message.received', err);
  }
}

export async function onMessageReplied(messageId: string, orgId: string, actorUserId: string): Promise<void> {
  try {
    const m = await query('SELECT patient_id, sent_by_caregiver_id, responded_at FROM patient_messages WHERE id = $1 AND organization_id = $2', [messageId, orgId]);
    if (!m.rows[0]) return;
    const recipients = await patientUser(m.rows[0].patient_id);
    // A caregiver who sent the question hears back only while their delegation still allows messaging.
    if (m.rows[0].sent_by_caregiver_id) {
      const own = (await patientAudience(m.rows[0].patient_id, 'messages')).filter((r) => r.userId === m.rows[0].sent_by_caregiver_id);
      recipients.push(...own);
    }
    await notify({
      recipients, event: 'message.replied', organizationId: orgId, related: { type: 'patient_message', id: messageId },
      dedupe: `message.replied:${messageId}:${new Date(m.rows[0].responded_at).getTime()}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] message.replied', err);
  }
}

export async function onDocumentUploadedByPatient(doc: { id: string }, orgId: string, actorUserId: string): Promise<void> {
  try {
    await notify({
      recipients: await staffRecipients(orgId, ['doctor']), event: 'document.awaiting_review', organizationId: orgId,
      related: { type: 'document', id: doc.id }, dedupe: `document.awaiting_review:${doc.id}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] document.awaiting_review', err);
  }
}

/** After a clinician reviews a file: the "awaiting review" notices are handled, and the patient hears about it if it was released. */
export async function onDocumentReviewed(docId: string, orgId: string, actorUserId: string): Promise<void> {
  try {
    await query(
      `UPDATE notifications SET handled_at = NOW() WHERE related_type = 'document' AND related_id = $1 AND event_type = 'document.awaiting_review' AND handled_at IS NULL`,
      [docId]
    );
    const d = await query('SELECT patient_id, visible_to_patient FROM documents WHERE id = $1 AND organization_id = $2', [docId, orgId]);
    if (!d.rows[0]?.visible_to_patient) return;
    await notify({
      recipients: await patientAudience(d.rows[0].patient_id, 'records'), event: 'document.released', organizationId: orgId,
      related: { type: 'document', id: docId }, dedupe: `document.released:${docId}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] document review', err);
  }
}

/** A visit, prescription or lab result the clinician approved becomes visible to the patient (and to caregivers allowed to view records). */
export async function onRecordApproved(kind: 'visit' | 'prescription' | 'lab_result', recordId: string, patientId: string, orgId: string, actorUserId: string): Promise<void> {
  try {
    await notify({
      recipients: await patientAudience(patientId, 'records'), event: 'record.approved', organizationId: orgId,
      params: { recordKind: kind }, dedupe: `record.approved:${kind}:${recordId}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] record.approved', err);
  }
}

export async function onDelegationEvent(
  event: 'delegation.invited' | 'delegation.accepted' | 'delegation.declined' | 'delegation.ended' | 'delegation.revoked',
  d: { id: string; patient_id: string; caregiver_user_id?: string | null; caregiver_email?: string | null },
  actorUserId: string
): Promise<void> {
  try {
    let recipients: Recipient[] = [];
    if (event === 'delegation.invited' || event === 'delegation.revoked') {
      let userId = d.caregiver_user_id ?? null;
      if (!userId && d.caregiver_email) {
        const u = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND is_active', [d.caregiver_email]);
        userId = u.rows[0]?.id ?? null;
      }
      if (userId) recipients = [{ userId, role: 'caregiver' }];
    } else {
      recipients = await patientUser(d.patient_id);
    }
    await notify({ recipients, event, related: { type: 'caregiver_delegation', id: d.id }, dedupe: `${event}:${d.id}`, actorUserId });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] delegation', err);
  }
}

export async function onOpsMessage(m: { id: string; organization_id: string; to_role: 'doctor' | 'reception'; to_user_id: string | null }, actorUserId: string): Promise<void> {
  try {
    const all = await staffRecipients(m.organization_id, [m.to_role]);
    const recipients = m.to_user_id ? all.filter((r) => r.userId === m.to_user_id) : all;
    await notify({
      recipients, event: 'ops.message', organizationId: m.organization_id, related: { type: 'ops_message', id: m.id },
      dedupe: `ops.message:${m.id}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] ops.message', err);
  }
}

export async function onOpsReply(replyId: string, messageId: string, orgId: string, authorUserId: string, authorRole: 'doctor' | 'reception'): Promise<void> {
  try {
    const m = await query('SELECT from_user_id, from_role, to_role, to_user_id FROM ops_messages WHERE id = $1 AND organization_id = $2', [messageId, orgId]);
    const row = m.rows[0];
    if (!row) return;
    // The other side of the thread: the sender when the recipient replies, otherwise the addressed staff.
    let recipients: Recipient[];
    if (authorUserId === row.from_user_id || authorRole === row.from_role) {
      const all = await staffRecipients(orgId, [row.to_role]);
      recipients = row.to_user_id ? all.filter((r) => r.userId === row.to_user_id) : all;
    } else {
      recipients = (await staffRecipients(orgId, [row.from_role])).filter((r) => r.userId === row.from_user_id);
    }
    await notify({
      recipients, event: 'ops.reply', organizationId: orgId, related: { type: 'ops_message', id: messageId },
      dedupe: `ops.reply:${replyId}`, actorUserId: authorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] ops.reply', err);
  }
}

export async function onTaskAssigned(task: { id: string; organization_id: string; owner_id: string | null }, actorUserId: string): Promise<void> {
  try {
    if (!task.owner_id) return;
    const coordinators = await staffRecipients(task.organization_id, ['care_coordinator']);
    await notify({
      recipients: coordinators.filter((r) => r.userId === task.owner_id), event: 'task.assigned', organizationId: task.organization_id,
      related: { type: 'care_task', id: task.id }, dedupe: `task.assigned:${task.id}:${task.owner_id}`, actorUserId,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] task.assigned', err);
  }
}

export async function onDemoRequest(requestId: string): Promise<void> {
  try {
    await notify({ recipients: await platformAdmins(), event: 'demo_request.received', related: { type: 'demo_request', id: requestId }, dedupe: `demo_request.received:${requestId}` });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] demo_request.received', err);
  }
}

export async function onPasswordChanged(userId: string, role: NotificationRole): Promise<void> {
  // The actor is the recipient here, deliberately: it is a security record of the change for the account owner.
  await notify({ recipients: [{ userId, role }], event: 'account.password_changed', dedupe: `account.password_changed:${Date.now()}` });
}
