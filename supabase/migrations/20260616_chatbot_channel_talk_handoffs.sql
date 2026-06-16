-- Queue and audit trail for chatbot conversations escalated to Channel Talk.
-- One answer event can create at most one handoff row; follow-up feedback appends
-- to the same Channel Talk UserChat when possible.

create table if not exists public.chatbot_channel_handoffs (
  id uuid primary key default gen_random_uuid(),
  answer_event_id uuid not null references public.chatbot_answer_events(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  channel_member_id text,
  channel_user_id text,
  channel_user_chat_id text,
  channel_message_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chatbot_channel_handoffs_answer_event_unique unique (answer_event_id)
);

comment on table public.chatbot_channel_handoffs is 'Idempotent queue/audit rows for chatbot conversations handed off to Channel Talk.';
comment on column public.chatbot_channel_handoffs.channel_member_id is 'ClassIn memberId used for Channel Talk user upsert, usually classin:web:{anonymousId or sessionId}.';
comment on column public.chatbot_channel_handoffs.payload is 'Redacted handoff summary, sources, routing reasons, and delivery metadata.';

create index if not exists chatbot_channel_handoffs_session_idx
  on public.chatbot_channel_handoffs(session_id, created_at desc);

create index if not exists chatbot_channel_handoffs_status_idx
  on public.chatbot_channel_handoffs(status, created_at desc);

create index if not exists chatbot_channel_handoffs_user_chat_idx
  on public.chatbot_channel_handoffs(channel_user_chat_id)
  where channel_user_chat_id is not null;

drop trigger if exists chatbot_channel_handoffs_touch_updated_at on public.chatbot_channel_handoffs;
create trigger chatbot_channel_handoffs_touch_updated_at
  before update on public.chatbot_channel_handoffs
  for each row execute function public.chatbot_touch_updated_at();

alter table public.chatbot_channel_handoffs enable row level security;

create policy "Service role manage chatbot channel handoffs"
  on public.chatbot_channel_handoffs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
