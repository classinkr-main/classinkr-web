-- match_docs_ai_chunks 에 include_internal 파라미터 추가 (계약 6).
--
-- 내부 CS 코파일럿은 seed-internal-canon 이 적재한 internal 문서(visibility='internal', noindex=true)까지
-- 검색해야 한다. 공개 챗봇 경로는 이 파라미터를 넘기지 않으며(기본 false), false 일 때 필터는 기존과 100% 동일하다.
--
-- 오버로드 주의: 런타임(Supabase JS)은 임베딩을 "[..]" 문자열로 보내므로 text 입력 오버로드가 실제 호출 경로다.
-- 기존 (text, int) 2-인자 오버로드를 그대로 두고 (text, int, boolean) 을 추가하면 2-인자 호출이 두 함수에
-- 모두 매칭돼 PostgREST 가 "could not choose best candidate" 로 실패한다. 따라서 기존 2-인자 text 오버로드를
-- drop 하고, 기본값을 가진 3-인자 오버로드로 교체한다 → 기존 2-인자 호출은 이 함수로 유일하게 해석된다.
-- vector(768) 오버로드(20260613)는 문자열 입력과 경합하지 않으므로 건드리지 않는다.

drop function if exists public.match_docs_ai_chunks(text, int);

create or replace function public.match_docs_ai_chunks(
  query_embedding text,
  match_count int default 8,
  include_internal boolean default false
)
returns table (
  id uuid,
  article_id uuid,
  heading text,
  content text,
  metadata jsonb,
  category_id text,
  slug text,
  title text,
  canonical_path text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with query as (
    select nullif(btrim(query_embedding), '')::extensions.vector as embedding
  )
  select
    c.id,
    c.article_id,
    c.heading,
    c.content,
    c.metadata,
    a.category_id,
    a.slug,
    a.title,
    a.canonical_path,
    1 - (c.embedding <=> query.embedding) as similarity
  from query
  join public.docs_ai_chunks c on c.embedding is not null
  join public.docs_articles a on a.id = c.article_id
  where a.status = 'published'
    and (
      -- 공개 경로(기본): 기존 필터와 100% 동일.
      (a.visibility in ('public', 'unlisted') and a.noindex = false)
      -- 내부 코파일럿 전용: internal 문서(noindex 무관)까지 포함.
      or (include_internal and a.visibility = 'internal')
    )
  order by c.embedding <=> query.embedding
  limit greatest(match_count, 1);
$$;

comment on function public.match_docs_ai_chunks(text, int, boolean) is
  'Text input compatibility RPC for chatbot semantic search over docs_ai_chunks. include_internal=false(기본)는 published+public/unlisted+noindex=false 로 기존과 동일. true 는 내부 CS 코파일럿 전용으로 internal 문서까지 포함. 서버 서비스 롤 전용.';

revoke all on function public.match_docs_ai_chunks(text, int, boolean) from public;
grant execute on function public.match_docs_ai_chunks(text, int, boolean) to service_role;

notify pgrst, 'reload schema';
