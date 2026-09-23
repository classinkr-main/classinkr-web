-- match_channel_conversation_chunks 오버로드 단일화 — PostgREST 후보 모호성 제거.
--
-- 사고:
-- 20260716_channel_conversations.sql 이 vector(768) 오버로드와 text 오버로드를 "동일한 인자명"
-- (query_embedding, match_count, min_similarity)으로 만들었다. PostgREST 는 인자 "타입"이 아니라 인자 "이름"으로
-- 후보를 좁히므로 두 함수가 동시에 매칭되고, 모든 호출이 다음으로 실패한다:
--   "Could not choose the best candidate function between:
--    public.match_channel_conversation_chunks(query_embedding => extensions.vector, ...),
--    public.match_channel_conversation_chunks(query_embedding => text, ...)"
-- 그 결과 lib/internal-cs-chat/consultation-search.ts 의 RPC 는 항상 에러 → console.warn → [] 를 돌려왔고,
-- 내부 CS 코파일럿의 3번째 근거(과거 상담 사례)가 위 마이그레이션 배포 시점부터 통째로 죽어 있었다.
-- 테스트가 이를 놓친 이유는 tests/internal-cs-chat/consultation-search.test.ts 가 supabase.rpc 를 목킹해
-- 오버로드 해석 자체를 한 번도 실행하지 않았기 때문이다.
--
-- 조치:
-- 런타임(Supabase JS)은 pgvector 인자를 항상 "[..]" 문자열로 보내므로 text 오버로드만 남기고
-- vector(768) 오버로드를 drop 한다. 20260716_docs_match_internal_param.sql 이 match_docs_ai_chunks 에
-- 적용한 처방과 동일하다(그쪽은 live 검증에서 정상 해석 확인됨).
--
-- 주의(이 마이그레이션의 순서가 중요한 이유):
-- 기존 text 오버로드는 본문에서 vector 오버로드로 위임했다(select * from ...(...::vector(768), ...)).
-- language sql 의 문자열 본문($$..$$)은 pg_depend 로 추적되지 않으므로 vector 오버로드를 drop 해도 drop 은
-- 조용히 성공하고, 다음 호출에서야 "function ... does not exist" 로 터진다. 따라서 drop 보다 먼저 text 본문을
-- 인라인 쿼리로 교체한다. 어느 시점에도 호출 가능한 경로가 끊기지 않는다.

-- ─── 1) 위임 제거: text 오버로드 본문을 인라인 쿼리로 교체 ───
-- (vector 오버로드가 아직 살아 있는 동안 먼저 수행한다.)
create or replace function public.match_channel_conversation_chunks(
  query_embedding text,
  match_count int default 8,
  min_similarity float default 0.5
)
returns table (
  chunk_id uuid,
  conversation_id text,
  content text,
  category text,
  similarity double precision,
  tags text[],
  first_question text,
  matched_org text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with query as (
    -- 빈 문자열/공백은 NULL 로 접는다 → 유사도가 NULL 이 되어 where 절에서 걸러지고 0행을 돌린다(기존과 동일).
    select nullif(btrim(query_embedding), '')::extensions.vector(768) as embedding
  )
  select
    ch.id                                        as chunk_id,
    ch.conversation_id,
    ch.content,
    ch.category,
    1 - (ch.embedding <=> query.embedding)       as similarity,
    co.tags,
    co.first_question,
    co.matched_org,
    co.last_message_at
  from query
  join public.channel_conversation_chunks ch on ch.embedding is not null
  join public.channel_conversations co on co.id = ch.conversation_id
  where 1 - (ch.embedding <=> query.embedding) >= min_similarity
  order by ch.embedding <=> query.embedding
  limit greatest(match_count, 1);
$$;

comment on function public.match_channel_conversation_chunks(text, int, float) is
  '내부 CS 코파일럿용 상담 청크 시맨틱 검색(768d). 문자열 임베딩("[..]") 단일 오버로드 — PostgREST 해석 모호성 방지. 내부 서비스 롤 전용.';

-- ─── 2) vector(768) 오버로드 제거 ───
-- 남은 text 오버로드는 더 이상 이 함수에 의존하지 않으므로 안전하다.
drop function if exists public.match_channel_conversation_chunks(extensions.vector, int, float);

-- ─── 3) 권한 재확인 (20260716_channel_conversations.sql 패턴 유지) ───
revoke all on function public.match_channel_conversation_chunks(text, int, float) from public;
grant execute on function public.match_channel_conversation_chunks(text, int, float) to service_role;

notify pgrst, 'reload schema';
