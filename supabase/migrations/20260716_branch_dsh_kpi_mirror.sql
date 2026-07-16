-- DSH/KPI 시트 미러 — branch_rev_deals와 같은 "동기화 시점 스냅샷" 레인.
-- summary/kpi/insights의 요청 경로가 라이브 Google Sheets 읽기에 의존하지 않도록
-- sync(cron/수동 버튼)가 이 테이블을 채우고, 읽기는 액티브 임포트 → 미러 → 라이브
-- 시트(초기 1회성 폴백) 순으로 내려간다. FY 단위 전체 교체라 행 이력은 남기지 않는다.

create table if not exists branch_dsh_mirror (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null,
  row_level text not null check (row_level in ('team','member','breakdown')),
  row_kind text not null check (row_kind in ('goal','status')),
  team text,
  member text,
  category text,
  status_type text,
  channel text,
  annual numeric not null default 0,
  q1 numeric not null default 0,
  q2 numeric not null default 0,
  q3 numeric not null default 0,
  q4 numeric not null default 0,
  months jsonb not null default '{}',
  synced_at timestamptz not null default now()
);
create index if not exists branch_dsh_mirror_fy_idx on branch_dsh_mirror(fiscal_year);

create table if not exists branch_kpi_mirror (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null,
  -- null = FY 누계 블록, 1~12 = 해당 월 블록 (KPI 탭 구조 그대로)
  period_month int check (period_month between 1 and 12),
  member text not null,
  pairs jsonb not null default '{}',
  synced_at timestamptz not null default now()
);
create index if not exists branch_kpi_mirror_fy_idx on branch_kpi_mirror(fiscal_year);

-- 접근은 service-role(admin 클라이언트) 전용 — RLS를 켜고 정책은 만들지 않아
-- anon/authenticated 키로는 아예 닿지 않게 한다 (라이브 적용 시 "Run and enable RLS" 선택과 동일)
alter table branch_dsh_mirror enable row level security;
alter table branch_kpi_mirror enable row level security;

create or replace function replace_branch_dsh_mirror(p_fiscal_year int, rows jsonb) returns void language plpgsql as $$
begin
  delete from branch_dsh_mirror where fiscal_year = p_fiscal_year;
  insert into branch_dsh_mirror (
    fiscal_year, row_level, row_kind, team, member, category, status_type, channel,
    annual, q1, q2, q3, q4, months)
  select p_fiscal_year, r->>'row_level', r->>'row_kind',
         nullif(r->>'team',''), nullif(r->>'member',''),
         nullif(r->>'category',''), nullif(r->>'status_type',''), nullif(r->>'channel',''),
         coalesce(nullif(r->>'annual','')::numeric, 0),
         coalesce(nullif(r->>'q1','')::numeric, 0),
         coalesce(nullif(r->>'q2','')::numeric, 0),
         coalesce(nullif(r->>'q3','')::numeric, 0),
         coalesce(nullif(r->>'q4','')::numeric, 0),
         coalesce(r->'months','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_kpi_mirror(p_fiscal_year int, rows jsonb) returns void language plpgsql as $$
begin
  delete from branch_kpi_mirror where fiscal_year = p_fiscal_year;
  insert into branch_kpi_mirror (fiscal_year, period_month, member, pairs)
  select p_fiscal_year, nullif(r->>'period_month','')::int, r->>'member',
         coalesce(r->'pairs','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;
