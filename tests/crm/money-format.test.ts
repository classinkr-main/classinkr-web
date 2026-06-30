import { describe, expect, it } from "vitest"

import { formatCNY, formatUSD } from "@/lib/crm/money-format"

describe("formatCNY", () => {
  it("1만 이상은 만단위 2자리로 표기한다", () => {
    expect(formatCNY(12345)).toBe("¥1.23만")
    expect(formatCNY(1_000_000)).toBe("¥100.00만")
  })

  it("1만 미만은 원 단위로 표기한다", () => {
    expect(formatCNY(5000)).toBe("¥5,000")
    expect(formatCNY(0)).toBe("¥0")
  })

  it("값이 없으면 '-'", () => {
    expect(formatCNY(null)).toBe("-")
    expect(formatCNY(undefined)).toBe("-")
    expect(formatCNY(Number.NaN)).toBe("-")
  })
})

describe("formatUSD", () => {
  it("달러로 표기한다", () => {
    expect(formatUSD(1500.5)).toBe("$1,500.5")
    expect(formatUSD(0)).toBe("$0")
  })

  it("값이 없으면 '-'", () => {
    expect(formatUSD(null)).toBe("-")
    expect(formatUSD(undefined)).toBe("-")
  })
})
