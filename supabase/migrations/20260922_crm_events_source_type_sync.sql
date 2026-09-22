-- CRM 3단계 A6 — crm_customer_events.source_type CHECK를 코드 enum과 동기화한다.
--
-- 코드 SSOT: lib/repositories/crm-events.ts의 CRM_EVENT_SOURCE_TYPES(10종).
-- 20260717_crm_events_site_inflow.sql이 이미 이 10종으로 CHECK를 갱신했지만, 그 마이그레이션은
-- lib/db/schema-contract.ts의 SCHEMA_CONTRACT_MIGRATIONS/SCHEMA_PROBES에 등재되지 않아
-- 프로덕션에 실제로 적용됐는지 검증할 방법이 없었다(check:db가 존재를 확인하지 못함).
-- 이 마이그레이션은 같은 10종 CHECK를 다시 명시적으로 재확정해 프로브(A6)의 앵커로 삼는다.
-- idempotent — DROP CONSTRAINT IF EXISTS 후 재생성이므로 재실행해도 무해하다.

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
