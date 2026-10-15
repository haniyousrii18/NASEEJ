# Product: Naseej | نَسيج

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Frontend: React 18, Vite, TypeScript, Vanilla CSS design tokens (responsive, bilingual Arabic RTL / English LTR)
- Backend: Node.js, Express, TypeScript / ES modules, pg (PostgreSQL driver)
- Database: PostgreSQL (native migrations, relational schema with foreign key constraints and tenant isolation)
- Testing: Vitest / Supertest for API, permission, and isolation tests

## Users

1. **Naseej Platform Administrator**: Oversees medical center accounts, platform settings, technical logs, and system health. Has NO routine access to clinical record contents.
2. **Medical Center Manager**: Manages center staff accounts, clinician schedules, operational metrics, and appointment policies within their single center tenant.
3. **Doctor / Clinician**: Reviews authorized patient history, documents clinical visits (drafts/approved), prescribes medications with allergy checks, orders and reviews lab results.
4. **Reception Staff**: Registers patients, schedules appointments, manages check-in / arrival states; strictly barred from clinical details.
5. **Patient**: Views approved medical records, prescriptions, and lab results; requests appointments, logs symptoms, submits questions to care teams.
6. **Authorized Caregiver (Optional)**: Acts on behalf of a patient under explicit, delegated consent scope.

## Product Purpose

Naseej connects fragmented patient health information across visits, documents, and medical centers into a longitudinal, traceable record. It enforces tenant isolation, role-based boundaries, and human clinician sign-off, ensuring no clinical draft or unreviewed result is exposed to patients, and no autonomous clinical decision is made by software or AI.

## Positioning

Unlike generic EHRs that isolate data within a single clinic or monolithic enterprise networks that indiscriminately merge records, Naseej provides a multi-tenant platform where a single patient identity connects to multiple centers, yet clinical records remain strictly isolated per medical center with explicit, logged consent required for any cross-center sharing.

## Operating Context

- Clinical consultations, outpatient clinic reception, medical center administration.
- Academic prototype running locally on evaluator workstations using 100% synthetic data.
- Dual-language environment: Arabic (primary, RTL) and English (secondary, LTR).

## Capabilities and Constraints

- **Strict Tenant Isolation**: All queries must enforce `organization_id` boundaries. Knowing another center's ID must never expose its data.
- **Approval Workflow**: Clinical visits, prescriptions, and lab results start as drafts and are only visible to patients after explicit clinician approval.
- **Conflict Prevention**: Clinician appointment slots are validated server-side to prevent double-booking.
- **Audit Trails**: Every sensitive access, status change, and approval is recorded in an immutable audit log.
- **Synthetic Data Only**: Real patient data is strictly forbidden.
- **Autonomous Decisions Prohibited**: System does not autonomously diagnose or prescribe.

## Brand Commitments

- Name: **Naseej | نَسيج** (Weave / Fabric of Connected Healthcare)
- Logo: Approved asset `logo.png` featuring interconnected medical nodes forming an "S" weave in turquoise to fresh green gradient.
- Visual Language: Calm, human-centered luxury dark canvas (`#0e100f`, `#191919`, `#fffce1`) adapted from `DESIGN.md` with Naseej turquoise accents (`#00A896`, `#02C39A`).

## Evidence on Hand

- `Naseej-PRD.md` — comprehensive requirements baseline.
- `logo.png` — approved brand asset.
- `DESIGN.md` — design language reference adapted for healthcare.

## Product Principles

1. **Connecting is not Exposing**: Linking a patient to a center does not automatically grant access to previous or external records.
2. **Clinician in the Loop**: Software provides draft documentation; clinicians retain full responsibility and authority for medical decisions.
3. **Traceability by Default**: Every clinical entry tracks author, date, source, and approval state.
4. **Bilingual Equity**: Arabic is the native primary experience with full RTL support, not a secondary afterthought.
