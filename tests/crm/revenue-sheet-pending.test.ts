/* 매출시트 '확정 예정'(ADR-0062) — REV 파서 raw.monthlyPending/pendingWeeks → 행·월 금액·다음 전환 시점.
 *  예정분은 캐논 분해의 예상(expected) 몫 안에서만 떼어 내므로 합계는 그대로다(이중 계상 없음). */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { parseRev } from "@/lib/branch/parsers/rev"
import { splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import { nextPendingTransition, pendingMonthAmount } from "@/lib/crm/revenue-sheet-pending"

const RED = { red: 1, green: 0, blue: 0 }
const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const red = (value: number): FormattedCell => ({ value, bg: null, fg: RED })
const HEADER: FormattedCell[] = [
  ...["Account", "Branch", "City", "Scale", "Porta", "Team", "Manager", "Status", "Type", "Product", "First Payment", "Note", "Target"].map(plain),
  plain("10"), plain("w1"), plain("w2"), plain("w3"), plain("w4"), plain("w5"),
]
const meta = ["학원A", null, null, null, null, "BD", "Han", "New", null, null, null, null, null].map(plain)

describe("pendingMonthAmount — 미확정분 안에서만 예정 몫을 뗀다", () => {
  it("당월 이후만, 미확정분을 넘지 않게", () => {
    const source = { pending: { "2026-10": 500, "2026-09": 300 } }
    expect(pendingMonthAmount(source, "2026-10", 800, "2026-10")).toBe(500)
    expect(pendingMonthAmount(source, "2026-10", 200, "2026-10")).toBe(200)
    expect(pendingMonthAmount(source, "2026-09", 800, "2026-10")).toBe(0)
    expect(pendingMonthAmount({ pending: null }, "2026-10", 800, "2026-10")).toBe(0)
    expect(pendingMonthAmount(source, "2026-10", 0, "2026-10")).toBe(0)
  })
})

describe("nextPendingTransition — 가장 이른 예정 칸의 주차·시작일", () => {
  it("여러 달 중 가장 이른 시작일, 월 합계 칸은 week 0 = 1일", () => {
    const source = { pending_weeks: { "2026-10": [5, 4], "2026-11": [0] } }
    expect(nextPendingTransition(source, ["2026-11", "2026-10"])).toEqual({ week: 4, start: "2026-10-22" })
    expect(nextPendingTransition(source, ["2026-11"])).toEqual({ week: 0, start: "2026-11-01" })
    expect(nextPendingTransition({ pending_weeks: null }, ["2026-10"])).toBeNull()
  })
})

describe("파서 → 캐논 → 예정 분해 왕복", () => {
  it("10/16: 확정 400 · 확정 예정 46,970 · 무색 예정 900 — 합계 보존", () => {
    const grid = [[plain("REV")], HEADER, [...meta, plain(null), red(100), plain(900), red(300), red(46250), red(720)]]
    const [d] = parseRev(grid, { refFy: 2026, today: "2026-10-16" })
    const deal = { ...d, pending: d.raw.monthlyPending as Record<string, number>, pending_weeks: d.raw.pendingWeeks as Record<string, number[]> }
    const total = d.monthly_payments["2026-10"]
    const split = splitMonthConfidence(deal, "2026-10", total, undefined, "2026-10")
    const pending = pendingMonthAmount(deal, "2026-10", split.expected, "2026-10")
    expect(split.confirmed).toBe(400)
    expect(pending).toBe(46970)
    expect(split.expected - pending).toBe(900)
    expect(split.confirmed + split.highConfidence + split.expected).toBe(total)
    expect(nextPendingTransition(deal, ["2026-10"])).toEqual({ week: 4, start: "2026-10-22" })
  })
})

describe("워크스페이스가 raw 전체가 아니라 예정 경로만 읽는다(소스 계약)", () => {
  const src = readFileSync("lib/admin-crm-revenue-sheet.ts", "utf8")
  it("select에 pending:raw->monthlyPending, pending_weeks:raw->pendingWeeks", () => {
    expect(src).toContain("pending:raw->monthlyPending, pending_weeks:raw->pendingWeeks")
    expect(src).not.toMatch(/monthly_high_conf, raw,/)
  })
})
