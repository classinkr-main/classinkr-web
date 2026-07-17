-- Add 'site_inflow' to crm_customer_events.source_type.
-- 홈페이지 리드 유입 시 자동 삽입되는 '홈페이지 상담 신청' 타임라인 이벤트 종류.

ALTER TABLE public.crm_customer_events
  DROP CONSTRAINT IF EXISTS crm_customer_events_source_type_check;

ALTER TABLE public.crm_customer_events
  ADD CONSTRAINT crm_customer_events_source_type_check
  CHECK (source_type IN (
    'manual_note',
    'meeting_minutes',
    'recording',
    'calendar_event',
    'lead_contact_log',
    'external_crm',
    'sheet',
    'call',
    'sms',
    'site_inflow'
  ));
