-- ─────────────────────────────────────────────────────────────
-- roadmap_items 스키마 백필 (재구성)
-- 생성일: 2026-07-27
--
-- 배경: roadmap_items 테이블은 운영 DB에 이미 존재하지만(대시보드 수동
-- 생성 유산) CREATE TABLE 마이그레이션이 저장소에 없었다
-- (2026-07-27 DB 전수 감사에서 확인). lib/repositories/roadmap.ts 가 사용한다.
-- 아래 정의는 2026-07-27 운영 DB 실측(information_schema.columns /
-- pg_constraint / pg_policies / pg_trigger)을 그대로 옮긴 것이다.
-- 모든 구문은 멱등이라 기존 운영 DB에 적용해도 아무것도 바꾸지 않는다.
--
-- 선행 의존: public.update_updated_at(), public.is_active_admin()
-- (둘 다 20260614_alpha_admin_base_schema.sql 이 보장)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.roadmap_items (
  id          uuid primary key default gen_random_uuid(),
  version     text not null,
  title       text not null,
  status      text not null default 'planned'
                constraint roadmap_items_status_check
                check (status in ('planned', 'in-progress', 'done')),
  start_date  date,
  target_date date,
  features    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.roadmap_items is '어드민 개발 보드 로드맵 — lib/repositories/roadmap.ts (service role 접근)';

-- 인덱스: 운영 실측 기준 PK 외 없음.

-- updated_at 자동 갱신
drop trigger if exists roadmap_items_updated_at on public.roadmap_items;
create trigger roadmap_items_updated_at
  before update on public.roadmap_items
  for each row execute function public.update_updated_at();

-- RLS: 운영 DB에서 활성 상태 + 어드민 전용 정책 (service role은 우회)
alter table public.roadmap_items enable row level security;

drop policy if exists "Admins manage roadmap_items" on public.roadmap_items;
create policy "Admins manage roadmap_items"
  on public.roadmap_items for all
  using (public.is_active_admin());
