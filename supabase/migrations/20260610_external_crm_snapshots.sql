-- External CRM read-only snapshots.
-- The Xiaoshouyi/eeoCRM MCP server is useful for inspection, but production
-- admin views should read durable snapshots with explicit source identity.

CREATE TABLE IF NOT EXISTS public.external_crm_sync_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  object_api_key      TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  trigger             TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'cron', 'import')),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  rows_scanned        INTEGER,
  rows_upserted       INTEGER,
  cursor_value        TEXT,
  error               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_crm_sync_runs_recent_idx
  ON public.external_crm_sync_runs (source_system, object_api_key, started_at DESC);

CREATE INDEX IF NOT EXISTS external_crm_sync_runs_status_idx
  ON public.external_crm_sync_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS public.external_crm_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  object_api_key      TEXT NOT NULL,
  external_id         TEXT NOT NULL,
  normalized_name     TEXT,
  display_name        TEXT,
  owner_name          TEXT,
  status              TEXT,
  amount              NUMERIC(14,0),
  occurred_at         TIMESTAMPTZ,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash        TEXT,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_crm_records_unique_source
    UNIQUE (source_system, object_api_key, external_id)
);

CREATE INDEX IF NOT EXISTS external_crm_records_object_idx
  ON public.external_crm_records (source_system, object_api_key, synced_at DESC);

CREATE INDEX IF NOT EXISTS external_crm_records_name_idx
  ON public.external_crm_records (normalized_name);

CREATE INDEX IF NOT EXISTS external_crm_records_amount_idx
  ON public.external_crm_records (object_api_key, occurred_at DESC)
  WHERE amount IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_write_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  object_api_key      TEXT NOT NULL,
  external_id         TEXT,
  operation           TEXT NOT NULL CHECK (operation IN ('create', 'update', 'transfer_owner')),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_payload     JSONB,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'succeeded', 'failed', 'cancelled')),
  requested_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  executed_at         TIMESTAMPTZ,
  response_payload    JSONB,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_write_requests_status_idx
  ON public.crm_write_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_write_requests_source_idx
  ON public.crm_write_requests (source_system, object_api_key, external_id);

DROP TRIGGER IF EXISTS external_crm_sync_runs_updated_at ON public.external_crm_sync_runs;
CREATE TRIGGER external_crm_sync_runs_updated_at
  BEFORE UPDATE ON public.external_crm_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS external_crm_records_updated_at ON public.external_crm_records;
CREATE TRIGGER external_crm_records_updated_at
  BEFORE UPDATE ON public.external_crm_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_write_requests_updated_at ON public.crm_write_requests;
CREATE TRIGGER crm_write_requests_updated_at
  BEFORE UPDATE ON public.crm_write_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.external_crm_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_crm_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_write_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage external crm sync runs" ON public.external_crm_sync_runs;
CREATE POLICY "Admins manage external crm sync runs"
  ON public.external_crm_sync_runs
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage external crm records" ON public.external_crm_records;
CREATE POLICY "Admins manage external crm records"
  ON public.external_crm_records
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage crm write requests" ON public.crm_write_requests;
CREATE POLICY "Admins manage crm write requests"
  ON public.crm_write_requests
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());
