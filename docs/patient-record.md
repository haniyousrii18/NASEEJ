# Patient-owned record, visit preparation, assistant and QR sharing

Migration `005_patient_owned_record.sql` (rollback `rollback/005_down.sql`) adds a patient-centred layer beside the center-based clinical model. Nothing existing was removed or renamed.

## What it adds

| Area | Tables | API (all `Authorization: Bearer`, patient only unless noted) |
|---|---|---|
| Health profile | `health_entries` (condition, medication, allergy, procedure, measurement, visit; `source` + `review_status`) | `/api/record/entries` (GET, POST, PATCH `/:id`, DELETE `/:id`, POST `/:id/restore`) |
| Symptoms | `symptom_reports` (+ duration, frequency, better/worse, soft delete) | `/api/record/symptoms` (same verbs), `/api/portal/timeline` (now includes `patient_entry`) |
| Document vault | `documents` (center now optional, `doc_type`, `provider_name`, soft delete), `document_links`, `document_facts.patient_decision` | `/api/vault/documents` (list/filter, upload, PATCH, DELETE, restore, `/analyze`, `/suggestions`, confirm/dismiss); original file: `/api/documents/:id/download` |
| Visit summary | `visit_preps` | `/api/prep` (create from record, PUT edit, `/approve`, DELETE) |
| QR sharing | `record_shares`, `share_documents`, `share_access_events` | patient: `/api/shares` (create, list, `/:id/revoke`, `/:id/events`); clinician, **no account**: `POST /api/share-view/view`, `POST /api/share-view/document` |
| Assistant | `ai_interactions` (metadata only), `patient_profiles.ai_assistant_consent_at` | `/api/assistant/status`, `/consent`, `/chat`, `/overview`, `/safety`; plain search: `/api/record/search` |

Frontend: `frontend/src/app/health/*` (Today, Profile, Symptoms, Vault, Visits, PrepEditor, Assistant, Sharing, Privacy), strings in `app/i18n/health.ts`, styles `styles/health.css` (`hp-` prefix) and `styles/share.css`, the clinician page `pages/ShareView.tsx` at `/#/share/<token>`.

## Rules the server enforces

- **Ownership:** every query filters by the session's `patientProfileId`; a foreign id is `404`, never `403`. Clinicians and other roles get `403 PATIENT_PROFILE_REQUIRED`. A vault document has no center, so no clinician can see it.
- **No silent writes by AI.** The assistant has no tools and cannot write. It returns a reply object that the server validates; a symptom it proposes is a *draft* the patient reviews and saves through the normal endpoint (`captured_via: assistant`). Document readings stay suggestions (`document_facts`) until the patient presses confirm (`source: document`).
- **Grounding:** the model sees the record as aliased lines (R1…Rn), never ids. Citations not in that list are dropped; an "answer" with no valid citation becomes "not found". Output that advises, diagnoses or changes a dose is replaced by a fixed refusal.
- **Safety flow:** emergency wording and requests for diagnosis/treatment are answered with fixed text *before* any model call (`services/health/safety.ts`), also for symptom forms via `/api/assistant/safety`. **The wording and keyword lists are engineering defaults and have not been clinically reviewed; a clinician must approve them before real use.**
- **Consent for AI:** nothing is sent to a provider until the patient switches the assistant on (`/consent`) and, for document reading, confirms per file. Only a short text summary is sent (no name, national ID, contact details). Conversation text is held in the browser's memory only.
- **Shares:** token = 256 random bits shown once in the QR (`/#/share/<token>`; the fragment is never sent to a server). Only its SHA-256 is stored. The share holds a frozen copy of what the patient approved; expired or revoked shares answer `410` and the copy is erased a day later (`scrubDeadShares`). Public endpoints are rate limited (60/min per address, 10 unknown-token attempts per 10 min), `no-store`, `no-referrer`, `noindex`. Access events keep device class and a keyed, truncated address hash.
- **Audit:** create/update/delete/restore, approvals, AI consent, share create/revoke are logged with ids and kinds only.

## Demo data

`npm --prefix backend run seed` empties every table and loads one synthetic patient (Mohammed Al-Mansoor, `patient@naseej.health`) with two or three examples per page, so the screens are easy to read. It also creates two visit summaries and one active share through the same tables the app uses; the share link cannot be shown again because only its hash is stored. Demo files are written under `STORAGE_DIR/demo/`. All data is synthetic.

## Configuration

`.env.example` documents: `AI_PROVIDER` (`anthropic` | `gemini`), the matching key, `AI_MODEL`, `AI_CHAT_TIMEOUT_MS`, `ASSISTANT_MAX_PER_HOUR`, `SHARE_MAX_HOURS`, `TRUST_PROXY`. With no provider the assistant says it is not connected; record search, guided symptom capture, visit-summary drafting and sharing still work. New provider: implement `ChatProvider` in `services/ai/chat.ts`.

## Known limits / deployment requirements

- Rate limits are in memory (per process); use a shared store behind several instances. Set `TRUST_PROXY` behind a proxy.
- Voice uses the browser's speech recognition (Chrome/Edge send audio to the vendor); no server transcription. Unsupported browsers fall back to typing.
- Files are stored unencrypted on local disk under `STORAGE_DIR`; trashed documents are not purged automatically. Uploads are base64 JSON (4 MB), phone photos are downscaled in the browser.
- The share QR cannot be shown again after creation (only the hash is stored): revoke and create a new one.
- Auth token and user profile still persist in `localStorage` (existing design); the new screens keep no health data in browser storage.
- No compliance with any healthcare regulation is claimed. Production needs: clinical review of safety text, a data-processing agreement with the AI provider, encryption at rest, backups, retention/purge jobs, monitoring.
