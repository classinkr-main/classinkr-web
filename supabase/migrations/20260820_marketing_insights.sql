-- 마케팅 AI 주간 브리핑 저장 — lib/branch/insights 의 branch_insights 패턴 미러.
-- digest = 입력 정규화 해시(같은 입력 재호출 방지), payload = {highlights, next_actions, anomalies}.
CREATE TABLE IF NOT EXISTS public.marketing_insights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL DEFAULT 'weekly',
  digest     TEXT NOT NULL,
  headline   TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  model      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_insights_scope
  ON public.marketing_insights (scope, created_at DESC);

ALTER TABLE public.marketing_insights ENABLE ROW LEVEL SECURITY;
