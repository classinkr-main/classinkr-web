import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { listInsightHistory } from "@/lib/repositories/branch-insights"
import type { TeamScope } from "@/lib/branch/insights/input-builder"

const TEAM_SCOPES = new Set<TeamScope>(["ALL", "BD", "MKT", "CSM"])

function readTeamParam(url: URL): TeamScope | NextResponse {
  const team = url.searchParams.get("team") ?? "ALL"
  if (TEAM_SCOPES.has(team as TeamScope)) return team as TeamScope
  return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const limitRaw = Number(url.searchParams.get("limit") ?? "10")
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? Math.floor(limitRaw) : 10
  try {
    const items = await listInsightHistory(team, limit)
    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        generated_at: i.generated_at,
        one_liner: i.one_liner,
        next_actions: i.next_actions,
        fiscal_period: i.fiscal_period,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
