import { describe, it, expect } from "vitest"
import { parseSeg } from "@/lib/branch/parsers/seg"
import type { FormattedCell } from "@/lib/branch/google-sheets"

describe("parseSeg", () => {
  it("aligns goal vs status by region", () => {
    const empty: FormattedCell = { value: "", bg: null }
    const grid: FormattedCell[][] = [Array(20).fill(empty)]
    const row: FormattedCell[] = Array(20).fill(empty).map((c) => ({ ...c }))
    row[11] = { value: "서울", bg: null }
    row[12] = { value: 1000, bg: null }
    row[16] = { value: "서울", bg: null }
    row[17] = { value: 600, bg: null }
    grid.push(row)
    const rows = parseSeg(grid)
    expect(rows.find((r) => r.region === "서울")).toEqual({ region: "서울", goal: 1000, status: 600 })
  })
})
