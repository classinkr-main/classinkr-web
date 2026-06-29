-- Hardware inventory MVP: admin-owned ledger separated from sheet sync tables.

create table if not exists public.hardware_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  category text,
  reorder_point int not null default 2 check (reorder_point >= 0),
  lead_time_days int not null default 14 check (lead_time_days >= 0),
  active boolean not null default true,
  source_aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hardware_items_name_not_blank check (char_length(btrim(name)) > 0),
  constraint hardware_items_name_unique unique (name)
);

create table if not exists public.hardware_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_imported int,
  rows_skipped int,
  error text,
  raw jsonb not null default '{}'
);

create table if not exists public.hardware_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.hardware_items(id) on delete restrict,
  product_name text not null,
  movement_type text not null check (
    movement_type in ('inbound', 'outbound', 'return', 'transfer', 'repair', 'adjust')
  ),
  quantity int not null check (quantity > 0),
  occurred_at date,
  from_location text,
  to_location text,
  owner text,
  status text,
  reference_no text,
  memo text,
  serials text[] not null default '{}',
  source text not null default 'admin_manual' check (source in ('admin_manual', 'sheet_import')),
  source_table text,
  source_key text,
  import_run_id uuid references public.hardware_import_runs(id) on delete set null,
  raw jsonb not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  constraint hardware_movements_product_not_blank check (char_length(btrim(product_name)) > 0)
);

create index if not exists hardware_items_active_name_idx
  on public.hardware_items(active, name);

create index if not exists hardware_movements_item_date_idx
  on public.hardware_movements(item_id, occurred_at desc nulls last, created_at desc);

create index if not exists hardware_movements_type_date_idx
  on public.hardware_movements(movement_type, occurred_at desc nulls last, created_at desc);

create index if not exists hardware_movements_source_idx
  on public.hardware_movements(source, source_table);

create unique index if not exists hardware_movements_source_key_uidx
  on public.hardware_movements(source, source_key)
  where source_key is not null;

drop trigger if exists hardware_items_updated_at on public.hardware_items;
create trigger hardware_items_updated_at
  before update on public.hardware_items
  for each row execute function public.update_updated_at();

create or replace function public.replace_hardware_sheet_import(rows jsonb, run_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  delete from public.hardware_movements
   where source = 'sheet_import';

  insert into public.hardware_movements (
    item_id,
    product_name,
    movement_type,
    quantity,
    occurred_at,
    from_location,
    to_location,
    owner,
    status,
    reference_no,
    memo,
    serials,
    source,
    source_table,
    source_key,
    import_run_id,
    raw,
    created_by
  )
  select
    (r->>'item_id')::uuid,
    r->>'product_name',
    r->>'movement_type',
    (r->>'quantity')::int,
    nullif(r->>'occurred_at', '')::date,
    nullif(r->>'from_location', ''),
    nullif(r->>'to_location', ''),
    nullif(r->>'owner', ''),
    nullif(r->>'status', ''),
    nullif(r->>'reference_no', ''),
    nullif(r->>'memo', ''),
    array(select jsonb_array_elements_text(coalesce(r->'serials', '[]'::jsonb))),
    'sheet_import',
    nullif(r->>'source_table', ''),
    nullif(r->>'source_key', ''),
    run_id,
    coalesce(r->'raw', '{}'::jsonb),
    'sheet_import'
  from jsonb_array_elements(rows) as r;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

alter table public.hardware_items enable row level security;
alter table public.hardware_movements enable row level security;
alter table public.hardware_import_runs enable row level security;

revoke all on table
  public.hardware_items,
  public.hardware_movements,
  public.hardware_import_runs
from anon, authenticated;

grant all on table
  public.hardware_items,
  public.hardware_movements,
  public.hardware_import_runs
to service_role;

revoke execute on function public.replace_hardware_sheet_import(jsonb, uuid)
from public, anon, authenticated;

grant execute on function public.replace_hardware_sheet_import(jsonb, uuid)
to service_role;
