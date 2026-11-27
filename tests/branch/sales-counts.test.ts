import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { countBoards, countBranchCustomers, fyMonths } from "@/lib/branch/sales-counts"
import type { HardwareSalesDashboard } from "@/lib/repositories/hardware-sales-dashboard"

// 개요 — 총 고객수(REV 장부)와 전자칠판 판매 대수(하드웨어 판매대시보드). FY 누계가 큰 숫자, 전체 누적은 옆에 작게.
const now = new Date("2026-11-25T01:00:00Z")
const deal = (customer: string, team: string, manager: string, payments: Record<string, number>, confirmed: Record<string, number> = {}, highConf: Record<string, number> = {}) => ({
  customer_name: customer, team, manager, importance: null,
  monthly_payments: payments, monthly_confirmed: confirmed, monthly_high_conf: highConf, monthly_red: {},
}) as unknown as Parameters<typeof countBranchCustomers>[0][number]

describe("총 고객수", () => {
  const deals = [
    deal("한빛 영어학원", "BD", "Han", { "2026-05": 100, "2026-11": 50 }, { "2026-05": 100 }),
    deal("한빛영어학원", "BD", "Han", { "2026-12": 30 }, {}, { "2026-12": 30 }),
    // 고확도(파란 글자)만 있는 달은 확정이 아니다(REV 캐논 — 색 없는 행은 당월까지 확정으로 본다)
    deal("[기관 F]", "MKT", "신희성", { "2026-11": 80 }, {}, { "2026-11": 80 }),
    deal("작년학원", "BD", "Han", { "2026-02": 40 }, { "2026-02": 40 }),
    deal("빈학원", "BD", "Han", { "2026-11": 0 }),
  ]
  it("FY 누계는 이름(공백 무시)으로 한 곳으로 세고, 확정·이번 달·전체 누적을 따로 센다", () => {
    expect(countBranchCustomers(deals, { now, team: "ALL" })).toEqual({ fy: 2, fyConfirmed: 1, month: 2, allTime: 3 })
  })
  it("팀·개인 범위를 따른다(한글 별칭 포함)", () => {
    expect(countBranchCustomers(deals, { now, team: "MKT" }).fy).toBe(1)
    expect(countBranchCustomers(deals, { now, team: "ALL", manager: "Heesung" })).toEqual({ fy: 1, fyConfirmed: 0, month: 1, allTime: 1 })
  })
  it("FY 달은 4월부터 이듬해 3월까지", () => {
    expect(fyMonths(2026)[0]).toBe("2026-04")
    expect(fyMonths(2026)[11]).toBe("2027-03")
  })
})

describe("전자칠판 판매 대수", () => {
  const counts = (installed: number, planned = 0, promotionInstalled = 0) => ({ installed, planned, returned: 0, promotionInstalled, promotionPlanned: 0 })
  const dashboard = (fy: number, monthly: number[], extra: { planned?: number; promotion?: number } = {}): HardwareSalesDashboard => {
    const months = fyMonths(fy)
    const monthCounts = months.map((_, index) => counts(monthly[index] ?? 0))
    const total = counts(monthly.reduce((sum, value) => sum + value, 0), extra.planned ?? 0, extra.promotion ?? 0)
    return {
      fy, currentFy: 2026, months, availableFys: [2026, 2025], generatedAt: "",
      grandTotal: { months: monthCounts, undated: counts(0), total },
      groups: [
        { key: "camera", label: "카메라", rows: [], subtotal: { months: monthCounts.map(() => counts(9)), undated: counts(0), total: counts(99) } },
        { key: "board", label: "전자칠판", rows: [], subtotal: { months: monthCounts, undated: counts(0), total } },
      ],
    }
  }
  it("FY 설치 완료·이번 달·예정·프로모션과 모든 FY 합(전체 누적)을 전자칠판 묶음에서만 센다", () => {
    // FY2026: 4월 10, 11월(인덱스 7) 14 / FY2025 합 300
    const current = dashboard(2026, [10, 0, 0, 0, 0, 0, 0, 14], { planned: 15, promotion: 3 })
    const past = dashboard(2025, [300])
    expect(countBoards(current, [past], now)).toEqual({ state: "ready", fy: 24, month: 14, fyPlanned: 15, fyPromotion: 3, allTime: 324 })
  })
  it("전자칠판 묶음이 없으면 0", () => {
    const empty = { ...dashboard(2026, []), groups: [] }
    expect(countBoards(empty, [], now)).toMatchObject({ fy: 0, month: 0, allTime: 0 })
  })
})
