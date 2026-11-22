-- Rollback of 008.
ALTER TABLE users DROP COLUMN IF EXISTS name_changed_at;
