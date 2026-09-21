-- 쇼룸 예약·도입 신청 리드를 전용 source 로 가른다.
--
-- 두 접수는 leads 로 미러링될 때 source 를 'contact_page' 로 빌려 썼다. leads.source 에
-- CHECK 제약이 없어 DB 는 아무 값이나 받지만, 앱 계약(lib/lead-types.ts LeadSource)에
-- 전용 값이 없었기 때문이다. 그 결과:
--
--   * 응답 SLA·아침 공지·주간 다이제스트가 source 로 대상을 거르는데, 가장 의도가 높은
--     두 갈래가 단순 문의와 한 덩어리로 들어갔다.
--   * lib/crm/lead-ranking.ts 의 유입 의도 가중치가 둘 다 contact_page(22)를 줬다.
--     수천만 원짜리 주문 신청이 "무엇인지 묻는" 문의와 같은 값을 받았다.
--
-- 앱은 이제 'showroom_booking' / 'checkout_request' 로 쓴다. 이 마이그레이션은 **이미
-- 쌓인 행**을 같은 값으로 맞춘다 — 없으면 source 기준 집계가 배포일에서 끊긴다.
--
-- source_detail 은 건드리지 않는다. 그 컬럼이 원래 두 갈래를 구분하던 값이고
-- (showroom_booking / checkout_request:{kind}), 과거 리드와의 연속성 계약이 걸려 있다.
-- 여기서는 그 값을 **판별 기준으로만** 읽는다.
--
-- 멱등하다: 이미 전환된 행은 source 가 'contact_page' 가 아니라 다시 걸리지 않는다.

update public.leads
set source = 'showroom_booking'
where source = 'contact_page'
  and source_detail = 'showroom_booking';

update public.leads
set source = 'checkout_request'
where source = 'contact_page'
  and source_detail like 'checkout_request:%';
