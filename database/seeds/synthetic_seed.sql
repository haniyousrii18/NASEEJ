-- =============================================================================
-- Naseej | نَسيج — Synthetic demo data (100% synthetic, small on purpose)
-- =============================================================================
-- Applied by `npm --prefix backend run seed`, which first empties every table (see backend/scripts/seed.ts), then runs
-- this file, writes the demo PDFs and creates the visit summaries and a share. Two or three examples per page.
--
-- Sign in (local use only):  patient@naseej.health  /  Password123!
-- The three staff rows below exist only so the API tests can prove that a staff account cannot reach a patient's record
-- through the patient API. They cannot sign in to the app (PATIENT_ONLY_MODE).
--
-- Fixed ids (the tests rely on them):
--   Center Al-Noor        11111111-1111-1111-1111-111111111111
--   Admin                 aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--   Doctor                cccccccc-cccc-cccc-cccc-cccccccccccc
--   Reception             dddddddd-dddd-dddd-dddd-dddddddddddd
--   Patient user          eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee
--   Patient profile       10000000-0000-0000-0000-000000000001
-- Password hash below is bcrypt (10 rounds) of 'Password123!'.

-- -----------------------------------------------------------------------------
-- 1. One center and the staff accounts used by the tests
-- -----------------------------------------------------------------------------
INSERT INTO organizations (id, name_ar, name_en, code, type, status, contact_phone, contact_email, address_ar, address_en)
VALUES ('11111111-1111-1111-1111-111111111111', 'مركز النور الطبي التخصصي', 'Al-Noor Specialized Medical Center', 'AL_NOOR', 'clinic', 'active',
        '+966 11 456 7890', 'info@alnoor-medical.sa', 'طريق الملك فهد، الرياض', 'King Fahd Road, Riyadh');

INSERT INTO users (id, auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, national_id, system_role, is_active)
VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'local_auth_admin', 'admin@naseej.health', '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq', 'سارة العتيبي', 'Sarah Al-Otaibi', '+966 50 111 2233', '1011111111', 'platform_admin', true),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'local_auth_doc_noor', 'doctor.noor@naseej.health', '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq', 'د. فيصل الشمري', 'Dr. Faisal Al-Shammari', '+966 50 333 4455', '1033333333', 'user', true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'local_auth_rec_noor', 'reception.noor@naseej.health', '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq', 'نورة القحطاني', 'Noura Al-Qahtani', '+966 50 444 5566', '1044444444', 'user', true),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'local_auth_patient', 'patient@naseej.health', '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq', 'محمد المنصور', 'Mohammed Al-Mansoor', '+966 50 555 6677', '1055555555', 'user', true);

INSERT INTO organization_memberships (organization_id, user_id, role, specialty_ar, specialty_en, license_number, status)
VALUES
('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'doctor', 'أمراض القلب والأوعية الدموية', 'Cardiology', 'MD-45129', 'active'),
('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'reception', 'خدمات المرضى والاستقبال', 'Patient Services', 'REC-1022', 'active');

-- -----------------------------------------------------------------------------
-- 2. The patient: Mohammed Al-Mansoor
-- -----------------------------------------------------------------------------
INSERT INTO patient_profiles (id, user_id, national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, email, emergency_contact_name, emergency_contact_phone)
VALUES ('10000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '1055555555', 'محمد المنصور', 'Mohammed Al-Mansoor', '1988-06-14', 'male', 'O+',
        '+966 50 555 6677', 'patient@naseej.health', 'عبدالله المنصور (أخ)', '+966 50 999 8877');

-- -----------------------------------------------------------------------------
-- 3. Health profile: what the patient keeps (health_entries)
-- -----------------------------------------------------------------------------
INSERT INTO health_entries (patient_id, kind, title, status, start_date, event_date, dose, frequency, reaction, severity, value, unit, provider_name, notes, source, review_status, confirmed_at)
VALUES
-- conditions
('10000000-0000-0000-0000-000000000001', 'condition', 'ارتفاع ضغط الدم (Hypertension)', 'active', CURRENT_DATE - 380, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'أتابع مع طبيب القلب كل ثلاثة أشهر.', 'patient', 'confirmed', NOW()),
('10000000-0000-0000-0000-000000000001', 'condition', 'صداع نصفي (Migraine)', 'past', CURRENT_DATE - 2200, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'patient', 'confirmed', NOW()),
-- medications
('10000000-0000-0000-0000-000000000001', 'medication', 'أملوديبين (Amlodipine)', 'active', CURRENT_DATE - 14, NULL, '5 mg', 'مرة واحدة يوميًا صباحًا', NULL, NULL, NULL, NULL, 'د. فيصل الشمري', NULL, 'patient', 'confirmed', NOW()),
('10000000-0000-0000-0000-000000000001', 'medication', 'باراسيتامول (Paracetamol)', 'active', CURRENT_DATE - 200, NULL, '500 mg', 'عند الحاجة، لا يزيد عن 3 مرات يوميًا', NULL, NULL, NULL, NULL, NULL, NULL, 'patient', 'confirmed', NOW()),
-- allergies
('10000000-0000-0000-0000-000000000001', 'allergy', 'بنسلين (Penicillin)', NULL, NULL, NULL, NULL, NULL, 'طفح جلدي شديد وضيق في التنفس', 'severe', NULL, NULL, NULL, NULL, 'patient', 'confirmed', NOW()),
('10000000-0000-0000-0000-000000000001', 'allergy', 'غبار الطلع (Pollen)', NULL, NULL, NULL, NULL, NULL, 'عطاس وسيلان في الأنف في الربيع', 'mild', NULL, NULL, NULL, NULL, 'patient', 'confirmed', NOW()),
-- procedure
('10000000-0000-0000-0000-000000000001', 'procedure', 'استئصال الزائدة الدودية (Appendectomy)', NULL, NULL, CURRENT_DATE - 4900, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'patient', 'confirmed', NOW()),
-- measurements
('10000000-0000-0000-0000-000000000001', 'measurement', 'ضغط الدم (Blood pressure)', NULL, NULL, CURRENT_DATE - 5, NULL, NULL, NULL, NULL, '138/88', 'mmHg', NULL, 'قياس في المنزل صباحًا.', 'patient', 'confirmed', NOW()),
-- a visit the patient keeps
('10000000-0000-0000-0000-000000000001', 'visit', 'متابعة ضغط الدم', NULL, NULL, CURRENT_DATE - 14, NULL, NULL, NULL, NULL, NULL, NULL, 'د. فيصل الشمري — مركز النور', 'بدأ أملوديبين وطُلبت تحاليل دم.', 'patient', 'confirmed', NOW()),
('10000000-0000-0000-0000-000000000001', 'visit', 'زيارة متابعة القلب', NULL, NULL, CURRENT_DATE + 5, NULL, NULL, NULL, NULL, NULL, NULL, 'د. فيصل الشمري — مركز النور', 'موعد المتابعة بعد أسبوعين من بدء الدواء.', 'patient', 'confirmed', NOW());

-- -----------------------------------------------------------------------------
-- 4. Symptoms (three)
-- -----------------------------------------------------------------------------
INSERT INTO symptom_reports (patient_id, symptom_description, severity, onset_date, notes, duration_text, frequency, better_factors, worse_factors, captured_via)
VALUES
('10000000-0000-0000-0000-000000000001', 'صداع في الجهة اليمنى مع دوخة خفيفة', 5, CURRENT_DATE - 3, 'يظهر غالبًا بعد الظهر.', 'ساعتان تقريبًا', 'intermittent', 'الراحة في غرفة هادئة', 'قلة النوم والإجهاد', 'form'),
('10000000-0000-0000-0000-000000000001', 'ضيق في التنفس عند صعود الدرج', 3, CURRENT_DATE - 12, NULL, 'دقائق قليلة', 'occasional', 'التوقف والراحة', 'صعود أكثر من طابقين', 'voice'),
('10000000-0000-0000-0000-000000000001', 'ألم أسفل الظهر', 2, CURRENT_DATE - 40, 'أسوأ بعد الجلوس الطويل.', NULL, 'weekly', 'المشي الخفيف', 'الجلوس الطويل', 'form');

-- -----------------------------------------------------------------------------
-- 5. One visit recorded by the center (approved) and a hidden draft, for the portal checks
-- -----------------------------------------------------------------------------
INSERT INTO visits (id, organization_id, patient_id, clinician_id, visit_date, chief_complaint, vital_signs, examination_notes, diagnosis, treatment_plan, status, approved_by, approved_at)
VALUES
('40000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW() - INTERVAL '14 days',
 'صداع صباحي متكرر', '{"blood_pressure": "138/88", "pulse": 76, "weight_kg": 82}'::jsonb, 'الأصوات القلبية منتظمة والرئتان صافيتان.',
 'ارتفاع ضغط الدم الأولي — المرحلة الأولى', 'نظام غذائي قليل الصوديوم، مشي 30 دقيقة يوميًا، وبدء أملوديبين 5 ملغ صباحًا.', 'approved', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW() - INTERVAL '14 days'),
('40000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW(),
 'متابعة قراءات الضغط', '{"blood_pressure": "126/82"}'::jsonb, 'مسودة لم تُعتمد بعد.', 'مسودة', 'مسودة', 'draft', NULL, NULL);

INSERT INTO prescriptions (id, organization_id, visit_id, patient_id, clinician_id, notes, status, approved_by, approved_at)
VALUES ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'تم التحقق من حساسية البنسلين.', 'approved', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW() - INTERVAL '14 days');

INSERT INTO prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions)
VALUES ('50000000-0000-0000-0000-000000000001', 'أملوديبين (Amlodipine)', '5 mg', 'مرة واحدة يوميًا صباحًا', '30 يومًا', 'تؤخذ بعد الإفطار مع كأس ماء.');

INSERT INTO lab_orders (id, organization_id, visit_id, patient_id, clinician_id, test_name_ar, test_name_en, test_category, status)
VALUES ('60000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'صورة الدم ودهون الدم', 'Blood count and lipid profile', 'Biochemistry', 'completed');

INSERT INTO lab_results (organization_id, lab_order_id, parameter_name, value, unit, reference_range, is_abnormal, status, reviewed_by, reviewed_at)
VALUES
('11111111-1111-1111-1111-111111111111', '60000000-0000-0000-0000-000000000001', 'الهيموجلوبين (Hemoglobin)', '14.8', 'g/dL', '13.5 - 17.5', false, 'approved', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW() - INTERVAL '13 days'),
('11111111-1111-1111-1111-111111111111', '60000000-0000-0000-0000-000000000001', 'الكوليسترول الضار (LDL)', '162', 'mg/dL', '< 130', true, 'approved', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW() - INTERVAL '13 days');

-- -----------------------------------------------------------------------------
-- 6. Documents (three). The files are written by the seed script (storage_path starts with demo/).
--    1 and 3 are in the patient's own vault; 2 was released by the center.
-- -----------------------------------------------------------------------------
INSERT INTO documents (id, organization_id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by, title, document_date, visit_id, source_type, review_status, visible_to_patient, ai_processing_allowed, doc_type, provider_name)
VALUES
('80000000-0000-0000-0000-000000000001', NULL, '10000000-0000-0000-0000-000000000001', 'lab-report.pdf', 'demo/lab-report.pdf', 'application/pdf', 0, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 'تقرير تحاليل الدم', CURRENT_DATE - 13, NULL, 'patient_uploaded', 'unreviewed', TRUE, TRUE, 'lab_report', 'مختبر النور'),
('80000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'prescription.pdf', 'demo/prescription.pdf', 'application/pdf', 0, 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'وصفة أملوديبين', CURRENT_DATE - 14, '40000000-0000-0000-0000-000000000001', 'clinician_uploaded', 'reviewed', TRUE, FALSE, 'prescription', 'د. فيصل الشمري'),
('80000000-0000-0000-0000-000000000003', NULL, '10000000-0000-0000-0000-000000000001', 'chest-xray-report.pdf', 'demo/chest-xray-report.pdf', 'application/pdf', 0, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 'تقرير أشعة الصدر', CURRENT_DATE - 90, NULL, 'patient_uploaded', 'unreviewed', TRUE, FALSE, 'imaging_report', 'مركز الأشعة الحديث');

-- Two readings of the lab report waiting for the patient to confirm or reject (synthetic: no AI provider produced them).
INSERT INTO document_processing (document_id, organization_id, status, provider, model, suggested_type, page_count, attempts, requested_by, started_at, finished_at)
VALUES ('80000000-0000-0000-0000-000000000001', NULL, 'completed', 'synthetic', 'seed', 'lab_report', 1, 1, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', NOW() - INTERVAL '13 days', NOW() - INTERVAL '13 days');

INSERT INTO document_facts (document_id, organization_id, patient_id, kind, label, value, unit, fact_date, source_page, source_passage)
VALUES
('80000000-0000-0000-0000-000000000001', NULL, '10000000-0000-0000-0000-000000000001', 'lab_value', 'الكوليسترول الضار (LDL)', '162', 'mg/dL', CURRENT_DATE - 13, 1, 'LDL cholesterol 162 mg/dL'),
('80000000-0000-0000-0000-000000000001', NULL, '10000000-0000-0000-0000-000000000001', 'lab_value', 'فيتامين د (Vitamin D)', '18', 'ng/mL', CURRENT_DATE - 13, 1, 'Vitamin D 18 ng/mL');

-- -----------------------------------------------------------------------------
-- 7. Notifications (two)
-- -----------------------------------------------------------------------------
INSERT INTO notifications (recipient_user_id, recipient_role, organization_id, event_type, category, params, related_type, related_id, destination_kind, destination_id, dedupe_key, created_at, read_at)
VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'patient', '11111111-1111-1111-1111-111111111111', 'document.released', 'records', '{}'::jsonb, 'document', '80000000-0000-0000-0000-000000000002', 'document', '80000000-0000-0000-0000-000000000002', 'seed:document.released:2', NOW() - INTERVAL '2 hours', NULL),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'patient', NULL, 'account.password_changed', 'account', '{}'::jsonb, NULL, NULL, 'account_security', NULL, 'seed:account.password_changed', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days');
