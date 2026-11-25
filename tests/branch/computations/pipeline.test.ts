import { describe, it, expect } from "vitest"
import { dealProbability, pipelineValue, stageOf, listPipeline, listRevRevenue } from "@/lib/branch/computations/pipeline"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD", manager: "Han",
  deal_type: "Direct", status: "New", first_payment: null, product_version: null,
  region: "서울", importance: "A", note: null, contract_target: 0,
  monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "", ...over,
})

describe("pipeline", () => {
  it("contract when firstPayment present", () => { const d = mk({ first_payment: "2026-04-10" }); expect(dealProbability(d)).toBe(1); expect(stageOf(d)).toBe("contract") })
  it("negotiation note", () => { const d = mk({ note: "Negotiation phase" }); expect(dealProbability(d)).toBe(0.7) })
  it("renew + KA cap 0.6", () => { const d = mk({ status: "Renew", importance: "KA" }); expect(dealProbability(d)).toBe(0.5) })
  it("channel reduces base", () => { const d = mk({ deal_type: "Channel" }); expect(dealProbability(d)).toBeCloseTo(0.17, 2) })
  it("pipelineValue multiplies target", () => { const d = mk({ contract_target: 1000, status: "Renew" }); expect(pipelineValue(d)).toBe(400) })
  it("listPipeline filters by team", () => {
    const rows = listPipeline([mk({ id:"a", team:"BD" }), mk({ id:"b", team:"MKT" })], { team: "BD" })
    expect(rows.map((r) => r.id)).toEqual(["a"])
  })
  it("normalizes confirmed CSM placeholder names in pipeline rows and filters", () => {
    const deals = [
      mk({ id: "a", manager: "New 2", team: "CSM", monthly_payments: { "2026-04": 100 } }),
      mk({ id: "b", manager: "Somang", team: "CSM", monthly_payments: { "2026-04": 200 } }),
    ]

    expect(listPipeline(deals, { manager: "minjae" }).map((r) => r.manager)).toEqual(["Minjae"])
    expect(listRevRevenue(deals, { manager: "Minjae" }).map((r) => r.manager)).toEqual(["Minjae"])
  })
  it("F-42: 담당 일치는 summary·매니저별과 같은 branchManagerMatches(대소문자 무시) — 표와 타일이 같은 행을 센다", () => {
    const deals = [
      mk({ id: "a", manager: "예시A", monthly_payments: { "2026-04": 100 } }),
      mk({ id: "b", manager: "예시a", monthly_payments: { "2026-04": 200 } }),
      mk({ id: "c", manager: "예시B", monthly_payments: { "2026-04": 300 } }),
    ]
    expect(listRevRevenue(deals, { manager: "예시A" }).map((r) => r.id).sort()).toEqual(["a", "b"])
    expect(listPipeline(deals, { manager: "예시a" }).map((r) => r.id).sort()).toEqual(["a", "b"])
    // 빈 담당은 거르지 않는다.
    expect(listRevRevenue(deals, { manager: "  " })).toHaveLength(3)
  })
  it("listRevRevenue 행은 읽는 시점 확도 재료(pendingCells·monthWeekMismatch)를 raw 에서 옮긴다", () => {
    const [row] = listRevRevenue([
      mk({
        id: "a",
        monthly_payments: { "2026-11": 50 },
        raw: {
          pendingCells: { "2026-11": [{ week: 4, start: "2026-11-22", amount: 50 }] },
          monthWeekMismatch: { "2026-11": { month: 0, weeks: 50 } },
        },
      }),
    ])
    expect(row.pendingCells).toEqual({ "2026-11": [{ week: 4, start: "2026-11-22", amount: 50 }] })
    expect(row.monthWeekMismatch).toEqual({ "2026-11": { month: 0, weeks: 50 } })
    const [plain] = listRevRevenue([mk({ id: "b", monthly_payments: { "2026-11": 50 } })])
    expect("pendingCells" in plain).toBe(false)
    expect("monthWeekMismatch" in plain).toBe(false)
  })
  it("분기 범위는 KST 영업월로 — 분기 첫날 0~9시 KST 에 지난 분기로 읽지 않는다", () => {
    const rows = listRevRevenue([
      mk({ id: "a", monthly_payments: { "2026-10": 100, "2026-09": 200 }, monthly_red: { "2026-10": true, "2026-09": true } }),
    ], undefined, { period: "Q", now: new Date("2026-09-30T15:30:00.000Z") }) // = 2026-10-01 00:30 KST(3분기 시작)
    expect(rows[0].revenue).toBe(100)
  })
  it("listRevRevenue can scope revenue to a selected month", () => {
    const rows = listRevRevenue([
      mk({
        id: "a",
        customer_name: "A",
        monthly_payments: { "2026-04": 100, "2026-05": 200 },
        monthly_red: { "2026-04": true, "2026-05": true },
      }),
    ], undefined, { period: "M", now: new Date("2026-04-01T00:00:00Z") })

    expect(rows[0].revenue).toBe(100)
  })

  it("listRevRevenue exposes weekly REV cells for dashboard charts", () => {
    const rawRow: unknown[] = Array.from({ length: 24 }, () => null)
    rawRow[14] = 40
    rawRow[15] = 60

    const rows = listRevRevenue([
      mk({
        id: "a",
        customer_name: "A",
        monthly_payments: { "2026-04": 100 },
        raw: { row: rawRow },
      }),
    ])

    expect(rows[0].weeklyPayments["2026-04"]).toEqual([40, 60, 0, 0, 0])
  })

  it("listRevRevenue prefers DB-normalized weekly REV cells when present", () => {
    const rows = listRevRevenue([
      mk({
        id: "a",
        customer_name: "A",
        monthly_payments: { "2026-04": 100 },
        raw: { weeklyPayments: { "2026-04": [10, "20", 0, null, 70] } },
      }),
    ])

    expect(rows[0].weeklyPayments["2026-04"]).toEqual([10, 20, 0, 0, 70])
  })
})
