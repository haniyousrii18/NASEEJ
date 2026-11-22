-- 008: a person may change their own name, once every 30 days.
--  * users.name_changed_at: when the name was last changed from the settings page. NULL until the first change, so every
--    existing account (and a fresh sign-up) can change its name straight away.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_changed_at TIMESTAMPTZ;
