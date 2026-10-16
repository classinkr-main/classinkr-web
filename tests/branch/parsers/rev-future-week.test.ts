/* REV 원장의 빨간 금액 중 아직 오지 않은 주차는 확정이 아니라 예정(Compass ADR-0062 이식, 2026-10-16).
 *  ① 순수 헬퍼(ledgerCellStart·isFutureLedgerCell) ② parseRev가 주간 칸·월 합계 칸을 같은 판정으로 거르는지
 *  ③ 캐논(rev-confirmed.ts)에서 예정분이 확정이 아니라 예상(expected)으로 남는지. */
import { describe, expect, it } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { isFutureLedgerCell, ledgerCellStart, parseRev } from "@/lib/branch/parsers/rev"
import { splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"

const RED = { red: 1, green: 0, blue: 0 }
const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const red = (value: number): FormattedCell => ({ value, bg: null, fg: RED })

// 헤더: 0 Account … 12까지 메타, 13 = 월 "10", 14~18 = w1~w5
const HEADER: FormattedCell[] = [
  ...["Account", "Branch", "City", "Scale", "Porta", "Team", "Manager", "Status", "Type", "Product", "First Payment", "Note", "Target"].map(plain),
  plain("10"), plain("w1"), plain("w2"), plain("w3"), plain("w4"), plain("w5"),
]
function grid(monthCell: FormattedCell, weeks: FormattedCell[]): FormattedCell[][] {
  const meta = ["학원A", null, null, null, null, "BD", "Han", "New", null, null, null, null, null].map(plain)
  return [[plain("REV")], HEADER, [...meta, monthCell, ...weeks]]
}

describe("① 원장 주차 → 시작일 · 오늘 뒤면 예정", () => {
  it("w1 = 1일 · w2 = 8일 · w3 = 15일 · w4 = 22일 · w5 = 29일 · 월 칸(0) = 1일", () => {
    expect([0, 1, 2, 3, 4, 5].map((w) => ledgerCellStart("2026-10", w))).toEqual([
      "2026-10-01", "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29",
    ])
  })
  it("10/16에는 10월 3주까지 확정, 4·5주와 11월은 예정, 9월은 전부 확정", () => {
    const today = "2026-10-16"
    expect([1, 2, 3].map((w) => isFutureLedgerCell("2026-10", w, today))).toEqual([false, false, false])
    expect([4, 5].map((w) => isFutureLedgerCell("2026-10", w, today))).toEqual([true, true])
    expect(isFutureLedgerCell("2026-10", 0, today)).toBe(false)
    expect(isFutureLedgerCell("2026-11", 0, today)).toBe(true)
    expect(isFutureLedgerCell("2026-11", 1, today)).toBe(true)
    expect([1, 2, 3, 4, 5].map((w) => isFutureLedgerCell("2026-09", w, today))).toEqual([false, false, false, false, false])
    // 주차 시작일 당일부터 확정
    expect(isFutureLedgerCell("2026-10", 4, "2026-10-22")).toBe(false)
    expect(isFutureLedgerCell("2026-10", 4, "2026-10-21")).toBe(true)
  })
})

describe("② parseRev가 미래 주차 빨간 금액을 확정에서 뺀다", () => {
  const g = grid(plain(null), [red(100), plain(null), red(300), red(46250), red(720)])

  it("10/16: w1·w3만 확정, w4·w5는 예정(raw.monthlyPending)", () => {
    const [d] = parseRev(g, { refFy: 2026, today: "2026-10-16" })
    expect(d.monthly_payments["2026-10"]).toBe(100 + 300 + 46250 + 720)
    expect(d.monthly_confirmed["2026-10"]).toBe(400)
    expect(d.monthly_red["2026-10"]).toBe(true)
    expect((d.raw.monthlyPending as Record<string, number>)["2026-10"]).toBe(46970)
  })
  it("그 주가 오면 확정으로 올라간다(10/29 → 전부 확정, 예정 없음)", () => {
    const [d] = parseRev(g, { refFy: 2026, today: "2026-10-29" })
    expect(d.monthly_confirmed["2026-10"]).toBe(47370)
    expect(d.raw.monthlyPending).toEqual({})
  })
  it("빨간 칸이 전부 예정이면 확정 0을 명시해 무색상 폴백(당월 전액 확정)을 막는다", () => {
    const [d] = parseRev(grid(plain(null), [plain(null), plain(null), plain(null), red(500), plain(null)]), {
      refFy: 2026,
      today: "2026-10-16",
    })
    expect(d.monthly_confirmed["2026-10"]).toBe(0)
    expect(d.monthly_red["2026-10"]).toBeUndefined()
    const split = splitMonthConfidence(d, "2026-10", d.monthly_payments["2026-10"], undefined, "2026-10")
    expect(split.confirmed).toBe(0)
    expect(split.expected).toBe(500)
  })
  it("주차 입력 없이 월 합계 칸만 빨간 행: 그 달 1일이 오늘 뒤일 때만 예정", () => {
    const g2 = grid(red(9000), [plain(null), plain(null), plain(null), plain(null), plain(null)])
    expect(parseRev(g2, { refFy: 2026, today: "2026-10-16" })[0].monthly_confirmed["2026-10"]).toBe(9000)
    const [future] = parseRev(g2, { refFy: 2026, today: "2026-09-30" })
    expect(future.monthly_confirmed["2026-10"]).toBe(0)
    expect((future.raw.monthlyPending as Record<string, number>)["2026-10"]).toBe(9000)
  })
})

describe("③ 캐논 분해에서 예정분은 예상(expected)으로 남는다", () => {
  it("확정 400 · 예상 46,970", () => {
    const [d] = parseRev(grid(plain(null), [red(100), plain(null), red(300), red(46250), red(720)]), {
      refFy: 2026,
      today: "2026-10-16",
    })
    const split = splitMonthConfidence(d, "2026-10", d.monthly_payments["2026-10"], undefined, "2026-10")
    expect(split).toEqual({ confirmed: 400, highConfidence: 0, expected: 46970 })
  })
})
