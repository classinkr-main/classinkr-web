-- 어드민 목록 페이징 보조 인덱스(2026-08-27).
--
-- lead_contact_logs에는 idx_lead_contact_logs_lead_id(단건 리드 조회용) 하나뿐이라,
-- 리드 전수를 훑는 두 페이징 스캔이 페이지마다 테이블 전체를 다시 정렬한다:
--   lib/repositories/crm-events.ts getCrmCustomerContactMaps — order(contacted_at, id) + range
--   lib/repositories/lead-activity.ts                        — order(contacted_at desc) + range
-- 둘 다 최대 20페이지를 이어 읽으므로 정렬 비용이 페이지 수만큼 곱해진다.
--
-- 두 쿼리가 읽는 컬럼은 (lead_id, contacted_at)뿐이다. lead_id를 INCLUDE에 실어
-- 힙 방문 없이 index-only로 끝내면 range의 offset 구간도 인덱스에서만 건너뛴다.
CREATE INDEX IF NOT EXISTS lead_contact_logs_contacted_at_idx
  ON public.lead_contact_logs (contacted_at, id)
  INCLUDE (lead_id);
