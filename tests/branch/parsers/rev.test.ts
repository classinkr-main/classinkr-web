import { describe, it, expect } from "vitest"
import fixture from "../fixtures/rev-sample.json"
import { parseRev, normalizeMonthHeader, normalizeTeam } from "@/lib/branch/parsers/rev"
import type { FormattedCell } from "@/lib/branch/google-sheets"

const grid = fixture as unknown as FormattedCell[][]

const cell = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
// 인덱스 지정 셀 행 — 월/주차 헤더가 특정 열에 오도록 희소 배열을 만든다.
function makeRow(values: Record<number, string | number | null>, len: number): FormattedCell[] {
  return Array.from({ length: len }, (_, i) => cell(values[i] ?? null))
}

describe("parseRev", () => {
  it("skips header row, parses customer rows", () => {
    const out = parseRev(grid, { refFy: 2026 })
    expect(out).toHaveLength(2)
    expect(out[0].customer_name).toBe("학원A")
    expect(out[0].team).toBe("BD")
    expect(out[0].manager).toBe("Han")
    expect(out[0].first_payment).toBe("2026-04-15")
    expect(out[0].importance).toBe("KA")
    expect(out[0].contract_target).toBe(12000000)
  })
  it("captures monthly payments + red flags", () => {
    const out = parseRev(grid, { refFy: 2026 })
    expect(out[0].monthly_payments["2026-04"]).toBe(4000000)
    expect(out[0].monthly_payments["2026-06"]).toBe(4000000)
    expect(out[0].monthly_red["2026-04"]).toBe(true)
    expect(out[0].monthly_red["2026-05"]).toBe(true)
    expect(out[0].monthly_red["2026-06"]).toBeUndefined()
  })
  it("blank first_payment becomes null", () => {
    const out = parseRev(grid, { refFy: 2026 })
    expect(out[1].first_payment).toBeNull()
  })
  it("normalizeMonthHeader handles YYYY-MM and '4월' and numeric month", () => {
    expect(normalizeMonthHeader("2026-04", 2026)).toBe("2026-04")
    expect(normalizeMonthHeader("4월", 2026)).toBe("2026-04")
    expect(normalizeMonthHeader("3", 2026)).toBe("2027-03")  // FY 회계연도 기준
    expect(normalizeMonthHeader("invalid", 2026)).toBeNull()
  })
  it("normalizeTeam aliases", () => {
    expect(normalizeTeam("MK")).toBe("MKT")
    expect(normalizeTeam("Marketing")).toBe("MKT")
    expect(normalizeTeam("마케팅")).toBe("MKT")
    expect(normalizeTeam("CS")).toBe("CSM")
    expect(normalizeTeam("BD")).toBe("BD")
    expect(normalizeTeam("Unknown Team")).toBe("기타")
    expect(normalizeTeam("")).toBeNull()
    expect(normalizeTeam(null)).toBeNull()
  })

  // 주차 실수치는 헤더로 찾은 실제 열(block.weekIdxs)에서 직접 읽어야 한다.
  // 월 블록의 주차 칸 수가 불균일해도(여기선 5월=4칸) 그 뒤 월(6월)의 값이 밀리면 안 된다 —
  // 고정 오프셋(월당 6칸 가정) 방식이었다면 여기서 6월 주차가 어긋나 읽혔다.
  it("weekly_payments: reads actual week columns, tolerates non-uniform block width", () => {
    const header = makeRow(
      {
        13: "4", 14: "w1", 15: "w2", 16: "w3", 17: "w4", 18: "w5",
        19: "5", 20: "w1", 21: "w2", 22: "w3", 23: "w4", // 5월은 주차 4칸뿐
        24: "6", 25: "w1", 26: "w2", 27: "w3", 28: "w4", 29: "w5",
      },
      30,
    )
    const dataRow = makeRow(
      {
        0: "주차테스트", 2: "BD", 3: "Han",
        13: 90910, 16: 90910, // 4월: 합계 + w3
        19: 2000, 20: 500, 21: 500, 22: 500, 23: 500, // 5월: 합계 + 4주
        24: 9000, 25: 3000, 26: 3000, 27: 3000, // 6월: 합계 + 3주(w4·w5=0)
      },
      30,
    )
    const out = parseRev([makeRow({ 0: "title" }, 30), header, dataRow], { refFy: 2026 })
    expect(out).toHaveLength(1)
    expect(out[0].monthly_payments).toEqual({ "2026-04": 90910, "2026-05": 2000, "2026-06": 9000 })
    expect(out[0].weekly_payments["2026-04"]).toEqual([0, 0, 90910, 0, 0])
    expect(out[0].weekly_payments["2026-05"]).toEqual([500, 500, 500, 500]) // 4칸 그대로 — 밀림 없음
    expect(out[0].weekly_payments["2026-06"]).toEqual([3000, 3000, 3000, 0, 0])
    // pipeline이 우선 사용하는 raw.weeklyPayments 핸드오프도 함께 보장
    expect((out[0].raw as { weeklyPayments: Record<string, number[]> }).weeklyPayments["2026-05"]).toEqual([500, 500, 500, 500])
  })

  it("weekly_payments: month total with no week entries yields no weekly array", () => {
    const header = makeRow({ 13: "4", 14: "w1", 15: "w2", 16: "w3", 17: "w4", 18: "w5" }, 19)
    const dataRow = makeRow({ 0: "월합계만", 2: "BD", 13: 5000 }, 19) // 합계만, 주차 공란
    const out = parseRev([makeRow({ 0: "title" }, 19), header, dataRow], { refFy: 2026 })
    expect(out[0].monthly_payments["2026-04"]).toBe(5000)
    expect(out[0].weekly_payments["2026-04"]).toBeUndefined()
  })
})
