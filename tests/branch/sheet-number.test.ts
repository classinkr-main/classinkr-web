// 시트 금액 칸 → 숫자(F-28). 실제 숫자(effectiveValue)가 1순위이고, 표시 글자만 있을 때는 회계 괄호·U+2212·
// 전각 엔·통화 접두를 이해한다. 예전 asNumber 규칙(¥₩$€£·쉼표·공백 제거)은 그대로 통과해야 한다.
import { describe, expect, it } from "vitest"
import { isUnparsedSheetAmount, parseSheetAmount, sheetCellAmount } from "@/lib/branch/sheet-number"

describe("parseSheetAmount — 표시 글자", () => {
  it.each([
    ["(1,750)", -1750],
    ["¥(1,750)", -1750],
    ["(¥1,750)", -1750],
    ["−1,750", -1750], // U+2212
    ["–1,750", -1750], // U+2013
    ["￥1,750", 1750],
    ["CN¥1,750", 1750],
    ["CN¥(1,750)", -1750],
    ["RMB 1,750", 1750],
    ["RMB -1,750", -1750],
    ["1,750 元", 1750],
    ["1 750", 1750],
  ])("%s → %s", (text, expected) => {
    expect(parseSheetAmount(text)).toBe(expected)
  })

  it.each([
    ["1,234", 1234],
    ["-¥30", -30],
    ["¥-30", -30],
    ["$1,000.50", 1000.5],
    ["  42  ", 42],
    ["1.00E+03", 1000],
    [0, 0],
    [-30, -30],
  ])("예전 규칙 호환: %s → %s", (value, expected) => {
    expect(parseSheetAmount(value)).toBe(expected)
  })

  it.each([null, undefined, "", " ", "-", "−", "—", "abc", "12%", "#REF!", "(−1,750)", "1,750-", "Infinity", Number.NaN, Number.POSITIVE_INFINITY])(
    "%s → null",
    (value) => {
      expect(parseSheetAmount(value)).toBeNull()
    },
  )
})

describe("sheetCellAmount — 실제 숫자 먼저", () => {
  it("numberValue 가 있으면 표시 형식과 무관하게 그 값이다", () => {
    expect(sheetCellAmount({ value: "(1,750)", numberValue: -1750 })).toBe(-1750)
    expect(sheetCellAmount({ value: "¥1,750", numberValue: 1749.6 })).toBe(1749.6)
    expect(sheetCellAmount({ value: "기타 표기", numberValue: 300 })).toBe(300)
  })

  it("회계 형식의 0('-')은 예전처럼 빈 칸이다 — 명시 0 달이 새로 생기지 않는다", () => {
    expect(sheetCellAmount({ value: "-", numberValue: 0 })).toBeNull()
    expect(sheetCellAmount({ value: "0", numberValue: 0 })).toBe(0)
  })

  it("백분율·날짜·시각 표시는 실제 숫자가 있어도 금액이 아니다(달성률 행 0.85·날짜 일련번호)", () => {
    expect(sheetCellAmount({ value: "85%", numberValue: 0.85 })).toBeNull()
    expect(sheetCellAmount({ value: "2026-04-01", numberValue: 46113 })).toBeNull()
    expect(sheetCellAmount({ value: "4/1", numberValue: 46113 })).toBeNull()
    expect(sheetCellAmount({ value: "9:30", numberValue: 0.395 })).toBeNull()
    // 소수 금액은 날짜가 아니다
    expect(sheetCellAmount({ value: "1.5", numberValue: 1.5 })).toBe(1.5)
    expect(sheetCellAmount({ value: "12.50" })).toBe(12.5)
    expect(isUnparsedSheetAmount({ value: "85%", numberValue: 0.85 })).toBe(false)
    expect(isUnparsedSheetAmount({ value: "85%" })).toBe(false)
  })

  it("numberValue 가 없으면 표시 글자를 읽는다(텍스트 금액·테스트 픽스처)", () => {
    expect(sheetCellAmount({ value: "(1,750)" })).toBe(-1750)
    expect(sheetCellAmount({ value: 500 })).toBe(500)
    expect(sheetCellAmount({ value: null })).toBeNull()
    expect(sheetCellAmount(undefined)).toBeNull()
  })
})

describe("isUnparsedSheetAmount — 동기화 경고 대상", () => {
  it("값이 있는데 못 읽은 칸만 true", () => {
    expect(isUnparsedSheetAmount({ value: "#REF!" })).toBe(true)
    expect(isUnparsedSheetAmount({ value: "확인 필요" })).toBe(true)
    expect(isUnparsedSheetAmount({ value: "(1,750)" })).toBe(false)
    expect(isUnparsedSheetAmount({ value: "-" })).toBe(false)
    expect(isUnparsedSheetAmount({ value: "" })).toBe(false)
    expect(isUnparsedSheetAmount({ value: null })).toBe(false)
    expect(isUnparsedSheetAmount({ value: "글자", numberValue: 3 })).toBe(false)
    expect(isUnparsedSheetAmount(undefined)).toBe(false)
  })
})
