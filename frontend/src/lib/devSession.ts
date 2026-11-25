/**
 * Local development only: a restart of the dev server ends the signed-in session, so reopening localhost after
 * stopping `npm run dev` starts from the public home page as on a first visit, even if "keep me signed in" was ticked.
 *
 * vite.config.ts stamps a fresh id into __DEV_SERVER_BOOT__ each time the dev server starts (hot reloads keep it).
 * The id is remembered next to the session; when it differs, the saved session is cleared before the app renders.
 * Production builds leave the id empty, so this never signs anyone out there.
 */
const BOOT_KEY = 'naseej_dev_boot';
const SESSION_KEYS = ['naseej_token', 'naseej_user', 'naseej_org_id'];
// Links that must keep working without a session: a shared record and the emailed account links.
const PUBLIC_HASH = /^#\/(share\/|verify-email\/|reset-password\/|forgot-password)/;

export function endSessionAfterServerRestart(): void {
  const boot = typeof __DEV_SERVER_BOOT__ === 'string' ? __DEV_SERVER_BOOT__ : '';
  if (!boot) return;
  try {
    if (localStorage.getItem(BOOT_KEY) === boot) return;
    const hadSession = SESSION_KEYS.some((k) => localStorage.getItem(k) !== null || sessionStorage.getItem(k) !== null);
    SESSION_KEYS.forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    localStorage.setItem(BOOT_KEY, boot);
    // Drop a leftover workspace address (e.g. "#/patient/home") so the app opens on the public home page.
    if (hadSession && window.location.hash && !PUBLIC_HASH.test(window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch {
    /* storage unavailable: nothing was saved, so there is no session to end */
  }
}
