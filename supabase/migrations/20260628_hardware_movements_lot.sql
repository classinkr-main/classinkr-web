-- Hardware movements: lot (물류 번호) tracking — Step 1
--
-- Adds a manual `lot_no` column and threads it through the planned -> outbound
-- conversion so a confirmed shipment keeps its lot. Sheet-imported rows continue
-- to carry the logistics number (물류No) in `reference_no`; lot-level stock is
-- resolved in the repository from `lot_no` first, then `reference_no` for
-- `sheet_import` rows, so the sheet import/restore RPCs need no change here.

alter table public.hardware_movements
  add column if not exists lot_no text;

create index if not exists hardware_movements_item_lot_idx
  on public.hardware_movements(item_id, lot_no)
  where lot_no is not null;

-- Recreate the planned -> outbound conversion so the confirmed outbound keeps the
-- planned row's lot. Only the lot_no column is added versus the prior definition.
create or replace function public.confirm_hardware_planned_movement(
  planned_id uuid,
  actor text,
  occurred_on date default null
)
returns public.hardware_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  planned public.hardware_movements;
  created public.hardware_movements;
begin
  select *
    into planned
    from public.hardware_movements
   where id = planned_id
   for update;

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

  if planned.reference_no is not null and exists (
    select 1
      from public.hardware_movements m
     where m.id <> planned.id
       and m.source = 'admin_manual'
       and m.voided_at is null
       and m.reference_no = planned.reference_no
       and m.product_name = planned.product_name
       and not (
         coalesce(m.status, '') ilike '%예정%'
         or coalesce(m.status, '') ilike '%예약%'
         or coalesce(m.status, '') ilike '%대기%'
         or coalesce(m.status, '') ilike '%planned%'
       )
  ) then
    raise exception '이미 같은 CRM 오더가 실제 출고로 반영되어 있습니다.';
  end if;

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
    lot_no,
    source,
    raw,
    created_by,
    converted_from_movement_id
  )
  values (
    planned.item_id,
    planned.product_name,
    'outbound',
    planned.quantity,
    coalesce(occurred_on, current_date),
    planned.from_location,
    planned.to_location,
    planned.owner,
    '출고',
    planned.reference_no,
    concat_ws(E'\n', planned.memo, '배송 예정에서 실제 출고로 전환'),
    planned.serials,
    planned.lot_no,
    'admin_manual',
    coalesce(planned.raw, '{}'::jsonb) || jsonb_build_object(
      'workflow',
      jsonb_build_object(
        'convertedFromMovementId', planned.id,
        'convertedAt', now(),
        'convertedBy', nullif(btrim(coalesce(actor, '')), '')
      )
    ),
    nullif(btrim(coalesce(actor, '')), ''),
    planned.id
  )
  returning * into created;

  update public.hardware_movements
     set voided_at = now(),
         voided_by = nullif(btrim(coalesce(actor, '')), ''),
         void_reason = '배송 예정 출고 완료',
         converted_to_movement_id = created.id
   where id = planned.id;

  return created;
end;
$$;

revoke execute on function public.confirm_hardware_planned_movement(uuid, text, date)
from public, anon, authenticated;

grant execute on function public.confirm_hardware_planned_movement(uuid, text, date)
to service_role;
