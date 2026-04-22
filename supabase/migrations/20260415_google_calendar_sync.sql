ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_calendar_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_calendar_events_google_calendar_event_id
  ON calendar_events (google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;
