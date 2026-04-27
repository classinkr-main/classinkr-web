import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { runInsights } from "@/lib/branch/insights/runner"
import type { TeamScope } from "@/lib/branch/insights/input-builder"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = (url.searchParams.get("team") ?? "ALL") as TeamScope
  const force = url.searchParams.get("force") === "1"
  const result = await runInsights(team, force)
  if (result.from === "error") return NextResponse.json({ error: result.error ?? "unknown" }, { status: 500 })
  return NextResponse.json(result)
}
