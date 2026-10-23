-- 총판 정산(2026-10-23) — 고객 견적과 함께 하드웨어 총판에게 보낼 '총판용 견적서'와 그 미수금.
--
-- 흐름: 회사가 하드웨어를 먼저 사 두고 고객에게서 결제를 한 번에 받는다. 하드웨어 물량(과 AI Suite)은
-- 총판이 회사로 다시 입금한다. 견적마다 총판 금액을 미리 정해 두고(직접 입력 또는 단가 템플릿),
-- 고객 동의 또는 설치 완료 시점에 같은 양식·다른 금액의 총판용 견적서를 발행하고 입금을 추적한다.
--
--  - distributor_price_templates : 총판 단가 템플릿(품목 코드 × 최소 수량 구간 → 총판 단가).
--  - distributor_settlements     : 견적 1장당 총판 정산 1건(설정 + 발행 스냅샷 + 미수 상태).
--  - distributor_settlement_payments : 총판 입금 기록(부분 입금 누적). paid_amount 는 앱이 합계로 다시 쓴다.
--
-- 미적용 환경: 견적 작성·공유·동의는 그대로 동작하고, 총판 정산 조회는 적용 안내를, 쓰기는 503 을 낸다
-- (lib/repositories/distributor-settlements.ts).
--
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS) — 재실행은 무해하다.

CREATE TABLE IF NOT EXISTS public.distributor_price_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- [{ itemCode, itemName, minQuantity, unitPrice }] — 같은 itemCode 는 minQuantity 가 가장 큰 구간을 쓴다.
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distributor_price_templates_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT distributor_price_templates_rules_check CHECK (
    jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) BETWEEN 1 AND 50)
);

CREATE INDEX IF NOT EXISTS distributor_price_templates_active_idx
  ON public.distributor_price_templates (updated_at DESC)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS distributor_price_templates_updated_at ON public.distributor_price_templates;
CREATE TRIGGER distributor_price_templates_updated_at
  BEFORE UPDATE ON public.distributor_price_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.distributor_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_document_id UUID NOT NULL UNIQUE REFERENCES public.quote_documents(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  -- 총판 금액을 정할 때 본 고객 견적 버전. 자동 발행 시 현재 버전과 다르면 발행하지 않고 재확인을 요청한다.
  source_version_id UUID REFERENCES public.quote_document_versions(id) ON DELETE SET NULL,
  issued_version_id UUID REFERENCES public.quote_document_versions(id) ON DELETE SET NULL,
  distributor_name TEXT NOT NULL,
  distributor_contact_name TEXT,
  distributor_email TEXT,
  distributor_phone TEXT,
  issue_trigger TEXT NOT NULL DEFAULT 'on_accept',
  auto_email BOOLEAN NOT NULL DEFAULT true,
  price_template_id UUID REFERENCES public.distributor_price_templates(id) ON DELETE SET NULL,
  -- [{ sourceLineNumber, itemCode, itemName, itemDescription, itemType, quantity, quantityUnit,
  --    customerUnitPrice, unitPrice, included }]
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  vat_included BOOLEAN NOT NULL DEFAULT true,
  subtotal_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  customer_total_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  paid_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  due_date DATE,
  issued_at TIMESTAMPTZ,
  issue_reason TEXT,
  share_token TEXT UNIQUE,
  email_status TEXT NOT NULL DEFAULT 'not_sent',
  emailed_at TIMESTAMPTZ,
  email_error TEXT,
  -- 자동 발행을 막은 이유(견적 버전 변경·금액 미입력 등). 사람이 확인 후 발행하면 비운다.
  review_required_reason TEXT,
  notes TEXT,
  cancelled_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distributor_settlements_name_check CHECK (char_length(btrim(distributor_name)) BETWEEN 1 AND 80),
  CONSTRAINT distributor_settlements_trigger_check CHECK (issue_trigger IN ('on_accept', 'on_install', 'manual')),
  CONSTRAINT distributor_settlements_status_check CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'cancelled')),
  CONSTRAINT distributor_settlements_issue_reason_check CHECK (
    issue_reason IS NULL OR issue_reason IN ('customer_accepted', 'installation_completed', 'manual')),
  CONSTRAINT distributor_settlements_email_status_check CHECK (email_status IN ('not_sent', 'sent', 'failed', 'skipped')),
  CONSTRAINT distributor_settlements_lines_check CHECK (
    jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) <= 60),
  CONSTRAINT distributor_settlements_amounts_check CHECK (
    subtotal_amount >= 0 AND vat_amount >= 0 AND total_amount >= 0 AND paid_amount >= 0),
  -- 발행된 건은 공유 토큰과 발행 시각이 반드시 있다.
  CONSTRAINT distributor_settlements_issued_check CHECK (
    status IN ('draft', 'cancelled') OR (share_token IS NOT NULL AND issued_at IS NOT NULL))
);

-- 미수금 목록: 발행됐고 아직 다 받지 못한 건을 기한순으로.
CREATE INDEX IF NOT EXISTS distributor_settlements_open_idx
  ON public.distributor_settlements (due_date NULLS LAST, issued_at)
  WHERE status IN ('issued', 'partial');
CREATE INDEX IF NOT EXISTS distributor_settlements_deal_idx
  ON public.distributor_settlements (deal_id);

DROP TRIGGER IF EXISTS distributor_settlements_updated_at ON public.distributor_settlements;
CREATE TRIGGER distributor_settlements_updated_at
  BEFORE UPDATE ON public.distributor_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.distributor_settlement_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.distributor_settlements(id) ON DELETE CASCADE,
  amount NUMERIC(14, 0) NOT NULL,
  paid_on DATE NOT NULL,
  memo TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distributor_settlement_payments_amount_check CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS distributor_settlement_payments_settlement_idx
  ON public.distributor_settlement_payments (settlement_id, paid_on);

-- deny-all: 정책이 없으므로 service_role 만 읽고 쓴다. 앱은 관리자 인증을 거친 service role API
-- (/api/admin/quotes/[id]/distributor-settlement, /api/admin/distributor-*)와 토큰 공유 페이지로만 접근한다.
ALTER TABLE public.distributor_price_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_settlement_payments ENABLE ROW LEVEL SECURITY;
