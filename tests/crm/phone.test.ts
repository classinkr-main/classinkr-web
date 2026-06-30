import { describe, expect, it } from "vitest"

import { formatKoreanPhone, looksLikePhone, toLocalKoreanDigits } from "@/lib/crm/phone"

describe("toLocalKoreanDigits", () => {
  it("0082 국제 표기를 0 으로 치환한다", () => {
    expect(toLocalKoreanDigits("0082 10 1234 5678")).toBe("01012345678")
    expect(toLocalKoreanDigits("008210-1234-5678")).toBe("01012345678")
  })

  it("+82 / 82 표기를 0 으로 치환한다", () => {
    expect(toLocalKoreanDigits("+82 10-1234-5678")).toBe("01012345678")
    expect(toLocalKoreanDigits("82 10 1234 5678")).toBe("01012345678")
  })

  it("이미 로컬 표기면 숫자만 남긴다", () => {
    expect(toLocalKoreanDigits("010-1234-5678")).toBe("01012345678")
  })
})

describe("formatKoreanPhone", () => {
  it("0082 휴대폰 번호를 010-XXXX-XXXX 로 포맷한다", () => {
    expect(formatKoreanPhone("0082 10 1234 5678")).toBe("010-1234-5678")
    expect(formatKoreanPhone("008210-1234-5678")).toBe("010-1234-5678")
  })

  it("+82 / 82 휴대폰 번호를 010-XXXX-XXXX 로 포맷한다", () => {
    expect(formatKoreanPhone("+82 10-1234-5678")).toBe("010-1234-5678")
    expect(formatKoreanPhone("82 10 1234 5678")).toBe("010-1234-5678")
  })

  it("이미 로컬 표기면 동일하게 010-XXXX-XXXX 로 정리한다", () => {
    expect(formatKoreanPhone("01012345678")).toBe("010-1234-5678")
    expect(formatKoreanPhone("010-1234-5678")).toBe("010-1234-5678")
  })

  it("구형 10자리 휴대폰은 01X-XXX-XXXX 로 포맷한다", () => {
    expect(formatKoreanPhone("011-123-4567")).toBe("011-123-4567")
  })

  it("서울 지역번호(02)를 자릿수에 맞게 포맷한다", () => {
    expect(formatKoreanPhone("0212345678")).toBe("02-1234-5678")
    expect(formatKoreanPhone("021234567")).toBe("02-123-4567")
  })

  it("전화번호가 아니면 원본을 그대로 둔다", () => {
    expect(formatKoreanPhone("test@classin.com")).toBe("test@classin.com")
    expect(formatKoreanPhone("0015g00000ABCDE")).toBe("0015g00000ABCDE")
    expect(formatKoreanPhone("-")).toBe("-")
    expect(formatKoreanPhone(null)).toBe("")
    expect(formatKoreanPhone(undefined)).toBe("")
  })
})

describe("looksLikePhone", () => {
  it("전화번호 형태를 인식한다", () => {
    expect(looksLikePhone("0082 10 1234 5678")).toBe(true)
    expect(looksLikePhone("010-1234-5678")).toBe(true)
    expect(looksLikePhone("+82 10 1234 5678")).toBe(true)
  })

  it("이메일·영숫자 식별자·짧은 값은 제외한다", () => {
    expect(looksLikePhone("test@classin.com")).toBe(false)
    expect(looksLikePhone("0015g00000ABCDE")).toBe(false)
    expect(looksLikePhone("-")).toBe(false)
    expect(looksLikePhone("")).toBe(false)
    expect(looksLikePhone(null)).toBe(false)
  })
})
