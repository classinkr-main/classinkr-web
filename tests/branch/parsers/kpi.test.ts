import { describe, it, expect } from "vitest"
import { parseKpi } from "@/lib/branch/parsers/kpi"
import type { FormattedCell } from "@/lib/branch/google-sheets"

describe("parseKpi", () => {
  it("maps B-F goals and V-Z actuals", () => {
    const empty: FormattedCell = { value: "", bg: null }
    const grid: FormattedCell[][] = [Array(30).fill(empty)]
    const row: FormattedCell[] = Array(30).fill(empty).map(() => ({ value: "", bg: null }))
    row[0] = { value: "Han", bg: null }
    row[1] = { value: 10, bg: null }; row[2] = { value: 20, bg: null }; row[3] = { value: 30, bg: null }; row[4] = { value: 40, bg: null }; row[5] = { value: 50, bg: null }
    row[21] = { value: 5, bg: null }; row[22] = { value: 18, bg: null }; row[23] = { value: 27, bg: null }; row[24] = { value: 36, bg: null }; row[25] = { value: 22, bg: null }
    grid.push(row)
    const out = parseKpi(grid)
    expect(out[0].member).toBe("Han")
    expect(out[0].pairs.LD).toEqual({ goal: 10, actual: 5 })
    expect(out[0].pairs.VST).toEqual({ goal: 50, actual: 22 })
  })
})
