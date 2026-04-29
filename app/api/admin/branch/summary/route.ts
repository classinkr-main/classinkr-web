import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import type { DshBreakdownRow } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { fyOf, FISCAL_MONTH_ORDER, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"
import { summarizeRevenue, bottleneckKpi, closingDeals } from "@/lib/branch/computations/core-kpi"
import { listMembersByTeam } from "@/lib/branch/computations/pacing"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { getRecentSyncRuns } from "@/lib/repositories/branch-sync"
import { listPublicEvents } from "@/lib/repositories/public-events"

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

function classifyCategory(d: BranchRevDeal): string | null {
  const v = (d.product_version ?? "").trim()
  if (!v) return null
  if (/IFP|OPS|S1|T1|카메라|모니터|hardware|HW\b/i.test(v)) return "Hardware"
  if (/SW\b|software|소프트웨어|구독|subscription|classin|클래스인|annual|license|라이선스/i.test(v)) return "Software"
  return null
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
  for (const row of breakdown) {
    const key = row[dim]
    if (row.kind === "goal") goals.set(key, (goals.get(key) ?? 0) + pickValue(row, scope, now))
    else {
      actuals.set(key, (actuals.get(key) ?? 0) + pickValue(row, scope, now))
      if (prevAvailable) {
        const prev = pickPrevValue(row, scope, now) ?? 0
        prevActuals.set(key, (prevActuals.get(key) ?? 0) + prev)
      }
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

type BranchTeam = "ALL" | "BD" | "MKT" | "CSM"
type BranchPeriod = "M" | "Q" | "Y"

const BRANCH_TEAMS = new Set<BranchTeam>(["ALL", "BD", "MKT", "CSM"])
const BRANCH_PERIODS = new Set<BranchPeriod>(["M", "Q", "Y"])

function readTeamParam(url: URL): BranchTeam | NextResponse {
  const team = url.searchParams.get("team") ?? "ALL"
  if (BRANCH_TEAMS.has(team as BranchTeam)) return team as BranchTeam
  return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
}

function readPeriodParam(url: URL): BranchPeriod | NextResponse {
  const period = url.searchParams.get("period") ?? "Q"
  if (BRANCH_PERIODS.has(period as BranchPeriod)) return period as BranchPeriod
  return NextResponse.json({ error: "Invalid period query" }, { status: 400 })
}

const readDsh = unstable_cache(async () => {
  const id = envSheetId("dashboard")
  const grid = await readRangeWithFormat(id, DSH_RANGE)
  return parseDsh(grid, fyOf(new Date()))
}, ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] })

const readKpi = unstable_cache(async () => {
  const id = envSheetId("dashboard")
  const grid = await readRangeWithFormat(id, KPI_RANGE)
  return parseKpi(grid)
}, ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] })

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const now = new Date()
  try {
    const [dsh, kpi, deals, campaigns, runs, events] = await Promise.all([
      readDsh(), readKpi(), listBranchRevDeals({ team }), summarizeCampaigns(now), getRecentSyncRuns(3), listPublicEvents(),
    ])
    const teamMembers = new Set(listMembersByTeam(dsh, team))
    const revenue = summarizeRevenue(dsh, deals, team, period, now)
    const bottle = bottleneckKpi(kpi, teamMembers)
    const closing = closingDeals(deals, now)
    const events30 = events.filter((e) => {
      const t = new Date(e.startsAt).getTime()
      return t >= now.getTime() && t <= now.getTime() + 30*86400_000
    })
    const lastRun = runs[0]

    const fy = fyOf(now)
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
        const hasRed = Object.keys(d.monthly_red).length > 0
        if (!hasRed || d.monthly_red[m]) return { ...acc, confirmed: acc.confirmed + amount }
        return { ...acc, trend: acc.trend + amount }
      }, { confirmed: 0, trend: 0 })
      revCum += month.confirmed
      trendCum += month.confirmed + month.trend
      revenue_cum.push(revCum)
      revenue_trend_cum.push(trendCum)
    }
    const confirmed_through_index = Math.max(0, months.indexOf(ymKey(now)))

    const eventsTimeline = events
      .filter((e) => months.some((mm) => e.startsAt.startsWith(mm)))
      .map((e) => ({ date: e.startsAt.slice(0, 10), title: e.title }))
    const dealsTimeline = deals
      .filter((d) => d.first_payment && months.some((mm) => d.first_payment!.startsWith(mm)))
      .map((d) => ({ date: d.first_payment!, customer: d.customer_name, amount: Number(d.contract_target ?? 0) }))
    const campaignsTimeline = campaigns.recent
      .filter((c) => c.sentAt && months.some((mm) => c.sentAt!.startsWith(mm)))
      .map((c) => ({ date: c.sentAt!, name: c.subject }))

    const breakdown = dsh.breakdown ?? []

    const calMonth = now.getUTCMonth() + 1
    const fyQuarterMonths = (q: 1 | 2 | 3 | 4): string[] => {
      const qMos = q === 1 ? [4,5,6] : q === 2 ? [7,8,9] : q === 3 ? [10,11,12] : [1,2,3]
      return qMos.map((m) => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, "0")}`)
    }
    const periodMonths =
      period === "Y" ? months
      : period === "M" ? [ymKey(now)]
      : fyQuarterMonths(fiscalQuarter(calMonth))
    const prevMonthDate = (() => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 1); return d })()
    const prevPeriodMonths: string[] | null =
      period === "Y" ? null
      : period === "M" ? (months.includes(ymKey(prevMonthDate)) ? [ymKey(prevMonthDate)] : null)
      : (() => {
          const q = fiscalQuarter(calMonth)
          if (q === 1) return null
          return fyQuarterMonths((q - 1) as 1 | 2 | 3 | 4)
        })()

    const thisWeekStart = startOfWeekMon(now)
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
        const hasRed = Object.keys(deal.monthly_red).length > 0
        for (const mo of periodMonths) {
          const amount = Number(deal.monthly_payments[mo] ?? 0)
          if (!amount) continue
          acc[seg].goal += amount
          if (deal.first_payment && (!hasRed || deal.monthly_red[mo])) acc[seg].actual += amount
        }
        if (prevPeriodMonths) {
          for (const mo of prevPeriodMonths) {
            const amount = Number(deal.monthly_payments[mo] ?? 0)
            if (!amount) continue
            if (deal.first_payment && (!hasRed || deal.monthly_red[mo])) acc[seg].prev_actual += amount
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
        breakdown, dim, period, now,
        weeklyAvailable ? thisWk.totals : null,
        weeklyAvailable ? prevWk.totals : null,
      )
      return {
        slices,
        meta: {
          prev_period_label: PREV_PERIOD_LABEL[period],
          prev_period_available: isPrevPeriodAvailable(breakdown, period, now),
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

    return NextResponse.json({
      team, period,
      revenue, bottleneck: bottle, closing,
      events_30d: { count: events30.length, regions: new Set(events30.map((e) => e.location ?? "")).size },
      campaigns_30d: { count: campaigns.count_30d, avg_open_pct: campaigns.avg_open_pct },
      campaigns_recent: campaigns.recent.slice(0, 8),
      lastSync: lastRun?.finished_at ?? lastRun?.started_at ?? null,
      lastError: lastRun?.status === "failed" ? lastRun.error ?? "동기화 실패" : null,
      monthly_series: {
        months,
        goal_cum,
        revenue_cum,
        revenue_trend_cum,
        confirmed_through_index,
        events: eventsTimeline,
        deals: dealsTimeline,
        campaigns: campaignsTimeline,
      },
      deal_mix: dealMix,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
