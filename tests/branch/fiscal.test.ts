import { describe, it, expect } from "vitest"
import {
  fyOf,
  fyStart,
  fiscalQuarter,
  fiscalMonthIndex,
  ymKey,
  parseYmMonth,
  dateFromYmMonth,
  resolvePeriodDate,
  FISCAL_MONTH_ORDER,
} from "@/lib/branch/fiscal"

describe("fiscal", () => {
  it("FY starts April 1", () => {
    expect(fyOf(new Date("2026-04-01"))).toBe(2026)
    expect(fyOf(new Date("2027-03-31"))).toBe(2026)
    expect(fyOf(new Date("2026-03-31"))).toBe(2025)
  })
  it("fyStart returns April 1 of the FY", () => {
    expect(fyStart(new Date("2026-12-15")).toISOString().slice(0,10)).toBe("2026-04-01")
    expect(fyStart(new Date("2027-01-15")).toISOString().slice(0,10)).toBe("2026-04-01")
  })
  it("quarters", () => {
    expect(fiscalQuarter(4)).toBe(1); expect(fiscalQuarter(6)).toBe(1)
    expect(fiscalQuarter(7)).toBe(2); expect(fiscalQuarter(9)).toBe(2)
    expect(fiscalQuarter(12)).toBe(3); expect(fiscalQuarter(1)).toBe(4); expect(fiscalQuarter(3)).toBe(4)
  })
  it("month index follows FY order", () => {
    expect(FISCAL_MONTH_ORDER).toEqual([4,5,6,7,8,9,10,11,12,1,2,3])
    expect(fiscalMonthIndex(4)).toBe(0)
    expect(fiscalMonthIndex(3)).toBe(11)
  })
  it("ymKey", () => { expect(ymKey(new Date("2026-04-09"))).toBe("2026-04") })
  it("parses YYYY-MM month selectors", () => {
    expect(parseYmMonth("2026-04")).toBe("2026-04")
    expect(parseYmMonth("2026-4")).toBeNull()
    expect(parseYmMonth("2026-13")).toBeNull()
    expect(dateFromYmMonth("2026-04").toISOString().slice(0, 10)).toBe("2026-04-01")
  })
  it("resolves a selected month only for monthly scope", () => {
    const fallback = new Date("2026-05-15T00:00:00Z")
    expect(resolvePeriodDate("M", "2026-04", fallback)?.toISOString().slice(0, 10)).toBe("2026-04-01")
    expect(resolvePeriodDate("Q", "2026-04", fallback)?.toISOString()).toBe(fallback.toISOString())
    expect(resolvePeriodDate("M", "bad", fallback)).toBeNull()
  })
})
