-- Track whether a durable external CRM snapshot record was seen in the latest
-- successful object sync. This lets admin CRM views distinguish current records
-- from records that disappeared from Xiaoshouyi query results.

ALTER TABLE public.external_crm_records
  ADD COLUMN IF NOT EXISTS last_seen_run_id UUID REFERENCES public.external_crm_sync_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS external_crm_records_stale_idx
  ON public.external_crm_records (source_system, object_api_key, is_stale, synced_at DESC);

CREATE INDEX IF NOT EXISTS external_crm_records_last_seen_run_idx
  ON public.external_crm_records (last_seen_run_id);
