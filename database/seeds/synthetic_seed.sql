-- =============================================================================
-- Naseej | نَسيج — Synthetic Seed Data (100% Synthetic Demo Data)
-- =============================================================================

-- Deterministic UUIDs for Demo Data:
-- Center 1 (Al-Noor): '11111111-1111-1111-1111-111111111111'
-- Center 2 (Al-Amal): '22222222-2222-2222-2222-222222222222'
-- Platform Admin:     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
-- Manager Al-Noor:    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
-- Doctor Al-Noor:     'cccccccc-cccc-cccc-cccc-cccccccccccc'
-- Reception Al-Noor:  'dddddddd-dddd-dddd-dddd-dddddddddddd'
-- Patient User:       'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
-- Patient Profile 1:  '10000000-0000-0000-0000-000000000001'
-- Patient Profile 2:  '10000000-0000-0000-0000-000000000002'
-- Manager Al-Amal:    'ffffffff-ffff-ffff-ffff-ffffffffffff'
-- Doctor Al-Amal:     '99999999-9999-9999-9999-999999999999'

-- Bcrypt hash for 'Password123!' (Salt rounds 10):
-- $2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq

-- -----------------------------------------------------------------------------
-- 1. Organizations
-- -----------------------------------------------------------------------------
INSERT INTO organizations (id, name_ar, name_en, code, type, status, contact_phone, contact_email, address_ar, address_en)
VALUES 
(
    '11111111-1111-1111-1111-111111111111',
    'مركز النور الطبي التخصصي',
    'Al-Noor Specialized Medical Center',
    'AL_NOOR',
    'clinic',
    'active',
    '+966 11 456 7890',
    'info@alnoor-medical.sa',
    'طريق الملك فهد، الرياض، المملكة العربية السعودية',
    'King Fahd Road, Riyadh, Saudi Arabia'
),
(
    '22222222-2222-2222-2222-222222222222',
    'مستشفى الأمل التخصصي',
    'Al-Amal Specialized Hospital',
    'AL_AMAL',
    'hospital',
    'active',
    '+966 12 654 3210',
    'contact@alamal-hospital.sa',
    'طريق الأمير سلطان، جدة، المملكة العربية السعودية',
    'Prince Sultan Road, Jeddah, Saudi Arabia'
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. System Users (Demo Accounts for All Roles)
-- Password for all: Password123!
-- -----------------------------------------------------------------------------
INSERT INTO users (id, auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, national_id, system_role, is_active)
VALUES
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'local_auth_admin',
    'admin@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'سارة العتيبي',
    'Sarah Al-Otaibi',
    '+966 50 111 2233',
    '1011111111',
    'platform_admin',
    true
),
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'local_auth_mgr_noor',
    'manager.noor@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'د. خالد الغامدي',
    'Dr. Khalid Al-Ghamdi',
    '+966 50 222 3344',
    '1022222222',
    'user',
    true
),
(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'local_auth_doc_noor',
    'doctor.noor@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'د. فيصل الشمري',
    'Dr. Faisal Al-Shammari',
    '+966 50 333 4455',
    '1033333333',
    'user',
    true
),
(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'local_auth_rec_noor',
    'reception.noor@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'نورة القحطاني',
    'Noura Al-Qahtani',
    '+966 50 444 5566',
    '1044444444',
    'user',
    true
),
(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'local_auth_patient',
    'patient@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'محمد المنصور',
    'Mohammed Al-Mansoor',
    '+966 50 555 6677',
    '1055555555',
    'user',
    true
),
(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'local_auth_mgr_amal',
    'manager.amal@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'د. ريم الدوسري',
    'Dr. Reem Al-Dossary',
    '+966 50 666 7788',
    '1066666666',
    'user',
    true
),
(
    '99999999-9999-9999-9999-999999999999',
    'local_auth_doc_amal',
    'doctor.amal@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'د. زياد الحربي',
    'Dr. Ziyad Al-Harbi',
    '+966 50 777 8899',
    '1077777777',
    'user',
    true
)
ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- -----------------------------------------------------------------------------
-- 3. Organization Memberships
-- -----------------------------------------------------------------------------
INSERT INTO organization_memberships (id, organization_id, user_id, role, specialty_ar, specialty_en, license_number, status)
VALUES
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'center_manager',
    'إدارة المرافق الصحية',
    'Healthcare Administration',
    'HA-90812',
    'active'
),
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'doctor',
    'أمراض القلب والأوعية الدموية',
    'Cardiology',
    'MD-45129',
    'active'
),
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'reception',
    'خدمات المرضى والاستقبال',
    'Patient Services',
    'REC-1022',
    'active'
),
(
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'center_manager',
    'إدارة المستشفيات',
    'Hospital Administration',
    'HA-77410',
    'active'
),
(
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    '99999999-9999-9999-9999-999999999999',
    'doctor',
    'الغدد الصماء والسكري',
    'Endocrinology & Diabetes',
    'MD-88231',
    'active'
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Patient Profiles
-- -----------------------------------------------------------------------------
INSERT INTO patient_profiles (id, user_id, national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, email, emergency_contact_name, emergency_contact_phone)
VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '1055555555',
    'محمد المنصور',
    'Mohammed Al-Mansoor',
    '1988-06-14',
    'male',
    'O+',
    '+966 50 555 6677',
    'patient@naseej.health',
    'عبدالله المنصور (أخ)',
    '+966 50 999 8877'
),
(
    '10000000-0000-0000-0000-000000000002',
    NULL,
    '1088888888',
    'فاطمة الزهراني',
    'Fatima Al-Zahrani',
    '1994-11-20',
    'female',
    'A+',
    '+966 55 123 4567',
    'fatima.z@example.com',
    'سعد الزهراني (والد)',
    '+966 55 765 4321'
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Patient Allergies (Critical Clinical Safety)
-- -----------------------------------------------------------------------------
INSERT INTO patient_allergies (id, patient_id, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at)
VALUES
(
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000001',
    'بنسلين (Penicillin)',
    'Penicillin',
    'صدمة حساسية حادة وضيق تنفس',
    'Severe anaphylactic shock and bronchospasm',
    'severe',
    '2018-03-15'
),
(
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000001',
    'مركبات السلفا (Sulfa Drugs)',
    'Sulfa Drugs',
    'طفح جلدي وحكة منتشرة',
    'Generalized maculopapular rash and pruritus',
    'moderate',
    '2021-08-10'
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Patient-Center Links (Multi-Center Connectivity with Local MRN)
-- -----------------------------------------------------------------------------
INSERT INTO patient_center_links (id, organization_id, patient_id, mrn, status, first_visit_date)
VALUES
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'MRN-NOOR-1001',
    'active',
    '2025-01-15'
),
(
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    '10000000-0000-0000-0000-000000000001',
    'MRN-AMAL-5002',
    'active',
    '2025-04-10'
),
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000002',
    'MRN-NOOR-1002',
    'active',
    '2025-02-01'
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Clinician Schedules
-- -----------------------------------------------------------------------------
-- Dr. Faisal Al-Shammari works Sunday (0) to Thursday (4) from 09:00 to 15:00
INSERT INTO clinician_schedules (id, organization_id, clinician_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active)
VALUES
(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 0, '09:00', '15:00', 30, true),
(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1, '09:00', '15:00', 30, true),
(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 2, '09:00', '15:00', 30, true),
(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 3, '09:00', '15:00', 30, true),
(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 4, '09:00', '15:00', 30, true)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. Appointments
-- -----------------------------------------------------------------------------
INSERT INTO appointments (id, organization_id, patient_id, clinician_id, appointment_date, start_time, end_time, status, reason, check_in_time, created_by)
VALUES
(
    '30000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    CURRENT_DATE,
    '09:30',
    '10:00',
    'checked_in',
    'متابعة دورية لارتفاع ضغط الدم وفحص القلب',
    NOW() - INTERVAL '15 minutes',
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
),
(
    '30000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000002',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    CURRENT_DATE,
    '10:30',
    '11:00',
    'confirmed',
    'فحص إجهاد عام وخفقان متقطع',
    NULL,
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
),
(
    '30000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    CURRENT_DATE - INTERVAL '14 days',
    '11:00',
    '11:30',
    'completed',
    'استشارة أولى وتعديل الخطة العلاجية',
    NOW() - INTERVAL '14 days',
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
),
-- Synthetic patient-submitted appointment request; the reception workspace can confirm or cancel it.
(
    '30000000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    CURRENT_DATE + CASE WHEN ((8 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7) = 0 THEN 7 ELSE ((8 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7) END,
    '11:00',
    '11:30',
    'pending',
    NULL,
    NULL,
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. Clinical Visits (Approved Visit vs Draft Visit)
-- -----------------------------------------------------------------------------
INSERT INTO visits (id, organization_id, patient_id, clinician_id, appointment_id, visit_date, chief_complaint, vital_signs, examination_notes, diagnosis, treatment_plan, status, approved_by, approved_at)
VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '30000000-0000-0000-0000-000000000003',
    NOW() - INTERVAL '14 days',
    'صداع صباحي متكرر مع شعور بالثقل في مؤخرة الرأس',
    '{"blood_pressure": "138/88", "pulse": 76, "temperature": 37.0, "spo2": 98, "weight_kg": 82}'::jsonb,
    'الأصوات القلبية منتظمة، لا توجد نفخات، الرئتان صافيتان تماماً بالتسمع، فحص قاع العين سليم دون وذمة حليمة العصب.',
    'ارتفاع ضغط الدم الأولي — المرحلة الأولى (Essential Hypertension Stage 1)',
    '1. الالتزام بنظام غذائي قليل الصوديوم (DASH Diet) وممارسة المشي 30 دقيقة يومياً.\n2. بدء علاج Amlodipine 5mg حبة يومياً صباحاً.\n3. إجراء فحص وظائف كلى وتحليل دهون خلال أسبوعين.',
    'approved',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '14 days'
),
(
    '40000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '30000000-0000-0000-0000-000000000001',
    NOW(),
    'متابعة قراءات الضغط بعد أسبوعين من العلاج',
    '{"blood_pressure": "126/82", "pulse": 72, "temperature": 36.8, "spo2": 99, "weight_kg": 81.5}'::jsonb,
    'تحسن ملحوظ في قراءات الضغط الانقباضي والانبساطي، لا توجد وذمة في الأطراف السفلية.',
    'استجابة ممتازة للعلاج الخافض للضغط ومتابعة وظائف الأعضاء',
    'مسودة خطة: الاستمرار على الجرعة الحالية وإعادة تقييم وظائف الكبد والدهون.',
    'draft', -- Strict Draft: Must NEVER be shown in the patient portal before sign-off!
    NULL,
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 10. Prescriptions & Items
-- -----------------------------------------------------------------------------
INSERT INTO prescriptions (id, organization_id, visit_id, patient_id, clinician_id, notes, status, approved_by, approved_at)
VALUES
(
    '50000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'تم التحقق من سجل الحساسية (حساسية البنسلين والسلفا)؛ الدواء آمن وخالٍ من التعارض.',
    'approved',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '14 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO prescription_items (id, prescription_id, medication_name, dosage, frequency, duration, instructions)
VALUES
(
    gen_random_uuid(),
    '50000000-0000-0000-0000-000000000001',
    'أملوديبين (Amlodipine Besylate)',
    '5 mg',
    'مرة واحدة يومياً صباحاً',
    '30 يوماً',
    'تؤخذ الحبة صباحاً بعد الإفطار مع كأس ماء'
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 11. Laboratory Orders & Results
-- -----------------------------------------------------------------------------
INSERT INTO lab_orders (id, organization_id, visit_id, patient_id, clinician_id, test_name_ar, test_name_en, test_category, clinical_notes, status)
VALUES
(
    '60000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'صورة الدم الكاملة ووظائف الكلى',
    'Complete Blood Count (CBC) & Renal Function Panel',
    'Hematology & Biochemistry',
    'فحص روتيني لتقييم خط الأساس قبل العلاج',
    'completed'
),
(
    '60000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'فحص دهون الدم والكوليسترول الشامل',
    'Comprehensive Lipid Profile',
    'Biochemistry',
    'عينة صيام 10-12 ساعة',
    'completed'
)
ON CONFLICT (id) DO NOTHING;

-- Approved Lab Results (Visible to Patient)
INSERT INTO lab_results (id, organization_id, lab_order_id, parameter_name, value, unit, reference_range, is_abnormal, status, reviewed_by, reviewed_at)
VALUES
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '60000000-0000-0000-0000-000000000001',
    'الهيموجلوبين (Hemoglobin)',
    '14.8',
    'g/dL',
    '13.5 - 17.5',
    false,
    'approved',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '13 days'
),
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '60000000-0000-0000-0000-000000000001',
    'الكرياتينين المصلي (Serum Creatinine)',
    '0.95',
    'mg/dL',
    '0.70 - 1.20',
    false,
    'approved',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '13 days'
),
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '60000000-0000-0000-0000-000000000001',
    'البوتاسيوم (Potassium)',
    '4.3',
    'mmol/L',
    '3.5 - 5.1',
    false,
    'approved',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '13 days'
),
-- Draft Lab Result (Awaiting Clinical Review — MUST NOT be visible to Patient)
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '60000000-0000-0000-0000-000000000002',
    'الكوليسترول الكلي (Total Cholesterol)',
    '215',
    'mg/dL',
    '< 200',
    true,
    'draft', -- Unapproved Draft
    NULL,
    NULL
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 12. Patient Portal Communication (Messages & Symptom Reports)
-- -----------------------------------------------------------------------------
INSERT INTO patient_messages (id, organization_id, patient_id, subject, body, category, status, response, responded_by, responded_at)
VALUES
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'استفسار عن موعد تناول دواء الضغط في رمضان',
    'السلام عليكم دكتور فيصل، مع اقتراب شهر الصيام، هل أتناول حبة الأملوديبين عند الإفطار أم وقت السحور؟',
    'medical',
    'resolved',
    'وعليكم السلام ورحمة الله وبركاته يا أخ محمد. يفضل أخذ حبة أملوديبين يومياً بعد وجبة الإفطار مباشرة مع المحافظة على شرب كميات كافية من الماء.',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '5 days'
)
ON CONFLICT DO NOTHING;

INSERT INTO symptom_reports (id, patient_id, organization_id, symptom_description, severity, onset_date, notes)
VALUES
(
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'شعور خفيف بالدوخة عند الوقوف المفاجئ',
    3,
    NOW() - INTERVAL '2 days',
    'استمرت لعدة ثوانٍ وزالت تلقائياً بعد الجلوس'
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 13. Audit Logs (Initial Security Events)
-- -----------------------------------------------------------------------------
INSERT INTO audit_logs (id, organization_id, actor_id, actor_email, actor_role, action, resource_type, resource_id, ip_address, details)
VALUES
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'reception.noor@naseej.health',
    'reception',
    'APPOINTMENT_CHECK_IN',
    'appointment',
    '30000000-0000-0000-0000-000000000001',
    '127.0.0.1',
    '{"patient_name": "Mohammed Al-Mansoor", "status": "checked_in"}'::jsonb
),
(
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'doctor.noor@naseej.health',
    'doctor',
    'VISIT_APPROVE',
    'visit',
    '40000000-0000-0000-0000-000000000001',
    '127.0.0.1',
    '{"diagnosis": "Essential Hypertension Stage 1", "signed_by": "Dr. Faisal Al-Shammari"}'::jsonb
)
ON CONFLICT DO NOTHING;
