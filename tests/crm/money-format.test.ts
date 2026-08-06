import { describe, expect, it } from "vitest"

import {
  CRM_VIP_THRESHOLD,
  formatCNY,
  formatCrmMoney,
  formatUSD,
  isCrmVipMoney,
} from "@/lib/crm/money-format"

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

describe("formatCrmMoney", () => {
  it("통화에 맞는 기호로 표기한다 — 하드코딩 ₩ 접두사를 대체", () => {
    expect(formatCrmMoney({ amount: 12_345, currency: "CNY" })).toBe("¥1.23만")
    expect(formatCrmMoney({ amount: 1_500.5, currency: "USD" })).toBe("$1,500.5")
    expect(formatCrmMoney({ amount: 35_000_000, currency: "KRW" })).toBe("₩3,500만")
  })

  it("값이 없으면 '-'", () => {
    expect(formatCrmMoney(null)).toBe("-")
    expect(formatCrmMoney({ amount: Number.NaN, currency: "KRW" })).toBe("-")
  })
})

describe("isCrmVipMoney", () => {
  // 통화 구분 없이 임계값 하나(30,000,000)를 쓰던 시절의 버그를 고정한다:
  // ₩3천5백만 견적 한 건이면 VIP가 되고, ¥ 고객은 사실상 도달 불가능한 선이 됐다.
  it("원화 견적 기준선은 ₩3천만", () => {
    expect(isCrmVipMoney({ amount: 35_000_000, currency: "KRW" })).toBe(true)
    expect(isCrmVipMoney({ amount: 29_000_000, currency: "KRW" })).toBe(false)
  })

  it("¥ 고객은 원화 기준선이 아니라 CNY 기준선으로 판정한다", () => {
    // 예전 규칙이라면 ¥20만은 30,000,000 미만이라 VIP가 아니었다.
    expect(isCrmVipMoney({ amount: 200_000, currency: "CNY" })).toBe(true)
    expect(isCrmVipMoney({ amount: 100_000, currency: "CNY" })).toBe(false)
  })

  it("$ 오더도 자체 기준선을 쓴다", () => {
    expect(isCrmVipMoney({ amount: 25_000, currency: "USD" })).toBe(true)
    expect(isCrmVipMoney({ amount: 10_000, currency: "USD" })).toBe(false)
  })

  it("금액이 없으면 VIP가 아니다", () => {
    expect(isCrmVipMoney(null)).toBe(false)
    expect(isCrmVipMoney({ amount: Number.NaN, currency: "CNY" })).toBe(false)
  })

  it("통화별 기준선은 서로 다른 값이어야 한다(하나로 합치면 이 버그가 재발한다)", () => {
    const values = new Set(Object.values(CRM_VIP_THRESHOLD))
    expect(values.size).toBe(3)
  })
})
