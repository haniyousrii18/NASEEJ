-- =============================================================================
-- Naseej | نَسيج — Synthetic Seed 002 (100% synthetic): longitudinal record + care coordination demo
-- Requires migration 002. Idempotent (ON CONFLICT DO NOTHING). Same demo password for all: Password123!
-- =============================================================================

-- A care coordinator at Al-Noor. This is a NEW demo account; no existing user is given the role.
INSERT INTO users (id, auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, national_id, system_role, is_active)
VALUES (
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    'local_auth_coord_noor',
    'coordinator.noor@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'ليلى الحربي',
    'Layla Al-Harbi',
    '+966 50 777 8899',
    '1077777777',
    'user',
    true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_memberships (id, organization_id, user_id, role, status)
VALUES (
    'c0c0c0c0-0000-4000-8000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    'care_coordinator',
    'active'
)
ON CONFLICT (id) DO NOTHING;

-- An approved visit at Al-Amal for patient 1, so the cross-center timeline has something to show
-- (visible to Al-Noor clinicians only while the consent below is active).
INSERT INTO visits (id, organization_id, patient_id, clinician_id, visit_date, chief_complaint, vital_signs, examination_notes, diagnosis, treatment_plan, status, approved_by, approved_at)
VALUES (
    '40000000-0000-0000-0000-0000000000a1',
    '22222222-2222-2222-2222-222222222222',
    '10000000-0000-0000-0000-000000000001',
    '99999999-9999-9999-9999-999999999999',
    NOW() - INTERVAL '45 days',
    'Routine check-up (synthetic)',
    '{"blood_pressure": "142/90", "pulse": 80}'::jsonb,
    'Synthetic demonstration note recorded at the second center.',
    'Elevated blood pressure reading, follow-up advised (synthetic)',
    'Synthetic plan: follow-up with primary center.',
    'approved',
    '99999999-9999-9999-9999-999999999999',
    NOW() - INTERVAL '45 days'
)
ON CONFLICT (id) DO NOTHING;

-- Patient 1 lets Al-Noor read records created at Al-Amal (all scopes) for a year.
INSERT INTO patient_consents (id, patient_id, from_organization_id, to_organization_id, scope, status, granted_at, expires_at, granted_by)
VALUES (
    '70000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'all',
    'active',
    NOW() - INTERVAL '20 days',
    NOW() + INTERVAL '345 days',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
)
ON CONFLICT (id) DO NOTHING;

-- Two synthetic document records. The files are created by the seed runner (backend/scripts/seed.ts).
INSERT INTO documents (id, organization_id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by, title, document_date, visit_id, source_type, review_status, reviewed_by, reviewed_at, visible_to_patient)
VALUES
(
    '80000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'synthetic-referral-letter.pdf',
    'demo/synthetic-referral-letter.pdf',
    'application/pdf',
    0,
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Referral letter (synthetic)',
    CURRENT_DATE - 14,
    '40000000-0000-0000-0000-000000000001',
    'clinician_uploaded',
    'reviewed',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '13 days',
    TRUE
),
(
    '80000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'synthetic-home-bp-log.pdf',
    'demo/synthetic-home-bp-log.pdf',
    'application/pdf',
    0,
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'Home blood-pressure log (synthetic, uploaded by patient)',
    CURRENT_DATE - 3,
    NULL,
    'patient_uploaded',
    'unreviewed',
    NULL,
    NULL,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- One open coordination case with a task and a log entry (operational content only).
INSERT INTO care_cases (id, organization_id, patient_id, coordinator_id, reason, status, opened_by)
VALUES (
    '90000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '10000000-0000-0000-0000-000000000001',
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    'Coordinate follow-up appointment and collect outstanding documents (synthetic)',
    'open',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO care_tasks (id, organization_id, case_id, title, details, task_type, owner_id, status, due_date, created_by)
VALUES (
    '91000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '90000000-0000-0000-0000-000000000001',
    'Request previous center records release form',
    'Ask the patient to confirm sharing with the second center (synthetic).',
    'missing_document',
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    'open',
    CURRENT_DATE + 7,
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO care_followup_log (id, organization_id, case_id, task_id, actor_id, event_type, note)
VALUES (
    '92000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '90000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    'task_created',
    'Task created during demo setup (synthetic).'
)
ON CONFLICT (id) DO NOTHING;
