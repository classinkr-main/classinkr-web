-- Security hardening follow-up (two items, single migration):
--
-- Item 1 — fail-closed guard on restore_hardware_sheet_import_snapshot(uuid, text).
--   The function in 20260630_hardware_sheet_import_inbound_costing.sql is
--   `security definer` (RLS-bypassing) and hard-deletes every
--   hardware_movements row with source='sheet_import' BEFORE re-inserting from
--   snapshot.previous_sheet_movements. It only checked `snapshot.id is not null`,
--   so a snapshot whose previous_sheet_movements was null/non-array/empty would
--   wipe the live sheet-import ledger and restore nothing. Its siblings
--   (replace_hardware_sheet_import / merge_hardware_sheet_import) fail-closed with
--   integrity guards BEFORE mutating; this brings restore to parity.
--
--   This recreates the function IDENTICALLY except for one CONSERVATIVE
--   fail-closed guard added right after loading the snapshot and BEFORE the delete:
--     * assert previous_sheet_movements is a non-null JSON array, and
--     * assert it is non-empty (a restore that would leave zero sheet-import rows
--       is rejected — restore exists to recover the prior ledger state, and the
--       snapshot-creation path always captures the rows that existed; an empty
--       array here signals a malformed snapshot, not a legitimate restore).
--
--   Checksum note: the stored `checksum` is NOT reproducible in SQL over
--   previous_sheet_movements. checksumImportSnapshot (lib/repositories/hardware-
--   inventory.ts) is `sha256(JSON.stringify({candidateMovements,
--   previousSheetMovements, rowCounts}))` — JS key ordering / whitespace cannot be
--   reproduced server-side, and the legacy SQL path stores
--   `encode(sha256(rows::text),'hex')` over a different input again. So no checksum
--   assertion is added; only the array-shape + non-empty guard, which is provably
--   safe for every legitimate restore.
--
--   Signature, return type, the delete+reinsert logic, and grants/revokes are
--   unchanged.
--
-- Item 2 — lock down crm_neo_customer_snapshots (PII read model) table privileges.
--   20260629_crm_neo_customer_snapshots.sql enables RLS but never issued an
--   explicit `revoke all ... from anon, authenticated`, unlike the hardware ledger
--   tables. Add the same revoke/grant footer here (mirrors
--   20260626_hardware_inventory_ledger.sql / 20260627_hardware_sheet_import_snapshots.sql).

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
  return restored_count;
end;
$$;

revoke execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)
from public, anon, authenticated;

grant execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)
to service_role;

-- Item 2 — crm_neo_customer_snapshots (PII) table privilege lockdown.
revoke all on table public.crm_neo_customer_snapshots
from anon, authenticated;

grant all on table public.crm_neo_customer_snapshots
to service_role;
