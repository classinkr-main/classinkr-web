-- REV 시트 색 규칙: 주차(w1~w5) 칸의 글자색 빨강 = 확정 매출, 파랑 = 클로징 임박(90%+).
-- 한 달 안에 확정/임박/예상이 섞이므로 boolean이 아닌 월별 "금액" 맵으로 저장한다.
-- (monthly_red boolean은 기존 브랜치 집계 호환용으로 유지: 해당 월에 확정분이 있으면 true)
alter table branch_rev_deals
  add column if not exists monthly_confirmed jsonb not null default '{}';
alter table branch_rev_deals
  add column if not exists monthly_high_conf jsonb not null default '{}';
-- 초기 드래프트(monthly_blue boolean)가 적용된 환경 정리
alter table branch_rev_deals drop column if exists monthly_blue;

create or replace function replace_branch_rev_deals(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_rev_deals;
  insert into branch_rev_deals (
    sheet_row, customer_name, branch_contact, team, manager, deal_type, status,
    first_payment, product_version, region, importance, note, contract_target,
    monthly_payments, monthly_red, monthly_confirmed, monthly_high_conf, raw)
  select (r->>'sheet_row')::int, r->>'customer_name', r->>'branch_contact',
         r->>'team', r->>'manager', r->>'deal_type', r->>'status',
         nullif(r->>'first_payment','')::date,
         r->>'product_version', r->>'region', r->>'importance', r->>'note',
         nullif(r->>'contract_target','')::numeric,
         coalesce(r->'monthly_payments','{}'::jsonb),
         coalesce(r->'monthly_red','{}'::jsonb),
         coalesce(r->'monthly_confirmed','{}'::jsonb),
         coalesce(r->'monthly_high_conf','{}'::jsonb),
         coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

-- 20260502 hardening과 동일한 권한 상태 유지
revoke execute on function public.replace_branch_rev_deals(jsonb) from public, anon, authenticated;
grant execute on function public.replace_branch_rev_deals(jsonb) to service_role;
