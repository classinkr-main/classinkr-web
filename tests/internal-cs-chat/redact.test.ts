import { describe, expect, it } from "vitest"

import { redactInternalCsDraft, redactionNotice } from "@/lib/internal-cs-chat/redact"

// 값은 모두 지어낸 것이다(실제 고객 연락처·계좌가 아니다).
describe("redactInternalCsDraft", () => {
  it("masks phone, email, 3-3-6 account, RRN, birth date and labelled UID, and counts them", () => {
    const input = [
      "연락처 010-2345-6789 / 메일 parent@example.com",
      "환불 계좌 신한 110-123-456789",
      "주민번호 900101-1234567",
      "생년월일: 1990.01.01",
      "UID 12345678 계정 87654321",
    ].join("\n")
    const { text, count } = redactInternalCsDraft(input)

    for (const raw of ["010-2345-6789", "parent@example.com", "110-123-456789", "900101-1234567", "1990.01.01", "12345678", "87654321"]) {
      expect(text).not.toContain(raw)
    }
    expect(text).toContain("[phone]")
    expect(text).toContain("[email]")
    expect(text).toContain("[account]")
    expect(text).toContain("[rrn]")
    expect(text).toContain("[birthdate]")
    expect(text).toContain("UID [uid]")
    expect(count).toBe(7)
  })

  it("masks an unlabelled dashed account number but keeps dates, times and app versions", () => {
    const { text, count } = redactInternalCsDraft("2026-10-15 18:30 발생, 앱 6.0.9, 계좌 333-22-4444444")
    expect(text).toContain("2026-10-15 18:30")
    expect(text).toContain("6.0.9")
    expect(text).not.toContain("333-22-4444444")
    expect(count).toBe(1)
  })

  it("is idempotent and leaves clean text untouched", () => {
    const once = redactInternalCsDraft("고객 010-1111-2222 UID 99887766")
    const twice = redactInternalCsDraft(once.text)
    expect(twice.text).toBe(once.text)
    expect(twice.count).toBe(0)
    expect(redactInternalCsDraft("전자칠판 터치가 안 됩니다")).toEqual({ text: "전자칠판 터치가 안 됩니다", count: 0 })
    expect(redactInternalCsDraft(null)).toEqual({ text: "", count: 0 })
  })

  it("builds the notice only when something was masked", () => {
    expect(redactionNotice(0)).toBeNull()
    expect(redactionNotice(3)).toBe("개인정보 3건을 가렸습니다")
  })
})
