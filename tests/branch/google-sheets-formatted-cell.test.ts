// readRangeWithFormat 은 effectiveValue 도 요청해 숫자 칸에 numberValue 를 싣는다(F-28). 표시 글자(value)는 그대로다.
import { describe, expect, it } from "vitest"
import { FORMATTED_CELL_FIELDS, toFormattedCell } from "@/lib/branch/google-sheets"

describe("toFormattedCell", () => {
  it("숫자 칸은 표시 글자와 실제 숫자를 함께 싣는다", () => {
    expect(toFormattedCell({ formattedValue: "(1,750)", effectiveValue: { numberValue: -1750 } })).toEqual({
      value: "(1,750)", bg: null, fg: null, numberValue: -1750,
    })
  })

  it("텍스트·빈 칸은 numberValue 키를 싣지 않는다", () => {
    const text = toFormattedCell({ formattedValue: "Account", effectiveValue: {} })
    expect(text).toEqual({ value: "Account", bg: null, fg: null })
    expect("numberValue" in text).toBe(false)
    expect(toFormattedCell({})).toEqual({ value: null, bg: null, fg: null })
  })

  it("표시 글자가 없으면 입력값으로 폴백(기존 동작)하고 색은 그대로 옮긴다", () => {
    const fg = { red: 1 }
    expect(toFormattedCell({ userEnteredValue: { numberValue: 5 }, effectiveValue: { numberValue: 5 }, effectiveFormat: { textFormat: { foregroundColor: fg } } }))
      .toEqual({ value: 5, bg: null, fg, numberValue: 5 })
  })

  it("요청 필드에 effectiveValue 가 들어 있다", () => {
    expect(FORMATTED_CELL_FIELDS).toContain("effectiveValue")
    expect(FORMATTED_CELL_FIELDS).toContain("formattedValue")
    expect(FORMATTED_CELL_FIELDS).toContain("effectiveFormat.textFormat.foregroundColor")
  })
})
