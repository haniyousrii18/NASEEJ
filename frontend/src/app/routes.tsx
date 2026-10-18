import React from 'react';
import type { AppRole } from './nav.js';
import { AdminAccounts, AdminAudit, AdminCenters, AdminHome, AdminRequests } from './pages/admin.js';
import { CaseDetail, CoordinatorCases, CoordinatorHome, CoordinatorReferrals, CoordinatorTasks, FollowupLog } from './pages/coordinator.js';
import { DoctorAppointments, DoctorHome, DoctorPatients, DoctorPending, PatientWorkspace } from './pages/doctor.js';
import { ManagerActivity, ManagerCoordination, ManagerHome, ManagerReports, ManagerSchedule, ManagerServices, ManagerStaff } from './pages/manager.js';
import { PatientAppointments, PatientConsents, PatientHome, PatientMedications, PatientMessages, PatientSummary, PatientTimeline } from './pages/patient.js';
import { CaregiverHome, CaregiverPatient } from './pages/caregiver.js';
import { DoctorMessages, OpsMessages } from './pages/messages.js';
import { PatientCaregivers } from './pages/patientCaregivers.js';
import { PatientLibrary } from './pages/patientLibrary.js';
import { FrontDesk } from './reception/FrontDesk.js';
import { Patients } from './reception/Patients.js';
import { ReceptionFrame } from './reception/ReceptionFrame.js';
import { Schedule } from './reception/Schedule.js';
import { Settings } from './pages/settings.js';
import { NotificationsPage } from './notifications/NotificationsPage.js';

export interface PageContext {
  role: AppRole;
  navigate: (route: string) => void;
}

/** A query value carried after "?" in the hash route, e.g. "#/reception/book?patient=<id>". */
const hashParam = (name: string): string | undefined => {
  const q = window.location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get(name) ?? undefined : undefined;
};

/** Maps a route to its page. The shell has already refused routes outside the signed-in role's base segment. */
function receptionPage(route: string, navigate: (route: string) => void): React.ReactNode {
  switch (route) {
    case 'reception/home':
    case 'reception/arrivals':
      return <FrontDesk navigate={navigate} />;
    case 'reception/schedule':
      return <Schedule navigate={navigate} open={hashParam('appointment') && /^\d{4}-\d{2}-\d{2}$/.test(hashParam('date') ?? '') ? { id: hashParam('appointment')!, date: hashParam('date')! } : undefined} />;
    case 'reception/book':
      return <Schedule navigate={navigate} bookRoute preset={{ patientId: hashParam('patient'), doctorId: hashParam('doctor'), date: hashParam('date'), time: hashParam('time') }} />;
    case 'reception/patients':
      return <Patients navigate={navigate} openId={hashParam('open')} />;
    case 'reception/messages':
      return <OpsMessages role="reception" />;
  }
  return null;
}

export function resolvePage(route: string, ctx: PageContext): React.ReactNode {
  const { navigate } = ctx;
  const parts = route.split('/');

  // Every role has one Settings page at "<role base>/settings".
  if (parts.length === 2 && parts[1] === 'settings') return <Settings role={ctx.role} navigate={navigate} />;
  if (parts.length === 2 && parts[1] === 'notifications') return <NotificationsPage role={ctx.role} navigate={navigate} />;

  if (parts[0] === 'reception') {
    const page = receptionPage(route, navigate);
    return page && <ReceptionFrame navigate={navigate}>{page}</ReceptionFrame>;
  }

  switch (route) {
    // Patient
    case 'patient/home':
      return <PatientHome navigate={navigate} />;
    case 'patient/summary':
      return <PatientSummary navigate={navigate} />;
    case 'patient/timeline':
      return <PatientTimeline />;
    case 'patient/documents':
      return <PatientLibrary />;
    case 'patient/medications':
      return <PatientMedications />;
    case 'patient/appointments':
      return <PatientAppointments navigate={navigate} />;
    case 'patient/messages':
      return <PatientMessages />;
    case 'patient/consents':
      return <PatientConsents />;
    case 'patient/caregivers':
      return <PatientCaregivers />;

    // Caregiver (delegated access)
    case 'caregiver/home':
      return <CaregiverHome navigate={navigate} />;

    // Doctor
    case 'doctor/home':
      return <DoctorHome navigate={navigate} />;
    case 'doctor/appointments':
      return <DoctorAppointments navigate={navigate} />;
    case 'doctor/pending':
      return <DoctorPending navigate={navigate} />;
    case 'doctor/patients':
      return <DoctorPatients navigate={navigate} />;
    case 'doctor/messages':
      return <DoctorMessages />;

    // Care coordinator
    case 'coordinator/home':
      return <CoordinatorHome navigate={navigate} />;
    case 'coordinator/cases':
      return <CoordinatorCases navigate={navigate} />;
    case 'coordinator/tasks':
      return <CoordinatorTasks navigate={navigate} />;
    case 'coordinator/referrals':
      return <CoordinatorReferrals />;
    case 'coordinator/log':
      return <FollowupLog />;


    // Center manager
    case 'manager/home':
      return <ManagerHome />;
    case 'manager/schedule':
      return <ManagerSchedule />;
    case 'manager/services':
      return <ManagerServices />;
    case 'manager/reports':
      return <ManagerReports />;
    case 'manager/staff':
      return <ManagerStaff />;
    case 'manager/coordination':
      return <ManagerCoordination />;
    case 'manager/activity':
      return <ManagerActivity />;

    // Platform administrator
    case 'admin/home':
      return <AdminHome />;
    case 'admin/centers':
      return <AdminCenters />;
    case 'admin/accounts':
      return <AdminAccounts />;
    case 'admin/requests':
      return <AdminRequests />;
    case 'admin/audit':
      return <AdminAudit />;
  }

  // Parameterised routes
  if (parts[0] === 'doctor' && parts[1] === 'patient' && parts[2]) {
    return <PatientWorkspace key={parts[2]} patientId={parts[2]} tab={parts[3] ?? 'summary'} navigate={navigate} />;
  }
  if (parts[0] === 'caregiver' && parts[1] === 'patient' && parts[2]) {
    return <CaregiverPatient key={parts[2]} id={parts[2]} tab={parts[3] ?? ''} navigate={navigate} />;
  }
  if (parts[0] === 'coordinator' && parts[1] === 'case' && parts[2]) {
    return <CaseDetail key={parts[2]} caseId={parts[2]} navigate={navigate} />;
  }
  return null;
}
