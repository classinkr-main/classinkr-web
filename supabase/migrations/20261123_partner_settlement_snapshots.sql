-- 총판 정산 스냅샷(2026-11-23) — 쿼드러닝 계정 잔액 보드(견적·문서 › 총판 미수금 위쪽)와 Overview 카드가 읽는다.
--
-- 쿼드러닝은 고객에게 시장가를 받고 우리에게 공급가를 이체한다. 고객이 우리에게 카드로 직접 내면 차액은 쿼드 몫이라
-- 다음 이체에서 뺀다. 그래서 건별 미수가 아니라 계정 잔액 하나(청구 − 쿼드 이체 − 고객 카드)로 맞춘다.
-- 그 계산은 저장소 밖 정산 대조 스크립트가 하고, 결과 JSON 한 덩어리를 총판마다 한 행으로 올린다
-- (scripts/upload-partner-settlement-snapshot.mjs — 운영자가 수동 실행).
--
-- 미적용 환경: 보드는 "아직 올라오지 않았다" 한 줄, Overview 카드는 그리지 않는다
-- (lib/repositories/partner-settlement-snapshot.ts).
--
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS) — 재실행은 무해하다.

CREATE TABLE IF NOT EXISTS public.partner_settlement_snapshots (
  -- 총판 키(예: quad). 총판마다 최신 스냅샷 한 행만 둔다 — 새로 올리면 덮어쓴다.
  partner TEXT PRIMARY KEY,
  snapshot JSONB NOT NULL,
  -- 스냅샷 안의 generatedAt 을 옮겨 둔 값(정렬·확인용). 표시는 snapshot 의 값을 쓴다.
  generated_at TIMESTAMPTZ,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partner_settlement_snapshots_snapshot_check CHECK (jsonb_typeof(snapshot) = 'object')
);

DROP TRIGGER IF EXISTS partner_settlement_snapshots_updated_at ON public.partner_settlement_snapshots;
CREATE TRIGGER partner_settlement_snapshots_updated_at
  BEFORE UPDATE ON public.partner_settlement_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- deny-all: 정책이 없으므로 service_role 만 읽고 쓴다. 앱은 관리자 인증을 거친 service role API
-- (/api/admin/partner-settlement)로만 읽고, 쓰기는 업로드 스크립트(service role 키)뿐이다.
ALTER TABLE public.partner_settlement_snapshots ENABLE ROW LEVEL SECURITY;
