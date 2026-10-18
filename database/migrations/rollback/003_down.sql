-- Rollback of migration 003. DESTRUCTIVE for the data these tables hold (delegations, operational messages,
-- AI extraction results). Take a backup first. Original documents and clinical records are not touched.
DROP TABLE IF EXISTS document_facts;
DROP TABLE IF EXISTS document_processing;
ALTER TABLE documents DROP COLUMN IF EXISTS ai_processing_allowed;
DROP TABLE IF EXISTS ops_message_replies;
DROP TABLE IF EXISTS ops_messages;
ALTER TABLE patient_messages DROP COLUMN IF EXISTS sent_by_caregiver_id;
DROP TABLE IF EXISTS caregiver_delegations;
DELETE FROM schema_migrations WHERE version = '003_caregivers_ops_messages_ai_review.sql';
