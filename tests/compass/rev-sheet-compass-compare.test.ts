import { describe, expect, it, vi, beforeEach } from "vitest"

// M8 — rev-sheet "Compass 대조" 배지의 합계 대조 계산 단위 테스트.
// getCompassRevenueCompare(monthlyPoints)는 어드민이 실제로 데이터를 가진 달만 Compass에 물어보고
// (scheduledAmount 합 = 어드민 표시 합계), 같은 달들의 Compass amount 합과 비교한다.
// down이면 compassAmount/diffAmount를 신뢰할 수 없으므로 0으로 고정하고 down만 전달한다(무음 오염 금지).

const getCompassRevenue = vi.fn()

vi.mock("@/lib/compass/bridge", () => ({ getCompassRevenue }))

function monthPoint(month: string, scheduledAmount: number) {
  return {
    month,
    scheduledAmount,
    confirmedAmount: 0,
    highConfidenceAmount: 0,
    expectedAmount: 0,
    pastUnconfirmedAmount: 0,
  }
}

describe("getCompassRevenueCompare", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("월이 없으면 브리지를 부르지 않고 0을 돌려준다", async () => {
    const { getCompassRevenueCompare } = await import("@/lib/admin-crm-revenue-sheet")
    const result = await getCompassRevenueCompare([])
    expect(getCompassRevenue).not.toHaveBeenCalled()
    expect(result).toEqual({ down: false, months: [], adminAmount: 0, compassAmount: 0, diffAmount: 0 })
  })

  it("같은 월(들)의 Compass 합계와 어드민 scheduledAmount 합을 비교해 diff를 계산한다", async () => {
    getCompassRevenue.mockResolvedValue({
      down: false,
      rows: [
        { id: 1, month: "2026-07", amount: 100, week: 1, customer: "a", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null },
        { id: 2, month: "2026-08", amount: 250, week: 1, customer: "b", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null },
        { id: 3, month: "2026-08", amount: 50, week: 2, customer: "c", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null },
      ],
    })

    const { getCompassRevenueCompare } = await import("@/lib/admin-crm-revenue-sheet")
    const monthlyPoints = [monthPoint("2026-07", 100), monthPoint("2026-08", 280)]
    const result = await getCompassRevenueCompare(monthlyPoints)

    expect(getCompassRevenue).toHaveBeenCalledWith(["2026-07", "2026-08"])
    expect(result.adminAmount).toBe(380) // 100 + 280
    expect(result.compassAmount).toBe(400) // 100 + 250 + 50
    expect(result.diffAmount).toBe(20) // compass - admin
    expect(result.down).toBe(false)
  })

  it("완전히 일치하면 diff는 0이다", async () => {
    getCompassRevenue.mockResolvedValue({
      down: false,
      rows: [{ id: 1, month: "2026-08", amount: 500, week: 1, customer: "a", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null }],
    })
    const { getCompassRevenueCompare } = await import("@/lib/admin-crm-revenue-sheet")
    const result = await getCompassRevenueCompare([monthPoint("2026-08", 500)])
    expect(result.diffAmount).toBe(0)
    expect(result.compassAmount).toBe(result.adminAmount)
  })

  it("브리지가 죽으면(down) compassAmount/diffAmount를 0으로 고정하고 down만 전달한다", async () => {
    getCompassRevenue.mockResolvedValue({ down: true, rows: [], error: "relation does not exist" })
    const { getCompassRevenueCompare } = await import("@/lib/admin-crm-revenue-sheet")
    const result = await getCompassRevenueCompare([monthPoint("2026-08", 500)])
    expect(result.down).toBe(true)
    expect(result.compassAmount).toBe(0)
    expect(result.diffAmount).toBe(0)
    // adminAmount는 어드민 쪽 자체 계산이라 down과 무관하게 유지된다.
    expect(result.adminAmount).toBe(500)
  })

  it("month 없는(null) Compass 행은 합계에서 제외한다", async () => {
    getCompassRevenue.mockResolvedValue({
      down: false,
      rows: [
        { id: 1, month: null, amount: 999, week: 1, customer: "a", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null },
        { id: 2, month: "2026-08", amount: 100, week: 1, customer: "b", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null },
      ],
    })
    const { getCompassRevenueCompare } = await import("@/lib/admin-crm-revenue-sheet")
    const result = await getCompassRevenueCompare([monthPoint("2026-08", 100)])
    // null-month 행(999)은 어느 어드민 월에도 붙일 수 없으므로 방어적으로 제외 — 100만 남는다.
    expect(result.compassAmount).toBe(100)
  })

  it("요청하지 않은 달의 행이 섞여 와도(브리지 계약 이탈) 합계를 부풀리지 않는다", async () => {
    getCompassRevenue.mockResolvedValue({
      down: false,
      rows: [
        { id: 1, month: "2026-08", amount: 100, week: 1, customer: "a", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null },
        { id: 2, month: "2099-01", amount: 999999, week: 1, customer: "b", person: "p", status: "s", product: "x", team: "MK", is_mkt: false, synced_at: null },
      ],
    })
    const { getCompassRevenueCompare } = await import("@/lib/admin-crm-revenue-sheet")
    const result = await getCompassRevenueCompare([monthPoint("2026-08", 100)])
    expect(result.compassAmount).toBe(100)
  })
})
