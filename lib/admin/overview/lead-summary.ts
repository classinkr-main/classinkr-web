import { aggregateLeads, resolveUnrespondedSignal } from "@/lib/admin/overview/insights"
import type { LeadRecord } from "@/lib/site-settings-types"

export interface OverviewLeadMetrics {
  total: number
  newLeads: number
  contactedLeads: number
  converted: number
  closedLeads: number
  activePipelineLeads: number
  convRate: number
  todayLeads: number
  thisWeekLeads: number
  weekTrend: number
  thisMonthLeads: number
  monthTrend: number
  convertedThisMonth: number
  convertedTrend: number
  /** 홈페이지 유입(문의 폼·데모 모달·홈 CTA 등 homepage 그룹) — 확인 게이트 미적용. */
  homepageToday: number
  homepageThisWeek: number
  homepageTotal: number
  /** 그 중 아직 확인 전이라 리드 보드 기본 화면에서는 빠지는 건수. */
  homepageUnconfirmed: number
  /** action-kpis 실패 시 쓰는 동일 캐논 폴백(status=new + 응대 대상 source). */
  unrespondedCount: number
  unresponded24hCount: number
  topBranch: [string, number] | null
}

/** Overview 최근 유입 목록이 실제로 렌더하는 최소 필드. */
export type OverviewRecentLead = Pick<
  LeadRecord,
  "id" | "source" | "name" | "org" | "email" | "timestamp" | "status"
>

export interface OverviewLeadTrendPoint {
  /** 로컬 날짜 키. 예: 2026-08-27 */
  date: string
  /** 기존 Overview 차트와 같은 M/D 라벨. */
  label: string
  count: number
}

export interface OverviewLeadSummary {
  generatedAt: string
  metrics: OverviewLeadMetrics
  recentLeads: OverviewRecentLead[]
  sources: Array<{ name: string; value: number }>
  trends: {
    days7: OverviewLeadTrendPoint[]
    days30: OverviewLeadTrendPoint[]
  }
}

export interface AdminLeadsOverviewResponse {
  overview: OverviewLeadSummary
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Overview의 리드 계약을 만든다.
 *
 * 집계 정의를 재구현하지 않고 insights.aggregateLeads를 정확히 한 번 호출한다. 저장소에서
 * 받은 전량은 서버 메모리에서만 사용하고, 브라우저에는 KPI·30일 버킷·최근 6건만 보낸다.
 */
export function buildOverviewLeadSummary(
  leads: LeadRecord[],
  now: Date = new Date()
): OverviewLeadSummary {
  const aggregate = aggregateLeads(leads, now)
  // 원본 목록을 브라우저에 보내지 않아도 action-kpis 실패 폴백을 잃지 않도록, 기존 Overview가
  // 호출하던 동일 SSOT를 서버에서 계산한다. leads가 배열이므로 항상 값이 나온다.
  const unresponded = resolveUnrespondedSignal(null, leads, now)!
  const days30 = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (29 - index))
    return {
      date: localDateKey(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: aggregate.dayCount[date.toDateString()] ?? 0,
    }
  })

  return {
    generatedAt: now.toISOString(),
    metrics: {
      total: aggregate.total,
      newLeads: aggregate.newLeads,
      contactedLeads: aggregate.contactedLeads,
      converted: aggregate.converted,
      closedLeads: aggregate.closedLeads,
      activePipelineLeads: aggregate.activePipelineLeads,
      convRate: aggregate.convRate,
      todayLeads: aggregate.todayLeads,
      thisWeekLeads: aggregate.thisWeekLeads,
      weekTrend: aggregate.weekTrend,
      thisMonthLeads: aggregate.thisMonthLeads,
      monthTrend: aggregate.monthTrend,
      convertedThisMonth: aggregate.convertedThisMonth,
      convertedTrend: aggregate.convertedTrend,
      homepageToday: aggregate.homepageToday,
      homepageThisWeek: aggregate.homepageThisWeek,
      homepageTotal: aggregate.homepageTotal,
      homepageUnconfirmed: aggregate.homepageUnconfirmed,
      unrespondedCount: unresponded.unrespondedCount,
      unresponded24hCount: unresponded.unresponded24hCount,
      topBranch: aggregate.topBranch ?? null,
    },
    recentLeads: aggregate.recentLeads.map((lead) => ({
      id: lead.id,
      source: lead.source,
      name: lead.name,
      org: lead.org,
      email: lead.email,
      timestamp: lead.timestamp,
      status: lead.status,
    })),
    sources: aggregate.pieData,
    trends: {
      days7: days30.slice(-7),
      days30,
    },
  }
}
