-- Hardware planned-confirm v2: atomic FIFO lot allocation.
--
-- The legacy confirm_hardware_planned_movement RPC is intentionally left in place
-- for rollback compatibility. Application code prefers this v2 RPC and falls back
-- to the legacy function when the migration has not been applied yet.

create or replace function public.confirm_hardware_planned_movement_v2(
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
  first_created public.hardware_movements;
  effective_qty int;
  remaining_qty int;
  allocation_qty int;
  allocation_index int := 0;
  previous_from_same_planned int := 0;
  available_qty int;
  original_ref text;
  actual_ref text;
  converted_at timestamptz := now();
  lot_row record;
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

  original_ref := nullif(btrim(coalesce(planned.reference_no, '')), '');
  if original_ref is not null then
    if exists (
      select 1
        from public.hardware_movements m
       where m.id <> planned.id
         and m.source = 'admin_manual'
         and m.voided_at is null
         and m.reference_no = original_ref
         and m.product_name = planned.product_name
         and coalesce(m.converted_from_movement_id, planned.id) <> planned.id
         and not (
           coalesce(m.status, '') ilike '%예정%'
           or coalesce(m.status, '') ilike '%예약%'
           or coalesce(m.status, '') ilike '%대기%'
           or coalesce(m.status, '') ilike '%planned%'
         )
    ) then
      raise exception '이미 같은 CRM 오더가 실제 출고로 반영되어 있습니다.';
    end if;

    select count(*)
      into previous_from_same_planned
      from public.hardware_movements m
     where m.converted_from_movement_id = planned.id
       and m.voided_at is null;
  end if;

  remaining_qty := effective_qty;

  if nullif(btrim(coalesce(planned.lot_no, '')), '') is not null then
    select coalesce(sum(delta), 0)
      into available_qty
      from (
        select case
          when movement_type in ('inbound', 'return')
            and coalesce(nullif(to_location, ''), '창고') ilike '%창고%'
            then quantity
          when movement_type in ('outbound', 'transfer', 'repair')
            and coalesce(nullif(from_location, ''), '창고') ilike '%창고%'
            then -quantity
          when movement_type in ('transfer', 'repair')
            and coalesce(nullif(to_location, ''), '') ilike '%창고%'
            then quantity
          when movement_type = 'adjust'
            and nullif(from_location, '') is not null
            and nullif(to_location, '') is null
            then -quantity
          when movement_type = 'adjust'
            and coalesce(nullif(to_location, ''), '창고') ilike '%창고%'
            then quantity
          else 0
        end as delta
          from public.hardware_movements
         where item_id = planned.item_id
           and id <> planned.id
           and voided_at is null
           and lot_no = planned.lot_no
      ) balance;

    if coalesce(available_qty, 0) < effective_qty then
      raise exception '% % lot 재고가 부족합니다. 요청 %대, 가능 %대입니다.',
        planned.product_name, planned.lot_no, effective_qty, coalesce(available_qty, 0);
    end if;

    allocation_index := 1;
    actual_ref := case
      when original_ref is null then null
      when previous_from_same_planned = 0 then original_ref
      else original_ref || ':fulfillment:' || planned.id::text || ':' || (previous_from_same_planned + allocation_index)::text
    end;

    insert into public.hardware_movements (
      item_id, product_name, movement_type, quantity, occurred_at, from_location, to_location,
      owner, status, reference_no, memo, serials, lot_no, unit_price, amount_usd, amount_cny,
      storage_location, importer, source, raw, created_by, converted_from_movement_id
    )
    values (
      planned.item_id, planned.product_name, 'outbound', effective_qty, coalesce(occurred_on, current_date),
      planned.from_location, planned.to_location, planned.owner, '출고', actual_ref,
      concat_ws(E'\n', planned.memo, '배송 예정에서 실제 출고로 전환'), planned.serials, planned.lot_no,
      planned.unit_price,
      case when planned.amount_usd is null then null else round((planned.amount_usd * effective_qty::numeric / planned.quantity)::numeric, 2) end,
      case when planned.amount_cny is null then null else round((planned.amount_cny * effective_qty::numeric / planned.quantity)::numeric, 2) end,
      planned.storage_location, planned.importer, 'admin_manual',
      coalesce(planned.raw, '{}'::jsonb) || jsonb_build_object(
        'workflow', coalesce(planned.raw -> 'workflow', '{}'::jsonb) || jsonb_build_object(
          'convertedFromMovementId', planned.id,
          'convertedAt', converted_at,
          'convertedBy', nullif(btrim(coalesce(actor, '')), ''),
          'confirmedQuantity', effective_qty,
          'plannedQuantity', planned.quantity
        )
      ),
      nullif(btrim(coalesce(actor, '')), ''), planned.id
    )
    returning * into first_created;

    remaining_qty := 0;
  else
    for lot_row in
      with lot_movements as (
        select
          lot_no,
          min(coalesce(occurred_at, created_at::date)) as first_seen,
          sum(case
            when movement_type in ('inbound', 'return')
              and coalesce(nullif(to_location, ''), '창고') ilike '%창고%'
              then quantity
            when movement_type in ('outbound', 'transfer', 'repair')
              and coalesce(nullif(from_location, ''), '창고') ilike '%창고%'
              then -quantity
            when movement_type in ('transfer', 'repair')
              and coalesce(nullif(to_location, ''), '') ilike '%창고%'
              then quantity
            when movement_type = 'adjust'
              and nullif(from_location, '') is not null
              and nullif(to_location, '') is null
              then -quantity
            when movement_type = 'adjust'
              and coalesce(nullif(to_location, ''), '창고') ilike '%창고%'
              then quantity
            else 0
          end) as quantity
          from public.hardware_movements
         where item_id = planned.item_id
           and id <> planned.id
           and voided_at is null
           and nullif(btrim(coalesce(lot_no, '')), '') is not null
         group by lot_no
      )
      select lot_no, quantity
        from lot_movements
       where quantity > 0
       order by
         case
           when lot_no ilike 'FY%' then 0
           when lot_no ~* '^H[0-9]+$' then substring(lot_no from '[0-9]+')::int
           else 999999
         end,
         first_seen,
         lot_no
    loop
      exit when remaining_qty <= 0;

      allocation_qty := least(remaining_qty, lot_row.quantity::int);
      allocation_index := allocation_index + 1;
      actual_ref := case
        when original_ref is null then null
        when previous_from_same_planned = 0 and allocation_index = 1 then original_ref
        else original_ref || ':fulfillment:' || planned.id::text || ':' || (previous_from_same_planned + allocation_index)::text
      end;

      insert into public.hardware_movements (
        item_id, product_name, movement_type, quantity, occurred_at, from_location, to_location,
        owner, status, reference_no, memo, serials, lot_no, unit_price, amount_usd, amount_cny,
        storage_location, importer, source, raw, created_by, converted_from_movement_id
      )
      values (
        planned.item_id, planned.product_name, 'outbound', allocation_qty, coalesce(occurred_on, current_date),
        planned.from_location, planned.to_location, planned.owner, '출고', actual_ref,
        concat_ws(E'\n', planned.memo, '배송 예정에서 실제 출고로 전환'), planned.serials, lot_row.lot_no,
        planned.unit_price,
        case when planned.amount_usd is null then null else round((planned.amount_usd * allocation_qty::numeric / planned.quantity)::numeric, 2) end,
        case when planned.amount_cny is null then null else round((planned.amount_cny * allocation_qty::numeric / planned.quantity)::numeric, 2) end,
        planned.storage_location, planned.importer, 'admin_manual',
        coalesce(planned.raw, '{}'::jsonb) || jsonb_build_object(
          'workflow', coalesce(planned.raw -> 'workflow', '{}'::jsonb) || jsonb_build_object(
            'convertedFromMovementId', planned.id,
            'convertedAt', converted_at,
            'convertedBy', nullif(btrim(coalesce(actor, '')), ''),
            'confirmedQuantity', effective_qty,
            'plannedQuantity', planned.quantity
          ),
          'autoLot', jsonb_build_object(
            'strategy', 'fifo',
            'lotNo', lot_row.lot_no,
            'allocatedQuantity', allocation_qty,
            'requestedQuantity', effective_qty,
            'splitCount', null
          )
        ),
        nullif(btrim(coalesce(actor, '')), ''), planned.id
      )
      returning * into created;

      if first_created.id is null then
        first_created := created;
      end if;
      remaining_qty := remaining_qty - allocation_qty;
    end loop;
  end if;

  if remaining_qty > 0 then
    raise exception '% lot 재고가 부족합니다. 요청 %대, 자동 배정 가능 %대입니다.',
      planned.product_name, effective_qty, effective_qty - remaining_qty;
  end if;

  if effective_qty >= planned.quantity then
    update public.hardware_movements
       set voided_at = converted_at,
           voided_by = nullif(btrim(coalesce(actor, '')), ''),
           void_reason = '배송 예정 출고 완료',
           converted_to_movement_id = first_created.id
     where id = planned.id;
  else
    update public.hardware_movements
       set quantity = planned.quantity - effective_qty,
           raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
             'human_locked_at', converted_at,
             'human_locked_by', nullif(btrim(coalesce(actor, '')), '')
           )
     where id = planned.id;
  end if;

  return first_created;
end;
$$;

revoke execute on function public.confirm_hardware_planned_movement_v2(uuid, text, date, int)
  from public, anon, authenticated;
grant execute on function public.confirm_hardware_planned_movement_v2(uuid, text, date, int)
  to service_role;
