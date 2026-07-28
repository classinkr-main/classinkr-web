-- 하드웨어 주문 신청의 설치 유형(스탠드형/벽걸이형).
-- kind='hardware' 신청은 서버(lib/checkout-requests.ts)가 'stand'|'wall' 필수로 검증하고,
-- kind='software' 는 받지 않아 null 로 남는다. address 컬럼과 같은 앱 검증 원칙.

alter table public.checkout_requests
  add column if not exists install_type text
  check (install_type is null or install_type in ('stand', 'wall'));

comment on column public.checkout_requests.install_type is
  '설치 유형 — stand(스탠드형)/wall(벽걸이형). kind=hardware 신청만 필수(앱 검증), software 는 null.';
