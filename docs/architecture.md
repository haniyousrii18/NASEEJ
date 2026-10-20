# Architecture Decisions & System Design — Naseej | نَسيج

## 1. Architectural Overview

Naseej is designed as a modular multi-tenant healthcare information platform with clear separation of concerns:

- **Frontend**: Single Page Application built with React 18, Vite, and TypeScript. Implements responsive views, Arabic (RTL) / English (LTR) localization, role-based navigation, and accessible clinical UI components.
- **Backend API**: Node.js with Express, providing stateless RESTful APIs. Enforces authentication, role-based access control (RBAC), multi-tenant isolation, request validation, and tamper-resistant audit logging.
- **Database**: PostgreSQL with strict foreign keys, unique composite constraints for conflict prevention, and tenant scoping (`organization_id`).
- **Protected File Storage**: Local filesystem directory located outside public web roots (`storage/protected/`), referenced in the database with UUIDs and accessed exclusively through authenticated streaming endpoints.

```text
Browser Client (React + TypeScript) [RTL / LTR]
         |
         | HTTPS / REST JSON
         v
Node.js + Express API Gateway & Router
   ├── Auth Middleware (Pluggable JWT / Identity Provider Adapter)
   ├── Tenant & RBAC Authorization Middleware (Strict organization_id scope)
   ├── Clinical Service Controllers (Visits, Rx, Labs, Appointments)
   ├── Audit Logging Interceptor (Immutable event capture)
   v
PostgreSQL Database (Multi-tenant relational schema)
   + Protected File Store (Outside web root)
```

---

## 2. Key Architecture Decisions & Tradeoff Analysis

### 2.1 External Authentication Provider

**Context**: Section 7.2 of the PRD states that the external authentication provider is not yet selected, and asks the team to evaluate suitable options.

**Comparison of Options**:
1. **Third-party SaaS (Clerk / Auth0)**:
   - *Pros*: Rich hosted UI, turnkey MFA, OAuth2/OIDC standards.
   - *Cons*: Requires external cloud connectivity, API keys, potential quota limits, and complicates offline or local academic evaluations by evaluators/professors.
2. **Supabase Auth / GoTrue**:
   - *Pros*: Integrates directly with PostgreSQL, open-source.
   - *Cons*: Additional Docker or Go binary dependencies; not lightweight for direct Node local setup.
3. **Pluggable Architecture with Local Provider Adapter (Selected)**:
   - *Design*: Naseej implements an abstract `IAuthProvider` interface with a concrete `LocalAuthProvider` (standard HMAC-SHA256 JWT tokens, bcrypt password hashing, session revocation tracking) and extension hooks for `ClerkAuthProvider` / `Auth0AuthProvider`.
   - *Decision Rationale*:
     - Zero external network dependencies or API keys needed to run or evaluate locally.
     - 100% reproducible for academic defense and automated integration tests.
     - Clean separation: swapping the adapter to Clerk or Auth0 in the future requires changing only one adapter file without touching clinical services or controllers.

### 2.2 Patient Identity & Relationships Across Multiple Centers

**Context**: Patients may visit multiple distinct medical centers (e.g., Dental Center, General Hospital).

**Architecture Decision**:
- `patient_profiles` acts as the master demographic identity (Full Name, National ID/Civil ID, DOB, Gender, Phone, Emergency Contact).
- `patient_center_links` represents the affiliation between a patient and an organization (Center), holding a center-specific Medical Record Number (`mrn`), registration date, and link status.
- **Conservative Isolation Rule**: Linking a patient to Center B does **not** grant Center B clinicians access to medical records created at Center A. Each center only sees visits, prescriptions, and lab orders created under its own `organization_id`.

### 2.3 Ownership of Clinical Records & Cross-Center Consent

**Context**: Who owns medical records and how are they shared?

**Architecture Decision**:
- Every clinical record (`visits`, `prescriptions`, `lab_orders`, `lab_results`, `documents`) is strictly owned by the creating center (`organization_id`).
- Cross-center record access requires an explicit row in `patient_consents`:
  - `patient_id`: Subject patient.
  - `from_organization_id`: Center holding the source records.
  - `to_organization_id`: Requesting center.
  - `scope`: Granular scope (`all`, `visits`, `labs`).
  - `status`: `active`, `revoked`, `expired`.
  - `expires_at`: Enforced time limit.
- **P0 Conservative Baseline**: In P0, cross-center sharing is blocked by default; queries filter strictly by `organization_id = req.user.current_organization_id`. The database schema contains the consent structure as a first-class foundation for P1 extension.

### 2.4 Server-Side Tenant Isolation Strategy

**Context**: PRD Section 7.3 & AC-04 require that manually manipulating resource IDs (e.g., requesting `GET /api/visits/visit-123` belonging to Center 2 from Center 1) MUST be rejected.

**Implementation Enforcement**:
1. Every query accessing tenant data includes `WHERE organization_id = $tenant_id` at the database level.
2. Generic ID lookups are verified against the active session's `organization_id`.
3. If an entity exists but belongs to another tenant, the API returns `404 Not Found` or `403 Forbidden` and writes an audit log entry for unauthorized cross-tenant access attempts.
4. Platform Administrators have access to center management and system health, but are structurally prohibited from viewing clinical record contents.

### 2.5 Clinical Approval Lifecycle & Patient Portal Visibility

**Context**: Patients must NEVER see unapproved drafts or unverified lab results (PRD Sections 7.7, 7.9, 13).

**Workflow**:
1. **Visits**: Created in `status = 'draft'`. Only the authoring clinician can edit. Clinician performs explicit sign-off -> `status = 'approved'`.
2. **Prescriptions**: Created in `status = 'draft'`. Clinician checks displayed allergies -> signs off -> `status = 'approved'`.
3. **Lab Results**: Entered in `status = 'draft'` or `'pending_review'`. Clinician reviews -> signs off -> `status = 'approved'`.
4. **Patient Portal Filter**: All patient portal queries strictly enforce:
   `WHERE patient_id = $patient_id AND status = 'approved'`.

---

## 3. Scope Boundaries: P0 vs Deferred Features

### P0 Scope (Fully Implemented in Current Release)
- Local authentication provider with role mapping and token revocation.
- Tenant management: medical centers, user memberships, and role assignments.
- Patient management: master profiles, center links, and MRN assignment.
- Clinician scheduling: slot generation, appointment booking, arrival check-in, and server-side conflict detection.
- Clinical visits: drafting (SOAP format), clinical notes, and approval sign-off.
- Prescriptions: items, dosage, duration, allergy display check, and approval.
- Laboratory orders & results: order creation, result recording, and approval states.
- Patient Portal: approved records view, appointment requests, patient messaging/questions, and symptom logs.
- Audit Logging: tamper-resistant tracking of all security and clinical actions.
- Public Website: responsive bilingual (Arabic/English) landing, features, workflows, and demo request.
- Test Suite: unit, integration, authorization, and cross-tenant isolation tests.

### Deferred P1/P2 Features (Documented Extension Points)
- **AI document analysis (migration 003, optional)**: a provider adapter (`backend/src/services/ai`) reads an uploaded PDF/PNG/JPEG (OCR, type suggestion, candidate facts with page and passage) and stores the result as *unreviewed suggestions* that a clinician accepts, corrects or rejects. It is implemented against the Anthropic Messages API but is **off until `AI_PROVIDER` and `ANTHROPIC_API_KEY` are set**; with no key, uploads simply wait for manual clinician review. See `docs/workspaces.md`. Autonomous diagnosis stays prohibited and no AI output is shown to patients as verified.
- **Caregiver delegation (migration 003)**: implemented with server-side scope checks (`caregiverRoutes.ts`). The earlier PRD baseline listed it as out of scope; the implemented boundary is documented in `docs/workspaces.md`.
- **In-app notifications (migration 004)**: implemented (`notificationService.ts`, `notificationRoutes.ts`). Created on the server after the business operation, with minimal content and typed destinations; no queue (a notification is written right after the commit and a failure is logged, not fatal), so a crash between the two could lose one. Periodic refresh in the client, no email or push. See `docs/notifications.md`.
- **Installable app (PWA)**: implemented with `vite-plugin-pwa`; static assets are precached, `/api/*` is network-only. See `docs/pwa.md`.
- **External HIS/HL7 Integration (P2)**: Enterprise hospital interfaces.
- **Distributed Job Queue (P1)**: Heavy background queues (BullMQ/Redis); prototype processes operations reliably within the backend service.

## 4. Authenticated Application (role workspaces)

The signed-in app lives in `frontend/src/app` with its own shell, hash router (`#/doctor/patient/<id>/timeline`), API layer, translations (`app/i18n`, Arabic typed against English) and namespaced styles (`styles/app.css`, `.na-*`). It is mounted from `App.tsx` for authenticated views only; the public Landing and Login pages, their components, styles and assets are not part of it.

- **Provenance:** every timeline entry carries center, author, provenance (clinician-authored, patient-reported/uploaded, imported, system) and review state. Missing data is shown as "not recorded", never as a negative finding. No summaries, scores or interpretations are generated.
- **Comparison of results** groups by test and parameter and is marked comparable only when units match and values are numeric.
- **Care coordination** is a separate operational domain (`care_cases/tasks/referrals/followup_log`). Referral statuses are requested/sent/receipt_confirmed/cancelled; none means clinical completion.
- **Known limitations:** no service catalogue or rooms/equipment (Services are derived from doctor specialties); no "patients needing follow-up" concept; document upload uses base64 JSON; allergies stay patient-level; the demo-account list on the Login page does not include a coordinator (the page is protected); the auth token and user profile persist in `localStorage` via the existing `AuthContext`.
- **Account and settings:** `routes/accountRoutes.ts` (`/api/account`) plus one Settings page per role in `app/pages/settings.tsx`. Preferences that only affect presentation (language, workspace theme) stay on the device.
- **Notifications in the client:** `app/notifications` (context with periodic refresh, bell, inbox, and the single typed destination map in `model.ts`). The shell wraps itself in `NotificationsProvider`.

## 5. Patient-owned record layer (migration 005)

A patient-centred layer sits beside the center model: health entries, vault documents without a center, visit summaries, temporary QR shares and an AI assistant with a provider-agnostic boundary (`services/ai/chat.ts`). Design, rules and limits are in `docs/patient-record.md`.
