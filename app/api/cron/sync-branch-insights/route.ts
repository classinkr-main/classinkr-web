import { NextRequest, NextResponse } from "next/server"
import { runInsights } from "@/lib/branch/insights/runner"
import type { TeamScope } from "@/lib/branch/insights/input-builder"

const TEAMS: TeamScope[] = ["ALL", "BD", "MKT", "CSM"]

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const results: Record<string, unknown> = {}
  for (const t of TEAMS) {
    const r = await runInsights(t, true)
    results[t] = { from: r.from, error: r.error }
  }
  return NextResponse.json(results)
}
