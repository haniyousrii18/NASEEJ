You are a senior product designer and senior frontend engineer working inside an existing, working codebase. Your job is to implement a set of doctor-experience upgrades for "Naseej | نَسيج", a multi-tenant healthcare SaaS academic prototype. Do not stop at a proposal or a mockup: implement, run, verify, and report.

# 1. Read first, edit second
Before changing anything, read: PRODUCT.md, DESIGN (2).md, Naseej-PRD.md (requirements baseline, FR numbers), README.md, docs/api-spec.md, docs/architecture.md, docs/test-plan.md, frontend/src/App.tsx, frontend/src/components/{Header,Footer,ThemeToggle}.tsx, frontend/src/pwa/PwaPrompts.tsx, frontend/src/pages/{DoctorWorkspace,ReceptionWorkspace,PatientPortal}.tsx, frontend/src/context/{AuthContext,LangContext,ThemeContext}.tsx, frontend/src/i18n/translations.ts, frontend/src/styles/theme.css, frontend/vite.config.ts, backend/src/routes/{visit,prescription,lab,patient,appointment}Routes.ts and database/migrations/001_initial_schema.sql. Treat the existing implementation as the source of truth for what the product supports. If a field or capability is not in the schema or API, it does not exist: do not invent it.

# 2. Product context
- Naseej connects patient records across visits and medical centers with strict tenant isolation. Clinical visits, prescriptions and lab results start as DRAFTS and become visible to the patient only after explicit clinician approval.
- Binding principles (PRODUCT.md): Clinician in the Loop, Traceability by Default, Autonomous decisions prohibited, Connecting is not exposing.
- Naseej has no AI today. DECISION ALREADY MADE by the product owner: add a SIMULATED, rule-based AI layer that runs entirely in the browser (no network calls, no model, no backend change). Build it as three small pure, deterministic, unit-testable modules:
  - frontend/src/lib/ai.ts: aiSummary(patientData), parseVisit(text), checkInteractions(medicines, allergies)
  - frontend/src/lib/rules.ts: a small, clearly synthetic, bilingual rules table (severity ranking and a handful of demo medicine/allergy/medicine pairs). Its header comment must say it is demo data, not clinical guidance.
  - frontend/src/lib/selectors.ts: pure helpers that derive "what changed", abnormal labs, drafts awaiting approval.
  Add Vitest tests for them (the backend already uses Vitest; add the minimum dev setup in frontend only if it needs no heavy dependency, otherwise place the tests where Vitest already runs and say so).
- The simulated AI only PROPOSES. It never writes to the API, never changes a draft status, never approves, never prescribes, and its output is NEVER shown to the patient. Interaction alerts go to the doctor first. Every AI-generated surface carries a visible "AI proposal (simulated)" label (icon + word) and the doctor can dismiss or edit it.
- The existing allergy banner (FR-072) must keep working unchanged. Rules are demo data only: never imply accuracy, validation, certification or real clinical safety. All data is synthetic; keep a persistent "Synthetic data · simulated AI" indicator visible in the doctor workspace.
- Primary user: the doctor (seeded doctor account in README.md) at a desktop or tablet, with a few minutes per patient, working long sessions.

# 3. Hard constraints (non-negotiable)
- Stack: React 18, Vite, TypeScript, plain CSS design tokens in theme.css, inline styles plus the existing utility classes (btn-pill*, panel-card, cloud-feature-card, status-badge, data-table, modal-*, form-*). There is no Tailwind, Bootstrap or router: do NOT add them. Navigation is `currentView` state in App.tsx; do not introduce a router. Workspace "steps" are local state inside DoctorWorkspace.
- The ONLY new dependency allowed is Framer Motion (`motion` package, imported from `motion/react`; confirm the installed version supports React 18). Install it in the frontend workspace, keep imports tree-shakeable (prefer `m` + `LazyMotion` with `domAnimation` if it keeps the bundle small), and report its effect on bundle size and on the PWA precache size. No other new dependencies; if you think one is needed, justify it in the report instead of adding it.
- Do NOT change the backend, API contracts, auth, RBAC, tenant isolation, data models, migrations, seeds, or the approval endpoints and payloads. This is a UI/UX task. Approval calls (POST /api/visits/:id/approve and the prescription and lab equivalents) keep their exact URL, method and body.
- Colour: use only tokens from theme.css, never hard-coded colours in components. Extend BOTH the light and the `:root[data-theme='dark']` blocks for any new token. Never rely on colour alone for severity, status, draft/approved state or "new" state: pair it with an icon and a word. Do NOT introduce any red hue. The codebase already uses coral and a red-ish danger text (--color-status-danger-text): do not add more, and list the existing instances in the report as a follow-up instead of silently changing them.
- Dark mode and PWA already exist (Light/System/Dark theming, service worker, install/update prompts). Everything new must work in both themes, must not store sensitive data in localStorage or Cache Storage, and must not make API responses cacheable.
- Arabic RTL is the default and first-class; English LTR must keep working. Use logical properties (marginInlineStart, insetInlineEnd, paddingInline, textAlign start). Mirror directional icons. Isolate numbers, IDs, units and Latin drug/lab names (dir="ltr" or unicode-bidi: isolate). Motion direction must also be logical: slide-ins follow the reading direction.
- i18n: all NEW visible copy goes into frontend/src/i18n/translations.ts under both `ar` and `en` with identical key sets (plain, Egyptian-friendly Arabic for staff). No new hard-coded bilingual ternaries (isRtl ? '..' : '..') in JSX; migrate the ones in code you rewrite. Prove ar/en key parity with a tiny script.
- Accessibility: semantic HTML, full keyboard operation, visible focus (global :focus-visible), ARIA for custom widgets, aria-live for status changes, touch targets >= 44px for new controls, contrast >= WCAG AA in both themes (verify with a computed-contrast scan).
- Code organisation: DoctorWorkspace.tsx is already ~660 lines. Extract new pieces into frontend/src/components/doctor/ (small typed components) instead of growing the page. Replace `any` with real interfaces for the data you touch. Match the surrounding style and comment density. Reuse existing components and classes; extract shared components instead of duplicating markup.

# 4. Motion system (Framer Motion) and animations
Build one small motion layer, frontend/src/components/motion.tsx, and use only it from feature code (no raw `motion.div` scattered through pages). It exports:
- `MotionRoot`: wraps the app in `MotionConfig reducedMotion="user"` (mount it in App.tsx inside ThemeProvider).
- `Rise`: fade + small translate (<= 12px, along the logical block axis) entrance, 120-400ms. A prop `urgent` skips any delay and any stagger so safety information (interaction alerts, allergy banner, errors) appears immediately.
- `Stagger` / `StaggerItem`: staggered list entrance, 40-60ms step, capped at 8 items (items after the 8th appear together).
- `LoadSwap`: cross-fades a skeleton into real content (used when a patient is opened).
- `Presence` helpers for dialogs, popovers, drawers and toasts (scale/fade for popovers, fade + slight slide for dialogs and the focus-mode side panel).
- `AnimatedCheck`: a short, calm SVG check draw (<= 400ms) for the approval confirmation. It plays once, never loops.
- `Highlight`: a brief (<= 800ms) background pulse plus a "New" icon + word for newly added items (parsed visit items, unseen labs). Never colour only.
Rules for every animation:
- Purposeful only: orientation, continuity, feedback. No decorative, looping, parallax, "AI glow", shimmering or pulsing effects, except the standard skeleton placeholder, which must stop under reduced motion.
- Durations 120-400ms; easing exponential ease-out (e.g. cubic-bezier(0.16, 1, 0.3, 1)) for entrances, ease-in for exits (shorter, 120-200ms). Animate only `opacity` and `transform` (no width/height/top/left, no layout thrash); use `layout` animations only for small list reorders.
- Never delay clinically important or safety information, never animate it away to hide it, and never make a user wait for an animation before they can act (inputs and buttons are interactive immediately).
- No layout shift: reserve space (skeleton, fixed min-height) so content does not jump.
- Honour `prefers-reduced-motion`: with reduced motion, transforms and layout animations are removed and only short opacity changes (or none) remain. Verify by emulating the preference.
- Do not animate on every keystroke or re-render: guard with keys so items animate only when they first appear.
- The existing theme.css CSS rules (.theme-switching, the reduced-motion block) stay in force; theme changes remain instant.
- Keep the existing CSS transitions on buttons/cards; do not double-animate the same element.

# 5. Work to deliver (implement in this order; each item has acceptance criteria)

## 5.1 "Two-minute brief" strip (highest priority)
Goal: when the doctor selects a patient, the most important information is visible without scrolling or clicking.
- At the top of the selected-patient panel add a compact brief: identity line (name, age/sex, MRN), allergies (reusing the existing banner content and severity), the latest approved visit and any DRAFT visits awaiting approval, active/draft prescription count, labs with is_abnormal = true (name, value, reference_range), and the next/current appointment status.
- Derived through aiSummary from existing API data: the top 3 problems ranked by severity (rule-based), each with a severity chip (icon + word) and a source chip; the number of unseen changes; and whether a high-severity interaction alert exists, with a direct "Review medicines" action. Labelled "AI proposal (simulated)". No invented scores or percentages.
- Motion: the brief enters with Rise/Stagger; an interaction alert uses `Rise urgent`.
- Acceptance: visible above the fold at 1280x720 and usable at 375px (collapsible on phones); no information duplicated between the brief and the patient header beyond identity/allergies; renders without artificial delay.

## 5.2 "What changed" made visual
- Show what is new since the doctor last looked at this patient: new abnormal labs, new drafts, newly approved items. "Last looked" is a per-doctor, per-patient TIMESTAMP ONLY in localStorage (try/catch). Ask before storing anything else.
- Lab values: value, unit, reference_range, abnormal marker (icon + word), delta and trend arrow vs the previous result of the same test when one exists in the data. If there is no previous result, show nothing rather than guessing.
- "Mark as seen" per item and "Mark all as seen" with an aria-live confirmation. Unseen state is icon + word. New items use `Highlight` once.
- Acceptance: a doctor can find every new abnormal lab in under 5 seconds; keyboard-operable; correct in RTL and LTR.

## 5.3 Source preview
- Only where the data supports a source (e.g. the `documents` table linked to a patient/visit/lab). First check how documents are exposed by the API; if nothing links a document to a clinical item, SKIP this item and say so in the report.
- If built: an accessible popover on hover AND keyboard focus, dismissed by Escape/blur, no focus trap, no layout shift, never covers its trigger, click fallback on touch, positioned with logical properties. Presence animation: fade + scale from 0.97, <= 160ms.

## 5.4 Visit recording as a live structured conversation
- Rework the "new consultation draft" form into two columns: a large dictation/text area on the start side and a live "structure" panel on the end side that updates as the doctor types (complaint, medicines, tests, follow-up). Each parsed item is individually editable/removable inline; newly parsed items enter with `Highlight` (icon + animation, not colour only).
- Parsing uses parseVisit from ai.ts, debounced <= 300ms. It fills or suggests the existing form fields; the doctor confirms. Keep the existing fields and the create-draft payload exactly as is.
- Unsaved input is held as a local in-memory draft only (no localStorage for clinical text). Warn before discarding with an in-app dialog, not confirm().
- Label the panel "AI proposal (simulated)" and keep the "nothing reaches the patient until you approve" reminder (t.clinical.noDraftVisibility). Replace alert() with inline, announced errors. Design empty, typing, parsing, submitting, error and success states.
- Acceptance: "Save draft" is always reachable; validation is announced; the create request is unchanged.

## 5.5 Approval as a deliberate moment
- Replace the browser confirm() in handleApproveVisit (and any equivalent for prescriptions and labs) with an in-app approval dialog: a side-by-side "What the patient will receive" summary (diagnosis/plan as it will appear, linked prescriptions and labs still in draft) next to the draft, plus a readiness checklist that states reasons (e.g. "Diagnosis is empty"), not just a count.
- Approve stays disabled until the checklist is satisfied. The checklist uses fields the existing form already requires or fills, plus one new client-side condition: if checkInteractions reports a high-severity alert for the visit's medicines, the doctor must explicitly acknowledge it (checkbox with the alert text). UI gate only; endpoint and payload unchanged.
- On success: a short, calm confirmation (AnimatedCheck, a concise "Sent to the patient" panel with what was sent, and a next action such as back to the waiting list), announced via aria-live; focus moves to the confirmation heading. Double-submit must be impossible (disable the button and guard in the handler).
- Acceptance: request URL, method and payload unchanged; keyboard-only operable; the dialog traps focus and restores it on close.

## 5.6 Keyboard-first workflow (doctor role only)
- Shortcuts documented in a "Keyboard shortcuts" dialog opened with `?`: `/` or Ctrl+K opens patient search (command-palette feel, patients first, over the already-loaded list, no new endpoint), `[` / `]` previous/next workspace section, `g` then `d` back to the waiting list/dashboard, Ctrl+Enter submits the approval dialog only when it is open and approval is allowed (still needs the explicit confirm state), Esc closes overlays, and a documented key toggles focus mode.
- Never fire single-key shortcuts while focus is in an input, textarea, select or contenteditable (except Ctrl+Enter in the approval dialog). Never break browser/screen-reader defaults. Show hints in title/labels.
- Acceptance: no conflict with Arabic/Latin typing; discoverable via `?`; everything remains mouse/touch operable.

## 5.7 Focus mode
- A toggle that hides the patient list/side panel and non-essential chrome so the doctor sees only the active step. Persist the boolean per user in localStorage (try/catch). Animate the collapse with the motion layer (transform/opacity, <= 300ms), reduced-motion safe. Document its shortcut in 5.6.

## 5.8 Loading and empty states that feel instant
- Opening a patient shows the identity + brief skeleton immediately and cross-fades the real content in with `LoadSwap`. No blank screens. Every empty state says what is empty and offers the next action (e.g. "No labs yet. Order a lab test").

## 5.9 Demo/presentation support (small, safe)
- A first-run "Demo tips" tour for the doctor role (max 3 steps: the brief, approval, shortcuts), dismissible forever via localStorage (try/catch), accessible, skippable with Esc. Step transitions use the motion layer.
- Keep the persistent "Synthetic data · simulated AI" indicator in the doctor workspace (not only the footer).

## 5.10 OPTIONAL, only if 5.1-5.9 are complete and verified: patient timeline
- A single horizontal timeline of visits, lab dates and prescription status changes from data the API already returns, with a staggered entrance capped at 8 items. If the seeded data is too thin to be meaningful, SKIP it and say so; do not fabricate data.

# 6. Design quality bar
- The doctor's two minutes come first; one primary action per surface; group with whitespace and dividers, not nested cards; consistent with DESIGN (2).md (pill buttons, cloud cards, existing radii/spacing tokens); tabular figures for clinical numbers; no decorative animation.
- Every new state is designed: loading, empty, error, disabled, success, hover, focus, pressed.
- Nothing may overflow horizontally at 375px. The shared header already overflows on very narrow screens: do not make it worse, and report it if you leave it.

# 7. Verification (required; report honestly)
1. `npm --prefix frontend run build` (tsc + vite build) must pass. Fix every error you introduce. Report bundle size before/after Framer Motion.
2. `npm --prefix backend run test` must still pass (17 tests per README). Any failure must be explained. Run the new Vitest tests for ai/rules/selectors.
3. Run backend + frontend with the seeded synthetic database (README steps) and walk every changed screen as the seeded doctor in: Arabic RTL and English LTR, light and dark, desktop (>= 1280), tablet (~768), phone (375). Check horizontal overflow and console errors. Test keyboard-only operation of each new feature, and test with prefers-reduced-motion emulated: confirm no transform/layout animation remains. If the database or backend cannot be started here, state exactly which screens were therefore NOT verified; do not claim they work.
4. Run a computed-contrast scan of the doctor workspace in both themes (text vs effective background, AA thresholds) and fix new failures.
5. Run a red-hue scan over the CSS/TSX colours and SVGs you touched; report any red found, including pre-existing.
6. Confirm the PWA still builds a service worker and that no API response is cached.
7. Make ONE batched inspection pass, fix everything it reveals in one batch, confirm once more, then stop. Do not loop on polish.

# 8. Deliverables and report
- This folder is currently NOT a git repository. Do not run `git init` or commit unless asked; list every file added or changed in the report. If git is enabled later, use one commit per numbered item.
- Update DESIGN (2).md (new components, the motion system, patterns, shortcuts) and README.md if setup/usage changes.
- Final report must include: what was implemented per item (5.1-5.10, marking anything skipped and why), main files changed, build/test results, the Framer Motion bundle impact, a specific list of anything you could NOT verify, and any risk or follow-up. Do not claim something works unless you ran it.

# 9. Working rules
- If a requirement conflicts with a hard constraint, follow the constraint and explain the conflict in the report.
- If you must make a product decision that changes behaviour (new stored data, new API usage, new clinical rules beyond the demo rules table), stop and ask instead of guessing.
- Do not invent clinical capabilities, accuracy claims, certifications, testimonials or real patient data.
