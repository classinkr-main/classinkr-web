import "server-only"

import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { readRevDealsPreferActive } from "@/lib/branch/read-rev-deals"
import { fyOf } from "@/lib/branch/fiscal"
import { confirmedMonthAmountWithColor, dealHasColorData } from "@/lib/branch/computations/rev-confirmed"

// CRM 성과 분석 — 매출 rev 딜(CRM 도메인 데이터)을 owner(개인)·팀·월로 재집계.
// 현황 전용. deals 탭과 독립. 월 키는 "YYYY-MM"(확인됨).
// 매출 = '확정 매출' 캐논(rev-confirmed.ts confirmedMonthAmount) — 장부와 동일 정의(2026-07-10).
// 데이터셋도 장부와 동일 규약(readRevDealsPreferActive: DB-native 액티브 임포트 우선)을 따른다 —
// 미러(branch_rev_deals)에는 색(확도) 없는 행이 많아 그대로 읽으면 장부 수치와 어긋난다.

export interface CrmPerfMonthPoint {
  month: string
  revenue: number
}

export interface CrmPerfGroup {
  name: string
  team: string | null
  total: number
  monthly: number[]
}

export interface CrmRevenuePerformance {
  generatedAt: string
  months: string[]
  monthly: CrmPerfMonthPoint[]
  total: number
  byTeam: CrmPerfGroup[]
  byMember: CrmPerfGroup[]
  dealCount: number
}

function recentMonthKeys(months: number): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`)
  }
  return keys
}

// 월별 확정 매출 맵 — 캐논(confirmedMonthAmount)을 딜의 전체 납부 월에 적용한다.
// (이전 구현은 monthly_confirmed 맵이 하나라도 있으면 맵 전체를, 없으면 실수금 전체를
// 썼다 — 부분 확정 딜의 나머지 실수금이 증발하고 무색상 미래 월이 매출로 잡히던 결함.)
function dealMonthly(deal: BranchRevDeal): Record<string, number> {
  const hasColor = dealHasColorData(deal)
  const result: Record<string, number> = {}
  for (const [month, rawAmount] of Object.entries(deal.monthly_payments ?? {})) {
    const total = Number(rawAmount) || 0
    if (!total) continue
    const confirmed = confirmedMonthAmountWithColor(deal, month, total, hasColor)
    if (confirmed > 0) result[month] = confirmed
  }
  return result
}

export async function getCrmRevenuePerformance(months = 6): Promise<CrmRevenuePerformance> {
  const safeMonths = Math.min(12, Math.max(3, Math.floor(months)))
  const monthKeys = recentMonthKeys(safeMonths)
  const indexByMonth = new Map(monthKeys.map((month, index) => [month, index]))

  let deals: BranchRevDeal[] = []
  try {
    deals = await readRevDealsPreferActive(fyOf(new Date()))
  } catch {
    deals = []
  }

  const monthTotals = new Array<number>(safeMonths).fill(0)
  const teamMap = new Map<string, number[]>()
  const memberMap = new Map<string, { team: string | null; monthly: number[] }>()
  let dealCount = 0

  for (const deal of deals) {
    const monthly = dealMonthly(deal)
    const team = (deal.team ?? "").trim() || "미지정"
    const member = (deal.manager ?? "").trim() || "미지정"
    let contributed = false
    for (const [month, rawAmount] of Object.entries(monthly)) {
      const index = indexByMonth.get(month)
      if (index == null) continue
      const amount = Number(rawAmount) || 0
      if (!amount) continue
      contributed = true
      monthTotals[index] += amount
      if (!teamMap.has(team)) teamMap.set(team, new Array<number>(safeMonths).fill(0))
      teamMap.get(team)![index] += amount
      if (!memberMap.has(member)) {
        memberMap.set(member, { team: deal.team ?? null, monthly: new Array<number>(safeMonths).fill(0) })
      }
      memberMap.get(member)!.monthly[index] += amount
    }
    if (contributed) dealCount += 1
  }

  const sumArr = (arr: number[]) => arr.reduce((acc, value) => acc + value, 0)

  const byTeam: CrmPerfGroup[] = Array.from(teamMap.entries())
    .map(([name, monthly]) => ({ name, team: name, total: sumArr(monthly), monthly }))
    .filter((group) => group.total > 0)
    .sort((a, b) => b.total - a.total)

  const byMember: CrmPerfGroup[] = Array.from(memberMap.entries())
    .map(([name, value]) => ({ name, team: value.team, total: sumArr(value.monthly), monthly: value.monthly }))
    .filter((group) => group.total > 0)
    .sort((a, b) => b.total - a.total)

  return {
    generatedAt: new Date().toISOString(),
    months: monthKeys,
    monthly: monthKeys.map((month, index) => ({ month, revenue: monthTotals[index] })),
    total: sumArr(monthTotals),
    byTeam,
    byMember,
    dealCount,
  }
}
