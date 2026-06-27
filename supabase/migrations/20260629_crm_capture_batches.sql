-- CRM Capture Layer: a batch of pasted/imported touchpoints being turned into
-- CRM activity + follow-up tasks (capture-layer §9.1). One batch = one paste/import.

CREATE TABLE IF NOT EXISTS public.crm_capture_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'pasted_table'
    CHECK (source_type IN ('pasted_table', 'pasted_text', 'public_event', 'single')),
  source_id TEXT,
  source_label TEXT,
  default_activity_type TEXT NOT NULL DEFAULT 'memo'
    CHECK (default_activity_type IN (
      'event_attended', 'visit', 'demo_call', 'check_in_call', 'installation',
      'consultation', 'quote_sent', 'onboarding', 'cs_issue', 'memo'
    )),
  default_task_enabled BOOLEAN NOT NULL DEFAULT true,
  default_task_offset_days INT NOT NULL DEFAULT 1,
  raw_input_storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'parsed', 'reviewed', 'applied', 'partial_failed', 'canceled')),
  row_count INT NOT NULL DEFAULT 0,
  event_created_count INT NOT NULL DEFAULT 0,
  task_created_count INT NOT NULL DEFAULT 0,
  lead_created_count INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_capture_batches_status_idx
  ON public.crm_capture_batches (status, created_at DESC);

DROP TRIGGER IF EXISTS crm_capture_batches_updated_at ON public.crm_capture_batches;
CREATE TRIGGER crm_capture_batches_updated_at
  BEFORE UPDATE ON public.crm_capture_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_capture_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM capture batches" ON public.crm_capture_batches;
CREATE POLICY "Admins manage CRM capture batches"
  ON public.crm_capture_batches
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
