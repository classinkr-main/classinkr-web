import { describe, it, expect } from "vitest"
import { parseKpi } from "@/lib/branch/parsers/kpi"
import type { FormattedCell } from "@/lib/branch/google-sheets"

describe("parseKpi", () => {
  it("maps E-I goals (cols 4-8) and O-S actuals (cols 14-18), skips Sum row", () => {
    const empty: FormattedCell = { value: "", bg: null }
    // Row 0: section headers (ignored by parser — loop starts at r=2)
    // Row 1: column headers (ignored by parser — loop starts at r=2)
    // Row 2: "Sum" totals row — must be skipped
    // Row 3: member "Han"
    const grid: FormattedCell[][] = [
      Array(25).fill(empty),  // row 0
      Array(25).fill(empty),  // row 1
    ]
    // Row 2: Sum totals row — should be skipped
    const sumRow: FormattedCell[] = Array(25).fill(empty).map(() => ({ value: "", bg: null }))
    sumRow[0] = { value: "Sum", bg: null }
    sumRow[4] = { value: 999, bg: null }
    grid.push(sumRow)
    // Row 3: member Han
    const row: FormattedCell[] = Array(25).fill(empty).map(() => ({ value: "", bg: null }))
    row[0] = { value: "Han", bg: null }
    // Goal cols 4-8: LD=10, ACC=20, OPP=30, SOL=40, VST=50
    row[4] = { value: 10, bg: null }; row[5] = { value: 20, bg: null }; row[6] = { value: 30, bg: null }
    row[7] = { value: 40, bg: null }; row[8] = { value: 50, bg: null }
    // Actual cols 14-18: LD=5, ACC=18, OPP=27, SOL=36, VST=22
    row[14] = { value: 5, bg: null }; row[15] = { value: 18, bg: null }; row[16] = { value: 27, bg: null }
    row[17] = { value: 36, bg: null }; row[18] = { value: 22, bg: null }
    grid.push(row)

    const out = parseKpi(grid)
    expect(out).toHaveLength(1)
    expect(out[0].member).toBe("Han")
    expect(out[0].pairs.LD).toEqual({ goal: 10, actual: 5 })
    expect(out[0].pairs.ACC).toEqual({ goal: 20, actual: 18 })
    expect(out[0].pairs.OPP).toEqual({ goal: 30, actual: 27 })
    expect(out[0].pairs.SOL).toEqual({ goal: 40, actual: 36 })
    expect(out[0].pairs.VST).toEqual({ goal: 50, actual: 22 })
  })

  it("treats missing OPP/SOL/VST as 0", () => {
    const empty: FormattedCell = { value: "", bg: null }
    const grid: FormattedCell[][] = [Array(20).fill(empty), Array(20).fill(empty), Array(20).fill(empty)]
    const row: FormattedCell[] = Array(20).fill(empty).map(() => ({ value: "", bg: null }))
    row[0] = { value: "Wangchan", bg: null }
    row[4] = { value: 5, bg: null }; row[14] = { value: 3, bg: null }
    grid.push(row)
    const out = parseKpi(grid)
    expect(out[0].member).toBe("Wangchan")
    expect(out[0].pairs.LD).toEqual({ goal: 5, actual: 3 })
    expect(out[0].pairs.OPP).toEqual({ goal: 0, actual: 0 })
  })
})
