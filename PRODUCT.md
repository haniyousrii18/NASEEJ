# PRODUCT.md

# Product: Naseej | نَسيج

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Frontend: React 19, Vite 8, TypeScript, plain CSS design tokens (responsive, bilingual Arabic RTL / English LTR), installable PWA
- Backend: Node.js, Express 5, TypeScript / ES modules, pg (PostgreSQL driver)
- Database: PostgreSQL (SQL migrations 001-005 with rollbacks)
- Testing: Vitest and Supertest (API, ownership and share tests against a real database), Vitest unit tests
- Optional AI: provider-agnostic boundary in the API (Google Gemini over HTTPS, Anthropic SDK), off unless configured

## Users

**The patient** is the only signed-in user. They keep their own health record (profile, symptoms, documents), prepare for visits, optionally use the assistant, and share a chosen summary with any clinician through a temporary QR link.

**The clinician** has no account. They open the patient's link read-only on a phone and see only what the patient approved.

The earlier multi-center clinic platform (doctor, reception, center manager, care coordinator, platform admin and caregiver workspaces, inter-center consents, appointment and messaging flows) was removed. Its tables from migrations 001-004 remain in the schema but are unused.

## Product Purpose

Naseej is a patient-owned health history and visit-preparation app. It helps a patient organize their medical journey, explain symptoms clearly during a consultation, and securely share selected information with any doctor, clinic or hospital. It makes no diagnosis, treatment recommendation or autonomous clinical decision.

## Positioning

Unlike clinic EHRs that keep a patient's information inside one provider, Naseej puts the record with the patient. Sharing is an explicit act: choose the content, preview it, set an expiry, confirm, and revoke whenever you like.

## Operating Context

- Patients at home on a phone; clinicians glancing at a shared summary during a consultation.
- Academic prototype run locally on team and evaluator machines with 100% synthetic data.
- Dual-language: Arabic (primary, RTL) and English (LTR).

## Capabilities and Constraints

- **Patient-owned record:** conditions, medications, allergies, procedures, measurements, visits, symptoms, documents; each fact keeps date, source and review state.
- **Document vault:** PDF/image upload or capture, search, links, original always available, trash with restore.
- **AI document reading (optional):** results are unconfirmed suggestions with page and passage; only the patient's confirmation makes one a record entry. Off until a provider key is set; never run against a live provider yet.
- **Visit summary:** built from the record by code, every item sourced, editable, approved by the patient before it can be shared.
- **Assistant (optional):** answers from the patient's own record with validated citations, drafts symptoms for the patient to review, navigates the app. No write tools, no diagnosis, no treatment or dose advice; emergency wording and advice requests get fixed answers before any model is called. Needs a provider key and the patient's own switch.
- **Voice:** browser speech recognition into an editable field, with a check of numbers and dates before saving.
- **QR sharing:** hashed 256-bit token shown once, frozen snapshot, expiry, instant revoke, access history, read-only no-account page, printable.
- **Audit and privacy:** ids and kinds only in the audit log; assistant conversation text is not stored; expired shares are scrubbed after a day.
- **Account settings, in-app notifications, installable PWA** (`docs/notifications.md`, `docs/pwa.md`).
- **Accounts:** sign-up with an email and a password, a confirmation link, "forgot password" with a one-hour reset link, and sign-out of other devices after a reset (`docs/accounts.md`). It needs an SMTP server to send real email; without one, development prints the links in the API console and production says email is not configured.
- **Not implemented:** push notifications, email for anything but account access, server-side transcription, clinician accounts, FHIR import/export, external identity provider, clinical review of the safety wording, regulatory compliance claims.
- **Synthetic data only:** real patient data is forbidden. Email sign-up stores real email addresses and names, which are personal data: before real people use it, the project needs a privacy notice, a deletion path and a review of what the server logs.

Design and rules: `docs/patient-record.md`.

## Brand Commitments

- Name: **Naseej | نَسيج** (weave / fabric).
- Logo: approved asset `logo.png`. Do not redraw it.
- Visual language: calm clinical teal. A pale mist canvas (light) and deep slate (dark) with one teal brand and action color, defined in `DESIGN.md`.

## Evidence on Hand

- `docs/patient-record.md`, `Naseej-PRD.md`, `docs/test-plan.md`, `DESIGN.md`, `logo.png`.

## Product Principles

1. **The patient decides.** Nothing is saved or shared without their confirmation.
2. **Suggestions are not facts.** AI readings and drafts stay visibly unconfirmed until the patient confirms.
3. **Traceability by default.** Every item shows where it came from.
4. **Honest states.** A missing record reads "not recorded", never "absent"; a feature that is off says so instead of simulating a result.
5. **Not a doctor.** The product organizes and informs; it never diagnoses, prescribes or changes a dose.
6. **Bilingual equity.** Arabic with full RTL support is the native experience.
