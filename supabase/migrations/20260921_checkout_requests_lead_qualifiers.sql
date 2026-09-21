-- 도입 신청에 리드 자격 필드(직책·학원 규모)를 더한다.
--
-- 신청 폼은 연락처만 받고 직책·규모를 받지 않았다. 그래서 이 신청이 만드는 리드는
-- leads.size 가 항상 비었고, 리드 스코어의 규모 배점(lib/crm/lead-ranking.ts,
-- 최대 +34점)을 통째로 못 받았다 — 수천만 원짜리 주문 신청이 "300명"이라 적은 단순
-- 문의보다 낮게 깔렸다.
--
-- 두 컬럼 모두 nullable 이다. 선택 항목이라 기존 행도 그대로 유효하고, 폼에서도
-- 필수로 올리지 않는다(작성 비용을 다시 늘리지 않는다).
--
-- 규모는 lib/contact/academy-size.ts 의 4단 버킷 문자열을 받는다. 서버가 버킷에
-- 없는 값을 null 로 떨어뜨리므로 DB CHECK 는 두지 않는다 — 버킷 문구가 바뀔 때
-- 마이그레이션과 앱이 같이 움직여야 하는 결합을 만들지 않기 위해서다.
-- 같은 이유로 showroom_bookings.academy_size 에도 CHECK 가 없다.

alter table public.checkout_requests
  add column if not exists role text;

alter table public.checkout_requests
  add column if not exists academy_size text;

comment on column public.checkout_requests.role is
  '신청자 직책(선택). 집계·검색용이며 리드 스코어 배점은 없다.';

comment on column public.checkout_requests.academy_size is
  '학원 규모 버킷(선택). lib/contact/academy-size.ts 의 4단 값. 리드 스코어 규모 배점의 입력.';
