# Test Plan & Traceability Matrix — Naseej | نَسيج

## 1. Testing Strategy

The Naseej test strategy verifies security boundaries, tenant isolation, clinical workflow integrity, and data privacy using automated integration tests executed against PostgreSQL.

```text
                  +---------------------------+
                  | End-to-End Clinical Flow  |
                  +---------------------------+
                  |  Multi-Tenant Isolation   |
                  +---------------------------+
                  |  Role & RBAC Permissions  |
                  +---------------------------+
                  | Conflict & Approval Rules |
                  +---------------------------+
```

---

## 2. Mandatory Test Suites

### Suite A: Tenant Isolation (AC-04 & FR-023)
1. **Cross-Center Resource Access**: A user authenticated with Center 1 makes a request for a visit, patient, or lab order belonging to Center 2. Must return `403 Forbidden` or `404 Not Found`.
2. **Identifier Manipulation**: Altering `X-Organization-Id` to a center the user does not belong to must be rejected immediately (`403 Forbidden`).
3. **Cross-Center Patient Leak Prevention**: Querying `GET /api/patients` under Center 1 returns only patients linked to Center 1.

### Suite B: Role-Based Access Control (RBAC)
1. **Platform Admin Clinical Wall**: Platform Administrator attempting to view clinical visit contents must be blocked (`403 Forbidden`).
2. **Receptionist Clinical Wall**: Reception staff cannot create visits, write prescriptions, or approve lab results.
3. **Clinician Authorization**: Only verified clinicians can sign off visits and prescribe.

### Suite C: Appointment Conflicts & Schedule Integrity (AC-02 & FR-042)
1. **Double-Booking Rejection**: Booking two appointments for the same clinician at overlapping times must be rejected by the server with a clear conflict error.
2. **Valid Booking**: An unbooked slot succeeds and transitions status cleanly.
3. **Reception Check-in**: Receptionist marks patient as `checked_in` with timestamp.

### Suite D: Clinical Drafts & Patient Portal Privacy (AC-03 & AC-07)
1. **Visit Draft Invisibility**: A patient requesting their own visit while `status = 'draft'` must receive 404 or empty list.
2. **Visit Approval Visibility**: Once the clinician approves (`status = 'approved'`), the visit is accessible in the patient portal.
3. **Lab Result Approval Check**: Unapproved lab results cannot be seen in the patient portal.

### Suite E: Tamper-Resistant Audit Trail (FR-140 & FR-142)
1. Sensitive actions (`VISIT_APPROVE`, `APPOINTMENT_CREATE`, `AUTH_LOGIN`, `PATIENT_CREATE`) automatically write an entry to `audit_logs`.
2. Direct client modification or deletion of `audit_logs` is rejected.

---

## 3. Requirement Traceability Matrix

| Req ID | PRD Section | Acceptance Criteria | Automated Test Suite |
|---|---|---|---|
| FR-011 | 7.2 Auth Mapping | Map external identity to user & roles | `tests/auth.test.ts` |
| FR-022 | 7.3 Isolation | Server-side tenant checks and scoped queries | `tests/tenant-isolation.test.ts` |
| FR-023 | 7.3 Cross-Tenant | Reject manual identifier manipulation | `tests/tenant-isolation.test.ts` |
| FR-025 | 7.3 Multi-Center Link | Linking patient does not leak other center records | `tests/tenant-isolation.test.ts` |
| FR-042 | 7.5 Conflict Prev | Prevent conflicting appointments server-side | `tests/appointment-conflict.test.ts` |
| FR-045 | 7.5 Reception | Check-in and arrival timestamps | `tests/appointment.test.ts` |
| FR-063 | 7.7 Visits | Clinician visit drafting | `tests/clinical-workflow.test.ts` |
| FR-066 | 7.7 Draft Concealment | Patients cannot view unapproved drafts | `tests/patient-portal.test.ts` |
| FR-070 | 7.8 Prescriptions | Prescriptions with items and allergy check | `tests/clinical-workflow.test.ts` |
| FR-084 | 7.9 Lab Results | Results hidden from patient until approval | `tests/patient-portal.test.ts` |
| FR-140 | 7.13 Audit Trail | Immutable audit trail for security & workflows | `tests/audit-logs.test.ts` |
