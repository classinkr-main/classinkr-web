import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"
import { runInsights } from "@/lib/branch/insights/runner"
import type { TeamScope } from "@/lib/branch/insights/input-builder"

const TEAMS: TeamScope[] = ["ALL", "BD", "MKT", "CSM"]

export async function GET(req: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
  // x-vercel-cron 이 아니다. 근거는 app/api/cron/sync-branch/route.ts 주석 참조. (2026-08-28)
  // 비교는 lib/server/cron-auth 의 timing-safe 헬퍼로 한다.
  const authResult = checkCronAuth(req)
  if (authResult !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const results: Record<string, unknown> = {}
  for (const t of TEAMS) {
    const r = await runInsights(t, true)
    results[t] = { from: r.from, error: r.error }
  }
  return NextResponse.json(results)
}
