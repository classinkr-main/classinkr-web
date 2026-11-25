do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'hardware_movements_mcp_idempotency_uidx') then
    raise exception 'FAIL 확정된 MCP 예정이 있다고 색인을 만들지 않았다';
  end if;
  raise notice 'ok  확정된 MCP 예정이 있어도 색인을 만든다';
end $$;
