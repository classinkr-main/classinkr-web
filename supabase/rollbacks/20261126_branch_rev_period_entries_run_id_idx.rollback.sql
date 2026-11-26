-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261126_branch_rev_period_entries_run_id_idx.sql 의 색인을 지운다. 코드는 색인 없이도 그대로 돈다(읽기가 느려질 뿐이다).
drop index if exists public.branch_rev_period_entries_run_id_idx;
