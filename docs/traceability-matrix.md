# Requirement Traceability Matrix — Naseej | نَسيج

This matrix traces PRD functional requirements (FR) and acceptance criteria (AC) to their actual backend and frontend implementations, automated tests, and verification status.

| Req ID | Description | Priority | Backend Implementation | Frontend Surface | Automated Test Suite | Verified Status |
|---|---|---|---|---|---|---|
| **FR-001** | Public Homepage | P0 | `GET /api/public/*` | `src/pages/PublicHome.tsx` | UI verification & Mechanical detector | **Completed & Verified** |
| **FR-002** | Features & Workflows | P0 | Static / Documentation | `src/pages/FeaturesPage.tsx`, `src/pages/WorkflowPage.tsx` | UI verification & Mechanical detector | **Completed & Verified** |
| **FR-003** | Demo Request Workflow | P0 | `POST /api/public/demo-requests` | `src/pages/DemoRequestPage.tsx` | Unit API & E2E form verification | **Completed & Verified** |
| **FR-006** | Primary Arabic Localization | P0 | Full RTL & Arabic Seed Data | `src/i18n/translations.ts`, `src/styles/theme.css` | RTL layout & Bidirectionality test | **Completed & Verified** |
| **FR-007** | Secondary English Support | P0 | Bilingual schema & responses | `src/context/LangContext.tsx` | LTR layout & English translations | **Completed & Verified** |
| **FR-010** | External Auth Provider Interface | P0 | `src/auth/authProvider.ts` | `src/context/AuthContext.tsx` | `tests/auth.test.ts` | **Completed & Verified** |
| **FR-011** | User, Role & Center Mapping | P0 | `src/routes/authRoutes.ts` | `src/pages/LoginPage.tsx` | `tests/auth.test.ts` (4/4 passed) | **Completed & Verified** |
| **FR-020** | Medical Center Separation | P0 | `organizations` table | `src/pages/AdminDashboard.tsx` | `tests/tenant-isolation.test.ts` | **Completed & Verified** |
| **FR-022** | Tenant-Scoped Operations | P0 | `src/middleware/tenant.ts` | Multi-Tenant Header Interceptor | `tests/tenant-isolation.test.ts` (3/3 passed) | **Completed & Verified** |
| **FR-023** | Prevent Identifier Manipulation | P0 | `WHERE organization_id = $tenant` | Server-Side Validation | `tests/tenant-isolation.test.ts` (3/3 passed) | **Completed & Verified** |
| **FR-025** | Patient Center Links (No Auto-Leak) | P0 | `patient_center_links` | MRN Isolation UI | `tests/tenant-isolation.test.ts` | **Completed & Verified** |
| **FR-030** | Patient Profiles & Search | P0 | `src/routes/patientRoutes.ts` | `src/pages/ReceptionWorkspace.tsx` | `tests/patient-portal.test.ts` | **Completed & Verified** |
| **FR-040** | Appointment Scheduling | P0 | `src/routes/appointmentRoutes.ts` | `src/pages/ReceptionWorkspace.tsx` | `tests/appointment-conflict.test.ts` | **Completed & Verified** |
| **FR-042** | Server Conflict Prevention | P0 | Server overlap query + Unique Index | Error feedback toast | `tests/appointment-conflict.test.ts` (3/3 passed) | **Completed & Verified** |
| **FR-045** | Reception Arrival Check-in | P0 | `PATCH /api/appointments/:id/check-in` | `src/pages/ReceptionWorkspace.tsx` | `tests/appointment-conflict.test.ts` | **Completed & Verified** |
| **FR-060** | Authorized Clinician Summary | P0 | `src/routes/patientRoutes.ts` | `src/pages/DoctorWorkspace.tsx` | `tests/rbac-clinical-wall.test.ts` | **Completed & Verified** |
| **FR-063** | Clinical Visit Draft | P0 | `POST /api/visits` (`status='draft'`) | `src/pages/DoctorWorkspace.tsx` | `tests/clinical-workflow.test.ts` | **Completed & Verified** |
| **FR-065** | Clinician Sign-Off & Approval | P0 | `POST /api/visits/:id/approve` | `src/pages/DoctorWorkspace.tsx` | `tests/patient-portal.test.ts` | **Completed & Verified** |
| **FR-066** | Conceal Drafts from Patient Portal | P0 | `WHERE status = 'approved'` | Filtered Patient Summary View | `tests/patient-portal.test.ts` (4/4 passed) | **Completed & Verified** |
| **FR-070** | Prescriptions Linked to Visits | P0 | `src/routes/prescriptionRoutes.ts` | `src/pages/DoctorWorkspace.tsx` | `tests/rbac-clinical-wall.test.ts` | **Completed & Verified** |
| **FR-072** | Display Documented Allergies | P0 | `patient_allergies` table | Allergy Warning Banner | `tests/patient-portal.test.ts` | **Completed & Verified** |
| **FR-080** | Laboratory Orders | P0 | `src/routes/labRoutes.ts` | `src/pages/DoctorWorkspace.tsx` | `tests/patient-portal.test.ts` | **Completed & Verified** |
| **FR-082** | Lab Result Review & Approval | P0 | `POST /api/labs/results/:id/approve` | `src/pages/DoctorWorkspace.tsx` | `tests/patient-portal.test.ts` | **Completed & Verified** |
| **FR-084** | Hide Preliminary Lab Results | P0 | Filter `lr.status = 'approved'` | Lab Results Table in Portal | `tests/patient-portal.test.ts` (4/4 passed) | **Completed & Verified** |
| **FR-090** | Patient Health Portal | P0 | `src/routes/portalRoutes.ts` | `src/pages/PatientPortal.tsx` | `tests/patient-portal.test.ts` (4/4 passed) | **Completed & Verified** |
| **FR-091** | Patient Messages & Inquiries | P0 | `POST /api/portal/messages` | `src/pages/PatientPortal.tsx` | `tests/patient-portal.test.ts` | **Completed & Verified** |
| **FR-092** | Symptom Reporting | P1 | `POST /api/portal/symptoms` | `src/pages/PatientPortal.tsx` | `tests/patient-portal.test.ts` | **Completed & Verified** |
| **FR-133** | Admin Clinical Wall | P0 | `blockPlatformAdminFromClinical` | Banner & Access Control Block | `tests/rbac-clinical-wall.test.ts` (3/3 passed) | **Completed & Verified** |
| **FR-140** | Security Audit Trail | P0 | `src/services/auditService.ts` | `src/pages/AdminDashboard.tsx` | System Event Logs | **Completed & Verified** |
| **FR-142** | Immutable Audit Logs | P0 | No DELETE / UPDATE routes | Read-only UI | Tested via SQL constraints | **Completed & Verified** |

---

## Acceptance Criteria Verification Summary

- **AC-01 (Patient Registration)**: Verified. Authorized users can create patient profiles, MRN is assigned locally per center, validation handles missing fields cleanly.
- **AC-02 (Appointment Conflict Prevention)**: Verified. Overlapping bookings for the same clinician are rejected server-side with 409 Conflict.
- **AC-03 (Visit Approval)**: Verified. Visit drafts are editable by clinicians and strictly invisible to patients until explicitly approved.
- **AC-04 (Tenant Isolation)**: Verified. Requests for resources belonging to another center return 403 Forbidden / 404 Not Found even when resource identifiers or tenant headers are manipulated.
- **AC-07 (Laboratory Results)**: Verified. Unapproved laboratory results are strictly withheld from the patient portal until approved by the attending clinician.
- **AC-08 (Security Audit & Tamper Resistance)**: Verified. All sensitive operations, approvals, and cross-tenant attempts automatically write immutable audit logs.

---

## Added after the baseline (no automated test yet)

| Req ID | Behaviour | Code | Status |
|---|---|---|---|
| FR-120 | In-app notifications | `backend/src/services/notificationService.ts`, `routes/notificationRoutes.ts`, `frontend/src/app/notifications` | Implemented, verified by hand |
| FR-123 | Read status | `notifications.read_at` / `handled_at` | Implemented, verified by hand |
| FR-121, FR-122 | Email notifications | none | Not implemented |
| (new) | Per-role settings and account API | `routes/accountRoutes.ts`, `frontend/src/app/pages/settings.tsx` | Implemented, verified by hand |
| (new) | Installable app | `frontend/vite.config.ts`, `frontend/src/pwa` | Implemented, not tested on devices |
