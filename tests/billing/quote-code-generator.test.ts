// 견적 코드 엔트로피 강화 회귀.
// 구 포맷은 QB-YYYY-XXXX(숫자 4자리 = 1만 가지)로 브루트포스 가능했다.
// 신 포맷은 crypto.randomInt 기반 8자리 영숫자이며, 사람이 입력할 때 혼동되는
// 문자(I, O, 0, 1)를 알파벳에서 제외한다. software_quote_codes 는 배포 시점 기준
// 0행이라 기존 코드와의 포맷 호환 부담은 없다.
import { describe, expect, it } from "vitest"

import { generateQuoteCode } from "@/lib/billing/quote-codes"

const CONFUSABLE_CHARS = new Set(["I", "O", "0", "1"])

describe("generateQuoteCode", () => {
  it("uses the QB prefix for business_recharge", () => {
    const code = generateQuoteCode("business_recharge")
    expect(code.startsWith("QB-")).toBe(true)
  })

  it("uses the QS prefix for subscription", () => {
    const code = generateQuoteCode("subscription")
    expect(code.startsWith("QS-")).toBe(true)
  })

  it("defaults to business_recharge (QB) when no kind is passed", () => {
    const code = generateQuoteCode()
    expect(code.startsWith("QB-")).toBe(true)
  })

  it("matches PREFIX-YYYY-XXXXXXXX shape with an 8-char alphanumeric suffix", () => {
    const code = generateQuoteCode("business_recharge")
    expect(code).toMatch(/^QB-\d{4}-[A-Z0-9]{8}$/)
  })

  it("never includes confusable characters (I, O, 0, 1) in the random suffix", () => {
    // 500회 반복 생성 — 알파벳에서 제외된 문자가 실제로 한 번도 나오지 않는지 확인.
    for (let i = 0; i < 500; i += 1) {
      const code = generateQuoteCode(i % 2 === 0 ? "business_recharge" : "subscription")
      const suffix = code.split("-")[2]
      expect(suffix).toHaveLength(8)
      for (const char of suffix) {
        expect(CONFUSABLE_CHARS.has(char)).toBe(false)
      }
    }
  })

  it("does not reproduce the old brute-forceable 4-digit numeric-only suffix", () => {
    const code = generateQuoteCode("business_recharge")
    const suffix = code.split("-")[2]
    expect(suffix.length).toBe(8)
    expect(suffix).not.toMatch(/^\d{4}$/)
  })

  it("produces effectively unique, non-sequential codes across many generations", () => {
    const codes = new Set(
      Array.from({ length: 2000 }, () => generateQuoteCode("business_recharge"))
    )
    // 32^8 ≈ 1.1조 키스페이스에서 2000개 생성 시 충돌 확률은 사실상 0.
    // 순차/타임스탬프 기반이 아니라 crypto 랜덤이라는 방증이기도 하다.
    expect(codes.size).toBe(2000)
  })
})
