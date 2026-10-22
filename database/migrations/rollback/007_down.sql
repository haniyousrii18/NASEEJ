-- Rollback of 007. Accounts that registered by email have no national id, birth date, gender or phone, which the older schema
-- requires, so those accounts and everything in their records are removed first. Seeded and administrator-created accounts stay.
DELETE FROM patient_profiles WHERE national_id IS NULL OR date_of_birth IS NULL OR gender IS NULL OR phone IS NULL;
DELETE FROM users WHERE auth_provider_id LIKE 'local_signup_%';

DROP TABLE IF EXISTS auth_tokens;

ALTER TABLE patient_profiles ALTER COLUMN phone SET NOT NULL;
ALTER TABLE patient_profiles ALTER COLUMN gender SET NOT NULL;
ALTER TABLE patient_profiles ALTER COLUMN date_of_birth SET NOT NULL;
ALTER TABLE patient_profiles ALTER COLUMN national_id SET NOT NULL;

ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
