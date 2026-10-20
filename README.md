<div align="center">

<img src="frontend/public/logo.png" alt="Naseej Logo" width="96" height="96" />

# Naseej | نَسيج
### A patient-owned health history and visit-preparation app
**سجلك الصحي منظَّم، وزيارتك جاهزة**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-336791.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)

*Academic graduation prototype. 100% synthetic demo data. Arabic (RTL) first, English (LTR) fully supported.*

</div>

---

## 1. What Naseej is

Naseej helps a patient organize their medical history, explain their symptoms clearly in a consultation, and share **only what they choose** with any doctor, clinic or hospital.

The core loop:

1. The patient records conditions, medications, allergies, procedures, measurements, visits, symptoms and medical documents.
2. Everything appears on one chronological timeline, each item with its date, source and review state.
3. An optional text-and-voice **assistant** searches the patient's own record, drafts symptom entries and helps prepare a visit summary. It is not a doctor and never diagnoses, prescribes or changes a dose.
4. The patient edits and **approves** a visit summary.
5. The patient creates a **temporary, revocable QR link**. The clinician opens a mobile-friendly, read-only page showing only what was approved, with no account and no app.

Principles: the patient decides; nothing is saved or shared without their confirmation; AI output is a suggestion until the patient confirms it; "not recorded" never reads as "absent"; Arabic and English ship together.

### What is implemented

| Area | Status |
|---|---|
| Public landing, workflow page and login (patient-first copy, AR/EN) | Implemented |
| Today screen, health profile (6 entry kinds), symptoms with edit/delete/undo, timeline | Implemented |
| Document vault: upload or photo capture, type/date/provider, search and filter, links to symptoms/entries, original always downloadable, trash and restore | Implemented |
| AI reading of a document into *suggestions* the patient confirms or dismisses | Code complete, **off until a provider key is set**; never run against a live provider |
| Visit summary: built from the record by code, every item has a source, editable, approvable | Implemented |
| Optional AI wording for the summary overview | Code complete, needs a provider |
| Assistant (chat, citations, drafted symptom the patient reviews, navigation) with server-side safety rules | Code complete, **needs a provider key**; record search, guided symptom capture and the emergency check work without one |
| Voice input (browser speech recognition, editable transcript, check of numbers/dates) | Implemented where the browser supports it |
| QR sharing: opaque hashed token, expiry, instant revoke, access history, frozen snapshot, print/PDF | Implemented |
| Settings (profile, contact, privacy and assistant switch, password, language/theme), in-app notifications, installable PWA | Implemented |
| Email/push, server-side transcription, clinical review of safety wording, external identity provider | **Not implemented** |

The earlier multi-center clinic platform (doctor, reception, manager, coordinator, admin and caregiver workspaces) was removed. Its tables from migrations 001-004 remain in the schema but are unused. Design and rules of the new layer: [docs/patient-record.md](docs/patient-record.md).

---

## 2. Technology

- **Frontend:** React 19, Vite 8, TypeScript, plain CSS with design tokens ([DESIGN.md](DESIGN.md)), `qrcode` for the QR image.
- **Backend:** Node.js, Express 5, TypeScript, `pg`. Email and password with a JWT behind a replaceable `IAuthProvider`.
- **Database:** PostgreSQL 16+, plain SQL migrations `database/migrations/001-005` with rollbacks.
- **AI:** provider-agnostic boundary (`backend/src/services/ai`): Google Gemini (HTTPS) or Anthropic (`@anthropic-ai/sdk`). Off by default.
- **Files:** protected local storage outside the web root (`storage/protected/`), served only through authorized routes.
- **Tests:** Vitest and Supertest (against a real PostgreSQL), Vitest for the frontend.

```text
backend/    Express API, services, migrations runner, seeds script, tests
frontend/   React app (public site in src/pages, signed-in app in src/app, health screens in src/app/health)
database/   migrations/ (001-005), rollback/, seeds/
docs/       patient-record, architecture, API, ERD, test plan, user guide, team guide
```

---

## 3. Quick start

Full guide with Git rules: **[docs/team-guide.md](docs/team-guide.md)**. Requirements: Node.js 20+, npm 10+, PostgreSQL 16+, Git.

```bash
git clone https://github.com/haniyousrii18/NASEEJ.git
cd NASEEJ
npm install
cp .env.example .env             # set DB_PASSWORD (and DB_* if different)
# once, in psql:  CREATE DATABASE naseej_dev;
npm --prefix backend run migrate # tables (001-005)
npm --prefix backend run seed    # small synthetic demo (empties every table first)
npm run dev                      # API on :5000, app on :3000
```

Open <http://localhost:3000>. Demo patient (synthetic, local use only): `patient@naseej.health` / `Password123!`. Only patient accounts can sign in (`PATIENT_ONLY_MODE`).

---

## 4. Optional: AI (assistant and document reading)

Off by default; the app says so instead of simulating answers. To enable, set in `.env` (never commit a key):

```ini
AI_PROVIDER=gemini          # or anthropic
GEMINI_API_KEY=your-key     # or ANTHROPIC_API_KEY
# AI_MODEL=                 # empty = provider default
AI_CHAT_TIMEOUT_MS=25000
ASSISTANT_MAX_PER_HOUR=40
```

Before enabling: record text and files go to the provider's API, so use **synthetic data only** unless your data-protection policy allows an external processor (Google's free tier may use content to improve its products). The patient must also switch the assistant on in Settings, and confirm each file before it is read. Document readings stay unconfirmed suggestions until the patient confirms them. The emergency and refusal wording in `backend/src/services/health/safety.ts` is **not clinically reviewed**. Other settings: `SHARE_MAX_HOURS`, `TRUST_PROXY`, `AI_TIMEOUT_MS` (document reading), `DB_SSL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `STORAGE_DIR` (see `.env.example`; set a long random `JWT_SECRET` outside local use).

---

## 5. Automated tests

```bash
npm --prefix backend run test:unit  # no database, no network
npm --prefix backend run test       # all, against the database in .env
npm --prefix frontend run test
```

The backend API tests change the database and are meant for a **fresh** one (CI starts each run on a new database). `seed` empties every table and loads the same small demo each time (this **destroys data**; it refuses to run with `NODE_ENV=production` unless `SEED_FORCE=true`), so a local dev database is ready for a new run with:

```bash
npm --prefix backend run seed
```

The demo is one patient with two or three examples per page: 2 conditions, 2 medications, 2 allergies, 3 symptoms, 3 documents (two AI readings waiting for confirmation), 2 visit summaries (one approved and shared, one draft), 1 active share and 2 notifications. Three staff accounts and one center exist only so the API tests can prove that staff cannot use the patient API; they cannot sign in to the app.

Set `AI_PROVIDER=` (empty) when testing so no real provider is called. Coverage: ownership and IDOR checks, entries/symptoms/vault, suggestions needing confirmation, visit summary, share create/open/expire/revoke and document grants, assistant safety answers, audit content, plus unit tests of safety rules, validation, tokens, rate limiting and reply shaping. Details: [docs/test-plan.md](docs/test-plan.md).

---

## 6. Backup and recovery

Scope: the PostgreSQL database and `storage/protected/`.

```bash
pg_dump -U postgres -h 127.0.0.1 -p 5432 -d naseej_dev -F c -b -v -f ./backups/naseej_backup.dump
tar -czvf ./backups/naseej_storage.tar.gz storage/protected/
```

Restore into a fresh database with `pg_restore` and unpack the archive, then check that records and files open. A backup file is not proof of recovery.

---

## 7. Documentation index

- [docs/patient-record.md](docs/patient-record.md): the patient layer, rules enforced, configuration, limits.
- [docs/architecture.md](docs/architecture.md), [docs/api-spec.md](docs/api-spec.md), [docs/database-erd.md](docs/database-erd.md).
- [docs/test-plan.md](docs/test-plan.md), [docs/user-guide.md](docs/user-guide.md), [docs/team-guide.md](docs/team-guide.md).
- [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md), [Naseej-PRD.md](Naseej-PRD.md).
- [docs/notifications.md](docs/notifications.md), [docs/pwa.md](docs/pwa.md), [SECURITY.md](SECURITY.md).
- [docs/academic-deliverables.md](docs/academic-deliverables.md): capstone deliverables.

---

## 8. Limits and disclaimer

Naseej is a graduation prototype. It is not certified, not clinically validated and not production-ready, and it claims no compliance with any healthcare regulation. All names and data are synthetic. The software does not diagnose, prescribe or give treatment advice, and AI output never replaces a clinician's judgment. Deployment requirements (encryption at rest, retention jobs, shared rate-limit store, clinical review, a data-processing agreement with any AI provider) are listed in [docs/patient-record.md](docs/patient-record.md).
