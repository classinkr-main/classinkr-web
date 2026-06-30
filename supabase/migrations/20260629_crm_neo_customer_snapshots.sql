-- NEO customer read model for CRM tabs.
-- external_crm_records remains the durable raw snapshot spine; this table is
-- the small operational model that CRM home, priority queue, and customer
-- search can read without rebuilding account state on each request.

CREATE TABLE IF NOT EXISTS public.crm_neo_customer_snapshots (
  source_system TEXT NOT NULL DEFAULT 'xiaoshouyi',
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  owner_id TEXT,
  owner_name TEXT NOT NULL DEFAULT '담당 미지정',
  phone TEXT,
  uid TEXT,
  region_label TEXT,
  balance NUMERIC,
  expire_at TIMESTAMPTZ,
  last_class_at TIMESTAMPTZ,
  order_amount NUMERIC NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  has_eeo BOOLEAN NOT NULL DEFAULT false,
  risk_level TEXT NOT NULL DEFAULT 'normal'
    CHECK (risk_level IN ('urgent', 'soon', 'watch', 'normal')),
  risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  expire_in_days INTEGER,
  risk_confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_confidence IN ('high', 'medium', 'low')),
  freshness_label TEXT,
  account_synced_at TIMESTAMPTZ,
  shroff_synced_at TIMESTAMPTZ,
  opportunity_synced_at TIMESTAMPTZ,
  source_synced_at TIMESTAMPTZ,
  source_run_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_partial BOOLEAN NOT NULL DEFAULT false,
  partial_reason TEXT,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  stale_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_system, account_id)
);

CREATE INDEX IF NOT EXISTS crm_neo_customer_snapshots_owner_risk_idx
  ON public.crm_neo_customer_snapshots (owner_id, risk_level, expire_at);

CREATE INDEX IF NOT EXISTS crm_neo_customer_snapshots_risk_due_idx
  ON public.crm_neo_customer_snapshots (risk_level, expire_at, last_class_at);

CREATE INDEX IF NOT EXISTS crm_neo_customer_snapshots_source_synced_idx
  ON public.crm_neo_customer_snapshots (source_system, source_synced_at DESC);

CREATE INDEX IF NOT EXISTS crm_neo_customer_snapshots_expire_idx
  ON public.crm_neo_customer_snapshots (expire_at)
  WHERE expire_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_neo_customer_snapshots_search_idx
  ON public.crm_neo_customer_snapshots
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(account_name, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(uid, '') || ' ' ||
      coalesce(owner_name, '') || ' ' ||
      coalesce(region_label, '')
    )
  );

DROP TRIGGER IF EXISTS crm_neo_customer_snapshots_updated_at ON public.crm_neo_customer_snapshots;
CREATE TRIGGER crm_neo_customer_snapshots_updated_at
  BEFORE UPDATE ON public.crm_neo_customer_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_neo_customer_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM NEO customer snapshots" ON public.crm_neo_customer_snapshots;
CREATE POLICY "Admins manage CRM NEO customer snapshots"
  ON public.crm_neo_customer_snapshots
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
