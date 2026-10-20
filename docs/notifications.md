# In-app notifications

Notifications tell a signed-in patient that something needs their attention and take them to the right place. They are **not** an emergency channel, a clinical record, or the state of a workflow: the underlying record is always the truth.

## Design rules
- **Created on the server, after the operation succeeded**, in `backend/src/services/notificationService.ts`. The client can never create one, and a notification problem never fails the operation (it is logged).
- **Recipients are resolved on the server.** Nothing about recipients comes from the request.
- **Minimal content.** A row stores an event type and allow-listed values. No names, diagnoses, lab values, message text or document text. The words shown come from the client translations (`app/i18n/notifications.ts`), in Arabic or English.
- **Deduplicated** by `(recipient, role, dedupe_key)`; the actor is not notified about their own action.
- **Read is not done.** `read_at` means seen; `handled_at` is set only by the server.
- **Authorization is re-checked on every read.** Someone else's notification and a missing one both return 404.
- **Destinations are typed.** The server stores a destination kind and an id, never a URL. The client maps kind to an internal route in `frontend/src/app/notifications/model.ts`; a kind with no mapping has no destination.

## Events that can occur in the patient-only app
| Event | Leads to |
|---|---|
| `document.released` (a clinician-uploaded document released to the patient) | My documents |
| `record.approved` | Symptoms and timeline |
| `account.password_changed` | Settings → security |

The service still contains events from the removed multi-center platform (appointments, messages, delegations, coordination); nothing in the current API triggers them and they can be deleted.

## API
`GET /api/notifications`, `/summary`, `/unread-count`; `POST /:id/read`, `/:id/dismiss`, `/:id/restore`, `/read-all`. The client refreshes periodically; there is no real-time channel, email or push.
