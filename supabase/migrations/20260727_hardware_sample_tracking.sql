-- Hardware sample unit tracking: 샘플 1대=1행 개체 관리 + 경로·메모 단일 타임라인.
-- 원장(hardware_movements)은 수량의 진실로 유지하고 유닛은 그 위의 생애 레이어다.
-- movement 참조는 soft text(movement_ref)로만 둔다 — 시트 가져오기가 원장을 통째로
-- 교체(replace_hardware_sheet_import)하므로 FK를 걸면 유닛 이력이 함께 휩쓸린다.

create table if not exists public.hardware_sample_units (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.hardware_items(id) on delete set null,
  product_name text not null,
  asset_code text not null,
  serial_no text,
  status text not null default 'office' check (
    status in ('office', 'loaned', 'repair', 'converted', 'retired')
  ),
  current_customer text,
  current_owner text,
  loaned_at date,
  expected_return_at date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hardware_sample_units_product_not_blank check (char_length(btrim(product_name)) > 0),
  constraint hardware_sample_units_asset_code_not_blank check (char_length(btrim(asset_code)) > 0),
  constraint hardware_sample_units_asset_code_unique unique (asset_code)
);

create table if not exists public.hardware_sample_events (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.hardware_sample_units(id) on delete cascade,
  event_type text not null check (
    event_type in ('assign', 'loan', 'return', 'repair', 'convert', 'adjust', 'memo', 'retire')
  ),
  occurred_at date not null default current_date,
  customer text,
  from_location text,
  to_location text,
  memo text,
  movement_ref text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists hardware_sample_units_status_idx
  on public.hardware_sample_units(status, product_name);

create index if not exists hardware_sample_events_unit_idx
  on public.hardware_sample_events(unit_id, occurred_at desc, created_at desc);

drop trigger if exists hardware_sample_units_updated_at on public.hardware_sample_units;
create trigger hardware_sample_units_updated_at
  before update on public.hardware_sample_units
  for each row execute function public.update_updated_at();

alter table public.hardware_sample_units enable row level security;
alter table public.hardware_sample_events enable row level security;

revoke all on table
  public.hardware_sample_units,
  public.hardware_sample_events
from anon, authenticated;

grant all on table
  public.hardware_sample_units,
  public.hardware_sample_events
to service_role;
