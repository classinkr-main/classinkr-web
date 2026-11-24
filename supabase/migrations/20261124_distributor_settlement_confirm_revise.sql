-- 총판 견적서 확인·수정(2026-11-24).
--
--  - 총판이 공유 링크(/share/distributor-quote/[token])에서 "확인"을 누른 시각과 확인자 이름을 남긴다.
--    확인하면 총판에게 확인 메일, 사내에는 알림(이메일 포함)이 간다.
--  - 발행 뒤에도 어드민이 총판 금액을 고칠 수 있다(품목 직접 추가 포함). 고치면 revised_at 을 남기고
--    총판 확인을 해제한다(다시 확인 받는다).
--
-- 미적용 환경: 앱은 새 칸 없이 읽고(42703 폴백) 기존 기능은 그대로 쓴다. 총판 확인 버튼·발행 후 금액 수정만
-- "적용 필요"로 막힌다(lib/repositories/distributor-settlements.ts).
--
-- 멱등 — 재실행은 무해하다.

ALTER TABLE public.distributor_settlements
  ADD COLUMN IF NOT EXISTS distributor_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distributor_confirmed_name TEXT,
  ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ;

ALTER TABLE public.distributor_settlements
  DROP CONSTRAINT IF EXISTS distributor_settlements_confirmed_name_check;
ALTER TABLE public.distributor_settlements
  ADD CONSTRAINT distributor_settlements_confirmed_name_check CHECK (
    distributor_confirmed_name IS NULL OR char_length(distributor_confirmed_name) <= 60);
