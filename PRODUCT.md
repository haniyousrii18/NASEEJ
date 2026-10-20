# PRODUCT.md

# Product: Naseej | نَسيج

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Frontend: React 18, Vite, TypeScript, plain CSS design tokens (responsive, bilingual Arabic RTL / English LTR)
- Backend: Node.js, Express, TypeScript / ES modules, pg (PostgreSQL driver)
- Database: PostgreSQL (SQL migrations 001-005, relational schema with foreign keys and tenant scoping)
- Testing: Vitest and Supertest for API, permission and isolation tests
- Optional AI: provider adapters inside the API (Google Gemini over HTTPS, Anthropic SDK), off unless configured

## Users

**The patient** is the only user with a workspace. They keep their own health record (profile, symptoms, documents), prepare for visits, use the optional assistant, and share a chosen summary with any clinician through a temporary QR link. A clinician opens that link read-only, with no account.

The earlier multi-center clinic platform (doctor, reception, center manager, care coordinator, platform admin and caregiver workspaces, inter-center consents, appointment and messaging flows) was removed. Its database tables remain from migrations 001-004 and are not used by the app.

## Product Purpose

Naseej is a patient-owned health history and visit-preparation app. It helps a patient organize their medical journey, explain symptoms clearly during a consultation, and securely share selected information with any doctor, clinic or hospital. It makes no diagnosis, treatment recommendation or autonomous clinical decision.

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
- **In-app notifications**: created on the server after the business operation, minimal content (event type and a date or time), recipients from roles and active delegations, typed destinations, one quick action (confirm an appointment). Periodic refresh, not real time. Not an emergency channel. See `docs/notifications.md`.
- **Account settings**: every role has a Settings page (profile, password, language and appearance; patients also edit contact and emergency details; caregivers see and can end their own access). The API acts on the signed-in account only.
- **Installable app**: a PWA with a versioned static cache; authenticated API responses are never cached. See `docs/pwa.md`.
- **Patient-owned record (migration 005)**: a center-independent health profile, symptom log, document vault, visit-summary preparation, temporary QR sharing and an optional text/voice assistant. See `docs/patient-record.md`.
- **Not implemented**: email and push notifications, privacy-request workflow, server-side voice transcription (browser dictation only), external identity provider, background job queue.

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
