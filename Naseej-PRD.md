# Naseej | نَسيج — Product Requirements (patient-first)

Status legend: **Done** implemented and tested; **Code** implemented, needs an external service or clinical review to use for real; **Future** not implemented.
The earlier multi-center clinic platform was removed; see `PRODUCT.md`.

## 1. Purpose
A patient-owned health history and visit-preparation app. The patient records and organizes their information, prepares a summary for a consultation, and shares selected information through a temporary, revocable, read-only QR link. It does not diagnose, prescribe, or change medication instructions.

## 2. Users
- **Patient** (the only signed-in role): owns the record.
- **Clinician** (no account): opens a patient's share link read-only on a phone.

## 3. Functional requirements

| ID | Requirement | Status |
|---|---|---|
| FR-01 | Patient manages conditions, medications, allergies, procedures, measurements and visits, each with date, source (patient / assistant / document / clinician) and review state | Done |
| FR-02 | Patient records symptoms (description, start, duration, frequency, severity, better/worse factors, notes, related documents); edit, delete with undo | Done |
| FR-03 | One chronological timeline of symptoms, visits, documents and clinician-approved records, with filters and paging | Done |
| FR-04 | Document vault: PDF/PNG/JPEG upload or photo capture, type, date, provider, search, filters, links, original always retrievable, trash and restore, clear processing/failure/retry states | Done |
| FR-05 | AI-read document facts are suggestions; only the patient's confirmation turns one into a record entry | Code |
| FR-06 | Visit summary built from the record by code, every item sourced, editable, sections removable, documents selectable, approval required before sharing | Done |
| FR-07 | Assistant answers about the patient's record with citations or says it is not recorded; drafts symptoms one question at a time; navigates the app; never writes without the patient's confirmation | Code |
| FR-08 | Voice input with an editable transcript and a check of numbers/dates before saving; text always available | Done (browser support) |
| FR-09 | Emergency wording and requests for diagnosis/treatment get fixed answers before any model is called | Done (wording needs clinical review) |
| FR-10 | QR share: patient picks summary and documents, sees a preview, sets an expiry, confirms; token shown once; revoke at any time; access history | Done |
| FR-11 | Clinician page: read-only, mobile-friendly, only approved content, expired/revoked/invalid states, printable | Done |
| FR-12 | Settings: profile, contact, password, language/theme, assistant switch; in-app notifications; installable PWA | Done |
| FR-13 | Email/push notifications, server-side transcription, clinician accounts, FHIR export | Future |

## 4. Non-functional requirements
- **Security:** every query is scoped by the session's patient profile; foreign ids answer 404; tokens are 256-bit and stored only as a SHA-256; public share endpoints are rate limited, `no-store`, `no-referrer`.
- **Privacy:** data minimization (assistant conversation text is not stored; AI interactions keep metadata only; expired shares are scrubbed after a day); no health data in browser storage by the new screens; audit entries carry ids, never content.
- **AI safety:** rules enforced on the server; the assistant has no write tools; citations validated; unsafe output replaced by a fixed refusal.
- **Usability:** Arabic RTL first, English LTR, mobile first, keyboard operable, visible focus, state never by color alone.
- **Honesty:** a feature that is off says so; nothing is simulated.

## 5. Out of scope
Diagnosis, triage beyond a fixed emergency message, treatment or dosage advice, clinic/hospital management portals, regulatory compliance claims.

## 6. Evidence
`docs/patient-record.md` (design and limits), `docs/test-plan.md` (tests), `backend/tests/`.
