CREATE TABLE IF NOT EXISTS site_settings (
  id                               TEXT PRIMARY KEY DEFAULT 'default',
  demo_form_enabled                BOOLEAN NOT NULL DEFAULT true,
  demo_banner_enabled              BOOLEAN NOT NULL DEFAULT false,
  demo_banner_text                 TEXT NOT NULL DEFAULT '',
  blog_section_enabled             BOOLEAN NOT NULL DEFAULT true,
  notice_banner_enabled            BOOLEAN NOT NULL DEFAULT false,
  notice_banner_text               TEXT NOT NULL DEFAULT '',
  google_sheet_webhook_url         TEXT,
  lead_webhook_url                 TEXT,
  channel_talk_webhook_url         TEXT,
  email_webhook_url                TEXT,
  wecom_ops_webhook_url            TEXT,
  wecom_critical_webhook_url       TEXT,
  kakao_alimtalk_webhook_url       TEXT,
  notification_digest_email_list   TEXT[] NOT NULL DEFAULT '{}',
  notification_appearance_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS google_sheet_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS lead_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS channel_talk_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS email_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS wecom_ops_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS wecom_critical_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS kakao_alimtalk_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS notification_digest_email_list TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notification_appearance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

INSERT INTO site_settings (
  id,
  demo_form_enabled,
  demo_banner_enabled,
  demo_banner_text,
  blog_section_enabled,
  notice_banner_enabled,
  notice_banner_text
)
VALUES (
  'default',
  true,
  false,
  '',
  true,
  false,
  ''
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS site_settings_updated_at ON site_settings;
CREATE TRIGGER site_settings_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS notification_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  category_tag     TEXT NOT NULL DEFAULT 'general',
  scope_tag        TEXT NOT NULL DEFAULT 'org_admin',
  severity         TEXT NOT NULL DEFAULT 'info',
  title            TEXT NOT NULL,
  message          TEXT NOT NULL,
  route_url        TEXT,
  source           TEXT,
  source_id        TEXT,
  payload_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_event_type
  ON notification_events (event_type);

CREATE INDEX IF NOT EXISTS idx_notification_events_created_at
  ON notification_events (created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  recipient_type    TEXT NOT NULL,
  recipient_id      TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'in_app',
  event_type        TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  category_tag      TEXT NOT NULL DEFAULT 'general',
  scope_tag         TEXT NOT NULL DEFAULT 'org_admin',
  severity          TEXT NOT NULL DEFAULT 'info',
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  route_url         TEXT,
  icon_key          TEXT NOT NULL DEFAULT 'bell',
  tone              TEXT NOT NULL DEFAULT 'slate',
  status            TEXT NOT NULL DEFAULT 'unread',
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_status_check
    CHECK (status IN ('unread', 'read', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (recipient_type, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (recipient_type, recipient_id, status);

CREATE INDEX IF NOT EXISTS idx_notifications_event
  ON notifications (event_id);

DROP TRIGGER IF EXISTS notifications_updated_at ON notifications;
CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  notification_id    UUID REFERENCES notifications(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL,
  recipient_type    TEXT,
  recipient_id      TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  request_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload  JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message     TEXT,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_logs_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_event
  ON notification_delivery_logs (event_id, created_at DESC);

ALTER TABLE site_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_logs DISABLE ROW LEVEL SECURITY;
