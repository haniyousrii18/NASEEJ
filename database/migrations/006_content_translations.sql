-- 006: stored translations of text a patient typed (symptoms, notes, titles, visit reasons).
-- One row per (patient, original text, target language). The key is a SHA-256 of the original text, so:
--   * the same wording is translated once and reused wherever it appears (timeline, forms, summaries, shares);
--   * when the patient edits the text its hash changes, the old row is simply no longer looked up, and a fresh
--     translation is made for the new wording. A translation can never be shown for text it was not made from;
--   * the original is never touched: this table only ever holds the derived text.
-- Rows belong to the patient and disappear with them. Rows not used for 90 days are pruned by the server.
-- Rows are written only by a configured NON-AI translation provider (see backend/src/services/translation).

CREATE TABLE IF NOT EXISTS content_translations (
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    source_hash CHAR(64) NOT NULL,
    target_lang CHAR(2) NOT NULL CHECK (target_lang IN ('ar', 'en')),
    source_lang CHAR(2) NOT NULL CHECK (source_lang IN ('ar', 'en')),
    translated_text TEXT NOT NULL,
    provider VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (patient_id, source_hash, target_lang),
    CHECK (source_lang <> target_lang)
);
CREATE INDEX IF NOT EXISTS idx_content_translations_used ON content_translations(last_used_at);
