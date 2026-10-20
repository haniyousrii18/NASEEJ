import { careT } from './care.js';
import { commonT } from './common.js';
import { navT } from './nav.js';
import { patientT } from './patient.js';
import { recordT } from './record.js';
import { settingsT } from './settings.js';
import { notificationsT } from './notifications.js';
import { healthT } from './health.js';

// Each area adds its own file here. The English tree of every file is typed against its Arabic tree.
export const appT = {
  ar: { care: careT.ar, common: commonT.ar, nav: navT.ar, record: recordT.ar, patient: patientT.ar, settings: settingsT.ar, notifications: notificationsT.ar, health: healthT.ar },
  en: { care: careT.en, common: commonT.en, nav: navT.en, record: recordT.en, patient: patientT.en, settings: settingsT.en, notifications: notificationsT.en, health: healthT.en },
};
