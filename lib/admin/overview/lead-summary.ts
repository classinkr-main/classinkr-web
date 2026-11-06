import { aggregateLeads, resolveUnrespondedSignal } from "@/lib/admin/overview/insights"
import { isUnconfirmedLead, isUnrespondedLead } from "@/lib/crm/leads-board-state"
import { matchesDataOwner } from "@/lib/crm/personal-owner"
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
  /** 응대 전(unrespondedCount) 중 아직 아무도 확인하지 않은(미확인) 건수 — "지금" 띠 보조 줄. */
  unrespondedUnconfirmedCount: number
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

/** 한 범위(내 담당 또는 전사)의 리드 집계. */
export interface OverviewLeadScopeSummary {
  metrics: OverviewLeadMetrics
  recentLeads: OverviewRecentLead[]
  sources: Array<{ name: string; value: number }>
  trends: {
    days7: OverviewLeadTrendPoint[]
    days30: OverviewLeadTrendPoint[]
  }
}

/**
 * 최상위 필드는 요청한 담당 범위(기본 내 담당), `company`는 같은 스냅샷의 전사 집계다.
 * 새 문의는 담당이 비어 들어오므로(자동 배정 없음) 유입 계열 숫자는 전사로 읽어야 사라지지 않는다 —
 * docs/active/admin-lead-visitor-glance-plan-2026-11-04.md §3.2.
 */
export interface OverviewLeadSummary extends OverviewLeadScopeSummary {
  generatedAt: string
  company: OverviewLeadScopeSummary
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
 * 집계 정의를 재구현하지 않고 범위마다 insights.aggregateLeads를 정확히 한 번 호출한다. 저장소에서
 * 받은 전량은 서버 메모리에서만 사용하고, 브라우저에는 KPI·30일 버킷·최근 6건만 보낸다.
 * 전량을 한 번 읽고 담당 범위는 메모리에서 거른다 — 전사 묶음(company)을 위해 다시 읽지 않는다.
 */
export function buildOverviewLeadSummary(
  leads: LeadRecord[],
  now: Date = new Date(),
  ownerKeys?: readonly string[]
): OverviewLeadSummary {
  const company = buildScopeSummary(leads, now)
  const scoped = ownerKeys ? buildScopeSummary(leads.filter((lead) => matchesDataOwner(lead.assigned_to, ownerKeys)), now) : company
  return { generatedAt: now.toISOString(), ...scoped, company }
}

function buildScopeSummary(leads: LeadRecord[], now: Date): OverviewLeadScopeSummary {
  const aggregate = aggregateLeads(leads, now)
  // 원본 목록을 브라우저에 보내지 않아도 action-kpis 실패 폴백을 잃지 않도록, 기존 Overview가
  // 호출하던 동일 SSOT를 서버에서 계산한다. leads가 배열이므로 항상 값이 나온다.
  const unresponded = resolveUnrespondedSignal(null, leads, now)!
  // 리드 보드 '응대 전' 카드와 같은 술어 위에 확인 게이트만 더 건다.
  const unrespondedUnconfirmedCount = leads.filter((lead) => isUnrespondedLead(lead) && isUnconfirmedLead(lead)).length
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
      unrespondedUnconfirmedCount,
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
