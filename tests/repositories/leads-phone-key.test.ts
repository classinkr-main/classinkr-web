import { describe, expect, it } from "vitest"

import { normalizePhoneKey } from "@/lib/compass/normalize"

/**
 * phone_key 생성 컬럼(supabase/migrations/20260914_leads_phone_key.sql)의 SQL 표현식은
 * public.leads 위에서 실행되므로 vitest로 직접 검증할 수 없다. 대신 그 SQL과 같은 규칙을
 * 구현한 TS 쪽 normalizePhoneKey(lib/compass/normalize.ts)의 대표 입력 → 기대 키를 여기서
 * 고정한다 — SQL 표현식을 바꿀 일이 있으면 이 값들과 바이트가 같아지도록 먼저 맞춘다.
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
  ])("normalizePhoneKey(%s) === %s", (input, expected) => {
    expect(normalizePhoneKey(input)).toBe(expected)
  })

  it("빈 문자열·null·문자만 있는 값은 NULL로 취급한다 — SQL의 NULLIF(…, '')와 대응", () => {
    expect(normalizePhoneKey("")).toBeNull()
    expect(normalizePhoneKey(null)).toBeNull()
    expect(normalizePhoneKey("abcde")).toBeNull()
  })
})
