-- admin_profiles 의 "활성 관리자면 누구든 프로필 수정" 정책을 지운다(2026-11-25 어드민·Compass 점검 §6-4 N-1, 2026-11-27 승인).
--
-- 왜: 이 표의 UPDATE 허용 정책이 둘이었다.
--   "Admins can update profiles"   :: using is_active_admin()                      ← 지운다
--   "Super admin updates profiles" :: using is_super_admin() with check is_super_admin()   ← 남긴다
-- 허용(PERMISSIVE) 정책은 OR 로 합쳐지므로 앞의 것이 있는 한 뒤의 것은 아무것도 좁히지 못한다. authenticated 역할은
-- role · status 칸의 UPDATE 권한을 갖고 있고 막는 트리거도 없어, 일반 관리자(ADMIN)가 브라우저 토큰으로 PostgREST 에
-- 직접 요청하면 자기 역할을 SUPER_ADMIN 으로 바꾸거나 남의 프로필을 고칠 수 있었다.
-- (쓰기라 실행해 확인하지는 않았다 — 정책 · 표 권한 · 트리거 정의로 판단했다.)
--
-- 영향이 없는 근거(운영 서울 프로젝트, 2026-11-27 읽기 전용 확인):
--  * 계정 관리 화면의 프로필 수정은 서버의 service role API 를 거친다(RLS 를 타지 않는다).
--  * 브라우저 클라이언트는 admin_profiles 를 읽기만 한다(로그인 화면 · 어드민 셸의 자기 프로필 조회).
--  * pg_stat_statements(2026-09-14 이후) 에서 anon · authenticated 역할의 admin_profiles 문장은 전부 SELECT 다. 쓰기 0건.
--
-- 지운 뒤: 브라우저 토큰으로 프로필을 고칠 수 있는 것은 최고 관리자뿐이다. 읽기 정책 둘은 그대로다.
-- 멱등 — 재실행은 무해하다. 롤백: supabase/rollbacks/20261127_admin_profiles_drop_admin_update_policy.rollback.sql

drop policy if exists "Admins can update profiles" on public.admin_profiles;
