# REST API — Naseej | نَسيج

Base path `/api`. JSON in and out. Success: `{ "success": true, "data": ..., "meta"?: ... }`. Error: `{ "success": false, "error": { "code", "message", "details"? } }`. Authenticated routes need `Authorization: Bearer <JWT>` and, unless noted, a **patient** account; any other account gets `403 PATIENT_PROFILE_REQUIRED`. A row that is not the caller's is reported as `404`, never `403`.

## Auth and account
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | email + password → token, user |
| GET | `/auth/me` | current user |
| GET | `/account` | profile, patient contact details |
| PATCH | `/account/profile`, `/account/patient-contact` | edit own profile / contact |
| POST | `/account/password` | change password |
| GET/POST | `/notifications`, `/summary`, `/unread-count`, `/:id/read`, `/:id/dismiss`, `/:id/restore`, `/read-all` | in-app notifications |

## Health record (`/record`)
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/entries` | `?kind=&status=&limit=&offset=&deleted=1`; kinds: condition, medication, allergy, procedure, measurement, visit |
| PATCH/DELETE | `/entries/:id` | DELETE is a soft delete |
| POST | `/entries/:id/restore` | undo |
| GET/POST | `/symptoms` | `?q=&from=&to=&limit=&offset=`; body: `symptom_description`, `severity` 1-10, `onset_date`, `duration_text`, `frequency`, `better_factors`, `worse_factors`, `notes`, `document_ids`, `captured_via` |
| PATCH/DELETE, POST `/:id/restore` | `/symptoms/:id` | |
| GET | `/search?q=&lang=` | plain keyword search of the record (no AI) |
| GET | `/home` | counts and ids for the Today screen |
| GET | `/portal/timeline`, `/portal/summary` | timeline (`type`, `from`, `to`, `before`, `limit`; includes `patient_entry`) and clinician-approved summary |

## Document vault (`/vault`)
| Method | Path | Notes |
|---|---|---|
| GET | `/documents` | `?q=&type=&from=&to=&trash=1&limit=&offset=` |
| POST | `/documents` | JSON upload `{ file_name, content_base64, title?, doc_type?, document_date?, provider_name?, ai_processing_allowed?, symptom_ids?, entry_ids?, visit_ids? }`; 4 MB; type sniffed from bytes |
| GET/PATCH/DELETE | `/documents/:id` | DELETE → trash; also removes the file from any share |
| POST | `/documents/:id/restore` | |
| POST | `/documents/:id/analyze` | `{ confirm: true }`; 503 `AI_NOT_CONFIGURED` when AI is off |
| GET | `/documents/:id/suggestions` | unconfirmed AI readings |
| POST | `/documents/:id/suggestions/:factId/confirm` / `dismiss` | confirm creates a health entry (`source: document`) |
| GET | `/documents/:id/download` (under `/documents`) | the original file |

## Visit summary (`/prep`)
`GET /`, `POST /` (`{ visit_date?, reason?, lang }` builds a draft from the record), `GET /:id`, `PUT /:id` (`{ content, visit_date? }`; sources are verified as the patient's; an approved summary returns to draft), `POST /:id/approve` (`{ confirm: true }`), `DELETE /:id`.

## Sharing
| Method | Path | Notes |
|---|---|---|
| GET | `/shares` | patient's shares with state (active / expired / revoked), counts |
| POST | `/shares` | `{ confirm: true, prep_id, expires_in_hours, document_ids?, include_identity?, label? }` → `{ id, token, expiresAt }`; the token is returned **once** |
| POST | `/shares/:id/revoke` | immediate |
| GET | `/shares/:id/events` | access history (device class, no addresses) |
| POST | `/share-view/view` | **public**, `{ token }` → `{ snapshot, expiresAt }`; 404 `SHARE_NOT_FOUND`, 410 `SHARE_EXPIRED` / `SHARE_REVOKED`, 429 |
| POST | `/share-view/document` | **public**, `{ token, document_id }` → file, only if part of the share |

Public responses: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`; 60 requests/min per address and 10 unknown-token attempts per 10 minutes.

## Assistant (`/assistant`)
| Method | Path | Notes |
|---|---|---|
| GET | `/status` | `{ configured, provider, model, consent, maxPerHour }` |
| POST | `/consent` | `{ allowed: boolean }` |
| POST | `/chat` | `{ messages: [{role, content}], lang }` (≤14 messages, ≤2000 chars). Reply kinds: `urgent`, `refused` (fixed text, no model), `reply` with `intent`, `message`, validated `citations`, `nextQuestion`, `symptomDraft`, `navigateTo`. 403 `AI_CONSENT_REQUIRED`, 503 `AI_NOT_CONFIGURED`, 504 `AI_TIMEOUT`, 429 |
| POST | `/overview` | `{ prep_id }` optional wording for the summary overview |
| POST | `/safety` | `{ text, lang }` fixed emergency check for form text; no AI |

The assistant cannot write: a proposed symptom is saved only when the patient posts it to `/record/symptoms`.

## Documents shared with the older center model
`/documents` (GET list/one, `/:id/download`, POST upload, `/:id/review`) and `/documents/ai/status`, `/:id/processing`, `/:id/ai-consent`, `/:id/facts` remain for documents tied to a center and for AI processing state.

## Health check
`GET /health`.
