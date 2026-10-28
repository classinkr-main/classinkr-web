-- 하드웨어 재고관리 프로세스 정의서(2026-10-27) 반영 — 기반 칸.
-- docs/active/hardware-inventory-process-gap-2026-10-28.md §5·§6(구현 계약).
--
-- 칸만 더한다(전부 NULL 허용 또는 기본값) — 기존 행·시트 가져오기 RPC·확정 RPC 동작은 그대로다.
-- 새 규칙(물류번호 직접 선택·초과 차단, 본인 건 수정, 입고관리 권한 등)은 앱이 이 칸을 보고 강제한다.
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS) — 재실행은 무해하다.

-- ── hardware_movements ────────────────────────────────────────────────
ALTER TABLE public.hardware_movements
  -- 출고 유형: sales=세일즈, promotion=프로모션, as=A/S, sample=샘플. 출고·회수에만 쓴다.
  ADD COLUMN IF NOT EXISTS outbound_type TEXT,
  -- 입고 무상 여부(정의서 "무상 여부" 필수). 입고에만 쓴다.
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN,
  -- 회수(movement_type='return')가 가리키는 원 출고 건.
  ADD COLUMN IF NOT EXISTS return_of_movement_id UUID,
  -- 출고 클라이언트 — CRM 고객(Portal V2 customers). to_location 에는 표시 이름을 계속 싣는다.
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  -- 담당자(로그인 계정). "본인 건만 수정"의 기준이다. owner(표시 이름)는 그대로 둔다.
  ADD COLUMN IF NOT EXISTS owner_user_id UUID,
  -- 기록을 만든 계정. created_by(이름 문자열)는 그대로 둔다.
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID,
  -- 샘플 출고의 반납 예정일(정의서: 샘플 출고 시 반납 예정일 필수).
  ADD COLUMN IF NOT EXISTS expected_return_at DATE;

ALTER TABLE public.hardware_movements
  DROP CONSTRAINT IF EXISTS hardware_movements_outbound_type_check;
ALTER TABLE public.hardware_movements
  ADD CONSTRAINT hardware_movements_outbound_type_check CHECK (
    outbound_type IS NULL OR outbound_type IN ('sales', 'promotion', 'as', 'sample')
  );

ALTER TABLE public.hardware_movements
  DROP CONSTRAINT IF EXISTS hardware_movements_return_of_check;
ALTER TABLE public.hardware_movements
  ADD CONSTRAINT hardware_movements_return_of_check CHECK (
    return_of_movement_id IS NULL OR movement_type = 'return'
  );

ALTER TABLE public.hardware_movements
  DROP CONSTRAINT IF EXISTS hardware_movements_return_of_fkey;
ALTER TABLE public.hardware_movements
  ADD CONSTRAINT hardware_movements_return_of_fkey
  FOREIGN KEY (return_of_movement_id) REFERENCES public.hardware_movements(id) ON DELETE RESTRICT;

ALTER TABLE public.hardware_movements
  DROP CONSTRAINT IF EXISTS hardware_movements_customer_fkey;
ALTER TABLE public.hardware_movements
  ADD CONSTRAINT hardware_movements_customer_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hardware_movements_return_of_idx
  ON public.hardware_movements (return_of_movement_id)
  WHERE return_of_movement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hardware_movements_owner_user_idx
  ON public.hardware_movements (owner_user_id)
  WHERE owner_user_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS hardware_movements_customer_idx
  ON public.hardware_movements (customer_id)
  WHERE customer_id IS NOT NULL;

-- ── hardware_items ────────────────────────────────────────────────────
ALTER TABLE public.hardware_items
  -- 물류번호로 관리하는 품목인가. 액세서리·터치펜은 false(수량만).
  ADD COLUMN IF NOT EXISTS lot_tracked BOOLEAN NOT NULL DEFAULT TRUE,
  -- 판매대시보드 묶음: board=전자칠판, camera=카메라, stand=스탠드, accessory=액세서리, pen=터치펜.
  ADD COLUMN IF NOT EXISTS report_group TEXT,
  -- 묶음 안 표시 순서(작을수록 위).
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

ALTER TABLE public.hardware_items
  DROP CONSTRAINT IF EXISTS hardware_items_report_group_check;
ALTER TABLE public.hardware_items
  ADD CONSTRAINT hardware_items_report_group_check CHECK (
    report_group IS NULL OR report_group IN ('board', 'camera', 'stand', 'accessory', 'pen')
  );

-- 정의서의 관리 품목 — 없는 이름만 만든다(있는 품목·다른 표기는 건드리지 않는다).
INSERT INTO public.hardware_items (name, category, lot_tracked, report_group, sort_order)
VALUES
  ('110" IFP', '전자칠판', TRUE, 'board', 10),
  ('86" IFP', '전자칠판', TRUE, 'board', 20),
  ('75" IFP', '전자칠판', TRUE, 'board', 30),
  ('65" IFP', '전자칠판', TRUE, 'board', 40),
  ('T1', '카메라', TRUE, 'camera', 10),
  ('T1(promoted)', '카메라', TRUE, 'camera', 20),
  ('S1', '카메라', TRUE, 'camera', 30),
  ('STD1', '스탠드', TRUE, 'stand', 10),
  ('STD1(promoted)', '스탠드', TRUE, 'stand', 20),
  ('OPS', '액세서리', FALSE, 'accessory', 10),
  ('카메라 브라켓', '액세서리', FALSE, 'accessory', 20),
  ('POE', '액세서리', FALSE, 'accessory', 30),
  ('전원 케이블(3m)', '액세서리', FALSE, 'accessory', 40),
  ('전원 케이블(1m)', '액세서리', FALSE, 'accessory', 50),
  ('A1', '터치펜', FALSE, 'pen', 10),
  ('D2', '터치펜', FALSE, 'pen', 20),
  ('D2T', '터치펜', FALSE, 'pen', 30),
  ('B1', '터치펜', FALSE, 'pen', 40)
ON CONFLICT (name) DO NOTHING;

-- 이미 있던 품목에 묶음·물류번호 관리 여부를 붙인다(정확한 이름만 — 다른 표기는 화면에서 사람이 고른다).
UPDATE public.hardware_items AS item
SET
  report_group = seed.report_group,
  sort_order = COALESCE(item.sort_order, seed.sort_order),
  lot_tracked = seed.lot_tracked
FROM (
  VALUES
    ('110" IFP', 'board', 10, TRUE),
    ('86" IFP', 'board', 20, TRUE),
    ('75" IFP', 'board', 30, TRUE),
    ('65" IFP', 'board', 40, TRUE),
    ('T1', 'camera', 10, TRUE),
    ('T1(promoted)', 'camera', 20, TRUE),
    ('S1', 'camera', 30, TRUE),
    ('STD1', 'stand', 10, TRUE),
    ('STD1(promoted)', 'stand', 20, TRUE),
    ('OPS', 'accessory', 10, FALSE),
    ('카메라 브라켓', 'accessory', 20, FALSE),
    ('POE', 'accessory', 30, FALSE),
    ('전원 케이블(3m)', 'accessory', 40, FALSE),
    ('전원 케이블(1m)', 'accessory', 50, FALSE),
    ('A1', 'pen', 10, FALSE),
    ('D2', 'pen', 20, FALSE),
    ('D2T', 'pen', 30, FALSE),
    ('B1', 'pen', 40, FALSE)
) AS seed(name, report_group, sort_order, lot_tracked)
WHERE item.name = seed.name AND item.report_group IS NULL;

-- ── 배송 예정 확정 v4 ─────────────────────────────────────────────────────────────
-- v3 는 확정 행을 만들 때 정해진 칸만 옮긴다 — 위에서 더한 유형·고객·담당자·반납 예정일이 확정 행에서
-- 사라지고, 진행 상태가 '출고'로 적힌다. v4 는 같은 트랜잭션 안에서 v3 를 부르고, 이번에 만든 확정 행에
-- 그 칸을 옮겨 적은 뒤 진행 상태를 '설치 완료'(정의서 고정값)로 바꾼다. 로트 배정·검증·잠금은 v3 그대로다.
-- 이번 호출이 만든 행 = converted_from_movement_id 가 예정 행이고 created_at = now()(트랜잭션 시작 시각)인 행.
create or replace function public.confirm_hardware_planned_movement_v4(
  planned_id uuid,
  actor text,
  occurred_on date default null,
  confirm_qty int default null,
  lot_allocations jsonb default '[]'::jsonb,
  actor_user_id uuid default null,
  confirmed_status text default '설치 완료'
)
returns public.hardware_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  planned public.hardware_movements;
  first_created public.hardware_movements;
begin
  select * into planned from public.hardware_movements where id = planned_id for update;

  first_created := public.confirm_hardware_planned_movement_v3(
    planned_id, actor, occurred_on, confirm_qty, lot_allocations
  );

  update public.hardware_movements m
     set outbound_type = planned.outbound_type,
         customer_id = planned.customer_id,
         owner_user_id = planned.owner_user_id,
         created_by_user_id = coalesce(actor_user_id, planned.created_by_user_id),
         expected_return_at = planned.expected_return_at,
         status = coalesce(nullif(btrim(coalesce(confirmed_status, '')), ''), m.status)
   where m.converted_from_movement_id = planned_id
     and m.created_at = now()
     and m.voided_at is null;

  select * into first_created from public.hardware_movements where id = first_created.id;
  return first_created;
end;
$$;

comment on function public.confirm_hardware_planned_movement_v4(uuid, text, date, int, jsonb, uuid, text) is
  '배송 예정 확정 v4 — v3 를 부르고 유형·고객·담당자·반납 예정일을 확정 행에 옮긴 뒤 진행 상태를 설치 완료로 적는다.';

revoke execute on function public.confirm_hardware_planned_movement_v4(uuid, text, date, int, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_hardware_planned_movement_v4(uuid, text, date, int, jsonb, uuid, text)
  to service_role;
