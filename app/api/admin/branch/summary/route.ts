import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { fyOf, FISCAL_MONTH_ORDER } from "@/lib/branch/fiscal"
import { summarizeRevenue, bottleneckKpi, closingDeals } from "@/lib/branch/computations/core-kpi"
import { listMembersByTeam } from "@/lib/branch/computations/pacing"
import { summarizeCampaigns } from "@/lib/branch/computations/campaigns"
import { getRecentSyncRuns } from "@/lib/repositories/branch-sync"
import { listPublicEvents } from "@/lib/repositories/public-events"

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
  const team = (url.searchParams.get("team") ?? "ALL") as "ALL"|"BD"|"MKT"|"CSM"
  const period = (url.searchParams.get("period") ?? "Q") as "M"|"Q"|"Y"
  const now = new Date()
  try {
    const [dsh, kpi, deals, campaigns, runs, events] = await Promise.all([
      readDsh(), readKpi(), listBranchRevDeals(), summarizeCampaigns(now), getRecentSyncRuns(3), listPublicEvents(),
    ])
    const filteredDeals = team === "ALL" ? deals : deals.filter((d) => d.team === team)
    const teamMembers = new Set(listMembersByTeam(dsh, team))
    const revenue = summarizeRevenue(dsh, filteredDeals, team, period, now)
    const bottle = bottleneckKpi(kpi, teamMembers)
    const closing = closingDeals(filteredDeals, now)
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
      const sum = filteredDeals.reduce((s, d) => {
        if (!d.first_payment) return s
        if (!d.monthly_red[m]) return s
        return s + Number(d.monthly_payments[m] ?? 0)
      }, 0)
      revCum += sum
      return revCum
    })

    const eventsTimeline = events
      .filter((e) => months.some((mm) => e.startsAt.startsWith(mm)))
      .map((e) => ({ date: e.startsAt.slice(0, 10), title: e.title }))
    const dealsTimeline = filteredDeals
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
