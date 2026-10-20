import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useLang } from '../context/LangContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { AppIcon } from './AppIcons.js';
import { UNAUTHORIZED_EVENT } from './api.js';
import { NAV, ROLE_BASE, appRoleOf, belongsToRole, currentItem, homeRoute, isActive } from './nav.js';
import { resolvePage } from './routes.js';
import { WorkspaceMotion } from '../components/motion.js';
import { NotificationBell } from './notifications/NotificationBell.js';
import { NotificationsProvider, useUnreadCount } from './notifications/NotificationsContext.js';
import { useA } from './useA.js';
import { useAppRoute } from './useAppRoute.js';
import { fill, formatDate } from './format.js';
import { EmptyState } from './ui.js';
import { lockScroll, trapTab, useMediaQuery } from '../lib/overlay.js';

const PEEK_OPEN_DELAY = 80; // ms of hover before a collapsed sidebar opens, so a pointer passing by does not trigger it
const PEEK_CLOSE_DELAY = 220; // ms of grace after leaving, so crossing gaps between items does not flicker

const COLLAPSE_KEY = 'naseej_app_sidebar'; // a single UI preference: no identifiers, no clinical data

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

/** The four things a patient does most, kept one tap away on a phone. Everything else is under "More". */
const TAB_ITEMS = [
  { route: 'patient/home', label: 'patientHome', icon: 'home', key: 'today' },
  { route: 'patient/timeline', label: 'patientTimeline', icon: 'timeline', key: 'symptoms' },
  { route: 'patient/documents', label: 'patientDocuments', icon: 'documents', key: 'documents' },
  { route: 'patient/assistant', label: 'patientAssistant', icon: 'pulse', key: 'assistant' },
] as const;

interface Props {
  currentView: string;
  setCurrentView: (view: string) => void;
}

/**
 * Frame of the signed-in application: role-aware sidebar, compact top bar, content area.
 * It has its own markup and styles (app.css); the public site bar and footer are not rendered here.
 * Visibility of an item is a convenience. Every endpoint behind a page checks authorization on the server.
 */
const AppShellInner: React.FC<Props> = ({ setCurrentView }) => {
  const { user, currentRole, currentOrgId, logout } = useAuth();
  const { lang, setLang, isRtl } = useLang();
  const { workspace } = useTheme();
  const wsTheme = workspace.theme;
  const { enter: enterWorkspace, leave: leaveWorkspace } = workspace;
  // The workspace has its own light/dark choice, applied only while this shell is mounted.
  useEffect(() => {
    enterWorkspace();
    return leaveWorkspace;
  }, [enterWorkspace, leaveWorkspace]);
  const A = useA();
  const unreadCount = useUnreadCount();

  const role = appRoleOf(currentRole);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerBtnRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // A collapsed sidebar opens over the page while the pointer (mouse or pen on a hover-capable device) or keyboard
  // focus is inside it. Touch has no reliable hover, so there the toggle button is the way to expand it.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [hoverPeek, setHoverPeek] = useState(false);
  const [focusPeek, setFocusPeek] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);
  const schedulePeek = (on: boolean) => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setHoverPeek(on), on ? PEEK_OPEN_DELAY : PEEK_CLOSE_DELAY);
  };
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  const allowed = useCallback((r: string) => (role ? belongsToRole(r, role) : false), [role]);
  const { route, navigate } = useAppRoute(allowed, role ? homeRoute(role) : '');

  const signOut = useCallback(() => {
    logout();
    setCurrentView('login');
  }, [logout, setCurrentView]);

  // Not signed in (for example a stale link): back to the login page.
  useEffect(() => {
    if (!user) setCurrentView('login');
  }, [user, setCurrentView]);

  // The server rejected the session on any request: sign out cleanly instead of showing broken pages.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, [signOut]);

  const found = role ? currentItem(role, route) : null;
  const pageLabel = found ? A.nav.items[found.item.label] : '';

  // Per-route housekeeping: close the drawer, move focus to the page title for screen readers, set the tab title.
  useEffect(() => {
    setDrawer(false);
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const raf = requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [route]);

  useEffect(() => {
    const previous = document.title;
    if (pageLabel) document.title = `${pageLabel} | ${isRtl ? 'نَسيج' : 'Naseej'}`;
    return () => {
      document.title = previous;
    };
  }, [pageLabel, isRtl]);

  // The drawer only exists below 1024px; if the window grows past that, it closes.
  useEffect(() => {
    if (isDesktop) setDrawer(false);
  }, [isDesktop]);

  // Drawer: Escape closes, scrolling behind it is locked without shifting the page, focus enters, stays inside and returns.
  useEffect(() => {
    if (!drawer) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false);
        drawerBtnRef.current?.focus({ preventScroll: true });
      } else {
        trapTab(e, sideRef.current);
      }
    };
    document.addEventListener('keydown', onKey);
    sideRef.current?.querySelector<HTMLElement>('[aria-current="page"], button')?.focus({ preventScroll: true });
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
    };
  }, [drawer]);

  // The account menu closes on Escape or an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.na-account')) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* the preference simply lasts for this page view */
      }
      return !c;
    });
  };

  const memberships = user?.memberships ?? [];
  const displayName = (isRtl ? user?.fullNameAr : user?.fullNameEn) || user?.fullNameEn || '';
  const roleLabel = role ? A.common.roles[role] : '';
  // A hash that only changes its query ("?appointment=...") keeps the same route, but the page still has to see it.
  const [hashTick, setHashTick] = useState(0);
  useEffect(() => {
    const on = () => setHashTick((t) => t + 1);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const page = useMemo(() => (role ? resolvePage(route, { role, navigate }) : null), [route, role, navigate, hashTick]);

  if (!user) return null;

  const peeking = collapsed && isDesktop && ((canHover && hoverPeek) || focusPeek);
  const rail = collapsed && isDesktop && !peeking;

  const otherLang = lang === 'ar' ? 'en' : 'ar';
  const otherLangName = lang === 'ar' ? 'English' : 'العربية';
  const themeLabel = wsTheme === 'dark' ? A.care.theme.toLight : A.care.theme.toDark;

  return (
    <div className="na-app" data-collapsed={collapsed} data-peek={peeking} data-rail={rail} data-drawer={drawer ? 'open' : 'closed'} data-role={role ?? 'none'} data-ws-theme={wsTheme}>
      <a className="na-skip" href="#na-main">
        {A.common.shell.skip}
      </a>

      <aside
        className="na-side"
        ref={sideRef}
        id="na-sidebar"
        aria-label={A.common.shell.primaryNav}
        aria-modal={drawer ? 'true' : undefined}
        role={drawer ? 'dialog' : 'complementary'}
        onPointerEnter={(e) => {
          if (canHover && collapsed && e.pointerType !== 'touch') schedulePeek(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch') schedulePeek(false);
        }}
        onFocus={(e) => {
          if (collapsed && (e.target as HTMLElement).matches(':focus-visible')) setFocusPeek(true);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusPeek(false);
        }}
      >
        <div className="na-side-head">
          <div className="na-brand">
            <img src="/logo-mark.svg" alt="" width={40} height={40} />
            <span className="na-brand-text">
              <span className="na-brand-name">{isRtl ? 'نَسيج' : 'Naseej'}</span>
              <span className="na-brand-role">{roleLabel}</span>
            </span>
          </div>
          <button
            type="button"
            className="na-drawer-close"
            onClick={() => {
              setDrawer(false);
              drawerBtnRef.current?.focus();
            }}
            aria-label={A.common.shell.closeMenu}
          >
            <AppIcon name="close" size={18} />
          </button>
        </div>

        <nav className="na-nav" aria-label={A.common.shell.primaryNav}>
          {role &&
            NAV[role]
              .filter((group) => group.id !== 'account')
              .map((group) => (
              <div key={group.id}>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.route}>
                      <button
                        type="button"
                        className="na-nav-link"
                        aria-current={isActive(item, route) ? 'page' : undefined}
                        title={rail ? A.nav.items[item.label] : undefined}
                        onClick={() => {
                          navigate(item.route);
                          setDrawer(false);
                        }}
                      >
                        <AppIcon name={item.icon} className="na-icon" />
                        <span className="na-nav-label">{A.nav.items[item.label]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </nav>

        <div className="na-side-foot">
          {role &&
            NAV[role]
              .filter((group) => group.id === 'account')
              .map((group) => (
                <div key={group.id}>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.route}>
                        <button
                          type="button"
                          className="na-nav-link"
                          aria-current={isActive(item, route) ? 'page' : undefined}
                          title={rail ? A.nav.items[item.label] : undefined}
                          onClick={() => {
                            navigate(item.route);
                            setDrawer(false);
                          }}
                        >
                          <AppIcon name={item.icon} className="na-icon" />
                          <span className="na-nav-label">{A.nav.items[item.label]}</span>
                          {item.label === 'notifications' && unreadCount > 0 && (
                            <span className="na-nav-badge" role="status" aria-label={fill(A.notifications.unreadLabel, { n: unreadCount })}>
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          <button type="button" className="na-nav-link" onClick={signOut} title={rail ? A.common.shell.signOut : undefined}>
            <AppIcon name="logout" className="na-icon" />
            <span className="na-nav-label">{A.common.shell.signOut}</span>
          </button>
        </div>
      </aside>

      <div
        className="na-scrim"
        onClick={() => {
          setDrawer(false);
          drawerBtnRef.current?.focus();
        }}
        aria-hidden="true"
      />

      <div className="na-main">
        <header className="na-top">
          <button
            type="button"
            className="na-icon-btn na-menu-btn"
            ref={drawerBtnRef}
            aria-expanded={drawer}
            aria-controls="na-sidebar"
            aria-label={drawer ? A.common.shell.closeMenu : A.common.shell.menu}
            onClick={() => setDrawer((d) => !d)}
          >
            <AppIcon name={drawer ? 'close' : 'menu'} />
          </button>

          {isDesktop && (
            <button
              type="button"
              className="na-icon-btn na-collapse-btn"
              onClick={toggleCollapsed}
              aria-pressed={collapsed}
              aria-controls="na-sidebar"
              aria-label={collapsed ? A.common.shell.expand : A.common.shell.collapse}
              title={collapsed ? A.common.shell.expand : A.common.shell.collapse}
            >
              <AppIcon name="collapse" className="na-collapse-icon" />
            </button>
          )}

          <div className="na-top-title">
            <span className="na-top-page">{pageLabel}</span>
          </div>

          <div className="na-top-spacer" />

          {role && <NotificationBell role={role} navigate={navigate} />}

          <div className="na-account">
            <button
              type="button"
              className="na-account-btn"
              ref={menuBtnRef}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`${A.common.shell.account}: ${displayName}`}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="na-avatar" aria-hidden="true">
                {displayName.trim().charAt(0)}
              </span>
              <span className="na-account-text">
                <span className="na-account-name">{displayName}</span>
              </span>
            </button>
            {menuOpen && (
              <div className="na-menu" role="menu">
                <div className="na-menu-meta">
                  <div>{displayName}</div>
                  {role !== 'patient' && role !== 'platform_admin' && memberships.length > 0 && (
                    <div>{(isRtl ? memberships.find((m) => m.organization_id === currentOrgId)?.organization_name_ar : memberships.find((m) => m.organization_id === currentOrgId)?.organization_name_en) || ''}</div>
                  )}
                  <div>{formatDate(lang, new Date())}</div>
                </div>
                <button type="button" role="menuitem" className="na-menu-item" lang={otherLang} onClick={() => { setLang(otherLang); setMenuOpen(false); }}>
                  <AppIcon name="globe" size={18} />
                  {otherLangName}
                </button>
                <button type="button" role="menuitem" className="na-menu-item" onClick={() => { workspace.setTheme(wsTheme === 'dark' ? 'light' : 'dark'); setMenuOpen(false); }}>
                  <AppIcon name={wsTheme === 'dark' ? 'sun' : 'moon'} size={18} />
                  {themeLabel}
                </button>
                <button type="button" role="menuitem" className="na-menu-item" onClick={signOut}>
                  <AppIcon name="logout" size={18} />
                  {A.common.shell.signOut}
                </button>
              </div>
            )}
          </div>
        </header>

        <main id="na-main" className="na-content" tabIndex={-1}>
          {role ? (
            <div className="na-rise" key={route}>
              {page}
            </div>
          ) : (
            <EmptyState
              title={A.nav.noWorkspaceTitle}
              body={A.nav.noWorkspaceBody}
              action={
                <button type="button" className="na-btn" onClick={signOut}>
                  {A.common.shell.signOut}
                </button>
              }
            />
          )}
        </main>
      </div>

      {role && (
        <nav className="hp-tabbar" aria-label={A.common.shell.primaryNav}>
          {TAB_ITEMS.map((t) => (
            <button key={t.route} type="button" className="hp-tab" aria-current={isActive({ route: t.route, label: t.label, icon: t.icon }, route) ? 'page' : undefined} onClick={() => navigate(t.route)}>
              <AppIcon name={t.icon} size={22} />
              <span>{A.health.shell[t.key]}</span>
            </button>
          ))}
          <button type="button" className="hp-tab" aria-expanded={drawer} aria-controls="na-sidebar" onClick={() => setDrawer((d) => !d)}>
            <AppIcon name="menu" size={22} />
            <span>{A.health.shell.more}</span>
          </button>
        </nav>
      )}
    </div>
  );
};

/** The notification state (unread count, newest items) lives above the shell so the bell and the inbox share it. */
export const AppShell: React.FC<Props> = (props) => {
  const { currentRole } = useAuth();
  const role = appRoleOf(currentRole);
  return (
    <WorkspaceMotion>
      {role ? (
        <NotificationsProvider role={role}>
          <AppShellInner {...props} />
        </NotificationsProvider>
      ) : (
        <AppShellInner {...props} />
      )}
    </WorkspaceMotion>
  );
};

export { ROLE_BASE };
