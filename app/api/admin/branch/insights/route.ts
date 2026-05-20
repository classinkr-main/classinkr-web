import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { runInsights } from "@/lib/branch/insights/runner"
import type { TeamScope } from "@/lib/branch/insights/input-builder"

const TEAM_SCOPES = new Set<TeamScope>(["ALL", "BD", "MKT", "CSM"])

function readTeamParam(url: URL): TeamScope | NextResponse {
  const team = url.searchParams.get("team") ?? "ALL"
  if (TEAM_SCOPES.has(team as TeamScope)) return team as TeamScope
  return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const force = url.searchParams.get("force") === "1"
  const err = await verifyAdmin(req, force ? undefined : BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const result = await runInsights(team, force)
  if (result.from === "error") return NextResponse.json({ error: result.error ?? "unknown" }, { status: 500 })
  return NextResponse.json(result)
}
