-- CRM 입력함 재시도/동시 적용 시 같은 원본 행에서 활동 기록이 중복 생성되지 않게 한다.
-- 기존 중복이 있다면 조용히 삭제하지 않고 마이그레이션 실패로 드러내 수동 검토하게 한다.
CREATE UNIQUE INDEX IF NOT EXISTS crm_customer_events_capture_source_uidx
  ON public.crm_customer_events (source_type, source_id)
  WHERE source_type = 'sheet'
    AND source_id LIKE 'capture:%';
