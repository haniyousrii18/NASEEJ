# Naseej | نَسيج — Design System
> Calm clinical warmth: warm ivory by day, warm onyx by night, one orange action color. Public site and signed-in workspaces share one identity and differ only in density.

This file describes what the code **does today**. If code and this file disagree, the code in `frontend/src/styles/theme.css` is the source of truth; fix the file.

History: an earlier `DESIGN.md` described a different reference system ("Bevel", mist-blue, SF Pro) that was never implemented, and `accounts-design.md` was a separate shadcn-style reference for the signed-in app. Both are merged here. The original reference is kept for reading in `docs/archive/accounts-design.reference.md`; it is not a second source of rules.

## 1. Two surfaces, one identity

| Surface | Where | Look |
|---|---|---|
| **Public site** | landing, features, workflow, demo request, login (`landing.css`, `auth.css`, `shell.css`) | Expressive: hero imagery, gradients, large type. Uses the global light/dark preference (`naseej_theme`). |
| **Workspaces** | everything under `#/patient`, `#/caregiver`, `#/doctor`, `#/reception`, `#/manager`, `#/coordinator`, `#/admin` (`app.css`, `doctor.css`) | Operational: compact, flat, scannable. Own light/dark preference (`naseej_ws_theme`). |

Shared by both: the color tokens below, Cairo (Arabic) and Inter (Latin) type, Arabic RTL as the primary language, English LTR as a full equal.

## 2. Theme isolation (important)
- Tokens live in `frontend/src/styles/theme.css`: `:root` for light and `:root[data-theme='dark']` for dark.
- The signed-in shell applies its own choice through `ThemeContext.workspace` only while it is mounted, and restores the public preference when the user leaves. The public site never reads `naseej_ws_theme`.
- Workspace rules are scoped to `.na-app` or `na-`/`rec-`/`ai-`/`cg-`/`ops-`/`mc-`/`doc-`/`up-` prefixed classes. Do not restyle a bare element or a global token from workspace CSS.

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
Sidebar (272px, collapsible to a 76px rail that opens on hover or focus) + top bar (64px) + content. Below 1024px the sidebar becomes a drawer. A faint animated line backdrop sits behind content (`AppBackdrop`) and is disabled for reduced motion.

- **Sidebar:** the role's navigation groups, then a pinned foot with the **Account** group (**Notifications** with its unread badge, then **Settings**) above **Sign out**. There is no public-site link in the sidebar.
- **Top bar, start to end:** (mobile: drawer button) | the **collapse/expand toggle** (desktop only, between the sidebar and the page name) | page name | center switcher (when the person has several) | **notification bell** with unread count | theme | language | account menu.
- **A closed drawer stays inside the viewport.** The closed workspace drawer and the public menu are hidden with `opacity` and `visibility`, never parked off-screen with a large `translateX`: Android Chrome counts a fixed element outside the viewport toward the page width, which leaves a blank band and sideways scrolling.
- **Public site bar:** brand, then icon-only buttons at every width: install (only when available), theme, language, sign in, and the menu button last. There is no "request a demo" link in the bar (it stays on the home page and the login page).

## 7. Components (workspaces)
`PageHead`, `Card`, `Stat`, `Pill`, `Notice`, `Button`, `Field`, `EmptyState`, `Loading` (skeleton), `ErrorState`, `Async`, `Dialog`, `Drawer` in `app/ui.tsx`. Domain pieces: **Settings** (`app/pages/settings.tsx`, `.na-set-*`: a vertical tab list on the reading side beside one content card; tabs depend on the role; below 900px the tabs become a scrolling row inside their own strip; type is compact and fluid, 12.5 to 14px; every panel stays mounted so unsaved edits survive a tab switch; no instructional or explanatory text, only labels, values and feedback), **Notifications** (`app/notifications`, `.na-nt-*`: bell, panel and inbox; state is shown with a glyph and a word, never colour alone; quick actions are separate buttons from the item body), record `Timeline`, `ReviewPill`/`ProvenancePill`, `AiPanel` (AI suggestions), the reception calendar, the manager calendar (counts only), caregiver scope lists, operational message list.

## 8. Clinical content rules (design-level)
- Provenance (who or what the entry came from) and review state are visible on every record. "Not recorded" never reads as "absent".
- AI-derived content is dashed-bordered, labelled "AI-generated", carries its source page and passage, and is never styled like confirmed data until a clinician accepts it.
- Drafts and unreviewed items never appear in patient or caregiver views.
- No banners or warnings about emergencies are shown on messaging and question screens (removed by product decision); the interface carries no instructional or warning banners, only errors, validation and confirmations.

## 9. Accessibility and language
- Visible focus ring on everything interactive; keyboard-operable controls; skip link; page title receives focus on route change.
- Logical CSS properties (`inline-start`, `inset-inline`, `padding-inline`) so RTL needs no mirrored stylesheet.
- Both languages ship together: Arabic is the source and English is typed against it (`app/i18n`), so a missing string is a compile error.
- The public site (landing, login) always plays its motion, even when the system asks for reduced motion (product decision). The signed-in workspace still honours `prefers-reduced-motion`: it turns off backdrop drift, progress easing and page rise.

## 10. Do and don't
- Do reuse the tokens in section 3; add a new token in `theme.css` for both themes if one is genuinely needed.
- Do keep workspace-only styling under the scoped prefixes.
- Don't introduce a second brand color, a new font family, gradients on workspace surfaces, or decorative shadows.
- Don't change `landing.css`, `auth.css` or the public components when styling a workspace, and vice versa.
- Don't signal state by color alone.
- Don't add instructional or explanatory copy to Settings or to cards; keep labels, values, errors and confirmations.
- Don't position a fixed panel outside the viewport to hide it.
