-- 채널별 배정 예산(KRW) — data/channel-budgets.json 대체. 채널 enum 은
-- lib/types/event-metrics.ts AD_CHANNELS(7종)와 동일하게 CHECK 로 고정한다.
CREATE TABLE IF NOT EXISTS public.channel_budgets (
  channel    TEXT PRIMARY KEY
               CHECK (channel IN ('google', 'meta', 'naver', 'kakao', 'youtube', 'offline', 'other')),
  amount     BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_budgets ENABLE ROW LEVEL SECURITY;
