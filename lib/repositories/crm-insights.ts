import "server-only"

import { getAdminCrmOverview } from "@/lib/admin-crm-overview"
import { getCrmPriorityQueue } from "@/lib/repositories/crm-priority-queue"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"

export type CrmInsightTone = "risk" | "warn" | "ok" | "neutral"

export interface CrmInsightListItem {
  id: string
  title: string
  detail: string
  href: string
  tone: CrmInsightTone
}

export type CrmInsightSourceKey = "priority" | "coverage" | "business"
export type CrmCoverageHealthState = "ready" | "partial" | "no_data" | "failed"

export interface CrmCoverageHealth {
  state: CrmCoverageHealthState
  label: string
  detail: string
}

export interface CrmInsights {
  generatedAt: string
  health: {
    status: "ready" | "partial"
    coverage: CrmCoverageHealth
    unavailableSources: CrmInsightSourceKey[]
    warnings: string[]
  }
  kpis: {
    priorityTotal: number
    criticalPriorityCount: number
    highPriorityCount: number
    paymentRiskCount: number
    coveragePct: number
    needsReviewCount: number
    upcomingThisWeekCount: number
  }
  risks: CrmInsightListItem[]
  opportunities: CrmInsightListItem[]
  operations: CrmInsightListItem[]
}

function coverageTone(coveragePct: number): CrmInsightTone {
  if (coveragePct >= 70) return "ok"
  if (coveragePct >= 40) return "warn"
  return "risk"
}

function buildCoverageHealth(coverage: {
  total: number
  linked: number
  needsReview: number
  coveragePct: number
}): CrmCoverageHealth {
  if (coverage.total <= 0) {
    return {
      state: "no_data",
      label: "연동 데이터 없음",
      detail: "ClassIn 고객 DB와 연결된 외부 원천이 아직 없습니다.",
    }
  }

  if (coverage.needsReview > 0 || coverage.coveragePct < 70) {
    return {
      state: "partial",
      label: "검토 필요",
      detail: "외부 원천은 참고용이며 ClassIn 고객 DB 연결 확정이 필요합니다.",
    }
  }

  return {
    state: "ready",
    label: "정상",
    detail: "ClassIn 고객 DB 기준 연결 상태입니다.",
  }
}

export async function getCrmInsights(): Promise<CrmInsights> {
  const generatedAt = new Date().toISOString()
  const [priorityResult, coverageResult, overviewResult] = await Promise.allSettled([
    getCrmPriorityQueue({ limit: 12 }),
    getCrmSourceLinkCoverage(),
    getAdminCrmOverview(),
  ])
  const warnings: string[] = []
  const unavailableSources: CrmInsightSourceKey[] = []

  const priority =
    priorityResult.status === "fulfilled"
      ? priorityResult.value
      : {
          generatedAt,
          sources: {
            leadsOk: false,
            neoAccountsOk: false,
            warnings: ["우선 연락 데이터를 불러오지 못했습니다."],
          },
          summary: {
            total: 0,
            critical: 0,
            high: 0,
            leadCount: 0,
            neoAccountCount: 0,
            ownerCount: 0,
          },
          owners: [],
          items: [],
        }
  if (priorityResult.status === "rejected") unavailableSources.push("priority")
  if (priority.sources.warnings.length > 0) warnings.push(...priority.sources.warnings)

  const coverage =
    coverageResult.status === "fulfilled"
      ? coverageResult.value
      : { total: 0, linked: 0, needsReview: 0, coveragePct: 0 }
  if (coverageResult.status === "rejected") {
    unavailableSources.push("coverage")
    warnings.push("동기화 정합성을 불러오지 못했습니다.")
  }

  const overview = overviewResult.status === "fulfilled" ? overviewResult.value : null
  if (!overview) {
    unavailableSources.push("business")
    warnings.push("ClassIn 고객 DB 집계를 불러오지 못했습니다.")
  } else {
    const overviewWarnings = [
      overview.business.ok ? null : overview.business.error ?? overview.business.warning,
      overview.sourceLinks.ok ? null : overview.sourceLinks.error ?? "원천 연결 상태를 확인하지 못했습니다.",
      overview.externalSnapshots.ok
        ? null
        : overview.externalSnapshots.error ?? "외부 CRM 스냅샷 상태를 확인하지 못했습니다.",
      overview.neoCrm.ok ? null : overview.neoCrm.error ?? "외부 CRM 최근 오더를 불러오지 못했습니다.",
    ].filter((item): item is string => Boolean(item))
    warnings.push(...overviewWarnings)
  }

  const coverageHealth: CrmCoverageHealth =
    coverageResult.status === "rejected"
      ? {
          state: "failed",
          label: "확인 실패",
          detail: "CRM 동기화 정합성을 불러오지 못했습니다.",
        }
      : buildCoverageHealth(coverage)

  const risks: CrmInsightListItem[] = priority.items
    .filter((item) => item.severity === "critical" || item.severity === "high")
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: `${item.actionLabel} · ${item.title}`,
      detail: item.reason,
      href: item.href,
      tone: item.severity === "critical" ? "risk" : "warn",
    }))

  if (overview && overview.business.kpis.paymentRiskCount > 0) {
    risks.push({
      id: "payment-risk",
      title: `미수 리스크 ${overview.business.kpis.paymentRiskCount.toLocaleString("ko-KR")}건`,
      detail: "Revenue 탭에서 계약·수납 상태를 확인하세요.",
      href: "/admin/crm/deals",
      tone: "risk",
    })
  }

  const opportunities: CrmInsightListItem[] =
    overview?.neoCrm.recentOrders.slice(0, 5).map((order) => ({
      id: `order:${order.key}`,
      title: order.customerName,
      detail: `${order.ownerName ?? "담당 미확인"} · 최근 오더 ${Number(order.amount ?? 0).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })} USD`,
      href: "/admin/crm/deals/orders",
      tone: "ok" as const,
    })) ?? []

  for (const customer of overview?.business.frequentCustomers.slice(0, 3) ?? []) {
    opportunities.push({
      id: `frequent:${customer.customerId}`,
      title: `최근 접촉 집중 · ${customer.customerName}`,
      detail: `14일 ${customer.contactCount.toLocaleString("ko-KR")}회 접촉`,
      href: customer.href,
      tone: "neutral",
    })
  }

  const operations: CrmInsightListItem[] = [
    {
      id: "coverage",
      title:
        coverageHealth.state === "no_data" || coverageHealth.state === "failed"
          ? `동기화 정합성 · ${coverageHealth.label}`
          : `동기화 정합성 ${coverage.coveragePct}%`,
      detail:
        coverageHealth.state === "ready" || coverageHealth.state === "partial"
          ? `검토 대기 ${coverage.needsReview.toLocaleString("ko-KR")}건 · 확정 ${coverage.linked.toLocaleString("ko-KR")}건`
          : coverageHealth.detail,
      href: "/admin/crm/matching",
      tone:
        coverageHealth.state === "failed"
          ? "warn"
          : coverageHealth.state === "no_data"
            ? "neutral"
            : coverageTone(coverage.coveragePct),
    },
  ]

  if (!overview) {
    operations.push({
      id: "business-unavailable",
      title: "ClassIn 고객 DB 집계 미확인",
      detail: "고객·계약·일정 지표가 제한되어 있습니다.",
      href: "/admin/crm",
      tone: "warn",
    })
  } else if (overview.business.snapshot.stale) {
    operations.push({
      id: "snapshot-stale",
      title: "CRM 집계 스냅샷 지연",
      detail: overview.business.warning ?? "라이브 집계 또는 스냅샷 갱신 상태를 확인하세요.",
      href: "/admin/crm/matching",
      tone: "warn",
    })
  }

  for (const event of overview?.business.upcomingThisWeek.items.slice(0, 5) ?? []) {
    operations.push({
      id: `upcoming:${event.id}`,
      title: event.title,
      detail: event.customerName ?? "고객명 미확인",
      href: event.href,
      tone: "neutral",
    })
  }

  return {
    generatedAt,
    health: {
      status: unavailableSources.length > 0 || warnings.length > 0 ? "partial" : "ready",
      coverage: coverageHealth,
      unavailableSources: Array.from(new Set(unavailableSources)),
      warnings: Array.from(new Set(warnings)).slice(0, 4),
    },
    kpis: {
      priorityTotal: priority.summary.total,
      criticalPriorityCount: priority.summary.critical,
      highPriorityCount: priority.summary.high,
      paymentRiskCount: overview?.business.kpis.paymentRiskCount ?? 0,
      coveragePct: coverage.coveragePct,
      needsReviewCount: coverage.needsReview,
      upcomingThisWeekCount: overview?.business.upcomingThisWeek.count ?? 0,
    },
    risks,
    opportunities,
    operations,
  }
}
