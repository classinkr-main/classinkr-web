-- CRM monthly revenue target.
-- One row per month holding the sales revenue goal used by the cockpit revenue-trend
-- goal line and the attainment/forecast badges. Currency is CNY (¥) to match
-- branch_rev_deals / the REV sheet, which is the source of the revenue trend — do NOT
-- mix with self-aggregated KRW figures. Operator-maintained; absent rows mean "no goal
-- line" (the chart degrades gracefully when this table is empty or not yet migrated).

CREATE TABLE IF NOT EXISTS public.crm_revenue_target (
  month TEXT PRIMARY KEY,                       -- "YYYY-MM" (KST month key)
  amount NUMERIC NOT NULL CHECK (amount >= 0),  -- CNY (¥)
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY')),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE public.crm_revenue_target ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage CRM revenue target" ON public.crm_revenue_target;
CREATE POLICY "Admins manage CRM revenue target"
  ON public.crm_revenue_target
  FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- month 형식 가드 — "YYYY-MM"
ALTER TABLE public.crm_revenue_target
  DROP CONSTRAINT IF EXISTS crm_revenue_target_month_fmt_check;
ALTER TABLE public.crm_revenue_target
  ADD CONSTRAINT crm_revenue_target_month_fmt_check CHECK (month ~ '^[0-9]{4}-[0-9]{2}$');

-- 운영 적용 후 목표 입력 예시(CNY):
--   INSERT INTO public.crm_revenue_target (month, amount, note)
--   VALUES ('2026-06', 800000, '6월 목표')
--   ON CONFLICT (month) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();
