import type { NavStrings } from './i18n/nav.js';
import type { IconName } from './AppIcons.js';

/**
 * The signed-in app's navigation. Naseej is a patient-owned record, so the only workspace is the patient's.
 * This decides what is *shown*; the backend decides what is *allowed*. Every route begins with "patient".
 */
export type AppRole = 'patient';

export const ROLE_BASE: Record<AppRole, string> = {
  patient: 'patient',
};

export interface NavItem {
  route: string;
  label: keyof NavStrings['items'];
  icon: IconName;
  /** Other route prefixes that keep this item highlighted. */
  alsoActiveFor?: string[];
}

export interface NavGroup {
  id: keyof NavStrings['groups'];
  items: NavItem[];
}

export const NAV: Record<AppRole, NavGroup[]> = {
  patient: [
    { id: 'overview', items: [{ route: 'patient/home', label: 'patientHome', icon: 'home' }] },
    {
      id: 'myRecord',
      items: [
        { route: 'patient/profile', label: 'patientProfile', icon: 'user' },
        { route: 'patient/timeline', label: 'patientTimeline', icon: 'timeline' },
        { route: 'patient/documents', label: 'patientDocuments', icon: 'documents' },
        { route: 'patient/visits', label: 'patientVisits', icon: 'visit' },
      ],
    },
    { id: 'assist', items: [{ route: 'patient/assistant', label: 'patientAssistant', icon: 'pulse' }] },
    { id: 'sharing', items: [{ route: 'patient/sharing', label: 'patientSharing', icon: 'link' }] },
    { id: 'account', items: [{ route: 'patient/notifications', label: 'notifications', icon: 'bell' }, { route: 'patient/settings', label: 'settings', icon: 'settings' }] },
  ],
};

export const homeRoute = (role: AppRole) => `${ROLE_BASE[role]}/home`;

/** Maps the AuthContext role to an app role. Anything that is not a patient has no workspace here. */
export function appRoleOf(currentRole: string | null | undefined): AppRole | null {
  return currentRole === 'patient' ? 'patient' : null;
}

export const belongsToRole = (route: string, role: AppRole) => route === ROLE_BASE[role] || route.startsWith(`${ROLE_BASE[role]}/`);

export function isActive(item: NavItem, route: string): boolean {
  if (route === item.route || route.startsWith(`${item.route}/`)) return true;
  return (item.alsoActiveFor ?? []).some((prefix) => route.startsWith(prefix));
}

/** The nav item (and its group) a route belongs to, for the top bar title. */
export function currentItem(role: AppRole, route: string): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV[role]) {
    const item = group.items.find((i) => isActive(i, route));
    if (item) return { group, item };
  }
  return null;
}

/** Views the login flow can navigate to; all of them open the signed-in app. */
export const AUTHENTICATED_VIEWS = new Set(['portal', 'workspace']);
