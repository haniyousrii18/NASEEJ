import React from 'react';
import type { AppRole } from './nav.js';
import { PatientToday } from './health/Home.js';
import { PatientProfile } from './health/Profile.js';
import { PatientSymptoms } from './health/Symptoms.js';
import { PatientTimeline } from './health/PatientTimeline.js';
import { PatientVault } from './health/Vault.js';
import { PatientVisits } from './health/Visits.js';
import { PrepEditor } from './health/PrepEditor.js';
import { PatientAssistant } from './health/Assistant.js';
import { PatientSharing } from './health/Sharing.js';
import { Settings } from './pages/settings.js';
import { NotificationsPage } from './notifications/NotificationsPage.js';

export interface PageContext {
  role: AppRole;
  navigate: (route: string) => void;
}

/** Maps a route to its page. The shell has already refused routes outside the patient base segment. */
export function resolvePage(route: string, ctx: PageContext): React.ReactNode {
  const { navigate } = ctx;
  const parts = route.split('/');

  if (parts.length === 2 && parts[1] === 'settings') return <Settings role={ctx.role} navigate={navigate} />;
  if (parts.length === 2 && parts[1] === 'notifications') return <NotificationsPage role={ctx.role} navigate={navigate} />;

  switch (route) {
    case 'patient/home':
      return <PatientToday navigate={navigate} />;
    case 'patient/profile':
      return <PatientProfile navigate={navigate} />;
    case 'patient/timeline':
      return <PatientTimeline navigate={navigate} />;
    case 'patient/symptoms':
      return <PatientSymptoms />;
    case 'patient/documents':
      return <PatientVault />;
    case 'patient/visits':
      return <PatientVisits navigate={navigate} />;
    case 'patient/assistant':
      return <PatientAssistant navigate={navigate} />;
    case 'patient/sharing':
      return <PatientSharing navigate={navigate} />;
  }

  if (parts[0] === 'patient' && parts[1] === 'visits' && parts[2] === 'prep' && parts[3]) {
    return <PrepEditor key={parts[3]} id={parts[3]} navigate={navigate} />;
  }
  return null;
}
