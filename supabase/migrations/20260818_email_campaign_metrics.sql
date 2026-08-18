-- 이메일 캠페인 성과 루프(2026-08-18): 클릭 추적 + 부분 실패 가시화.
-- 근거: 마케팅 탭 자체 평가 — 오픈 수는 적재만 되고 UI 미표시, 클릭 추적 부재,
-- 부분 실패(sent>0이면 status "sent")가 이력에서 보이지 않던 문제의 데이터 축.
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS click_count  INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_errors  TEXT[] NOT NULL DEFAULT '{}';

-- /api/track/click 이 사용하는 원자 증가 RPC — open 추적(increment_campaign_open_count)과 동일 패턴.
CREATE OR REPLACE FUNCTION public.increment_campaign_click_count(campaign_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE public.email_campaigns
  SET click_count = click_count + 1
  WHERE id = campaign_id;
$$;
