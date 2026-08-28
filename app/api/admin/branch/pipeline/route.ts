import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { readBranchPipelineRows } from "@/lib/branch/pipeline-rows"
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
    // 조립은 lib/branch/pipeline-rows의 공용 함수 하나만 쓴다 — 페이지 서버 프리페치
    // (app/admin/branch/ledger/page.tsx)와 같은 원천이라 두 경로의 rows가 갈라지지 않는다.
    const rows = await readBranchPipelineRows({
      team,
      period,
      periodDate,
      manager: url.searchParams.get("manager") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
    })
    return adminCachedJson({ rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
