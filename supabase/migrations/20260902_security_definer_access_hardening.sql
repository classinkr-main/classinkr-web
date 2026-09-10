-- 2026-09-02 보안 하드닝 1차 — Security Advisor 가 실제 노출로 확인한 항목만 좁게 닫는다.
-- 정본 계획: docs/active/supabase-operational-recovery-hardening-plan-2026-09-01.md §PR 3 (첫 번째 migration).
--
-- 1) definer 뷰 2종을 invoker 뷰로 바꾸고 PUBLIC/anon/authenticated 읽기를 회수한다.
--    호출자 확인(2026-09-02 grep): lib/admin-docs.ts(v_docs_ai_chunk_counts), lib/admin-crm-revenue.ts
--    (external_crm_object_snapshot) 둘 다 createSupabaseAdminClient()(service_role) 경유라 영향 없음.
-- 2) service_role 전용 RPC 4 시그니처의 PUBLIC/anon/authenticated 실행 권한을 회수한다.
--    호출자 확인: lib/chatbot/service.ts(match_docs_ai_chunks), lib/repositories/internal-cs-chat.ts
--    (internal_cs_metrics), lib/internal-cs-chat/consultation-search.ts(match_channel_conversation_chunks)
--    전부 service_role 클라이언트. 시그니처가 없으면(PR #32 오버로드 단일화 등) 건너뛴다.
-- 3) is_active_admin()/is_super_admin() 은 다수 RLS 정책의 기반이라 손대지 않는다(계획 §PR 3).
-- 4) 함수 search_path 고정(27개)과 increment_campaign_open_count 는 계획대로 별도 migration 에서 다룬다.
-- 되돌리기: anon 권한을 다시 열지 말고 service_role 호출 경로를 복구한다(계획 §7 롤백 원칙).
-- 검증(적용 후): select relname, reloptions from pg_class where relname in
--   ('v_docs_ai_chunk_counts','external_crm_object_snapshot')  → reloptions 에 security_invoker=true.

alter view public.v_docs_ai_chunk_counts set (security_invoker = true);
alter view public.external_crm_object_snapshot set (security_invoker = true);

revoke all on table public.v_docs_ai_chunk_counts from public, anon, authenticated;
revoke all on table public.external_crm_object_snapshot from public, anon, authenticated;
grant select on public.v_docs_ai_chunk_counts to service_role;
grant select on public.external_crm_object_snapshot to service_role;

do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.internal_cs_metrics(integer)',
    'public.match_docs_ai_chunks(text, integer, boolean)',
    'public.match_channel_conversation_chunks(text, integer, double precision)',
    'public.match_channel_conversation_chunks(extensions.vector, integer, double precision)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', sig);
      execute format('grant execute on function %s to service_role', sig);
    else
      raise notice 'security hardening: skip missing function %', sig;
    end if;
  end loop;
end $$;

-- PostgREST 스키마 캐시 갱신 — 권한 변경을 즉시 반영한다.
notify pgrst, 'reload schema';
