-- Deal Lite: a thin opportunity object for the internal CRM (plan §5.5, culture-fit §3.3).
-- Intentionally NOT a Salesforce-style heavy pipeline — just enough to push a deal forward:
-- stage, expected amount/close, related quote/order refs, risk note, next task link.

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (target_type IN ('lead', 'neo_account', 'customer', 'deal', 'unknown')),
  target_id TEXT,
  target_label TEXT,
  owner_key TEXT,
  owner_name_snapshot TEXT,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'consult'
    CHECK (stage IN ('consult', 'demo', 'quote', 'decision', 'order', 'won', 'lost')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'won', 'lost')),
  expected_amount BIGINT,
  expected_close_at TIMESTAMPTZ,
  next_task_id UUID REFERENCES public.crm_tasks(id) ON DELETE SET NULL,
  quote_ref TEXT,
  order_ref TEXT,
  risk_note TEXT,
  created_by TEXT,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer 360: deals for one target.
CREATE INDEX IF NOT EXISTS crm_deals_target_idx
  ON public.crm_deals (target_type, target_id, status);

-- Owner roll-ups + "다음 액션 없는 딜" surfacing.
CREATE INDEX IF NOT EXISTS crm_deals_owner_idx
  ON public.crm_deals (owner_key, status, expected_close_at);

CREATE INDEX IF NOT EXISTS crm_deals_stage_idx
  ON public.crm_deals (stage, status);

DROP TRIGGER IF EXISTS crm_deals_updated_at ON public.crm_deals;
CREATE TRIGGER crm_deals_updated_at
  BEFORE UPDATE ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM deals" ON public.crm_deals;
CREATE POLICY "Admins manage CRM deals"
  ON public.crm_deals
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
