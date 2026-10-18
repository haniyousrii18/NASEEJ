# PRODUCT.md

# Product: Naseej | نَسيج

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Frontend: React 18, Vite, TypeScript, plain CSS design tokens (responsive, bilingual Arabic RTL / English LTR)
- Backend: Node.js, Express, TypeScript / ES modules, pg (PostgreSQL driver)
- Database: PostgreSQL (SQL migrations 001-003, relational schema with foreign keys and tenant scoping)
- Testing: Vitest and Supertest for API, permission and isolation tests
- Optional AI: provider adapters inside the API (Google Gemini over HTTPS, Anthropic SDK), off unless configured

## Users

Roles with a workspace in the app:

1. **Patient**: owns a portable electronic medical file. Reads approved records with their source and review state, uploads documents, requests appointments, asks the care team questions, logs symptoms, shares between centers through scoped consent, and authorizes caregivers.
2. **Authorized Caregiver**: acts for a patient only through an explicit delegation the patient granted: view the approved record, manage appointment requests, message the care team. Each is a separate permission; the delegation expires and can be revoked at any time.
3. **Doctor / Clinician**: reviews authorized history, documents visits (drafts, then approval), prescribes with allergy visibility, orders and reviews labs, reviews patient-uploaded documents and any AI suggestions, answers patient questions.
4. **Reception Staff**: registers patients, schedules and confirms appointments, records arrival, messages clinicians about operations. No clinical content.
5. **Medical Center Manager**: runs one center: working hours, staff and roles, calendar and workload, reports, coordination oversight, activity log. Aggregates only; no individual clinical records.
6. **Naseej Platform Administrator**: oversees centers, accounts, demo requests and the audit log. Structurally barred from clinical content.
7. **Care Coordinator**: operational follow-up of cases, tasks and referrals between centers. Operational data only.

## Product Purpose

Naseej gives each patient a well-organized, portable electronic medical file that connects visits, documents, results and centers into one traceable timeline, and helps authorized clinicians review the relevant history quickly. The patient record is the center of the product; appointments and center operations support it. It enforces tenant isolation, role boundaries and human clinician sign-off: no clinical draft or unreviewed result reaches a patient, and no autonomous clinical decision is made by software or AI.

## Positioning

Unlike generic EHRs that isolate data inside one clinic, or networks that merge records indiscriminately, Naseej lets one patient identity span several centers while every record keeps its owning center and access policy. Cross-center access needs the patient's explicit, scoped, unexpired and revocable consent, and each such read is audited.

## Operating Context

- Outpatient clinics, clinical consultation, reception, center administration, and patients and their families at home.
- Academic prototype run locally on team and evaluator machines with 100% synthetic data.
- Dual-language: Arabic (primary, RTL) and English (LTR).

## Capabilities and Constraints

- **Strict tenant isolation**: every query is scoped by `organization_id`; knowing another center's ID never exposes its data.
- **Approval workflow**: visits, prescriptions and lab results are drafts until a clinician approves them.
- **Conflict prevention**: clinician slots are validated server-side to prevent double booking.
- **Audit trail**: sensitive access, status changes, approvals, delegations and AI review actions are logged. Message text and clinical values are not copied into the log.
- **Delegated access**: caregiver access exists only through an active, unexpired delegation with the specific permission, checked on the server for every request.
- **Operational messaging**: reception and clinicians exchange non-clinical coordination messages, stored and authorized server-side. It is not a clinical or urgent channel.
- **AI document reading (optional)**: when a provider is configured and the patient allowed it for that file, a document can be read (OCR, type suggestion, candidate facts with page and passage). Results are unreviewed suggestions that a clinician accepts, corrects or rejects; they never appear to patients or caregivers as verified. Not run against a live provider yet.
- **Synthetic data only**: real patient data is forbidden.
- **Autonomous decisions prohibited**: the system does not diagnose, prescribe or change treatment.
- **Not implemented**: notifications and email, privacy-request workflow, voice dictation, external identity provider, background job queue.

## Brand Commitments

- Name: **Naseej | نَسيج** (weave / fabric of connected healthcare).
- Logo: approved asset `logo.png`, interconnected medical nodes forming an "S" weave in a turquoise to fresh-green gradient. Do not redraw it.
- Visual language: calm clinical warmth. Warm ivory (light) and warm onyx (dark) with one orange action color, defined in `DESIGN.md`. The public site and the workspaces share it and differ only in density.

## Evidence on Hand

- `Naseej-PRD.md`: product requirements baseline with implementation status.
- `Naseej-Accounts-PRD.md`: workspace requirements with implementation status per role.
- `docs/workspaces.md`: what each workspace does and how delegation, messaging and AI work.
- `DESIGN.md`: the single design system.
- `logo.png`: approved brand asset.

## Product Principles

1. **Connecting is not exposing**: linking a patient to a center, or a person to a patient, grants nothing by itself.
2. **Clinician in the loop**: software drafts and suggests; clinicians keep responsibility for medical decisions.
3. **Traceability by default**: every clinical entry carries author, date, source and approval state.
4. **Honest states**: a missing record reads "not recorded", never "absent"; a feature that is off says so instead of simulating a result.
5. **Bilingual equity**: Arabic with full RTL support is the native experience, not an afterthought.
