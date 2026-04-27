import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE, KPI_METRICS } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { teamPacing, memberPacing, listMembersByTeam } from "@/lib/branch/computations/pacing"
import { fyOf } from "@/lib/branch/fiscal"

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

const readDsh = unstable_cache(
  async () => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fyOf(new Date())),
  ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] },
)
const readKpi = unstable_cache(
  async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)),
  ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const now = new Date()
  try {
    const [dsh, kpi, deals] = await Promise.all([readDsh(), readKpi(), listBranchRevDeals({ team })])
    const kpiByMember = new Map(kpi.map((row) => [row.member, row]))
    const dealsByManager = new Map<string, typeof deals>()
    for (const deal of deals) {
      if (!deal.manager) continue
      const managerDeals = dealsByManager.get(deal.manager)
      if (managerDeals) managerDeals.push(deal)
      else dealsByManager.set(deal.manager, [deal])
    }
    const members = listMembersByTeam(dsh, team).filter((m) => kpiByMember.has(m))
    const teams = team === "ALL" ? ["BD","MKT","CSM"] : [team]
    const teamSummaries = teams.map((t) => ({ team: t, ...teamPacing(dsh, t, period, now) }))
    const memberSummaries = members.map((m) => {
      const p = memberPacing(dsh, m, period, now)
      const k = kpiByMember.get(m)!
      const dealsOf = dealsByManager.get(m) ?? []
      let confirmed = 0
      let dealsConfirmed = 0
      const newRenew = dealsOf.reduce((acc, d) => {
        if (d.first_payment) {
          dealsConfirmed += 1
          const hasRed = Object.keys(d.monthly_red).length > 0
          confirmed += Object.entries(d.monthly_payments).reduce((s, [ym, v]) => {
            if (hasRed && !d.monthly_red[ym]) return s
            return s + Number(v)
          }, 0)
        }
        if (d.status === "New") acc.new += 1
        else if (d.status === "Renew") acc.renew += 1
        return acc
      }, { new: 0, renew: 0 })
      return {
        member: m, team: p.team,
        goal: p.goal, status: p.status, achievement_pct: p.pacing_pct,
        confirmed,
        deals_total: dealsOf.length,
        deals_confirmed: dealsConfirmed,
        new_renew: newRenew,
        kpi: KPI_METRICS.reduce((acc, mt) => ({ ...acc, [mt]: k.pairs[mt] }), {} as Record<string, { goal: number; actual: number }>),
      }
    })
    return NextResponse.json({ teams: teamSummaries, members: memberSummaries })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
