-- 이메일 클릭 추적 RPC 전방향 복구.
-- 20260818_email_campaign_metrics.sql 의 컬럼은 적용됐지만 함수가 live schema cache 에
-- 존재하지 않는 환경을 복구한다. 공개 브라우저 호출은 필요 없고 서버 service role 만 사용한다.
-- 선행조건: 20260818_email_campaign_metrics.sql (email_campaigns.click_count 컬럼).
CREATE OR REPLACE FUNCTION public.increment_campaign_click_count(campaign_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $function$
  UPDATE public.email_campaigns AS campaign
  SET click_count = campaign.click_count + 1
  WHERE campaign.id = campaign_id;
$function$;

REVOKE ALL ON FUNCTION public.increment_campaign_click_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_campaign_click_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.increment_campaign_click_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_campaign_click_count(UUID) TO service_role;

-- PostgREST가 새 함수 계약을 즉시 다시 읽도록 요청한다.
NOTIFY pgrst, 'reload schema';
