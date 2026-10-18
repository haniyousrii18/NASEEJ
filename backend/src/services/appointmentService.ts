import { query, withTransaction } from '../config/db.js';
import { toMinutes } from './validation.js';
import { onAppointmentRequested } from './notificationService.js';

export interface AppointmentSlot {
  start_time: string;
  end_time: string;
  available: boolean;
}

export interface AppointmentAvailability {
  date: string;
  clinicianId: string;
  working: boolean;
  slots: AppointmentSlot[];
}

export async function isActiveDoctorInOrg(clinicianId: string, orgId: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.user_id = $1 AND m.organization_id = $2 AND m.role = 'doctor' AND m.status = 'active' AND u.is_active = true`,
    [clinicianId, orgId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Availability is calculated from active schedules and server-held bookings, never trusted from the client. */
export async function getAppointmentAvailability(orgId: string, clinicianId: string, date: string): Promise<AppointmentAvailability> {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const [schedules, booked, clock] = await Promise.all([
    query(
      `SELECT start_time, end_time, slot_duration_minutes FROM clinician_schedules
       WHERE organization_id = $1 AND clinician_id = $2 AND day_of_week = $3 AND is_active = true
       ORDER BY start_time`,
      [orgId, clinicianId, dayOfWeek]
    ),
    query(
      `SELECT start_time, end_time FROM appointments
       WHERE organization_id = $1 AND clinician_id = $2 AND appointment_date = $3 AND status <> 'cancelled'`,
      [orgId, clinicianId, date]
    ),
    query("SELECT CURRENT_DATE::text AS today, to_char(LOCALTIME, 'HH24:MI') AS current_time"),
  ]);

  const busy = booked.rows.map((b) => [toMinutes(String(b.start_time)), toMinutes(String(b.end_time))] as const);
  const today = String(clock.rows[0]?.today ?? '');
  const currentTime = String(clock.rows[0]?.current_time ?? '00:00');
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const slots: AppointmentSlot[] = [];

  for (const schedule of schedules.rows) {
    const step = Math.max(5, Number(schedule.slot_duration_minutes) || 30);
    for (let minute = toMinutes(String(schedule.start_time)); minute + step <= toMinutes(String(schedule.end_time)); minute += step) {
      const start = fmt(minute);
      const end = fmt(minute + step);
      const elapsed = date < today || (date === today && start <= currentTime);
      const occupied = busy.some(([from, to]) => from < minute + step && to > minute);
      slots.push({ start_time: start, end_time: end, available: !elapsed && !occupied });
    }
  }

  return { date, clinicianId, working: schedules.rows.length > 0, slots };
}

export type PendingAppointmentOutcome =
  | { created: Record<string, unknown> }
  | { reason: 'past' | 'unavailable' | 'conflict' };

/**
 * Creates a pending appointment request for a patient. Used by the patient portal and by caregivers who were
 * explicitly allowed to manage appointments. The same advisory lock as staff bookings keeps requests from racing them.
 * `createdBy` is the signed-in account that asked (the patient, or the caregiver acting for them).
 */
export async function createPendingAppointment(input: {
  patientId: string;
  createdBy: string;
  organization_id: string;
  clinician_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
}): Promise<PendingAppointmentOutcome> {
  const { patientId, organization_id, clinician_id, appointment_date, start_time, end_time } = input;
  const patientUserId = input.createdBy;
  const outcome = await withTransaction(async (client) => {
    // Use the same lock key as staff bookings so patient requests cannot race a staff booking.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organization_id}:${clinician_id}:${appointment_date}`]);

    const future = await client.query(
      `SELECT ($1::date > CURRENT_DATE OR ($1::date = CURRENT_DATE AND $2::time > LOCALTIME)) AS is_future`,
      [appointment_date, start_time]
    );
    if (!future.rows[0]?.is_future) return { reason: 'past' as const };

    const dayOfWeek = new Date(`${appointment_date}T00:00:00Z`).getUTCDay();
    const schedules = await client.query(
      `SELECT start_time, end_time, slot_duration_minutes FROM clinician_schedules
       WHERE organization_id = $1 AND clinician_id = $2 AND day_of_week = $3 AND is_active = true`,
      [organization_id, clinician_id, dayOfWeek]
    );
    const requestedStart = toMinutes(start_time);
    const requestedEnd = toMinutes(end_time);
    const fitsSchedule = schedules.rows.some((schedule) => {
      const from = toMinutes(String(schedule.start_time));
      const to = toMinutes(String(schedule.end_time));
      const step = Math.max(5, Number(schedule.slot_duration_minutes) || 30);
      return requestedStart >= from && requestedEnd <= to && requestedEnd - requestedStart === step && (requestedStart - from) % step === 0;
    });
    if (!fitsSchedule) return { reason: 'unavailable' as const };

    const conflict = await client.query(
      `SELECT id FROM appointments
       WHERE organization_id = $1 AND clinician_id = $2 AND appointment_date = $3
         AND status <> 'cancelled' AND start_time < $5 AND end_time > $4
       LIMIT 1`,
      [organization_id, clinician_id, appointment_date, start_time, end_time]
    );
    if (conflict.rowCount) return { reason: 'conflict' as const };

    const created = await client.query(
      `INSERT INTO appointments (organization_id, patient_id, clinician_id, appointment_date, start_time, end_time, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING id, organization_id, patient_id, clinician_id, appointment_date, start_time, end_time, status, created_at`,
      [organization_id, patientId, clinician_id, appointment_date, start_time, end_time, patientUserId]
    );
    return { created: created.rows[0] as Record<string, unknown> };
  });
  // Told only after the request is stored; a notification problem never fails the request.
  if ('created' in outcome) {
    await onAppointmentRequested(outcome.created as any, patientUserId);
  }
  return outcome;
}
