-- 007: self-service accounts: sign-up with a real email, email verification, forgot/reset password.
--  * users.email_verified_at: NULL until the person opens the link mailed to that address. The DEFAULT is NOW(), so every row
--    inserted without a value (the demo seed, administrator-created accounts, existing rows) counts as verified; the sign-up
--    endpoint is the only code that writes NULL.
--  * users.password_changed_at: a session token issued before this moment is rejected, so a reset signs out every device.
--  * auth_tokens: single-use, expiring links for verification and reset. Only the SHA-256 of a token is stored, so a database
--    leak cannot be used to take over an account.
--  * patient_profiles: identifiers a self-registered patient does not have yet become optional. They are never invented.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TABLE patient_profiles ALTER COLUMN national_id DROP NOT NULL;
ALTER TABLE patient_profiles ALTER COLUMN date_of_birth DROP NOT NULL;
ALTER TABLE patient_profiles ALTER COLUMN gender DROP NOT NULL;
ALTER TABLE patient_profiles ALTER COLUMN phone DROP NOT NULL;

CREATE TABLE IF NOT EXISTS auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expiry ON auth_tokens(expires_at);
