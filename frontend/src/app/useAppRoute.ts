import { useCallback, useEffect, useState } from 'react';

/**
 * A tiny hash router for the authenticated shell: "#/doctor/patient/<id>/timeline".
 * The site itself has no router (it switches a `currentView` state), so the shell keeps its own pages
 * in the URL hash. That gives deep links and a working back button without touching the site's routing.
 * Only a route is stored in the URL, never a name, a token or any record content.
 */
const read = (): string => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return raw.split('?')[0].replace(/\/+$/, '');
};

export function useAppRoute(isAllowed: (route: string) => boolean, fallback: string) {
  const [route, setRoute] = useState<string>(() => {
    const initial = read();
    return initial && isAllowed(initial) ? initial : fallback;
  });

  useEffect(() => {
    const onHash = () => {
      const next = read();
      setRoute(next && isAllowed(next) ? next : fallback);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [isAllowed, fallback]);

  // Keep the URL honest when the requested route was refused or empty.
  useEffect(() => {
    if (read() !== route) window.history.replaceState(null, '', `#/${route}`);
  }, [route]);

  // Leaving the shell (sign-out, public pages) should not leave an internal route in the address bar.
  useEffect(
    () => () => {
      if (window.location.hash.startsWith('#/')) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    },
    [],
  );

  const navigate = useCallback((next: string) => {
    if (read() === next) return;
    window.location.hash = `#/${next}`;
  }, []);

  return { route, navigate };
}
