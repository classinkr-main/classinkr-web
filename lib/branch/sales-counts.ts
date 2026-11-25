import "server-only"
import { fyOf, ymKey } from "@/lib/branch/fiscal"
import { confirmedMonthAmount } from "@/lib/branch/computations/rev-confirmed"
import { branchManagerMatches } from "@/lib/branch/personal-scope"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { HardwareSalesDashboard } from "@/lib/repositories/hardware-sales-dashboard"
import type { BranchBoardCounts, BranchCustomerCounts } from "./sales-counts-contract"

function customerKey(name: string) {
  return name.replace(/\s+/g, "").toLowerCase()
}

/** FY 달 키 12개("2026-04" … "2027-03") */
export function fyMonths(fy: number): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((3 + index) % 12) + 1
    const year = month >= 4 ? fy : fy + 1
    return `${year}-${String(month).padStart(2, "0")}`
  })
}

/** REV 장부 고객 수 — 팀·개인 범위, FY 누계·확정·이번 달·전체 누적. */
export function countBranchCustomers(deals: readonly BranchRevDeal[], { now, team, manager }: { now: Date; team: string; manager?: string | null }): BranchCustomerCounts {
  const fy = fyMonths(fyOf(now))
  const fySet = new Set(fy)
  const month = ymKey(now)
  const all = new Set<string>()
  const inFy = new Set<string>()
  const confirmed = new Set<string>()
  const thisMonth = new Set<string>()
  for (const deal of deals) {
    if (manager ? !branchManagerMatches(deal.manager, manager) : team !== "ALL" && deal.team !== team) continue
    const key = customerKey(deal.customer_name ?? "")
    if (!key) continue
    for (const [ym, raw] of Object.entries(deal.monthly_payments ?? {})) {
      const amount = Number(raw ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) continue
      all.add(key)
      if (!fySet.has(ym)) continue
      inFy.add(key)
      if (ym === month) thisMonth.add(key)
      if (ym <= month && confirmedMonthAmount(deal, ym, amount) > 0) confirmed.add(key)
    }
  }
  return { fy: inFy.size, fyConfirmed: confirmed.size, month: thisMonth.size, allTime: all.size }
}

function boardGroup(dashboard: HardwareSalesDashboard) {
  return dashboard.groups.find((group) => group.key === "board") ?? null
}

/** 전자칠판 판매 대수 — 현재 FY 판매대시보드 + 기록이 있는 모든 FY의 설치 완료 합. */
export function countBoards(current: HardwareSalesDashboard, others: readonly HardwareSalesDashboard[], now: Date): BranchBoardCounts {
  const group = boardGroup(current)
  const monthIndex = current.months.indexOf(ymKey(now))
  const allTime = [current, ...others].reduce((sum, dashboard) => sum + (boardGroup(dashboard)?.subtotal.total.installed ?? 0), 0)
  return {
    state: "ready",
    fy: group?.subtotal.total.installed ?? 0,
    month: monthIndex >= 0 ? group?.subtotal.months[monthIndex]?.installed ?? 0 : 0,
    fyPlanned: group?.subtotal.total.planned ?? 0,
    fyPromotion: group?.subtotal.total.promotionInstalled ?? 0,
    allTime,
  }
}
