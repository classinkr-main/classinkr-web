import { NextRequest, NextResponse } from "next/server"
import { runInsights } from "@/lib/branch/insights/runner"
import type { TeamScope } from "@/lib/branch/insights/input-builder"
import { getRecentSyncRuns } from "@/lib/repositories/branch-sync"

const TEAMS: TeamScope[] = ["ALL", "BD", "MKT", "CSM"]

const ONE_DAY_MS = 24 * 60 * 60 * 1000
// 최근 실행 목록에서 그날의 branch sync 성공 여부를 확인하기에 넉넉한 창.
const RECENT_RUNS_LOOKBACK = 20

export async function GET(req: NextRequest) {
  // Vercel 환경에서는 x-vercel-cron 헤더 필수
  if (process.env.VERCEL && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Vercel Hobby는 크론을 시(hour) 단위로만 스케줄링하고, 같은 시 안의 실행 순서·간격은
  // 보장하지 않는다(T11). sync-branch(08:00)와 이 크론(09:30)을 다른 시로 분리해 뒀지만,
  // 그것만으로는 sync-branch가 그날 실제로 "끝났다"는 보장이 안 된다(동기화가 오래 걸리거나
  // 그날 실패한 경우) — 그래서 인사이트를 돌리기 전에 최근 24시간 안에 성공한 branch sync가
  // 있는지 직접 확인하는 자기 방어를 둔다. 크론 순서에 기대지 않는다.
  const recentRuns = await getRecentSyncRuns(RECENT_RUNS_LOOKBACK)
  const cutoff = Date.now() - ONE_DAY_MS
  const hasRecentSuccessfulSync = recentRuns.some(
    (run) =>
      run.source === "all" &&
      run.status === "success" &&
      run.finished_at !== null &&
      new Date(run.finished_at).getTime() >= cutoff
  )
  if (!hasRecentSuccessfulSync) {
    console.warn(
      "[cron/sync-branch-insights] skipped — no successful branch sync (source=all) within the last 24h"
    )
    return NextResponse.json({ ok: false, skipped: true, reason: "branch sync not completed today" })
  }

  const results: Record<string, unknown> = {}
  for (const t of TEAMS) {
    const r = await runInsights(t, true)
    results[t] = { from: r.from, error: r.error }
  }
  return NextResponse.json(results)
}
