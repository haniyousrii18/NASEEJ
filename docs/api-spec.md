# REST API Specification — Naseej | نَسيج

## 1. Global Conventions

- **Base URL**: `/api`
- **Content-Type**: `application/json; charset=utf-8`
- **Authentication**: Bearer Token in `Authorization: Bearer <jwt>`
- **Tenant Scope Header**: `X-Organization-Id: <uuid>` (Identifies the medical center context for multi-tenant requests; validated against the authenticated user's active membership in `organization_memberships`).
- **Standard Error Format**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_CROSS_TENANT",
    "message": "Resource belongs to another medical center tenant.",
    "details": null
  }
}
```

---

## 2. Endpoints Matrix

### 2.1 Public & Authentication
- `POST /api/auth/register` — Register a patient user account or system user.
- `POST /api/auth/login` — Authenticate with email/password; returns JWT + list of organization memberships.
- `GET /api/auth/me` — Return authenticated user profile, roles, and accessible centers.
- `POST /api/public/demo-requests` — Submit a demo request from the landing page.
- `POST /api/public/contact` — Submit general inquiries.

### 2.2 Organization & Membership Management
- `GET /api/organizations` — Platform Admin: List all centers. Center staff: list user's affiliated centers.
- `POST /api/organizations` — Platform Admin: Create medical center.
- `GET /api/organizations/:id` — Center details (scoped).
- `GET /api/organizations/:id/members` — Center Manager: List staff members and roles.
- `POST /api/organizations/:id/members` — Center Manager: Create/invite staff member.
- `PATCH /api/organizations/:id/members/:memberId` — Center Manager: Update role or status.

### 2.3 Patient Profiles & Relationships
- `GET /api/patients?search=` — List patients affiliated with the active center (scoped by `organization_id`); `search` matches names, national ID and MRN literally (`%` and `_` are not wildcards).
- `POST /api/patients` — Register a patient and assign a center MRN. Validated (national ID, both names, past date of birth, `male`/`female`, phone, optional email). A national ID this center already has is `409 PATIENT_ALREADY_REGISTERED` (details: the existing `patientId` and `mrn`). A national ID that exists at another center is linked here only when the date of birth matches; otherwise `409 IDENTITY_MISMATCH`, which says nothing about the other profile.
- `PATCH /api/patients/:id` — Reception Staff: change contact details only (`phone`, `email`, `emergency_contact_name`, `emergency_contact_phone`). Names, date of birth, gender, national ID and blood type are shared across centers and are refused with `400 FIELD_NOT_EDITABLE`. The patient must be linked to the active center (otherwise `404`). Audited as `PATIENT_CONTACT_UPDATE` (field names only).
- `GET /api/patients/:id` — Get patient profile and allergy summary (must have center link).
- `GET /api/patients/:id/allergies` — List patient allergies.
- `POST /api/patients/:id/allergies` — Document allergy (Clinician).

### 2.4 Clinician Schedules & Appointments
- `GET /api/schedules` — Get clinician schedule slots for active center.
- `POST /api/schedules` — Set clinician working hours (Center Manager / Clinician).
- `GET /api/appointments` — List appointments for center with status filtering (`date`, `clinician_id`, `status`).
- `POST /api/appointments` — Book appointment with server-side conflict detection.
- `GET /api/appointments/summary?from=&to=&clinicianId=` — Staff of the active center: appointments per day and status over a range of at most 62 days (`{ days: [{ date, total, by_status }] }`; `total` excludes cancelled). Counts only, no patient data. A doctor always gets their own schedule.
- `PATCH /api/appointments/:id` — Reception Staff and Center Managers: reschedule a `pending` or `confirmed` appointment. Body: `appointment_date`, `start_time`, `end_time` (required), optional `clinician_id` (another active doctor of the same center) and `reason`. Checked under the same per-clinician-per-day lock as booking (`409 APPOINTMENT_CONFLICT`); the new time must not be in the past (`400 APPOINTMENT_SLOT_PAST`); other statuses are `409 NOT_RESCHEDULABLE`; doctors get `403`. Audited as `APPOINTMENT_RESCHEDULE` with the old and new doctor, date and time.
- `PATCH /api/appointments/:id/check-in` — Reception Staff: Record patient arrival.
- `PATCH /api/appointments/:id/status` — Update appointment status (`pending`, `confirmed`, `checked_in`, `in_consultation`, `completed`, `cancelled`, `no_show`). `no_show` is final, is allowed only from `confirmed`, and only once the appointment time has passed (otherwise `409 NO_SHOW_TOO_EARLY`); reception, center managers and the appointment's own doctor may set it. A no-show is excluded from "upcoming" lists and keeps its time slot taken.

### 2.5 Clinical Visits
- `GET /api/visits` — List visits (Clinician: within center; Patient: only approved visits).
- `POST /api/visits` — Clinician: Create visit draft (SOAP notes, vitals, diagnosis).
- `GET /api/visits/:id` — Get visit details (Strict tenant & draft check: patient blocked if `status != 'approved'`).
- `PUT /api/visits/:id` — Clinician: Update visit draft.
- `POST /api/visits/:id/approve` — Clinician: Sign off visit (`status -> 'approved'`).

### 2.6 Prescriptions
- `GET /api/prescriptions` — List prescriptions.
- `POST /api/prescriptions` — Clinician: Create prescription with medication items linked to visit.
- `POST /api/prescriptions/:id/approve` — Clinician: Sign off prescription after reviewing allergies.
- `GET /api/prescriptions/:id` — Get prescription details (Patient blocked if `draft`).

### 2.7 Laboratory Orders & Results
- `GET /api/lab-orders` — List lab orders.
- `POST /api/lab-orders` — Clinician: Create lab order.
- `POST /api/lab-orders/:id/results` — Record lab result values.
- `POST /api/lab-results/:id/approve` — Clinician: Sign off and approve lab result.
- `GET /api/lab-results` — Get lab results (Patient blocked if unapproved).

### 2.8 Patient Portal
- `GET /api/portal/summary` — Patient: Longitudinal summary of approved visits, prescriptions, and lab tests.
- `GET /api/portal/clinicians?organizationId=<uuid>` — Patient: List active clinicians at a center linked to the patient's profile.
- `GET /api/portal/availability?organizationId=<uuid>&clinicianId=<uuid>&date=YYYY-MM-DD` — Patient: List available slots after validating the patient-center relationship and active clinician schedule.
- `POST /api/portal/appointments` — Patient: Request an appointment for an available slot. Creates a `pending` appointment for reception to confirm; uses the same slot lock and conflict validation as staff booking.
- `GET /api/portal/messages` — Patient / Care Team: List inquiries.
- `POST /api/portal/messages` — Patient: Submit question or refill request.
- `POST /api/portal/symptoms` — Patient: Log symptom report.

Appointment requests are scoped to centers where the patient has an active profile link. A pending request is not a confirmed appointment; reception confirms or cancels it through the center appointment workflow. The patient endpoints do not return or accept clinical information beyond the scheduling fields.

### 2.9 Security & Audit Logs
- `GET /api/audit-logs` — Platform Admin (system-wide) / Center Manager (center-scoped). Read-only.

## 3. Longitudinal Record, Consent, Coordination and Operations (migration 002)

All routes return the standard `{ success, data, meta?, error? }` envelope. Authorization is enforced on the server (authenticate → tenant → role); the UI only hides what the server would refuse.

| Method & path | Roles | Notes |
|---|---|---|
| `GET /api/portal/timeline` | patient | Own record, approved/released items only, all centers. Filters `type`, `organizationId`, `from`, `to`; cursor paging `limit`, `before` (`meta.nextBefore`). |
| `GET /api/patients/:id/timeline` | doctor | Own center in every state (drafts flagged); other centers approved-only under an effective consent, each such read audited (`CROSS_CENTER_RECORD_ACCESS`). |
| `GET/POST /api/portal/consents`, `POST /api/portal/consents/:id/revoke` | patient | Grant by scope/duration between two centers the patient is registered at; revocation is immediate. |
| `GET/POST /api/documents`, `GET /api/documents/:id`, `GET /api/documents/:id/download`, `POST /api/documents/:id/review` | patient, doctor | JSON/base64 upload (PDF/PNG/JPEG ≤ 4 MB, type sniffed from bytes). Patient uploads are `patient_uploaded`/`unreviewed`; a doctor reviews and optionally releases. Downloads are audited, `no-store`. |
| `GET /api/doctor/overview`, `GET /api/doctor/pending` | doctor | Own day; own drafts awaiting approval. |
| `GET /api/center/overview`, `/reports/appointments`, `/specialties` | center_manager | Aggregates only; no patient records. |
| `GET /api/admin/overview`, `/users`, `PATCH /users/:id`, `GET/PATCH /api/admin/demo-requests` | platform_admin | Accounts and health; no clinical access. |
| `GET /api/coordination/dashboard|cases|tasks|referrals|followup-log|coordinators|destinations|patients` and `POST/PATCH` on cases, tasks, referrals | care_coordinator (manager: oversight) | Operational data only, optimistic `version`, referrals need effective consent to send/confirm. |
| `GET /api/audit-logs` | platform_admin, center_manager | Read-only, filterable, paged, clinical keys redacted. |

Security fixes in this release: `GET /api/public/demo-requests` now requires a platform administrator (it was unauthenticated and returned contact details); patient, appointment, lab and audit routes were tightened as described in `architecture.md`.

## 4. Caregivers, Operational Messages and AI Document Review (migration 003)

Same envelope and server-side authorization as above. A caregiver account is an ordinary user with a `caregiver` membership (so it can sign in); every patient-data request is authorized by a *delegation* the patient granted, never by the membership.

| Method & path | Roles | Notes |
|---|---|---|
| `GET/POST /api/portal/caregivers`, `POST /api/portal/caregivers/:id/revoke`, `GET /api/portal/caregivers/:id/history` | patient | Invite by email with three independent flags (`can_view_records`, `can_manage_appointments`, `can_send_messages`) and `expires_in_days` (7-365). Revocation is immediate. History lists audited caregiver actions. |
| `GET /api/caregiver/delegations`, `POST /api/caregiver/delegations/:id/accept`, `/decline`, `/leave` | any signed-in user | Invitations are matched on the account email; only that account can accept. |
| `GET /api/caregiver/patients/:id/summary`, `/timeline` | caregiver (view records) | `:id` is the **delegation id**. Same approved/released view the patient has: no drafts, no AI suggestions, no file downloads. Each read is audited. |
| `GET /api/caregiver/patients/:id/appointments`, `/centers`, `/clinicians`, `/availability`; `POST .../appointments` | caregiver (manage appointments; the list also with view records) | Creates a `pending` request recorded as created by the caregiver. |
| `GET/POST /api/caregiver/patients/:id/messages` | caregiver (send messages) | Stored with `sent_by_caregiver_id`; the caregiver sees only their own messages and the replies to them. |
| `GET/POST /api/ops-messages`, `GET /api/ops-messages/summary`, `GET /:id`, `POST /:id/replies`, `PATCH /:id/status` | reception, doctor | Operational (non-clinical) messages inside one center; statuses new/read/in_progress/resolved. Managers, patients and administrators are refused. Message text is never written to the audit log. |
| `GET /api/doctor/patient-messages`, `POST /api/doctor/patient-messages/:id/respond` | doctor | The clinician side of patient and caregiver questions (these were stored before, but no staff route could read them). |
| `GET /api/documents/ai/status` | patient, doctor | `configured`, provider, model, data-handling mode. |
| `POST /api/documents` (+ `ai_processing_allowed`), `POST /api/documents/:id/ai-consent` | patient | Per-file, opt-in permission to send the file to the provider; processing starts only if a provider is configured. |
| `POST /api/documents/:id/process`, `GET /api/documents/:id/processing`, `GET /api/documents/:id/facts`, `GET /api/documents/facts?patientId=`, `POST /api/documents/:id/facts/:factId/review` | doctor (own center); patient reads state and accepted facts only | Job states queued/processing/failed/completed; facts stay `unreviewed` until `accept`, `correct` or `reject`. Reviews are audited (`AI_FACT_*`). |
