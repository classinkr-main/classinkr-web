import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import type { DshBreakdownRow } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { fyOf, FISCAL_MONTH_ORDER, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"
import { summarizeRevenue, bottleneckKpi, closingDeals } from "@/lib/branch/computations/core-kpi"
import { listMembersByTeamFromDeals } from "@/lib/branch/computations/member-teams"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { getRecentSyncRuns } from "@/lib/repositories/branch-sync"
import { listPublicEvents } from "@/lib/repositories/public-events"

function pickValue(row: DshBreakdownRow, scope: "M" | "Q" | "Y", now: Date): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[fiscalQuarter(now.getUTCMonth() + 1) - 1] ?? 0
  return row.months[ymKey(now)] ?? 0
}

interface MixSlice { name: string; goal: number; actual: number; pct: number }
function buildMix(breakdown: DshBreakdownRow[], dim: "category" | "status_type" | "channel", scope: "M" | "Q" | "Y", now: Date): MixSlice[] {
  const goals = new Map<string, number>()
  const actuals = new Map<string, number>()
  for (const row of breakdown) {
    const key = row[dim]
    if (row.kind === "goal") goals.set(key, (goals.get(key) ?? 0) + pickValue(row, scope, now))
    else actuals.set(key, (actuals.get(key) ?? 0) + pickValue(row, scope, now))
  }
  const keys = new Set([...goals.keys(), ...actuals.keys()])
  return [...keys].map((k) => {
    const g = goals.get(k) ?? 0
    const a = actuals.get(k) ?? 0
    return { name: k, goal: g, actual: a, pct: g > 0 ? (a / g) * 100 : 0 }
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
    const teamMembers = new Set(listMembersByTeamFromDeals(deals, team))
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

    const dealMix = {
      by_category: buildMix(dsh.breakdown ?? [], "category", period, now),
      by_status_type: buildMix(dsh.breakdown ?? [], "status_type", period, now),
      by_channel: buildMix(dsh.breakdown ?? [], "channel", period, now),
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
