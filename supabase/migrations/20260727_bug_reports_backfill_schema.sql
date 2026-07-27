-- ─────────────────────────────────────────────────────────────
-- bug_reports 스키마 백필 (재구성)
-- 생성일: 2026-07-27
--
-- 배경: bug_reports 테이블은 운영 DB에 이미 존재하지만(대시보드 수동
-- 생성 유산) CREATE TABLE 마이그레이션이 저장소에 없었다
-- (2026-07-27 DB 전수 감사에서 확인). lib/repositories/bugs.ts 가 사용한다.
-- 아래 정의는 2026-07-27 운영 DB 실측(information_schema.columns /
-- pg_constraint / pg_policies / pg_trigger)을 그대로 옮긴 것이다.
-- 모든 구문은 멱등이라 기존 운영 DB에 적용해도 아무것도 바꾸지 않는다.
--
-- 선행 의존: public.update_updated_at(), public.is_active_admin()
-- (둘 다 20260614_alpha_admin_base_schema.sql 이 보장)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  severity    text not null default 'medium'
                constraint bug_reports_severity_check
                check (severity in ('low', 'medium', 'high', 'critical')),
  status      text not null default 'open'
                constraint bug_reports_status_check
                check (status in ('open', 'in-progress', 'resolved', 'closed')),
  reporter    text not null,
  assignee    text,
  tags        text[] default '{}'::text[],
  environment text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.bug_reports is '어드민 개발 보드 버그 리포트 — lib/repositories/bugs.ts (service role 접근)';

-- 인덱스: 운영 실측 기준 PK 외 없음.

-- updated_at 자동 갱신
drop trigger if exists bug_reports_updated_at on public.bug_reports;
create trigger bug_reports_updated_at
  before update on public.bug_reports
  for each row execute function public.update_updated_at();

-- RLS: 운영 DB에서 활성 상태 + 어드민 전용 정책 (service role은 우회)
alter table public.bug_reports enable row level security;

drop policy if exists "Admins manage bug_reports" on public.bug_reports;
create policy "Admins manage bug_reports"
  on public.bug_reports for all
  using (public.is_active_admin());
