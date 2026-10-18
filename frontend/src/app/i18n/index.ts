import { careT } from './care.js';
import { commonT } from './common.js';
import { navT } from './nav.js';
import { adminT } from './admin.js';
import { coordinatorT } from './coordinator.js';
import { doctorT } from './doctor.js';
import { managerT } from './manager.js';
import { opsT } from './ops.js';
import { patientT } from './patient.js';
import { receptionT } from './reception.js';
import { recordT } from './record.js';
import { settingsT } from './settings.js';

// Each area adds its own file here. The English tree of every file is typed against its Arabic tree.
export const appT = {
  ar: { care: careT.ar, common: commonT.ar, nav: navT.ar, record: recordT.ar, ops: opsT.ar, patient: patientT.ar, doctor: doctorT.ar, coordinator: coordinatorT.ar, reception: receptionT.ar, manager: managerT.ar, admin: adminT.ar, settings: settingsT.ar },
  en: { care: careT.en, common: commonT.en, nav: navT.en, record: recordT.en, ops: opsT.en, patient: patientT.en, doctor: doctorT.en, coordinator: coordinatorT.en, reception: receptionT.en, manager: managerT.en, admin: adminT.en, settings: settingsT.en },
};
