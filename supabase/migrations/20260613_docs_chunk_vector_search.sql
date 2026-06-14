-- Chatbot semantic search over docs_ai_chunks.
--
-- Activates the HNSW vector index (left commented in 20260421_docs_center.sql)
-- and adds an RPC that returns the closest published/public chunks for a query
-- embedding. The chatbot calls this first and falls back to keyword search when
-- no embeddings exist yet (lib/chatbot/service.ts), so this migration is safe to
-- apply before the backfill (scripts/embed-docs-chunks.ts) has run.
--
-- Embeddings are produced by Google Gemini `gemini-embedding-001` truncated to
-- 1536 dimensions to match the existing docs_ai_chunks.embedding column.

create index if not exists docs_ai_chunks_embedding_hnsw_idx
  on public.docs_ai_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create or replace function public.match_docs_ai_chunks(
  query_embedding extensions.vector(1536),
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

comment on function public.match_docs_ai_chunks(extensions.vector, int) is 'Cosine-similarity search over docs_ai_chunks for the public chatbot. Filters to published, non-internal, non-noindex articles.';
