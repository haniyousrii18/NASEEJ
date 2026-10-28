# Naseej | نَسيج — Product Requirements Document

**Product:** a patient-owned health history and visit-preparation app.
**Version:** 2.1 (patient-first). Supersedes the 1.x PRD of the multi-center clinic platform, which was removed (see section 12). A formal requirements specification with acceptance criteria and traceability is in `docs/requirements/Naseej-Requirements.pdf`.
**Status legend:** **Done** implemented and covered by tests · **Code** implemented, but needs an external service (AI provider) or clinical review before real use · **Future** not implemented.

---

## 1. Purpose and vision
Help a patient organize their medical journey, explain their symptoms clearly in a consultation, and securely share selected information with any doctor, clinic or hospital. Naseej organizes and informs; it is not a doctor and never diagnoses, prescribes treatment, or changes a dose.

Core loop: **record → organize (timeline) → prepare (assistant, summary) → review and approve → share by temporary QR → clinician reads read-only.**

## 2. Users
| User | Account | Needs |
|---|---|---|
| **Patient** (primary) | yes, the only signed-in role | keep history, symptoms, medications, documents; find things; prepare for a visit; decide exactly what is shared |
| **Clinician** | no | open a patient's link on a phone and quickly read a concise, sourced summary |

Patients are assumed to have varying digital and health literacy, so the interface uses short, calm language, large touch targets and Arabic-first layout.

## 3. Goals and non-goals
**Goals**
- G1 A general-purpose record for common conditions (no disease-specific workflows).
- G2 Every fact keeps its date, source and review state; machine readings never silently become facts.
- G3 The patient is in control: nothing is saved by AI or shared without explicit confirmation.
- G4 Sharing is temporary, revocable, read-only and needs no account for the clinician.
- G5 Honest behavior: a feature that is off says so; nothing is simulated.

**Non-goals:** diagnosis; triage beyond a fixed emergency message; treatment or dosage advice; clinic/hospital management portals; clinician accounts; regulatory compliance claims.

## 4. Main user journeys
1. **Record a symptom** (form, dictation, or the assistant's one-question-at-a-time flow) → review → save → appears on the timeline; correct or delete with undo.
2. **Add a document** (PDF/photo) → title, type, date, provider → optional AI reading → confirm or dismiss each suggestion → confirmed items join the profile with source "document".
3. **Prepare for a visit** → choose date or none → draft built from the record → edit, remove, add questions, pick documents → preview → approve.
4. **Share** → choose approved summary and documents → duration, identity on/off → preview → confirm → QR shown once → clinician scans and reads → patient revokes or it expires → access history.
5. **Ask the assistant** → question about the record → answer with sources or "not recorded"; symptom drafts and navigation requests require the patient's own confirmation.

## 5. Functional requirements
Each requirement lists its acceptance criterion and the evidence (tests in `backend/tests/` unless noted).

| ID | Requirement | Acceptance criterion | Status |
|---|---|---|---|
| FR-01 | Health profile: conditions, medications, allergies, procedures, measurements, visits | create, correct, delete, restore; each item shows date, source (patient / assistant / document / clinician) and review state; invalid kind/date/field rejected | Done |
| FR-02 | Symptoms | description, start, duration, frequency, severity, better/worse factors, notes, related documents; future start date and severity outside 1-10 rejected; delete with undo | Done |
| FR-03 | Timeline | symptoms, patient-recorded visits, documents and clinician-approved records in date order with type, center and date filters and cursor paging; deleted items hidden | Done |
| FR-04 | Document vault | upload PDF/PNG/JPEG up to 4 MB (type checked from the bytes), photo capture with downscaling, type/date/provider, search and filters, links, original always retrievable, trash and restore, visible processing / failed / retry states; vault documents invisible to any center | Done |
| FR-05 | AI-read suggestions | readings appear as unconfirmed suggestions with page and passage; an entry is created only on the patient's confirm; each can be confirmed or dismissed once; reading starts only after per-file confirmation | Code |
| FR-06 | Visit summary | draft built by code from the record, every item carries a source reference verified as the patient's; editable; sections removable; documents selectable; approval requires explicit confirmation; editing an approved summary returns it to draft | Done |
| FR-07 | Optional overview wording | a model may propose an overview that restates only listed items; shown for accept/discard; rejected if it cites nothing or is unsafe | Code |
| FR-08 | Assistant | answers about the record cite valid sources or say it is not recorded; a made-up source cannot reach the patient; drafts one symptom question at a time; navigates the app; never writes to the record | Code |
| FR-09 | Voice | dictation fills an editable field; numbers/dates/doses are shown for the patient to check before saving; typing is always a full alternative | Done (browser support) |
| FR-10 | Safety flow | emergency wording and requests for diagnosis/treatment/dose changes get fixed answers before any model call; replies that advise or diagnose are replaced by a fixed refusal; the check also runs on symptom form text | Done (wording needs clinical review) |
| FR-11 | QR share creation | requires an approved summary and explicit confirmation; patient picks documents, identity on/off, duration (1 hour to `SHARE_MAX_HOURS`); preview equals what the clinician sees; token shown once | Done |
| FR-12 | Clinician page | read-only; shows only approved content; states for invalid, expired, revoked, offline, rate-limited; documents open only if granted; printable | Done |
| FR-13 | Revocation and expiry | take effect on the next request; deleting a document removes it from shares at once; the frozen copy is erased a day after the link ends | Done |
| FR-14 | Access history | each view, document open and denied attempt recorded with time and device class; no addresses or content shown | Done |
| FR-15 | Account | sign-up with email and password (at least 8 characters, a letter and a number), email confirmation link (24 hours, single use), forgot-password link (1 hour, single use) that signs out other devices, no account enumeration; profile, contact, password change, language and theme, assistant switch | Done (real email needs an SMTP server) |
| FR-16 | Notifications and PWA | in-app notifications with typed destinations; installable app; `/api` never cached | Done |
| FR-17 | Translation of typed text | typed text is shown in the page language by a local glossary and local machine translation (no AI); numbers must survive; the original is always one click away; the clinician page translates only wording inside the share | Done |
| FR-18 | Email/push reminders, server-side transcription, FHIR import/export, clinician accounts, external identity provider, account-deletion path | not provided | Future |

## 6. Non-functional requirements
| ID | Requirement | Evidence |
|---|---|---|
| NFR-01 Ownership | every private query is filtered by the session's patient profile; foreign ids → 404; other roles → 403 | `patient-owned-record.test.ts` |
| NFR-02 Share security | 256-bit random token stored only as SHA-256; public endpoints rate limited (60/min per address, 10 unknown tokens per 10 min), `no-store`, `no-referrer`, `noindex`; token in the URL fragment | tests, `docs/features/patient-record.md` |
| NFR-03 Privacy | assistant text not stored; AI interactions keep metadata only; audit entries carry ids and kinds, never content; no health data in browser storage by the patient screens; data minimization of the assistant context (no name, ID or contact) | tests (audit, interactions) |
| NFR-04 AI safety | rules enforced on the server; assistant has no tools; citations validated; consent switch and per-file confirmation | `health-units.test.ts` |
| NFR-05 Reliability | AI timeout (`AI_CHAT_TIMEOUT_MS`), per-hour limit (`ASSISTANT_MAX_PER_HOUR`), clear error states with retry | tests, manual plan |
| NFR-06 Usability | Arabic RTL first and English LTR, mobile first (no horizontal overflow at 375 px), visible focus, state never by color alone, short forms | `frontend/tests/i18n.test.ts`, manual plan |
| NFR-07 Portability | provider-agnostic AI behind environment variables; additive reversible migrations | CI database job |

## 7. Data model (summary)
`health_entries`, `symptom_reports`, `documents` (+ `document_links`, `document_facts`), `visit_preps`, `record_shares` (+ `share_documents`, `share_access_events`), `ai_interactions`, `patient_profiles.ai_assistant_consent_at`. Also `content_translations`, `auth_tokens`, `users.email_verified_at`. Details: `docs/reference/database-erd.md`.

## 8. AI and safety requirements
- The assistant is an organizational and informational aid, not a doctor.
- It must not diagnose, prescribe, recommend medication changes or change a dose, and must not infer missing facts.
- Record answers are grounded in the record and cite sources; otherwise it says "not recorded".
- AI never modifies the record; any write, QR creation or sharing needs the patient's explicit confirmation.
- Emergency guidance is a fixed message pointing to emergency services; it is not triage and not a diagnosis. **The wording has not been clinically reviewed and must be before real use.**
- Instructions, safety rules and permissions live on the server, not in the browser.

## 9. Release scope
**MVP (implemented):** everything marked Done or Code in section 5.
**Next:** run and tune a live provider on synthetic data; clinical review of safety text; a usability study; server-side transcription; encryption at rest and a purge job for trash; email/push reminders; FHIR import/export; a shared rate-limit store.

## 10. Success measures (to be run by the team)
Task success and time for the five journeys in a usability test (e.g. SUS questionnaire); share of assistant answers with a valid source on a prepared question set; zero unsafe replies on a prepared safety set (diagnosis, treatment, dose, emergency); all automated tests green in CI. Thresholds are [To be agreed with the supervisor].

## 11. Assumptions and constraints
Synthetic data only; prototype hosting; browser dictation depends on the browser; AI is optional and may be unavailable; the app makes no regulatory compliance claim.

## 12. Change history
- **1.x** a multi-tenant clinic platform with doctor, reception, manager, coordinator, admin and caregiver workspaces, cross-center consent and clinician approval workflows. Removed when the concept changed; available in Git history; its tables remain unused in the schema.
- **2.0** patient-first scope.
- **2.1** adds email sign-up, confirmation and password reset (migration 007), translation of typed text (migration 006), and the requirements specification PDF.
