-- CRM Capture Layer: one parsed candidate row inside a capture batch
-- (capture-layer §9.2). Reviewed, then applied to crm_customer_events + crm_tasks.

CREATE TABLE IF NOT EXISTS public.crm_capture_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.crm_capture_batches(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  raw_text TEXT NOT NULL,
  organization_name TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  region_label TEXT,
  activity_type TEXT NOT NULL DEFAULT 'memo'
    CHECK (activity_type IN (
      'event_attended', 'visit', 'demo_call', 'check_in_call', 'installation',
      'consultation', 'quote_sent', 'onboarding', 'cs_issue', 'memo'
    )),
  memo TEXT,
  match_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (match_status IN (
      'confirmed_customer', 'confirmed_lead', 'multiple_candidates',
      'new_lead_candidate', 'needs_review', 'duplicate_in_batch'
    )),
  matched_target_type TEXT
    CHECK (matched_target_type IN ('lead', 'neo_account', 'customer', 'deal')),
  matched_target_id TEXT,
  matched_target_label TEXT,
  match_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected BOOLEAN NOT NULL DEFAULT true,
  create_task BOOLEAN NOT NULL DEFAULT true,
  task_due_at TIMESTAMPTZ,
  apply_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (apply_status IN ('pending', 'applied', 'skipped', 'failed')),
  created_event_id UUID REFERENCES public.crm_customer_events(id) ON DELETE SET NULL,
  created_task_id UUID REFERENCES public.crm_tasks(id) ON DELETE SET NULL,
  created_lead_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_index)
);

CREATE INDEX IF NOT EXISTS crm_capture_rows_batch_idx
  ON public.crm_capture_rows (batch_id, row_index);

CREATE INDEX IF NOT EXISTS crm_capture_rows_apply_idx
  ON public.crm_capture_rows (batch_id, apply_status);

DROP TRIGGER IF EXISTS crm_capture_rows_updated_at ON public.crm_capture_rows;
CREATE TRIGGER crm_capture_rows_updated_at
  BEFORE UPDATE ON public.crm_capture_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_capture_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM capture rows" ON public.crm_capture_rows;
CREATE POLICY "Admins manage CRM capture rows"
  ON public.crm_capture_rows
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
