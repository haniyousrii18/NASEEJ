<div align="center">

# Naseej | نَسيج
### Product Requirements Document (PRD)

**A Multi-Tenant Healthcare SaaS Platform for Connected Patient Information**

Version 1.1 — Requirements baseline with implementation status  
Primary language: Arabic, followed by English  
Project duration: 4–5 months · Approximately 4 active contributors

</div>

---

## Document Information

| Field | Details |
|---|---|
| Product name | Naseej \| نَسيج |
| Product type | Multi-tenant Healthcare SaaS / Health Information Platform |
| Purpose | Connect patient health information across visits, documents, results, and healthcare centers |
| Primary users | Patient, Authorized Caregiver, Doctor, Reception Staff, Center Manager (the five rebuilt workspaces), plus Platform Administrator and Care Coordinator |
| Academic demo environment | Local execution on team computers or the presentation machine |
| Test and demo data | Synthetic data only |
| Core stack | React + Vite + TypeScript, Node.js + Express (TypeScript), PostgreSQL |
| Document status | Requirements baseline. Section "Implementation status" below records what exists today; the requirement text itself is unchanged unless a note says so |

## Implementation status

This section was added when the document was reconciled with the code. It says what exists, not what was planned. "Implemented" means the code and routes exist and were reviewed; automated tests exist for most backend rules, but the tests for caregiver delegation, operational messages and AI review (migration 003) were written and have **not yet been run** on a database with 003 applied. Nothing here is a claim of certification or clinical validation.

| Requirement group | Status | Notes |
|---|---|---|
| 7.1 Public website (FR-001 to FR-007) | Implemented, except FR-004 | Landing, features, workflow, demo request, login. **FR-004 (a general contact form) is not implemented**; only the demo request exists. The site switches views in the app rather than using the `/ar`, `/en`, `/contact` URLs suggested in 9.2. |
| 7.2 Authentication and accounts | Partial | Email and password with a JWT behind a replaceable `IAuthProvider`. **No external identity provider** is integrated. A center manager can add staff and caregiver logins; a platform administrator can add managers. |
| 7.3 Centers and tenant isolation | Implemented | `organization_id` scoping, tenant header validation, suspended-center handling, cross-tenant attempts audited, isolation tests. |
| 7.4 Patient profile and health record | Implemented | Master profile, per-center links and MRNs, allergies, longitudinal timeline with provenance and review state. |
| 7.5 Appointments and reception (FR-040 to FR-046) | Implemented | Schedules, server-side conflict prevention, patient requests, reception confirm / decline / reschedule / cancel, check-in, status history, day / week / month calendar. |
| 7.6 Documents (FR-050 to FR-052, FR-057, FR-058) | Implemented | PDF / PNG / JPEG up to 4 MB, type sniffed from bytes, random stored names, authorized and audited downloads, manual review when AI is off. |
| 7.6 OCR (FR-053 to FR-056) | Code complete, off by default | Provider adapters (Google Gemini and Anthropic) do OCR, a type suggestion and candidate facts with page, passage and the model's own confidence. Needs `AI_PROVIDER` and the matching key. The Gemini adapter has unit tests with a stubbed HTTP call. **Neither has been run against a live provider.** FR-055: the original is one click away from each suggestion, but there is no side-by-side viewer. |
| 7.7 Clinician workspace and visits | Implemented, except FR-067 | Drafts, approval, author and timestamps, patients never see drafts. FR-062 is partial (results comparison, no change highlighting engine). **FR-067 voice dictation is not implemented.** |
| 7.8 Prescriptions | Implemented, except FR-073 | Allergies shown before approval, no automatic changes. **FR-073 alerts with sources are not implemented** (there is no alert engine). |
| 7.9 Laboratory orders and results | Implemented | Draft, review, approval states; patients see approved results only. |
| 7.10 Patient portal and communication | Implemented, except FR-095 | Approved record, appointment requests and status, questions, symptoms. Questions are now readable and answerable by clinicians (this was missing before). **FR-095 guidance alerts are not implemented.** **FR-096 caregiver access is implemented** (patient-granted, scoped, expiring, three separate permissions). |
| 7.11 AI and background jobs | Partial | FR-102 (replaceable provider), FR-104, FR-106, FR-107 (manual fallback), FR-113 implemented. FR-103 partial (suggestions grouped by type and linked to sources, no narrative summary). FR-110 to FR-112 partial: job status (queued / processing / failed / completed), atomic claim that prevents duplicate runs, retry only after failure, but it runs inside the API process, **not** in a queue. **FR-100 (independent AI service), FR-101 (local OCR) and FR-105 (rule-based alerts) are not implemented.** |
| 7.12 Notifications and dashboards | Partial | **FR-120 to FR-123 (in-app and email notifications) are not implemented.** FR-130, FR-131, FR-132, FR-133, FR-134 are implemented as dashboards for managers, doctors and platform administrators. |
| 7.13 Privacy and audit | Partial | FR-140 to FR-142 and FR-144 implemented (audit log, append-only guards, consent scope and revocation). **FR-143, FR-145, FR-146 (privacy requests and retention policy) are not implemented.** |
| 8 Non-functional | Partial | Arabic RTL and English LTR throughout the app; loading, empty and error states; backup and restore documented in the README, restore not exercised in this session; performance not measured. |
| 16 Testing | Partial | Vitest and Supertest suites for authorization, isolation, conflicts, workflows. A GitHub Actions workflow (`.github/workflows/ci.yml`) runs the typechecks, backend tests on a throwaway PostgreSQL, frontend tests and the build on every pull request. **It has not run yet**, so the first run will show whether the 003 tests pass. Making it a required check is a repository setting (see `docs/team-guide.md`). |

Added beyond the original requirements: operational messaging between reception and clinicians, a patient document library, a manager calendar (counts only), and the caregiver workspace. See `docs/workspaces.md`.

## 1. Executive Summary

Naseej is a multi-tenant healthcare information platform that brings a patient's health information into a connected, traceable record. It supports workflows between reception staff, clinicians, medical center administrators, and patients.

The platform includes:
- A public marketing website and demo-request workflow.
- Patient profiles and longitudinal health records.
- Appointment scheduling and reception workflows.
- Clinical visits, prescriptions, laboratory orders, and results.
- A patient portal for approved information, questions, and symptom reports.
- Role-based access control and strict tenant isolation.
- Audit logging and privacy-request management.
- Prototype AI services for OCR, document classification, summarization, and rule-based alerts.

AI-generated outputs remain drafts requiring appropriate human review. Naseej must not independently diagnose patients, prescribe treatment, or modify medication plans.

The project goal is to deliver a coherent, locally runnable academic prototype. Core clinical workflows, authorization, privacy boundaries, and tests take priority over advanced AI capabilities.

## 2. Problem Statement

Patient information may be spread across documents, laboratory reports, previous visits, and separate healthcare providers. This fragmentation can make it difficult to understand the patient's history, identify changes over time, track pending actions, and verify the source of a clinical value.

Naseej addresses these challenges by:
1. Connecting patient information across visits and documents.
2. Making the timeline and context of health information easier to review.
3. Recording data sources, timestamps, authors, and review status where available.
4. Organizing appointments, prescriptions, laboratory results, and follow-up requests.
5. Protecting information across multiple healthcare centers.
6. Reducing manual searching and repetitive information gathering.
7. Supporting clinical review while preserving the clinician's responsibility for medical decisions.

## 3. Product Vision and Objectives

### 3.1 Vision

Provide each patient with a connected health-information record that authorized users can review across relevant care interactions, while maintaining privacy, traceability, and clear control over information sharing.

### 3.2 Objectives

- Establish a unified patient profile and longitudinal health record.
- Support the patient journey from registration and booking through consultation and follow-up.
- Enable patients to view approved information.
- Enforce role-based permissions and tenant-level isolation.
- Support secure document handling and human-reviewed extraction.
- Provide AI-assisted prototypes without autonomous clinical decision-making.
- Deliver a maintainable codebase, documentation, and test evidence.

### 3.3 Project Success Indicators

- A complete demonstration journey works using synthetic data.
- All five primary roles have appropriate access boundaries.
- Cross-tenant access attempts are rejected by the backend.
- Unapproved clinical drafts and laboratory results are not visible to patients.
- Local setup and database initialization are documented.
- A backup restoration test is completed and recorded.
- Test results accurately reflect tests actually executed.

## 4. Product Scope

### 4.1 Core Scope

- Public website and demo-request forms.
- Authentication through a replaceable provider adapter (local email/password with JWT in this prototype; an external provider is not integrated).
- Center, user, and role management.
- Patient profiles and core medical records.
- Appointment schedules, bookings, and check-in.
- Clinical visits, care plans, and prescriptions.
- Laboratory orders, results, and approval states.
- Secure document uploads and downloads.
- Patient portal, questions, and symptom reporting.
- In-app notifications and limited email notifications.
- Audit logs and privacy requests.
- Role and tenant-isolation tests.
- Local demonstration environment and academic documentation.

### 4.2 Advanced Prototype Scope

- OCR text extraction and document classification.
- Suggested fields extracted from documents.
- Experimental patient-history summaries.
- Rule-based guidance alerts.
- Background processing for longer-running tasks.
- Consent-controlled record sharing between centers.

### 4.3 Out of Scope for the University Version

- Production use with real patient information.
- Autonomous diagnosis or treatment recommendations.
- Clinically approved AI models.
- Production integrations with hospital, laboratory, or medical-device systems.
- Claims of legal compliance or security certification without independent review.
- High-availability commercial hosting.
- A separate native mobile application; responsive web interfaces are the priority.

### 4.4 Prioritization

- **P0 — Must have:** authentication, tenant isolation, permissions, patients, appointments, visits, prescriptions, results, core patient portal, and essential tests.
- **P1 — Important:** document management, audit logs, notifications, privacy requests, and operational dashboards.
- **P2 — Prototype:** OCR, AI summaries, experimental alerts, advanced caregiver support, and advanced record sharing.

If time becomes limited, reduce P2 scope before compromising core patient workflows or security.

## 5. User Roles and Permissions

| Role | Main responsibilities | Access boundaries |
|---|---|---|
| Naseej Platform Administrator | Manage center accounts, platform configuration, service status, and technical issues | No routine access to clinical record contents |
| Medical Center Manager | Manage center staff, schedules, operational requests, and aggregate metrics | Restricted to the manager's center |
| Doctor / Clinician | Review authorized records, document visits, create prescriptions, and approve clinical information | Limited to authorized patients and valid sharing permissions |
| Reception Staff | Register patients, manage appointments, check-in, and administrative requests | No unnecessary access to clinical details |
| Patient | View approved information, request appointments, submit questions and symptoms, manage consent | Restricted to their own authorized information |
| Authorized Caregiver | Assist a patient within a delegated scope | Implemented. Access exists only through a delegation the patient granted and the caregiver accepted, with separate permissions to view the approved record, manage appointment requests and message the care team, and it expires or is revoked |

### General Authorization Rules

- The backend must validate identity, role, tenant, resource, and applicable consent for every protected operation.
- UI restrictions alone are not security controls.
- Users cannot change their own role through the client.
- Center managers can create and manage staff accounts only within their authorized scope.
- Linking a patient to another center does not automatically grant access to the patient's existing records.
- Platform administration must be separated from access to clinical content.
- Sensitive actions must be recorded in the audit log.

## 6. Core User Journeys

### 6.1 Patient Journey

1. A patient creates an account or is registered by reception staff.
2. Identity is appropriately verified before linking an account to an existing patient profile.
3. The patient requests an appointment.
4. The center confirms or declines the request according to its policy.
5. Reception staff records the patient's arrival.
6. The clinician reviews authorized patient information.
7. The clinician documents the visit and creates prescriptions or laboratory orders when needed.
8. Required clinical information is reviewed and approved.
9. Approved information becomes available in the patient portal.
10. The patient follows up through appointments, questions, and symptom reports.

### 6.2 Medical Center Onboarding

1. A center requests a product demonstration through the public website.
2. After an agreement, a platform administrator creates and configures the center.
3. The center manager creates staff accounts and assigns roles.
4. The manager configures clinician schedules and operational settings.
5. Reception staff begin registering patients and managing appointments.
6. The center uses operational dashboards to track appointments, requests, and pending reviews.

### 6.3 Document and OCR Workflow

1. An authorized user uploads a permitted image or PDF.
2. The server validates file type, size, and authorization.
3. The original file is stored outside the public web directory.
4. An OCR job is created when extraction is requested.
5. The system displays extracted text and suggested fields, including source location and confidence when available.
6. An authorized user reviews and corrects the extracted information.
7. The information is approved according to its type and workflow.
8. Important changes and approvals are logged.

### 6.4 Cross-Center Record Sharing

1. The patient initiates a sharing request.
2. The receiving center specifies the requested data scope and purpose.
3. The patient explicitly reviews and approves the scope.
4. The system validates the consent whenever access is requested.
5. Requests, consent, access, and revocation are logged.
6. Revocation blocks future access that depends on that consent, subject to applicable retention obligations.

## 7. Functional Requirements

Priority definitions: **P0** = mandatory, **P1** = important, **P2** = prototype or future scope. A requirement is not complete until implemented, tested, and documented.

### 7.1 Public Website

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Provide a homepage explaining the product and its value | P0 |
| FR-002 | Provide Features and Workflow pages | P0 |
| FR-003 | Provide a demo-request form for medical centers | P0 |
| FR-004 | Provide a general contact form and submission confirmation | P1 |
| FR-005 | Provide a clear login entry point for existing users | P0 |
| FR-006 | Support Arabic first and a translation structure for English | P0 |
| FR-007 | Support RTL/LTR layouts and mixed-language content | P0 |

### 7.2 Authentication and Accounts

| ID | Requirement | Priority |
|---|---|---|
| FR-010 | Use an external provider for authentication and session management | P0 |
| FR-011 | Map provider identity to an internal user, role, and center membership | P0 |
| FR-012 | Route users to the appropriate workspace after login | P0 |
| FR-013 | Reject protected requests after session expiration or loss of permission | P0 |
| FR-014 | Support logout and account recovery according to provider capabilities | P0 |
| FR-015 | Allow center managers to manage staff accounts within their scope | P0 |
| FR-016 | Support account activation, deactivation, and role changes with server validation | P0 |
| FR-017 | Apply rate limiting to sensitive operations | P0 |
| FR-018 | Protect sessions and tokens according to the chosen provider integration | P0 |

The authentication provider has not yet been selected. The team should choose it during project setup after reviewing cost, local development needs, and integration complexity.

### 7.3 Centers and Tenant Isolation

| ID | Requirement | Priority |
|---|---|---|
| FR-020 | Maintain a separate record for each medical center | P0 |
| FR-021 | Support authorized user memberships in one or more centers | P0 |
| FR-022 | Scope every protected read, create, update, and delete operation to the correct tenant | P0 |
| FR-023 | Prevent cross-tenant access even when resource identifiers are manually changed | P0 |
| FR-024 | Support a unified patient profile with multiple center relationships | P0 |
| FR-025 | Prevent automatic record sharing merely because a patient is linked to a center | P0 |
| FR-026 | Require explicit, scoped consent for cross-center sharing | P1 |

### 7.4 Patient Profile and Health Record

| ID | Requirement | Priority |
|---|---|---|
| FR-030 | Create and search patient profiles according to permissions | P0 |
| FR-031 | Store necessary identity, contact, and emergency information | P0 |
| FR-032 | Store allergies, health problems, and medical history | P0 |
| FR-033 | Link visits, prescriptions, results, and documents to the patient | P0 |
| FR-034 | Display a chronological health-information timeline | P0 |
| FR-035 | Record source, date, author, and review status when available | P0 |
| FR-036 | Support corrections while retaining a history of important changes | P0 |
| FR-037 | Reduce duplicate patient records and control profile linking | P1 |

### 7.5 Appointments and Reception

| ID | Requirement | Priority |
|---|---|---|
| FR-040 | Create appointments linked to patient, clinician, and center | P0 |
| FR-041 | Manage clinician schedules and available time slots | P0 |
| FR-042 | Prevent conflicting bookings during server-side confirmation | P0 |
| FR-043 | Allow patients to request appointments, changes, or cancellations | P0 |
| FR-044 | Allow the center to accept or decline requests according to policy | P0 |
| FR-045 | Record patient check-in and support a suitable waiting list | P0 |
| FR-046 | Record appointment status changes | P1 |

### 7.6 Documents and OCR

| ID | Requirement | Priority |
|---|---|---|
| FR-050 | Accept permitted image and PDF uploads within configured limits | P1 |
| FR-051 | Store files outside public directories using random identifiers | P1 |
| FR-052 | Verify permissions before viewing or downloading files | P0 |
| FR-053 | Suggest document classifications using OCR or supporting tools | P2 |
| FR-054 | Extract text and candidate fields from documents | P2 |
| FR-055 | Display extracted text alongside the original for review | P2 |
| FR-056 | Store source location and confidence when available | P2 |
| FR-057 | Prevent extracted clinical information from being approved without required review | P0 |
| FR-058 | Preserve the original and allow manual entry when OCR fails | P1 |

### 7.7 Clinician Workspace and Visits

| ID | Requirement | Priority |
|---|---|---|
| FR-060 | Display the authorized patient summary, history, medications, and allergies | P0 |
| FR-061 | Display laboratory results and trends where comparable data exists | P1 |
| FR-062 | Highlight relevant changes since the previous visit without inventing conclusions | P1 |
| FR-063 | Create an editable visit draft | P0 |
| FR-064 | Record complaint, assessment, problems, plan, and instructions | P0 |
| FR-065 | Record the clinician who created and approved the visit and the relevant timestamps | P0 |
| FR-066 | Prevent patients from viewing unapproved visit drafts | P0 |
| FR-067 | Support manual entry; voice dictation is optional if time permits | P1/P2 |

### 7.8 Medications and Prescriptions

| ID | Requirement | Priority |
|---|---|---|
| FR-070 | Create prescriptions linked to patient, visit, clinician, and center | P0 |
| FR-071 | Record medication, dosage, duration, instructions, and status | P0 |
| FR-072 | Display recorded allergies before prescription approval | P0 |
| FR-073 | Display available alerts and their sources before approval | P1 |
| FR-074 | Never automatically change a medication or dosage | P0 |
| FR-075 | Make approved prescriptions available to the patient | P0 |
| FR-076 | Preserve important prescription status changes and edits | P0 |

### 7.9 Laboratory Orders and Results

| ID | Requirement | Priority |
|---|---|---|
| FR-080 | Create laboratory orders linked to the patient and visit | P0 |
| FR-081 | Record results or attach the original report | P0 |
| FR-082 | Manage result states from entry through review, approval, or cancellation | P0 |
| FR-083 | Record result source and date when available | P0 |
| FR-084 | Prevent patient access before the required approval | P0 |
| FR-085 | Record subsequent changes | P0 |

### 7.10 Patient Portal and Communication

| ID | Requirement | Priority |
|---|---|---|
| FR-090 | Display approved appointments, prescriptions, instructions, and results | P0 |
| FR-091 | Submit questions and requests and track their status | P0 |
| FR-092 | Record symptoms with time and description | P1 |
| FR-093 | Display request status to the patient | P0 |
| FR-094 | Route medical or unclear questions to the appropriate care team | P0 |
| FR-095 | Display approved guidance alerts without autonomous diagnosis | P1 |
| FR-096 | Support caregiver access only after verifying delegation and scope | P2 |

### 7.11 AI and Background Jobs

| ID | Requirement | Priority |
|---|---|---|
| FR-100 | Provide an independent AI service communicating with Express through an internal API | P2 |
| FR-101 | Support local or locally runnable OCR | P2 |
| FR-102 | Make summarization provider replaceable between local and external options | P2 |
| FR-103 | Produce experimental summaries that distinguish recorded facts from suggestions | P2 |
| FR-104 | Present AI output as an unapproved draft | P0 |
| FR-105 | Provide experimental rule-based alerts with a clear reason and source | P2 |
| FR-106 | Prevent AI from independently diagnosing or making treatment decisions | P0 |
| FR-107 | Provide a documented fallback when the AI service is unavailable | P1 |
| FR-110 | Process short jobs directly and long-running jobs in the background | P1/P2 |
| FR-111 | Assign each background job an ID and Queued/Processing/Completed/Failed status | P1 |
| FR-112 | Limit retries and prevent unintended duplicate processing | P1 |
| FR-113 | Show failures without losing original data | P0 |

No real patient data may be sent to external AI services during the university project. Only synthetic demo data may be used. Job completion does not imply clinical approval.

> **As built:** the AI step is an in-process provider adapter (`backend/src/services/ai`), not the separate `ai-service` described above, and it is off until a key is configured. A patient's file is sent only after the patient allows it for that file. See "Implementation status".

### 7.12 Notifications and Dashboards

| ID | Requirement | Priority |
|---|---|---|
| FR-120 | Provide in-app notifications | P1 |
| FR-121 | Send email for important events such as appointment confirmation or a new reply | P1 |
| FR-122 | Exclude sensitive medical details from email content | P0 |
| FR-123 | Track read status where applicable | P1 |
| FR-130 | Provide an operational dashboard for center managers | P1 |
| FR-131 | Display appointments, requests, and results awaiting review | P1 |
| FR-132 | Provide a platform dashboard for accounts, service status, and technical errors | P1 |
| FR-133 | Prevent routine platform administration from exposing clinical record contents | P0 |
| FR-134 | Prefer aggregated platform-level metrics | P1 |

### 7.13 Privacy and Audit

| ID | Requirement | Priority |
|---|---|---|
| FR-140 | Log sensitive access, edits, approvals, sharing, and other critical actions | P0 |
| FR-141 | Record actor, timestamp, action type, and relevant resource as necessary | P0 |
| FR-142 | Prevent ordinary UI users from editing or deleting audit records | P0 |
| FR-143 | Accept access, correction, and deletion requests where policy permits | P1 |
| FR-144 | Record consent scope, date, status, and revocation | P1 |
| FR-145 | Define a reviewable retention, archival, and deletion policy | P1 |
| FR-146 | Display privacy-request status and assigned reviewer | P1 |

## 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Security | Validate identity and permissions on the server; the UI is not a security boundary |
| Tenant isolation | Scope every protected operation to the correct tenant and test identifier manipulation |
| Privacy | Minimize data exposure and never send real patient data to external AI services in the academic version |
| Data integrity | Use database constraints, relationships, validation, and transactions for multi-step operations |
| Traceability | Preserve source, date, and review state where applicable |
| Reliability | Document backups and test restoration of the database and associated files |
| Performance | Measure response times on a reference machine before setting realistic targets |
| Usability | Provide clear loading, success, error, and empty states |
| Accessibility | Support keyboard navigation, readable contrast, and appropriate labels where practical |
| Localization | Support Arabic RTL, English LTR, and mixed-direction content |
| Maintainability | Separate components and document API contracts and migrations |
| Local operation | Provide repeatable setup instructions; Docker is not the primary run method |

### 8.1 Backup and Recovery

- Document backup frequency, storage location, and access restrictions.
- Define project-appropriate RPO (acceptable data loss) and RTO (target restoration time).
- Include both the database and linked files.
- Test restoration and verify relationships and file access.
- Do not treat the existence of a backup file as proof that recovery works.

## 9. Brand and User Experience

### 9.1 Brand Identity

- Product name: **Naseej | نَسيج**.
- Use the supplied logo on the public website, product pages, and login screen, with an appropriate icon variant.
- The visual identity should communicate connected information and integrated care through a calm, human-centered style.
- Provide suitable alternative text for the logo.
- Do not redraw or alter the approved logo without team agreement.

### 9.2 Public Website

Suggested routes:
- `/ar`
- `/en`
- `/features`
- `/workflow`
- `/demo`
- `/contact`
- `/login`
- `/app/...` for role-protected internal routes

Primary call to action: **Request a Demo**.  
Secondary call to action: **Contact Us**.

As built, the public pages are views inside the app and the signed-in application uses hash routes such as `#/doctor/home` and `#/caregiver/home`; the URLs above were not adopted.

The sales process is demo-led. After an agreement, the platform administrator creates and configures the center rather than automatically provisioning a production center from a public form.

### 9.3 Internal Workspaces

- Center Manager Dashboard
- Clinician Workspace
- Reception Workspace
- Patient Portal
- Platform Administrator Dashboard
- Account, consent, notification, and privacy-request pages

Every screen should support loading, error, success, and empty states, with confirmations for sensitive actions and localized Arabic and English messages.

## 10. Technical Architecture

### 10.1 Technology Stack

| Component | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Node.js + Express using TypeScript |
| Database | PostgreSQL |
| Authentication | Local email/password with JWT behind `IAuthProvider`; external provider not selected |
| API | Documented REST API |
| AI service | Replaceable provider adapter inside the API (Anthropic, off by default); no separate service yet |
| File storage | Local storage outside public web directories |
| Repository | GitHub Monorepo |
| Execution | Direct local setup on team computers |
| CI | GitHub Actions workflow added (`.github/workflows/ci.yml`); not yet run, and not yet a required check |

### 10.2 High-Level Architecture

```text
Browser (Arabic/English UI)
          |
          v
React + Vite + TypeScript
          |
          v
Node.js + Express
  |        |          |
  |        |          +----> AI Service (OCR / summaries / jobs)
  |        |
  |        +---------------> Protected local file storage
  |
  +------------------------> PostgreSQL
  |
  +------------------------> External authentication provider
```

Express must validate authentication, permissions, and tenant scope before reading data or passing inputs to the AI service. The frontend must never connect directly to the database or protected file storage.

### 10.3 Suggested Repository Structure

```text
naseej/
├── frontend/
├── backend/
├── ai-service/
├── database/
│   ├── migrations/
│   └── seeds/
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── database-erd.md
│   ├── api-spec.md
│   ├── test-plan.md
│   └── user-guide.md
├── .env.example
├── .gitignore
└── README.md
```

This structure is a starting point and may be refined. Secrets and real patient files must never be committed to GitHub.

As built there is no `ai-service/` folder; the AI adapter lives in `backend/src/services/ai`. Migrations are `001`, `002` and `003` in `database/migrations`, with rollbacks in `database/migrations/rollback`.

## 11. Initial Data Model

The following entities are a starting point for the ERD, not a final database design.

| Entity | Purpose |
|---|---|
| `organizations` | Medical centers and their status/settings |
| `users` | Internal user profiles mapped to authentication identities |
| `organization_memberships` | User-center membership, role, and status |
| `patient_profiles` | Patient identity and demographic information |
| `patient_center_links` | Patient relationships with centers |
| `patient_consents` | Consent scope, date, and status |
| `medical_records` | Health-record entries, source, and review status |
| `documents` | Document metadata and storage reference |
| `extracted_fields` | Extracted values, source location, and confidence when available |
| `appointments` | Patient, clinician, center, time, and status |
| `visits` | Visit notes and approval state |
| `prescriptions` | Prescriptions linked to visits |
| `prescription_items` | Medication, dosage, duration, and instructions |
| `lab_orders` | Laboratory requests |
| `lab_results` | Results, sources, and review status |
| `patient_messages` | Patient questions and requests |
| `symptom_reports` | Patient-reported symptoms |
| `notifications` | Notifications and read status |
| `audit_logs` | Security- and workflow-relevant events |
| `privacy_requests` | Privacy requests and their status |
| `ai_jobs` | Background job status and references to inputs/outputs |

### Database Design Rules

- Define consistent primary keys and explicit relationships.
- Use constraints to prevent orphaned records and relevant conflicts.
- Include tenant scope in protected queries and operations.
- Separate authentication identity from clinical content.
- Do not automatically share records when a new center relationship is created.
- Preserve a history of important clinical changes.
- Minimize sensitive content in technical logs.
- Define controlled workflows for duplicate-patient resolution and profile linking.

## 12. Initial API Outline

These routes are examples for coordinating frontend and backend work. Exact names and request/response contracts should be finalized in a separate API specification.

| Area | Example routes |
|---|---|
| Account | `GET /api/me`, `GET /api/me/permissions` |
| Centers | `GET /api/organizations`, `GET /api/organizations/:id` |
| Patients | `GET /api/patients`, `POST /api/patients`, `GET /api/patients/:id` |
| Appointments | `GET /api/appointments`, `POST /api/appointments`, `PATCH /api/appointments/:id` |
| Visits | `POST /api/visits`, `GET /api/visits/:id`, `POST /api/visits/:id/approve` |
| Prescriptions | `POST /api/prescriptions`, `POST /api/prescriptions/:id/approve` |
| Lab results | `POST /api/lab-orders`, `POST /api/lab-results`, `POST /api/lab-results/:id/approve` |
| Documents | `POST /api/documents`, `GET /api/documents/:id` |
| AI jobs | `POST /api/ai/ocr`, `POST /api/ai/summaries`, `GET /api/ai/jobs/:id` |
| Messages | `GET /api/messages`, `POST /api/messages` |
| Notifications | `GET /api/notifications`, `PATCH /api/notifications/:id/read` |
| Privacy | `POST /api/privacy-requests`, `GET /api/privacy-requests` |
| Audit | `GET /api/audit-logs`, subject to permissions |

Each protected route must document authentication, allowed roles, tenant scope, resource authorization, request/response formats, error codes, and audit behavior. Knowing or changing a resource identifier does not grant access.

## 13. Business Rules

1. Clinical drafts are not visible to patients before approval.
2. OCR-extracted clinical values are not automatically approved.
3. OCR or AI failure must not cause loss of the original document.
4. Linking a patient to a new center does not automatically share their record.
5. Cross-center sharing requires explicit, scoped consent.
6. Revoking consent blocks future access dependent on that consent, subject to retention obligations.
7. Platform administrators do not routinely access clinical content.
8. Only authorized users can approve visits, prescriptions, and results.
9. The system must not autonomously change diagnoses, dosages, or treatment plans.
10. Important edits, approvals, consents, and access events are logged.
11. Conflicting appointments must not be confirmed.
12. Every AI job has a clear status and bounded retry behavior.
13. AI job completion does not mean clinical approval.
14. Privacy requests require review and a recorded decision.
15. Synthetic data only is used in the university project.

## 14. Key Acceptance Criteria

### AC-01: Patient Registration
- An authorized user can create a patient profile.
- Missing required fields produce understandable validation errors.
- A user cannot improperly link their account to another person's profile.

### AC-02: Appointment Conflict Prevention
- A request for an available slot can be confirmed.
- The backend rejects an overlapping appointment for the same clinician.
- The user receives a clear error message.

### AC-03: Visit Approval
- An authorized clinician can create and edit a visit draft.
- The patient cannot view the draft.
- Only approved and permitted content becomes visible after approval.

### AC-04: Tenant Isolation
- Users can access authorized resources within their center.
- Requests for resources in another center are rejected, even when the identifier is known.
- Relevant sensitive attempts are logged according to policy.

### AC-05: OCR
- The original file remains available to authorized users.
- Extracted fields remain drafts until reviewed.
- Failure is reported clearly without losing the original file.

### AC-06: Cross-Center Sharing
- Access is denied before consent.
- Access is limited to the approved scope.
- Consent, access, and revocation are logged.

### AC-07: Laboratory Results
- Patients cannot view unapproved results.
- Approved results become visible according to permissions.
- Important changes are recorded.

### AC-08: AI Failure
- Original data remains intact.
- The job reaches `Failed` after configured retries are exhausted.
- Retrying does not unintentionally duplicate results.

## 15. Security and Privacy

### 15.1 Security Controls

- Validate identity, role, tenant, resource, and consent for each protected operation.
- Apply rate limiting to sensitive actions.
- Use CSRF protections or token-abuse protections appropriate to the authentication design.
- Enforce session expiration and correct logout behavior.
- Validate upload type, size, and content where possible.
- Store files outside public directories under random identifiers.
- Avoid logging secrets, tokens, or unnecessary medical details.
- Keep secrets out of GitHub and use environment variables.
- Restrict access to backups.
- Separate platform administration from clinical-content access.

### 15.2 Audit Logging

Record the minimum information required for review: actor, timestamp, action type, relevant resource, and outcome. Ordinary application interfaces must not allow audit-log editing or deletion. Strong tamper resistance requires additional storage controls; hiding a delete button alone is insufficient.

### 15.3 Privacy Requests

The system should accept access, correction, and deletion or anonymization requests where policy permits, record consent and revocation, and track review status. Retention and privacy policies must be reviewed for the applicable jurisdiction before any real-world use. This PRD does not claim proven legal compliance.

## 16. Testing Strategy

| Test type | Scope |
|---|---|
| Unit | Validation rules and visit/prescription/result state transitions |
| Integration | Express with PostgreSQL, file storage, and AI service |
| API | Request/response behavior and errors |
| Authorization | Each role against sensitive operations |
| Tenant isolation | Cross-center access and identifier manipulation |
| File upload | Unsupported types, oversized files, and bypass attempts |
| OCR | Clear, low-quality, and unreadable documents |
| AI failure | Service interruption, timeout, retries, and duplicate prevention |
| Recovery | Restore database/files and validate relationships |
| Localization | RTL/LTR, translations, and mixed-direction content |
| Usability | Core workflows, error messages, and empty states |
| End-to-end | Registration through visit, result, and follow-up |

### Pull Request Gate

- Create a feature branch for each task.
- Open a pull request with description and test evidence.
- Request another team member's review where possible.
- Run required CI tests.
- Block merging if required tests fail or mandatory review is incomplete. (CI runs on every pull request; the author also runs the tests locally first. The step-by-step team routine is in `docs/team-guide.md`.)
- Record defects and rerun relevant tests after fixes.

## 17. Delivery Timeline

### Month 1 — Foundation
- Finalize the PRD and MVP scope.
- Design the initial ERD and API contracts.
- Set up the GitHub monorepo, issues, and CI.
- Prepare local development and database migrations.
- Select the authentication provider.
- Implement roles and tenant isolation early.

### Month 2 — Website, Patients, and Appointments
- Build the public website, demo request, and contact form.
- Implement login and account management.
- Implement patient profiles.
- Implement schedules, appointments, and check-in.
- Prepare synthetic seed data and API tests.

### Month 3 — Clinical Workflow
- Build clinician workspace, visit drafts, and approval.
- Implement prescriptions and allergy visibility.
- Implement laboratory orders and results.
- Build patient questions and core portal.
- Implement basic notifications and audit logging.

### Month 4 — Advanced Features and Integration
- Implement secure document uploads.
- Build prototype OCR and summarization.
- Add background jobs and failure handling.
- Implement privacy requests and operational dashboards.
- Run security, isolation, and UI tests.

### Month 5 — Stabilization and Delivery
- Complete English localization and RTL/LTR testing.
- Fix defects and rerun tests.
- Test backup and recovery.
- Prepare the academic report, user guide, and presentation.
- Rehearse the demonstration on the presentation machine.

If only four months are available, reduce P2 features before compromising security or core workflows.

## 18. Team Organization and GitHub Workflow

### Workstreams

- **Frontend:** public website, internal interfaces, patient portal, RTL/LTR, and UI states.
- **Backend and Database:** REST API, PostgreSQL, permissions, tenant isolation, documents, and workflows.
- **AI:** OCR, document classification, experimental summarization, and background jobs.
- **All contributors:** documentation, testing, code review, academic report, and presentation.

Assign one primary owner to each task even when several contributors collaborate.

### Workflow

1. Create an issue with scope, acceptance criteria, owner, and priority.
2. Create a feature branch.
3. Implement and test the change.
4. Open a pull request linked to the issue.
5. Review the code and run CI.
6. Merge only when required conditions pass.
7. Update documentation and requirement traceability.

The practical commands and rules for this workflow are written for the team in `docs/team-guide.md`.

## 19. Local Setup and Demo Data

The README and `docs/team-guide.md` must include:
- Required tool versions.
- Node.js, PostgreSQL, and dependency installation.
- Database creation and migration instructions.
- An `.env.example` file without real secrets.
- Instructions to run the frontend, backend, and AI service when enabled.
- Test commands.
- Synthetic seed-data setup.
- Demo accounts for the five primary roles.
- Safe instructions for resetting demo data.
- Backup and restore instructions.

Synthetic data should form a coherent demonstration: a patient with appointments, visits, a prescription, a laboratory result, a document, and a follow-up question. No real patient information or production credentials may be used.

## 20. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Scope is too large | Lock P0 scope and reduce P2 features if time is limited |
| Few active contributors | Small tasks, clear owners, and explicit acceptance criteria |
| Cross-tenant data exposure | Early isolation tests for every sensitive API |
| OCR errors | Human review, original-file preservation, and manual entry fallback |
| Misleading summaries | Show sources and keep outputs as unapproved drafts |
| External service failure | Documented local or demo fallback |
| File loss | Back up files as well as the database and test restoration |
| Duplicate patient profiles | Appropriate identity verification and controlled linking |
| API contract conflicts | Agree on contracts early and update them collaboratively |
| Unsupported compliance claims | Document limitations and obtain specialist review before real use |

## 21. Academic Deliverables

1. Source code.
2. Database migrations and synthetic seed scripts.
3. README and local setup guide.
4. Final PRD and system requirements.
5. ERD and database design.
6. REST API documentation.
7. Architecture and workflow diagrams.
8. User guide for the five roles.
9. Test plan and actual test results.
10. Academic report covering problem, objectives, related work, analysis, design, implementation, testing, results, and limitations.
11. Presentation and demo scenario.
12. Team contribution log.
13. Requirement-to-test traceability matrix.
14. Risk and limitation register.
15. Future development roadmap.

## 22. Initial Requirement Traceability Matrix

| Requirement | Expected implementation | Test | Initial status |
|---|---|---|---|
| FR-022 Tenant isolation | Server-side tenant checks and scoped queries | Tenant isolation tests | Not started |
| FR-042 Appointment conflicts | Server validation and suitable database constraints | Appointment conflict tests | Not started |
| FR-057 OCR review | Separate review states | OCR approval tests | Not started |
| FR-066 Hide drafts | Authorization and approval-state checks | Patient visibility tests | Not started |
| FR-084 Result approval | Approval state before patient visibility | Result access tests | Not started |
| FR-142 Audit protection | Restricted audit write/read permissions | Audit integrity tests | Not started |
| FR-113 AI failure | Job states and bounded retries | AI failure tests | Not started |

Statuses must reflect actual implementation and testing. A requirement must not be marked complete before the relevant acceptance criteria have passed.

## 23. Assumptions and Limitations

- Naseej is an academic prototype, not a clinically approved system.
- Demo and test data are synthetic.
- The authentication provider has not been selected; the prototype uses local email and password behind a replaceable adapter.
- An AI provider adapter (Anthropic) exists but is off by default and has not been run against a live provider; no provider is selected for any real use.
- The target execution environment is local.
- Real healthcare use requires appropriate security, legal, operational, and clinical review.
- Performance and scalability must be measured rather than claimed without testing.
- AI outputs do not replace clinical judgment.

## 24. Future Roadmap

Potential post-graduation improvements include:
- Production hosting and stronger operational monitoring.
- Integration with laboratory and hospital information systems.
- Improved OCR accuracy and broader document support.
- Specialist evaluation of alerts and models before clinical use.
- More advanced consent-based record exchange.
- A mobile application or enhanced progressive web experience.
- Independent security and legal reviews.
- Broader operational analytics with privacy safeguards.

## 25. Immediate Next Steps

Original plan: before implementation begins, finalize three practical artifacts (the first two now exist as `docs/database-erd.md` and `docs/api-spec.md`):

1. **ERD:** define relationships between centers, users, patients, consents, visits, and clinical records.
2. **API Contract:** agree on request/response formats and authorization behavior between frontend and backend.
3. **GitHub Backlog:** split the PRD into epics and issues, each with an owner, priority, and acceptance criteria.

### Next steps from the current state

1. Apply migration 003 on a clean database, run the full backend test suite, and fix anything the new caregiver, messaging and AI tests reveal.
2. Exercise AI document reading once with a synthetic file and a real key, and record the result.
3. Decide the open policy questions: guardianship for minors and incapacitated adults, caregiver file downloads, maximum delegation length.
4. Choose and implement notifications (FR-120 to FR-123) and the privacy-request workflow (FR-143, FR-146), or formally move them out of scope.
5. Watch the first CI run, fix what it shows, then make the two CI jobs required checks on `main`.

> **Naseej's core principle:** Connecting information does not mean opening it to everyone. Every item must retain its source, context, and access boundaries, and final medical decisions remain the responsibility of the clinician.
