// Overview 운영 허브의 파생 로직(신호 판정·집계·우선순위) 순수 모듈.
// app/admin/overview/page.tsx는 여기서 계산된 값을 주입받아 렌더만 담당한다.
// 모든 함수는 입력→출력 순수 함수이며, 현재 시각이 필요한 함수는 Date를 주입받는다(테스트 안정성).
// W2-3(OV4): C2 revenue-core SSOT 전환의 선행 정지작업 — 신호 정의를 한 곳에서 검증한다.

// 순수 규칙은 lib/crm/leads-board-state 가 정본 — 서버 집계가 컴포넌트를 import 하지 않는다.
import { getLeadSourceGroup } from "@/lib/crm/lead-attribution"
import { hoursBetween, isUnconfirmedLead, isUnrespondedLead } from "@/lib/crm/leads-board-state"
import { isPrefetchFresh } from "@/lib/admin/prefetch-freshness"
import type { LeadRecord } from "@/lib/site-settings-types"
import type { AdminIntegrationStatusResponse } from "@/lib/admin-integrations/types"
import type { CalendarEvent } from "@/lib/calendar-data"
import type { BlogPost } from "@/lib/blog-types"
import type { EmailCampaign } from "@/lib/marketing-types"
import type { BugReport } from "@/lib/bugs-data"
import type { PatchNote } from "@/lib/patch-notes-data"

/* ─── 공용 날짜 헬퍼 ─────────────────────────────────────────── */

export function isValidDate(value?: string) {
  if (!value) return false
  return !Number.isNaN(new Date(value).getTime())
}

export function scoreDate(value?: string) {
  if (!value || !isValidDate(value)) return 0
  return new Date(value).getTime()
}

export function formatDateShort(value?: string) {
  if (!value || !isValidDate(value)) return "날짜 없음"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(value))
}

export function formatDateTime(value?: string) {
  if (!value || !isValidDate(value)) return "시간 정보 없음"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function isWithinNextDays(dateStr: string, days: number, now: Date) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  const target = new Date(`${dateStr}T00:00:00`)
  return target >= start && target <= end
}

/* ─── 라벨 ──────────────────────────────────────────────────── */

export const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
  meta_lead_ads: "Meta 리드",
}

/* ─── 리드 집계 ─────────────────────────────────────────────── */

// 리드 파생값을 단일 패스로 집계한다.
// (기존엔 렌더마다 status별 filter + 날짜 파싱을 15회+ 반복)
export function aggregateLeads(leads: LeadRecord[], now: Date = new Date()) {
  const todayStr = now.toDateString()
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)
  const twoWeeksAgo = new Date(now)
  twoWeeksAgo.setDate(now.getDate() - 14)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const weekAgoT = weekAgo.getTime()
  const twoWeeksAgoT = twoWeeksAgo.getTime()
  const monthStartT = monthStart.getTime()
  const lastMonthStartT = lastMonthStart.getTime()

  let newLeads = 0
  let contactedLeads = 0
  let converted = 0
  let closedLeads = 0
  let todayLeads = 0
  let thisWeekLeads = 0
  let lastWeekLeads = 0
  let thisMonthLeads = 0
  let lastMonthLeads = 0
  let convertedThisMonth = 0
  let convertedLastMonth = 0
  // 홈페이지 유입 창 — 유입 수 관점이라 todayLeads처럼 확인 게이트를 적용하지 않는다.
  // 모집단은 유입 그룹 매핑(getLeadSourceGroup)의 homepage 그룹 = 문의 폼 + 데모 모달 +
  // 홈 리드마그넷·최종 CTA. 예전에는 contact_page 한 소스만 세서, 홈 Hero·Comparison·FinalCTA에
  // 붙은 데모 모달로 들어온 문의가 타일에서 통째로 빠졌다.
  let homepageToday = 0
  let homepageThisWeek = 0
  let homepageTotal = 0
  // 그 중 확인 게이트 밖(미확인)인 건수. 타일을 눌러 착지하는 리드 보드는 게이트를 걸기 때문에,
  // 이 수를 같이 들고 있어야 "타일은 4건인데 목록은 3건" 같은 침묵하는 차이를 화면이 말할 수 있다.
  let homepageUnconfirmed = 0
  const sourceMap: Record<string, number> = {}
  const branchMap: Record<string, number> = {}
  const dayCount: Record<string, number> = {}

  for (const l of leads) {
    // 퍼널 단계 카운트는 착지 보드(filter=new 등)의 리드 확인 게이트와 동일 기준으로 센다 —
    // 미확인 리드까지 세면 타일 수치가 보드 표시 건수보다 커져 신호가 깨진다(unresponded만 게이트 면제).
    if (!isUnconfirmedLead(l)) {
      if (l.status === "new") newLeads++
      else if (l.status === "contacted") contactedLeads++
      else if (l.status === "converted") converted++
      else if (l.status === "closed") closedLeads++
    }

    const isHomepageLead = getLeadSourceGroup(l) === "homepage"
    if (isHomepageLead) {
      homepageTotal++
      if (isUnconfirmedLead(l)) homepageUnconfirmed++
    }

    const t = new Date(l.timestamp).getTime()
    if (!Number.isNaN(t)) {
      const key = new Date(t).toDateString()
      dayCount[key] = (dayCount[key] ?? 0) + 1
      if (key === todayStr) todayLeads++
      if (t >= weekAgoT) thisWeekLeads++
      else if (t >= twoWeeksAgoT) lastWeekLeads++
      if (isHomepageLead) {
        if (key === todayStr) homepageToday++
        if (t >= weekAgoT) homepageThisWeek++
      }
      if (t >= monthStartT) {
        thisMonthLeads++
        if (l.status === "converted") convertedThisMonth++
      } else if (t >= lastMonthStartT) {
        lastMonthLeads++
        if (l.status === "converted") convertedLastMonth++
      }
    }

    sourceMap[l.source] = (sourceMap[l.source] ?? 0) + 1
    const branch = l.branch?.trim()
    if (branch) branchMap[branch] = (branchMap[branch] ?? 0) + 1
  }

  const total = leads.length
  const pieData = Object.entries(sourceMap).map(([key, value]) => ({
    name: SOURCE_LABEL[key] ?? key,
    value,
  }))
  const recentLeads = [...leads]
    .sort((a, b) => scoreDate(b.timestamp) - scoreDate(a.timestamp))
    .slice(0, 6)
  const topBranch = Object.entries(branchMap).sort((a, b) => b[1] - a[1])[0]

  return {
    total,
    newLeads,
    contactedLeads,
    converted,
    closedLeads,
    activePipelineLeads: newLeads + contactedLeads,
    convRate: total > 0 ? Math.round((converted / total) * 100) : 0,
    todayLeads,
    thisWeekLeads,
    weekTrend: thisWeekLeads - lastWeekLeads,
    thisMonthLeads,
    monthTrend: thisMonthLeads - lastMonthLeads,
    convertedThisMonth,
    convertedTrend: convertedThisMonth - convertedLastMonth,
    homepageToday,
    homepageThisWeek,
    homepageTotal,
    homepageUnconfirmed,
    pieData,
    recentLeads,
    dayCount,
    topBranch,
  }
}

export type LeadAggregates = ReturnType<typeof aggregateLeads>

/* ─── 미응답 리드 신호 (단일 정의) ──────────────────────────── */

// Overview에서 '미응답'을 표현하는 유일한 정의·유일한 산출 지점(W2-8).
// 캐논 = action-kpis 라우트(getLeadActionStats): 테스트가 아닌 운영 리드 중
// status=new AND source∈{데모·문의·Meta}
// (RESPONSE_TARGET_SOURCES). 응대 SLA 관점이라 리드 확인 게이트를 적용하지 않는다 —
// 보드의 filter=unresponded(CONFIRMATION_GATE_EXEMPT_FILTERS)와 동일 기준.
export interface UnrespondedSignal {
  /** 응대 전 전체(나이 무관) */
  unrespondedCount: number
  /** 골든타임 초과: 접수 후 24시간 이상 경과 */
  unresponded24hCount: number
  /** 수치 원천 — server=action-kpis(캐논), client=동일 정의 로컬 파생(폴백) */
  basis: "server" | "client"
}

// 서버 수치(action-kpis)가 있으면 그대로 캐논으로 쓰고, 없을 때(로딩/실패)만
// 같은 정의(shared.isUnrespondedLead + 24h 경과)를 리드 목록에서 파생한다.
// 재구현이 아니라 보드와 같은 SSOT 술어를 공유하는 폴백 — 라우트 실패 시에도
// 골든타임 신호가 화면에서 사라지지 않게 한다(신호→행동 무손실).
// leads가 null이면(아직 로딩 전) 판정 불가 → null 반환(0 플래시 방지).
export function resolveUnrespondedSignal(
  serverStats: { unrespondedCount: number; unresponded24hCount: number } | null | undefined,
  leads: LeadRecord[] | null,
  now: Date = new Date()
): UnrespondedSignal | null {
  if (serverStats) {
    return {
      unrespondedCount: serverStats.unrespondedCount,
      unresponded24hCount: serverStats.unresponded24hCount,
      basis: "server",
    }
  }
  if (!leads) return null
  let unrespondedCount = 0
  let unresponded24hCount = 0
  for (const lead of leads) {
    if (!isUnrespondedLead(lead)) continue
    unrespondedCount += 1
    if (hoursBetween(lead.timestamp, now) >= 24) unresponded24hCount += 1
  }
  return { unrespondedCount, unresponded24hCount, basis: "client" }
}

/* ─── 콘텐츠·캠페인·일정·버그 파생 ──────────────────────────── */

export function deriveBlogInsights(blogPosts: BlogPost[]) {
  const draftBlogPosts = blogPosts.filter((post) => post.status === "draft").length
  const publishedBlogPosts = blogPosts.filter((post) => post.status === "published")
  const publishedPostsWithCta = publishedBlogPosts.filter((post) => {
    const cta = post.cta
    return Boolean(cta?.title?.trim() && cta?.buttonLabel?.trim() && cta?.buttonHref?.trim())
  }).length
  const ctaCoverage =
    publishedBlogPosts.length > 0 ? Math.round((publishedPostsWithCta / publishedBlogPosts.length) * 100) : 0
  const recentPosts = [...blogPosts]
    .sort((a, b) => scoreDate(b.updatedAt ?? b.publishedAt) - scoreDate(a.updatedAt ?? a.publishedAt))
    .slice(0, 4)
  return {
    draftBlogPosts,
    publishedBlogPosts,
    ctaCoverage,
    recentPosts,
    publishedPostsWithoutCta: Math.max(0, publishedBlogPosts.length - publishedPostsWithCta),
  }
}

export function deriveCampaignInsights(campaigns: EmailCampaign[]) {
  const recentCampaigns = [...campaigns]
    .sort((a, b) => scoreDate(b.sentAt ?? b.createdAt) - scoreDate(a.sentAt ?? a.createdAt))
    .slice(0, 4)
  const failedCampaigns = [...campaigns]
    .filter((campaign) => campaign.status === "failed")
    .sort((a, b) => scoreDate(b.sentAt ?? b.createdAt) - scoreDate(a.sentAt ?? a.createdAt))
  return {
    recentCampaigns,
    failedCampaigns,
    draftCampaigns: campaigns.filter((campaign) => campaign.status === "draft"),
    sentCampaigns: campaigns.filter((campaign) => campaign.status === "sent"),
    latestFailedCampaign: failedCampaigns[0],
  }
}

export function deriveEventInsights(calendarEvents: CalendarEvent[], now: Date = new Date()) {
  const upcomingEvents = [...calendarEvents]
    .filter((event) => isWithinNextDays(event.date, 7, now))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .slice(0, 5)
  const assigneeMap = upcomingEvents.reduce<Record<string, number>>((acc, event) => {
    event.assignees?.forEach((assignee) => {
      acc[assignee] = (acc[assignee] ?? 0) + 1
    })
    return acc
  }, {})
  return {
    upcomingEvents,
    activeAssigneeCount: Object.keys(assigneeMap).length,
    unassignedEventCount: upcomingEvents.filter((event) => !event.assignees?.length).length,
    busiestAssignee: Object.entries(assigneeMap).sort((a, b) => b[1] - a[1])[0],
    nextUpcomingEvent: upcomingEvents[0],
  }
}

export function deriveBugInsights(bugs: BugReport[]) {
  const openBugs = [...bugs]
    .filter((bug) => bug.status === "open" || bug.status === "in-progress")
    .sort((a, b) => {
      const severityOrder: Record<BugReport["severity"], number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      }
      return (
        severityOrder[b.severity] - severityOrder[a.severity] ||
        scoreDate(b.updatedAt) - scoreDate(a.updatedAt)
      )
    })
    .slice(0, 4)
  return {
    openBugs,
    criticalOpenBugs: openBugs.filter((bug) => bug.severity === "critical" || bug.severity === "high"),
  }
}

export function deriveLatestPatchNote(patchNotes: PatchNote[]): PatchNote | undefined {
  return [...patchNotes].sort((a, b) => scoreDate(b.date) - scoreDate(a.date))[0]
}

/* ─── 연동 상태 ─────────────────────────────────────────────── */

// 연동 상태 카드 — integrations/status 항목 중 외부 전송 경로 4종만 노출한다.
const CONNECTION_DEFS = [
  { key: "lead_webhooks", fallbackLabel: "Lead Webhooks", description: "리드를 시트·외부 자동화로 전송" },
  { key: "channel_talk", fallbackLabel: "Channel Talk", description: "상담 인박스로 전달" },
  { key: "email_provider", fallbackLabel: "Email", description: "캠페인 발송 연동" },
  { key: "notifications", fallbackLabel: "Notifications", description: "운영 알림(WeCom·알림톡) 전송" },
] as const

export interface OverviewConnection {
  label: string
  description: string
  connected: boolean
  href: string
}

export function deriveConnections(integrationStatus: AdminIntegrationStatusResponse | null): {
  connections: OverviewConnection[]
  missingConnections: OverviewConnection[]
} {
  const connections = CONNECTION_DEFS.map(({ key, fallbackLabel, description }) => {
    const item = integrationStatus?.items.find((entry) => entry.key === key)
    return {
      label: item?.label ?? fallbackLabel,
      description,
      connected: item?.configured ?? false,
      href: item?.adminHref ?? "/admin/settings?tab=integrations",
    }
  })
  // 상태 응답이 없을 때(로딩/실패)는 미연결로 단정하지 않는다. (상시 오탐 방지)
  const missingConnections = integrationStatus
    ? connections.filter((connection) => !connection.connected)
    : []
  return { connections, missingConnections }
}

/* ─── 오늘 할 일 / 주의 신호 ────────────────────────────────── */

export type OverviewSignalTone = "neutral" | "info" | "warning" | "danger" | "success"

export type OverviewOperationalAlert = {
  id: string
  scope: string
  title: string
  description: string
  meta: string
  tone: OverviewSignalTone
  action: string
  href: string
  priority: number
}

export interface OperationalAlertInput {
  // 미응답 리드(캐논 정의) — resolveUnrespondedSignal 산출값을 그대로 받는다.
  // 운영 OS '골든타임 24h' 타일과 같은 수·같은 기준을 쓴다(한 지표=한 라벨=한 기준).
  unrespondedCount: number
  unresponded24hCount: number
  todayLeads: number
  thisWeekLeads: number
  latestFailedCampaign?: EmailCampaign
  missingConnectionLabels: string[]
  openBugs: BugReport[]
  criticalOpenBugs: BugReport[]
  publishedBlogPostCount: number
  publishedPostsWithoutCta: number
  ctaCoverage: number
  draftCampaignCount: number
  sentCampaignCount: number
  nextUpcomingEvent?: CalendarEvent
  latestPatchNote?: PatchNote
}

export function buildOperationalAlerts(input: OperationalAlertInput): {
  alerts: OverviewOperationalAlert[]
  actionableAlertCount: number
} {
  const {
    unrespondedCount,
    unresponded24hCount,
    todayLeads,
    thisWeekLeads,
    latestFailedCampaign,
    missingConnectionLabels,
    openBugs,
    criticalOpenBugs,
    publishedBlogPostCount,
    publishedPostsWithoutCta,
    ctaCoverage,
    draftCampaignCount,
    sentCampaignCount,
    nextUpcomingEvent,
    latestPatchNote,
  } = input
  const missingConnectionSummary =
    missingConnectionLabels.length > 2
      ? `${missingConnectionLabels.slice(0, 2).join(", ")} 외 ${missingConnectionLabels.length - 2}개`
      : missingConnectionLabels.join(", ")
  const operationalAlertItems: Array<OverviewOperationalAlert | null> = [
    // '미응답' 정의는 골든타임 타일과 동일 캐논(resolveUnrespondedSignal) 하나만 쓴다 —
    // 과거 newLeads(전 소스 신규) 기준은 착지 보드(filter=unresponded)와 수가 달라 신호 드리프트였다.
    unrespondedCount > 0
      ? {
          id: "lead-followup",
          scope: "CRM",
          title: "신규 상태 리드 후속 리스크",
          description: `신규 상태 ${unrespondedCount}건 · 24h+ 경과 ${unresponded24hCount}건 · 데모·문의·Meta 운영 리드 기준(테스트 제외).`,
          meta: todayLeads > 0 ? `오늘 유입 ${todayLeads}건` : `이번 주 유입 ${thisWeekLeads}건`,
          // 골든타임(24h) 초과가 있으면 타일과 같은 breach 판정으로 danger, 아니면 warning.
          tone: unresponded24hCount > 0 ? ("danger" as const) : ("warning" as const),
          action: "24h+ 신규 상태 보드",
          // 리스크 렌즈가 켜진 미응답 보드로 직결 — bare /admin/crm 착지 금지(신호→행동 무손실).
          href: "/admin/crm/customers/leads?filter=unresponded_24h&focus=risk",
          priority: 100,
        }
      : null,
    latestFailedCampaign
      ? {
          id: `campaign-failed-${latestFailedCampaign.id}`,
          scope: "캠페인",
          title: "실패 캠페인 재점검",
          description: `${latestFailedCampaign.subject} · ${formatDateTime(latestFailedCampaign.sentAt ?? latestFailedCampaign.createdAt)} · 발송 실패 상태입니다.`,
          meta: "즉시 확인",
          tone: "danger" as const,
          action: "캠페인",
          href: "/admin/campaigns",
          priority: 95,
        }
      : null,
    missingConnectionLabels.length > 0
      ? {
          id: "connection-missing",
          scope: "연동",
          title: "외부 연동 설정 필요",
          description: `미연결 ${missingConnectionLabels.length}건 · ${missingConnectionSummary} · 전송 경로를 먼저 복구하세요.`,
          meta: `미연결 ${missingConnectionLabels.length}건`,
          tone: "warning" as const,
          action: "설정",
          href: "/admin/settings?tab=integrations",
          priority: 90,
        }
      : null,
    openBugs.length > 0
      ? {
          id: "open-bugs",
          scope: "Dev",
          title: "오픈 이슈 모니터링",
          description: `진행중 ${openBugs.length}건 · Critical/High ${criticalOpenBugs.length}건 · 최근 업데이트 ${formatDateTime(openBugs[0]?.updatedAt)}.`,
          meta: criticalOpenBugs.length > 0 ? `긴급 ${criticalOpenBugs.length}건` : `오픈 ${openBugs.length}건`,
          tone: criticalOpenBugs.length > 0 ? ("danger" as const) : ("warning" as const),
          action: "Dev 열기",
          href: "/admin/dev",
          priority: criticalOpenBugs.length > 0 ? 85 : 75,
        }
      : null,
    publishedPostsWithoutCta > 0
      ? {
          id: "cta-coverage",
          scope: "콘텐츠",
          title: "콘텐츠 CTA 보강 필요",
          description: `공개 글 ${publishedBlogPostCount}건 중 CTA 미완성 ${publishedPostsWithoutCta}건 · 현재 커버리지 ${ctaCoverage}%.`,
          meta: `CTA ${ctaCoverage}%`,
          tone: ctaCoverage < 50 ? ("warning" as const) : ("info" as const),
          action: "콘텐츠",
          href: "/admin/blog",
          priority: 70,
        }
      : null,
    draftCampaignCount > 0
      ? {
          id: "campaign-drafts",
          scope: "캠페인",
          title: "발송 대기 초안 확인",
          description: `초안 ${draftCampaignCount}건 · 발송 완료 ${sentCampaignCount}건 · 발송 검토 대상을 정리하세요.`,
          meta: `초안 ${draftCampaignCount}건`,
          tone: "info" as const,
          action: "초안 열기",
          href: "/admin/campaigns",
          priority: 60,
        }
      : null,
    nextUpcomingEvent
      ? {
          id: `calendar-${nextUpcomingEvent.id}`,
          scope: "일정",
          title: "다가오는 일정 점검",
          description: `${nextUpcomingEvent.title} · ${formatDateTime(`${nextUpcomingEvent.date}T${nextUpcomingEvent.time ?? "09:00"}`)} · 준비 상태를 미리 확인하세요.`,
          meta: nextUpcomingEvent.assignees?.join(", ") || "캘린더",
          tone: "info" as const,
          action: "캘린더",
          href: "/admin/calendar",
          priority: 50,
        }
      : null,
    latestPatchNote
      ? {
          id: latestPatchNote.id,
          scope: "배포",
          title: `최근 패치노트 v${latestPatchNote.version}`,
          description: `${latestPatchNote.title} · ${formatDateShort(latestPatchNote.date)} · 최근 변경 범위를 빠르게 확인합니다.`,
          meta: latestPatchNote.status === "published" ? "배포 완료" : "초안",
          tone: latestPatchNote.status === "published" ? ("success" as const) : ("info" as const),
          action: "패치노트",
          href: "/admin/dev",
          priority: 40,
        }
      : null,
  ]
  // 전체 정렬 목록을 반환한다 — 접힘 6건 컷은 페이지 렌더 몫(더보기/접기 토글이 실제로 동작하도록).
  const alerts = operationalAlertItems
    .filter((item): item is OverviewOperationalAlert => Boolean(item))
    .sort((a, b) => b.priority - a.priority)
  const actionableAlertCount = alerts.filter(
    (item) => item.tone === "warning" || item.tone === "danger"
  ).length
  return { alerts, actionableAlertCount }
}

/* ─── 파이프 커버리지 ───────────────────────────────────────── */

export interface BranchMonthlySeries {
  goal_cum: number[]
  revenue_cum: number[]
  revenue_trend_cum: number[]
}

// 예상 파이프 ÷ 잔여 목표. 잔여 목표가 0 이하이거나 시리즈가 없으면 null(표시 '—').
export function computePipelineCoverage(series: BranchMonthlySeries | null | undefined): number | null {
  if (!series) return null
  const last = (arr: number[] | undefined) => (arr && arr.length > 0 ? arr[arr.length - 1] : 0)
  const confirmed = last(series.revenue_cum)
  const pipelineTotal = last(series.revenue_trend_cum) - confirmed
  const remaining = last(series.goal_cum) - confirmed
  return remaining > 0 ? pipelineTotal / remaining : null
}

/* ─── 서버 프리페치 재사용 판정(T3) ─────────────────────────── */

// OverviewClient의 마운트 effect가 "서버가 채워 준 소스는 페치를 건너뛴다"를 결정하는 술어.
// staleTimes.dynamic(180초)으로 클라이언트 라우터 캐시가 예전 RSC 응답(그 안의 initialData)을
// 재사용할 수 있게 되면서, refreshKey === 0(첫 마운트)이라는 조건만으로는 "이 initialData가
// 지금 만들어졌다"를 보장하지 못한다 — 재사용된 payload는 최대 180초 전 것일 수 있다.
// 그래서 refreshKey === 0 이고 *또한* isPrefetchFresh(generatedAt)일 때만 페치를 건너뛴다.
// 재시도(refreshKey > 0)는 오늘과 동일하게 무조건 다시 받는다("다시 시도"가 같은 값을
// 되돌려주면 버튼이 거짓말이 된다 — 기존 주석과 동일한 이유).
export function shouldUsePrefetchedSource(
  refreshKey: number,
  generatedAt: number | null | undefined,
  now: number = Date.now()
): boolean {
  return refreshKey === 0 && isPrefetchFresh(generatedAt, now)
}
