import { beforeAll } from 'vitest';
import { pool } from '../src/config/db.js';
import { NOOR, PATIENT_1 } from './helpers.js';

/**
 * Fixtures the API tests need and the demo seed deliberately leaves out: one center, three staff accounts (to prove that
 * staff cannot use the patient API) and one approved plus one draft visit with a prescription and a lab result (to prove
 * that the portal never shows a draft). Idempotent: running it twice changes nothing. Needs the seeded patient.
 */
const HASH = '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq'; // bcrypt of Password123!
const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DOCTOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const RECEPTION = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

export async function ensureFixtures(): Promise<void> {
  await pool.query(
    `INSERT INTO organizations (id, name_ar, name_en, code, type, status)
     VALUES ($1, 'مركز النور الطبي التخصصي', 'Al-Noor Specialized Medical Center', 'AL_NOOR', 'clinic', 'active') ON CONFLICT (id) DO NOTHING`,
    [NOOR]
  );
  await pool.query(
    `INSERT INTO users (id, auth_provider_id, email, password_hash, full_name_ar, full_name_en, national_id, system_role, is_active) VALUES
       ($1, 'local_auth_admin', 'admin@naseej.health', $4, 'سارة العتيبي', 'Sarah Al-Otaibi', '1011111111', 'platform_admin', true),
       ($2, 'local_auth_doc_noor', 'doctor.noor@naseej.health', $4, 'د. فيصل الشمري', 'Dr. Faisal Al-Shammari', '1033333333', 'user', true),
       ($3, 'local_auth_rec_noor', 'reception.noor@naseej.health', $4, 'نورة القحطاني', 'Noura Al-Qahtani', '1044444444', 'user', true)
     ON CONFLICT (id) DO NOTHING`,
    [ADMIN, DOCTOR, RECEPTION, HASH]
  );
  for (const [user, role] of [[DOCTOR, 'doctor'], [RECEPTION, 'reception']] as const) {
    await pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status)
       SELECT $1, $2, $3, 'active' WHERE NOT EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id = $1 AND user_id = $2)`,
      [NOOR, user, role]
    );
  }
  const has = (await pool.query('SELECT 1 FROM patient_profiles WHERE id = $1', [PATIENT_1])).rowCount;
  if (!has) return;
  await pool.query(
    `INSERT INTO visits (id, organization_id, patient_id, clinician_id, visit_date, chief_complaint, diagnosis, status, approved_by, approved_at) VALUES
       ('40000000-0000-0000-0000-000000000001', $1, $2, $3, NOW() - INTERVAL '14 days', 'Recurrent morning headache', 'Essential hypertension', 'approved', $3, NOW() - INTERVAL '14 days'),
       ('40000000-0000-0000-0000-000000000002', $1, $2, $3, NOW(), 'Blood pressure follow-up', 'Draft, not signed off', 'draft', NULL, NULL)
     ON CONFLICT (id) DO NOTHING`,
    [NOOR, PATIENT_1, DOCTOR]
  );
  await pool.query(
    `INSERT INTO lab_orders (id, organization_id, visit_id, patient_id, clinician_id, test_name_ar, test_name_en, status)
     VALUES ('60000000-0000-0000-0000-000000000001', $1, '40000000-0000-0000-0000-000000000001', $2, $3, 'صورة الدم', 'Blood count', 'completed') ON CONFLICT (id) DO NOTHING`,
    [NOOR, PATIENT_1, DOCTOR]
  );
  await pool.query(
    `INSERT INTO lab_results (organization_id, lab_order_id, parameter_name, value, unit, reference_range, is_abnormal, status, reviewed_by, reviewed_at)
     SELECT $1, '60000000-0000-0000-0000-000000000001', 'Hemoglobin', '14.8', 'g/dL', '13.5 - 17.5', false, 'approved', $2, NOW()
     WHERE NOT EXISTS (SELECT 1 FROM lab_results WHERE lab_order_id = '60000000-0000-0000-0000-000000000001')`,
    [NOOR, DOCTOR]
  );
}

// The unit suites need no database: when none is reachable the fixtures are simply skipped.
beforeAll(async () => {
  try {
    await ensureFixtures();
  } catch (err) {
    if (process.env.TEST_REQUIRE_DB === 'true') throw err;
  }
});
