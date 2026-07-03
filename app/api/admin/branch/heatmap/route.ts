import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { readRevDealsPreferActive } from "@/lib/branch/read-rev-deals"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"
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

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const periodDate = resolvePeriodDate(period, url.searchParams.get("month"), new Date())
  if (!periodDate) return NextResponse.json({ error: "Invalid month query" }, { status: 400 })
  try {
    // summary와 동일 규약: DB-native 액티브 임포트 우선, 시트 미러 폴백 — 탭 간 데이터 정합
    const deals = await readRevDealsPreferActive(fyOf(periodDate), { team })
    const rows = computeHeatmap(deals, period, periodDate, team)
    return adminCachedJson({ rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
