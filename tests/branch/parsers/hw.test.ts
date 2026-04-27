import { describe, it, expect } from "vitest"
import { parseInbound, parseStock, parseSalesMonthly } from "@/lib/branch/parsers/hw"
import type { FormattedCell } from "@/lib/branch/google-sheets"

const c = (value: unknown): FormattedCell => ({ value: value as string | number | null, bg: null })

describe("hw parsers", () => {
  it("inbound", () => {
    const grid: FormattedCell[][] = [
      Array(10).fill(c("")),
      [c("L001"), c("2026-04-10"), c('86" IFP'), c(10), c(800000), c(8000000), c("S1,S2"), c("창고A"), c("수입자K"), c("")],
    ]
    const out = parseInbound(grid)
    expect(out[0].product).toBe('86" IFP')
    expect(out[0].quantity).toBe(10)
    expect(out[0].serials).toEqual(["S1", "S2"])
  })
  it("stock skips header band", () => {
    const grid: FormattedCell[][] = [
      [c("메모"), c(""), c("")],
      [c("재고 현황"), c(""), c("")],
      [c('86" IFP'), c("IFP"), c(4)],
    ]
    expect(parseStock(grid)[0]).toMatchObject({ product: '86" IFP', quantity: 4 })
  })
  it("salesMonthly maps FY months", () => {
    const grid: FormattedCell[][] = [
      Array(13).fill(c("")),
      [c('86" IFP'), ...Array(12).fill(c(1))],
    ]
    const out = parseSalesMonthly(grid, 2026)
    expect(out).toHaveLength(12)
    expect(out[0]).toMatchObject({ fiscal_year: 2026, fiscal_month: 4, product: '86" IFP', quantity: 1 })
    expect(out[11]).toMatchObject({ fiscal_year: 2026, fiscal_month: 3 })
  })
})
