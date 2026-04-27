import { describe, it, expect } from "vitest"
import fixture from "../fixtures/rev-sample.json"
import { parseRev, normalizeMonthHeader } from "@/lib/branch/parsers/rev"
import type { FormattedCell } from "@/lib/branch/google-sheets"

const grid = fixture as unknown as FormattedCell[][]

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
})
