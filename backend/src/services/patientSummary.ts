import { query } from '../config/db.js';

/**
 * The patient's approved health summary: profile, allergies, centers, and APPROVED visits, prescriptions and lab results
 * only. Drafts and AI suggestions never appear here. Shared by the patient portal and by caregivers acting under a
 * delegation that allows viewing records.
 */
export async function buildPatientSummary(patientId: string) {
  // 1. Patient profile & allergies
  const patientRes = await query(
    `SELECT id, full_name_ar, full_name_en, date_of_birth, blood_type
     FROM patient_profiles WHERE id = $1`,
    [patientId]
  );
  const allergiesRes = await query(
    `SELECT id, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at
     FROM patient_allergies WHERE patient_id = $1 ORDER BY severity DESC, diagnosed_at DESC`,
    [patientId]
  );

  // 2. Affiliated centers
  const centersRes = await query(
    `SELECT o.id, o.name_ar, o.name_en, o.code, l.mrn, l.first_visit_date
     FROM patient_center_links l
     JOIN organizations o ON l.organization_id = o.id
     WHERE l.patient_id = $1 AND l.status = 'active'`,
    [patientId]
  );

  // 3. Approved Visits Only
  const visitsRes = await query(
    `SELECT v.id, v.organization_id, v.visit_date, v.chief_complaint, v.vital_signs, v.diagnosis, v.treatment_plan, v.status,
            o.name_ar as center_name_ar, o.name_en as center_name_en,
            u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en
     FROM visits v
     JOIN organizations o ON v.organization_id = o.id
     JOIN users u ON v.clinician_id = u.id
     WHERE v.patient_id = $1 AND v.status = 'approved'
     ORDER BY v.visit_date DESC LIMIT 3`,
    [patientId]
  );

  // 4. Approved Prescriptions
  const rxRes = await query(
    `SELECT pr.id, pr.organization_id, pr.created_at, pr.notes, pr.approved_at,
            o.name_ar as center_name_ar, o.name_en as center_name_en,
            u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en,
            COALESCE(json_agg(json_build_object(
              'id', pi.id, 'medication_name', pi.medication_name, 'dosage', pi.dosage,
              'frequency', pi.frequency, 'duration', pi.duration, 'instructions', pi.instructions
            ) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]'::json) as items
     FROM (
       SELECT * FROM prescriptions
       WHERE patient_id = $1 AND status = 'approved'
       ORDER BY created_at DESC LIMIT 3
     ) pr
     JOIN organizations o ON pr.organization_id = o.id
     JOIN users u ON pr.clinician_id = u.id
     LEFT JOIN prescription_items pi ON pr.id = pi.prescription_id
     GROUP BY pr.id, pr.organization_id, pr.created_at, pr.notes, pr.approved_at,
              o.name_ar, o.name_en, u.full_name_ar, u.full_name_en
     ORDER BY pr.created_at DESC`,
    [patientId]
  );

  // 5. Approved Lab Results
  const labRes = await query(
    `SELECT lr.id, lr.parameter_name, lr.value, lr.unit, lr.reference_range, lr.is_abnormal, lr.status, lr.reviewed_at,
            lo.test_name_ar, lo.test_name_en, lo.test_category,
            o.name_ar as center_name_ar, o.name_en as center_name_en
     FROM lab_results lr
     JOIN lab_orders lo ON lr.lab_order_id = lo.id
     JOIN organizations o ON lr.organization_id = o.id
     WHERE lo.patient_id = $1 AND lr.status = 'approved'
     ORDER BY lr.reviewed_at DESC LIMIT 6`,
    [patientId]
  );

  // 6. Upcoming Appointments
  const appointmentsRes = await query(
    `SELECT a.id, a.organization_id, a.clinician_id, a.appointment_date, a.start_time, a.end_time, a.status, a.created_at,
            o.name_ar as center_name_ar, o.name_en as center_name_en,
            u.full_name_ar as clinician_name_ar, u.full_name_en as clinician_name_en
     FROM appointments a
     JOIN organizations o ON a.organization_id = o.id
     JOIN users u ON a.clinician_id = u.id
     WHERE a.patient_id = $1 AND a.appointment_date >= CURRENT_DATE AND a.status NOT IN ('cancelled', 'completed', 'no_show')
     ORDER BY a.appointment_date ASC, a.start_time ASC`,
    [patientId]
  );

  return {
    profile: patientRes.rows[0],
    allergies: allergiesRes.rows,
    affiliatedCenters: centersRes.rows,
    visits: visitsRes.rows,
    prescriptions: rxRes.rows,
    labResults: labRes.rows,
    upcomingAppointments: appointmentsRes.rows,
  };
}
