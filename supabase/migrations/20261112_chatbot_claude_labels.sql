-- 사이트 챗봇 Claude 제공자 — 대화 라벨 + LLM 사용량(비용 가드) 저장소.
--
-- ⚠ 이 파일은 아직 어디에도 적용하지 않았다(승인 후 수동 적용). 코드는 두 테이블·함수가 없어도
--   동작한다: 라벨링은 조용히 건너뛰고(lib/chatbot/claude/labeling.ts), 비용 가드는 인스턴스 메모리
--   합계만으로 동작한다(lib/chatbot/claude/budget.ts). CHATBOT_PROVIDER 기본값은 gemini 다.
--
-- 1) chatbot_session_labels — 답변 1건마다 싼 모델(Haiku)이 붙인 라벨. chatbot_answer_events 를
--    과부하하지 않으려고 따로 둔다. segment 는 학원(academy)·학교(school)·강사(tutor) 중심.
--    session_temperature 는 세션 최고 온도(hot > warm > cold)를 유지한 값이다.
-- 2) chatbot_llm_usage — Claude 호출 1건마다 모델·토큰·추정 USD. 일·월 예산 상한 판정에 쓴다.
-- 3) chatbot_llm_usage_sum(p_since) — 상한 판정용 합계(행을 다 내려받지 않게).
--
-- 개인정보: 라벨 입력은 PII 가 지워진 질문과 공개 답변뿐이고, rationale 은 저장 전에 연락처·이메일을 지운다.
-- 멱등: create ... if not exists / create or replace.

create table if not exists public.chatbot_session_labels (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  answer_event_id uuid references public.chatbot_answer_events(id) on delete set null,
  intent text not null,
  segment text not null default 'unknown'
    check (segment in ('academy', 'school', 'tutor', 'enterprise', 'parent', 'unknown')),
  stage text not null default 'unknown'
    check (stage in ('aware', 'consider', 'evaluate', 'ready', 'existing_customer', 'unknown')),
  temperature text not null
    check (temperature in ('hot', 'warm', 'cold')),
  session_temperature text not null
    check (session_temperature in ('hot', 'warm', 'cold')),
  handoff text not null default 'none'
    check (handoff in ('demo', 'support', 'none')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  rationale text,
  model_name text,
  rule_category text,
  rule_intent text,
  created_at timestamptz not null default now()
);

comment on table public.chatbot_session_labels is 'Per-answer chatbot labels (intent, segment 학원/학교/강사, stage, temperature, handoff) from a cheap Claude model. Internal analytics only.';

create index if not exists chatbot_session_labels_session_idx on public.chatbot_session_labels(session_id, created_at desc);
create index if not exists chatbot_session_labels_created_idx on public.chatbot_session_labels(created_at desc);
create index if not exists chatbot_session_labels_hot_idx on public.chatbot_session_labels(session_temperature, created_at desc);

create table if not exists public.chatbot_llm_usage (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('answer', 'label', 'eval')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  usd numeric(12,6) not null default 0,
  session_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.chatbot_llm_usage is 'One row per Claude call from the site chatbot (answer/label). Estimated USD for the daily/monthly budget guard.';

create index if not exists chatbot_llm_usage_created_idx on public.chatbot_llm_usage(created_at desc);

create or replace function public.chatbot_llm_usage_sum(p_since timestamptz)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(usd), 0) from public.chatbot_llm_usage where created_at >= p_since;
$$;

-- RLS: 서버(service_role)만 쓰고, 어드민은 라벨을 읽기만 한다.
alter table public.chatbot_session_labels enable row level security;
alter table public.chatbot_llm_usage enable row level security;

drop policy if exists "Admins read chatbot session labels" on public.chatbot_session_labels;
create policy "Admins read chatbot session labels"
  on public.chatbot_session_labels for select
  using (is_active_admin());

drop policy if exists "Admins read chatbot llm usage" on public.chatbot_llm_usage;
create policy "Admins read chatbot llm usage"
  on public.chatbot_llm_usage for select
  using (is_active_admin());

revoke all on public.chatbot_session_labels from anon;
revoke all on public.chatbot_llm_usage from anon;
revoke execute on function public.chatbot_llm_usage_sum(timestamptz) from public, anon, authenticated;
grant execute on function public.chatbot_llm_usage_sum(timestamptz) to service_role;
