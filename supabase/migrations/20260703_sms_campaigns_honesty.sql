-- sms_campaigns 정직화: 실제 solapi 발송 결과를 담을 수 있도록 확장한다.
--   - sent_count / failed_count 컬럼 추가(부풀리지 않은 실집계)
--   - status 값에 'simulated' | 'partial' | 'failed' 허용(기존 CHECK 교체)
-- 기존 프로덕션 데이터는 그대로 보존(IF NOT EXISTS / 조건부 제약 재적용).

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS sent_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INT NOT NULL DEFAULT 0;

-- 기존 status CHECK 제약(draft/sent/failed)을 확장 제약으로 교체.
-- 20260413_sms_campaigns.sql 에서 인라인 CHECK 로 생성되어 제약명이 자동부여(sms_campaigns_status_check)됐다.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.sms_campaigns'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sms_campaigns DROP CONSTRAINT %I', con_name);
  END IF;
END$$;

ALTER TABLE public.sms_campaigns
  ADD CONSTRAINT sms_campaigns_status_check
  CHECK (status IN ('draft', 'sent', 'failed', 'simulated', 'partial'));
