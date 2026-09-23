import "server-only"

import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { readRevDealsPreferActive } from "@/lib/branch/read-rev-deals"
import { fyOf } from "@/lib/branch/fiscal"
import { confirmedMonthAmountWithColor, dealHasColorData } from "@/lib/branch/computations/rev-confirmed"
import { normalizedAccountKey } from "@/lib/branch/account-key"

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

export interface CrmPerfNewAccountsPoint {
  month: string
  count: number
}

export interface CrmRevenuePerformance {
  generatedAt: string
  months: string[]
  monthly: CrmPerfMonthPoint[]
  total: number
  byTeam: CrmPerfGroup[]
  byMember: CrmPerfGroup[]
  dealCount: number
  // 전환 계정 수 — 계정별 "최초 확정매출 발생월"에만 1(Compass lib/adReport.ts의
  // paidAccounts 규칙 이식). 구독 갱신월을 매달 전환으로 중복 계상하지 않는다.
  newAccountsByMonth: CrmPerfNewAccountsPoint[]
  // true = 계정별 "최초"가 이 회계연도 시작 이전 이력까지는 보장되지 않음(아래
  // getCrmRevenuePerformance의 windowLimited 계산부 주석 참고). 현재 항상 true.
  windowLimited: boolean
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

export interface FirstPaymentAccountRow {
  accountKey: string
  month: string // "YYYY-MM"
  amount: number
}

// 전환 계정 수 캐논 — 계정별 amount>0인 "가장 이른 달"에만 1을 센다(Compass lib/adReport.ts
// paidAccounts 규칙 이식: "전환은 그 계정이 처음 결제한 달 한 번, 매달 내는 구독을 달마다
// 세면 중복"). 순수 함수 — rows는 화면에 보여줄 구간(months)보다 넓게(가능하면 해당 계정의
// 조회 가능한 전체 이력) 넘겨야 한다. 그래야 창 경계 밖에서 이미 결제 이력이 있는 계정이
// 창 안에서 "신규"로 오판되지 않는다 — 호출부는 반환된 Map에서 화면에 표시할 월(monthKeys)만
// 골라 읽고, 창 밖 월로 잡힌 카운트는 그냥 버린다.
export function countFirstPaymentAccountsByMonth(rows: FirstPaymentAccountRow[]): Map<string, number> {
  const firstMonthByAccount = new Map<string, string>()
  for (const row of rows) {
    if (!row.accountKey || !(row.amount > 0)) continue
    const current = firstMonthByAccount.get(row.accountKey)
    if (!current || row.month < current) firstMonthByAccount.set(row.accountKey, row.month)
  }

  const counts = new Map<string, number>()
  for (const month of firstMonthByAccount.values()) {
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  return counts
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
  // 신규 전환 계정 집계용 원본 행 — 표시 구간(monthKeys)으로 자르지 않고 딜의 확정매출
  // 전체 월을 담는다(위 countFirstPaymentAccountsByMonth 주석 참고: 창보다 넓게 구해야
  // 창 경계 밖 최초 결제가 창 안에서 신규로 오판되지 않는다).
  const accountPaymentRows: FirstPaymentAccountRow[] = []
  let dealCount = 0

  for (const deal of deals) {
    const monthly = dealMonthly(deal)
    const team = (deal.team ?? "").trim() || "미지정"
    const member = (deal.manager ?? "").trim() || "미지정"
    // 계정 키 — REV 원장 소비처 공용 규약(normalizedAccountKey, lib/branch/account-key.ts).
    // 고객명이 비어 있으면(시트 결측) 다른 딜과 잘못 합쳐지지 않도록 행 고유 키로 대체한다
    // (heatmap.ts customerKey와 동일 폴백 패턴).
    const accountKey = normalizedAccountKey(deal.customer_name) || `row-${deal.sheet_row}`
    let contributed = false
    for (const [month, rawAmount] of Object.entries(monthly)) {
      accountPaymentRows.push({ accountKey, month, amount: rawAmount })
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

  const firstPaymentCountsByMonth = countFirstPaymentAccountsByMonth(accountPaymentRows)
  const newAccountsByMonth: CrmPerfNewAccountsPoint[] = monthKeys.map((month) => ({
    month,
    count: firstPaymentCountsByMonth.get(month) ?? 0,
  }))

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
    newAccountsByMonth,
    // readRevDealsPreferActive는 이 파일을 포함한 모든 branch 소비처와 동일하게 현재
    // 회계연도(fyOf(new Date())) 한 해만 읽는다 — 이전 회계연도에 이미 결제 이력이 있는
    // 계정이 이번 회계연도 첫 달에 결제하면(연초 갱신) 그 이전 이력을 볼 방법이 이 데이터
    // 원천 안에는 없어 "신규"와 구분할 수 없다. 추측으로 구분하지 않고 항상 true로 정직하게
    // 알린다 — 소비처(UI)는 "조회 기간 내 최초 결제 기준"으로 표기해야 한다.
    windowLimited: true,
  }
}
