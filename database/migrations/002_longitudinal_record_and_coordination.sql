-- =============================================================================
-- Naseej | نَسيج — Migration 002: Longitudinal record provenance, consent integrity,
--                                  care coordination, and append-only audit guards
-- =============================================================================
-- Additive and re-runnable: every statement uses IF NOT EXISTS / guarded DO blocks, nothing is dropped,
-- no existing row is rewritten. Rollback: database/migrations/rollback/002_down.sql (see docs/migrations.md).
-- Constraints that could fail on legacy data are added NOT VALID: they protect new and updated rows
-- immediately and can be validated later with ALTER TABLE ... VALIDATE CONSTRAINT.

-- -----------------------------------------------------------------------------
-- A. Documents: provenance and release lifecycle
--    source_type        who/what the file came from
--    review_status      clinician review of the file ('unreviewed' until a doctor reviews it)
--    visible_to_patient releases the file to the patient; only reviewed clinician files may be released
-- -----------------------------------------------------------------------------
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS title VARCHAR(255),
    ADD COLUMN IF NOT EXISTS document_date DATE,
    ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'clinician_uploaded',
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'unreviewed',
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_source_type_chk') THEN
        ALTER TABLE documents ADD CONSTRAINT documents_source_type_chk
            CHECK (source_type IN ('patient_uploaded', 'clinician_uploaded', 'imported')) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_review_status_chk') THEN
        ALTER TABLE documents ADD CONSTRAINT documents_review_status_chk
            CHECK (review_status IN ('unreviewed', 'reviewed')) NOT VALID;
    END IF;
    -- A clinician or imported file can only be visible to the patient once a clinician has reviewed it.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_release_requires_review_chk') THEN
        ALTER TABLE documents ADD CONSTRAINT documents_release_requires_review_chk
            CHECK (source_type = 'patient_uploaded' OR visible_to_patient = FALSE OR review_status = 'reviewed') NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_visit ON documents(visit_id);

-- -----------------------------------------------------------------------------
-- B. Consents: who granted/revoked, no self-sharing, one active consent per scope
-- -----------------------------------------------------------------------------
ALTER TABLE patient_consents
    ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consents_distinct_orgs_chk') THEN
        ALTER TABLE patient_consents ADD CONSTRAINT consents_distinct_orgs_chk
            CHECK (from_organization_id <> to_organization_id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consents_status_chk') THEN
        ALTER TABLE patient_consents ADD CONSTRAINT consents_status_chk
            CHECK (status IN ('active', 'revoked', 'expired')) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consents_scope_chk') THEN
        ALTER TABLE patient_consents ADD CONSTRAINT consents_scope_chk
            CHECK (scope IN ('all', 'visits', 'labs', 'prescriptions', 'documents')) NOT VALID;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_consent
    ON patient_consents(patient_id, from_organization_id, to_organization_id, scope)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_consents_patient ON patient_consents(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_consents_to_org ON patient_consents(to_organization_id, status);

-- -----------------------------------------------------------------------------
-- C. Membership roles: add the care coordinator role (assigned explicitly, never to existing users)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_role_chk') THEN
        ALTER TABLE organization_memberships ADD CONSTRAINT memberships_role_chk
            CHECK (role IN ('center_manager', 'doctor', 'reception', 'caregiver', 'care_coordinator')) NOT VALID;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D. Care coordination (operational data only; no clinical content is stored here)
--    The composite foreign key guarantees a case can only be opened for a patient linked to that center.
--    `version` supports optimistic concurrency: an update must name the version it read.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    coordinator_id UUID NOT NULL REFERENCES users(id),
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_by UUID NOT NULL REFERENCES users(id),
    closed_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT care_cases_patient_linked_fk FOREIGN KEY (organization_id, patient_id)
        REFERENCES patient_center_links(organization_id, patient_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_care_cases_coordinator ON care_cases(coordinator_id, status);
CREATE INDEX IF NOT EXISTS idx_care_cases_org ON care_cases(organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_case_per_coordinator_patient
    ON care_cases(organization_id, patient_id, coordinator_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS care_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES care_cases(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    details VARCHAR(1000),
    task_type VARCHAR(30) NOT NULL DEFAULT 'other'
        CHECK (task_type IN ('missing_document', 'appointment_coordination', 'referral_handoff', 'other')),
    owner_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    completion_note VARCHAR(1000),
    created_by UUID NOT NULL REFERENCES users(id),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT care_tasks_done_has_time_chk CHECK (status <> 'done' OR completed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_care_tasks_owner ON care_tasks(owner_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_care_tasks_case ON care_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_care_tasks_org ON care_tasks(organization_id, status);

-- Referral tracking records the exchange of information between centers. A referral being "confirmed received"
-- says nothing about clinical completion, and never grants record access (only patient consent does).
CREATE TABLE IF NOT EXISTS care_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    to_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES care_cases(id) ON DELETE CASCADE,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'sent', 'receipt_confirmed', 'cancelled')),
    created_by UUID NOT NULL REFERENCES users(id),
    sent_at TIMESTAMPTZ,
    receipt_confirmed_at TIMESTAMPTZ,
    receipt_confirmed_by UUID REFERENCES users(id),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT care_referrals_distinct_orgs_chk CHECK (organization_id <> to_organization_id)
);
CREATE INDEX IF NOT EXISTS idx_care_referrals_from ON care_referrals(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_care_referrals_to ON care_referrals(to_organization_id, status);
CREATE INDEX IF NOT EXISTS idx_care_referrals_case ON care_referrals(case_id);

CREATE TABLE IF NOT EXISTS care_followup_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES care_cases(id) ON DELETE CASCADE,
    task_id UUID REFERENCES care_tasks(id) ON DELETE CASCADE,
    referral_id UUID REFERENCES care_referrals(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    event_type VARCHAR(40) NOT NULL,
    note VARCHAR(1000),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_followup_case ON care_followup_log(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_org ON care_followup_log(organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- E. Append-only guards
--    audit_logs: no DELETE, and no UPDATE except the foreign-key maintenance that nulls organization_id /
--    actor_id when the referenced row is deleted (ON DELETE SET NULL). Content columns can never change.
--    care_followup_log: no UPDATE and no DELETE (cascade deletes from a removed case are the only removal path).
--    Note: a database superuser can still disable triggers; restrict that privilege in production.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION naseej_audit_logs_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'audit_logs is append-only: DELETE is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.id = OLD.id
       AND NEW.actor_email IS NOT DISTINCT FROM OLD.actor_email
       AND NEW.actor_role IS NOT DISTINCT FROM OLD.actor_role
       AND NEW.action = OLD.action
       AND NEW.resource_type = OLD.resource_type
       AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id
       AND NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address
       AND NEW.details = OLD.details
       AND NEW.created_at = OLD.created_at
       AND (NEW.organization_id IS NULL OR NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id)
       AND (NEW.actor_id IS NULL OR NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only: UPDATE is not permitted' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_guard ON audit_logs;
CREATE TRIGGER trg_audit_logs_guard
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION naseej_audit_logs_guard();

CREATE OR REPLACE FUNCTION naseej_followup_log_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD; -- removal driven by ON DELETE CASCADE of the parent case/task
    END IF;
    RAISE EXCEPTION 'care_followup_log is append-only: % is not permitted', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_followup_log_guard ON care_followup_log;
CREATE TRIGGER trg_followup_log_guard
    BEFORE UPDATE OR DELETE ON care_followup_log
    FOR EACH ROW EXECUTE FUNCTION naseej_followup_log_guard();
