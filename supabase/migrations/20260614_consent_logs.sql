-- 쿠키/픽셀 동의 감사 로그 (PIPA/GDPR 입증용)
-- 기획: docs/active/lead-funnel-consent-auth-scoring-plan-2026-06-14.md (D3, WS1 / P0)
create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text,
  user_id uuid,
  categories jsonb not null,        -- { necessary, analytics, marketing }
  policy_version text not null,
  user_agent text,
  ip_hash text,                     -- 원본 IP 미저장, SHA-256 해시만 보관
  created_at timestamptz not null default now()
);

create index if not exists consent_logs_anonymous_id_idx on public.consent_logs (anonymous_id);
create index if not exists consent_logs_created_at_idx on public.consent_logs (created_at desc);

-- 서버(서비스 롤)만 기록/조회. RLS 활성 + 정책 미부여 → 공개/익명 클라이언트 직접 접근 차단.
alter table public.consent_logs enable row level security;
