-- 수동 비상 롤백 전용. supabase/migrations 에 넣거나 평상시 실행하지 않는다.
-- 20261127_admin_profiles_drop_admin_update_policy.sql 을 되돌린다 — 활성 관리자면 누구든 프로필을 고칠 수 있던 옛 정책.
-- 되돌리면 일반 관리자가 자기 역할을 바꿀 수 있는 길이 다시 열린다. 정말 필요한지 먼저 본다.
drop policy if exists "Admins can update profiles" on public.admin_profiles;
create policy "Admins can update profiles" on public.admin_profiles for update to public using (public.is_active_admin());
