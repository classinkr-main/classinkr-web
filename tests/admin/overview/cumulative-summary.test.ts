import { describe, expect, it } from "vitest"
import {
  buildCumulativeSeries,
  firstPaidYm,
  koreaYm,
  summarizeCumulativeCustomers,
  summarizeCumulativeUnits,
  type CumulativeCustomerDealInput,
} from "@/lib/admin/overview/cumulative-summary"

// 2026-11-30 23:30 KST = UTC 14:30 — 월 경계를 KST로 본다.
const NOW = new Date("2026-11-30T14:30:00Z")

const deal = (name: string, overrides: Partial<CumulativeCustomerDealInput> = {}): CumulativeCustomerDealInput => ({
  customer_name: name,
  status: "New",
  first_payment: null,
  monthly_payments: {},
  monthly_confirmed: {},
  monthly_red: {},
  monthly_high_conf: {},
  ...overrides,
})

describe("누적 지표 — 날짜·추이", () => {
  it("KST 기준 월을 쓴다", () => {
    expect(koreaYm(NOW)).toBe("2026-11")
    expect(koreaYm(new Date("2026-11-30T15:00:00Z"))).toBe("2026-12")
  })

  it("창 이전 분량은 첫 달 누적에 싣고 마지막 달 누적이 전체가 된다", () => {
    const series = buildCumulativeSeries(new Map([["2020-01", 5], ["2026-10", 2], ["2026-11", 1]]), "2026-11", 3)
    expect(series).toEqual([
      { ym: "2026-09", added: 0, cumulative: 5 },
      { ym: "2026-10", added: 2, cumulative: 7 },
      { ym: "2026-11", added: 1, cumulative: 8 },
    ])
  })
})

describe("누적 고객 — REV 장부", () => {
  it("첫 결제일과 확정 월 중 이른 쪽을 첫 결제 월로 본다", () => {
    const row = deal("A", { first_payment: "2026-06-10", monthly_payments: { "2026-05": 100 }, monthly_confirmed: { "2026-05": 100 } })
    expect(firstPaidYm(row, "2026-11")).toBe("2026-05")
  })

  it("확정이 아닌(예정·고확도) 금액만 있는 행은 고객으로 세지 않는다", () => {
    const row = deal("B", { monthly_payments: { "2026-12": 300 }, monthly_high_conf: { "2026-12": 300 } })
    expect(firstPaidYm(row, "2026-11")).toBeNull()
  })

  it("기관 키로 중복을 접고, 취소·해지 행과 결제 이력 없는 행은 빼며, 회계연도·이번 달 증가를 센다", () => {
    const result = summarizeCumulativeCustomers([
      deal("가나 학원", { first_payment: "2023-03-02" }),
      deal("가나학원", { status: "Renew", first_payment: "2026-05-01" }), // 같은 기관 — 이른 달(2023-03)이 남는다
      deal("다라", { first_payment: "2026-04-15" }),
      deal("마바", { monthly_payments: { "2026-11": 50 }, monthly_confirmed: { "2026-11": 50 } }),
      deal("사아", { status: "해지", first_payment: "2025-01-01" }),
      deal("자차", { monthly_payments: { "2027-01": 80 } }), // 미래 월 · 확정 아님
      deal("카타", { first_payment: "미정" }), // 값은 있으나 날짜가 아님
    ], NOW, 2026)
    expect(result.total).toBe(4)
    expect(result.undatedCount).toBe(1)
    expect(result.fyAdded).toBe(2)
    expect(result.monthAdded).toBe(1)
    expect(result.ledgerFiscalYear).toBe(2026)
    expect(result.series.at(-1)).toEqual({ ym: "2026-11", added: 1, cumulative: 3 })
  })
})

describe("누적 판매 대수 — 하드웨어 원장", () => {
  it("실판매 출고만 더하고 예정·회수는 따로, 날짜 없는 출고는 전체에만 넣는다", () => {
    const result = summarizeCumulativeUnits([
      { kind: "installed", quantity: 3, occurred_at: "2024-04-02" },
      { kind: "installed", quantity: 2, occurred_at: "2026-04-10" },
      { kind: "installed", quantity: 1, occurred_at: "2026-11-01" },
      { kind: "installed", quantity: 4, occurred_at: null },
      { kind: "planned", quantity: 5, occurred_at: "2026-12-01" },
      { kind: "returned", quantity: 1, occurred_at: "2026-06-01" },
      { kind: "promotionInstalled", quantity: 9, occurred_at: "2026-06-01" },
    ], NOW)
    expect(result.total).toBe(10)
    expect(result.undated).toBe(4)
    expect(result.planned).toBe(5)
    expect(result.returned).toBe(1)
    expect(result.fyAdded).toBe(3)
    expect(result.monthAdded).toBe(1)
    expect(result.firstYm).toBe("2024-04")
    expect(result.series.at(-1)?.cumulative).toBe(6)
  })
})
