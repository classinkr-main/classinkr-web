-- 이메일 캠페인 성과 루프(2026-08-18): 클릭 추적 + 부분 실패 가시화.
-- 근거: 마케팅 탭 자체 평가 — 오픈 수는 적재만 되고 UI 미표시, 클릭 추적 부재,
-- 부분 실패(sent>0이면 status "sent")가 이력에서 보이지 않던 문제의 데이터 축.
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS click_count  INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_errors  TEXT[] NOT NULL DEFAULT '{}';

-- /api/track/click 이 사용하는 원자 증가 RPC. SECURITY DEFINER 함수는 고정 search_path와
-- service_role 전용 실행 권한을 함께 둬 이름 가로채기·브라우저 직접 호출을 막는다.
CREATE OR REPLACE FUNCTION public.increment_campaign_click_count(campaign_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.email_campaigns AS campaign
  SET click_count = campaign.click_count + 1
  WHERE campaign.id = campaign_id;
$$;

REVOKE ALL ON FUNCTION public.increment_campaign_click_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_campaign_click_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.increment_campaign_click_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_campaign_click_count(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
