-- 하드웨어 도입 신청의 설치/배송 주소 컬럼.
-- kind='hardware' 신청은 서버(lib/checkout-requests.ts)가 필수로 검증하고,
-- kind='software' 는 받지 않아 null 로 남는다. DB 레벨 NOT NULL 은 걸지 않는다
-- (kind 조건부 필수라 CHECK (kind <> 'hardware' OR address IS NOT NULL) 도 가능하지만,
--  운영자가 수기로 행을 만들 여지를 막지 않기 위해 앱 검증만 둔다).

alter table public.checkout_requests
  add column if not exists address text;

comment on column public.checkout_requests.address is
  '설치/배송 주소 — kind=hardware 신청만 필수(앱 검증), software 는 null.';
