import { NextRequest, NextResponse } from "next/server"
import { notifyBranchSyncFailureStreaks } from "@/lib/branch/sync/failure-alert"
import { checkCronAuth } from "@/lib/server/cron-auth"
import { runAll } from "@/lib/branch/sync/run-all"
import { runBranchRevLinkMaintenance } from "@/lib/repositories/crm-source-links"
import { branchSyncBundles } from "@/lib/branch/sync/cache-bundles"
import { expireSyncCacheTags } from "@/lib/server/sync-cache-tags"

export async function GET(req: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다. 예전에 그 앞에 x-vercel-cron 헤더를
  // 필수로 요구하는 게이트가 있었는데, Vercel 이 크론 요청에 실제로 붙이는 건
  // Authorization: Bearer $CRON_SECRET 이지 그 헤더가 아니다 — 그래서 크론 11종이
  // 본문 실행 전에 전부 401 로 잘렸다. 이 라우트만으로도 인과가 두 번 확인된다:
  // 게이트 추가(2026-06-24) 직후 정지 → 게이트 없는 배포(07-02) 에서 매일 부활 →
  // 재추가(07-07) 직후 다시 정지. 되살리지 말 것. (2026-08-28)
  // 비교는 lib/server/cron-auth 의 timing-safe 헬퍼로 한다.
  const authResult = checkCronAuth(req)
  if (authResult !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runAll({ trigger: "cron" })
  // 수동 동기화 라우트와 같은 만료 규칙(lib/server/sync-cache-tags.ts) — 크론 직후 첫 조회도 새 값을 받는다.
  // 예전엔 크론 경로가 캐시를 전혀 만료하지 않아 최대 60초(TTL)까지 옛 수치가 보였다.
  expireSyncCacheTags(...branchSyncBundles(result, ["rev", "hw"]))
  const crmLinks = result.ok ? await runBranchRevLinkMaintenance() : undefined
  if (crmLinks) expireSyncCacheTags("crmRevenueLinks")
  // 연속 실패 알림은 하루 1회 도는 이 크론에서만 판정한다(수동 재시도마다 판정하면 같은 날 중복 발송).
  // 알림 경로의 오류가 동기화 응답을 500으로 바꾸지 않게 가둔다.
  let failureAlerts: Awaited<ReturnType<typeof notifyBranchSyncFailureStreaks>> | undefined
  if (!result.ok && !result.skipped) {
    try {
      failureAlerts = await notifyBranchSyncFailureStreaks()
    } catch (error) {
      console.error("[cron/sync-branch] failure streak check failed", error)
    }
  }
  return NextResponse.json({ ...result, crmLinks, ...(failureAlerts ? { failureAlerts } : {}) })
}
