-- 매출시트 J열(product_version)이 말하는 과금 유형을 NEO 고객 스냅샷에 싣는다.
--
-- "충전제의 남은 사용량"을 판단하려면 그 계정이 충전제인지부터 알아야 한다.
-- ShroffAccount__c 의 PriceType__c 는 이 구분자가 아니다 — 프로덕션 대조 결과
-- 충전제(Business Consumption)와 구독제(Standard Subscription) 양쪽 모두
-- 대부분 PriceType=1 이었다. 실제 구분은 매출시트 J열에만 있다.
--
-- 값을 모르면 'unknown' 으로 둔다. 구독제 계정에 '충전 잔액 소진'을 붙이지 않기 위한
-- 게이트이므로, 추측해서 채우면 게이트가 무의미해진다.

ALTER TABLE public.crm_neo_customer_snapshots
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'unknown'
    CHECK (billing_mode IN ('consumption', 'subscription', 'hardware', 'unknown'));

-- 충전제 고객의 잔액 소진 큐를 뽑는 것이 이 컬럼의 주 용도다.
CREATE INDEX IF NOT EXISTS crm_neo_customer_snapshots_billing_balance_idx
  ON public.crm_neo_customer_snapshots (billing_mode, balance)
  WHERE billing_mode = 'consumption';

COMMENT ON COLUMN public.crm_neo_customer_snapshots.billing_mode IS
  '과금 유형. 원천은 branch_rev_deals.product_version(매출시트 J열)이며 확정 링크 또는 정확한 이름 일치로 연결한다. PriceType__c 는 이 구분자가 아니다.';
