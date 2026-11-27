do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'hardware_movements_mcp_idempotency_uidx') then
    raise exception 'FAIL 중복 한 줄을 무효 처리하고 다시 적용했는데 색인이 없다';
  end if;
  raise notice 'ok  중복을 무효 처리하고 다시 적용하면 색인을 만든다';
end $$;
