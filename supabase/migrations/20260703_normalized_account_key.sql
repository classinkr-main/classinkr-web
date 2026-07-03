-- 고객(거래처) 정규화 키 — normalized_account_key(text) — lib/branch/account-key.ts의 SQL 쌍둥이.
--
-- 규칙(순서 고정, TS와 바이트 단위로 동일해야 함 — lib/branch/account-key.ts 주석 참조):
--   1) NFKC 정규화 — 전각/반각·호환 문자를 통일
--   2) 소문자화
--   3) 공백·구분 기호 일괄 제거: [\s()\[\]{}._\-|/]+
--
-- 이 키는 REV 원장 고객 그룹핑·주간 마감 스냅샷 diff·향후 하드웨어 출고 ↔ REV 매출
-- 대사(reconciliation)의 조인 키다. TS 구현(normalizedAccountKey)과 규칙이 어긋나면
-- 이미 저장된 source_record_key와 불일치가 생기므로, 규칙 자체는 변경 금지 —
-- 바꿔야 한다면 반드시 TS와 이 파일을 같은 마이그레이션에서 함께 갱신할 것.

CREATE OR REPLACE FUNCTION public.normalized_account_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(normalize(coalesce(value, ''), NFKC), '[\s()\[\]{}._\-|/]+', '', 'g'))
$$;

COMMENT ON FUNCTION public.normalized_account_key(text) IS
  'SQL twin of lib/branch/account-key.ts normalizedAccountKey — NFKC normalize, lowercase, strip whitespace/delimiters. Must stay byte-identical to the TS implementation; do not change the rule without updating both sides together.';

-- ─── 자기검증: TS normalizedAccountKey와 픽스처 페어로 패리티 확인 ───────────
-- 픽스처는 tests/branch/account-key-parity.test.ts 와 쌍 — 한쪽 수정 시 양쪽 동시 갱신.
DO $$
DECLARE
  actual text;
BEGIN
  -- 전각/반각
  actual := public.normalized_account_key('ＡＢＣ　학원');
  IF actual <> 'abc학원' THEN
    RAISE EXCEPTION 'normalized_account_key parity failed for fullwidth case: got %, expected %', actual, 'abc학원';
  END IF;

  -- 대소문자
  actual := public.normalized_account_key('ClassIn Academy');
  IF actual <> 'classinacademy' THEN
    RAISE EXCEPTION 'normalized_account_key parity failed for case-folding: got %, expected %', actual, 'classinacademy';
  END IF;

  -- 구분 기호 전부 (공백 () [] {} . _ - | /)
  actual := public.normalized_account_key('a b(c)[d]{e}f.g_h-i|j/k');
  IF actual <> 'abcdefghijk' THEN
    RAISE EXCEPTION 'normalized_account_key parity failed for delimiter stripping: got %, expected %', actual, 'abcdefghijk';
  END IF;

  -- 한글 + 공백
  actual := public.normalized_account_key('목동 클래스인 어학원');
  IF actual <> '목동클래스인어학원' THEN
    RAISE EXCEPTION 'normalized_account_key parity failed for korean spacing: got %, expected %', actual, '목동클래스인어학원';
  END IF;

  -- 빈 값
  actual := public.normalized_account_key('');
  IF actual <> '' THEN
    RAISE EXCEPTION 'normalized_account_key parity failed for empty string: got %, expected empty', actual;
  END IF;

  -- NULL
  actual := public.normalized_account_key(NULL);
  IF actual <> '' THEN
    RAISE EXCEPTION 'normalized_account_key parity failed for NULL: got %, expected empty', actual;
  END IF;

  -- NFKC 호환 문자: ㈜(U+321C, "주식회사"의 괄호 약어)는 NFKC로 "(주)"로 분해되고,
  -- 괄호가 구분 기호로 제거되어 "주"만 남는다.
  actual := public.normalized_account_key('㈜클래스인');
  IF actual <> '주클래스인' THEN
    RAISE EXCEPTION 'normalized_account_key parity failed for NFKC compatibility char: got %, expected %', actual, '주클래스인';
  END IF;
END $$;

-- ─── 표현식 인덱스 ────────────────────────────────────────────────────────
-- branch_rev_deals.customer_name — supabase/migrations/20260427_branch_dashboard.sql
CREATE INDEX IF NOT EXISTS branch_rev_deals_normalized_account_key_idx
  ON public.branch_rev_deals (public.normalized_account_key(customer_name));

-- customers.name — supabase/migrations/20260404_partner_portal_v2_domain.sql
CREATE INDEX IF NOT EXISTS customers_normalized_account_key_idx
  ON public.customers (public.normalized_account_key(name));
