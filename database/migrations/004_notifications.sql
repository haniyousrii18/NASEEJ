-- 004: in-app notifications.
-- A notification names an event and the safe parameters needed to word it (a date, a time). It never carries names,
-- clinical content, message text or document text: the recipient opens the destination and the destination page
-- enforces authorization again. Display text is built by the client from event_type + params, so it is localized.

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_role VARCHAR(30) NOT NULL,                 -- the role the person holds for this notification (a user can hold several)
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(60) NOT NULL,
    category VARCHAR(30) NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,           -- allow-listed, non-sensitive values only
    related_type VARCHAR(40),
    related_id UUID,
    destination_kind VARCHAR(40) NOT NULL,               -- a key of the typed destination map, never a URL
    destination_id UUID,
    dedupe_key VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,                                 -- "seen". Never means the underlying task is done.
    handled_at TIMESTAMPTZ,                              -- set by the server when the underlying state shows the task is done
    dismissed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- One notification per event per recipient and role, so a retried operation cannot create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_event
    ON notifications(recipient_user_id, recipient_role, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_inbox
    ON notifications(recipient_user_id, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications(recipient_user_id) WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_related
    ON notifications(related_type, related_id);
