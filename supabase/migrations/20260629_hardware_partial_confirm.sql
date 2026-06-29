-- Hardware planned-confirm: partial quantity support
--
-- Replaces confirm_hardware_planned_movement with a 4-arg version that accepts an
-- optional confirm_qty. Null or full quantity -> convert and close the planned row
-- (as before). Partial (confirm_qty < planned.quantity) -> create an outbound for
-- confirm_qty and reduce the planned row's quantity by that amount, leaving the
-- remainder reserved. The old 3-arg overload is dropped to avoid an ambiguous call.

drop function if exists public.confirm_hardware_planned_movement(uuid, text, date);

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

  effective_qty := least(coalesce(confirm_qty, planned.quantity), planned.quantity);
  if effective_qty <= 0 then
    raise exception '확정 수량은 1 이상이어야 합니다.';
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
    effective_qty,
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
        'convertedBy', nullif(btrim(coalesce(actor, '')), ''),
        'confirmedQuantity', effective_qty,
        'plannedQuantity', planned.quantity
      )
    ),
    nullif(btrim(coalesce(actor, '')), ''),
    planned.id
  )
  returning * into created;

  if effective_qty >= planned.quantity then
    update public.hardware_movements
       set voided_at = now(),
           voided_by = nullif(btrim(coalesce(actor, '')), ''),
           void_reason = '배송 예정 출고 완료',
           converted_to_movement_id = created.id
     where id = planned.id;
  else
    update public.hardware_movements
       set quantity = planned.quantity - effective_qty
     where id = planned.id;
  end if;

  return created;
end;
$$;

revoke execute on function public.confirm_hardware_planned_movement(uuid, text, date, int)
from public, anon, authenticated;

grant execute on function public.confirm_hardware_planned_movement(uuid, text, date, int)
to service_role;
