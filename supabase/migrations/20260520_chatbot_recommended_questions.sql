-- Runtime-editable chatbot suggested question chips.
-- Observed customer questions remain in question_clusters; this table controls curated UI prompts.

create table if not exists public.chatbot_recommended_questions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  prompt text not null,
  placement text not null default 'starter'
    check (placement in ('starter')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  order_index integer not null default 100,
  category text,
  mapped_article_id uuid references public.docs_articles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chatbot_recommended_questions is 'Curated chatbot suggested question chips shown in the public widget.';
comment on column public.chatbot_recommended_questions.prompt is 'The exact text sent when a visitor clicks the suggested question chip.';
comment on column public.chatbot_recommended_questions.placement is 'Where the prompt appears. starter is the initial welcome state.';

create index if not exists chatbot_recommended_questions_lookup_idx
  on public.chatbot_recommended_questions (placement, status, order_index, updated_at desc);

create index if not exists chatbot_recommended_questions_article_idx
  on public.chatbot_recommended_questions (mapped_article_id);

drop trigger if exists chatbot_recommended_questions_touch_updated_at on public.chatbot_recommended_questions;
create trigger chatbot_recommended_questions_touch_updated_at
  before update on public.chatbot_recommended_questions
  for each row execute function public.chatbot_touch_updated_at();

alter table public.chatbot_recommended_questions enable row level security;

create policy "Admins manage chatbot recommended questions"
  on public.chatbot_recommended_questions for all
  using (is_active_admin())
  with check (is_active_admin());

create policy "Service role manage chatbot recommended questions"
  on public.chatbot_recommended_questions for all
  to service_role
  using (true)
  with check (true);

insert into public.chatbot_recommended_questions
  (label, prompt, placement, status, order_index, category, metadata)
values
  (
    '도입 방식',
    '우리 학원에 맞는 도입 방식이 궁금해요',
    'starter',
    'published',
    10,
    'consultation',
    '{"seed": true}'::jsonb
  ),
  (
    '수업 운영 개선',
    '수업 중 집중도와 출석 관리를 개선하고 싶어요',
    'starter',
    'published',
    20,
    'classroom',
    '{"seed": true}'::jsonb
  ),
  (
    '결제 계정 상담',
    '결제, 영수증, 계정 문제를 상담받고 싶어요',
    'starter',
    'published',
    30,
    'billing',
    '{"seed": true}'::jsonb
  )
on conflict do nothing;
