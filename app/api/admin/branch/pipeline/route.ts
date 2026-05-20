import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listRevRevenue } from "@/lib/branch/computations/pipeline"
import { resolvePeriodDate } from "@/lib/branch/fiscal"

type BranchTeam = "ALL" | "BD" | "MKT" | "CSM"
type BranchPeriod = "M" | "Q" | "Y"

const BRANCH_TEAMS = new Set<BranchTeam>(["ALL", "BD", "MKT", "CSM"])
const BRANCH_PERIODS = new Set<BranchPeriod>(["M", "Q", "Y"])

function readTeamParam(url: URL): BranchTeam | undefined | NextResponse {
  const team = url.searchParams.get("team")
  if (!team) return undefined
  if (BRANCH_TEAMS.has(team as BranchTeam)) return team as BranchTeam
  return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
}

function readPeriodParam(url: URL): BranchPeriod | undefined | NextResponse {
  const period = url.searchParams.get("period")
  if (!period) return undefined
  if (BRANCH_PERIODS.has(period as BranchPeriod)) return period as BranchPeriod
  return NextResponse.json({ error: "Invalid period query" }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const periodDate = period ? resolvePeriodDate(period, url.searchParams.get("month"), new Date()) : null
  if (period && !periodDate) return NextResponse.json({ error: "Invalid month query" }, { status: 400 })
  try {
    const deals = await listBranchRevDeals({ team })
    const rows = listRevRevenue(deals, {
      team,
      manager: url.searchParams.get("manager") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
    }, period && periodDate ? { period, now: periodDate } : undefined)
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
