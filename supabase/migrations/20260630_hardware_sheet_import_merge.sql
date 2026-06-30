-- Hardware SCM: additive (누적) sheet ingestion — non-destructive merge
--
-- Replaces the destructive delete+insert sheet import with an idempotent, provenance
-- scoped MERGE so the ledger ACCUMULATES: new sheet rows insert, changed rows update
-- in place (preserving id/created_at), rows that vanish from the sheet are soft
-- tombstoned (not hard-deleted), and re-added rows revive. admin_manual rows, confirmed
-- (converted) rows, and human-locked partial-confirm remainders are never touched.
--
-- Identity = a position-independent natural fingerprint built in the repo
-- (lib/repositories/hardware-inventory.ts): source_key = hash(product, date, 물류No,
-- intra-group ordinal). Content = source_digest (added below) distinguishes edits.
--
-- Everything here is ADDITIVE and flag-gated: the old replace_hardware_sheet_import /
-- restore_hardware_sheet_import_snapshot RPCs are left intact. The repo only calls the
-- new merge RPC when HARDWARE_SHEET_ADDITIVE_MERGE is enabled. Rollback = flip the flag.

-- 1a. content digest + tombstone provenance (nullable, additive)
alter table public.hardware_movements
  add column if not exists source_digest text,
  add column if not exists sheet_absent_run uuid;

-- 1b. partial index so the per-run tombstone anti-join is index-only
create index if not exists hardware_movements_sheet_active_idx
  on public.hardware_movements (source_key)
  where source = 'sheet_import' and voided_at is null;

-- 1c. partial-confirm must mark the remaining planned sheet_import row as human-locked
--     so a later sheet merge never overwrites the operator-reduced quantity. Only the
--     partial branch changes vs 20260629_hardware_partial_confirm.sql.
create or replace function public.confirm_hardware_planned_movement(
  planned_id uuid,
  actor text,
  occurred_on date default null,
  confirm_qty int default null
)
returns public.hardware_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  planned public.hardware_movements;
  created public.hardware_movements;
  effective_qty int;
begin
  select * into planned from public.hardware_movements where id = planned_id for update;

  if planned.id is null then
    raise exception '배송 예정 기록을 찾을 수 없습니다.';
  end if;
  if planned.voided_at is not null then
    raise exception '이미 취소되었거나 처리된 배송 예정 기록입니다.';
  end if;
  if planned.movement_type <> 'outbound' or not (
    coalesce(planned.status, '') ilike '%예정%'
    or coalesce(planned.status, '') ilike '%예약%'
    or coalesce(planned.status, '') ilike '%대기%'
    or coalesce(planned.status, '') ilike '%planned%'
  ) then
    raise exception '배송 예정 출고만 완료 처리할 수 있습니다.';
  end if;

  effective_qty := least(coalesce(confirm_qty, planned.quantity), planned.quantity);
  if effective_qty <= 0 then
    raise exception '확정 수량은 1 이상이어야 합니다.';
  end if;

  if planned.reference_no is not null and exists (
    select 1 from public.hardware_movements m
     where m.id <> planned.id and m.source = 'admin_manual' and m.voided_at is null
       and m.reference_no = planned.reference_no and m.product_name = planned.product_name
       and not (
         coalesce(m.status, '') ilike '%예정%' or coalesce(m.status, '') ilike '%예약%'
         or coalesce(m.status, '') ilike '%대기%' or coalesce(m.status, '') ilike '%planned%'
       )
  ) then
    raise exception '이미 같은 CRM 오더가 실제 출고로 반영되어 있습니다.';
  end if;

  insert into public.hardware_movements (
    item_id, product_name, movement_type, quantity, occurred_at, from_location, to_location,
    owner, status, reference_no, memo, serials, lot_no, source, raw, created_by, converted_from_movement_id
  )
  values (
    planned.item_id, planned.product_name, 'outbound', effective_qty, coalesce(occurred_on, current_date),
    planned.from_location, planned.to_location, planned.owner, '출고', planned.reference_no,
    concat_ws(E'\n', planned.memo, '배송 예정에서 실제 출고로 전환'), planned.serials, planned.lot_no,
    'admin_manual',
    coalesce(planned.raw, '{}'::jsonb) || jsonb_build_object(
      'workflow', jsonb_build_object(
        'convertedFromMovementId', planned.id, 'convertedAt', now(),
        'convertedBy', nullif(btrim(coalesce(actor, '')), ''),
        'confirmedQuantity', effective_qty, 'plannedQuantity', planned.quantity
      )
    ),
    nullif(btrim(coalesce(actor, '')), ''), planned.id
  )
  returning * into created;

  if effective_qty >= planned.quantity then
    update public.hardware_movements
       set voided_at = now(), voided_by = nullif(btrim(coalesce(actor, '')), ''),
           void_reason = '배송 예정 출고 완료', converted_to_movement_id = created.id
     where id = planned.id;
  else
    update public.hardware_movements
       set quantity = planned.quantity - effective_qty,
           raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
             'human_locked_at', now(),
             'human_locked_by', nullif(btrim(coalesce(actor, '')), '')
           )
     where id = planned.id;
  end if;

  return created;
end;
$$;

revoke execute on function public.confirm_hardware_planned_movement(uuid, text, date, int)
  from public, anon, authenticated;
grant execute on function public.confirm_hardware_planned_movement(uuid, text, date, int)
  to service_role;

-- 1d. the additive merge RPC. Same guard/snapshot contract as replace_hardware_sheet_import,
--     but four provenance-scoped passes instead of delete+insert.
create or replace function public.merge_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot public.hardware_sheet_import_snapshots;
  active_count int;
  absent_count int;
  inserted int := 0;
  updated int := 0;
  tombstoned int := 0;
  revived int := 0;
begin
  -- fail-closed guards (verbatim contract from replace_hardware_sheet_import 3-arg)
  select * into snapshot from public.hardware_sheet_import_snapshots where id = snapshot_id;
  if snapshot.id is null then
    raise exception 'hardware sheet import snapshot % does not exist', snapshot_id;
  end if;
  if snapshot.import_run_id <> run_id then
    raise exception 'hardware sheet import snapshot % does not belong to run %', snapshot_id, run_id;
  end if;
  if snapshot.candidate_movements <> coalesce(rows, '[]'::jsonb) then
    raise exception 'hardware sheet import snapshot % does not match replacement rows', snapshot_id;
  end if;

  create temp table _cand on commit drop as
  select r->>'source_key' as source_key, r->>'source_digest' as source_digest, r as row
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) as r;

  -- SAFETY VALVE: refuse if >40% of live, non-locked, non-converted sheet rows would vanish
  select count(*) into active_count
    from public.hardware_movements
   where source = 'sheet_import' and voided_at is null and source_key is not null;
  select count(*) into absent_count
    from public.hardware_movements m
   where m.source = 'sheet_import' and m.voided_at is null and m.source_key is not null
     and m.converted_to_movement_id is null
     and coalesce((m.raw->>'human_locked_at'), '') = ''
     and not exists (select 1 from _cand c where c.source_key = m.source_key);
  if active_count > 0 and absent_count::numeric / active_count > 0.40 then
    raise exception 'merge aborted: %/% active sheet rows absent (>40%% safety valve)', absent_count, active_count;
  end if;

  -- PASS 1: insert genuinely new fingerprints
  insert into public.hardware_movements (
    item_id, product_name, movement_type, quantity, occurred_at, from_location, to_location,
    owner, status, reference_no, memo, serials, source, source_table, source_key, source_digest,
    import_run_id, raw, created_by
  )
  select (c.row->>'item_id')::uuid, c.row->>'product_name', c.row->>'movement_type', (c.row->>'quantity')::int,
         nullif(c.row->>'occurred_at', '')::date, nullif(c.row->>'from_location', ''), nullif(c.row->>'to_location', ''),
         nullif(c.row->>'owner', ''), nullif(c.row->>'status', ''), nullif(c.row->>'reference_no', ''),
         nullif(c.row->>'memo', ''),
         array(select jsonb_array_elements_text(coalesce(c.row->'serials', '[]'::jsonb))),
         'sheet_import', nullif(c.row->>'source_table', ''), c.source_key, c.source_digest,
         run_id, coalesce(c.row->'raw', '{}'::jsonb), 'sheet_import'
    from _cand c
   where not exists (
     select 1 from public.hardware_movements m
      where m.source = 'sheet_import' and m.source_key = c.source_key
   );
  get diagnostics inserted = row_count;

  -- PASS 2a: revive a previously sheet-tombstoned fingerprint that reappeared (sheet-only)
  update public.hardware_movements m
     set voided_at = null, voided_by = null, void_reason = null, sheet_absent_run = null,
         raw = (m.raw - 'sheet_absent_run')
    from _cand c
   where m.source = 'sheet_import' and m.source_key = c.source_key
     and m.voided_at is not null and m.void_reason = '시트에서 제거됨' and m.voided_by = 'sheet_import';
  get diagnostics revived = row_count;

  -- PASS 2b: update CHANGED content in place; never touch converted / human-locked / non-sheet-voided rows
  update public.hardware_movements m
     set quantity = (c.row->>'quantity')::int,
         status = nullif(c.row->>'status', ''),
         from_location = nullif(c.row->>'from_location', ''),
         to_location = nullif(c.row->>'to_location', ''),
         owner = nullif(c.row->>'owner', ''),
         memo = nullif(c.row->>'memo', ''),
         serials = array(select jsonb_array_elements_text(coalesce(c.row->'serials', '[]'::jsonb))),
         reference_no = nullif(c.row->>'reference_no', ''),
         raw = coalesce(c.row->'raw', '{}'::jsonb),
         source_digest = c.source_digest,
         import_run_id = run_id
    from _cand c
   where m.source = 'sheet_import' and m.source_key = c.source_key
     and m.voided_at is null
     and m.converted_to_movement_id is null
     and coalesce((m.raw->>'human_locked_at'), '') = ''
     and coalesce(m.source_digest, '') <> coalesce(c.source_digest, '');
  get diagnostics updated = row_count;

  -- PASS 3: tombstone fingerprints that vanished from the sheet (provenance-scoped)
  update public.hardware_movements m
     set voided_at = now(), voided_by = 'sheet_import', void_reason = '시트에서 제거됨',
         sheet_absent_run = run_id,
         raw = coalesce(m.raw, '{}'::jsonb) || jsonb_build_object('sheet_absent_run', run_id)
   where m.source = 'sheet_import' and m.voided_at is null and m.source_key is not null
     and m.converted_to_movement_id is null
     and coalesce((m.raw->>'human_locked_at'), '') = ''
     and not exists (select 1 from _cand c where c.source_key = m.source_key);
  get diagnostics tombstoned = row_count;

  return jsonb_build_object('inserted', inserted, 'updated', updated, 'tombstoned', tombstoned, 'revived', revived);
end;
$$;

revoke execute on function public.merge_hardware_sheet_import(jsonb, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.merge_hardware_sheet_import(jsonb, uuid, uuid)
  to service_role;
