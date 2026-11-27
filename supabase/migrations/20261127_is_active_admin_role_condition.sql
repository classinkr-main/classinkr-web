-- is_active_admin() 이 역할도 보게 한다(2026-11-25 어드민·Compass 점검 C-2, 2026-11-26 승인).
--
-- 왜: 이 함수는 "활성(ACTIVE) 프로필이 있는가"만 보고 역할은 보지 않았다. 이 함수가 64개 표의 RLS 정책 77개를 받치므로,
-- EDITOR · VIEWER 계정을 활성화하는 순간 그 계정의 브라우저 토큰으로 리드·CRM·매출 장부·챗봇 대화까지 PostgREST 로
-- 직접 읽고 고칠 수 있게 된다(서버의 역할 검사는 service role API 에만 있다).
--
-- 바뀌는 것: 관리자 등급(SUPER_ADMIN · ADMIN)만 true. search_path 고정과 STABLE 표시를 같이 붙인다(is_super_admin() 과 같은 모양 —
-- 어드바이저 function_search_path_mutable 1건도 같이 닫힌다).
--
-- 지금은 동작이 바뀌지 않는 근거(운영 서울 프로젝트, 2026-11-27 읽기 전용 확인): 활성 프로필은 ADMIN 9 · SUPER_ADMIN 1 뿐이라
-- 모든 활성 계정에서 새 정의와 옛 정의의 결과가 같다. 적용 직전에 아래로 다시 본다(0 이어야 지금과 결과가 같다):
--   select count(*) from public.admin_profiles where status = 'ACTIVE' and role not in ('SUPER_ADMIN', 'ADMIN');
-- 0 이 아니면 그 계정들은 적용 뒤 브라우저에서 자기 프로필만 읽을 수 있다(admin_profiles 의 "Users can read own profile" 정책).
-- 어드민 화면은 서버(service role) API 로 동작하므로 화면 기능은 서버의 역할 검사가 정한 대로 유지된다.
--
-- 권한: create or replace 는 기존 EXECUTE 권한을 그대로 둔다(정책 평가에 필요하므로 걷지 않는다).
-- 멱등 — 재실행은 무해하다. 롤백: supabase/rollbacks/20261127_is_active_admin_role_condition.rollback.sql

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and status = 'ACTIVE'
      and role in ('SUPER_ADMIN', 'ADMIN')
  );
$$;
