-- PostgREST resolves overloaded RPCs by JSON argument names. The previous text and vector
-- overloads used identical names, so every consultation search could fail as ambiguous.
-- Keep exactly one public text RPC and move vector matching behind a private helper.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The text wrapper depends on the vector overload, so remove it first.
drop function if exists public.match_channel_conversation_chunks(text, int, float);
drop function if exists public.match_channel_conversation_chunks(extensions.vector, int, float);
drop function if exists private.match_channel_conversation_chunks_vector(extensions.vector, int, float);

create function private.match_channel_conversation_chunks_vector(
  query_embedding extensions.vector(768),
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
set search_path = pg_catalog, extensions
as $$
  select
    ch.id as chunk_id,
    ch.conversation_id,
    ch.content,
    ch.category,
    1 - (ch.embedding <=> query_embedding) as similarity,
    co.tags,
    co.first_question,
    co.matched_org,
    co.last_message_at
  from public.channel_conversation_chunks ch
  join public.channel_conversations co on co.id = ch.conversation_id
  where ch.embedding is not null
    and 1 - (ch.embedding <=> query_embedding) >= coalesce(min_similarity, 0.5)
  order by ch.embedding <=> query_embedding
  limit least(greatest(coalesce(match_count, 8), 1), 50);
$$;

revoke all on function private.match_channel_conversation_chunks_vector(
  extensions.vector,
  int,
  float
) from public, anon, authenticated, service_role;

create function public.match_channel_conversation_chunks(
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
set search_path = pg_catalog
as $$
  select *
  from private.match_channel_conversation_chunks_vector(
    nullif(pg_catalog.btrim(query_embedding), '')::extensions.vector(768),
    match_count,
    min_similarity
  );
$$;

comment on function public.match_channel_conversation_chunks(text, int, float) is
  'Internal CS consultation vector search. Single text signature for unambiguous PostgREST RPC resolution.';

revoke all on function public.match_channel_conversation_chunks(text, int, float)
  from public, anon, authenticated;
grant execute on function public.match_channel_conversation_chunks(text, int, float) to service_role;

notify pgrst, 'reload schema';
