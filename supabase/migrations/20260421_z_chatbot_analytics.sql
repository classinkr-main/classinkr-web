-- chatbot analytics: conversations, answer citations, FAQ clusters, feedback
-- Depends on 20260421_docs_center.sql for docs_articles and docs_ai_chunks.

-- ─── updated_at trigger helper ───────────────────────────
create or replace function public.chatbot_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── chat_sessions ───────────────────────────────────────
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'web'
    check (channel in ('web', 'admin_preview', 'partner_portal', 'manual_import')),
  anonymous_id text,
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  consent_marketing boolean not null default false,
  handoff_requested boolean not null default false,
  handoff_reason text,
  user_agent text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chat_sessions is 'Chatbot conversation sessions across public web, admin preview, and partner portal channels.';
comment on column public.chat_sessions.lead_id is 'Optional handoff link to captured lead/contact record.';

create index if not exists chat_sessions_created_idx on public.chat_sessions(created_at desc);
create index if not exists chat_sessions_lead_idx on public.chat_sessions(lead_id);
create index if not exists chat_sessions_anonymous_idx on public.chat_sessions(anonymous_id);

drop trigger if exists chat_sessions_touch_updated_at on public.chat_sessions;
create trigger chat_sessions_touch_updated_at
  before update on public.chat_sessions
  for each row execute function public.chatbot_touch_updated_at();

-- ─── chat_messages ───────────────────────────────────────
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'staff')),
  content text not null,
  normalized_content text,
  pii_redacted boolean not null default false,
  language text not null default 'ko',
  created_at timestamptz not null default now()
);

comment on table public.chat_messages is 'Raw and normalized chatbot messages. Use normalized_content for analytics and clustering.';
comment on column public.chat_messages.pii_redacted is 'True when content or normalized_content has been privacy-filtered before storage.';

create index if not exists chat_messages_session_idx on public.chat_messages(session_id, created_at);
create index if not exists chat_messages_role_idx on public.chat_messages(role);

-- ─── chatbot_answer_events ───────────────────────────────
create table if not exists public.chatbot_answer_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_message_id uuid not null references public.chat_messages(id) on delete cascade,
  assistant_message_id uuid references public.chat_messages(id) on delete set null,
  normalized_question text not null,
  detected_intent text,
  detected_category text,
  answer_mode text not null
    check (answer_mode in ('direct_answer', 'doc_suggestion', 'clarifying_question', 'handoff', 'fallback')),
  confidence numeric(5,4),
  unresolved boolean not null default false,
  latency_ms integer,
  model_name text,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now()
);

comment on table public.chatbot_answer_events is 'One row per user question handled by the chatbot, including mode, confidence, and analytics dimensions.';
comment on column public.chatbot_answer_events.answer_mode is 'direct_answer, doc_suggestion, clarifying_question, handoff, or fallback.';
comment on column public.chatbot_answer_events.unresolved is 'True when the chatbot could not confidently resolve the user question.';

create index if not exists chatbot_answer_events_created_idx on public.chatbot_answer_events(created_at desc);
create index if not exists chatbot_answer_events_session_idx on public.chatbot_answer_events(session_id, created_at);
create index if not exists chatbot_answer_events_category_idx on public.chatbot_answer_events(detected_category);
create index if not exists chatbot_answer_events_mode_idx on public.chatbot_answer_events(answer_mode);
create index if not exists chatbot_answer_events_unresolved_idx on public.chatbot_answer_events(unresolved);

-- ─── chatbot_answer_citations ────────────────────────────
create table if not exists public.chatbot_answer_citations (
  answer_event_id uuid not null references public.chatbot_answer_events(id) on delete cascade,
  article_id uuid references public.docs_articles(id) on delete set null,
  chunk_id uuid references public.docs_ai_chunks(id) on delete set null,
  rank integer not null,
  score numeric(8,4),
  citation_kind text not null default 'retrieval'
    check (citation_kind in ('retrieval', 'related', 'manual')),
  created_at timestamptz not null default now(),

  primary key (answer_event_id, rank),
  constraint chatbot_answer_citations_has_source check (article_id is not null or chunk_id is not null)
);

comment on table public.chatbot_answer_citations is 'Retrieved or manually attached docs/chunks used as evidence for a chatbot answer.';

create index if not exists chatbot_answer_citations_article_idx on public.chatbot_answer_citations(article_id);
create index if not exists chatbot_answer_citations_chunk_idx on public.chatbot_answer_citations(chunk_id);

-- ─── question_clusters ───────────────────────────────────
create table if not exists public.question_clusters (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  canonical_question text not null,
  category text,
  mapped_article_id uuid references public.docs_articles(id) on delete set null,
  mapped_chunk_id uuid references public.docs_ai_chunks(id) on delete set null,
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'published', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sample_questions text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.question_clusters is 'Grouped customer questions for FAQ promotion, docs gap detection, and answer quality tracking.';
comment on column public.question_clusters.status is 'candidate = auto-detected, approved = ready for content work, published = reflected in FAQ/docs, ignored = intentionally suppressed.';

create index if not exists question_clusters_status_idx on public.question_clusters(status);
create index if not exists question_clusters_category_idx on public.question_clusters(category);
create index if not exists question_clusters_last_seen_idx on public.question_clusters(last_seen_at desc);
create index if not exists question_clusters_mapped_article_idx on public.question_clusters(mapped_article_id);
create unique index if not exists question_clusters_canonical_question_idx
  on public.question_clusters(canonical_question);

drop trigger if exists question_clusters_touch_updated_at on public.question_clusters;
create trigger question_clusters_touch_updated_at
  before update on public.question_clusters
  for each row execute function public.chatbot_touch_updated_at();

-- ─── question_cluster_events ─────────────────────────────
create table if not exists public.question_cluster_events (
  cluster_id uuid not null references public.question_clusters(id) on delete cascade,
  answer_event_id uuid not null references public.chatbot_answer_events(id) on delete cascade,
  similarity numeric(5,4),
  created_at timestamptz not null default now(),
  primary key (cluster_id, answer_event_id)
);

comment on table public.question_cluster_events is 'Many-to-many link between answer events and question clusters.';

create index if not exists question_cluster_events_answer_idx on public.question_cluster_events(answer_event_id);

-- ─── chatbot_feedback ────────────────────────────────────
create table if not exists public.chatbot_feedback (
  id uuid primary key default gen_random_uuid(),
  answer_event_id uuid not null references public.chatbot_answer_events(id) on delete cascade,
  rating text not null check (rating in ('helpful', 'not_helpful')),
  comment text,
  created_at timestamptz not null default now()
);

comment on table public.chatbot_feedback is 'End-user helpful/not-helpful feedback for chatbot answers.';

create index if not exists chatbot_feedback_answer_idx on public.chatbot_feedback(answer_event_id);
create index if not exists chatbot_feedback_rating_idx on public.chatbot_feedback(rating);
create index if not exists chatbot_feedback_created_idx on public.chatbot_feedback(created_at desc);

-- ─── Analytics views ─────────────────────────────────────
create or replace view public.v_chatbot_daily_question_stats
with (security_invoker = true)
as
select
  date_trunc('day', e.created_at)::date as day,
  coalesce(qc.id::text, 'unclustered') as cluster_id,
  coalesce(qc.label, e.normalized_question) as question_label,
  e.detected_category,
  count(*) as question_count,
  count(*) filter (where e.unresolved) as unresolved_count,
  count(*) filter (where e.answer_mode = 'handoff') as handoff_count,
  count(*) filter (where e.answer_mode = 'direct_answer') as direct_answer_count,
  avg(e.confidence) as avg_confidence
from public.chatbot_answer_events e
left join public.question_cluster_events qce on qce.answer_event_id = e.id
left join public.question_clusters qc on qc.id = qce.cluster_id
group by 1, 2, 3, 4;

comment on view public.v_chatbot_daily_question_stats is 'Daily chatbot question counts by cluster/category and answer outcome.';

create or replace view public.v_chatbot_feedback_stats
with (security_invoker = true)
as
select
  e.detected_category,
  coalesce(qc.label, e.normalized_question) as question_label,
  count(f.id) as feedback_count,
  count(f.id) filter (where f.rating = 'helpful') as helpful_count,
  count(f.id) filter (where f.rating = 'not_helpful') as not_helpful_count
from public.chatbot_answer_events e
left join public.question_cluster_events qce on qce.answer_event_id = e.id
left join public.question_clusters qc on qc.id = qce.cluster_id
left join public.chatbot_feedback f on f.answer_event_id = e.id
group by 1, 2;

comment on view public.v_chatbot_feedback_stats is 'Chatbot helpful/not-helpful counts grouped by question label and category.';

-- ─── RLS ─────────────────────────────────────────────────
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chatbot_answer_events enable row level security;
alter table public.chatbot_answer_citations enable row level security;
alter table public.question_clusters enable row level security;
alter table public.question_cluster_events enable row level security;
alter table public.chatbot_feedback enable row level security;

create policy "Admins read chat sessions"
  on public.chat_sessions for select
  using (is_active_admin());

create policy "Admins read chat messages"
  on public.chat_messages for select
  using (is_active_admin());

create policy "Admins read chatbot answer events"
  on public.chatbot_answer_events for select
  using (is_active_admin());

create policy "Admins read chatbot answer citations"
  on public.chatbot_answer_citations for select
  using (is_active_admin());

create policy "Admins manage question clusters"
  on public.question_clusters for all
  using (is_active_admin())
  with check (is_active_admin());

create policy "Admins read question cluster events"
  on public.question_cluster_events for select
  using (is_active_admin());

create policy "Admins read chatbot feedback"
  on public.chatbot_feedback for select
  using (is_active_admin());

create policy "Service role manage chat sessions"
  on public.chat_sessions for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage chat messages"
  on public.chat_messages for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage chatbot answer events"
  on public.chatbot_answer_events for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage chatbot answer citations"
  on public.chatbot_answer_citations for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage question clusters"
  on public.question_clusters for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage question cluster events"
  on public.question_cluster_events for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manage chatbot feedback"
  on public.chatbot_feedback for all
  to service_role
  using (true)
  with check (true);
