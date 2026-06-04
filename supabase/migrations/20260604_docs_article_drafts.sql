-- Draft workspace for editing published docs without mutating the public article row.

create table if not exists public.docs_article_drafts (
  article_id     uuid primary key references public.docs_articles(id) on delete cascade,
  draft_payload  jsonb not null default '{}'::jsonb,
  change_note    text,
  created_by     text,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.docs_article_drafts is 'Admin-only working draft for docs_articles. Public docs continue to read docs_articles.';
comment on column public.docs_article_drafts.draft_payload is 'Camel-case DocsArticlePatchInput-style payload saved from the admin editor.';

drop trigger if exists docs_article_drafts_touch_updated_at on public.docs_article_drafts;
create trigger docs_article_drafts_touch_updated_at
  before update on public.docs_article_drafts
  for each row execute function public.docs_touch_updated_at();

alter table public.docs_article_drafts enable row level security;

create policy "Service role manage docs article drafts"
  on public.docs_article_drafts for all
  to service_role
  using (true)
  with check (true);
