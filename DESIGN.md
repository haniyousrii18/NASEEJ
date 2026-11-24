# Marja | مرجع — Design System
> Calm clinical teal, now in frosted glass and light: a pale mist canvas by day, deep slate by night, one teal brand and action color that glows where it matters, and the logo's woven mark alive as a 3D network behind heroes and empty space. Public site and signed-in workspaces share one identity and differ only in density.

**Marja brand layer (Nov 2026).** `styles/marja.css` loads after redesign.css. The logo's sky `--logo-sky` #38CFE0 and deep `--logo-deep` #0F7E96 appear only on the mark, the Cairo Black wordmark (`--wordmark`), the logo halo and the focus glow (`--focus-glow`); the UI palette stays teal. Arabic headings use Cairo, body IBM Plex Sans Arabic, Latin Inter. Numbers in the Arabic UI use Arabic-Indic digits (`formatNum`, `localDigits`, and `fill` for numeric placeholders). The sidebar foot carries Settings and a theme / language pair (hidden in the icon rail, always in the account menu). Home has a blood-pressure card (trend + data table from two readings, the reading itself from one, "not recorded" from none, never an interpretation). The timeline groups by month, shows kind chips inline and, from 1200px, opens an event's details in a sticky side panel; an unconfirmed software reading points to its document, where it is confirmed or dismissed. The assistant has a sources aside that lists the citations already in the thread.

**Premium web layer (Nov 2026).** `styles/redesign.css` (loaded last) and theme.css layer 3 apply the web redesign brief: glass surfaces (`--surface-glass`, `--glass-blur`, `--glass-line`, `--glass-shadow[-raised]`), glow (`--glow-primary`, `--glow-amber` for needs-review only), `--hero-gradient`, `--review-amber`, `--revoke-red`, radii `--radius-card` 20 / `--radius-hero` 28, and the motion tokens `--motion-press` 140ms, `--motion-state` 240ms, `--motion-enter` 420ms, `--motion-stagger` 55ms, `--ease-emphasized` (0.2,0,0,1). `components/WovenField.tsx` is the woven network on canvas (`sculpture` landing hero, `field` app background, `waves` home hero and assistant); it pauses off screen and draws a still frame under reduced motion. Where this paragraph and the older sections below disagree (no gradients or shadows in the workspace, 272px sidebar, Cairo, static rows), this paragraph wins.

This file describes what the code **does today**. If code and this file disagree, the code in `frontend/src/styles/theme.css` is the source of truth; fix the file.

History: an earlier `DESIGN.md` described a different reference system ("Bevel", mist-blue, SF Pro) that was never implemented, and `accounts-design.md` was a separate shadcn-style reference for the signed-in app. Both are merged here. The original reference is kept for reading in `docs/archive/accounts-design.reference.md`; it is not a second source of rules.

## 1. Two surfaces, one identity

| Surface | Where | Look |
|---|---|---|
| **Public site** | landing, workflow, login, and the clinician summary page `#/share/<token>` (`landing.css`, `auth.css`, `shell.css`, `share.css`) | Expressive: hero imagery, gradients, large type. Uses the global light/dark preference (`naseej_theme`). |
| **Patient app** | everything under `#/patient` (`app.css`, `health.css`) | Operational: compact, flat, scannable. Own light/dark preference (`naseej_ws_theme`). |

Shared by both: the color tokens below, Cairo (Arabic) and Inter (Latin) type, Arabic RTL as the primary language, English LTR as a full equal.

## 2. Theme isolation (important)
- Tokens live in `frontend/src/styles/theme.css`: `:root` for light and `:root[data-theme='dark']` for dark.
- The signed-in shell applies its own choice through `ThemeContext.workspace` only while it is mounted, and restores the public preference when the user leaves. The public site never reads `naseej_ws_theme`.
- Workspace rules are scoped to `.na-app` or `na-`/`rec-`/`ai-`/`cg-`/`ops-`/`mc-`/`doc-`/`up-`/`hp-`/`sv-` prefixed classes (`hp-` patient-owned record screens in `health.css`; `sv-` the public clinician summary page in `share.css`). Do not restyle a bare element or a global token from workspace CSS.

## 3. Color tokens (real values)

`frontend/src/styles/theme.css` is the single source. Layer 1 holds semantic tokens once per theme; layer 2 keeps the older component names (`--color-bg-canvas`, `--color-ink`, `--color-accent`, `--color-status-*`) as aliases, so components carry no colour literals. Add a colour there, in both themes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f7f9f8` | `#101b22` | page |
| `--surface` | `#ffffff` | `#182830` | cards, sidebar |
| `--surface-muted` | `#eff4f2` | `#131f26` | quiet fields, tinted bands |
| `--surface-raised` | `#ffffff` | `#1f3540` | menus, dialogs, popovers |
| `--primary` / `--primary-hover` | `#137c72` / `#0f665e` | `#59c3b2` / `#79d4c5` | brand, primary action, selected state |
| `--on-primary` | `#ffffff` | `#0a1a1e` | label on a primary fill |
| `--text-primary` | `#182b36` | `#f0f5f3` | text |
| `--text-secondary` / `--text-muted` | `#61717a` / `#5b6b74` | `#a8b7b8` / `#9bacad` | secondary and helper text |
| `--border` / `--border-strong` | `#e1e8e6` / `#728585` | `#2b3d43` / `#6c8486` | hairlines / control edges (3:1) |
| `--accent-surface` | `#bfe9df` | `#203f3a` | tinted selection, hero wash |
| `--focus-ring` | `#137c72` | `#79d4c5` | focus |
| `--surface-inverse` / `--text-inverse` | `#182b36` / `#f0f5f3` | `#1f3540` / `#f0f5f3` | always-dark prompts and callouts |
| `--paper` / `--paper-ink` | `#ffffff` / `#182b36` | same | printed sheet and QR, never themed |

Status tokens (`--warning-*`, `--success-*`, `--danger-*`, `--info-*`, `--neutral-*`, each with `-bg`, `-text`, `-border`; the older `--color-status-{draft,approved,info,danger,lilac}-*` alias them: draft is amber, approved green, info teal, danger red, lilac neutral) are **always paired with a word or glyph**; state is never carried by color alone. Red, amber and green exist only as status tints. `--chart-1..4`, `--chart-grid` and `--chart-axis` are for data marks.

**Theme choice.** Light, dark or system, stored as `naseej_theme` (public site) and `naseej_ws_theme` (workspace), applied before first paint by the inline script in `index.html` and kept by `ThemeContext`. System follows the OS live. The site-bar button cycles light, dark, system; Settings has all three.

## 4. Type
- Arabic `IBM Plex Sans Arabic` (Cairo as fallback), Latin `Inter` (loaded in `index.html`), the same files as the mobile app. No other families.
- Workspaces: body 15px / 1.55, page title ~28–30px weight 600 with slightly tight tracking (−0.015em), card title 16.5px / 620, helper 12.5–13.5px. Public site scales type up with `clamp()`.
- Numbers, MRNs, phone numbers, dates and units inside RTL text use `dir="ltr"` / `.na-ltr` so they stay readable.

## 5. Shape, depth, spacing (workspaces)
Adapted from the reference in `docs/archive/accounts-design.reference.md`: large-radius cards on a hairline, filled quiet fields, capsule controls.

| Element | Spec |
|---|---|
| Card | radius 24px, 1px hairline plus a faint 1px ring and 1px shadow (`--na-card-shadow`), padding `clamp(16px, 2vw, 24px)` |
| Inputs, selects, textareas | radius 18px, filled with `--color-bg-subtle`, no border at rest, border + elevated fill on focus, min height 44px |
| Buttons | capsule (radius 999px), min height 44px (36px small), primary = brand fill with `--on-primary` text, quiet = transparent, danger = status-danger tint |
| Pills / badges | capsule, 12.5px / 560, tinted background + border + text from the status tokens |
| Notices | radius 18px, tinted status background |
| Modals, dialogs | rise in at the centre of the window, focus trapped, Escape closes, focus returns to the opener |
| Spacing | 4px base; gaps `clamp(14px, 2vw, 22px)`; max content width follows the page |
| Shadows | none on the public site and buttons; only the faint card ring in workspaces |

Deliberate differences from the reference: color comes from the Naseej tokens above, not the reference's monochrome; touch targets stay at 44px; the reference's Geist font is **not** used.

## 6. Layout (workspaces)
Floating glass sidebar on the reading-start side (right in Arabic): 248px, an 84px icon rail when collapsed and always between 1024 and 1279px (it opens over the page on hover or focus); the active item is one gradient pill that glides between items. Floating frosted top bar (64px) with the global record search, bell and account menu. Content max 1320px. Below 1024px the sidebar becomes a drawer. The animated line backdrop was removed from the patient app: content sits on a plain canvas.

- **Sidebar:** the patient navigation groups, then a pinned foot with the **Account** group (**Notifications** with its unread badge, then **Settings**) above **Sign out**. There is no public-site link in the sidebar.
- **Top bar, start to end:** (mobile: drawer button) | the **collapse/expand toggle** (desktop only, between the sidebar and the page name) | page name | **notification bell** with unread count | theme | language | account menu.
- **A closed drawer stays inside the viewport.** The closed workspace drawer and the public menu are hidden with `opacity` and `visibility`, never parked off-screen with a large `translateX`: Android Chrome counts a fixed element outside the viewport toward the page width, which leaves a blank band and sideways scrolling.
- **Public site bar:** brand, then icon-only buttons at every width: install (only when available), theme, language, sign in, and the menu button last. There is no "request a demo" link in the bar (it stays on the home page and the login page).

## 7. Components (workspaces)
`PageHead`, `Card`, `Stat`, `Pill`, `Notice`, `Button`, `Field`, `EmptyState`, `Loading` (skeleton), `ErrorState`, `Async`, `Dialog`, `Drawer` in `app/ui.tsx`. Domain pieces: **Settings** (`app/pages/settings.tsx`, `.na-set-*`: a vertical tab list on the reading side beside one content card; tabs depend on the role; below 900px the tabs become a scrolling row inside their own strip; type is compact and fluid, 12.5 to 14px; every panel stays mounted so unsaved edits survive a tab switch; no instructional or explanatory text, only labels, values and feedback), **Notifications** (`app/notifications`, `.na-nt-*`: bell, panel and inbox; state is shown with a glyph and a word, never colour alone; quick actions are separate buttons from the item body), record `Timeline`, `ReviewPill`/`ProvenancePill`. The patient-record screens (`app/health`, `hp-` classes): Today action tiles, severity segmented control, undo toast, dictation button and check step, assistant thread with citations and a dashed draft card, visit-summary editor, QR panel, and the shared `SnapshotView` used for the preview, print and clinician page. An unconfirmed AI reading is always dashed and labelled; an urgent assistant message is bordered, tinted and prefixed with "!".

## 7b. Patient screens (health.css)
- **One rhythm:** sections 28px apart (`hp-stack`), items 12px; each page has one primary action (a filled button in the page head or the Today hero), everything else is quiet.
- **Rows, not cards in cards:** lists of facts, documents and shares are hairline-separated rows (`hp-entry`, `hp-doc`, `hp-share`, `hp-row`); a card is used only for a single self-contained task (the assistant panel, the summary editor sections).
- **Quiet provenance:** what the patient typed shows as a plain line (`hp-source`); only things that did not come from them (a document, a clinician, a machine reading) get a pill. Unconfirmed machine readings stay dashed.
- **Filters on demand** (`hp-filterbar`, details disclosure); the assistant splits into Ask / Record a symptom / Search tabs (`hp-modes`).
- **Phone:** a bottom tab bar (`hp-tabbar`: Today, Symptoms, Documents, Assistant, More) replaces the top-bar menu button; the top bar keeps only the bell and the account menu (language, theme, sign out live there).
- **Sharing shows its consequences** (`hp-willshare`): items, documents, identity, end time and how to revoke, before the confirm dialog repeats them.

## 7c. UI kit (ui-kit.css, scoped to .na-app)
One scale for the whole patient app; change a token, not a screen.
- **Sizes:** controls and buttons 48px (`--na-h-control`), compact buttons and chips 40px (`--na-h-small`); text in fields is 16px so phones do not zoom on focus; labels 14px / 620.
- **Radii:** controls 14, inset panels and notices 16, cards and dialogs 24, buttons and chips pills.
- **Fields have a visible edge:** a 1px border mixed 50% ink into the surface (`--na-control-border`, at least 3:1), filled with the canvas colour so a field reads as an inset on a card; focus is an accent border plus a 3px ring; invalid is a danger border plus a message under the field; disabled is dashed and muted.
- **Dropdowns** are one component (`app/Select.tsx`, a drop-in for <select> with <option> children): a field-like trigger with a drawn chevron, and a list of large rows with a radio mark at the end, the selected row outlined in the accent. It opens under the field (above when there is no room), is portalled into `.na-app` so dialogs and sheets never clip it, becomes a bottom sheet on phones, and follows the ARIA combobox/listbox pattern (arrows, Home/End, typing, Enter, Escape closes only the menu). Do not use a native <select>.

**Calendar.** Every date field uses `app/DatePicker.tsx` instead of `<input type="date">`: a field-like trigger with a calendar icon, and a popover with a month header (previous / next, tap the title to pick a month and year), a 6-week day grid, and Clear / Today at the foot. The selected day is outlined in the accent colour; days outside `min`/`max` are muted and struck through and cannot be chosen. It becomes a bottom sheet on phones, follows RTL (Arabic digits and weekday names), and is keyboard operable (arrows, PageUp/PageDown, Home/End, Enter, Escape closes only the calendar).
- **Field** (`app/ui.tsx`): label always visible, "required" in words, one-line help, specific error beside the control wired with aria-invalid and aria-describedby.
- **Filters** (`app/health/filters.tsx`): optional search, a Filters button with a count, a grouped panel (chips, date range, selects) that applies live, and the active filters as removable chips with Clear all, always visible.
- **Chips, segmented choices and tabs** share one family; a selected chip shows a drawn check, never colour alone.
- **Forms open in a centered modal** (`Drawer` in `app/ui.tsx`, `md` 560px, `lg` 760px for the longest, such as sharing; 12px margins on phones; no side sheets). The header and the action bar stay fixed and only the fields scroll, with soft edge shadows, and only when they do not fit. Modals are portalled into `.na-app` because the page wrapper keeps a transform that would otherwise anchor `position: fixed` to the page.
- **Containers:** a card carries one task; a card inside a card is flattened; elevation is a hairline for cards and a soft lift for menus, dialogs and sheets. Side-sheet forms keep their actions in a sticky footer.
- **Sidebar:** plain surface, 48px items, accent-tinted active item with a start marker, account group below a hairline; the role label is not repeated.

## 7d. Timeline (health.css, `hp-tl-`)
Read-only. A card on a thread (36px glyph dot, hairline card); origin is always a glyph plus a word (software reading, reported by you, recorded by a clinician, uploaded file) and a software reading is dashed. A flag (needs checking, conflicting readings, date not found) is a pill with a glyph and a word, plus a coloured inline-start edge. Source is one disclosure per card: document, page, quoted passage, confidence band, why it was surfaced, and links to a conflicting event. Clinical text is shown as written, never translated. The only action is "Prepare for a visit": checkboxes on cards, a sticky tray with the count, and a review drawer that creates a summary from the chosen events. Choosing never changes an event, and summary items taken from the record are read-only.

## 8. Clinical content rules (design-level)
- Provenance (who or what the entry came from) and review state are visible on every record. "Not recorded" never reads as "absent".
- AI-derived content is dashed-bordered, labelled "AI-generated", carries its source page and passage, and is never styled like confirmed data until the patient confirms it.
- Unconfirmed AI readings stay separate from confirmed entries, and a shared snapshot contains only what the patient selected.
- The assistant and symptom forms show the fixed emergency message when the server flags emergency wording; apart from that the interface carries no instructional or warning banners, only errors, validation and confirmations.

## 9. Accessibility and language
- Visible focus ring on everything interactive; keyboard-operable controls; skip link; page title receives focus on route change.
- Logical CSS properties (`inline-start`, `inset-inline`, `padding-inline`) so RTL needs no mirrored stylesheet.
- Both languages ship together: Arabic is the source and English is typed against it (`app/i18n`), so a missing string is a compile error.
- The public site (landing, login) always plays its motion, even when the system asks for reduced motion (product decision). The signed-in workspace still honours `prefers-reduced-motion`: it turns off backdrop drift, progress easing and page rise.

## 10. Do and don't
- Do reuse the tokens in section 3; add a new token in `theme.css` for both themes if one is genuinely needed.
- Do keep app styling under the scoped prefixes.
- Don't introduce a second brand color, a new font family, gradients on workspace surfaces, or decorative shadows.
- Don't change `landing.css`, `auth.css` or the public components when styling the app, and vice versa.
- Don't signal state by color alone.
- Don't add instructional or explanatory copy to Settings or to cards; keep labels, values, errors and confirmations.
- Don't position a fixed panel outside the viewport to hide it.
