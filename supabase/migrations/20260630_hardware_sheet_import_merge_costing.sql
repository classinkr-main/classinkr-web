-- Hardware sheet import (additive merge): restore inbound-costing parity.
--
-- Follow-up to 20260630_hardware_sheet_import_merge.sql. The additive-merge RPC
-- merge_hardware_sheet_import landed on hm's branch independently of the local
-- inbound-costing work (20260630_hardware_sheet_import_inbound_costing.sql), so
-- after the 2.29 ↔ 2.29_hm merge the two import paths diverged:
--   * replace_hardware_sheet_import  → writes unit_price / amount_usd  ✅
--   * merge_hardware_sheet_import     → OMITS them, so under
--     HARDWARE_SHEET_ADDITIVE_MERGE every sheet-imported inbound row got
--     NULL cost.  The build can't catch this — the column lists are explicit
--     SQL inside a function body.
--
-- This recreates merge_hardware_sheet_import byte-for-byte EXCEPT it adds
-- unit_price / amount_usd to:
--   * PASS 1 INSERT column list + its SELECT (cast from the candidate jsonb,
--     mirroring replace_hardware_sheet_import's
--     nullif(<row>->>'unit_price','')::numeric form), and
--   * PASS 2b UPDATE ... SET (so a cost-only edit propagates).
-- Signature, return type, the guard/snapshot contract, the >40% safety valve,
-- and every PASS structure are unchanged.
--
-- This file sorts AFTER ..._merge.sql and ..._inbound_costing.sql, so the
-- function and the hardware_movements.unit_price/amount_usd columns (added in
-- 20260628_hardware_movements_costing.sql) already exist when this runs.

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
    owner, status, reference_no, memo, serials, unit_price, amount_usd, source, source_table, source_key, source_digest,
    import_run_id, raw, created_by
  )
  select (c.row->>'item_id')::uuid, c.row->>'product_name', c.row->>'movement_type', (c.row->>'quantity')::int,
         nullif(c.row->>'occurred_at', '')::date, nullif(c.row->>'from_location', ''), nullif(c.row->>'to_location', ''),
         nullif(c.row->>'owner', ''), nullif(c.row->>'status', ''), nullif(c.row->>'reference_no', ''),
         nullif(c.row->>'memo', ''),
         array(select jsonb_array_elements_text(coalesce(c.row->'serials', '[]'::jsonb))),
         nullif(c.row->>'unit_price', '')::numeric, nullif(c.row->>'amount_usd', '')::numeric,
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
         unit_price = nullif(c.row->>'unit_price', '')::numeric,
         amount_usd = nullif(c.row->>'amount_usd', '')::numeric,
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
