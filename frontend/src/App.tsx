import React, { useEffect, useState } from 'react';
import { LangProvider, useLang } from './context/LangContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { MotionRoot, PageTransition } from './components/motion.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { PublicHome } from './pages/PublicHome.js';
import { WorkflowPage } from './pages/WorkflowPage.js';
import { LoginPage } from './pages/LoginPage.js';
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

const MainContent: React.FC = () => {
  const [currentView, setCurrentView] = useState(() => {
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
      if (window.location.hash.startsWith('#/') && localStorage.getItem('naseej_token')) return 'workspace';
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
    const onHash = () => setSharing(isShareRoute());
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
          {currentView === 'login' && <LoginPage setCurrentView={setCurrentView} />}

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
