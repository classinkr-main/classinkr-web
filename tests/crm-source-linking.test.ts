import { describe, it, expect } from "vitest"
import {
  isPlaceholderCrmName,
  isUnsafeCrmTargetLabel,
  scoreCrmEntityMatch,
} from "@/lib/crm-source-linking"

describe("isPlaceholderCrmName", () => {
  it("matches the existing HW/SW/MKT prefix placeholders", () => {
    expect(isPlaceholderCrmName("HW")).toBe(true)
    expect(isPlaceholderCrmName("HW - 안양")).toBe(true)
    expect(isPlaceholderCrmName("sw_test")).toBe(true)
    expect(isPlaceholderCrmName("MKT(캠페인)")).toBe(true)
  })

  it("does not match a real academy name that merely starts with hw/sw/mkt", () => {
    expect(isPlaceholderCrmName("SW어학원")).toBe(false)
    expect(isPlaceholderCrmName("hwacademykorea")).toBe(false)
  })

  // "New Software 5~9" 류 — 시트 하단에 미리 만들어 둔 계획 자리표시자. 매출 집계엔 포함돼야
  // 하지만(파서는 건드리지 않는다) CRM 매칭 후보/커버리지 분모에서는 걸러져야 한다.
  it("matches numbered \"New Software N\" / \"New Hardware N\" placeholders", () => {
    expect(isPlaceholderCrmName("New Software 5")).toBe(true)
    expect(isPlaceholderCrmName("New Hardware 3")).toBe(true)
    expect(isPlaceholderCrmName("new software 12")).toBe(true) // 대소문자 무관
    expect(isPlaceholderCrmName("New Hardware 9 (예정)")).toBe(true) // 뒤에 추가 텍스트 허용
  })

  // 숫자 suffix가 없는 "New Software"만으로는 실제 상호일 가능성을 배제할 수 없으므로
  // placeholder로 보지 않는다 — 오탐(실제 고객명을 걸러내는 것) 방지가 우선.
  it("does not treat a bare \"New Software\" (no number) as a placeholder", () => {
    expect(isPlaceholderCrmName("New Software")).toBe(false)
    expect(isPlaceholderCrmName("New Hardware")).toBe(false)
  })

  it("does not false-positive on an unrelated Korean name", () => {
    expect(isPlaceholderCrmName("뉴소프트학원")).toBe(false)
    expect(isPlaceholderCrmName("대치스파르타")).toBe(false)
  })

  it("handles null/undefined/empty input", () => {
    expect(isPlaceholderCrmName(null)).toBe(false)
    expect(isPlaceholderCrmName(undefined)).toBe(false)
    expect(isPlaceholderCrmName("")).toBe(false)
  })
})

describe("CRM alias safety", () => {
  it("does not let generic class/classin aliases promote an unrelated source to 90%", () => {
    const match = scoreCrmEntityMatch({
      sourceName: "갈무",
      targetName: "Classin 내부 테스트",
      targetType: "partner_account",
      targetId: "test-account",
      aliases: [
        {
          alias: "classin",
          targetType: "partner_account",
          targetId: "test-account",
          confidenceBoost: 0.12,
        },
      ],
    })

    expect(match.strategy).not.toBe("alias")
    expect(match.evidence).not.toContain("alias:classin")
    expect(match.score).toBeLessThan(0.9)
  })

  it("does not use a two-character alias without owner scope", () => {
    const match = scoreCrmEntityMatch({
      sourceName: "갈무",
      targetName: "정상 고객",
      targetType: "customer",
      targetId: "customer-1",
      aliases: [{ alias: "갈무", targetType: "customer", targetId: "customer-1" }],
    })

    expect(match.strategy).not.toBe("alias")
    expect(match.score).toBeLessThan(0.9)
  })

  it("recognizes internal Classin and generic test-deal targets without blocking testbed names", () => {
    expect(isUnsafeCrmTargetLabel("Classin 내부 테스트")).toBe(true)
    expect(isUnsafeCrmTargetLabel("클래스인 테스트 고객")).toBe(true)
    expect(isUnsafeCrmTargetLabel("테스트 딜")).toBe(true)
    expect(isUnsafeCrmTargetLabel("테스트베드 아카데미")).toBe(false)
  })
})
