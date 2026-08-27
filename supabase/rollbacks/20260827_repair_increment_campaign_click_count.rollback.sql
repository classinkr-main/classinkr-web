-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 롤백하면 /api/track/click 리다이렉트는 유지되지만 클릭 수 집계는 다시 중단된다.
-- 20260818에서 추가된 click_count/failed_count/send_errors는 데이터 보존을 위해 삭제하지 않는다.
DROP FUNCTION IF EXISTS public.increment_campaign_click_count(UUID);

-- 제거된 함수가 PostgREST schema cache에 남지 않게 한다.
NOTIFY pgrst, 'reload schema';
