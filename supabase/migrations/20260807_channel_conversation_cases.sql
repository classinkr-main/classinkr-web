-- Human-reviewed links between a Channel Talk symptom and its actual cause.
--
-- The source transcript remains in channel_conversations. This table stores only
-- the reviewed finding and message ids used as evidence. A saved row is not
-- automatically public chatbot knowledge; only approved + confirmed rows are
-- eligible for a later, explicit knowledge-promotion workflow.

create table if not exists public.channel_conversation_cases (
  id                       uuid primary key default gen_random_uuid(),
  conversation_id          text not null
    references public.channel_conversations(id) on delete cascade,
  candidate_key            text not null,
  review_state             text not null default 'pending'
    check (review_state in ('pending', 'approved', 'rejected')),
  cause_state              text not null default 'unresolved'
    check (cause_state in ('unresolved', 'suspected', 'confirmed')),
  outcome_status           text not null default 'unknown'
    check (outcome_status in (
      'unknown',
      'solution_provided',
      'customer_confirmed_resolved',
      'still_unresolved'
    )),
  surface_symptom          text not null,
  actual_cause             text,
  diagnostic_questions     text[] not null default '{}',
  resolution               text,
  evidence_message_ids     text[] not null default '{}',
  linked_guide_slug        text,
  source_last_message_at   timestamptz,
  reviewed_by              text not null,
  reviewed_at              timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint channel_conversation_cases_candidate_unique
    unique (conversation_id, candidate_key),
  constraint channel_conversation_cases_candidate_key_nonempty
    check (length(btrim(candidate_key)) > 0),
  constraint channel_conversation_cases_surface_symptom_nonempty
    check (length(btrim(surface_symptom)) > 0),
  constraint channel_conversation_cases_confirmed_evidence_check
    check (
      review_state <> 'approved'
      or cause_state <> 'confirmed'
      or (
        actual_cause is not null
        and length(btrim(actual_cause)) > 0
        and cardinality(evidence_message_ids) > 0
      )
    )
);

comment on table public.channel_conversation_cases is
  'Human-reviewed Channel Talk cases linking surface symptoms to causes, diagnostics, evidence message ids, and resolutions.';
comment on column public.channel_conversation_cases.review_state is
  'pending/approved/rejected. Saving never publishes the case to the public chatbot.';
comment on column public.channel_conversation_cases.cause_state is
  'unresolved/suspected/confirmed. approved+confirmed is only eligibility for a later explicit promotion.';
comment on column public.channel_conversation_cases.evidence_message_ids is
  'Message ids from the source conversation. The API validates that every id exists before saving.';

create index if not exists channel_conversation_cases_review_queue_idx
  on public.channel_conversation_cases (review_state, cause_state, reviewed_at desc);

drop trigger if exists channel_conversation_cases_updated_at
  on public.channel_conversation_cases;
create trigger channel_conversation_cases_updated_at
  before update on public.channel_conversation_cases
  for each row execute function public.update_updated_at();

alter table public.channel_conversation_cases enable row level security;

drop policy if exists "Active admins manage channel conversation cases"
  on public.channel_conversation_cases;
create policy "Active admins manage channel conversation cases"
  on public.channel_conversation_cases
  for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

notify pgrst, 'reload schema';
