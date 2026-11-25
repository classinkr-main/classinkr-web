-- 홈페이지 MCP 의 HW 배송 예정(hw_plan_movement) 같은 키 동시 두 번을 한 번으로 만든다(백엔드 점검 R20·B7).
--
-- 왜: 같은 idempotency_key 가 서버리스 인스턴스 두 곳에 동시에 오면 둘 다 "조회 → 없음 → insert" 로 가서 같은 출고가
-- 두 번 등록됐다(조회 후 쓰기). 키 해시는 hardware_movements.raw.mcp 에 이미 실려 있다(lib/ops-tools/defs/hardware.ts).
-- 이 색인이 같은 (호출자, 키 해시) 두 번째 insert 를 23505 로 막고, 코드는 그때 먼저 만든 행을 찾아 "이미 처리됨, 처음 결과"로
-- 돌려준다(replayed). 한 번의 호출이 물류번호(lot)별로 여러 행을 만들 수 있어(FIFO 분할) 행마다 다른 물류번호·참조번호를 키에 더했다 —
-- 같은 요청의 분할 행은 서로 부딪히지 않고, 같은 요청의 두 번째 시도는 첫 행부터 부딪힌다. insert 한 문장이라 부딪히면 통째로 실패한다.
--
-- 이 마이그레이션 전에도 코드는 깨지지 않는다(색인이 없으면 지금처럼 조회 후 판단 — 동시 두 건이면 드물게 두 번 등록).
-- 색인에 닿는 행은 raw.mcp.idempotency_key_hash 가 있는 MCP 등록 행뿐이다(관리자 화면·시트 가져오기 행은 영향 없음).
--
-- 잠금: 이 저장소의 마이그레이션은 트랜잭션 안에서 돌아 CREATE INDEX CONCURRENTLY 를 쓰지 않는다(20260914_leads_phone_key.sql 과 같음).
-- 색인을 만드는 동안 hardware_movements 쓰기가 막힌다 — 표 크기만큼 걸리므로 유입이 적은 때 적용한다. 쓰기를 막을 수 없으면
-- 트랜잭션 밖(SQL Editor 에서 이 파일 대신 단독 문장)으로 같은 정의에 CONCURRENTLY 를 붙여 먼저 만들어 두면 아래는 건너뛴다.
-- 롤백: supabase/rollbacks/20261125_hardware_movements_mcp_idempotency_unique.rollback.sql
--
-- 먼저 확인할 것: 운영에 이미 같은 키로 두 번 등록된 행이 있으면 아래 검사는 색인을 만들지 않고 WARNING 만 남긴다
-- (조용히 지우지 않고, 같은 묶음의 다른 마이그레이션도 멈추지 않는다 — 코드는 색인 없이도 깨지지 않는다).
--   select raw->'mcp'->>'caller' as caller, raw->'mcp'->>'idempotency_key_hash' as key_hash,
--          coalesce(lot_no, '') as lot_no, coalesce(reference_no, '') as reference_no, count(*), array_agg(id)
--     from public.hardware_movements
--    where raw->'mcp'->>'idempotency_key_hash' is not null
--    group by 1, 2, 3, 4 having count(*) > 1 order by count(*) desc;
-- 중복 행의 정리(무효 처리·삭제)는 재고에 닿으므로 이 파일이 하지 않는다 — 사람이 확인해 어드민 화면에서 무효 처리한 뒤 다시 적용한다.

do $$
declare
  duplicate_keys integer;
begin
  select count(*) into duplicate_keys
    from (
      select 1
        from public.hardware_movements
       where raw->'mcp'->>'idempotency_key_hash' is not null
       group by raw->'mcp'->>'caller', raw->'mcp'->>'idempotency_key_hash', coalesce(lot_no, ''), coalesce(reference_no, '')
      having count(*) > 1
    ) d;
  if duplicate_keys > 0 then
    raise warning 'MCP 배송 예정 중복 키 % 건 — 유니크 색인을 만들지 않았다. 이 파일 머리 주석의 확인 쿼리로 중복 행을 정리한 뒤 다시 적용하세요.', duplicate_keys;
  else
    create unique index if not exists hardware_movements_mcp_idempotency_uidx
      on public.hardware_movements (
        (raw->'mcp'->>'caller'),
        (raw->'mcp'->>'idempotency_key_hash'),
        (coalesce(lot_no, '')),
        (coalesce(reference_no, ''))
      )
      where raw->'mcp'->>'idempotency_key_hash' is not null;
  end if;
end $$;
