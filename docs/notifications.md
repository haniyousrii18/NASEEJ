# In-app notifications

Notifications tell a signed-in person that something needs their attention and take them to the right place. They are **not** an emergency channel, a clinical record, or the state of a workflow: the underlying record is always the truth.

## Design rules
- **Created on the server, after the operation succeeded**, in `backend/src/services/notificationService.ts`. The client can never create one. A failed operation creates nothing, and a notification problem never fails the operation (it is logged).
- **Recipients are resolved on the server** from roles, active memberships and active delegations. Nothing about recipients, roles or organizations comes from the request.
- **Minimal content.** A row stores an event type and allow-listed values (`date`, `time`, `oldDate`, `oldTime`, `recordKind`). No names, diagnoses, lab values, message text or document text. The words shown come from the client translations (`app/i18n/notifications.ts`), so they are Arabic or English.
- **Deduplicated.** A unique key `(recipient, role, dedupe_key)` makes a retried operation harmless.
- **Never about your own action.** The actor is excluded (except the password-changed record, which is addressed to its owner).
- **Read is not done.** `read_at` means seen. `handled_at` is set only by the server when the underlying record shows the task is finished (for example an appointment request is no longer pending).
- **Authorization is re-checked on every read.** A notification is visible only while the person still holds the role it was addressed to and (staff) still belongs to its center. A caregiver's patient-related notification disappears when the delegation behind it is no longer active and unexpired. Someone else's notification and a missing one both return 404.
- **Destinations are typed.** The server stores a destination *kind* and an id, never a URL. The client maps kind + role to an internal route in one file, `frontend/src/app/notifications/model.ts`; a kind with no mapping for a role has no destination and shows a safe message. The destination page's own API calls authorize again.

## Events
| Event | Created by | Recipients | Leads to (by role) |
|---|---|---|---|
| `appointment.requested` | patient or caregiver request (`createPendingAppointment`) | reception, the assigned doctor | reception: schedule with that appointment open; doctor: appointments |
| `appointment.confirmed` | confirm, or a staff booking | patient, caregivers who may manage appointments | patient: appointments; caregiver: that patient's appointments |
| `appointment.cancelled` | cancel | patient, caregivers; doctor (if staff cancelled) or reception (if the doctor did) | same |
| `appointment.rescheduled` | reception or manager moves it | patient, caregivers, the new and the previous doctor | same |
| `appointment.checked_in` | front-desk check-in | the assigned doctor | doctor: appointments |
| `message.received` | patient or caregiver question | the center's doctors | doctor: messages |
| `message.replied` | doctor responds | the patient, and the caregiver who asked (if still allowed to message) | patient: messages |
| `document.awaiting_review` | patient uploads a file | the center's doctors | doctor: home (review queue) |
| `document.released` | doctor reviews a file visible to the patient | patient, caregivers who may view records | patient: documents |
| `record.approved` | visit, prescription or lab result approved | patient, caregivers who may view records | patient: timeline; caregiver: that patient's timeline |
| `delegation.invited` / `revoked` | patient invites or revokes | the caregiver (by account email) | caregiver: home |
| `delegation.accepted` / `declined` / `ended` | caregiver responds or leaves | the patient | patient: caregivers |
| `ops.message` / `ops.reply` | operational message or reply | the addressed side (reception or doctor) | messages |
| `task.assigned` | coordination task created | the owner (care coordinator) | coordinator: tasks |
| `demo_request.received` | public demo request | platform administrators | admin: requests |
| `account.password_changed` | password change | the account owner | own settings, security tab |

Not supported (no event source or channel exists): center-manager notifications, consent-request events, AI-extraction review events, email, push, per-category preferences.

## Quick actions
The server decides which actions are valid for the current state and returns them with each item: `open` (navigate) and `confirm_appointment` (reception, only while the appointment is pending). Confirming asks first, then calls the existing `PATCH /api/appointments/:id/status`, scoped to the notification's center. The server then marks the request handled for every recipient and notifies the patient. Quick-action buttons are separate from the notification body and never trigger it.

## Inbox page and sidebar
Every role has **Notifications** in the sidebar, directly above Settings, with the unread count as a badge (a dot in the compact rail). The page (`#/<role>/notifications`) shows a header with "N unread of M", status tabs All / Unread / Archived with counts, category filters with counts (categories with nothing are hidden), items grouped by Today / Yesterday / Earlier, paging, and "Mark all as read". An item can be archived (hidden from the inbox, counts as seen) and restored from the Archived tab. Notifications are removed from view after **90 days** (`expires_at`, `RETENTION_DAYS` in the service).

## API (all authenticated, own notifications only)
`GET /api/notifications?role=&category=&status=all|unread|archived&limit=&offset=` (meta: `unreadCount`, `total`), `GET /api/notifications/summary` (totals, unread, archived and per-category counts), `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/:id/restore`, `POST /api/notifications/read-all` (body: optional `role`, `category`), `POST /api/notifications/:id/dismiss`, `POST /api/notifications/:id/refresh` (re-evaluates the underlying state). Table: `notifications` (migration 004, rollback `rollback/004_down.sql`).

## Client
Besides the sidebar item and inbox page above, the bell is in the workspace top bar with an unread count and a panel of the eight newest items; the full inbox is `#/<role>/notifications` with category and unread filters, paging and "mark all as read". Updates are **periodic, not real time**: one fetch at load, one every 60 seconds while the tab is visible, one when the tab becomes visible and one when the panel opens. Nothing polls when the tab is hidden or after sign-out. Responses are kept in memory only, and `/api/*` is never cached by the service worker.
