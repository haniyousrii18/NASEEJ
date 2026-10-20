-- =============================================================================
-- Naseej | نَسيج — Migration 005: patient-owned health record, document vault, visit preparation,
--                                  temporary QR sharing and AI interaction log
-- =============================================================================
-- Additive and re-runnable (IF NOT EXISTS / guarded DO blocks). Nothing is dropped and no existing row is rewritten.
-- Rollback: database/migrations/rollback/005_down.sql.
--
-- A. health_entries       conditions, medications, allergies, procedures, measurements and visits the PATIENT keeps,
--                         independent of any center. Each carries source + review state.
-- B. symptom_reports      richer symptom fields, soft delete and edit time.
-- C. documents            may belong to the patient alone (no center); type, provider, soft delete; document_links.
-- D. visit_preps          the editable, approvable clinician-facing summary.
-- E. record_shares        temporary, revocable, read-only access by an opaque token (only its SHA-256 is stored),
--                         share_documents, share_access_events.
-- G. patient_profiles.ai_assistant_consent_at is described below; F. ai_interactions      metadata only (never prompts, answers or document text).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Patient-entered health facts
--    source          who/what the fact came from: patient (typed), assistant (drafted in chat, confirmed by the patient),
--                    document (suggested from a file, confirmed by the patient), clinician
--    review_status   confirmed = the patient confirmed it; needs_review = kept for later check (never shown as verified)
--    A fact read by AI from a document is NOT a health_entry until the patient confirms it (document_facts holds the suggestion).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20),
    start_date DATE,
    end_date DATE,
    event_date DATE,
    dose VARCHAR(120),
    frequency VARCHAR(120),
    reaction VARCHAR(255),
    severity VARCHAR(20),
    value VARCHAR(60),
    unit VARCHAR(30),
    provider_name VARCHAR(200),
    notes VARCHAR(2000),
    source VARCHAR(20) NOT NULL DEFAULT 'patient',
    review_status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    source_fact_id UUID REFERENCES document_facts(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_entries_kind_chk') THEN
        ALTER TABLE health_entries ADD CONSTRAINT health_entries_kind_chk
            CHECK (kind IN ('condition', 'medication', 'allergy', 'procedure', 'measurement', 'visit'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_entries_source_chk') THEN
        ALTER TABLE health_entries ADD CONSTRAINT health_entries_source_chk
            CHECK (source IN ('patient', 'assistant', 'document', 'clinician'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_entries_review_chk') THEN
        ALTER TABLE health_entries ADD CONSTRAINT health_entries_review_chk
            CHECK (review_status IN ('confirmed', 'needs_review'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_entries_status_chk') THEN
        ALTER TABLE health_entries ADD CONSTRAINT health_entries_status_chk
            CHECK (status IS NULL OR status IN ('active', 'past'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_entries_severity_chk') THEN
        ALTER TABLE health_entries ADD CONSTRAINT health_entries_severity_chk
            CHECK (severity IS NULL OR severity IN ('mild', 'moderate', 'severe'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_entries_dates_chk') THEN
        ALTER TABLE health_entries ADD CONSTRAINT health_entries_dates_chk
            CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_health_entries_patient ON health_entries(patient_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_health_entries_document ON health_entries(source_document_id);
CREATE INDEX IF NOT EXISTS idx_health_entries_fact ON health_entries(source_fact_id);

-- -----------------------------------------------------------------------------
-- B. Symptoms: the fields a person can say in one breath, soft delete (undo), edit time
-- -----------------------------------------------------------------------------
ALTER TABLE symptom_reports
    ADD COLUMN IF NOT EXISTS duration_text VARCHAR(100),
    ADD COLUMN IF NOT EXISTS frequency VARCHAR(20),
    ADD COLUMN IF NOT EXISTS better_factors VARCHAR(500),
    ADD COLUMN IF NOT EXISTS worse_factors VARCHAR(500),
    ADD COLUMN IF NOT EXISTS captured_via VARCHAR(12) NOT NULL DEFAULT 'form',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'symptom_frequency_chk') THEN
        ALTER TABLE symptom_reports ADD CONSTRAINT symptom_frequency_chk
            CHECK (frequency IS NULL OR frequency IN ('once', 'constant', 'intermittent', 'daily', 'weekly', 'occasional'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'symptom_captured_via_chk') THEN
        ALTER TABLE symptom_reports ADD CONSTRAINT symptom_captured_via_chk
            CHECK (captured_via IN ('form', 'assistant', 'voice'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_symptoms_patient_live ON symptom_reports(patient_id, onset_date DESC) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- C. Documents in the patient's own vault
--    A document with no organization belongs to the patient alone: no center clinician can ever see it.
--    It reaches a clinician only through a share the patient creates.
-- -----------------------------------------------------------------------------
ALTER TABLE documents ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE document_processing ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE document_facts ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS doc_type VARCHAR(30),
    ADD COLUMN IF NOT EXISTS provider_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_doc_type_chk') THEN
        ALTER TABLE documents ADD CONSTRAINT documents_doc_type_chk
            CHECK (doc_type IS NULL OR doc_type IN ('lab_report', 'imaging_report', 'prescription', 'discharge_summary', 'clinical_note', 'referral', 'vaccination_record', 'administrative', 'other')) NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_patient_live ON documents(patient_id, created_at DESC) WHERE deleted_at IS NULL;

-- The patient's decision about an AI suggestion, kept apart from the clinician's review columns.
ALTER TABLE document_facts
    ADD COLUMN IF NOT EXISTS patient_decision VARCHAR(12),
    ADD COLUMN IF NOT EXISTS patient_decided_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_facts_patient_decision_chk') THEN
        ALTER TABLE document_facts ADD CONSTRAINT document_facts_patient_decision_chk
            CHECK (patient_decision IS NULL OR patient_decision IN ('confirmed', 'rejected'));
    END IF;
END $$;

-- A document can be related to a symptom, a health entry or a center visit of the same patient.
CREATE TABLE IF NOT EXISTS document_links (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    link_type VARCHAR(10) NOT NULL,
    target_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, link_type, target_id),
    CONSTRAINT document_links_type_chk CHECK (link_type IN ('symptom', 'entry', 'visit'))
);
CREATE INDEX IF NOT EXISTS idx_document_links_target ON document_links(link_type, target_id);

-- -----------------------------------------------------------------------------
-- D. Visit preparation
--    content is the draft the patient edits (reason, sections of items, each item pointing at its source record).
--    Only an approved preparation can be shared.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visit_preps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    visit_date DATE,
    status VARCHAR(10) NOT NULL DEFAULT 'draft',
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT visit_preps_status_chk CHECK (status IN ('draft', 'approved'))
);
CREATE INDEX IF NOT EXISTS idx_visit_preps_patient ON visit_preps(patient_id, updated_at DESC);

-- -----------------------------------------------------------------------------
-- E. Temporary read-only shares
--    token_hash   SHA-256 of a 256-bit random token. The token itself is shown once, in the QR, and never stored.
--    snapshot     exactly what the patient approved, frozen at creation: later edits to the record never leak into a share.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS record_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    prep_id UUID REFERENCES visit_preps(id) ON DELETE SET NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    label VARCHAR(120),
    snapshot JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    view_count INT NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_record_shares_patient ON record_shares(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_shares_prep ON record_shares(prep_id);

CREATE TABLE IF NOT EXISTS share_documents (
    share_id UUID NOT NULL REFERENCES record_shares(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (share_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_share_documents_document ON share_documents(document_id);

-- ip_hash is a keyed, truncated hash: enough to tell "the same device opened it twice", not an address.
CREATE TABLE IF NOT EXISTS share_access_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES record_shares(id) ON DELETE CASCADE,
    event VARCHAR(20) NOT NULL,
    device VARCHAR(10),
    ip_hash CHAR(16),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT share_access_event_chk CHECK (event IN ('view', 'document', 'denied_expired', 'denied_revoked'))
);
CREATE INDEX IF NOT EXISTS idx_share_access_share ON share_access_events(share_id, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- F. AI interactions: metadata only, used for rate limiting, audit and honest error counts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    outcome VARCHAR(20) NOT NULL,
    provider VARCHAR(40),
    model VARCHAR(80),
    latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_interactions_kind_chk CHECK (kind IN ('assistant', 'prep_overview')),
    CONSTRAINT ai_interactions_outcome_chk CHECK (outcome IN ('answered', 'refused', 'urgent', 'error', 'not_configured'))
);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_patient ON ai_interactions(patient_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- G. The patient's explicit permission to send their record summary to the configured AI provider for the assistant.
--    NULL = never allowed. Withdrawing sets it back to NULL.
-- -----------------------------------------------------------------------------
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS ai_assistant_consent_at TIMESTAMPTZ;
