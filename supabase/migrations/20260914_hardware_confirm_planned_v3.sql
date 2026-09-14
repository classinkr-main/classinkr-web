-- 하드웨어 배송 예정 확정 v3 — 로트 배정은 앱이 계산해서 넘기고, 로트가 모자라도 출고를 막지 않는다.
--
-- ── 왜 필요한가 (2026-09-14 운영 DB pxbrsbovoobowpfarxmn 실측) ─────────────────────────
-- v2(20260702_hardware_fifo_confirm_v2.sql)는 FIFO 로트 잔량을 SQL 안에서 계산하는데,
-- 로트를 **lot_no 칸에서만** 찾는다. 그런데 운영 원장 385건은 전부 시트 임포트이고 lot_no 가
-- 전부 NULL 이다 — 로트는 reference_no(물류No)에만 있다. 그래서 v2 의 로트 CTE 는 0행이 되고,
-- 로트 미지정 예정 출고는 어느 것도 확정되지 않는다("lot 재고가 부족합니다. … 자동 배정 가능
-- 0대"). 실측 당시 대기 중인 예정 출고 33건 59대가 전부 이 상태였다.
--
-- 게다가 v2 의 잔량 규칙은 앱의 규칙(lib/repositories/hardware-inventory.ts 의
-- resolveHardwareLotBalances)과 다르다 — 창고 위치 기준 합산이고, 초과 출고를 옛 로트로
-- 흡수하지 않는다. 같은 원장에서 화면이 보여주는 로트와 확정 때 찍히는 로트가 갈라진다.
--
-- ── 이 함수가 바꾸는 계약 ────────────────────────────────────────────────────────────
--  1. **로트 배정은 앱이 계산해 lot_allocations 로 넘긴다.** 규칙을 SQL 에 두 번째로 구현하지
--     않는다 — 두 곳에 두면 또 갈라진다. 이 함수는 넘어온 배정을 검증하고 원자적으로 기록만 한다.
--  2. **로트가 모자라도 막지 않는다(운영자 결정 2026-09-14).** 앱은 해석 가능한 만큼 FIFO 로
--     배정하고 나머지를 lot_no = NULL 한 줄로 넘긴다. 이 함수는 lot_no NULL 배정을 정상으로 받는다.
--  3. 검증·잠금·CRM 중복 차단·예정 행 소진/차감은 v2 와 **동일**하다(아래 본문은 v2 를 옮겨 왔다).
--
-- v2 와 레거시 함수는 롤백 호환을 위해 그대로 둔다. 앱은 v3 → v2 → 레거시 순으로 시도한다.
-- 이름이 달라 PostgREST 오버로드 모호성(같은 이름·겹치는 인자명)은 생기지 않는다.

create or replace function public.confirm_hardware_planned_movement_v3(
  planned_id uuid,
  actor text,
  occurred_on date default null,
  confirm_qty int default null,
  lot_allocations jsonb default '[]'::jsonb
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
  allocation_qty int;
  allocation_lot text;
  allocation_index int := 0;
  allocation_count int;
  allocation_total int;
  previous_from_same_planned int := 0;
  original_ref text;
  actual_ref text;
  converted_at timestamptz := now();
  normalized jsonb;
  allocation record;
begin
  -- ── v2 와 동일한 검증 ────────────────────────────────────────────────────────────
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

  -- ── 배정 검증 (v3) ──────────────────────────────────────────────────────────────
  -- 배정이 비어 오면 로트 미지정 한 줄로 확정한다 — 로트 기록이 전혀 없는 품목(OPS·케이블 등)도
  -- 출고를 기록할 수 있어야 한다.
  if lot_allocations is null
     or jsonb_typeof(lot_allocations) <> 'array'
     or jsonb_array_length(lot_allocations) = 0 then
    normalized := jsonb_build_array(jsonb_build_object('lot_no', null, 'quantity', effective_qty));
  else
    normalized := lot_allocations;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(normalized) elem
     where jsonb_typeof(elem) <> 'object'
        or coalesce(elem ->> 'quantity', '') !~ '^[0-9]+$'
        or (elem ->> 'quantity')::int <= 0
  ) then
    raise exception '로트 배정 수량이 올바르지 않습니다.';
  end if;

  select count(*), coalesce(sum((elem ->> 'quantity')::int), 0)
    into allocation_count, allocation_total
    from jsonb_array_elements(normalized) elem;

  if allocation_total <> effective_qty then
    raise exception '로트 배정 합계(%대)가 확정 수량(%대)과 다릅니다.', allocation_total, effective_qty;
  end if;

  -- ── 배정별 실제 출고 기록 ─────────────────────────────────────────────────────────
  for allocation in
    select elem, ordinality
      from jsonb_array_elements(normalized) with ordinality as t(elem, ordinality)
     order by ordinality
  loop
    allocation_qty := (allocation.elem ->> 'quantity')::int;
    allocation_lot := nullif(btrim(coalesce(allocation.elem ->> 'lot_no', '')), '');
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
      concat_ws(E'\n', planned.memo, '배송 예정에서 실제 출고로 전환'), planned.serials, allocation_lot,
      planned.unit_price,
      case when planned.amount_usd is null then null else round((planned.amount_usd * allocation_qty::numeric / planned.quantity)::numeric, 2) end,
      case when planned.amount_cny is null then null else round((planned.amount_cny * allocation_qty::numeric / planned.quantity)::numeric, 2) end,
      planned.storage_location, planned.importer, 'admin_manual',
      coalesce(planned.raw, '{}'::jsonb)
        || jsonb_build_object(
          'workflow', coalesce(planned.raw -> 'workflow', '{}'::jsonb) || jsonb_build_object(
            'convertedFromMovementId', planned.id,
            'convertedAt', converted_at,
            'convertedBy', nullif(btrim(coalesce(actor, '')), ''),
            'confirmedQuantity', effective_qty,
            'plannedQuantity', planned.quantity
          )
        )
        -- 예정 행에 로트가 지정돼 있었으면 운영자 지정 로트다 — 자동 배정 표식을 달지 않는다(v2 와 동일).
        || case
          when nullif(btrim(coalesce(planned.lot_no, '')), '') is not null then '{}'::jsonb
          else jsonb_build_object(
            'autoLot', jsonb_build_object(
              'strategy', 'fifo',
              'source', 'app',
              'lotNo', allocation_lot,
              'unlotted', allocation_lot is null,
              'allocatedQuantity', allocation_qty,
              'requestedQuantity', effective_qty,
              'splitCount', allocation_count
            )
          )
        end,
      nullif(btrim(coalesce(actor, '')), ''), planned.id
    )
    returning * into created;

    if first_created.id is null then
      first_created := created;
    end if;
  end loop;

  -- ── 예정 행 소진/차감 (v2 와 동일) ─────────────────────────────────────────────────
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

comment on function public.confirm_hardware_planned_movement_v3(uuid, text, date, int, jsonb) is
  '배송 예정 출고 확정 v3. 로트 배정은 앱(resolveHardwareLotBalances)이 계산해 lot_allocations 로 넘기고, '
  '이 함수는 검증 후 원자적으로 기록한다. lot_no NULL 배정을 허용한다 — 로트가 모자라도 출고를 막지 않는다.';

revoke execute on function public.confirm_hardware_planned_movement_v3(uuid, text, date, int, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_hardware_planned_movement_v3(uuid, text, date, int, jsonb)
  to service_role;
