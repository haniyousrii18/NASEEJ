import type { NavStrings } from './i18n/nav.js';
import type { IconName } from './AppIcons.js';

/**
 * The authenticated app's role-aware navigation. This decides what is *shown*; the backend decides what is *allowed*.
 * Every route begins with its role's base segment, e.g. "doctor/patient/<id>/timeline".
 */
export type AppRole = 'patient' | 'caregiver' | 'doctor' | 'care_coordinator' | 'reception' | 'center_manager' | 'platform_admin';

export const ROLE_BASE: Record<AppRole, string> = {
  patient: 'patient',
  caregiver: 'caregiver',
  doctor: 'doctor',
  care_coordinator: 'coordinator',
  reception: 'reception',
  center_manager: 'manager',
  platform_admin: 'admin',
};

export interface NavItem {
  route: string;
  label: keyof NavStrings['items'];
  icon: IconName;
  /** Other route prefixes that keep this item highlighted (e.g. a patient workspace belongs to "Find a Patient"). */
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
        { route: 'patient/summary', label: 'patientSummary', icon: 'summary' },
        { route: 'patient/timeline', label: 'patientTimeline', icon: 'timeline' },
        { route: 'patient/documents', label: 'patientDocuments', icon: 'documents' },
        { route: 'patient/medications', label: 'patientMedications', icon: 'pill' },
      ],
    },
    {
      id: 'care',
      items: [
        { route: 'patient/appointments', label: 'patientAppointments', icon: 'calendar' },
        { route: 'patient/messages', label: 'patientMessages', icon: 'message' },
        { route: 'patient/consents', label: 'patientConsents', icon: 'shield' },
        { route: 'patient/caregivers', label: 'patientCaregivers', icon: 'users' },
      ],
    },
    { id: 'account', items: [{ route: 'patient/notifications', label: 'notifications', icon: 'bell' }, { route: 'patient/settings', label: 'settings', icon: 'settings' }] },
  ],
  caregiver: [
    {
      id: 'delegated',
      items: [{ route: 'caregiver/home', label: 'caregiverHome', icon: 'users', alsoActiveFor: ['caregiver/patient/'] }],
    },
    { id: 'account', items: [{ route: 'caregiver/notifications', label: 'notifications', icon: 'bell' }, { route: 'caregiver/settings', label: 'settings', icon: 'settings' }] },
  ],
  doctor: [
    {
      id: 'day',
      items: [
        { route: 'doctor/home', label: 'doctorHome', icon: 'home' },
        { route: 'doctor/appointments', label: 'doctorAppointments', icon: 'calendar' },
        { route: 'doctor/pending', label: 'doctorPending', icon: 'checks' },
        { route: 'doctor/messages', label: 'doctorMessages', icon: 'inbox' },
      ],
    },
    { id: 'patients', items: [{ route: 'doctor/patients', label: 'doctorPatients', icon: 'search', alsoActiveFor: ['doctor/patient/'] }] },
    { id: 'account', items: [{ route: 'doctor/notifications', label: 'notifications', icon: 'bell' }, { route: 'doctor/settings', label: 'settings', icon: 'settings' }] },
  ],
  care_coordinator: [
    {
      id: 'coordination',
      items: [
        { route: 'coordinator/home', label: 'coordHome', icon: 'home' },
        { route: 'coordinator/cases', label: 'coordCases', icon: 'folder', alsoActiveFor: ['coordinator/case/'] },
        { route: 'coordinator/tasks', label: 'coordTasks', icon: 'checks' },
        { route: 'coordinator/referrals', label: 'coordReferrals', icon: 'link' },
        { route: 'coordinator/log', label: 'coordLog', icon: 'clock' },
      ],
    },
    { id: 'account', items: [{ route: 'coordinator/notifications', label: 'notifications', icon: 'bell' }, { route: 'coordinator/settings', label: 'settings', icon: 'settings' }] },
  ],
  reception: [
    {
      id: 'front',
      items: [
        { route: 'reception/home', label: 'receptionHome', icon: 'home' },
        { route: 'reception/schedule', label: 'receptionSchedule', icon: 'calendar' },
        { route: 'reception/book', label: 'receptionBook', icon: 'plus' },
        { route: 'reception/patients', label: 'receptionPatients', icon: 'search' },
        { route: 'reception/messages', label: 'receptionMessages', icon: 'inbox' },
      ],
    },
    { id: 'account', items: [{ route: 'reception/notifications', label: 'notifications', icon: 'bell' }, { route: 'reception/settings', label: 'settings', icon: 'settings' }] },
  ],
  center_manager: [
    {
      id: 'operations',
      items: [
        { route: 'manager/home', label: 'managerHome', icon: 'home' },
        { route: 'manager/schedule', label: 'managerSchedule', icon: 'calendar' },
        { route: 'manager/services', label: 'managerServices', icon: 'building' },
        { route: 'manager/reports', label: 'managerReports', icon: 'chart' },
      ],
    },
    {
      id: 'people',
      items: [
        { route: 'manager/staff', label: 'managerStaff', icon: 'users' },
        { route: 'manager/coordination', label: 'managerCoordination', icon: 'folder' },
      ],
    },
    { id: 'oversight', items: [{ route: 'manager/activity', label: 'managerActivity', icon: 'scroll' }] },
    { id: 'account', items: [{ route: 'manager/notifications', label: 'notifications', icon: 'bell' }, { route: 'manager/settings', label: 'settings', icon: 'settings' }] },
  ],
  platform_admin: [
    {
      id: 'platform',
      items: [
        { route: 'admin/home', label: 'adminHome', icon: 'home' },
        { route: 'admin/centers', label: 'adminCenters', icon: 'building' },
        { route: 'admin/accounts', label: 'adminAccounts', icon: 'users' },
        { route: 'admin/requests', label: 'adminRequests', icon: 'inbox' },
      ],
    },
    { id: 'oversight', items: [{ route: 'admin/audit', label: 'adminAudit', icon: 'scroll' }] },
    { id: 'account', items: [{ route: 'admin/notifications', label: 'notifications', icon: 'bell' }, { route: 'admin/settings', label: 'settings', icon: 'settings' }] },
  ],
};

export const homeRoute = (role: AppRole) => `${ROLE_BASE[role]}/home`;

/** Maps the AuthContext role to an app role. A role with no workspace here returns null. */
export function appRoleOf(currentRole: string | null | undefined): AppRole | null {
  switch (currentRole) {
    case 'platform_admin':
    case 'patient':
    case 'caregiver':
    case 'doctor':
    case 'care_coordinator':
    case 'reception':
    case 'center_manager':
      return currentRole;
    default:
      return null;
  }
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

/** Views the existing login flow can navigate to; all of them open the authenticated shell. */
export const AUTHENTICATED_VIEWS = new Set(['portal', 'doctor', 'manager', 'reception', 'admin', 'workspace', 'coordinator']);
