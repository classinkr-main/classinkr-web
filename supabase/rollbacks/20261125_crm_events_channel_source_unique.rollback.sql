-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261125_crm_events_channel_source_unique.sql 의 부분 유니크 색인을 지운다. 코드는 색인 없이도 조회 후 만들기로 돈다
-- (동시 웹훅 두 건이면 드물게 같은 상담 완결 기록이 두 행).
drop index if exists public.crm_customer_events_channel_source_uidx;
