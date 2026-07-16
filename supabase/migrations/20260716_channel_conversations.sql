-- 채널톡 상담 내역의 Supabase 승격 + 상담 청크(벡터 검색) 저장소.
--
-- 목적:
-- 1) 기존 data/channel-conversations.json 폴백(운영 휘발)을 대체할 영속 저장소.
-- 2) 트랜스크립트를 고객/상담원 턴 단위로 청킹해 내부 CS 코파일럿의 근거(과거 상담 사례)로
--    시맨틱 검색할 수 있게 한다.
-- 인터페이스 계약 1·2·3 (cs-copilot-knowledge-plan-2026-07-16.md). RLS 는 internal_cs_* 패턴과 동일하게
-- is_active_admin() 로 고정한다. service_role 키는 RLS 를 우회하므로 sync/embed/seed 스크립트가 그대로 쓴다.

create extension if not exists vector with schema extensions;

-- ─── channel_conversations (계약 1) ──────────────────────────
create table if not exists public.channel_conversations (
  id               text primary key,          -- 채널톡 userChatId
  name             text,
  email            text,
  phone            text,
  state            text not null default 'unknown',
  tags             text[] not null default '{}',
  first_question   text,
  matched_lead_id  text,
  matched_org      text,
  last_message_at  timestamptz,
  transcript       jsonb not null default '[]'::jsonb,
  synced_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.channel_conversations is
  '채널톡 상담 내역(영속). id = 채널톡 userChatId. transcript 는 고객/상담원/봇 턴 배열.';
comment on column public.channel_conversations.transcript is
  '메시지 배열 [{ id, author(customer|agent|bot), text, at }]. 원문 보존(청크는 redactPii 통과본만 별도 저장).';

create index if not exists channel_conversations_last_message_idx
  on public.channel_conversations (last_message_at desc);
create index if not exists channel_conversations_synced_idx
  on public.channel_conversations (synced_at desc);
create index if not exists channel_conversations_matched_lead_idx
  on public.channel_conversations (matched_lead_id)
  where matched_lead_id is not null;
create index if not exists channel_conversations_tags_idx
  on public.channel_conversations using gin (tags);

drop trigger if exists channel_conversations_updated_at on public.channel_conversations;
create trigger channel_conversations_updated_at
  before update on public.channel_conversations
  for each row execute function public.update_updated_at();

-- ─── channel_conversation_chunks (계약 2) ────────────────────
create table if not exists public.channel_conversation_chunks (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  text not null
    references public.channel_conversations(id) on delete cascade,
  seq              int not null,
  content          text not null,             -- redactPii 통과본만 저장(원문 금지)
  category         text,                       -- ChatbotCategory 값 또는 null(미분류)
  embedding        extensions.vector(768),     -- 백필 전 null. scripts/embed-channel-chunks.ts 가 채움
  created_at       timestamptz not null default now(),
  constraint channel_conversation_chunks_conversation_seq_unique unique (conversation_id, seq)
);

comment on table public.channel_conversation_chunks is
  '상담 트랜스크립트의 턴 단위 청크. content 는 redactPii 통과본만 저장. embedding 은 text-embedding-004(768d).';
comment on column public.channel_conversation_chunks.content is
  'redactPii 통과본만 저장한다. 원문 PII 를 직접 넣지 말 것.';

create index if not exists channel_conversation_chunks_conversation_idx
  on public.channel_conversation_chunks (conversation_id, seq);
create index if not exists channel_conversation_chunks_embedding_hnsw_idx
  on public.channel_conversation_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

-- ─── RLS (internal_cs_* 패턴) ────────────────────────────────
alter table public.channel_conversations enable row level security;
alter table public.channel_conversation_chunks enable row level security;

drop policy if exists "Active admins manage channel conversations" on public.channel_conversations;
create policy "Active admins manage channel conversations"
  on public.channel_conversations
  for all
  using (is_active_admin())
  with check (is_active_admin());

drop policy if exists "Active admins manage channel conversation chunks" on public.channel_conversation_chunks;
create policy "Active admins manage channel conversation chunks"
  on public.channel_conversation_chunks
  for all
  using (is_active_admin())
  with check (is_active_admin());

-- ─── RPC match_channel_conversation_chunks (계약 3) ──────────
-- 코사인 유사도 검색 + conversations 조인. security definer 로 RLS 를 우회한다(내부 서비스 롤 전용).
-- 계약 시그니처는 vector(768) 이지만, 런타임(Supabase JS)은 임베딩을 "[..]" 문자열로 보내므로
-- text 오버로드를 함께 제공해 문자열이 곧바로 바인딩되게 한다(docs RPC 텍스트-호환 오버로드와 동일 전략).
create or replace function public.match_channel_conversation_chunks(
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
security definer
set search_path = public, extensions
as $$
  select
    ch.id                                       as chunk_id,
    ch.conversation_id,
    ch.content,
    ch.category,
    1 - (ch.embedding <=> query_embedding)      as similarity,
    co.tags,
    co.first_question,
    co.matched_org,
    co.last_message_at
  from public.channel_conversation_chunks ch
  join public.channel_conversations co on co.id = ch.conversation_id
  where ch.embedding is not null
    and 1 - (ch.embedding <=> query_embedding) >= min_similarity
  order by ch.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

comment on function public.match_channel_conversation_chunks(extensions.vector, int, float) is
  '내부 CS 코파일럿용 상담 청크 시맨틱 검색(768d). 내부 서비스 롤 전용.';

-- 런타임(문자열 임베딩) 호환 오버로드 — 문자열을 vector(768)로 캐스팅해 위 함수에 위임.
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
  select *
  from public.match_channel_conversation_chunks(
    nullif(btrim(query_embedding), '')::extensions.vector(768),
    match_count,
    min_similarity
  );
$$;

comment on function public.match_channel_conversation_chunks(text, int, float) is
  '문자열 임베딩 호환 오버로드(Supabase JS). 내부 서비스 롤 전용.';

revoke all on function public.match_channel_conversation_chunks(extensions.vector, int, float) from public;
revoke all on function public.match_channel_conversation_chunks(text, int, float) from public;
grant execute on function public.match_channel_conversation_chunks(extensions.vector, int, float) to service_role;
grant execute on function public.match_channel_conversation_chunks(text, int, float) to service_role;

notify pgrst, 'reload schema';
