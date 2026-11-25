-- 색인을 빈 표에 만든 뒤: MCP 로 등록한 배송 예정을 어드민이 확정할 수 있어야 하고(반박 검토 막는 결함), 같은 키 동시 두 번은 막혀야 한다.
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'hardware_movements_mcp_idempotency_uidx') then
    raise exception 'FAIL 색인이 없다';
  end if;
  raise notice 'ok  색인이 만들어졌다';
end $$;

-- 1. 로트 없이 전량 확정(운영 lot_no 는 전부 NULL) — 출고 행이 예정 행의 raw.mcp 를 그대로 물려받는다
do $$
declare plan_id uuid; created public.hardware_movements;
begin
  plan_id := public.test_mcp_plan('bot-a', 'h1', 'ORD-1', 2);
  created := public.confirm_hardware_planned_movement_v3(plan_id, '관리자', null, null, '[]'::jsonb);
  if created.raw->'mcp'->>'idempotency_key_hash' <> 'h1' or created.reference_no <> 'ORD-1' or created.lot_no is not null then
    raise exception 'FAIL 시나리오 전제가 다르다(출고 행이 같은 키를 물려받아야 한다)';
  end if;
  if not exists (select 1 from public.hardware_movements where id = plan_id and voided_at is not null and converted_to_movement_id = created.id) then
    raise exception 'FAIL 예정 행이 소진되지 않았다';
  end if;
  raise notice 'ok  로트 없는 MCP 배송 예정 전량 확정';
end $$;

-- 2. 부분 확정 두 번(첫 번째는 원래 참조번호, 두 번째는 :fulfillment: 참조번호)
do $$
declare plan_id uuid;
begin
  plan_id := public.test_mcp_plan('bot-a', 'h2', 'ORD-2', 3);
  perform public.confirm_hardware_planned_movement_v3(plan_id, '관리자', null, 1, '[]'::jsonb);
  perform public.confirm_hardware_planned_movement_v3(plan_id, '관리자', null, null, '[]'::jsonb);
  if (select count(*) from public.hardware_movements where converted_from_movement_id = plan_id) <> 2 then
    raise exception 'FAIL 부분 확정 출고 행이 두 줄이 아니다';
  end if;
  raise notice 'ok  MCP 배송 예정 부분 확정 두 번';
end $$;

-- 3. 참조번호 없는 예정 + 로트 분할 배정
do $$
declare plan_id uuid;
begin
  plan_id := public.test_mcp_plan('bot-a', 'h3', null, 2);
  perform public.confirm_hardware_planned_movement_v3(plan_id, '관리자', null, null,
    '[{"lot_no":"L-1","quantity":1},{"lot_no":"L-2","quantity":1}]'::jsonb);
  raise notice 'ok  참조번호 없는 MCP 예정 로트 분할 확정';
end $$;

-- 4. 같은 키 동시 두 번째 등록은 23505
do $$
begin
  perform public.test_mcp_plan('bot-b', 'h4', 'ORD-4', 1);
  begin
    perform public.test_mcp_plan('bot-b', 'h4', 'ORD-4', 1);
    raise exception 'FAIL 같은 키 두 번째 등록이 들어갔다';
  exception when unique_violation then
    raise notice 'ok  같은 키 두 번째 등록은 23505';
  end;
end $$;

-- 5. 한 요청의 물류번호별 분할 행은 서로 부딪히지 않는다
do $$
begin
  perform public.test_mcp_plan('bot-c', 'h5', 'ORD-5', 1, 'L-1');
  perform public.test_mcp_plan('bot-c', 'h5', 'ORD-5', 1, 'L-2');
  raise notice 'ok  같은 요청의 로트별 분할 행';
end $$;

-- 6. 호출자가 다르면 같은 해시여도 따로다
do $$
begin
  perform public.test_mcp_plan('bot-d', 'h4', 'ORD-4', 1);
  raise notice 'ok  호출자가 다르면 따로';
end $$;
