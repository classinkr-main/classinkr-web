-- docs center: public guide/manual/help/troubleshooting/update knowledge base
-- Goals:
-- 1) Serve public docs pages from DB in a later phase.
-- 2) Keep troubleshooting discoverable without making it a primary marketing claim.
-- 3) Store chatbot-ready chunks from the same source content.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

-- ─── docs_categories ─────────────────────────────────────
create table if not exists public.docs_categories (
  id            text primary key,
  title         text not null,
  description   text,
  order_index   integer not null default 100,
  icon          text,
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.docs_categories is 'Public docs center category definitions.';
comment on column public.docs_categories.id is 'Stable route segment, e.g. quick-start, guides, manual, help, troubleshooting, updates.';

-- ─── docs_articles ───────────────────────────────────────
create table if not exists public.docs_articles (
  id                uuid primary key default gen_random_uuid(),
  category_id       text not null references public.docs_categories(id) on update cascade,
  slug              text not null,

  title             text not null,
  description       text not null,
  audience          text[] not null default '{}',
  product_area      text not null default 'general'
    check (product_area in ('general', 'software', 'hardware', 'billing', 'onboarding', 'classroom', 'admin', 'partner')),
  doc_type          text not null
    check (doc_type in ('guide', 'manual', 'faq', 'troubleshooting', 'release_note', 'reference')),
  difficulty        text not null default 'beginner'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),

  status            text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  visibility        text not null default 'public'
    check (visibility in ('public', 'unlisted', 'internal')),
  noindex           boolean not null default false,
  featured          boolean not null default false,
  order_index       integer not null default 100,

  tags              text[] not null default '{}',
  keywords          text[] not null default '{}',
  symptoms          text[] not null default '{}',
  chatbot_summary   text,

  content_markdown  text not null default '',
  content_json      jsonb not null default '{}'::jsonb,

  seo_title         text,
  seo_description   text,
  canonical_path    text,

  published_at      timestamptz,
  last_reviewed_at  timestamptz,
  created_by        text,
  updated_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint docs_articles_category_slug_unique unique (category_id, slug),
  constraint docs_articles_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

comment on table public.docs_articles is 'Canonical source for public docs, manuals, FAQs, troubleshooting, and release-note style docs.';
comment on column public.docs_articles.visibility is 'public = listed; unlisted = direct/SEO/related links only; internal = admin/support only.';
comment on column public.docs_articles.noindex is 'Use for sensitive/internal-ish docs that should remain reachable but not indexed.';
comment on column public.docs_articles.symptoms is 'User-facing symptoms for troubleshooting search and chatbot matching.';
comment on column public.docs_articles.content_json is 'Structured document blocks for future editor and chatbot ingestion.';

create index if not exists docs_articles_category_idx on public.docs_articles (category_id, order_index, updated_at desc);
create index if not exists docs_articles_status_visibility_idx on public.docs_articles (status, visibility, noindex);
create index if not exists docs_articles_featured_idx on public.docs_articles (featured) where featured = true;
create index if not exists docs_articles_updated_at_idx on public.docs_articles (updated_at desc);
create index if not exists docs_articles_tags_idx on public.docs_articles using gin (tags);
create index if not exists docs_articles_keywords_idx on public.docs_articles using gin (keywords);
create index if not exists docs_articles_symptoms_idx on public.docs_articles using gin (symptoms);
create index if not exists docs_articles_title_trgm_idx
  on public.docs_articles using gin (title extensions.gin_trgm_ops);

-- array_to_string() is marked STABLE in Postgres, so it cannot be used directly
-- in an index expression. Wrap the search-document construction in an IMMUTABLE
-- SQL function so the GIN index can be built.
create or replace function public.docs_articles_search_document(
  title text,
  description text,
  chatbot_summary text,
  tags text[],
  keywords text[],
  symptoms text[]
) returns tsvector
language sql
immutable
as $$
  select to_tsvector(
    'simple',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(chatbot_summary, '') || ' ' ||
    coalesce(array_to_string(tags, ' '), '') || ' ' ||
    coalesce(array_to_string(keywords, ' '), '') || ' ' ||
    coalesce(array_to_string(symptoms, ' '), '')
  )
$$;

create index if not exists docs_articles_search_idx
  on public.docs_articles using gin (
    public.docs_articles_search_document(
      title, description, chatbot_summary, tags, keywords, symptoms
    )
  );

-- ─── docs_article_versions ───────────────────────────────
create table if not exists public.docs_article_versions (
  id                uuid primary key default gen_random_uuid(),
  article_id        uuid not null references public.docs_articles(id) on delete cascade,
  version_number    integer not null,
  title             text not null,
  description       text not null,
  content_markdown  text not null,
  content_json      jsonb not null default '{}'::jsonb,
  change_note       text,
  created_by        text,
  created_at        timestamptz not null default now(),

  constraint docs_article_versions_article_version_unique unique (article_id, version_number)
);

comment on table public.docs_article_versions is 'Immutable snapshots for docs article history and rollback.';

create index if not exists docs_article_versions_article_idx
  on public.docs_article_versions (article_id, version_number desc);

-- ─── docs_article_relations ──────────────────────────────
create table if not exists public.docs_article_relations (
  article_id          uuid not null references public.docs_articles(id) on delete cascade,
  related_article_id  uuid not null references public.docs_articles(id) on delete cascade,
  relation_type       text not null default 'related'
    check (relation_type in ('related', 'next_step', 'prerequisite', 'replaces')),
  order_index         integer not null default 100,
  note                text,
  created_at          timestamptz not null default now(),

  primary key (article_id, related_article_id),
  constraint docs_article_relations_not_self check (article_id <> related_article_id)
);

comment on table public.docs_article_relations is 'Related docs graph for article footer, chatbot context expansion, and guided flows.';

-- ─── docs_ai_chunks ──────────────────────────────────────
create table if not exists public.docs_ai_chunks (
  id                  uuid primary key default gen_random_uuid(),
  article_id          uuid not null references public.docs_articles(id) on delete cascade,
  article_version_id  uuid references public.docs_article_versions(id) on delete set null,
  chunk_index         integer not null,
  heading             text,
  content             text not null,
  content_hash        text not null,
  token_count         integer,
  metadata            jsonb not null default '{}'::jsonb,
  embedding_model     text,
  embedding           extensions.vector(1536),
  embedding_updated_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint docs_ai_chunks_article_chunk_unique unique (article_id, chunk_index)
);

comment on table public.docs_ai_chunks is 'Chatbot/RAG chunks generated from docs_articles. Source of truth remains docs_articles.';
comment on column public.docs_ai_chunks.embedding is 'Optional embedding vector. Keep null until embedding pipeline runs.';
comment on column public.docs_ai_chunks.metadata is 'Audience, product area, symptoms, category, and other retrieval hints.';

create index if not exists docs_ai_chunks_article_idx on public.docs_ai_chunks (article_id, chunk_index);
create index if not exists docs_ai_chunks_hash_idx on public.docs_ai_chunks (content_hash);
create index if not exists docs_ai_chunks_metadata_idx on public.docs_ai_chunks using gin (metadata);
create index if not exists docs_ai_chunks_content_search_idx
  on public.docs_ai_chunks using gin (to_tsvector('simple', coalesce(heading, '') || ' ' || content));

-- Vector index intentionally omitted in v1. Add after row count/model is stable:
-- create index docs_ai_chunks_embedding_hnsw_idx
--   on public.docs_ai_chunks using hnsw (embedding extensions.vector_cosine_ops)
--   where embedding is not null;

-- ─── docs_feedback ───────────────────────────────────────
create table if not exists public.docs_feedback (
  id             uuid primary key default gen_random_uuid(),
  article_id     uuid not null references public.docs_articles(id) on delete cascade,
  helpful        boolean not null,
  reason         text,
  visitor_id     text,
  session_id     text,
  user_agent     text,
  referrer       text,
  created_at     timestamptz not null default now()
);

comment on table public.docs_feedback is 'Public helpful/not-helpful feedback for docs quality and CS gap detection.';

create index if not exists docs_feedback_article_idx on public.docs_feedback (article_id, created_at desc);

-- ─── docs_search_events ──────────────────────────────────
create table if not exists public.docs_search_events (
  id              uuid primary key default gen_random_uuid(),
  query           text not null,
  normalized_query text,
  result_count    integer,
  clicked_article_id uuid references public.docs_articles(id) on delete set null,
  visitor_id      text,
  session_id      text,
  source          text not null default 'docs'
    check (source in ('docs', 'chatbot', 'support', 'admin')),
  created_at      timestamptz not null default now()
);

comment on table public.docs_search_events is 'Search analytics for docs IA, chatbot unanswered questions, and content backlog.';

create index if not exists docs_search_events_created_idx on public.docs_search_events (created_at desc);
create index if not exists docs_search_events_normalized_query_idx on public.docs_search_events (normalized_query);

-- ─── docs_redirects ──────────────────────────────────────
create table if not exists public.docs_redirects (
  id              uuid primary key default gen_random_uuid(),
  from_path       text not null unique,
  to_path         text,
  to_article_id   uuid references public.docs_articles(id) on delete set null,
  http_status     integer not null default 301 check (http_status in (301, 302, 307, 308)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint docs_redirects_target_check check (to_path is not null or to_article_id is not null)
);

comment on table public.docs_redirects is 'Stable redirects for renamed or reorganized docs pages.';

-- ─── updated_at triggers ─────────────────────────────────
create or replace function public.docs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists docs_categories_touch_updated_at on public.docs_categories;
create trigger docs_categories_touch_updated_at
  before update on public.docs_categories
  for each row execute function public.docs_touch_updated_at();

drop trigger if exists docs_articles_touch_updated_at on public.docs_articles;
create trigger docs_articles_touch_updated_at
  before update on public.docs_articles
  for each row execute function public.docs_touch_updated_at();

drop trigger if exists docs_ai_chunks_touch_updated_at on public.docs_ai_chunks;
create trigger docs_ai_chunks_touch_updated_at
  before update on public.docs_ai_chunks
  for each row execute function public.docs_touch_updated_at();

drop trigger if exists docs_redirects_touch_updated_at on public.docs_redirects;
create trigger docs_redirects_touch_updated_at
  before update on public.docs_redirects
  for each row execute function public.docs_touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────
alter table public.docs_categories enable row level security;
alter table public.docs_articles enable row level security;
alter table public.docs_article_versions enable row level security;
alter table public.docs_article_relations enable row level security;
alter table public.docs_ai_chunks enable row level security;
alter table public.docs_feedback enable row level security;
alter table public.docs_search_events enable row level security;
alter table public.docs_redirects enable row level security;

create policy "Anyone can view visible docs categories"
  on public.docs_categories for select
  using (is_visible = true);

create policy "Anyone can view public published docs"
  on public.docs_articles for select
  using (
    status = 'published'
    and visibility in ('public', 'unlisted')
  );

create policy "Anyone can view public docs relations"
  on public.docs_article_relations for select
  using (
    exists (
      select 1
      from public.docs_articles a
      where a.id = docs_article_relations.article_id
        and a.status = 'published'
        and a.visibility in ('public', 'unlisted')
    )
    and exists (
      select 1
      from public.docs_articles related
      where related.id = docs_article_relations.related_article_id
        and related.status = 'published'
        and related.visibility in ('public', 'unlisted')
    )
  );

create policy "Anyone can view public docs chunks"
  on public.docs_ai_chunks for select
  using (
    exists (
      select 1
      from public.docs_articles a
      where a.id = docs_ai_chunks.article_id
        and a.status = 'published'
        and a.visibility in ('public', 'unlisted')
    )
  );

create policy "Anyone can view docs redirects"
  on public.docs_redirects for select
  using (true);

create policy "Service role manage docs categories"
  on public.docs_categories for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage docs articles"
  on public.docs_articles for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage docs article versions"
  on public.docs_article_versions for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage docs article relations"
  on public.docs_article_relations for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage docs ai chunks"
  on public.docs_ai_chunks for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage docs feedback"
  on public.docs_feedback for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage docs search events"
  on public.docs_search_events for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage docs redirects"
  on public.docs_redirects for all
  to service_role
  using (true)
  with check (true);

-- ─── Seed default categories ─────────────────────────────
insert into public.docs_categories (id, title, description, order_index, icon)
values
  ('quick-start', '빠른 시작', 'ClassIn을 처음 도입한 학원이 수업 전 꼭 끝내야 할 설정입니다.', 10, 'rocket'),
  ('guides', '운영 가이드', '원장님과 운영팀이 반복 업무를 안정적으로 처리하는 방법입니다.', 20, 'book-open'),
  ('manual', '기능 매뉴얼', '계정, 수업, 교재, 통계 등 주요 기능별 사용 설명서입니다.', 30, 'file-text'),
  ('help', '도움말', '상담, 결제, 권한, 온보딩에서 자주 묻는 질문입니다.', 40, 'circle-help'),
  ('troubleshooting', '문제 해결', '수업 중 자주 발생하는 접속, 음성, 화면, 권한 문제 해결법입니다.', 50, 'life-buoy'),
  ('updates', '업데이트', '학원 운영에 영향을 주는 제품 변경 사항과 권장 조치입니다.', 60, 'sparkles')
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  order_index = excluded.order_index,
  icon = excluded.icon,
  updated_at = now();
