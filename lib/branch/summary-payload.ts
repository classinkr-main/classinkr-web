import "server-only"

import { unstable_cache } from "next/cache"
import { envSheetId, getSheetModifiedTime } from "@/lib/branch/google-sheets"
import { dedupeDshByKind } from "@/lib/branch/dsh-dedupe"
import type { DshBreakdownRow } from "@/lib/branch/parsers/dsh"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { readRevDealsPreferActiveWithSource } from "@/lib/branch/read-rev-deals"
import { readDshPreferDbWithSource, readKpiBlocksPreferDb } from "@/lib/branch/read-dsh-kpi"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"
import { fyOf, FISCAL_MONTH_ORDER, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"
import { summarizeRevenue, bottleneckKpi, closingDeals } from "@/lib/branch/computations/core-kpi"
import { confirmedMonthAmount } from "@/lib/branch/computations/rev-confirmed"
import { listMembersByTeam } from "@/lib/branch/computations/pacing"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { getRecentSyncRuns } from "@/lib/repositories/branch-sync"
import { listCachedPublicEvents } from "@/lib/repositories/public-events"

export type BranchSummaryTeam = "ALL" | "BD" | "MKT" | "CSM"
export type BranchSummaryPeriod = "M" | "Q" | "Y"

function pickValue(row: DshBreakdownRow, scope: "M" | "Q" | "Y", now: Date): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[fiscalQuarter(now.getUTCMonth() + 1) - 1] ?? 0
  return row.months[ymKey(now)] ?? 0
}

function pickPrevValue(row: DshBreakdownRow, scope: "M" | "Q" | "Y", now: Date): number | null {
  if (scope === "Y") return null // No prior FY data loaded
  if (scope === "Q") {
    const q = fiscalQuarter(now.getUTCMonth() + 1)
    if (q === 1) return null
    return row.quarters[q - 2] ?? 0
  }
  const prev = new Date(now)
  prev.setUTCMonth(prev.getUTCMonth() - 1)
  const key = ymKey(prev)
  if (!(key in row.months)) return null
  return row.months[key] ?? 0
}

function isPrevPeriodAvailable(breakdown: DshBreakdownRow[], scope: "M" | "Q" | "Y", now: Date): boolean {
  if (breakdown.length === 0) return false
  return pickPrevValue(breakdown[0], scope, now) != null
}

const PREV_PERIOD_LABEL: Record<"M" | "Q" | "Y", string> = { M: "전월", Q: "전분기", Y: "전년" }

// Monday-based week (Mon 00:00 UTC inclusive — next Mon 00:00 UTC exclusive)
function startOfWeekMon(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = out.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  out.setUTCDate(out.getUTCDate() + diff)
  return out
}

function classifyChannel(d: BranchRevDeal): string | null {
  const v = (d.deal_type ?? "").trim()
  if (v === "Direct") return "Direct"
  if (v === "Channel") return "Channel"
  return null
}

function classifySegment(d: BranchRevDeal): string | null {
  const v = (d.importance ?? "").trim().toUpperCase()
  if (v === "KA" || v === "SME") return v
  return null
}

function classifyStatusType(d: BranchRevDeal): string | null {
  const v = (d.status ?? "").trim().toLowerCase()
  if (!v) return null
  if (v === "new" || v === "신규") return "New"
  if (v === "renew" || v === "갱신") return "Renew"
  return null
}

// 원장 REV 탭 HW 필터와 동일한 공용 분류기(classifySalesLedgerProductCategory)를 쓴다 —
// 사설 정규식 사본을 유지하면 DealMix HW 비중이 원장 수치와 어긋난다. 공용 규약상
// 명확한 HW 신호가 없는 행은 전부 Software다(DSH breakdown 카테고리 표기에 맞춰 대문자화).
function classifyCategory(d: BranchRevDeal): string | null {
  const category = classifySalesLedgerProductCategory({ product: d.product_version, account: d.customer_name })
  return category === "hardware" ? "Hardware" : "Software"
}

const CLASSIFY: Record<"category" | "status_type" | "channel", (d: BranchRevDeal) => string | null> = {
  category: classifyCategory,
  status_type: classifyStatusType,
  channel: classifyChannel,
}

function aggregateWeekly(deals: BranchRevDeal[], weekStart: Date, weekEnd: Date, classify: (d: BranchRevDeal) => string | null): { totals: Map<string, number>; mappedCount: number } {
  const totals = new Map<string, number>()
  let mappedCount = 0
  const startMs = weekStart.getTime()
  const endMs = weekEnd.getTime()
  for (const d of deals) {
    if (!d.first_payment) continue
    const t = Date.parse(`${d.first_payment}T00:00:00Z`)
    if (Number.isNaN(t)) continue
    if (t < startMs || t >= endMs) continue
    const key = classify(d)
    if (!key) continue
    const amount = Number(d.contract_target ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    totals.set(key, (totals.get(key) ?? 0) + amount)
    mappedCount += 1
  }
  return { totals, mappedCount }
}

interface MixSlice {
  name: string
  goal: number
  actual: number
  pct: number
  prev_actual: number | null
  week_actual: number | null
  prev_week_actual: number | null
}

interface MixMeta {
  prev_period_label: string
  prev_period_available: boolean
  weekly_available: boolean
}

function buildMix(
  breakdown: DshBreakdownRow[],
  dim: "category" | "status_type" | "channel",
  scope: "M" | "Q" | "Y",
  now: Date,
  weekTotals: Map<string, number> | null,
  prevWeekTotals: Map<string, number> | null,
): MixSlice[] {
  const goals = new Map<string, number>()
  const actuals = new Map<string, number>()
  const prevActuals = new Map<string, number>()
  const prevAvailable = isPrevPeriodAvailable(breakdown, scope, now)
  // 파서 breakdown은 같은 (kind, category, status_type, channel) 콤보를 스코프별
  // (전사 + 팀/멤버 섹션)로 반복 방출한다 — raw 합산은 전사 연간 목표를 ~3배로 부풀리고,
  // goal·status 배율이 달라 pct까지 왜곡된다. 최대-annual 채택(dedupeDshByKind)이 필수다.
  const deduped = dedupeDshByKind(breakdown)
  for (const row of deduped.goal.values()) {
    const key = row[dim]
    goals.set(key, (goals.get(key) ?? 0) + pickValue(row, scope, now))
  }
  for (const row of deduped.status.values()) {
    const key = row[dim]
    actuals.set(key, (actuals.get(key) ?? 0) + pickValue(row, scope, now))
    if (prevAvailable) {
      const prev = pickPrevValue(row, scope, now) ?? 0
      prevActuals.set(key, (prevActuals.get(key) ?? 0) + prev)
    }
  }
  const keys = new Set([...goals.keys(), ...actuals.keys()])
  return [...keys].map((k) => {
    const g = goals.get(k) ?? 0
    const a = actuals.get(k) ?? 0
    return {
      name: k,
      goal: g,
      actual: a,
      pct: g > 0 ? (a / g) * 100 : 0,
      prev_actual: prevAvailable ? prevActuals.get(k) ?? 0 : null,
      week_actual: weekTotals ? weekTotals.get(k) ?? 0 : null,
      prev_week_actual: prevWeekTotals ? prevWeekTotals.get(k) ?? 0 : null,
    }
  }).sort((x, y) => y.goal - x.goal)
}

// KR Team 개요의 '다가오는 일정'은 세 타임라인을 합친 뒤 오늘 이후 날짜순 8개만
// 렌더한다. 기본 응답과 장부 계약은 그대로 두고, 명시적인 view=overview 요청에서만
// 같은 결과 집합을 서버에서 선별해 회계연도 전체 일정의 과전송을 막는다.
const OVERVIEW_UPCOMING_LIMIT = 8

interface SummaryTimelines {
  events: Array<{ date: string; title: string }>
  deals: Array<{ date: string; customer: string; amount: number }>
  campaigns: Array<{ date: string; name: string }>
}

function projectOverviewTimelines(timelines: SummaryTimelines, now: Date): SummaryTimelines {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const refs = [
    ...timelines.deals.map((row, index) => ({ kind: "deals" as const, index, date: row.date })),
    ...timelines.events.map((row, index) => ({ kind: "events" as const, index, date: row.date })),
    ...timelines.campaigns.map((row, index) => ({ kind: "campaigns" as const, index, date: row.date })),
  ]
    .filter((item) => {
      const date = new Date(item.date)
      if (Number.isNaN(date.getTime())) return false
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) >= todayUtc
    })
    // Array#sort는 안정 정렬이므로 같은 날짜에는 클라이언트와 동일하게 딜→행사→캠페인
    // 순서를 유지한다(BranchUpcomingDeals의 결합 순서와 같음).
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, OVERVIEW_UPCOMING_LIMIT)

  const selected = new Set(refs.map((item) => `${item.kind}:${item.index}`))
  return {
    deals: timelines.deals.filter((_, index) => selected.has(`deals:${index}`)),
    events: timelines.events.filter((_, index) => selected.has(`events:${index}`)),
    campaigns: timelines.campaigns.filter((_, index) => selected.has(`campaigns:${index}`)),
  }
}

// DSH/KPI는 DB-우선 사다리(액티브 임포트 → 시트 미러 → 라이브 시트 초기 폴백)를 탄다.
// 계층별 캐시는 read-dsh-kpi.ts / branch-dsh-kpi-mirror.ts 안에 있다. WithSource 변형은
// "지금 보는 수치가 어느 단계에서, 언제 왔는지"(data_sources)도 함께 반환한다.
const readDshWithSource = (fy: number) => readDshPreferDbWithSource(fy)
const readKpi = async (fy: number) => (await readKpiBlocksPreferDb(fy)).fy

// Freshness hint — newest modifiedTime across both source sheets.
// 60s revalidate keeps Drive API call rate well under any quota concern
// while still surfacing edits within a minute.
const readSheetFreshness = unstable_cache(async () => {
  const [dash, hw] = await Promise.all([
    getSheetModifiedTime(envSheetId("dashboard")),
    getSheetModifiedTime(envSheetId("hardware")),
  ])
  const candidates = [dash, hw].filter((t): t is string => Boolean(t))
  if (candidates.length === 0) return null
  return candidates.sort().pop() ?? null
}, ["branch-sheet-freshness"], { revalidate: 60, tags: ["branch-sheet-freshness"] })

export interface BranchSummaryPayloadQuery {
  team: BranchSummaryTeam
  period: BranchSummaryPeriod
  /** resolvePeriodDate(period, month, now)의 결과 — 호출부가 이미 검증한 값. */
  periodDate: Date
  /** dsh_breakdown·dsh_rows opt-in(라우트의 ?breakdown=1). */
  includeBreakdown: boolean
  /** 개요 전용 타임라인 projection(라우트의 ?view=overview). */
  overviewView: boolean
  /** "지금"의 기준 시각 — 마감 예정 딜·주간 축·행사 30일 창이 모두 이 값을 쓴다. */
  now: Date
  /**
   * Google Drive 신선도 조회(readSheetFreshness)를 건너뛴다. 라우트는 항상 false —
   * 응답 계약을 그대로 유지한다. 서버 프리페치(app/admin/branch/page.tsx)만 true를 주는데,
   * 이 값은 sheetModifiedAt(그리고 DSH 원천이 'live'일 때만 쓰이는 data_sources.dsh.asOf)
   * 하나에만 쓰이고 shape은 그대로이며(둘 다 이미 nullable), null은 Drive 조회 실패 때와
   * 동일하게 "알 수 없음"으로 fail-soft 처리되는 기존 값이다 — Drive 왕복 2회를 HTML TTFB에
   * 얹지 않는 편이 낫다.
   */
  skipSheetFreshness?: boolean
}

/**
 * GET /api/admin/branch/summary 응답 본문을 만드는 조립 로직.
 *
 * 라우트(app/api/admin/branch/summary/route.ts)와 페이지 서버 프리페치
 * (app/admin/branch/page.tsx)가 같은 함수를 써야 두 경로의 페이로드가 갈라지지 않는다.
 * 쿼리 파싱·검증(team/period/month 400)과 인증·캐시 헤더는 각 호출부가 담당한다.
 */
export async function buildBranchSummaryPayload(query: BranchSummaryPayloadQuery) {
  const { team, period, periodDate, includeBreakdown, overviewView, now: currentDate, skipSheetFreshness = false } = query
  const [dshResult, kpi, revResult, campaigns, runs, events, sheetModifiedAt] = await Promise.all([
    readDshWithSource(fyOf(periodDate)), readKpi(fyOf(periodDate)), readRevDealsPreferActiveWithSource(fyOf(periodDate), { team }), summarizeCampaigns(currentDate), getRecentSyncRuns(3), listCachedPublicEvents(),
    skipSheetFreshness ? Promise.resolve(null) : readSheetFreshness(),
  ])
  const dsh = dshResult.dsh
  const deals = revResult.deals
  const teamMembers = new Set(listMembersByTeam(dsh, team))
  const revenue = summarizeRevenue(dsh, deals, team, period, periodDate)
  const bottle = bottleneckKpi(kpi, teamMembers)
  const closing = closingDeals(deals, currentDate)
  const events30 = events.filter((e) => {
    const t = new Date(e.startsAt).getTime()
    return t >= currentDate.getTime() && t <= currentDate.getTime() + 30*86400_000
  })
  const lastRun = runs[0]
  // 임포트 폴백만 활성 런의 캡처 시각(source.asOf)을 쓴다. 미러/라이브 폴백의 asOf는
  // 이미 계산된 lastSync/sheetModifiedAt을 재사용한다(같은 값을 다시 조회하는 왕복 없음).
  const lastSync = lastRun?.finished_at ?? lastRun?.started_at ?? null
  const data_sources = {
    rev: {
      kind: revResult.source.kind,
      asOf: revResult.source.kind === "import" ? revResult.source.asOf : lastSync,
      ...(revResult.source.runId ? { runId: revResult.source.runId } : {}),
    },
    dsh: {
      kind: dshResult.source.kind,
      asOf:
        dshResult.source.kind === "import"
          ? dshResult.source.asOf
          : dshResult.source.kind === "mirror"
            ? lastSync
            : sheetModifiedAt,
      ...(dshResult.source.runId ? { runId: dshResult.source.runId } : {}),
    },
  }

  const fy = fyOf(periodDate)
  const months: string[] = FISCAL_MONTH_ORDER.map((m) => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, "0")}`)

  const teamGoalRow = team === "ALL" ? null : dsh.rows.find((r) => r.level === "team" && r.team === team && r.kind === "goal")
  const monthGoal = (m: string) => team === "ALL"
    ? (["BD", "MKT", "CSM"] as const).reduce((s, t) => {
        const g = dsh.rows.find((r) => r.level === "team" && r.team === t && r.kind === "goal")
        return s + (g?.months[m] ?? 0)
      }, 0)
    : (teamGoalRow?.months[m] ?? 0)

  let goalCum = 0
  const goal_cum = months.map((m) => { goalCum += monthGoal(m); return goalCum })

  let revCum = 0
  let trendCum = 0
  const revenue_cum: number[] = []
  const revenue_trend_cum: number[] = []
  for (const m of months) {
    const month = deals.reduce((acc, d) => {
      const amount = Number(d.monthly_payments[m] ?? 0)
      if (!amount) return acc
      if (!d.first_payment) return { ...acc, trend: acc.trend + amount }
      const confirmed = confirmedMonthAmount(d, m, amount)
      return { confirmed: acc.confirmed + confirmed, trend: acc.trend + (amount - confirmed) }
    }, { confirmed: 0, trend: 0 })
    revCum += month.confirmed
    trendCum += month.confirmed + month.trend
    revenue_cum.push(revCum)
    revenue_trend_cum.push(trendCum)
  }
  const confirmed_through_index = Math.max(0, months.indexOf(ymKey(periodDate)))

  const eventsTimeline = events
    .filter((e) => months.some((mm) => e.startsAt.startsWith(mm)))
    .map((e) => ({ date: e.startsAt.slice(0, 10), title: e.title }))
  const dealsTimeline = deals
    .filter((d) => d.first_payment && months.some((mm) => d.first_payment!.startsWith(mm)))
    .map((d) => ({ date: d.first_payment!, customer: d.customer_name, amount: Number(d.contract_target ?? 0) }))
  const campaignsTimeline = campaigns.recent
    .filter((c) => c.sentAt && months.some((mm) => c.sentAt!.startsWith(mm)))
    .map((c) => ({ date: c.sentAt!, name: c.subject }))
  const timelines = overviewView
    ? projectOverviewTimelines({ events: eventsTimeline, deals: dealsTimeline, campaigns: campaignsTimeline }, currentDate)
    : { events: eventsTimeline, deals: dealsTimeline, campaigns: campaignsTimeline }

  const breakdown = dsh.breakdown ?? []

  const calMonth = periodDate.getUTCMonth() + 1
  const fyQuarterMonths = (q: 1 | 2 | 3 | 4): string[] => {
    const qMos = q === 1 ? [4,5,6] : q === 2 ? [7,8,9] : q === 3 ? [10,11,12] : [1,2,3]
    return qMos.map((m) => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, "0")}`)
  }
  const periodMonths =
    period === "Y" ? months
    : period === "M" ? [ymKey(periodDate)]
    : fyQuarterMonths(fiscalQuarter(calMonth))
  const prevMonthDate = (() => { const d = new Date(periodDate); d.setUTCMonth(d.getUTCMonth() - 1); return d })()
  const prevPeriodMonths: string[] | null =
    period === "Y" ? null
    : period === "M" ? (months.includes(ymKey(prevMonthDate)) ? [ymKey(prevMonthDate)] : null)
    : (() => {
        const q = fiscalQuarter(calMonth)
        if (q === 1) return null
        return fyQuarterMonths((q - 1) as 1 | 2 | 3 | 4)
      })()

  const thisWeekStart = startOfWeekMon(currentDate)
  const thisWeekEnd = new Date(thisWeekStart)
  thisWeekEnd.setUTCDate(thisWeekEnd.getUTCDate() + 7)
  const prevWeekStart = new Date(thisWeekStart)
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7)

  const buildSegmentMix = (): { slices: MixSlice[]; meta: MixMeta } => {
    const SEGMENTS = ["KA", "SME"] as const
    const acc: Record<string, { goal: number; actual: number; prev_actual: number }> = {
      KA: { goal: 0, actual: 0, prev_actual: 0 },
      SME: { goal: 0, actual: 0, prev_actual: 0 },
    }
    for (const deal of deals) {
      const seg = classifySegment(deal)
      if (!seg) continue
      for (const mo of periodMonths) {
        const amount = Number(deal.monthly_payments[mo] ?? 0)
        if (!amount) continue
        acc[seg].goal += amount
        if (deal.first_payment) acc[seg].actual += confirmedMonthAmount(deal, mo, amount)
      }
      if (prevPeriodMonths) {
        for (const mo of prevPeriodMonths) {
          const amount = Number(deal.monthly_payments[mo] ?? 0)
          if (!amount) continue
          if (deal.first_payment) acc[seg].prev_actual += confirmedMonthAmount(deal, mo, amount)
        }
      }
    }
    const thisWk = aggregateWeekly(deals, thisWeekStart, thisWeekEnd, classifySegment)
    const prevWk = aggregateWeekly(deals, prevWeekStart, thisWeekStart, classifySegment)
    const weeklyAvailable = thisWk.mappedCount > 0 || prevWk.mappedCount > 0
    const slices = SEGMENTS.map((name) => {
      const { goal, actual, prev_actual } = acc[name]
      return {
        name,
        goal,
        actual,
        pct: goal > 0 ? (actual / goal) * 100 : 0,
        prev_actual: prevPeriodMonths ? prev_actual : null,
        week_actual: weeklyAvailable ? thisWk.totals.get(name) ?? 0 : null,
        prev_week_actual: weeklyAvailable ? prevWk.totals.get(name) ?? 0 : null,
      }
    })
    return {
      slices,
      meta: {
        prev_period_label: PREV_PERIOD_LABEL[period],
        prev_period_available: prevPeriodMonths != null,
        weekly_available: weeklyAvailable,
      },
    }
  }
  const buildSlice = (dim: "category" | "status_type" | "channel"): { slices: MixSlice[]; meta: MixMeta } => {
    const classify = CLASSIFY[dim]
    const thisWk = aggregateWeekly(deals, thisWeekStart, thisWeekEnd, classify)
    const prevWk = aggregateWeekly(deals, prevWeekStart, thisWeekStart, classify)
    const weeklyAvailable = thisWk.mappedCount > 0 || prevWk.mappedCount > 0
    const slices = buildMix(
      breakdown, dim, period, periodDate,
      weeklyAvailable ? thisWk.totals : null,
      weeklyAvailable ? prevWk.totals : null,
    )
    return {
      slices,
      meta: {
        prev_period_label: PREV_PERIOD_LABEL[period],
        prev_period_available: isPrevPeriodAvailable(breakdown, period, periodDate),
        weekly_available: weeklyAvailable,
      },
    }
  }

  const cat = buildSlice("category")
  const stat = buildSlice("status_type")
  const chan = buildSlice("channel")
  const seg = buildSegmentMix()
  const dealMix = {
    by_category: cat.slices,
    by_status_type: stat.slices,
    by_channel: chan.slices,
    by_segment: seg.slices,
    meta: {
      by_category: cat.meta,
      by_status_type: stat.meta,
      by_channel: chan.meta,
      by_segment: seg.meta,
    },
  }

  return {
    team, period,
    revenue, bottleneck: bottle, closing,
    events_30d: { count: events30.length, regions: new Set(events30.map((e) => e.location ?? "")).size },
    campaigns_30d: { count: campaigns.count_30d, avg_open_pct: campaigns.avg_open_pct },
    campaigns_recent: campaigns.recent.slice(0, 8),
    lastSync,
    lastError: lastRun?.status === "failed" ? lastRun.error ?? "동기화 실패" : null,
    sheetModifiedAt,
    data_sources,
    monthly_series: {
      months,
      goal_cum,
      revenue_cum,
      revenue_trend_cum,
      confirmed_through_index,
      events: timelines.events,
      deals: timelines.deals,
      campaigns: timelines.campaigns,
    },
    deal_mix: dealMix,
    // 장부 DSH 수치 그리드 원천 — 파서 breakdown(DshBreakdownRow[])을 그대로 노출한다.
    // 팀 필터와 무관한 Team KR 전사 수치(시트 '1. DSH'의 Goal/Status × Software/Hardware
    // × New/Renew × Direct/Channel 블록). ?breakdown=1일 때만 실는다(readBreakdownFlag 주석
    // 참고) — 플래그 없으면 키 자체를 생략한다(undefined 값이 아니라 spread 자체를 건너뜀).
    // 이 분기는 응답 직렬화 단계뿐이라 unstable_cache(readSheetFreshness, 고정 키
    // "branch-sheet-freshness")와는 무관 — 캐시 키에 breakdown을 안 태워도 안전하다.
    // dsh_rows(파서 DshRow[]: 팀 ALL/BD/MKT/CSM + 멤버 × goal/status)는 장부 DSH 렌즈의
    // 팀·멤버 그리드(DshTeamGrid) 원천 — breakdown과 동일한 opt-in 플래그에 함께 태운다
    // (같은 소비처 한 곳뿐이라 별도 플래그를 늘리지 않는다). 추가 페이로드는 팀 8행+멤버
    // ~20행 수준으로 breakdown보다 훨씬 작고, 캐시 키 무변경 안전 근거도 위와 동일하다.
    ...(includeBreakdown ? { dsh_breakdown: breakdown, dsh_rows: dsh.rows } : {}),
  }
}
