-- ─────────────────────────────────────────────────────────────
-- 메타 리드 영업 단계 → Meta Conversions API 예약·발송 기록 (2026-11-04)
--
-- lib/marketing/meta-crm-signal.ts 가 Compass 단계(첫 접수·컨택·체험 계정·데모·결제)를 Meta '전환 리드'로 보낼 때
-- 같은 메타 리드·같은 단계를 한 번만 보내려고 쓰는 원장이다. 상태 전이:
--   예약(INSERT, PK 충돌이면 다른 실행이 이미 가져감) → 발송 → Meta 2xx 면 sent_at 기록 / 2xx 아님이면 행 삭제(다음 실행이 재시도).
--   네트워크 오류·시간 초과는 받았는지 몰라 예약만 남긴다(sent_at NULL = 응답 불명, 다시 보내지 않는다).
--
--   leadgen_id   Meta 리드 번호(user_data.lead_id). Compass 리드 id 는 병합으로 바뀌므로 키로 쓰지 않는다.
--   stage        Meta 로 나간 event_name
--   event_time   보낸 event_time(단계가 바뀐 시각)
--   reserved_at  예약 시각 — 자기 예약만 풀고 기록하는 조건
--   sent_at      Meta 가 받은 시각. NULL 이면 예약만(발송 중 또는 응답 불명)
--
-- 개인정보 없음(연락처·이름 없음). 표가 없으면 크론은 보내지 않는다(dryRun 만 빈 원장으로 센다). 재실행 무해(IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.meta_crm_signal_events (
  leadgen_id  text not null check (leadgen_id ~ '^[0-9]{15,17}$'),
  stage       text not null check (stage in ('initial_lead', 'contacted', 'trial_account', 'demo', 'paid')),
  event_time  timestamptz not null,
  reserved_at timestamptz not null default now(),
  sent_at     timestamptz,
  primary key (leadgen_id, stage)
);

comment on table public.meta_crm_signal_events is
  '메타 리드 영업 단계를 Meta Conversions API(전환 리드)로 보낸 예약·발송 기록 — 같은 메타 리드·같은 단계 한 번. sent_at NULL = 예약만(응답 불명). lib/marketing/meta-crm-signal.ts';

-- RLS deny-all(정책 없음) — service_role 만 읽고 쓴다(20260915_meta_leadgen_single_receiver 와 같은 형태).
alter table public.meta_crm_signal_events enable row level security;
revoke all on public.meta_crm_signal_events from anon, authenticated;
grant select, insert, update, delete on public.meta_crm_signal_events to service_role;
