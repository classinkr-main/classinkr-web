-- 충전형 Business 선충전의 통화를 CNY → KRW 로 전환한다.
--
-- 배경: 2026-07 기준 software_quote_codes / software_checkout_orders / promo_codes 는
-- 프로덕션에서 0행이라 데이터 마이그레이션 없이 통화 체계를 바꿀 수 있다.
-- amount_cny 는 역사 보존용으로 남기고, business_recharge 코드 경로는 amount_krw 만
-- 읽고 쓴다(lib/billing/quote-codes.ts, app/api/admin/software-quote-codes).
--
-- 멱등: 재실행해도 안전(add column if not exists).

alter table public.software_quote_codes
  add column if not exists amount_krw numeric(14, 0);

comment on column public.software_quote_codes.amount_krw is
  'For business_recharge kind (KRW, 원 단위 정수). Must match 2,000,000 + 500,000*N rules (lib/billing/recharge.ts).';

comment on column public.software_quote_codes.amount_cny is
  'DEPRECATED 2026-07: business_recharge switched to KRW (amount_krw). Kept for historical rows only — no code path reads or writes this column.';
