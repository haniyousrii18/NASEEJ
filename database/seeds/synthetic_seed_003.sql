-- =============================================================================
-- Naseej | نَسيج — Synthetic seed 003 (requires migration 003). Synthetic data only; password for all: Password123!
-- Adds one caregiver account and one ACTIVE delegation from patient 1, limited to viewing records and managing
-- appointments (no messaging), so the delegated-access flow can be seen and the scope limits can be tested.
-- =============================================================================
INSERT INTO users (id, auth_provider_id, email, password_hash, full_name_ar, full_name_en, phone, national_id, system_role, is_active)
VALUES (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03',
    'local_auth_caregiver_noor',
    'caregiver.noor@naseej.health',
    '$2a$10$Zc40Het2zBASAFwtnukmIu5h/B05aJ6C/q9MWANvNV8CoWU8lEBNq',
    'عبدالله المنصور',
    'Abdullah Al-Mansoor',
    '+966 50 999 8877',
    '1099999903',
    'user',
    true
)
ON CONFLICT (id) DO NOTHING;

-- A caregiver account belongs to a center only so it can sign in; what it can see comes from delegations alone.
INSERT INTO organization_memberships (id, organization_id, user_id, role, status)
VALUES (
    'f0000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03',
    'caregiver',
    'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO caregiver_delegations
    (id, patient_id, caregiver_email, caregiver_user_id, relationship, can_view_records, can_manage_appointments, can_send_messages,
     status, invited_by, accepted_at, expires_at)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'caregiver.noor@naseej.health',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03',
    'brother',
    true,
    true,
    false,
    'active',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    NOW(),
    NOW() + INTERVAL '180 days'
)
ON CONFLICT (id) DO NOTHING;
