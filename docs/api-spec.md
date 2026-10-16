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
- `GET /api/patients` — List patients affiliated with active center (scoped by `organization_id`).
- `POST /api/patients` — Register new patient profile and assign center MRN.
- `GET /api/patients/:id` — Get patient profile and allergy summary (must have center link).
- `GET /api/patients/:id/allergies` — List patient allergies.
- `POST /api/patients/:id/allergies` — Document allergy (Clinician).

### 2.4 Clinician Schedules & Appointments
- `GET /api/schedules` — Get clinician schedule slots for active center.
- `POST /api/schedules` — Set clinician working hours (Center Manager / Clinician).
- `GET /api/appointments` — List appointments for center with status filtering (`date`, `clinician_id`, `status`).
- `POST /api/appointments` — Book appointment with server-side conflict detection.
- `PATCH /api/appointments/:id/check-in` — Reception Staff: Record patient arrival.
- `PATCH /api/appointments/:id/status` — Update appointment status (`confirmed`, `cancelled`, `completed`).

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
