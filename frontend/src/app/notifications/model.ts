import type { AppRole } from '../nav.js';
import { ROLE_BASE } from '../nav.js';

/**
 * Notification model and the ONE place that decides where a notification leads.
 *
 * The server stores a destination *kind* (a key from the list below) and an id, never a URL. This file turns
 * (kind, role) into an internal route. Anything not listed here has no destination, so the item shows a safe state
 * instead of navigating. Authorization is checked again by the server when the destination page loads its data.
 *
 * Event -> recipients -> destination -> actions (kept in step with backend/src/services/notificationService.ts):
 *
 *  appointment.requested     reception, assigned doctor   appointment       reception: confirm_appointment (api), open
 *  appointment.confirmed     patient, caregiver*          appointment        open
 *  appointment.cancelled     patient, caregiver*, doctor or reception   appointment   open
 *  appointment.rescheduled   patient, caregiver*, doctor(s)   appointment    open
 *  appointment.checked_in    assigned doctor              appointment        open
 *  message.received          doctors of the center        patient_messages   open
 *  message.replied           patient, sending caregiver*  patient_messages   open
 *  document.awaiting_review  doctors of the center        document           open
 *  document.released         patient, caregiver*          document           open
 *  record.approved           patient, caregiver*          records            open
 *  delegation.invited        invited caregiver            caregiver_access   open
 *  delegation.accepted/declined/ended   patient           caregiver_access   open
 *  delegation.revoked        caregiver                    caregiver_access   open
 *  ops.message / ops.reply   addressed reception or doctor   ops_messages    open
 *  task.assigned             the care coordinator owner   coordination_task  open
 *  demo_request.received     platform administrators      demo_request       open
 *  account.password_changed  the account owner            account_security   open
 *
 *  * only while an active, unexpired delegation grants the matching permission (re-checked on every read).
 */

export type ActionId = 'open' | 'confirm_appointment';

export interface NotificationDto {
  id: string;
  eventType: string;
  category: string;
  role: AppRole;
  organizationId: string | null;
  params: Record<string, string>;
  destination: { kind: string; id: string | null };
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  read: boolean;
  dismissed: boolean;
  /** current: still needs attention. handled: the underlying task is done. unavailable: the record is gone. */
  state: 'current' | 'handled' | 'unavailable';
  actions: Array<{ id: ActionId; kind: 'navigate' | 'api' }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The internal route (hash route, no leading slash) a notification opens, or null when there is none for this role. */
export function destinationRoute(n: NotificationDto, role: AppRole): string | null {
  const id = n.destination.id && UUID_RE.test(n.destination.id) ? n.destination.id : null;
  const base = ROLE_BASE[role];
  switch (n.destination.kind) {
    case 'appointment':
      if (role === 'reception') {
        const date = n.params.date;
        return id && date && DATE_RE.test(date) ? `reception/schedule?date=${date}&appointment=${id}` : 'reception/schedule';
      }
      if (role === 'doctor') return 'doctor/appointments';
      if (role === 'center_manager') return 'manager/schedule';
      if (role === 'patient') return 'patient/appointments';
      return null;
    case 'caregiver_patient': {
      if (role !== 'caregiver' || !id) return null;
      const tab = n.category === 'appointments' ? 'appointments' : n.category === 'messages' ? 'messages' : 'timeline';
      return `caregiver/patient/${id}/${tab}`;
    }
    case 'patient_messages':
      return role === 'doctor' ? 'doctor/messages' : role === 'patient' ? 'patient/messages' : null;
    case 'document':
      return role === 'doctor' ? 'doctor/home' : role === 'patient' ? 'patient/documents' : null;
    case 'records':
      return role === 'patient' ? 'patient/timeline' : null;
    case 'caregiver_access':
      return role === 'patient' ? 'patient/caregivers' : role === 'caregiver' ? 'caregiver/home' : null;
    case 'ops_messages':
      return role === 'reception' ? 'reception/messages' : role === 'doctor' ? 'doctor/messages' : null;
    case 'coordination_task':
      return role === 'care_coordinator' ? 'coordinator/tasks' : null;
    case 'demo_request':
      return role === 'platform_admin' ? 'admin/requests' : null;
    case 'account_security':
      return `${base}/settings?tab=security`;
    default:
      return null;
  }
}

/** Event key used for wording. A record approval is worded by what was approved. */
export function eventKey(n: NotificationDto): string {
  return n.eventType === 'record.approved' && n.params.recordKind ? `record.approved.${n.params.recordKind}` : n.eventType;
}
