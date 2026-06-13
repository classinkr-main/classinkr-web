-- 챗봇 임베딩 모델을 text-embedding-004(768차원)로 맞추기 위해 벡터 차원을 768로 정렬.
-- (20260613_docs_chunk_vector_search.sql 의 vector(1536) RPC/인덱스를 768로 교체)
--
-- 임베딩 백필 전 적용한다. embedding 컬럼은 아직 비어 있으므로 USING null 로 안전하게 재정의한다.
-- 이 마이그레이션은 1536 버전 적용 여부와 무관하게 동작한다(drop ... if exists).

drop index if exists public.docs_ai_chunks_embedding_hnsw_idx;
drop function if exists public.match_docs_ai_chunks(extensions.vector, int);

alter table public.docs_ai_chunks
  alter column embedding type extensions.vector(768) using null;

create index if not exists docs_ai_chunks_embedding_hnsw_idx
  on public.docs_ai_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create or replace function public.match_docs_ai_chunks(
  query_embedding extensions.vector(768),
  match_count int default 8
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
    1 - (c.embedding <=> query_embedding) as similarity
  from public.docs_ai_chunks c
  join public.docs_articles a on a.id = c.article_id
  where c.embedding is not null
    and a.status = 'published'
    and a.visibility in ('public', 'unlisted')
    and a.noindex = false
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

comment on function public.match_docs_ai_chunks(extensions.vector, int) is 'Cosine-similarity search over docs_ai_chunks (768d, text-embedding-004) for the public chatbot. Published, non-internal, non-noindex only.';
