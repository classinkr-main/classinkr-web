-- 우산 캠페인(D1) 수동 진행상황 로그 — 스코어보드 최근 1줄·업데이트 피드·상세 타임라인의 원천.
CREATE TABLE IF NOT EXISTS public.marketing_campaign_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'note'
                CHECK (kind IN ('note', 'change', 'milestone')),
  body        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_updates_campaign
  ON public.marketing_campaign_updates (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_updates_created
  ON public.marketing_campaign_updates (created_at DESC);

ALTER TABLE public.marketing_campaign_updates ENABLE ROW LEVEL SECURITY;
