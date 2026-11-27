-- 공개 키(anon)로 leads · newsletter_subscribers 에 직접 INSERT 하는 길을 닫는다(2026-11-25 어드민·Compass 점검 C-1, 2026-11-26 승인).
--
-- 왜: 두 표에 "누구나 INSERT 허용(with check true)" 정책이 있고 anon 이 표 권한을 전부 갖고 있어, 브라우저에 실린 공개 키만으로
-- /api/lead · 구독 API 의 검증·속도 제한·동의 처리·중복 병합을 건너뛰고 행을 직접 넣을 수 있었다.
--   leads                  :: "Anyone can submit lead"  INSERT  with check (true)
--   newsletter_subscribers :: "Anyone can subscribe"    INSERT  with check (true)
--
-- 영향이 없는 근거(운영 서울 프로젝트, 2026-11-27 읽기 전용 확인):
--  * 이 저장소의 리드·구독 쓰기는 전부 서버의 service role(createSupabaseAdminClient)을 거친다. 브라우저 클라이언트는
--    로그인과 admin_profiles 읽기에만 쓴다.
--  * pg_stat_statements(2026-09-14 이후) 에서 anon · authenticated 역할이 실행한 문장은 17종이고 전부 admin_profiles ·
--    patch_notes 읽기다. 두 표에 대한 anon · authenticated 쓰기는 0건이다.
--  저장소 밖에서 공개 키로 이 표에 쓰는 것이 새로 생겼다면 적용 전에 그쪽을 서버 API 로 옮긴다.
--
-- 남기는 것: 관리자 읽기·수정·삭제 정책(is_active_admin())과 authenticated 의 select/insert/update/delete 권한은 그대로 둔다
-- (INSERT 는 정책이 없어져 authenticated 도 못 넣는다 — service role 만 넣는다). RLS 를 타지 않는 TRUNCATE 와 쓰지 않는
-- REFERENCES · TRIGGER 는 두 역할 모두에서 걷는다.
--
-- 멱등 — 재실행은 무해하다. 롤백: supabase/rollbacks/20261127_leads_newsletter_anon_insert_revoke.rollback.sql

drop policy if exists "Anyone can submit lead" on public.leads;
drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;

revoke all on public.leads from anon;
revoke all on public.newsletter_subscribers from anon;

revoke truncate, references, trigger on public.leads from authenticated;
revoke truncate, references, trigger on public.newsletter_subscribers from authenticated;
