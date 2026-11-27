do $$ begin
  if exists (select 1 from pg_indexes where indexname = 'hardware_movements_mcp_idempotency_uidx') then
    raise exception 'FAIL 진짜 중복이 있는데 색인을 만들었다';
  end if;
  raise notice 'ok  진짜 중복이 있으면 색인을 만들지 않는다';
end $$;
-- 머리 주석의 안내대로 한 줄을 무효 처리한다(어드민 무효 처리와 같은 칸)
update public.hardware_movements
   set voided_at = now(), voided_by = '관리자', void_reason = '중복 등록'
 where id = (select id from public.hardware_movements where raw->'mcp'->>'idempotency_key_hash' = 'dup' order by created_at desc, id limit 1);
