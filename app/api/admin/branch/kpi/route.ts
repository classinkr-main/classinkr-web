import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpiBlocks, selectKpiRows, KPI_METRICS, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listMembersByTeam, memberPacing, teamPacing } from "@/lib/branch/computations/pacing"
import { fyOf, resolvePeriodDate } from "@/lib/branch/fiscal"

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
  async (fy: number) => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fy),
  ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] },
)

const readKpiBlocks = unstable_cache(
  async () => parseKpiBlocks(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)),
  ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const now = resolvePeriodDate(period, url.searchParams.get("month"), new Date())
  if (!now) return NextResponse.json({ error: "Invalid month query" }, { status: 400 })
  try {
    const teams = team === "ALL" ? ["BD", "MKT", "CSM"] : [team]
    const [dsh, kpiBlocks, deals] = await Promise.all([readDsh(fyOf(now)), readKpiBlocks(), listBranchRevDeals({ team })])
    const kpiRows = selectKpiRows(kpiBlocks, period, now)
    const kpiRowsByMember = new Map(kpiRows.map((row) => [row.member, row]))
    const dealsByManager = new Map<string, typeof deals>()
    for (const deal of deals) {
      if (!deal.manager) continue
      const managerDeals = dealsByManager.get(deal.manager)
      if (managerDeals) managerDeals.push(deal)
      else dealsByManager.set(deal.manager, [deal])
    }
    const teamSummaries = teams.map((t) => ({ team: t, ...teamPacing(dsh, t, period, now) }))
    const members = listMembersByTeam(dsh, team).map((member) => {
      const pace = memberPacing(dsh, member, period, now)
      const memberDeals = dealsByManager.get(member) ?? []
      const kpiRow = kpiRowsByMember.get(member)
      const kpi = Object.fromEntries(
        KPI_METRICS.map((metric) => [metric, kpiRow?.pairs[metric] ?? { goal: 0, actual: 0 }]),
      )
      return {
        member,
        team: pace.team,
        goal: pace.goal,
        status: pace.status,
        achievement_pct: pace.pacing_pct,
        confirmed: pace.status,
        deals_total: memberDeals.length,
        deals_confirmed: memberDeals.filter((d) => Boolean(d.first_payment)).length,
        new_renew: memberDeals.reduce((acc, d) => {
          if (d.status === "New") acc.new += 1
          else if (d.status === "Renew") acc.renew += 1
          return acc
        }, { new: 0, renew: 0 }),
        kpi,
      }
    })
    return adminCachedJson({ teams: teamSummaries, members })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
