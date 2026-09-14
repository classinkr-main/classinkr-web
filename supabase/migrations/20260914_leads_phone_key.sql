-- 재유입 병합 전화 정규화 키 — Compass phone_key 규칙을 public.leads 에도 둔다 (2026-09-14).
--
-- 배경: lib/repositories/leads.ts findLeadsByContacts()가 재문의(재유입) 병합 후보를 찾을 때
-- 지금까지는 전화번호를 digitsOnly()(숫자만 남기기)로만 비교했다. 그래서 "010-1234-5678"과
-- "+82 10-1234-5678"·"0082-10-1234-5678"처럼 국가코드 서식만 다른 같은 번호를 다른 리드로
-- 오인해, 재문의가 새 리드 행으로 쌓였다(lib/server/lead-capture.ts submitLeadCapture 재유입
-- 병합 분기 참고). Compass(crm.leads → compass_leads_v, 아래 파일 18~26행)는 이미 같은 문제를
-- phone_key 정규화 표현식으로 풀었다:
--   supabase/migrations/20260828_compass_bridge_views.sql:18-26
--     NULLIF(regexp_replace(regexp_replace(regexp_replace(COALESCE(l.phone, ''),
--       '[^0-9]', '', 'g'), '^0082', '82'), '^82', '0'), '') AS phone_key
-- 그 표현식을 public.leads 의 STORED 생성 컬럼으로 그대로 옮겨 lib/repositories/leads.ts
-- findLeadsByContacts()가 .in("phone_key", keys) 로 바로 조회할 수 있게 한다(컬럼이 없는
-- 배포 창에는 PostgREST 42703 감지 → 원문/숫자만/정규화 키 3중 in("phone", …) 폴백이 있다).
--
-- 규칙은 compass_leads_v.phone_key와 바이트가 같아야 한다 — 어긋나면 두 정규화가 같은 번호를
-- 다르게 취급해 재유입 병합과 Compass 브리지 대조가 서로 다른 답을 낸다. TS 쪽 계약은
-- lib/compass/normalize.ts의 normalizePhoneKey()가 같은 규칙을 구현하고,
-- tests/repositories/leads-phone-key.test.ts가 대표 입력으로 고정한다 — TS normalizePhoneKey
-- 와 바이트 일치(SQL은 vitest로 실행할 수 없어 여기서는 계약만 명시하고 TS 쪽에서 고정한다).
--
-- CREATE INDEX CONCURRENTLY는 쓰지 않는다 — 이 저장소의 마이그레이션은 트랜잭션 안에서 실행되는
-- SQL Editor/CLI로 적용되며(20260902_leads_dedupe_and_admin_hot_path_indexes.sql과 동일 근거),
-- CONCURRENTLY는 트랜잭션 내부에서 금지된다.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_key text GENERATED ALWAYS AS (
    NULLIF(
      regexp_replace(
        regexp_replace(
          regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'),
          '^0082', '82'),
        '^82', '0'),
      '')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_phone_key
  ON public.leads (phone_key)
  WHERE phone_key IS NOT NULL;

COMMENT ON COLUMN public.leads.phone_key IS
  '전화 정규화 키(재유입 병합용, 생성 컬럼). compass_leads_v.phone_key와 같은 규칙 — TS normalizePhoneKey(lib/compass/normalize.ts)와 바이트 일치해야 한다.';
