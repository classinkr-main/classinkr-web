-- KR팀 내부 DB/수기/상담 리드를 홈페이지 리드와 별도 origin으로 분리한다.
-- 기존 배포 DB에는 20260629 migration의 CHECK constraint가 이미 있으므로 재생성한다.

ALTER TABLE public.crm_customer_events
  DROP CONSTRAINT IF EXISTS crm_customer_events_attendee_origin_check;

ALTER TABLE public.crm_customer_events
  ADD CONSTRAINT crm_customer_events_attendee_origin_check
  CHECK (attendee_origin IS NULL OR attendee_origin IN (
    'ad_lead',
    'site_lead',
    'kr_team_lead',
    'new_lead',
    'existing_customer',
    'partner_customer',
    'unknown'
  ));

ALTER TABLE public.crm_capture_rows
  DROP CONSTRAINT IF EXISTS crm_capture_rows_attendee_origin_check;

ALTER TABLE public.crm_capture_rows
  ADD CONSTRAINT crm_capture_rows_attendee_origin_check
  CHECK (attendee_origin IS NULL OR attendee_origin IN (
    'ad_lead',
    'site_lead',
    'kr_team_lead',
    'new_lead',
    'existing_customer',
    'partner_customer',
    'unknown'
  ));

-- 이전 자동 분류는 광고가 아닌 모든 기존 리드를 site_lead로 저장했다.
-- 내부 DB/수기/상담 리드로 확인되는 과거 참석 기록은 새 origin으로 보정한다.
UPDATE public.crm_customer_events crm_event
SET attendee_origin = 'kr_team_lead'
FROM public.leads lead_row
WHERE crm_event.target_type = 'lead'
  AND crm_event.target_id = lead_row.id::text
  AND crm_event.attendee_origin = 'site_lead'
  AND lower(btrim(lead_row.source)) IN ('admin_manual', 'manual', 'manual_import', 'crm_capture', 'channel_talk');

UPDATE public.crm_capture_rows capture_row
SET attendee_origin = 'kr_team_lead'
FROM public.leads lead_row
WHERE capture_row.matched_target_type = 'lead'
  AND capture_row.matched_target_id = lead_row.id::text
  AND capture_row.attendee_origin = 'site_lead'
  AND lower(btrim(lead_row.source)) IN ('admin_manual', 'manual', 'manual_import', 'crm_capture', 'channel_talk');
