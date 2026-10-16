import React from 'react';
import type { AppRole } from './nav.js';
import { AdminAccounts, AdminAudit, AdminCenters, AdminHome, AdminRequests } from './pages/admin.js';
import { CaseDetail, CoordinatorCases, CoordinatorHome, CoordinatorReferrals, CoordinatorTasks, FollowupLog } from './pages/coordinator.js';
import { DoctorAppointments, DoctorHome, DoctorPatients, DoctorPending, PatientWorkspace } from './pages/doctor.js';
import { ManagerActivity, ManagerCoordination, ManagerHome, ManagerReports, ManagerSchedule, ManagerServices, ManagerStaff } from './pages/manager.js';
import { PatientAppointments, PatientConsents, PatientDocuments, PatientHome, PatientMedications, PatientMessages, PatientSummary, PatientTimeline } from './pages/patient.js';
import { FrontDesk } from './reception/FrontDesk.js';
import { ReceptionBook, ReceptionPatients, ReceptionSchedule } from './pages/reception.js';

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
export function resolvePage(route: string, ctx: PageContext): React.ReactNode {
  const { navigate } = ctx;
  const parts = route.split('/');

  switch (route) {
    // Patient
    case 'patient/home':
      return <PatientHome navigate={navigate} />;
    case 'patient/summary':
      return <PatientSummary navigate={navigate} />;
    case 'patient/timeline':
      return <PatientTimeline />;
    case 'patient/documents':
      return <PatientDocuments />;
    case 'patient/medications':
      return <PatientMedications />;
    case 'patient/appointments':
      return <PatientAppointments navigate={navigate} />;
    case 'patient/messages':
      return <PatientMessages />;
    case 'patient/consents':
      return <PatientConsents />;

    // Doctor
    case 'doctor/home':
      return <DoctorHome navigate={navigate} />;
    case 'doctor/appointments':
      return <DoctorAppointments navigate={navigate} />;
    case 'doctor/pending':
      return <DoctorPending navigate={navigate} />;
    case 'doctor/patients':
      return <DoctorPatients navigate={navigate} />;

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

    // Reception
    case 'reception/home':
      return <FrontDesk navigate={navigate} />;
    case 'reception/schedule':
      return <ReceptionSchedule />;
    case 'reception/book':
      return <ReceptionBook initialPatientId={hashParam('patient')} />;
    case 'reception/arrivals':
      return <FrontDesk navigate={navigate} />;
    case 'reception/patients':
      return <ReceptionPatients navigate={navigate} />;

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
  if (parts[0] === 'coordinator' && parts[1] === 'case' && parts[2]) {
    return <CaseDetail key={parts[2]} caseId={parts[2]} navigate={navigate} />;
  }
  return null;
}
