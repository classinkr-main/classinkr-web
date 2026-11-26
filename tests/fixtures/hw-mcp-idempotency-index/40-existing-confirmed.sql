-- 마이그레이션 전부터 확정된 MCP 예정(예정 행 + 출고 행)이 있는 표 — 정상 기록이라 색인을 막지 않아야 한다(반박 검토 주요 결함).
do $$
declare plan_id uuid;
begin
  plan_id := public.test_mcp_plan('bot-a', 'h1', 'ORD-1', 1);
  perform public.confirm_hardware_planned_movement_v3(plan_id, '관리자', null, null, '[]'::jsonb);
  plan_id := public.test_mcp_plan('bot-a', 'h2', 'ORD-2', 3);
  perform public.confirm_hardware_planned_movement_v3(plan_id, '관리자', null, 1, '[]'::jsonb);
end $$;
