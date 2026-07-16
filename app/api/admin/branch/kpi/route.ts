import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { selectKpiRows, KPI_METRICS } from "@/lib/branch/parsers/kpi"
import { readRevDealsPreferActive } from "@/lib/branch/read-rev-deals"
import { readDshPreferDb, readKpiBlocksPreferDb } from "@/lib/branch/read-dsh-kpi"
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

// DSH/KPI/REV 모두 DB-우선 사다리(액티브 임포트 → 시트 미러 → 라이브 시트 초기 폴백).
// 계층별 캐시는 read-dsh-kpi.ts / branch-dsh-kpi-mirror.ts / read-rev-deals.ts 안에 있다.
const readDsh = (fy: number) => readDshPreferDb(fy)
const readKpiBlocks = (fy: number) => readKpiBlocksPreferDb(fy)

async function readRevDeals(fy: number, team: BranchTeam) {
  return readRevDealsPreferActive(fy, { team })
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const now = resolvePeriodDate(period, url.searchParams.get("month"), new Date())
  if (!now) return NextResponse.json({ error: "Invalid month query" }, { status: 400 })
  try {
    const teams = team === "ALL" ? ["BD", "MKT", "CSM"] : [team]
    const fy = fyOf(now)
    const [dsh, kpiBlocks, deals] = await Promise.all([readDsh(fy), readKpiBlocks(fy), readRevDeals(fy, team)])
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
