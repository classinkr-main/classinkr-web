-- 일회용 로컬 클러스터 전용 최소 골격 — 실제 운영 표의 칸 중 확정 함수(v3)와 MCP 색인이 닿는 것만 둔다. 합성 데이터만.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table public.hardware_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null default gen_random_uuid(),
  product_name text not null,
  movement_type text not null,
  quantity int not null check (quantity > 0),
  occurred_at date,
  from_location text,
  to_location text,
  owner text,
  status text,
  reference_no text,
  memo text,
  serials text[] not null default '{}',
  lot_no text,
  unit_price numeric,
  amount_usd numeric,
  amount_cny numeric,
  storage_location text,
  importer text,
  source text not null default 'admin_manual',
  raw jsonb not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  converted_from_movement_id uuid references public.hardware_movements(id) on delete set null,
  converted_to_movement_id uuid references public.hardware_movements(id) on delete set null
);

-- MCP 배송 예정 한 줄(hw_plan_movement 가 만드는 꼴: raw.mcp 에 호출자·키 해시)
create function public.test_mcp_plan(p_caller text, p_hash text, p_ref text, p_qty int, p_lot text default null)
returns uuid language sql as $$
  insert into public.hardware_movements (product_name, movement_type, quantity, occurred_at, from_location, to_location, status, reference_no, lot_no, raw)
  values ('시험 품목', 'outbound', p_qty, current_date, '창고', '시험 고객', '배송 예정', p_ref, p_lot,
          jsonb_build_object('mcp', jsonb_build_object('caller', p_caller, 'idempotency_key_hash', p_hash, 'args_fingerprint', 'fp')))
  returning id
$$;
