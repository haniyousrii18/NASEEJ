# Installable app (PWA)

Naseej can be installed as an app on computers and phones. It is a standard progressive web app built with `vite-plugin-pwa` (Workbox `generateSW`). Nothing here changes who can see what: the service worker never stores protected data.

## What is installed
- **Manifest** (`/manifest.webmanifest`, generated from `frontend/vite.config.ts`): name "Naseej | نَسيج — Connected Healthcare Platform", short name "نَسيج", `display: standalone`, `orientation: any`, `lang: ar`, `dir: rtl`, theme and background `#f7f9f8`. `start_url`, `scope`, `id` and the icon paths are relative (`./`, `icons/...`), so they follow the deployment base path.
- **Icons** (`frontend/public/icons`): 192 and 512 px (`any`), a 512 px maskable icon, and a 180 px Apple touch icon. `index.html` carries the theme-color and Apple home-screen meta tags.
- **Base path:** one constant, `BASE` at the top of `vite.config.ts` (default `/`). The manifest paths, the navigation fallback and the API exclusion all use it. If the app moves under a sub-path, change `BASE` and rebuild.

## Caching rules (healthcare-safe)
| What | Strategy |
|---|---|
| Built JS, CSS, HTML, icons, logo | Precached, versioned by content hash; old caches are removed on update |
| Navigation to any app route | Falls back to the precached `index.html` (the app uses hash routes, so deep links work offline for the shell), except under `/api/` |
| `/api/*` | **NetworkOnly.** Never read from or written to Cache Storage: no patient, document, share, assistant or notification data is cached |
| Google Fonts stylesheet / font files | Stale-while-revalidate / cache-first (public, non-personal) |
| Everything else | Not cached |

No clinical data is put in IndexedDB or local storage for offline use, and no write is queued for later. Offline, the interface shell opens and a notice says that records, appointments, messages and documents need a connection; nothing a user submits is sent until the connection is back. A **Retry** button makes a real, uncached request to the app's own origin before it declares the connection back.

## Install flows
The install action is an icon button in the public site bar (and a one-time suggestion on the home page, dismissed for 30 days). It is hidden when the app already runs installed (display-mode listener, `appinstalled` event) or when no install route exists (for example desktop Firefox).
- **Chrome, Edge, Android:** the browser's `beforeinstallprompt` event is held and the button opens the native prompt. Success is taken from `appinstalled`, never assumed.
- **Browsers without that event:** a small panel gives the right manual steps: Chromium menu or address-bar icon, macOS Safari "Add to Dock" (Sonoma or later), iPhone and iPad Share > Add to Home Screen (other iOS browsers: use Share, or open the site in Safari).
- Installation needs HTTPS. `localhost` counts as secure. The service worker is off under `npm run dev` (`devOptions.enabled: false`) because it is rebuilt on every edit and shows the update prompt on each load; test install and offline with `npm --prefix frontend run build` then `npm --prefix frontend run preview`.

## Updates
The worker is registered with the `prompt` strategy: a new version waits until the user accepts the banner ("Update now"). The app checks for a new version hourly and when the tab becomes visible again. "Later" brings the banner back after 30 minutes, so nobody stays on an old version indefinitely. Before reloading, the current workspace view is remembered (view name only) and restored. A registration failure is logged and the app keeps working without offline support.

## Limitations
- Installation was exercised through the build output and the local dev server only; it has not been tested on physical devices or every browser/OS version.
- No screenshots are declared in the manifest (browsers show a plain install dialog).
- Hosting must serve `sw.js` and `manifest.webmanifest` over HTTPS from the app's base path.
