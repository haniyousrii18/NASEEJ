# Naseej | نَسيج — Five-Account Workspace PRD

**Document status:** Working draft, reconciled with the implementation (see section 15 for what exists)  
**Scope:** Authenticated workspaces and account architecture for five roles  
**Product:** Multi-tenant healthcare information platform  
**Languages:** Arabic (primary, RTL) and English (LTR)

---

## 1. Purpose

This document defines the product requirements and architecture for the five core authenticated account roles in Naseej:

1. Platform Administrator
2. Medical Center Manager
3. Doctor / Clinician
4. Reception Staff
5. Patient

It covers what each role can do, the shared authenticated application, account and organization relationships, authorization boundaries, and the clinical and operational workflows between roles.

The public landing page, marketing website, demo-request flow, and login page are outside this PRD. Authentication is treated as an upstream entry point: this document begins after a user has authenticated and the system has resolved their role and permitted organization context.

This PRD describes the original five-role scope. **As built, the application has seven workspaces:** these five, an authorized **Caregiver** workspace (added later), and a **Care Coordinator** workspace that is outside this baseline and was left unchanged. A later product decision also rebuilt the Patient, Caregiver, Doctor, Reception and Center Manager workspaces together; where that decision differs from the requirement text below, section 15 says so and the implementation is what the product does today.

## 2. Product Summary

Naseej gives each of five account types a role-specific workspace over a shared healthcare platform. Medical centers manage day-to-day operations, clinicians create and approve clinical records, reception staff manage administrative patient flow, and patients access their own approved information. Platform administrators manage the service and center accounts without routine access to clinical content.

The platform supports a connected patient identity while preserving organization-level record ownership. A patient's affiliation with multiple centers does not automatically expose records across those centers. Clinical information is traceable to its source and remains hidden from the patient until the required clinician approval is recorded.

## 3. Problem and Opportunity

Patient information and care operations can be fragmented across center workflows, appointments, visits, prescriptions, and test results. Staff may need to gather information repeatedly, while patients may lack a clear view of their approved records and follow-up interactions.

Naseej addresses this by providing shared patient identity and coordinated workflows while enforcing clear boundaries between platform administration, center operations, clinical work, reception, and patient self-service.

## 4. Goals and Success Measures

### Goals

- Provide a dedicated, understandable workspace for each of the five roles.
- Support patient registration, appointment booking, check-in, consultation, approval, and patient follow-up.
- Keep each center's operational and clinical data scoped to that center.
- Show patients only their own approved clinical information.
- Prevent operational roles and platform administrators from crossing into restricted clinical work.
- Make Arabic RTL and English LTR first-class authenticated experiences.
- Record sensitive actions and state transitions in an auditable trail.

### Success measures

- A complete synthetic-data journey can be performed across all five roles.
- Cross-center access attempts are rejected by the server, including requests with manipulated identifiers or organization context.
- Reception staff cannot read or change clinical records.
- Platform administrators cannot read patient clinical content.
- Unapproved visits, prescriptions, and lab results do not appear in the patient workspace.
- Overlapping appointments for the same clinician cannot be booked.
- Role workspaces are usable in both Arabic RTL and English LTR.

## 5. Users and Account Roles

| Role | Primary objective | Data scope | Key restrictions |
|---|---|---|---|
| Platform Administrator | Operate the Naseej platform and manage medical-center accounts, platform requests, and system audit views | Platform-level operational metadata | No routine access to patient clinical content |
| Medical Center Manager | Manage one center's staff, working hours, center policies, and high-level operational reports | Assigned center(s), subject to explicit membership | No access to individual clinical records and no authority to document, prescribe, or approve individual patient care records |
| Doctor / Clinician | Review authorized patient information and document care | Patients and clinical records authorized within the active center | Cannot access another center's records without an explicit supported sharing authorization |
| Reception Staff | Register patients, book appointments, and manage arrival flow | Administrative patient identity and appointment details in assigned center | No clinical notes, diagnoses, prescriptions, lab values, or clinical approval actions |
| Patient | Review personal approved records and communicate with care teams | Own identity and approved personal records | Cannot view drafts, preliminary results, or another patient's information |

Roles are mutually constrained by authorization policy. A user may have memberships in more than one center where allowed; active organization context must be resolved and enforced server-side for every center-scoped request.

## 6. Scope

### Included

- Shared authenticated application shell and role-aware navigation.
- Platform administrator workspace for centers, account administration, requests, and audit review.
- Center manager workspace for staff permissions, center working hours and policies, high-level operational reports, and patient experience feedback.
- Doctor workspace for appointments, authorized patient records, visit documentation, prescriptions, laboratory orders/results, and clinician approval.
- Reception workspace for patient registration, search, appointment scheduling, and check-in.
- Patient workspace for approved record review, appointments, documents, consent controls where implemented, messages, and symptom reports.
- Tenant isolation, role-based permissions, clinical approval controls, audit events, bilingual UI, and responsive authenticated layouts.
- Synthetic data for development, demonstration, and evaluation.

### Excluded

- Public landing page and marketing site.
- Login, registration, password recovery, and external identity-provider user journeys. Their post-authentication role resolution contract is included, but their screens are not.
- Care coordinator as a standalone account/workspace in this baseline. (It exists in the application, unchanged, and is not described here.)
- Caregiver accounts in the original baseline. (Implemented later; see section 15 and `docs/workspaces.md`.)
- Real patient data, production clinical deployment, and regulatory certification claims.
- Autonomous diagnosis, treatment selection, or prescription generation.
- Autonomous AI summaries and external HIS/HL7 integrations. (Optional AI document reading was added later as unreviewed suggestions only; see section 15.)

## 7. Shared Authenticated Application Architecture

### 7.1 Application layers

1. **Authenticated client:** React and TypeScript application with a shared shell, route guards, role-specific navigation, Arabic/English localization, and accessible responsive layouts.
2. **API:** Node.js/Express service. It validates the authenticated identity, resolves role and active organization, checks authorization, validates input, and records relevant audit events.
3. **Relational data layer:** PostgreSQL. Organization-scoped rows carry organization ownership and are queried with server-derived tenant context.
4. **Protected document storage:** Private storage outside the public web root. Downloads are mediated through authenticated, authorized endpoints.

### 7.2 Post-authentication contract

The authenticated application receives a validated user identity and role/membership context from the authentication layer. It then:

- Resolves exactly one permitted role workspace for the active session context.
- Restricts client navigation to routes associated with that role.
- Sends requests to the API with the authenticated session.
- Treats client-side navigation and hidden controls as usability aids only; the API remains the authorization authority.
- Clears the authenticated workspace when the session is invalid or revoked.

### 7.3 Tenant and identity model

- A **user account** represents an authenticated person.
- An **organization** represents a medical center.
- A **membership** connects an eligible staff account to an organization with a center role and membership status.
- A **patient profile** represents the patient's master identity.
- A **patient-center link** connects a patient profile to a center and holds center-specific affiliation details, including the local medical record number.
- Clinical and operational records created by a center are owned by that center.
- Organization scope is derived from validated membership/session context, never trusted solely from a client-supplied organization identifier.
- Patient links across centers do not grant cross-center clinical record access.

### 7.4 Role and permission enforcement

- The API checks role and organization membership on every protected operation.
- Tenant-scoped queries include the authorized organization boundary.
- Unauthorized requests are rejected without revealing another tenant's protected record contents.
- Platform administrator routes are separated from clinical routes; platform-wide privileges do not imply clinical access.
- Reception and manager UI routes do not expose clinical workflows, and the API independently rejects those operations.
- Patient queries are constrained to the authenticated patient's identity and approved visibility state.

## 8. Role Workspaces and Requirements

### 8.1 Platform Administrator

**Workspace areas:** platform overview, active medical centers, support tracking, and low-priority request review.

**Requirements:**

- The platform overview must show the number of active medical centers, pending requests, current system health, and support activity requiring follow-up.
- Active medical centers are the second-highest priority workspace area after the overview.
- Request review is in scope at low priority.
- View active-center details without editing or deactivating a center from that workspace.
- Receive explicit denial for clinical-record endpoints and patient clinical content.
- Have any in-scope platform actions recorded with actor, target, timestamp, and outcome.

#### Platform Administrator priorities

| Priority | Area | Initial requirement |
|---|---|---|
| P1 | Overview | Show active-center count, pending-request count, system-health status, and support activity needing follow-up. |
| P2 | Active medical centers | Read-only list of active centers showing each center's name, address, and total user count. No edit or deactivate action is available from this area. |
| Low | Request review | Allow review of incoming requests; this area is intentionally lower priority than overview and active centers. |
| TBD | Support tracking | Provide a read-only list of support requests showing center name, submitter name, subject, description, and submission date. The workspace does not provide in-app reply or resolution actions. An external support team, outside the five account roles, is responsible for resolving issues and marking them resolved. When marked resolved, the system automatically sends an email to the center's registered email address. The mechanism by which the external team updates the issue remains to be defined. |

**Out of scope for this workspace:** user-account administration and audit-log review.

### 8.2 Medical Center Manager

**Workspace areas:** high-level overview, staff and access, center working hours, center information and policies, high-level operational reports, and service quality/patient experience.

**Requirements:**

- View a high-level operational summary for the center, including total staff and an aggregate daily count of patients who attended. Attendance is a count only; do not show patient identities, arrival lists, waiting-room queues, or patient-level workflow. Do not show service counts, policy-update information, clinician schedule occupancy, or examination-flow tracking in the manager overview.
- Include a center calendar for general events such as holidays, maintenance, and meetings. It must not include patient appointments, patient-level appointment details, or clinician schedules. The manager can create, edit, and delete center calendar events. Each event has a name, type, date and time, and optional notes.
- Allow the manager to write, publish, edit, and delete original announcements for a filtered audience of center employees only; patients are not recipients. The manager can target employees by role. Announcements are delivered in the system and by email.
- Automatically generate and show important operational risk alerts on the dashboard. Initial alert types include failure of essential equipment, interruption of an important service, and a shortage that threatens service continuity. All three alert types share the same severity level. The manager can view alerts only and cannot change their status or close them from the dashboard. Staff attendance/absence monitoring and related alerts are out of scope. Exact trigger conditions remain to be defined.
- View each staff member's name, job title, account status, and current permissions; assign or change permissions within the center's authorized role set. The manager does not create or deactivate accounts, or edit staff profile data from this workspace.
- Set and change the center's regular working hours and define date-specific exceptions, including full-day closure or temporary opening/closing-hour changes. Do not manage clinician-specific schedules, schedule occupancy/capacity, patient arrivals, or appointment flow from this area.
- Edit the center's official contact information, such as its phone number and email address, when needed. Center name and address are not editable by the manager in this workspace.
- Review aggregate patient ratings, feedback, and administrative complaints in the service quality/patient experience page. Show average rating and counts of feedback/complaints by category and time period. Do not expose clinical details or patient-level medical records in this view.
- View center medical policies derived from globally recognized medical references, with their source and reference version visible. The manager may update how the center operationally applies a policy when that local process changes, but may not alter the underlying clinical recommendation. The manager is not expected to author global clinical guidance from scratch. A link in the footer of the center information page opens the policy area; policy changes do not appear on the dashboard. Each change requires a date when it becomes effective; the current version remains in effect until that date. Keep a change history showing who changed the local application, when the change was made, its effective date, and what changed. This does not grant access to individual patient clinical records or authority to approve individual visits, prescriptions, or results.
- Keep operational reporting at a high-level, non-clinical summary. Reports include aggregate patient attendance trends by day, week, or month; staff counts by role; and operational alert counts by type and period. Do not include clinician occupancy, patient attendance/arrival lists, waiting times, or examination-flow tracking. Patient-level attendance details are not allowed.
- Exclude care coordination, referrals, and follow-up case management from the manager workspace.
- Not create or approve clinical notes, prescriptions, or laboratory results merely by holding the manager role.

### 8.3 Doctor / Clinician

**Workspace areas:** clinical home, appointments, pending work, patient list, patient record workspace.

**Requirements:**

- View assigned or otherwise authorized appointments and patients within the active center.
- Review available patient history, documented allergies, and relevant records within the authorization boundary.
- Create and edit a clinical visit draft with author and timestamps.
- Create prescription drafts and laboratory orders/results as supported by the workflow.
- Explicitly approve/sign records before they become patient-visible.
- See clear provenance and state for imported, patient-reported, and clinician-authored information.
- Never have software autonomously make a diagnosis or treatment decision on the clinician's behalf.

### 8.4 Reception Staff

**Workspace areas:** reception overview, schedule, booking, arrivals, patient registration/search.

**Requirements:**

- Register a patient and create a center-specific patient link/MRN, subject to duplicate and identity validation.
- Search patients using permitted demographic and administrative identifiers.
- Book, reschedule, and cancel appointments according to center policy.
- Prevent overlapping bookings for the same clinician on the server.
- Record patient arrival/check-in and make the arrival available to the clinician workflow.
- View administrative appointment details needed for reception operations.
- Be denied access to clinical notes, diagnoses, prescriptions, and lab results.

### 8.5 Patient

**Workspace areas:** home/summary, timeline, documents, medications, appointments, messages, consent/sharing controls where available.

**Requirements:**

- View their own profile and center affiliations without exposing another patient's identity.
- Review approved visits, prescriptions, and laboratory results with source and date context.
- Never receive draft visits, pending approvals, or preliminary lab results through portal APIs.
- View and manage appointments and supported requests.
- Submit questions to care teams and log patient-reported symptoms.
- Review and manage explicit sharing consent where the feature is available.
- Understand that patient-reported information is distinct from clinician-verified information.

## 9. Cross-Role Core Workflows

### 9.1 Patient registration to consultation

Reception registers the patient and links the profile to the center → reception books a clinician appointment → reception records arrival → the clinician sees the checked-in patient in the authorized queue → the clinician reviews relevant history and documents a draft visit → the clinician explicitly approves it → the approved record becomes visible in the patient's workspace.

### 9.2 Prescription and laboratory review

The clinician creates a prescription or lab order/result in a non-published state → the clinician reviews relevant context and signs/approves the record → the system records the approval event → the patient can view the approved information in their own portal.

### 9.3 Multi-center patient identity

A patient may be linked to more than one center, with a distinct local MRN per center. Each center sees only its own center-owned records unless a later, explicit consent-based sharing capability is implemented and authorized. Affiliation alone never grants access.

## 10. Data and State Requirements

- All clinical records have a patient, owning organization, author/source, creation time, and review/publication state as appropriate.
- Draft and approved states are distinct and enforced in the API.
- State-changing approvals capture the approving actor and timestamp.
- Appointment state transitions are validated; clinician schedule conflicts are rejected server-side.
- Patient identity and center affiliation are modeled separately so each center can assign its own MRN.
- Audit events are append-only to application roles and capture actor, action, target, organization context, time, and outcome where applicable.
- Uploaded documents remain in protected storage and are served only after authorization checks.

## 11. Non-Functional Requirements

### Security and privacy

- Enforce least privilege and server-side authorization for every sensitive resource.
- Prevent insecure direct-object access and cross-tenant data leakage.
- Protect session tokens and sensitive data in transit and at rest according to the deployment environment.
- Keep platform administration structurally separated from clinical content access.
- Use synthetic data only in this academic prototype.

### Accessibility and usability

- Support keyboard navigation, visible focus, semantic labels, and accessible dialog behavior.
- Maintain usable layouts on desktop, tablet, and mobile authenticated workspaces.
- Preserve Arabic RTL directionality and correct mixed-language/content direction behavior.
- Keep operational and clinical status understandable without relying on color alone.

### Reliability and traceability

- Provide actionable loading, empty, validation, and failure states in each workspace.
- Record sensitive actions and important workflow transitions.
- Avoid presenting missing clinical information as a negative finding.

## 12. Acceptance Criteria

1. Each of the five roles resolves to its intended authenticated workspace and cannot navigate into another role's routes.
2. Direct API calls enforce the same permissions as the UI.
3. Platform administrator access to clinical content is rejected and audited.
4. Reception access to clinical content or clinical write operations is rejected and audited where appropriate.
5. A center user cannot retrieve another center's records by changing IDs or organization parameters.
6. A patient cannot access another patient's data, and sees only approved clinical records.
7. Visit, prescription, and lab-result approval requires an explicit authorized clinician action.
8. Overlapping appointments for one clinician cannot be persisted.
9. Patient registration creates or updates the patient-center association without replacing the master patient identity or another center's MRN.
10. The end-to-end synthetic journey in Section 9 can be completed using the five account roles.
11. All in-scope authenticated workflows are available in Arabic and English with correct RTL/LTR layout.

## 13. Risks, Assumptions, and Open Decisions

- **Role inventory:** The application includes a care coordinator workspace in addition to the five roles here, and a caregiver workspace. Product owners still need to decide whether the coordinator remains a separate role.
- **Center manager clinical access:** This PRD assumes managers see operational metadata but do not see clinical content by default. Any exception requires an explicit permission and audit policy.
- **Cross-center sharing:** Implemented: the patient grants a scoped, expiring, revocable consent between two centers they are registered at, the server checks it on every read, and each cross-center read is audited. A patient-center link alone still grants nothing.
- **Authentication:** The login page and provider selection are excluded, but the identity, role, membership, session revocation, and active-organization contracts must remain compatible with this workspace architecture.
- **Caregiver access:** Not part of the original baseline. A conservative implementation now exists (patient-granted, scoped, expiring delegations enforced server-side; see `docs/workspaces.md`). Guardianship for minors and incapacitated adults is still unspecified.
- **Production readiness:** The prototype's synthetic-data and local-evaluation context does not establish production security, compliance, availability, or clinical safety certification.

## 14. Source Files and Alignment Notes

This draft is based on the repository's `PRODUCT.md`, `Naseej-PRD.md`, `docs/architecture.md`, `docs/user-guide.md`, `docs/traceability-matrix.md`, and the authenticated application routes/workspaces under `frontend/src/app`.

The application route model contains `caregiver` and `care_coordinator` roles in addition to the five here (section 15).

## 15. Implementation status by role

Written when this document was reconciled with the code. "Implemented" means the screens and server routes exist and were reviewed; backend tests exist for most boundaries, but the tests for caregiver delegation, operational messages and AI review (migration 003) were written and have not yet been run on a database with 003 applied. This is not a certification or clinical-validation claim.

### 15.1 Platform Administrator (section 8.1)
- **Implemented:** overview (service health, active and suspended centers, accounts, audit events in 24 hours, new demo requests), centers, accounts and roles, demo requests, audit log. Clinical routes are blocked and audited.
- **Differs from the text above:** the text makes centers read-only and puts account administration and audit review out of scope. The application lets the administrator add and suspend centers, manage accounts, and read the audit log.
- **Not implemented:** support tracking (support requests list and the email on resolution).

### 15.2 Medical Center Manager (section 8.2)
- **Implemented:** overview, working hours of each clinician (windows and activation), a center calendar (week and month) showing booked appointments against slot capacity with counts only, staff and roles (add staff and caregiver logins, change role and status, never the last active manager), services derived from doctors' specialties, aggregate reports, coordination oversight, and a center activity log with clinical keys redacted.
- **Differs from the text above (later product decision):** the manager now manages clinician schedules and sees schedule load, can add staff accounts and change their status, and has coordination oversight. The text excluded all of this. The rule that managers never see individual clinical records is unchanged and enforced by the API.
- **Not implemented:** center events calendar, announcements by role (in system and by email), operational risk alerts, editing the center's contact details, patient ratings and complaints, versioned center policies, and center-level working hours with date exceptions.

### 15.3 Doctor / Clinician (section 8.3)
- **Implemented:** appointments, authorized patient record, visit drafts with approval, prescriptions with allergy visibility, lab orders and results, provenance and review state on every item, document review, AI suggestions to accept, correct or reject (when AI is configured), an inbox of patient and caregiver questions, and operational messages from reception.

### 15.4 Reception Staff (section 8.4)
- **Implemented:** patient registration with a center-specific MRN, administrative patient search, booking with server-side conflict prevention, confirm / decline / reschedule / cancel, check-in, day / week / month calendar with a clinician view, a stale-data indicator, and operational messages to clinicians. No clinical content is returned to reception.

### 15.5 Patient (section 8.5)
- **Implemented:** approved record, timeline, a document library with upload progress and filters (center, source, review state, date), medications, appointments, questions and symptoms, cross-center consent, and caregiver authorization with access history and revocation.

### 15.6 Caregiver (added after this baseline)
- **Implemented:** the caregiver signs in, accepts or declines an invitation addressed to their email, sees exactly what is included, and can view the approved record, request appointments and message the care team only if the patient allowed each. Every request is checked on the server against an active, unexpired delegation. Caregivers never see drafts or AI suggestions and cannot download files.
- **Open policy decisions:** guardianship for minors and incapacitated adults, whether caregivers may download original files, maximum delegation length (currently 365 days).

### 15.7 Care Coordinator
- Present in the application and unchanged. Operational follow-up only.

### 15.8 Acceptance criteria (section 12)
- Covered by automated tests in the repository: 2, 3, 4, 5, 6, 7, 8, 9. Criterion 1 now includes the caregiver and coordinator roles. Criterion 10, the end-to-end synthetic journey, is possible with the demo accounts in the README but was not re-run end to end after the workspace rebuild. Criterion 11 (Arabic and English) is implemented; a full manual review of every screen in both languages has not been done.
