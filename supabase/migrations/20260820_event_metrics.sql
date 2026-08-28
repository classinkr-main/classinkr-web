-- 행사 수기 성과 — data/event-metrics.json(로컬 JSON, 프로덕션 쓰기 차단) 대체.
-- metrics 는 lib/types/event-metrics.ts 의 EventMetrics 형태(JSONB) 그대로 보존한다.
CREATE TABLE IF NOT EXISTS public.event_metrics (
  event_id   TEXT PRIMARY KEY,
  metrics    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_metrics ENABLE ROW LEVEL SECURITY;
