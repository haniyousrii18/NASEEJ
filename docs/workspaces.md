# Role workspaces: what is built, what is real, what is not

Prototype status: academic, synthetic data only. Nothing here is certified, production-ready or clinically validated.

## The five workspaces

| Role | Routes (hash) | Main journeys |
|---|---|---|
| Patient | `patient/home, summary, timeline, documents, medications, appointments, messages, consents, caregivers` | Read the approved record with source and review state; upload documents (progress, validation, optional per-file AI permission) and filter the library; request appointments; ask questions; share between centers (consent); authorize, review and revoke caregivers. |
| Caregiver | `caregiver/home`, `caregiver/patient/<delegationId>/summary`, `timeline`, `appointments`, `messages` | Accept or decline an invitation; see exactly what is included; follow the approved record, request appointments and message the care team, each only if granted; end their own access. A banner always states they are not the patient. |
| Doctor | `doctor/home, appointments, pending, patients, patient/<id>/…, messages` | Day overview with a "waiting for your review" card; patient record; documents with AI suggestions to accept, correct or reject next to the original file; reception messages; patient and caregiver questions inbox. |
| Reception | `reception/home, schedule (day/week/month), book, patients, messages` | Intake, scheduling, check-in, conflict feedback, stale-data indicator, administrative patient search, operational messages to clinicians. No clinical content. |
| Center manager | `manager/home, schedule, services, reports, staff, coordination, activity` | Working hours, a center calendar with load against capacity (counts only), staff and roles (including caregiver login accounts), reports, coordination oversight, redacted activity log. No clinical records. |

The platform administrator (`admin/home, centers, accounts, requests, audit`) and care coordinator (`coordinator/home, cases, tasks, referrals, log`) workspaces exist as before. **Every role, including those two, also has `<role>/settings` and `<role>/notifications`** (see below). The landing and public pages changed only in their top bar (see DESIGN.md).

## Shell, settings and notifications
- **Sidebar:** the role's groups, then a pinned foot with Notifications (unread badge) and Settings above Sign out. The collapse toggle moved into the top bar; the public-site link was removed.
- **Settings (`<role>/settings`):** tabs depend on the role. The selected tab is kept in the address (`?tab=security`).

| Role | Tabs |
|---|---|
| Patient | Profile, Contact and emergency, Sharing and caregivers, Password and security, Language and appearance |
| Caregiver | Profile, Access you were given, Password and security, Language and appearance |
| Doctor, reception, care coordinator, center manager | Profile, Center and role (managers also see center details, read-only), Password and security, Language and appearance |
| Platform administrator | Profile, Platform administration (links), Password and security, Language and appearance |

  Backed by `/api/account` (profile, patient contact, password; see `api-spec.md`). Each call acts on the signed-in account only; a password change needs the current password and is audited without storing it. Language and workspace theme are saved on the device. The pages carry no explanatory text.
- **Notifications (`<role>/notifications`) and the bell:** see `docs/notifications.md`.
- **Mobile:** closed drawers stay inside the viewport; see DESIGN.md section 6.

### What was rebuilt and what was reused
The repository already had patient, doctor, reception and manager workspaces. This work kept the shell, router, API layer and the parts that already met the brief, rebuilt the reception workspace (calendar, drawers, patient lookup; see git history), and added the caregiver workspace, the patient caregiver and document-library pages, the doctor AI review and messaging screens, reception messaging and the manager calendar. It is not a from-scratch rewrite of every screen.

## Themes
The workspaces have their own light/dark choice (`naseej_ws_theme`). `ThemeContext` applies it only while the authenticated shell is mounted and restores the public site's own preference on leaving; the landing and login pages never read it. Light uses the landing page's orange tokens (`--color-accent` #c2410c on a warm ivory canvas); dark uses the landing page's warm onyx surfaces. Component shapes follow `DESIGN.md` (section 5) (24px cards on a hairline, 18px filled fields, capsule buttons and badges) while keeping 44px touch targets, and state is never signalled by colour alone.

## Caregiver delegation (migration 003)
- A patient creates a delegation, the invited account (matched on email) accepts it, and it expires. Three independent flags: view approved records, manage appointment requests, message the care team.
- Every `/api/caregiver/patients/:id/*` call re-checks that the delegation belongs to the caller, is `active`, is unexpired and grants the capability. Anything else is a 404, and a refused attempt is audited.
- Caregivers get the patient's own approved/released view only: no drafts, no AI suggestions, no file downloads.
- A center manager creates the caregiver's login (role `caregiver`); there is no self-registration.
- Unresolved policy decisions: guardianship for minors or incapacitated adults, whether caregivers may download original files, and the maximum delegation length. The implementation is conservative on all three (no downloads, 365 days at most).

## Operational messaging
`ops_messages` and replies are persisted server-side, scoped to one center, and visible only to the reception staff and doctors who take part. Text is not copied into the audit log (only counts and status changes). It is explicitly not a clinical or urgent channel.

## AI/OCR
- Provider adapters: `backend/src/services/ai`, selected by `AI_PROVIDER`. `gemini` calls the Google Gemini API over plain HTTPS (PDF and image input, JSON output with a response schema; default model alias `gemini-flash-latest`, and if Google does not serve it the adapter lists the available models once and uses the newest Flash one; no SDK). `anthropic` uses the Anthropic Messages API (forced tool call; default `claude-sonnet-5-5`; `@anthropic-ai/sdk`, loaded only when used). `AI_MODEL` overrides the default for the chosen provider. Both share one instruction prompt and one output sanitizer.
- **Not active by default.** It runs only when `AI_PROVIDER` is `gemini` with `GEMINI_API_KEY`, or `anthropic` with `ANTHROPIC_API_KEY`. No key was available while this was built, so **no live call has been made and no real result has been observed.** Everything users see is driven by real job state; nothing is simulated.
- Data handling: the file is sent to the chosen provider (generativelanguage.googleapis.com or api.anthropic.com). On Google's free tier, content may be used to improve Google's products and seen by human reviewers, so use synthetic files only. For a patient's file that happens only after the patient ticked the per-file permission (revocable until processing starts); for a clinician-uploaded file, a clinician of the owning center starts it. Use synthetic data unless your own policy allows an external processor.
- Output is stored in `document_facts` as `unreviewed` suggestions with page, passage, the model's own (uncalibrated) confidence when given, and a one-line reason. Patients and caregivers never see unreviewed suggestions; patients see only facts a clinician accepted or corrected. Processing and reviews are audited.
- Limits: processing runs in the API process after the response (no job queue); passages are model-reported, not verified against a text layer; Arabic handwriting accuracy is unknown.
- To activate: set `AI_PROVIDER` and the matching key in `.env`, restart the backend, upload a synthetic PDF with the permission ticked (or press "Read the file automatically" as a doctor) and check `GET /api/documents/ai/status`.
- A ready synthetic test file is in `docs/samples/synthetic-lab-report.pdf` (two pages: lab results, then allergy and medications). `node docs/samples/make-sample-pdf.mjs` regenerates it. It contains no real patient data.

## Cross-center consent
Unchanged and still enforced in `accessService` and `recordService`: a patient-center link grants nothing on its own; other centers' records need an effective (active, unexpired, in-scope) consent and each such read is audited. AI facts are never shared across centers: `document_facts` is read only by the owning center.

## Applying the schema
`npm run migrate` also applies `004_notifications.sql` (additive, rollback in `database/migrations/rollback/004_down.sql`); the notification APIs need it.

`npm run migrate` applies `003_caregivers_ops_messages_ai_review.sql` (additive; rollback in `database/migrations/rollback/003_down.sql`). `npm run seed` adds a synthetic caregiver (`caregiver.noor@naseej.health`, same demo password) with an active delegation from the demo patient (view records and appointments, no messaging). The document timeline, doctor overview and document routes now require migration 003.

## Known gaps
- Notifications cover many events (see `docs/notifications.md`) but are in-app only and refresh periodically; there is no email or push.
- No document-type or specialty filter for patients: files carry no confirmed type or specialty.
- Message lists poll every 20 seconds; there is no push.
- Backend tests for migration 003 (`backend/tests/caregiver.test.ts`) were written but not run, and no PostgreSQL was available to apply the migration in this session.
