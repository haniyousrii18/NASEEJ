-- =============================================================================
-- Naseej | نَسيج — Synthetic demo data (100% synthetic, small on purpose)
-- =============================================================================
-- Applied by `npm --prefix backend run seed`, which first empties every table (see backend/scripts/seed.ts), then runs
-- this file, writes the demo PDFs and creates the visit summaries and a share. Two or three examples per page.
-- Nothing here belongs to a clinic: the center, staff accounts and center-recorded visits that the API tests need are
-- created by backend/tests/setup.ts, not by the demo.
--
-- Sign in (local use only):  patient@naseej.health  /  Password123!
--
-- Fixed ids (the tests rely on them):
--   Patient user          eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee
--   Patient profile       10000000-0000-0000-0000-000000000001
-- Password hash below is bcrypt (10 rounds) of 'Password123!'.

-- -----------------------------------------------------------------------------
-- 1. The patient's account
-- -----------------------------------------------------------------------------
INSERT INTO users (id, auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, national_id, system_role, is_active)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'local_auth_patient', 'patient@naseej.health', '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq', 'محمد المنصور', 'Mohammed Al-Mansoor', '+966 50 555 6677', '1055555555', 'user', true);

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
-- -----------------------------------------------------------------------------
-- 5. Documents (three), all in the patient's own vault. The files are written by the seed script (storage_path starts with demo/).
-- -----------------------------------------------------------------------------
INSERT INTO documents (id, organization_id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by, title, document_date, visit_id, source_type, review_status, visible_to_patient, ai_processing_allowed, doc_type, provider_name)
VALUES
('80000000-0000-0000-0000-000000000001', NULL, '10000000-0000-0000-0000-000000000001', 'lab-report.pdf', 'demo/lab-report.pdf', 'application/pdf', 0, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 'تقرير تحاليل الدم', CURRENT_DATE - 13, NULL, 'patient_uploaded', 'unreviewed', TRUE, TRUE, 'lab_report', 'مختبر النور'),
('80000000-0000-0000-0000-000000000002', NULL, '10000000-0000-0000-0000-000000000001', 'prescription.pdf', 'demo/prescription.pdf', 'application/pdf', 0, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 'وصفة أملوديبين', CURRENT_DATE - 14, NULL, 'patient_uploaded', 'unreviewed', TRUE, FALSE, 'prescription', 'د. فيصل الشمري'),
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
-- 6. Notifications (two)
-- -----------------------------------------------------------------------------
INSERT INTO notifications (recipient_user_id, recipient_role, organization_id, event_type, category, params, related_type, related_id, destination_kind, destination_id, dedupe_key, created_at, read_at)
VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'patient', NULL, 'document.released', 'records', '{}'::jsonb, 'document', '80000000-0000-0000-0000-000000000002', 'document', '80000000-0000-0000-0000-000000000002', 'seed:document.released:2', NOW() - INTERVAL '2 hours', NULL),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'patient', NULL, 'account.password_changed', 'account', '{}'::jsonb, NULL, NULL, 'account_security', NULL, 'seed:account.password_changed', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days');
