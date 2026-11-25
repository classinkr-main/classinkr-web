import { describe, expect, it } from "vitest"

import { hasAccountIdentifier, redactInternalCsDraft, redactionNotice } from "@/lib/internal-cs-chat/redact"

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

  // 검토(안전-2)에서 그대로 새던 꼴. 가리기 전 꼴 고르기(전각·대시 변형·값 안 공백·줄바꿈·한글 숫자)와
  // 이름표·국제 전화·은행 이름 규칙을 더해 막는다. 값은 모두 지어낸 것이다.
  it.each([
    ["연락처는 ０１０-１２３４-５６７８ 입니다", "[phone]"],
    ["０１０１２３４５６７８", "[phone]"],
    ["010 - 1234 - 5678", "[phone]"],
    ["010-1234-\n5678", "[phone]"],
    ["010–1234–5678", "[phone]"],
    ["+821012345678", "[phone]"],
    ["+82-10-1234-5678", "[phone]"],
    ["공일공 일이삼사 오육칠팔", "[phone]"],
    ["kim.test @ example.com", "[email]"],
    ["kim.test＠example.com", "[email]"],
    ["kim.test@\nexample.com", "[email]"],
    ["９００１０１-１２３４５６７", "[rrn]"],
    ["900101-\n1234567", "[rrn]"],
    ["신한은행 110123456789", "[account]"],
    ["110 123 456789", "[account]"],
    ["계좌 １１０-１２３-４５６７８９", "[account]"],
    ["계정번호 12345678", "[uid]"],
    ["아이디는 12345678", "[uid]"],
    ["ID: 12345678", "[uid]"],
    ["UID: abc12345", "[uid]"],
    ["UID １２３４５６７８", "[uid]"],
    ["UID 1234 5678 계정에서", "[uid]"],
    ["1990년 1월 1일생", "[birthdate]"],
    ["답입니다\u200B 010-1234-5678", "[phone]"],
  ])("masks the evasive form %j", (input, token) => {
    const { text, count } = redactInternalCsDraft(input)
    expect(text).toContain(token)
    expect(count).toBeGreaterThan(0)
    // 가린 칸을 빼면 4자리 넘는 숫자·@·한글 숫자열이 남지 않는다.
    expect(text.replace(/\[[a-z_]+\]/g, "")).not.toMatch(/[0-9０-９]{4,}|@|＠|공일공/)
    // 멱등.
    expect(redactInternalCsDraft(text)).toEqual({ text, count: 0 })
  })

  it("keeps ordinary prose, dates, times, versions and Chinese punctuation intact", () => {
    for (const clean of [
      "2026-10-15 18:30 발생, 앱 6.0.9",
      "학생 30명 중 12명이 2024 11 25 수업에 입장하지 못했습니다",
      "- 机构 : 가상학원（본사）：확인 필요",
      "계정 ID 있음 — 공유 범위 확인",
      "이사 일정은 오후 삼사 시",
      "Android 기기에서 영상이 끊깁니다",
    ]) {
      expect(redactInternalCsDraft(clean)).toEqual({ text: clean, count: 0 })
    }
  })

  it("detects account identifiers with the same labels as the masking", () => {
    expect(hasAccountIdentifier("계정번호 12345678 로그인 안 됨")).toBe(true)
    expect(hasAccountIdentifier("아이디는 12345678")).toBe(true)
    expect(hasAccountIdentifier("UID: abc12345")).toBe(true)
    expect(hasAccountIdentifier("UID １２３４５６７８")).toBe(true)
    expect(hasAccountIdentifier("수업 ID: 12345678 에서 안 됨")).toBe(false)
    expect(hasAccountIdentifier("로그인이 안 됩니다")).toBe(false)
  })
})
