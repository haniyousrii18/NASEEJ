-- =============================================================================
-- Naseej | نَسيج — Migration 003: caregiver delegation, operational messaging, AI document review
-- =============================================================================
-- Additive and re-runnable: every statement uses IF NOT EXISTS / guarded DO blocks. Nothing is dropped and no
-- existing row is rewritten. Rollback: database/migrations/rollback/003_down.sql.
--
-- A. caregiver_delegations   explicit, scoped, expiring access granted BY a patient TO a caregiver account.
-- B. patient_messages        records which caregiver (if any) sent a message on the patient's behalf.
-- C. ops_messages(+replies)  operational messages between reception and clinicians (no clinical content).
-- D. document AI columns + document_processing + document_facts
--                            provider-backed extraction kept separate from verified clinical data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Caregiver delegations
--    A family relationship alone never grants access. Access exists only while a row is 'active' AND unexpired,
--    and each capability is its own flag: viewing records does not imply managing appointments or messaging.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caregiver_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    caregiver_email VARCHAR(255) NOT NULL,                         -- lower-cased; matched to the signed-in account on accept
    caregiver_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- set when the caregiver accepts
    relationship VARCHAR(60),                                      -- a label only (e.g. "daughter"); it grants nothing
    can_view_records BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_appointments BOOLEAN NOT NULL DEFAULT FALSE,
    can_send_messages BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'invited',                 -- invited | active | declined | revoked | ended
    invited_by UUID NOT NULL REFERENCES users(id),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,                               -- access (and a pending invitation) ends here
    ended_at TIMESTAMPTZ,
    ended_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_status_chk') THEN
        ALTER TABLE caregiver_delegations ADD CONSTRAINT caregiver_status_chk
            CHECK (status IN ('invited', 'active', 'declined', 'revoked', 'ended'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_scope_chk') THEN
        ALTER TABLE caregiver_delegations ADD CONSTRAINT caregiver_scope_chk
            CHECK (can_view_records OR can_manage_appointments OR can_send_messages);
    END IF;
END $$;

-- One open (invited or active) delegation per patient and caregiver email.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_caregiver_delegation
    ON caregiver_delegations(patient_id, caregiver_email) WHERE status IN ('invited', 'active');
CREATE INDEX IF NOT EXISTS idx_caregiver_patient ON caregiver_delegations(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_caregiver_email ON caregiver_delegations(caregiver_email, status);
CREATE INDEX IF NOT EXISTS idx_caregiver_user ON caregiver_delegations(caregiver_user_id, status);

-- -----------------------------------------------------------------------------
-- B. A message sent by a caregiver stays attributable to them.
-- -----------------------------------------------------------------------------
ALTER TABLE patient_messages
    ADD COLUMN IF NOT EXISTS sent_by_caregiver_id UUID REFERENCES users(id);

-- -----------------------------------------------------------------------------
-- C. Operational messages (reception <-> clinicians)
--    Coordination about a booking, an arrival or paperwork. It is NOT a clinical or urgent-care channel and
--    carries no clinical content. A message may point at an appointment or at a patient (administrative context).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE SET NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'scheduling',            -- scheduling | arrival | paperwork | logistics | other
    subject VARCHAR(160) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    from_user_id UUID NOT NULL REFERENCES users(id),
    from_role VARCHAR(20) NOT NULL,                                -- reception | doctor
    to_role VARCHAR(20) NOT NULL,                                  -- reception | doctor
    to_user_id UUID REFERENCES users(id),                          -- a specific clinician, or NULL for the role queue
    status VARCHAR(20) NOT NULL DEFAULT 'new',                     -- new | read | in_progress | resolved
    read_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_messages_status_chk') THEN
        ALTER TABLE ops_messages ADD CONSTRAINT ops_messages_status_chk CHECK (status IN ('new', 'read', 'in_progress', 'resolved'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_messages_roles_chk') THEN
        ALTER TABLE ops_messages ADD CONSTRAINT ops_messages_roles_chk
            CHECK (from_role IN ('reception', 'doctor') AND to_role IN ('reception', 'doctor') AND from_role <> to_role);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_messages_category_chk') THEN
        ALTER TABLE ops_messages ADD CONSTRAINT ops_messages_category_chk
            CHECK (category IN ('scheduling', 'arrival', 'paperwork', 'logistics', 'other'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ops_messages_org ON ops_messages(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_messages_to ON ops_messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_ops_messages_appt ON ops_messages(appointment_id);

CREATE TABLE IF NOT EXISTS ops_message_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES ops_messages(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    author_role VARCHAR(20) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_replies_message ON ops_message_replies(message_id, created_at);

-- -----------------------------------------------------------------------------
-- D. AI-assisted document review
--    ai_processing_allowed   the patient's explicit permission to send THIS file to the configured AI provider.
--                            Clinician-uploaded files are controlled by the clinician's own center.
--    document_processing     one row per document: honest job state (queued/processing/failed/completed).
--    document_facts          candidate facts the provider read from the file. They stay 'unreviewed' suggestions,
--                            separate from visits/labs/prescriptions, until a clinician accepts, corrects or rejects them.
-- -----------------------------------------------------------------------------
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS ai_processing_allowed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS document_processing (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',                  -- queued | processing | failed | completed
    provider VARCHAR(40) NOT NULL,
    model VARCHAR(80),
    suggested_type VARCHAR(40),                                    -- classification suggestion; never overwrites anything
    suggested_type_confidence NUMERIC(4,3),
    page_count INT,
    error_code VARCHAR(40),
    attempts INT NOT NULL DEFAULT 0,
    requested_by UUID REFERENCES users(id),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_processing_status_chk') THEN
        ALTER TABLE document_processing ADD CONSTRAINT document_processing_status_chk
            CHECK (status IN ('queued', 'processing', 'failed', 'completed'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS document_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,                                     -- condition | medication | allergy | lab_value | procedure | followup | other
    label VARCHAR(255) NOT NULL,                                   -- what the provider read (or the clinician's correction)
    value VARCHAR(255),
    unit VARCHAR(50),
    fact_date DATE,
    source_page INT,
    source_passage VARCHAR(600),                                   -- the passage the provider says it read this from
    confidence NUMERIC(4,3),                                       -- provider-reported; NULL when the provider gave none
    rationale VARCHAR(400),                                        -- why this item was surfaced
    original JSONB NOT NULL DEFAULT '{}'::jsonb,                   -- the provider's output, kept untouched after a correction
    review_status VARCHAR(20) NOT NULL DEFAULT 'unreviewed',       -- unreviewed | accepted | corrected | rejected
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_facts_kind_chk') THEN
        ALTER TABLE document_facts ADD CONSTRAINT document_facts_kind_chk
            CHECK (kind IN ('condition', 'medication', 'allergy', 'lab_value', 'procedure', 'followup', 'other'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_facts_review_chk') THEN
        ALTER TABLE document_facts ADD CONSTRAINT document_facts_review_chk
            CHECK (review_status IN ('unreviewed', 'accepted', 'corrected', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_facts_doc ON document_facts(document_id);
CREATE INDEX IF NOT EXISTS idx_document_facts_patient ON document_facts(organization_id, patient_id, review_status);

-- -----------------------------------------------------------------------------
-- Membership role list: the 'caregiver' role already exists; nothing to change.
-- -----------------------------------------------------------------------------
