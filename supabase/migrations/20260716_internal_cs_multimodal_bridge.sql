-- Private image assets and integration audit events for the internal CS copilot.
-- AI-created analysis remains pending until an authenticated CS/admin actor reviews it.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'internal-cs-assets',
  'internal-cs-assets',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.internal_cs_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.internal_cs_conversations(id) ON DELETE CASCADE,
  message_id UUID
    REFERENCES public.internal_cs_messages(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'image'
    CHECK (kind IN ('screenshot', 'photo', 'image')),
  source TEXT NOT NULL
    CHECK (source IN ('admin_upload', 'webhook', 'mcp')),
  storage_bucket TEXT NOT NULL DEFAULT 'internal-cs-assets'
    CHECK (storage_bucket = 'internal-cs-assets'),
  storage_path TEXT NOT NULL,
  original_file_name TEXT NOT NULL
    CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes BIGINT NOT NULL
    CHECK (size_bytes BETWEEN 1 AND 8388608),
  sha256 TEXT NOT NULL
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'analyzing', 'ready', 'failed')),
  analysis_summary TEXT,
  analysis_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_provider TEXT,
  model_name TEXT,
  error_message TEXT,
  analyzed_at TIMESTAMPTZ,
  review_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_state IN ('pending', 'approved', 'changes_requested', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  corrected_analysis TEXT,
  external_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT internal_cs_assets_storage_object_key UNIQUE (storage_bucket, storage_path),
  CONSTRAINT internal_cs_assets_conversation_hash_key UNIQUE (conversation_id, sha256),
  CONSTRAINT internal_cs_assets_reviewer_check CHECK (
    (review_state = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_state IN ('approved', 'changes_requested', 'rejected')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS internal_cs_assets_conversation_idx
  ON public.internal_cs_assets (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS internal_cs_assets_message_idx
  ON public.internal_cs_assets (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS internal_cs_assets_analysis_queue_idx
  ON public.internal_cs_assets (status, created_at ASC)
  WHERE status IN ('uploaded', 'analyzing', 'failed');

CREATE INDEX IF NOT EXISTS internal_cs_assets_pending_review_idx
  ON public.internal_cs_assets (created_at ASC)
  WHERE status = 'ready' AND review_state = 'pending';

DROP TRIGGER IF EXISTS internal_cs_assets_updated_at ON public.internal_cs_assets;
CREATE TRIGGER internal_cs_assets_updated_at
  BEFORE UPDATE ON public.internal_cs_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.internal_cs_integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.internal_cs_conversations(id) ON DELETE CASCADE,
  asset_id UUID
    REFERENCES public.internal_cs_assets(id) ON DELETE SET NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('inbound', 'outbound')),
  transport TEXT NOT NULL
    CHECK (transport IN ('webhook', 'mcp', 'admin')),
  event_type TEXT NOT NULL
    CHECK (length(btrim(event_type)) BETWEEN 1 AND 120),
  source_system TEXT NOT NULL
    CHECK (length(btrim(source_system)) BETWEEN 1 AND 80),
  idempotency_key TEXT
    CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 200),
  correlation_id TEXT
    CHECK (correlation_id IS NULL OR length(correlation_id) <= 200),
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'processing', 'completed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT internal_cs_integration_events_idempotency_key
    UNIQUE (direction, source_system, idempotency_key)
);

CREATE INDEX IF NOT EXISTS internal_cs_integration_events_conversation_idx
  ON public.internal_cs_integration_events (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_cs_integration_events_asset_idx
  ON public.internal_cs_integration_events (asset_id)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS internal_cs_integration_events_processing_idx
  ON public.internal_cs_integration_events (status, created_at ASC)
  WHERE status IN ('accepted', 'processing', 'failed');

DROP TRIGGER IF EXISTS internal_cs_integration_events_updated_at
  ON public.internal_cs_integration_events;
CREATE TRIGGER internal_cs_integration_events_updated_at
  BEFORE UPDATE ON public.internal_cs_integration_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.internal_cs_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_cs_integration_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active admins manage internal CS assets" ON public.internal_cs_assets;
CREATE POLICY "Active admins manage internal CS assets"
  ON public.internal_cs_assets
  FOR ALL
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Active admins manage internal CS integration events"
  ON public.internal_cs_integration_events;
CREATE POLICY "Active admins manage internal CS integration events"
  ON public.internal_cs_integration_events
  FOR ALL
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Active admins read internal CS assets" ON storage.objects;
CREATE POLICY "Active admins read internal CS assets"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'internal-cs-assets' AND public.is_active_admin());

DROP POLICY IF EXISTS "Active admins upload internal CS assets" ON storage.objects;
CREATE POLICY "Active admins upload internal CS assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'internal-cs-assets' AND public.is_active_admin());

DROP POLICY IF EXISTS "Active admins update internal CS assets" ON storage.objects;
CREATE POLICY "Active admins update internal CS assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'internal-cs-assets' AND public.is_active_admin())
  WITH CHECK (bucket_id = 'internal-cs-assets' AND public.is_active_admin());

DROP POLICY IF EXISTS "Active admins delete internal CS assets" ON storage.objects;
CREATE POLICY "Active admins delete internal CS assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'internal-cs-assets' AND public.is_active_admin());

REVOKE ALL ON TABLE public.internal_cs_assets FROM anon;
REVOKE ALL ON TABLE public.internal_cs_integration_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.internal_cs_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.internal_cs_integration_events TO authenticated;
GRANT ALL ON TABLE public.internal_cs_assets TO service_role;
GRANT ALL ON TABLE public.internal_cs_integration_events TO service_role;

COMMENT ON TABLE public.internal_cs_assets IS
  'Private screenshots and photos accumulated inside an internal CS conversation.';
COMMENT ON COLUMN public.internal_cs_assets.analysis_summary IS
  'AI-generated internal analysis. It is not approved customer-facing content.';
COMMENT ON COLUMN public.internal_cs_assets.review_state IS
  'AI image analysis remains pending until a human CS/admin actor records the final judgement.';
COMMENT ON TABLE public.internal_cs_integration_events IS
  'Auditable inbound/outbound MCP, webhook, and admin bridge events for internal CS.';
COMMENT ON COLUMN public.internal_cs_integration_events.idempotency_key IS
  'Caller-provided replay key, unique per direction and source system when present.';
