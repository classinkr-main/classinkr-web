import { describe, expect, it } from "vitest"

import { normalizePhoneKey } from "@/lib/compass/normalize"

/**
 * phone_key 생성 컬럼(supabase/migrations/20260914_leads_phone_key.sql)은 public.norm_phone_key(phone)
 * 을 부른다 — public.leads 위에서 실행되므로 vitest로 직접 검증할 수 없다. 대신 같은 규칙을
 * 구현한 TS 쪽 normalizePhoneKey(lib/compass/normalize.ts)의 대표 입력 → 기대 키를 여기서
 * 고정한다. SQL 함수 자체의 진리표는 20260914_compass_integration_bridge.sql 의 자기검증 블록과
 * tests/db/compass-integration-bridge-migration.test.ts 가 같은 값으로 대조한다.
 *
 * 일반적인 정규화 케이스는 tests/compass/normalize.test.ts가 이미 더 폭넓게 고정하고 있다.
 * 이 파일은 재유입 병합(lib/repositories/leads.ts findLeadsByContacts)이 기대는 마이그레이션
 * 계약 전용 고정값이라 별도로 둔다.
 */
describe("normalizePhoneKey — leads.phone_key 마이그레이션 계약", () => {
  it.each([
    ["010-1234-5678", "01012345678"],
    ["+82 10 1234 5678", "01012345678"],
    ["0082-10-1234-5678", "01012345678"],
    // 82로 시작하는 서울 지역번호(02) 국가코드 표기 — ^82 치환 후 021234... 로 복원돼야 한다.
    ["82212345678", "0212345678"],
    // 서울 지역번호 구형(7자리 국번) 로컬 표기 — 82/0082 치환 대상이 아니라 그대로 남는다.
    ["02-123-4567", "021234567"],
    // 아래 둘은 옛 인라인 식('^0082'→'82', '^82'→'0')이 틀리던 입력이다 — 생성 컬럼을
    // norm_phone_key() 호출로 바꾼 이유(조회 키와 저장 키가 어긋나 재유입 병합을 놓쳤다).
    // 국가번호 뒤에 국내 0 이 남은 표기: 옛 식은 "001012345678".
    ["+82 010-1234-5678", "01012345678"],
    // 시트가 앞 0 을 떨어뜨린 10자리: 옛 식은 "1012345678" 그대로.
    ["1012345678", "01012345678"],
  ])("normalizePhoneKey(%s) === %s", (input, expected) => {
    expect(normalizePhoneKey(input)).toBe(expected)
  })

  it("빈 문자열·null·문자만 있는 값은 NULL로 취급한다 — SQL의 NULLIF(…, '')와 대응", () => {
    expect(normalizePhoneKey("")).toBeNull()
    expect(normalizePhoneKey(null)).toBeNull()
    expect(normalizePhoneKey("abcde")).toBeNull()
  })
})
