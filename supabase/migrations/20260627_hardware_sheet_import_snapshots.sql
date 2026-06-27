-- Hardware sheet import snapshots: preserve the replace input and the previous
-- sheet-imported ledger before any destructive refresh.

create table if not exists public.hardware_sheet_import_snapshots (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.hardware_import_runs(id) on delete restrict,
  source text not null default 'branch_hw_sheet',
  created_at timestamptz not null default now(),
  created_by text,
  source_payload jsonb not null default '{}'::jsonb,
  candidate_movements jsonb not null default '[]'::jsonb,
  previous_sheet_movements jsonb not null default '[]'::jsonb,
  row_counts jsonb not null default '{}'::jsonb,
  checksum text not null,
  constraint hardware_sheet_import_snapshots_run_unique unique (import_run_id),
  constraint hardware_sheet_import_snapshots_checksum_not_blank check (char_length(btrim(checksum)) > 0)
);

create index if not exists hardware_sheet_import_snapshots_created_idx
  on public.hardware_sheet_import_snapshots(created_at desc);

create index if not exists hardware_sheet_import_snapshots_run_idx
  on public.hardware_sheet_import_snapshots(import_run_id);

create or replace function public.prevent_hardware_sheet_import_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'hardware sheet import snapshots are append-only';
end;
$$;

drop trigger if exists hardware_sheet_import_snapshots_immutable
  on public.hardware_sheet_import_snapshots;
create trigger hardware_sheet_import_snapshots_immutable
  before update or delete on public.hardware_sheet_import_snapshots
  for each row execute function public.prevent_hardware_sheet_import_snapshot_mutation();

create or replace function public.replace_hardware_sheet_import(rows jsonb, run_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  created_snapshot_id uuid;
  inserted_count int;
begin
  insert into public.hardware_sheet_import_snapshots (
    import_run_id,
    created_by,
    source_payload,
    candidate_movements,
    previous_sheet_movements,
    row_counts,
    checksum
  )
  select
    run_id,
    'legacy_replace_hardware_sheet_import',
    '{}'::jsonb,
    coalesce(rows, '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(m) order by m.created_at, m.id), '[]'::jsonb),
    jsonb_build_object(
      'candidate_movements', jsonb_array_length(coalesce(rows, '[]'::jsonb)),
      'previous_sheet_movements', count(m.id)
    ),
    encode(sha256(convert_to(coalesce(rows, '[]'::jsonb)::text, 'UTF8')), 'hex')
  from public.hardware_movements m
  where m.source = 'sheet_import'
  returning id into created_snapshot_id;

  select public.replace_hardware_sheet_import(rows, run_id, created_snapshot_id)
    into inserted_count;

  return inserted_count;
end;
$$;

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
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) as r;

  get diagnostics inserted_count = row_count;
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
  return restored_count;
end;
$$;

alter table public.hardware_sheet_import_snapshots enable row level security;

revoke all on table public.hardware_sheet_import_snapshots
from anon, authenticated;

grant all on table public.hardware_sheet_import_snapshots
to service_role;

revoke execute on function public.prevent_hardware_sheet_import_snapshot_mutation()
from public, anon, authenticated;

revoke execute on function public.replace_hardware_sheet_import(jsonb, uuid)
from public, anon, authenticated;

revoke execute on function public.replace_hardware_sheet_import(jsonb, uuid, uuid)
from public, anon, authenticated;

revoke execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)
from public, anon, authenticated;

grant execute on function public.replace_hardware_sheet_import(jsonb, uuid)
to service_role;

grant execute on function public.replace_hardware_sheet_import(jsonb, uuid, uuid)
to service_role;

grant execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)
to service_role;
