# Naseej | نَسيج — Design System
> Calm clinical warmth: warm ivory by day, warm onyx by night, one orange action color. Public site and signed-in workspaces share one identity and differ only in density.

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

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg-canvas` | `#faf7f4` warm ivory | `#1a1411` warm onyx | page |
| `--color-bg-elevated` / `--color-cloud-card` | `#ffffff` | `#241c18` | cards, sidebar |
| `--color-bg-subtle` | `#f3eee9` | `#1d1612` | quiet fields, tinted bands |
| `--color-cloud-card-hover` | `#f1ebe6` | `#2e2420` | hover |
| `--color-ink` / `--color-text-primary` | `#1f1a17` | `#f3ebe3` | text |
| `--color-body-gray` / secondary | `#5e5650` | `#cdbfb4` | secondary text |
| `--color-text-muted` | `#6e655e` | `#b3a498` | helper text |
| `--color-border-subtle` | ink at 10% | ivory at 10% | hairlines |
| `--color-border-strong` | ink at 30% | ivory at 34% | controls |
| `--color-accent` | `#c2410c` orange | `#c2410c` | primary action, selected state |
| `--color-accent-hover` | `#9a3412` | `#d9480f` | |
| `--color-accent-text` | `#b4380a` | `#fdba74` | orange used as text |
| `--color-focus-ring` | `#b4380a` | (accent tint) | focus |

Status tokens (`--color-status-{draft,approved,info,danger,lilac}-{bg,text,border}`) are muted and **always paired with a word or glyph**; state is never carried by color alone. Orange is the only chromatic brand color. Green, amber-red and lilac exist only as status tints.

## 4. Type
- Arabic `Cairo`, Latin `Inter` (loaded in `index.html`), with system fallbacks. No other families.
- Workspaces: body 15px / 1.55, page title ~28–30px weight 600 with slightly tight tracking (−0.015em), card title 16.5px / 620, helper 12.5–13.5px. Public site scales type up with `clamp()`.
- Numbers, MRNs, phone numbers, dates and units inside RTL text use `dir="ltr"` / `.na-ltr` so they stay readable.

## 5. Shape, depth, spacing (workspaces)
Adapted from the reference in `docs/archive/accounts-design.reference.md`: large-radius cards on a hairline, filled quiet fields, capsule controls.

| Element | Spec |
|---|---|
| Card | radius 24px, 1px hairline plus a faint 1px ring and 1px shadow (`--na-card-shadow`), padding `clamp(16px, 2vw, 24px)` |
| Inputs, selects, textareas | radius 18px, filled with `--color-bg-subtle`, no border at rest, border + elevated fill on focus, min height 44px |
| Buttons | capsule (radius 999px), min height 44px (36px small), primary = orange fill with white text, quiet = transparent, danger = status-danger tint |
| Pills / badges | capsule, 12.5px / 560, tinted background + border + text from the status tokens |
| Notices | radius 18px, tinted status background |
| Drawers, dialogs | slide in from the reading-end edge, focus trapped, Escape closes, focus returns to the opener |
| Spacing | 4px base; gaps `clamp(14px, 2vw, 22px)`; max content width follows the page |
| Shadows | none on the public site and buttons; only the faint card ring in workspaces |

Deliberate differences from the reference: color comes from the Naseej tokens above, not the reference's monochrome; touch targets stay at 44px; the reference's Geist font is **not** used.

## 6. Layout (workspaces)
Sidebar (272px, collapsible to a 76px rail that opens on hover or focus) + top bar (64px) + content. Below 1024px the sidebar becomes a drawer. The animated line backdrop was removed from the patient app: content sits on a plain canvas.

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
- **Field** (`app/ui.tsx`): label always visible, "required" in words, one-line help, specific error beside the control wired with aria-invalid and aria-describedby.
- **Filters** (`app/health/filters.tsx`): optional search, a Filters button with a count, a grouped panel (chips, date range, selects) that applies live, and the active filters as removable chips with Clear all, always visible.
- **Chips, segmented choices and tabs** share one family; a selected chip shows a drawn check, never colour alone.
- **Containers:** a card carries one task; a card inside a card is flattened; elevation is a hairline for cards and a soft lift for menus, dialogs and sheets. Side-sheet forms keep their actions in a sticky footer.
- **Sidebar:** plain surface, 48px items, accent-tinted active item with a start marker, account group below a hairline; the role label is not repeated.

## 8. Clinical content rules (design-level)
- Provenance (who or what the entry came from) and review state are visible on every record. "Not recorded" never reads as "absent".
- AI-derived content is dashed-bordered, labelled "AI-generated", carries its source page and passage, and is never styled like confirmed data until a clinician accepts it.
- Drafts and unreviewed items never appear in patient or caregiver views.
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
