-- =============================================================================
-- Rollback for migration 002. NOT run automatically. Review docs/migrations.md first.
-- Data loss: care_cases, care_tasks, care_referrals, care_followup_log and the new documents / consents
-- columns are removed together with their contents. Core clinical tables are not touched.
-- After running it, also: DELETE FROM schema_migrations WHERE version = '002_longitudinal_record_and_coordination.sql';
-- =============================================================================

DROP TRIGGER IF EXISTS trg_followup_log_guard ON care_followup_log;
DROP TRIGGER IF EXISTS trg_audit_logs_guard ON audit_logs;
DROP FUNCTION IF EXISTS naseej_followup_log_guard();
DROP FUNCTION IF EXISTS naseej_audit_logs_guard();

DROP TABLE IF EXISTS care_followup_log;
DROP TABLE IF EXISTS care_referrals;
DROP TABLE IF EXISTS care_tasks;
DROP TABLE IF EXISTS care_cases;

ALTER TABLE organization_memberships DROP CONSTRAINT IF EXISTS memberships_role_chk;

DROP INDEX IF EXISTS uniq_active_consent;
DROP INDEX IF EXISTS idx_consents_patient;
DROP INDEX IF EXISTS idx_consents_to_org;
ALTER TABLE patient_consents DROP CONSTRAINT IF EXISTS consents_distinct_orgs_chk;
ALTER TABLE patient_consents DROP CONSTRAINT IF EXISTS consents_status_chk;
ALTER TABLE patient_consents DROP CONSTRAINT IF EXISTS consents_scope_chk;
ALTER TABLE patient_consents DROP COLUMN IF EXISTS granted_by, DROP COLUMN IF EXISTS revoked_by;

DROP INDEX IF EXISTS idx_documents_patient;
DROP INDEX IF EXISTS idx_documents_org;
DROP INDEX IF EXISTS idx_documents_visit;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_type_chk;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_review_status_chk;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_release_requires_review_chk;
ALTER TABLE documents
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS document_date,
    DROP COLUMN IF EXISTS visit_id,
    DROP COLUMN IF EXISTS source_type,
    DROP COLUMN IF EXISTS review_status,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS visible_to_patient,
    DROP COLUMN IF EXISTS updated_at;
