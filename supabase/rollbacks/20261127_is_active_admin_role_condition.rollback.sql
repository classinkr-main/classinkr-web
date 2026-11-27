-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261127_is_active_admin_role_condition.sql 을 되돌린다 — 역할을 보지 않던 옛 정의(활성 프로필이면 true).
create or replace function public.is_active_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid()
    and status = 'ACTIVE'
  )
$$;
