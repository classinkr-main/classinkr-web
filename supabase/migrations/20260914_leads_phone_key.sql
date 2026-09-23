-- 재유입 병합 전화 정규화 키 — Compass phone_key 규칙을 public.leads 에도 둔다 (2026-09-14).
--
-- 배경: lib/repositories/leads.ts findLeadsByContacts()가 재문의(재유입) 병합 후보를 찾을 때
-- 지금까지는 전화번호를 digitsOnly()(숫자만 남기기)로만 비교했다. 그래서 "010-1234-5678"과
-- "+82 10-1234-5678"·"0082-10-1234-5678"처럼 국가코드 서식만 다른 같은 번호를 다른 리드로
-- 오인해, 재문의가 새 리드 행으로 쌓였다(lib/server/lead-capture.ts submitLeadCapture 재유입
-- 병합 분기 참고). 정규화 키를 public.leads 의 STORED 생성 컬럼으로 두어
-- findLeadsByContacts()가 .in("phone_key", keys) 로 바로 조회할 수 있게 한다(컬럼이 없는
-- 배포 창에는 PostgREST 42703 감지 → 원문/숫자만/정규화 키 3중 in("phone", …) 폴백이 있다).
--
-- 규칙의 정본은 public.norm_phone_key(text) 하나다(20260914_compass_integration_bridge.sql,
-- Compass lib/format.ts normPhone 의 SQL 등가). 이 컬럼은 식을 인라인으로 복제하지 않고 그 함수를
-- 부른다 — TS 쪽 normalizePhoneKey(lib/compass/normalize.ts)도 같은 규칙이라 세 곳이 한 답을 낸다.
--   (2026-09-21 병합 시 정정) 처음 초안은 옛 브리지 뷰(20260828_compass_bridge_views.sql)의
--   '^0082'→'82', '^82'→'0' 치환 식을 인라인으로 굳혔는데, 같은 날 연동 브리지 2차가 규칙을
--   넓혔다(국가번호 뒤 0 유지 "+82 010-…", 앞 0 이 떨어진 "1012345678" 복원). 옛 식은 그 입력에서
--   "001012345678"·"1012345678" 을 내어 TS 가 만든 조회 키("01012345678")와 어긋났고, 재유입
--   병합이 그 번호들을 조용히 놓쳤다.
--
-- 적용 순서: 20260914_compass_integration_bridge.sql(함수 생성) → 이 파일. 파일명 사전순과 같다.
-- 함수가 없으면 아래 가드가 이유를 밝히고 멈춘다(컬럼을 옛 식으로 만들어 두는 것보다 낫다).
--
-- 옛 식으로 이미 적용한 환경이 있다면 ADD COLUMN IF NOT EXISTS 가 조용히 건너뛴다 — 그 경우에는
--   drop index if exists public.idx_leads_phone_key;
--   alter table public.leads drop column if exists phone_key;
-- 를 먼저 실행한 뒤 이 파일을 다시 적용한다.
--
-- CREATE INDEX CONCURRENTLY는 쓰지 않는다 — 이 저장소의 마이그레이션은 트랜잭션 안에서 실행되는
-- SQL Editor/CLI로 적용되며(20260902_leads_dedupe_and_admin_hot_path_indexes.sql과 동일 근거),
-- CONCURRENTLY는 트랜잭션 내부에서 금지된다.

DO $$
BEGIN
  IF to_regprocedure('public.norm_phone_key(text)') IS NULL THEN
    RAISE EXCEPTION
      'public.norm_phone_key(text) 가 없습니다 — 20260914_compass_integration_bridge.sql 을 먼저 적용하세요.';
  END IF;
END
$$;

-- norm_phone_key 는 IMMUTABLE 이라 생성 컬럼 식에 쓸 수 있다. 빈 값은 함수가 NULL 로 돌려준다.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_key text GENERATED ALWAYS AS (public.norm_phone_key(phone)) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_phone_key
  ON public.leads (phone_key)
  WHERE phone_key IS NOT NULL;

COMMENT ON COLUMN public.leads.phone_key IS
  '전화 정규화 키(재유입 병합용, 생성 컬럼) = public.norm_phone_key(phone). TS normalizePhoneKey(lib/compass/normalize.ts)·Compass normPhone 과 같은 규칙.';
