-- 행사 ↔ 참석자(활동) ↔ 전환 트래킹 연결
-- 설계: docs/active/event-attendee-tracking-plan-2026-06-29.md
--
-- 참석자 명부의 SSOT는 crm_customer_events(폴리모픽 CRM 활동 레이어)다.
-- 행사 참석자는 리드 / 기존 고객(customer) / 파트너 고객(neo_account)으로 섞이므로
-- 리드 테이블이 아니라 4종 신원을 모두 받는 활동 레이어에 "어느 행사" + "출신"을 단다.

-- 1) 활동 행에 공개 행사 연결 + 참석자 출신(origin) 스냅샷
--    attendee_origin 은 확정 시점에 도출해 박아두는 비정규화 스냅샷(리포팅 안정용).
ALTER TABLE public.crm_customer_events
  ADD COLUMN IF NOT EXISTS public_event_id UUID
    REFERENCES public.public_events(id) ON DELETE SET NULL;

ALTER TABLE public.crm_customer_events
  ADD COLUMN IF NOT EXISTS attendee_origin TEXT
    CHECK (attendee_origin IS NULL OR attendee_origin IN (
      'ad_lead',           -- 마케팅 광고 리드
      'site_lead',         -- 홈페이지 리드
      'new_lead',          -- 명단에만 있던 신규(행사로 새로 생성된 리드)
      'existing_customer', -- 기존 고객(직판)
      'partner_customer',  -- 파트너 고객 / Neo CRM 계정
      'unknown'
    ));

CREATE INDEX IF NOT EXISTS crm_customer_events_public_event_idx
  ON public.crm_customer_events (public_event_id, attendee_origin);

-- 2) 캡처 배치 = 어느 공개 행사 명단인지. 적용(apply) 시 각 활동 행에 전파된다.
ALTER TABLE public.crm_capture_batches
  ADD COLUMN IF NOT EXISTS public_event_id UUID
    REFERENCES public.public_events(id) ON DELETE SET NULL;

-- 3) 캡처 행 출신(origin) 수동 지정(override). NULL이면 apply가 자동 도출,
--    값이 있으면 그 값으로 확정(파트너 고객 등 사람이 직접 지정).
ALTER TABLE public.crm_capture_rows
  ADD COLUMN IF NOT EXISTS attendee_origin TEXT
    CHECK (attendee_origin IS NULL OR attendee_origin IN (
      'ad_lead', 'site_lead', 'new_lead', 'existing_customer', 'partner_customer', 'unknown'
    ));
