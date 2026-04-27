import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { fyOf, FISCAL_MONTH_ORDER } from "@/lib/branch/fiscal"
import { summarizeRevenue, bottleneckKpi, closingDeals } from "@/lib/branch/computations/core-kpi"
import { listMembersByTeamFromDeals } from "@/lib/branch/computations/member-teams"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { getRecentSyncRuns } from "@/lib/repositories/branch-sync"
import { listPublicEvents } from "@/lib/repositories/public-events"

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
    const revenue_cum = months.map((m) => {
      const sum = deals.reduce((s, d) => {
        if (!d.first_payment) return s
        const hasRed = Object.keys(d.monthly_red).length > 0
        if (hasRed && !d.monthly_red[m]) return s
        return s + Number(d.monthly_payments[m] ?? 0)
      }, 0)
      revCum += sum
      return revCum
    })

    const eventsTimeline = events
      .filter((e) => months.some((mm) => e.startsAt.startsWith(mm)))
      .map((e) => ({ date: e.startsAt.slice(0, 10), title: e.title }))
    const dealsTimeline = deals
      .filter((d) => d.first_payment && months.some((mm) => d.first_payment!.startsWith(mm)))
      .map((d) => ({ date: d.first_payment!, customer: d.customer_name, amount: Number(d.contract_target ?? 0) }))
    const campaignsTimeline = campaigns.recent
      .filter((c) => c.sentAt && months.some((mm) => c.sentAt!.startsWith(mm)))
      .map((c) => ({ date: c.sentAt!, name: c.subject }))

    return NextResponse.json({
      team, period,
      revenue, bottleneck: bottle, closing,
      events_30d: { count: events30.length, regions: new Set(events30.map((e) => e.location ?? "")).size },
      campaigns_30d: { count: campaigns.count_30d, avg_open_pct: campaigns.avg_open_pct },
      campaigns_recent: campaigns.recent.slice(0, 8),
      lastSync: lastRun?.finished_at ?? lastRun?.started_at ?? null,
      lastError: lastRun?.status === "failed" ? lastRun.error ?? "동기화 실패" : null,
      monthly_series: { months, goal_cum, revenue_cum, events: eventsTimeline, deals: dealsTimeline, campaigns: campaignsTimeline },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
