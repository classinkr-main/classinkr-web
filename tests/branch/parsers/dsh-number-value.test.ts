// DSH 파서 금액 읽기(F-28) — 칸의 실제 숫자(numberValue)를 먼저, 없으면 회계 괄호·U+2212 표시도 읽는다.
// 예전에는 '(1,750)' 이 0 으로 사라졌다. 못 읽은 칸은 같은 칸을 한 번만 센다.
import { describe, expect, it } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { dshParseWarning, parseDsh, parseDshWithStats } from "@/lib/branch/parsers/dsh"

const c = (value: string | number | null, numberValue?: number): FormattedCell => ({ value, bg: null, ...(numberValue == null ? {} : { numberValue }) })
const MONTHS = ["4", "5", "6", "7", "8", "9", "10", "11", "12", "1", "2", "3"]
// A=팀 라벨, B=section, C=cat, D=new/renew, E=direct/channel, F=Year, G-J=Q1-Q4, K-V=월
const HEADER = [c(null), c("Section"), c("Cat"), c("N/R"), c("D/C"), c("Year"), c("Q1"), c("Q2"), c("Q3"), c("Q4"), ...MONTHS.map((m) => c(m)), c("Ratio")]

function numericRow(label: string | null, section: string, cat: string, nr: string, dc: string, months: FormattedCell[]): FormattedCell[] {
  const monthCells = MONTHS.map((_, index) => months[index] ?? c(null))
  return [c(label), c(section), c(cat), c(nr), c(dc), c(null), c(null), c(null), c(null), c(null), ...monthCells, c(null)]
}

describe("parseDsh 금액 읽기", () => {
  it("numberValue 와 회계 괄호 표시가 음수로 들어온다(예전에는 0)", () => {
    const grid = [
      HEADER,
      numericRow("Team KR", "Status", "Software", "New", "Direct", [c("(1,750)", -1750), c("−250"), c("¥(100)")]),
    ]
    const out = parseDsh(grid, 2026)
    const status = out.rows.find((row) => row.level === "team" && row.kind === "status")!
    expect(status.months["2026-04"]).toBe(-1750)
    expect(status.months["2026-05"]).toBe(-250)
    expect(status.months["2026-06"]).toBe(-100)
    const breakdown = out.breakdown!.find((row) => row.kind === "status")!
    expect(breakdown.months["2026-04"]).toBe(-1750)
  })

  it("못 읽은 칸을 칸마다 한 번 센다(여러 패스가 같은 칸을 읽어도)", () => {
    const grid = [
      HEADER,
      numericRow("Team KR", "Status", "Software", "New", "Direct", [c("#REF!"), c("-"), c(300)]),
    ]
    const { output, stats } = parseDshWithStats(grid, 2026)
    expect(stats.unparsedAmountCells).toBe(1)
    expect(stats.unparsedSamples).toEqual([{ row: 2, col: 10, text: "#REF!" }])
    expect(dshParseWarning(stats)).toBe("DSH 금액으로 못 읽은 칸 1개(2행 '#REF!')")
    expect(output.rows.find((row) => row.kind === "status")!.months["2026-06"]).toBe(300)
    expect(dshParseWarning({ unparsedAmountCells: 0, unparsedSamples: [] })).toBeUndefined()
  })
})
