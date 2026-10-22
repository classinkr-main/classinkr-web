-- 오더(2026-10-22) — 견적 승인 → (하드웨어면 이왕찬·지사장 승인) → 오더번호 발급 + 배송 예정.
-- docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-3.
--
-- 한 오더 = 고객 1곳 = 승인된 견적 1장. 품목 줄은 승인된 견적 버전에서 그대로 떠 와 lines 에 둔다
-- (deal_line_items 로 복사하지 않는다 — CRM 오더 대사가 딜 줄과 견적 줄을 둘 다 읽어 중복된다).
-- 하드웨어 줄이 있으면 pending_approval 로 시작하고, hardware.finalize 권한자가 승인하면 approved 가 되면서
-- order_no 가 발급되고 배송 예정(hardware_movements)이 만들어진다. 하드웨어 줄이 없으면 바로 approved 다.
--
-- 오더번호는 배송 예정·시트 출고 줄의 raw.order_no 에 실린다(시트 '3.출고 현황'의 오더번호 열과 같은 자리).
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS) — 재실행은 무해하다.

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 승인 때 발급(예: ORD-2610-014). 승인 전·반려는 NULL.
  order_no TEXT,
  status TEXT NOT NULL,
  needs_hardware_approval BOOLEAN NOT NULL,
  quote_document_id UUID NOT NULL REFERENCES public.quote_documents(id) ON DELETE RESTRICT,
  quote_version_id UUID REFERENCES public.quote_document_versions(id) ON DELETE SET NULL,
  quote_number TEXT,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  -- [{ lineNumber, itemType, itemCode, itemName, quantity, unitPrice, lineSupplyAmount,
  --    hardwareProduct|null, hardwareQuantity|null, quoteLineRef }]
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 견적 통화 그대로(KRW). 다른 통화와 합산·환산하지 않는다.
  total_amount NUMERIC(14, 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  -- customer_link = 고객이 공유 링크에서 진행 요청, staff = 담당자가 고객 확답을 받고 승인 처리.
  accepted_via TEXT NOT NULL,
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  planned_movement_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_orders_status_check CHECK (status IN ('pending_approval', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT sales_orders_accepted_via_check CHECK (accepted_via IN ('customer_link', 'staff')),
  CONSTRAINT sales_orders_lines_check CHECK (jsonb_typeof(lines) = 'array'),
  CONSTRAINT sales_orders_customer_name_check CHECK (char_length(btrim(customer_name)) > 0),
  -- 승인된 오더에는 오더번호가 있어야 하고, 승인 대기·반려에는 없어야 한다. 취소된 오더는 번호를 그대로
  -- 남긴다 — 번호를 비우면 같은 번호가 다른 오더에 다시 발급돼, 시트에 적힌 옛 번호가 엉뚱한 오더에 붙는다.
  CONSTRAINT sales_orders_order_no_state_check CHECK (
    (status = 'approved' AND order_no IS NOT NULL)
    OR (status IN ('pending_approval', 'rejected') AND order_no IS NULL)
    OR status = 'cancelled'
  )
);

-- 오더번호는 하나뿐이다.
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_order_no_uidx
  ON public.sales_orders (order_no)
  WHERE order_no IS NOT NULL;

-- 한 견적에 살아 있는 오더는 하나 — 고객이 진행 요청을 두 번 눌러도, 담당자 처리와 겹쳐도 한 건만 남는다.
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_active_quote_uidx
  ON public.sales_orders (quote_document_id)
  WHERE status IN ('pending_approval', 'approved');

CREATE INDEX IF NOT EXISTS sales_orders_status_idx
  ON public.sales_orders (status, requested_at DESC);

DROP TRIGGER IF EXISTS sales_orders_updated_at ON public.sales_orders;
CREATE TRIGGER sales_orders_updated_at
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- deny-all: 정책이 없으므로 service_role 만 읽고 쓴다. 앱은 관리자 인증을 거친 service role API 로만 접근한다.
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_orders FROM anon, authenticated;
GRANT ALL ON TABLE public.sales_orders TO service_role;

-- 원장에서 오더번호로 찾기(시트 출고 줄·앱이 만든 배송 예정 모두 raw.order_no).
-- 부분 인덱스 조건은 IS NOT NULL 이어야 한다 — 앱 조회(raw->>'order_no' = / IN)에서 플래너가 이 조건을
-- 추론할 수 있다. `raw ? 'order_no'` 로 두면 추론하지 못해 인덱스를 쓰지 않는다(로컬 PG16 EXPLAIN 확인).
CREATE INDEX IF NOT EXISTS hardware_movements_order_no_idx
  ON public.hardware_movements ((raw->>'order_no'))
  WHERE (raw->>'order_no') IS NOT NULL;
