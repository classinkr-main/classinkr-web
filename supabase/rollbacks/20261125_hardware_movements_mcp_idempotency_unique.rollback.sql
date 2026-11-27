-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261125_hardware_movements_mcp_idempotency_unique.sql 의 부분 유니크 색인을 지운다. 코드는 색인 없이도 조회 후 판단으로 돈다
-- (같은 키 동시 두 건이면 드물게 같은 배송 예정이 두 번 등록).
drop index if exists public.hardware_movements_mcp_idempotency_uidx;
