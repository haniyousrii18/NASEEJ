# Academic deliverables — Naseej | نَسيج

## 1. Project
**Naseej** — a patient-owned health history and visit-preparation app. Stack: React + Vite + TypeScript, Node.js + Express, PostgreSQL, optional AI provider. Arabic (RTL) first, English supported. Academic prototype, synthetic data only.

## 2. Deliverables
| # | Deliverable | Location |
|---|---|---|
| 1 | Source code | `backend/src/`, `frontend/src/` |
| 2 | Migrations, rollbacks, seeds | `database/` |
| 3 | README and local setup | `README.md`, `docs/team-guide.md` |
| 4 | Requirements | `Naseej-PRD.md`, `PRODUCT.md` |
| 5 | Design and rules of the patient layer | `docs/patient-record.md` |
| 6 | Architecture, API, data model | `docs/architecture.md`, `docs/api-spec.md`, `docs/database-erd.md` |
| 7 | Test plan and automated tests | `docs/test-plan.md`, `backend/tests/`, `frontend/tests/` |
| 8 | User guide and demo script | `docs/user-guide.md`, section 4 below |
| 9 | Design system | `DESIGN.md` |
| 10 | Graduation proposal (Arabic) | `docs/` (proposal files) |

## 3. Report outline
1. Introduction and motivation (scattered personal health information; history recalled from memory in short consultations).
2. Problem statement and objectives.
3. Related work (personal health records, FHIR, AI assistants in health and their risks).
4. Requirements and scope (MVP vs future).
5. Design: architecture, data model, safety boundaries, sharing model.
6. Implementation.
7. Evaluation: automated tests, a usability test with participants (to be run by the team), a safety test set (to be prepared).
8. Limitations and future work.

## 4. Demo script
1. Landing page (AR/EN), then sign in as the demo patient.
2. Record a symptom by voice; show the check step; delete and undo.
3. Upload a document; if a key is set, allow AI reading and confirm one suggestion.
4. Ask the assistant a record question (sources) and a medicine-change question (fixed refusal); type an emergency phrase (fixed message).
5. Prepare a visit, approve it, create a QR, open it on a phone, revoke it, show the expired state and the access history.

## 5. Limitations (honest register)
No live AI provider run yet; safety wording not clinically reviewed; no usability study yet; browser dictation depends on the browser; unencrypted local file storage; in-memory rate limits; no regulatory compliance claimed. See `docs/patient-record.md`.

## 6. Future work
Server-side transcription, FHIR import/export, email/push reminders, encryption at rest and retention jobs, clinical review of safety content, formal usability and safety evaluations.
