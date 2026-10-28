# Test plan — Naseej | نَسيج

## Automated
| Suite | Needs | What it proves |
|---|---|---|
| `backend/tests/health-units.test.ts` | nothing | emergency/refusal rules (AR/EN), unsafe-output filter, reply shaping (citations kept only if in the list, unsupported answer → "not found", symptom fields validated, navigation whitelisted), entry/symptom validation, token shape and hashing, lifetime limits, rate limiter, summary content validation, record search, provider schema conversion |
| `backend/tests/ai-providers.test.ts` | nothing | document-analysis adapters with a stubbed HTTP call |
| `backend/tests/patient-owned-record.test.ts` | PostgreSQL | unauthenticated and non-patient access refused; foreign ids → 404; entry create/patch/delete/restore with source kept; symptoms and timeline; patient visits invisible to clinicians; vault upload with no center, invisible to staff, bad file type refused, trash/restore, AI analysis needs confirmation and is honest when off; an AI suggestion becomes an entry only on confirm; summary built with sources, forged sources rejected, approval required before sharing; share token shown once and stored hashed; clinician view read-only with only approved content and documents; access events without addresses; expiry and revoke take effect immediately; deleting a document cuts it off from a share; assistant not-connected state, fixed urgent/refusal answers, consent switch, interaction log holds metadata only; audit log holds no health content |
| `backend/tests/auth.test.ts`, `patient-portal.test.ts` | PostgreSQL | login/me; approved-only portal summary; retired endpoints return 404 |
| `backend/tests/access.test.ts` | PostgreSQL | email and password rules; sign-up creates an unconfirmed account and mails a link; sign-in waits for confirmation; links are single-use, expire, and only their hash is stored; registering a confirmed address changes nothing and mails the owner; resend and forgot-password answer the same for known and unknown addresses; a reset signs out older sessions; Arabic emails when the page was Arabic |
| `backend/tests/timeline.test.ts` | nothing | the same finding read with different values on the same day is marked as a conflict on both sides; symptoms, visits and documents are never compared; an undated reading stays flagged |
| `backend/tests/translation.test.ts` | PostgreSQL | language detection; input limits (1 to 20 strings, `ar` or `en`); numbers must survive (Arabic and Western digits equal, Arabic dual allowed); no provider means no translation and never an invented one; a result is stored once and edited text is translated afresh; only derived text is stored |
| `backend/tests/glossary.test.ts` | nothing | the medical glossary translates both ways, never guesses (an unknown word makes the whole text untranslated), keeps numbers and Latin words, and round trips keep the meaning |
| `backend/tests/local-engine.test.ts` | PostgreSQL, translation models for the machine-translation cases | the quality gate (plausible output, round-trip recall); a machine translation is kept only if it survives the round trip; the local provider is a registered non-AI provider that tries the glossary first |
| `frontend/tests/access.test.ts` | nothing | account screens speak the page language; both languages have the same screen strings; network failures are told apart; no screen tells people to contact an administrator to reset a password |
| `frontend/tests/localization.test.ts` | nothing | typed text is shown in the page language, labelled, with the original one click away; text already in the page language is shown as written; numbers and dates inside a sentence stay isolated so Arabic cannot reorder them; switching language shows the other direction without re-entering anything |
| `frontend/tests/i18n.test.ts` | nothing | Arabic and English trees have identical keys; landing copy makes no certification claim |

Run: `npm --prefix backend run test:unit`, `npm --prefix backend run test`, `npm --prefix frontend run test`. The API suites change the database: use a **fresh** database (CI does) or run `npm --prefix backend run seed` first (it empties every table), AI is forced off by `backend/vitest.config.ts`, whatever your `.env` says, so no real provider is called. `backend/tests/setup.ts` adds the staff and center fixtures the tests need. CI also checks migrations (empty-database migrate, re-migrate is a no-op, rollback and re-apply).

## Manual (before a demo)
1. Sign in as the demo patient; Today shows four actions; every nav item loads in Arabic and English with no horizontal scroll at 375 px.
2. Record a symptom by form, by voice (Chrome/Edge) and by guided questions; confirm the numbers check appears after dictation; delete and undo.
3. Upload a PDF and a phone photo; edit details; trash and restore; open the original.
4. Prepare a visit: edit, remove a section, pick documents, approve, preview, print.
5. Create a share, scan the QR with a phone, open documents, revoke, reload (expired state), check the access history.
6. With no AI key: the assistant says it is not connected; search and guided capture work; typing an emergency phrase shows the fixed message.
7. With a synthetic-data key (optional): assistant answers cite sources; "should I stop my medicine?" gets the fixed refusal; a document reading appears as unconfirmed suggestions.
8. Accounts: create an account (without SMTP the confirmation link is printed in the API console), confirm it, sign in; ask for a password reset, use the link once, confirm the second use fails and that another signed-in browser is signed out.
9. Translation: with `TRANSLATION_PROVIDER=local`, view an Arabic entry in the English page and the reverse; the translation is labelled and "Show original" restores the text; open a shared link and check that only wording inside the share is translated.

## Not yet tested
A live AI provider, physical phones for PWA and camera, clinical review of the safety wording, load and multi-instance rate limiting, a screen-reader accessibility audit.
