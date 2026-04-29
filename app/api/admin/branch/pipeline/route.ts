import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { listRevRevenue } from "@/lib/branch/computations/pipeline"

type BranchTeam = "ALL" | "BD" | "MKT" | "CSM"

const BRANCH_TEAMS = new Set<BranchTeam>(["ALL", "BD", "MKT", "CSM"])

function readTeamParam(url: URL): BranchTeam | undefined | NextResponse {
  const team = url.searchParams.get("team")
  if (!team) return undefined
  if (BRANCH_TEAMS.has(team as BranchTeam)) return team as BranchTeam
  return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  try {
    const deals = await listBranchRevDeals({ team })
    const rows = listRevRevenue(deals, {
      team,
      manager: url.searchParams.get("manager") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
    })
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
