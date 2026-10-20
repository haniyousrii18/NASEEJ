-- Rollback of 005. Vault documents that belong to no center cannot exist in the older schema, so they are removed first.
DROP TABLE IF EXISTS ai_interactions;
DROP TABLE IF EXISTS share_access_events;
DROP TABLE IF EXISTS share_documents;
DROP TABLE IF EXISTS record_shares;
DROP TABLE IF EXISTS visit_preps;
DROP TABLE IF EXISTS document_links;
DROP TABLE IF EXISTS health_entries;

ALTER TABLE document_facts DROP CONSTRAINT IF EXISTS document_facts_patient_decision_chk;
ALTER TABLE document_facts DROP COLUMN IF EXISTS patient_decision, DROP COLUMN IF EXISTS patient_decided_at;

DELETE FROM document_facts WHERE organization_id IS NULL;
DELETE FROM document_processing WHERE organization_id IS NULL;
DELETE FROM documents WHERE organization_id IS NULL;
ALTER TABLE document_facts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE document_processing ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN organization_id SET NOT NULL;

DROP INDEX IF EXISTS idx_documents_patient_live;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_chk;
ALTER TABLE documents DROP COLUMN IF EXISTS doc_type, DROP COLUMN IF EXISTS provider_name, DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_symptoms_patient_live;
ALTER TABLE symptom_reports DROP CONSTRAINT IF EXISTS symptom_frequency_chk;
ALTER TABLE symptom_reports DROP CONSTRAINT IF EXISTS symptom_captured_via_chk;
ALTER TABLE symptom_reports
    DROP COLUMN IF EXISTS duration_text, DROP COLUMN IF EXISTS frequency, DROP COLUMN IF EXISTS better_factors,
    DROP COLUMN IF EXISTS worse_factors, DROP COLUMN IF EXISTS captured_via, DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE patient_profiles DROP COLUMN IF EXISTS ai_assistant_consent_at;
