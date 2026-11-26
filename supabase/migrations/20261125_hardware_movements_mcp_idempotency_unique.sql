-- 홈페이지 MCP 의 HW 배송 예정(hw_plan_movement) 같은 키 동시 두 번을 한 번으로 만든다(백엔드 점검 R20·B7).
--
-- 왜: 같은 idempotency_key 가 서버리스 인스턴스 두 곳에 동시에 오면 둘 다 "조회 → 없음 → insert" 로 가서 같은 출고가
-- 두 번 등록됐다(조회 후 쓰기). 키 해시는 hardware_movements.raw.mcp 에 이미 실려 있다(lib/ops-tools/defs/hardware.ts).
-- 이 색인이 같은 (호출자, 키 해시) 두 번째 insert 를 23505 로 막고, 코드는 그때 먼저 만든 행을 찾아 "이미 처리됨, 처음 결과"로
-- 돌려준다(replayed). 한 번의 호출이 물류번호(lot)별로 여러 행을 만들 수 있어(FIFO 분할) 행마다 다른 물류번호·참조번호를 키에 더했다 —
-- 같은 요청의 분할 행은 서로 부딪히지 않고, 같은 요청의 두 번째 시도는 첫 행부터 부딪힌다. insert 한 문장이라 부딪히면 통째로 실패한다.
--
-- 색인에 넣는 행은 "MCP 가 직접 만든 살아 있는 배송 예정 행"뿐이다:
--   - converted_from_movement_id is null — 어드민 출고 확정(confirm_hardware_planned_movement_v3, v4 도 v3 를 부른다)이 만드는
--     출고 행은 예정 행의 raw 를 그대로 복사해 raw.mcp(호출자·키 해시)를 물려받는다. 첫 배정의 참조번호는 원래 번호 그대로이고
--     운영 lot_no 는 비어 있으므로 예정 행과 키가 같아진다 — 이 조건이 없으면 MCP 로 등록한 예정은 하나도 확정되지 않는다
--     (반박 검토 2026-11-25, 로컬 재현: tests/fixtures/hw-mcp-idempotency-index/run-local.sh).
--   - voided_at is null — 무효 처리된 행은 키를 붙잡지 않는다. 그래서 아래 "진짜 중복"을 어드민에서 한 줄 무효 처리하면 다시 적용할 수 있다.
--     무효 처리된 키로 다시 오는 요청은 코드의 사전 조회(findExisting, 무효 행도 돌려준다)가 처음 결과로 돌려준다.
--
-- 이 마이그레이션 전에도 코드는 깨지지 않는다(색인이 없으면 지금처럼 조회 후 판단 — 동시 두 건이면 드물게 두 번 등록).
-- 색인에 닿는 행은 raw.mcp.idempotency_key_hash 가 있는 MCP 등록 예정 행뿐이다(관리자 화면·시트 가져오기·확정 출고 행은 영향 없음).
--
-- 잠금: 이 저장소의 마이그레이션은 트랜잭션 안에서 돌아 CREATE INDEX CONCURRENTLY 를 쓰지 않는다(20260914_leads_phone_key.sql 과 같음).
-- 색인을 만드는 동안 hardware_movements 쓰기가 막힌다 — 표 크기만큼 걸리므로 유입이 적은 때 적용한다. 쓰기를 막을 수 없으면
-- 트랜잭션 밖(SQL Editor 에서 이 파일 대신 단독 문장)으로 같은 정의에 CONCURRENTLY 를 붙여 먼저 만들어 두면 아래는 건너뛴다.
-- 롤백: supabase/rollbacks/20261125_hardware_movements_mcp_idempotency_unique.rollback.sql
--
-- 먼저 확인할 것: 같은 키로 두 번 등록된 살아 있는 MCP 예정 행(조회 후 쓰기 경합으로 생긴 진짜 중복)이 있으면 아래 검사는 색인을
-- 만들지 않고 WARNING 만 남긴다(조용히 지우지 않고, 같은 묶음의 다른 마이그레이션도 멈추지 않는다 — 코드는 색인 없이도 깨지지 않는다).
-- 확정된 예정(예정 행 + 출고 행)은 정상 기록이라 여기에 나오지 않는다 — 출고 행(converted_from_movement_id 있음)은 무효 처리하지 않는다.
--   select raw->'mcp'->>'caller' as caller, raw->'mcp'->>'idempotency_key_hash' as key_hash,
--          coalesce(lot_no, '') as lot_no, coalesce(reference_no, '') as reference_no, count(*), array_agg(id order by created_at)
--     from public.hardware_movements
--    where raw->'mcp'->>'idempotency_key_hash' is not null
--      and converted_from_movement_id is null
--      and voided_at is null
--    group by 1, 2, 3, 4 having count(*) > 1 order by count(*) desc;
-- 정리는 재고에 닿으므로 이 파일이 하지 않는다 — 사람이 같은 주문인지 확인해 늦게 만든 예정 행만 어드민 화면에서 무효 처리한 뒤
-- 다시 적용한다(무효 행은 색인·검사에서 빠진다).

do $$
declare
  duplicate_keys integer;
begin
  select count(*) into duplicate_keys
    from (
      select 1
        from public.hardware_movements
       where raw->'mcp'->>'idempotency_key_hash' is not null
         and converted_from_movement_id is null
         and voided_at is null
       group by raw->'mcp'->>'caller', raw->'mcp'->>'idempotency_key_hash', coalesce(lot_no, ''), coalesce(reference_no, '')
      having count(*) > 1
    ) d;
  if duplicate_keys > 0 then
    raise warning 'MCP 배송 예정 중복 키 % 건 — 유니크 색인을 만들지 않았다. 이 파일 머리 주석의 확인 쿼리로 늦게 만든 예정 행을 어드민에서 무효 처리한 뒤 다시 적용하세요(확정 출고 행은 건드리지 않는다).', duplicate_keys;
  else
    create unique index if not exists hardware_movements_mcp_idempotency_uidx
      on public.hardware_movements (
        (raw->'mcp'->>'caller'),
        (raw->'mcp'->>'idempotency_key_hash'),
        (coalesce(lot_no, '')),
        (coalesce(reference_no, ''))
      )
      where raw->'mcp'->>'idempotency_key_hash' is not null
        and converted_from_movement_id is null
        and voided_at is null;
  end if;
end $$;
