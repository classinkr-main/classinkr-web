import { describe, it, expect } from "vitest"
import { isPlaceholderCrmName } from "@/lib/crm-source-linking"

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
