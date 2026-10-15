import React, { useState } from 'react';
import { LangProvider, useLang } from './context/LangContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { MotionRoot, PageTransition } from './components/motion.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { PublicHome } from './pages/PublicHome.js';
import { FeaturesPage } from './pages/FeaturesPage.js';
import { WorkflowPage } from './pages/WorkflowPage.js';
import { DemoRequestPage } from './pages/DemoRequestPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { AdminDashboard } from './pages/AdminDashboard.js';
import { ManagerDashboard } from './pages/ManagerDashboard.js';
import { DoctorWorkspace } from './pages/DoctorWorkspace.js';
import { ReceptionWorkspace } from './pages/ReceptionWorkspace.js';
import { PatientPortal } from './pages/PatientPortal.js';
import { PwaPrompts, PWA_RESTORE_KEY } from './pwa/PwaPrompts.js';
import { InstallProvider } from './pwa/InstallContext.js';
import './styles/theme.css';
import './styles/shell.css';
import './styles/landing.css';
import './styles/auth.css';
import './styles/doctor.css';
import './styles/app.css';
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
  const { user, currentRole } = useAuth();
  const { t } = useLang();

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
          {currentView === 'features' && <FeaturesPage />}
          {currentView === 'workflow' && <WorkflowPage />}
          {currentView === 'demo' && <DemoRequestPage />}
          {currentView === 'login' && <LoginPage setCurrentView={setCurrentView} />}

          {/* Protected Role Views fallback if signed out */}
          {currentView === 'admin' && <AdminDashboard />}
          {currentView === 'manager' && <ManagerDashboard />}
          {currentView === 'doctor' && <DoctorWorkspace />}
          {currentView === 'reception' && <ReceptionWorkspace />}
          {currentView === 'portal' && <PatientPortal />}

          {/* Fallback Workspace Switcher */}
          {currentView === 'workspace' && (
            <div style={{ maxWidth: 800, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
              <h2 className="text-title" style={{ marginBottom: 16 }}>Select Workspace</h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 24 }}>
                {user?.systemRole === 'platform_admin' && (
                  <button onClick={() => setCurrentView('admin')} className="btn-pill btn-pill-brand">
                    Platform Admin Dashboard
                  </button>
                )}
                {currentRole === 'center_manager' && (
                  <button onClick={() => setCurrentView('manager')} className="btn-pill btn-pill-brand">
                    Center Manager Operations
                  </button>
                )}
                {currentRole === 'doctor' && (
                  <button onClick={() => setCurrentView('doctor')} className="btn-pill btn-pill-brand">
                    Clinician Workspace
                  </button>
                )}
                {currentRole === 'reception' && (
                  <button onClick={() => setCurrentView('reception')} className="btn-pill btn-pill-brand">
                    Reception Desk
                  </button>
                )}
                {user?.patientProfileId && (
                  <button onClick={() => setCurrentView('portal')} className="btn-pill btn-pill-brand">
                    Patient Health Portal
                  </button>
                )}
              </div>
            </div>
          )}
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
