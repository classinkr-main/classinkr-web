import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { resolvePeriodDate } from "@/lib/branch/fiscal"
import { buildBranchSummaryPayload } from "@/lib/branch/summary-payload"

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

// dsh_breakdown opt-in — R4 실측상 summary 페이로드(53,305B)의 사실상 전부가 이 필드다.
// 소비처는 장부 DSH 수치 그리드(SalesLedgerWorkbench의 DshNumericGrid) 한 곳뿐이라
// 그 요청만 ?breakdown=1을 붙인다. KR Team 개요(BranchDashboardClient) 등 나머지
// summary 소비처는 플래그를 안 보내 이 필드를 아예 받지 않는다 — revenue/deal_mix/
// data_sources/lastSync 등 다른 필드는 플래그와 무관하게 항상 그대로 나간다.
function readBreakdownFlag(url: URL): boolean {
  return url.searchParams.get("breakdown") === "1"
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const includeBreakdown = readBreakdownFlag(url)
  const overviewView = url.searchParams.get("view") === "overview"
  const currentDate = new Date()
  const periodDate = resolvePeriodDate(period, url.searchParams.get("month"), currentDate)
  if (!periodDate) return NextResponse.json({ error: "Invalid month query" }, { status: 400 })
  try {
    return adminCachedJson(
      await buildBranchSummaryPayload({ team, period, periodDate, includeBreakdown, overviewView, now: currentDate })
    )
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
