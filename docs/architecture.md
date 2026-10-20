# Architecture — Naseej | نَسيج

## 1. Overview
A patient-owned record with a thin, strict server around it.

```text
Patient browser (React + TypeScript, RTL/LTR)        Clinician browser (read-only page, no account)
        |  HTTPS / REST JSON                                  |  POST /api/share-view/*  (token in body)
        v                                                     v
Express API  ── auth (JWT, IAuthProvider) ── ownership check per query (session patient id)
   ├─ record / vault / prep / shares routers      ├─ safety rules (before and after any model call)
   ├─ assistant service ── ChatProvider ──► optional external AI provider (Anthropic | Gemini)
   ├─ document analysis service ── DocumentAnalysisProvider ──► same providers
   └─ rate limiter, audit log (ids and kinds only)
        |
PostgreSQL (migrations 001-005)         Protected file store (outside the web root)
```

- **Frontend:** `frontend/src/app` (signed-in app, hash router `#/patient/...`), `app/health` (the screens), `pages/ShareView.tsx` (clinician page at `#/share/<token>`; the fragment never reaches a server). Strings: `app/i18n` (Arabic is the source, English is typed against it).
- **Backend:** `backend/src/routes` (record, vault, prep, shares, assistant, documents, portal, account, notifications, auth), `services/health` (input validation, record context, summary builder, safety, assistant, share tokens), `services/ai` (provider adapters).
- **Database:** see `database-erd.md`. Patient-owned tables: `health_entries`, `symptom_reports`, `documents` (+`document_links`, `document_facts`), `visit_preps`, `record_shares` (+`share_documents`, `share_access_events`), `ai_interactions`.
- **Storage:** random-UUID file names under `STORAGE_DIR`, served only through authorized routes; a share can stream only the documents granted to it.

## 2. Key decisions
1. **The patient owns the record, not a center.** Vault documents and entries have no center; a clinician sees them only through a share the patient creates.
2. **Code builds the summary, the model only offers wording.** Every item in a visit summary comes from a record row and carries its source; an optional AI overview is shown to the patient to accept or discard.
3. **The assistant has no tools.** It returns one structured object; the server validates it (aliased citations, symptom fields through the same validator as the save endpoint, navigation whitelist) and replaces unsafe output with a fixed refusal. Urgent wording and diagnosis/treatment requests are answered without calling a model.
4. **Shares are frozen snapshots with hashed tokens.** What the patient approved is copied at creation; later edits never leak; expiry and revoke are checked on every request; the copy is erased a day after the link ends.
5. **Provider-agnostic AI.** `ChatProvider` / `DocumentAnalysisProvider` behind environment configuration; off by default and honest when off.
6. **Additive migrations.** 005 changes nothing that existed; the tables from the earlier multi-center platform (001-004) remain unused.

## 3. Limits
In-memory rate limits (per process); local unencrypted file storage; JWT and user profile persist in `localStorage` (existing design); no purge job for trashed documents; no server-side speech recognition. See `patient-record.md`.

## 4. History
The project began as a multi-tenant clinic platform (doctor, reception, manager, coordinator, admin and caregiver workspaces, cross-center consent). That scope was removed when the concept changed to the patient-first product above; the code remains in Git history.
