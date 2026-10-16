import { query } from '../config/db.js';
import { toMinutes } from './validation.js';

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
