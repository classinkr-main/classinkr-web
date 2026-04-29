create table branch_rev_deals (
  id uuid primary key default gen_random_uuid(),
  sheet_row int not null,
  customer_name text not null,
  branch_contact text, team text, manager text,
  deal_type text, status text,
  first_payment date, product_version text, region text, importance text, note text,
  contract_target numeric(14,0),
  monthly_payments jsonb not null default '{}',
  monthly_red jsonb not null default '{}',
  raw jsonb not null default '{}',
  synced_at timestamptz not null default now()
);
create index branch_rev_team_idx       on branch_rev_deals(team);
create index branch_rev_region_idx     on branch_rev_deals(region);
create index branch_rev_manager_idx    on branch_rev_deals(manager);
create index branch_rev_first_pay_idx  on branch_rev_deals(first_payment);

create table branch_hw_inbound (
  id uuid primary key default gen_random_uuid(),
  logistics_no text, inbound_date date,
  product text not null, quantity int not null default 0,
  unit_price numeric(14,0), amount numeric(14,0),
  serials text[], storage text, importer text, remarks text,
  raw jsonb not null default '{}', synced_at timestamptz not null default now()
);

create table branch_hw_outbound (
  id uuid primary key default gen_random_uuid(),
  logistics_no text, outbound_date date, owner text,
  product text not null, quantity int not null default 0,
  revenue numeric(14,0), destination text, serials text[],
  progress text, type text, remarks text,
  raw jsonb not null default '{}', synced_at timestamptz not null default now()
);

create table branch_hw_stock (
  id uuid primary key default gen_random_uuid(),
  product text not null, category text,
  quantity int not null default 0,
  raw jsonb not null default '{}', synced_at timestamptz not null default now()
);

create table branch_hw_sales_monthly (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null, fiscal_month int not null,
  product text not null, quantity int not null default 0,
  raw jsonb not null default '{}', synced_at timestamptz not null default now(),
  unique (fiscal_year, fiscal_month, product)
);

create table branch_dashboard_insights (
  id uuid primary key default gen_random_uuid(),
  team text not null, fiscal_period text not null,
  generated_at timestamptz not null default now(),
  one_liner text, next_actions jsonb not null default '[]',
  raw_response jsonb, input_digest text
);
create index branch_insights_idx on branch_dashboard_insights(team, generated_at desc);

create table branch_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(), finished_at timestamptz,
  source text not null, trigger text not null, status text not null,
  rows_affected int, error text
);
create index branch_sync_runs_recent_idx on branch_sync_runs(started_at desc);

create or replace function replace_branch_rev_deals(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_rev_deals;
  insert into branch_rev_deals (
    sheet_row, customer_name, branch_contact, team, manager, deal_type, status,
    first_payment, product_version, region, importance, note, contract_target,
    monthly_payments, monthly_red, raw)
  select (r->>'sheet_row')::int, r->>'customer_name', r->>'branch_contact',
         r->>'team', r->>'manager', r->>'deal_type', r->>'status',
         nullif(r->>'first_payment','')::date,
         r->>'product_version', r->>'region', r->>'importance', r->>'note',
         nullif(r->>'contract_target','')::numeric,
         coalesce(r->'monthly_payments','{}'::jsonb),
         coalesce(r->'monthly_red','{}'::jsonb),
         coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_inbound(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_inbound;
  insert into branch_hw_inbound (logistics_no, inbound_date, product, quantity, unit_price, amount,
    serials, storage, importer, remarks, raw)
  select r->>'logistics_no', nullif(r->>'inbound_date','')::date,
         r->>'product', coalesce((r->>'quantity')::int, 0),
         nullif(r->>'unit_price','')::numeric, nullif(r->>'amount','')::numeric,
         array(select jsonb_array_elements_text(coalesce(r->'serials','[]'::jsonb))),
         r->>'storage', r->>'importer', r->>'remarks',
         coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_outbound(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_outbound;
  insert into branch_hw_outbound (logistics_no, outbound_date, owner, product, quantity, revenue,
    destination, serials, progress, type, remarks, raw)
  select r->>'logistics_no', nullif(r->>'outbound_date','')::date,
         r->>'owner', r->>'product', coalesce((r->>'quantity')::int, 0),
         nullif(r->>'revenue','')::numeric, r->>'destination',
         array(select jsonb_array_elements_text(coalesce(r->'serials','[]'::jsonb))),
         r->>'progress', r->>'type', r->>'remarks',
         coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_stock(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_stock;
  insert into branch_hw_stock (product, category, quantity, raw)
  select r->>'product', r->>'category', coalesce((r->>'quantity')::int, 0), coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;

create or replace function replace_branch_hw_sales_monthly(rows jsonb) returns void language plpgsql as $$
begin
  truncate branch_hw_sales_monthly;
  insert into branch_hw_sales_monthly (fiscal_year, fiscal_month, product, quantity, raw)
  select (r->>'fiscal_year')::int, (r->>'fiscal_month')::int, r->>'product',
         coalesce((r->>'quantity')::int, 0), coalesce(r->'raw','{}'::jsonb)
  from jsonb_array_elements(rows) as r;
end$$;
