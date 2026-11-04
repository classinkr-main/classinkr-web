-- ─────────────────────────────────────────────────────────────
-- 메타 리드 영업 단계 → Meta Conversions API 보낸 기록 (2026-11-04)
--
-- lib/marketing/meta-crm-signal.ts 가 Compass 단계(첫 접수·컨택·체험 계정·데모·결제)를 Meta '전환 리드'로 보낼 때
-- 같은 리드·같은 단계를 한 번만 보내려고 남기는 원장이다. Meta 가 받은(2xx) 건만 쓴다.
--
--   dedupe_key       'initial_lead:<leadgen_id>' 또는 '<단계>:<Compass 리드 id>' — 첫 접수는 메타 리드마다,
--                    그 뒤 단계는 Compass 리드마다 한 번(metaCrmDedupeKey 와 같은 규칙).
--   stage            Meta 로 나간 event_name
--   leadgen_id       Meta 리드 번호(user_data.lead_id) — 연락처 없음
--   compass_lead_id  crm.leads.id (FK 없음 — crm 스키마 소유는 Compass)
--   event_time       보낸 event_time(단계가 바뀐 시각)
--
-- 개인정보 없음. 표가 없으면 크론은 보내지 않는다(dryRun 만 빈 원장으로 센다). 재실행 무해(IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.meta_crm_signal_events (
  dedupe_key      text primary key,
  stage           text not null check (stage in ('initial_lead', 'contacted', 'trial_account', 'demo', 'paid')),
  leadgen_id      text not null check (leadgen_id ~ '^[0-9]{15,17}$'),
  compass_lead_id bigint not null,
  event_time      timestamptz not null,
  sent_at         timestamptz not null default now()
);

comment on table public.meta_crm_signal_events is
  '메타 리드 영업 단계를 Meta Conversions API(전환 리드)로 보낸 기록 — 같은 리드·같은 단계 한 번. lib/marketing/meta-crm-signal.ts';

-- RLS deny-all(정책 없음) — service_role 만 읽고 쓴다(20260915_meta_leadgen_single_receiver 와 같은 형태).
alter table public.meta_crm_signal_events enable row level security;
revoke all on public.meta_crm_signal_events from anon, authenticated;
grant select, insert on public.meta_crm_signal_events to service_role;
