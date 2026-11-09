-- 회수 → 원 시트 출고 연결이 시트 가져오기·스냅샷 복원을 막지 않게 한다(2026-11-09).
--
-- 문제: 20261028_hardware_inventory_process.sql 이 return_of_movement_id 를 ON DELETE RESTRICT 로 걸었다.
-- 운영 출고 원장은 거의 전부 source='sheet_import' 이고, 회수 등록은 원 출고(시트 행 포함)를 고른다.
-- 교체 가져오기·스냅샷 복원은 시트 행을 전부 지우고 다시 넣으므로, 회수가 한 건이라도 시트 출고를
-- 가리키면 delete 가 23503 으로 실패한다 — 매시간 자동 가져오기와 수동 가져오기가 그 뒤로 계속 실패한다.
-- FK 만 SET NULL 로 바꾸면 교체마다 연결이 끊겨 같은 출고를 다시 회수할 수 있게 된다.
--
-- 고침:
--   * FK 를 ON DELETE SET NULL 로(어떤 경로로 지워져도 가져오기를 막지 않는다).
--   * replace_hardware_sheet_import(jsonb, uuid, uuid)·restore_hardware_sheet_import_snapshot(uuid, text):
--     delete 앞에서 회수 연결을 원 시트 행의 source_key 로 잡아 두고, insert 뒤 같은 source_key 행에 되붙인다.
--   * 교체 insert 에 storage_location(시트 입고 보관처 원문)을 더한다 — 앱은 실어 보내는데 RPC 가 버리고 있었다.
--
-- 함수 본문은 20260630_hardware_sheet_import_inbound_costing.sql(교체)·20260701_hardware_restore_snapshot_guard.sql
-- (복원)과 같고 위 블록만 더했다. 시그니처·권한은 그대로다. merge_hardware_sheet_import 는 행을 지우지 않아 해당 없다.
-- 재실행 무해. REST 프로브로 볼 대상이 없어 schema-contract 에 넣지 않는다 — 적용 확인:
--   select confdeltype from pg_constraint where conname = 'hardware_movements_return_of_fkey';  -- 'n' 이면 적용됨

ALTER TABLE public.hardware_movements
  DROP CONSTRAINT IF EXISTS hardware_movements_return_of_fkey;
ALTER TABLE public.hardware_movements
  ADD CONSTRAINT hardware_movements_return_of_fkey
  FOREIGN KEY (return_of_movement_id) REFERENCES public.hardware_movements(id) ON DELETE SET NULL;

create or replace function public.replace_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
  snapshot public.hardware_sheet_import_snapshots;
begin
  select *
    into snapshot
    from public.hardware_sheet_import_snapshots
   where id = snapshot_id;

  if snapshot.id is null then
    raise exception 'hardware sheet import snapshot % does not exist', snapshot_id;
  end if;

  if snapshot.import_run_id <> run_id then
    raise exception 'hardware sheet import snapshot % does not belong to run %', snapshot_id, run_id;
  end if;

  if snapshot.candidate_movements <> coalesce(rows, '[]'::jsonb) then
    raise exception 'hardware sheet import snapshot % does not match replacement rows', snapshot_id;
  end if;

  -- 회수 → 원 시트 출고 연결을 source_key 로 잡아 두고 비운다(20261109). 아래 delete 가 FK 에 막히지 않게 하고,
  -- 다시 넣은 같은 source_key 행에 되붙인다 — 교체·복원마다 시트 행 id 가 바뀌어도 회수 수량이 원 출고에 남는다.
  drop table if exists pg_temp._hw_return_links;
  create temp table _hw_return_links on commit drop as
  select r.id as return_id, s.source_key
    from public.hardware_movements r
    join public.hardware_movements s on s.id = r.return_of_movement_id
   where s.source = 'sheet_import'
     and s.source_key is not null;

  update public.hardware_movements m
     set return_of_movement_id = null
    from _hw_return_links l
   where m.id = l.return_id;

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
    unit_price,
    amount_usd,
    storage_location,
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
    nullif(r->>'unit_price', '')::numeric,
    nullif(r->>'amount_usd', '')::numeric,
    nullif(r->>'storage_location', ''),
    'sheet_import',
    nullif(r->>'source_table', ''),
    nullif(r->>'source_key', ''),
    run_id,
    coalesce(r->'raw', '{}'::jsonb),
    'sheet_import'
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) as r;

  get diagnostics inserted_count = row_count;

  -- 같은 source_key 로 다시 들어온 시트 행에 회수를 되붙인다((source, source_key) 유니크라 많아야 한 행).
  -- 시트에서 원 출고 줄이 사라졌으면 연결은 비어 남는다(회수 기록·수량은 그대로).
  update public.hardware_movements m
     set return_of_movement_id = n.id
    from _hw_return_links l
    join public.hardware_movements n
      on n.source = 'sheet_import'
     and n.source_key = l.source_key
   where m.id = l.return_id;
  return inserted_count;
end;
$$;

create or replace function public.restore_hardware_sheet_import_snapshot(snapshot_id uuid, actor text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  restored_count int;
  snapshot public.hardware_sheet_import_snapshots;
begin
  select *
    into snapshot
    from public.hardware_sheet_import_snapshots
   where id = snapshot_id;

  if snapshot.id is null then
    raise exception 'hardware sheet import snapshot % does not exist', snapshot_id;
  end if;

  -- Fail-closed shape guard (added in 20260701): refuse to wipe the live
  -- sheet-import ledger unless the snapshot carries a restorable JSON array of
  -- prior rows. Rejects null / non-array / empty previous_sheet_movements BEFORE
  -- the destructive delete below.
  if snapshot.previous_sheet_movements is null
     or jsonb_typeof(snapshot.previous_sheet_movements) <> 'array' then
    raise exception 'hardware sheet import snapshot % has no restorable previous_sheet_movements array', snapshot_id;
  end if;

  if jsonb_array_length(snapshot.previous_sheet_movements) = 0 then
    raise exception 'hardware sheet import snapshot % previous_sheet_movements is empty; refusing destructive restore', snapshot_id;
  end if;

  -- 회수 → 원 시트 출고 연결을 source_key 로 잡아 두고 비운다(20261109). 아래 delete 가 FK 에 막히지 않게 하고,
  -- 다시 넣은 같은 source_key 행에 되붙인다 — 교체·복원마다 시트 행 id 가 바뀌어도 회수 수량이 원 출고에 남는다.
  drop table if exists pg_temp._hw_return_links;
  create temp table _hw_return_links on commit drop as
  select r.id as return_id, s.source_key
    from public.hardware_movements r
    join public.hardware_movements s on s.id = r.return_of_movement_id
   where s.source = 'sheet_import'
     and s.source_key is not null;

  update public.hardware_movements m
     set return_of_movement_id = null
    from _hw_return_links l
   where m.id = l.return_id;

  delete from public.hardware_movements
   where source = 'sheet_import';

  insert into public.hardware_movements (
    id,
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
    unit_price,
    amount_usd,
    amount_cny,
    storage_location,
    importer,
    lot_no,
    source,
    source_table,
    source_key,
    import_run_id,
    raw,
    created_by,
    created_at,
    voided_at,
    voided_by,
    void_reason,
    converted_from_movement_id,
    converted_to_movement_id
  )
  select
    (r->>'id')::uuid,
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
    nullif(r->>'unit_price', '')::numeric,
    nullif(r->>'amount_usd', '')::numeric,
    nullif(r->>'amount_cny', '')::numeric,
    nullif(r->>'storage_location', ''),
    nullif(r->>'importer', ''),
    nullif(r->>'lot_no', ''),
    'sheet_import',
    nullif(r->>'source_table', ''),
    nullif(r->>'source_key', ''),
    nullif(r->>'import_run_id', '')::uuid,
    coalesce(r->'raw', '{}'::jsonb) || jsonb_build_object(
      'restored_from_snapshot_id', snapshot_id,
      'restored_by', nullif(btrim(coalesce(actor, '')), ''),
      'restored_at', now()
    ),
    nullif(r->>'created_by', ''),
    coalesce(nullif(r->>'created_at', '')::timestamptz, now()),
    nullif(r->>'voided_at', '')::timestamptz,
    nullif(r->>'voided_by', ''),
    nullif(r->>'void_reason', ''),
    nullif(r->>'converted_from_movement_id', '')::uuid,
    nullif(r->>'converted_to_movement_id', '')::uuid
  from jsonb_array_elements(snapshot.previous_sheet_movements) as r;

  get diagnostics restored_count = row_count;

  -- 같은 source_key 로 다시 들어온 시트 행에 회수를 되붙인다((source, source_key) 유니크라 많아야 한 행).
  -- 시트에서 원 출고 줄이 사라졌으면 연결은 비어 남는다(회수 기록·수량은 그대로).
  update public.hardware_movements m
     set return_of_movement_id = n.id
    from _hw_return_links l
    join public.hardware_movements n
      on n.source = 'sheet_import'
     and n.source_key = l.source_key
   where m.id = l.return_id;
  return restored_count;
end;
$$;

revoke execute on function public.replace_hardware_sheet_import(jsonb, uuid, uuid)
from public, anon, authenticated;

revoke execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)
from public, anon, authenticated;

grant execute on function public.replace_hardware_sheet_import(jsonb, uuid, uuid)
to service_role;

grant execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)
to service_role;
