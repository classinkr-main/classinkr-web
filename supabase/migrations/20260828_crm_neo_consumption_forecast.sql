-- 충전제 계정의 소진 예상일 — "재충전 시기가 다가온다"를 잔액 0 이전에 잡기 위한 파생.
--
-- 원천은 FinancialInformation__c(입출금 원장, AmountReal__c 는 元).
-- ResourceInformation__c 는 쓰지 않는다: ServiceType 마다 변동값 단위가 다르고
-- (같은 '课节消耗'이 어디선 0.38, 어디선 187.99), 录课 31,001행은 전부 0이며,
-- 원장 Margin__c 가 계정 잔액과 맞지 않는다.
--
-- burn_event_count 를 함께 남기는 이유: 창 안 차감이 1건뿐인 계정(일회성 개통 결제)을
-- 일평균으로 펴면 멀쩡한 계정이 "내일 소진"으로 뜬다. 신뢰도의 근거를 화면과 알림이
-- 같이 볼 수 있어야 한다.

ALTER TABLE public.crm_neo_customer_snapshots
  ADD COLUMN IF NOT EXISTS daily_burn NUMERIC,
  ADD COLUMN IF NOT EXISTS depletion_in_days INTEGER,
  ADD COLUMN IF NOT EXISTS burn_event_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS burn_confidence TEXT NOT NULL DEFAULT 'none'
    CHECK (burn_confidence IN ('high', 'medium', 'none'));

-- 재충전 임박 큐: 소진 예상일이 가까운 순.
CREATE INDEX IF NOT EXISTS crm_neo_customer_snapshots_depletion_idx
  ON public.crm_neo_customer_snapshots (depletion_in_days)
  WHERE depletion_in_days IS NOT NULL;

COMMENT ON COLUMN public.crm_neo_customer_snapshots.daily_burn IS
  '최근 90일 차감액(元)을 창 길이로 나눈 일평균. 표본 3건 미만이면 NULL.';
COMMENT ON COLUMN public.crm_neo_customer_snapshots.depletion_in_days IS
  '현재 잔액이 0이 되기까지 남은 일수 추정. 잔액을 모르거나 이미 소진이면 NULL.';
COMMENT ON COLUMN public.crm_neo_customer_snapshots.burn_event_count IS
  '창 안에서 관측된 차감 건수. 예상일의 신뢰 근거.';
