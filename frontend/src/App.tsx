import React, { useEffect, useState } from 'react';
import { LangProvider, useLang } from './context/LangContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { MotionRoot, PageTransition } from './components/motion.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { PublicHome } from './pages/PublicHome.js';
import { WorkflowPage } from './pages/WorkflowPage.js';
import { LoginPage, type AccessMode } from './pages/LoginPage.js';
import { ShareView, isShareRoute } from './pages/ShareView.js';
import { PwaPrompts, PWA_RESTORE_KEY } from './pwa/PwaPrompts.js';
import { InstallProvider } from './pwa/InstallContext.js';
import './styles/theme.css';
import './styles/shell.css';
import './styles/landing.css';
import './styles/auth.css';
import './styles/app.css';
import './styles/ui-kit.css';
import './styles/health.css';
import { AppShell } from './app/AppShell.js';
import { AUTHENTICATED_VIEWS } from './app/nav.js';

/**
 * The links in account emails: #/verify-email/<token>, #/reset-password/<token> and #/forgot-password. The token sits in the
 * fragment, so it never reaches a server log or a Referer header.
 */
function parseAccessRoute(): { mode: AccessMode; token: string } | null {
  const m = /^#\/(verify-email|reset-password)\/([A-Za-z0-9_-]{43})$/.exec(window.location.hash);
  if (m) return { mode: m[1] === 'verify-email' ? 'verify' : 'reset', token: m[2] };
  if (window.location.hash === '#/forgot-password') return { mode: 'forgot', token: '' };
  return null;
}

const MainContent: React.FC = () => {
  const [access, setAccess] = useState(parseAccessRoute);
  // Bumped only when a NEW emailed link is opened, so the sign-in page restarts for it but not when the person leaves it.
  const [linkSeq, setLinkSeq] = useState(0);
  const [currentView, setCurrentView] = useState(() => {
    if (parseAccessRoute()) return 'login';
    // After a PWA update reload, reopen the view the user was on (view name only; auth is unchanged).
    try {
      const saved = sessionStorage.getItem(PWA_RESTORE_KEY);
      sessionStorage.removeItem(PWA_RESTORE_KEY);
      if (saved) return saved;
    } catch {
      /* ignore */
    }
    // A signed-in user reloading an authenticated deep link (e.g. "#/doctor/appointments") returns to their workspace.
    try {
      if (window.location.hash.startsWith('#/') && (localStorage.getItem('naseej_token') || sessionStorage.getItem('naseej_token'))) return 'workspace';
    } catch {
      /* ignore */
    }
    return 'home';
  });
  const { user } = useAuth();
  const { t } = useLang();
  // A clinician opening a patient's QR link: a standalone, read-only page that needs no account.
  const [sharing, setSharing] = useState(isShareRoute);
  useEffect(() => {
    const onHash = () => {
      setSharing(isShareRoute());
      const next = parseAccessRoute();
      if (next) {
        setAccess(next);
        setLinkSeq((n) => n + 1);
        setCurrentView('login');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (sharing) return <ShareView />;

  const isAuthView = AUTHENTICATED_VIEWS.has(currentView);

  // Authenticated workspace uses the dedicated authenticated AppShell with responsive sidebar drawer
  if (isAuthView && user) {
    return <AppShell currentView={currentView} setCurrentView={setCurrentView} />;
  }

  return (
    <div className="app-shell" data-view={currentView} style={{ display: 'flex', flexDirection: 'column' }}>
      <a className="skip-link" href="#main">{t.landing.skip}</a>
      <Header currentView={currentView} setCurrentView={setCurrentView} />

      <main id="main" tabIndex={-1} className="app-main" style={{ flex: 1, outline: 'none' }}>
        <PageTransition key={currentView} style={{ minHeight: '100%' }}>
          {currentView === 'home' && <PublicHome setCurrentView={setCurrentView} />}
          {currentView === 'workflow' && <WorkflowPage />}
          {currentView === 'login' && (
            <LoginPage
              key={linkSeq}
              setCurrentView={setCurrentView}
              initialMode={access?.mode}
              token={access?.token}
              onLeaveLink={() => {
                setAccess(null);
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
              }}
            />
          )}

          {(currentView === 'portal' || currentView === 'workspace') && <LoginPage setCurrentView={setCurrentView} />}
        </PageTransition>
      </main>

      {currentView !== 'login' && <Footer />}
      <PwaPrompts currentView={currentView} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MotionRoot>
        <LangProvider>
          <AuthProvider>
            <InstallProvider>
              <MainContent />
            </InstallProvider>
          </AuthProvider>
        </LangProvider>
      </MotionRoot>
    </ThemeProvider>
  );
};

export default App;
