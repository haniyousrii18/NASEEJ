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
- `GET /api/portal/appointments` — Patient: List own appointments.
- `POST /api/portal/appointments` — Patient: Request appointment.
- `GET /api/portal/messages` — Patient / Care Team: List inquiries.
- `POST /api/portal/messages` — Patient: Submit question or refill request.
- `POST /api/portal/symptoms` — Patient: Log symptom report.

### 2.9 Security & Audit Logs
- `GET /api/audit-logs` — Platform Admin (system-wide) / Center Manager (center-scoped). Read-only.
