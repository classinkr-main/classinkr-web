-- CRM customer activity spine: meeting notes, quick notes, and recording metadata.
-- Recordings are stored in the private Supabase Storage bucket below; this table
-- keeps only metadata and links the activity back to CRM targets.

CREATE TABLE IF NOT EXISTS public.crm_customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (target_type IN ('lead', 'neo_account', 'customer', 'deal', 'unknown')),
  target_id TEXT,
  target_label TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual_note'
    CHECK (source_type IN (
      'manual_note',
      'meeting_minutes',
      'recording',
      'calendar_event',
      'lead_contact_log',
      'external_crm',
      'sheet'
    )),
  source_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  meeting_purpose TEXT,
  owner_name TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment TEXT NOT NULL DEFAULT 'neutral'
    CHECK (sentiment IN ('positive', 'neutral', 'risk')),
  stage_signal TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  recording_storage_path TEXT,
  recording_file_name TEXT,
  recording_mime_type TEXT,
  recording_size_bytes BIGINT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_customer_events_target_idx
  ON public.crm_customer_events (target_type, target_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS crm_customer_events_source_idx
  ON public.crm_customer_events (source_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS crm_customer_events_owner_idx
  ON public.crm_customer_events (owner_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS crm_customer_events_occurred_at_idx
  ON public.crm_customer_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS crm_customer_events_tags_idx
  ON public.crm_customer_events USING GIN (tags);

DROP TRIGGER IF EXISTS crm_customer_events_updated_at ON public.crm_customer_events;
CREATE TRIGGER crm_customer_events_updated_at
  BEFORE UPDATE ON public.crm_customer_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_customer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM customer events" ON public.crm_customer_events;
CREATE POLICY "Admins manage CRM customer events"
  ON public.crm_customer_events
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-recordings',
  'crm-recordings',
  false,
  52428800,
  ARRAY[
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'video/mp4',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
