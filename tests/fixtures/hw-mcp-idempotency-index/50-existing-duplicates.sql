-- 진짜 중복(같은 키 예정 행 두 줄, 조회 후 쓰기 경합으로 생긴 것) — 색인을 만들지 않고 WARNING 만 남긴다.
select public.test_mcp_plan('bot-a', 'dup', 'ORD-9', 1);
select public.test_mcp_plan('bot-a', 'dup', 'ORD-9', 1);
