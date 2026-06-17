-- PostgREST/Supabase JS compatibility overload for chatbot vector search.
--
-- Runtime code sends pgvector values as text ("[0.1,...]") because sending a
-- JavaScript number array is serialized as a Postgres array, not pgvector.
-- This overload keeps the public RPC stable across the current 1536d column and
-- the optional 768d migration by casting the text to an unconstrained vector and
-- letting pgvector validate dimensions against docs_ai_chunks.embedding.

create or replace function public.match_docs_ai_chunks(
  query_embedding text,
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
    and a.visibility in ('public', 'unlisted')
    and a.noindex = false
  order by c.embedding <=> query.embedding
  limit greatest(match_count, 1);
$$;

comment on function public.match_docs_ai_chunks(text, int) is 'Text input compatibility RPC for chatbot semantic search over published docs_ai_chunks. Intended for server-side service-role callers.';

revoke all on function public.match_docs_ai_chunks(text, int) from public;
grant execute on function public.match_docs_ai_chunks(text, int) to service_role;

notify pgrst, 'reload schema';
