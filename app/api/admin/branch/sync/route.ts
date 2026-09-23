import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { resolveSyncOutcome } from "@/lib/admin/sync-outcome"
import { runAll } from "@/lib/branch/sync/run-all"
import { runBranchRevLinkMaintenance } from "@/lib/repositories/crm-source-links"
import { branchSyncBundles } from "@/lib/branch/sync/cache-bundles"
import { expireSyncCacheTags } from "@/lib/server/sync-cache-tags"

// 시트 두 개(대시보드·HW)를 읽고 미러를 교체한 뒤 장부 임포트를 재캡처한다 — 정상적으로 수십 초~수 분.
// 클라이언트는 이 경로의 타임아웃을 끈다(lib/admin-client.ts LONG_RUNNING_ADMIN_PATHS).
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const body = await req.json().catch(() => null) as { sources?: unknown } | null
  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s): s is "rev" | "hw" => s === "rev" || s === "hw")
    : []
  const effectiveSources: Array<"rev" | "hw"> = sources.length ? sources : ["rev", "hw"]
  const result = await runAll({ trigger: "manual", sources: sources.length ? sources : undefined })
  // 결과 계약(설계 §7.2) — 기존 필드·HTTP 상태 코드는 그대로 두고 outcome을 더한다.
  const outcome = resolveSyncOutcome(result)

  // 잠금에 걸려 건너뛰었으면 아무것도 안 바뀌었다 — 캐시를 건드리지 않고 "이미 실행 중"과 그 실행의
  // 시작 시각만 알린다(라운드 5 S-1: 예전엔 이 200 응답을 화면들이 "완료"로 보여 줬다).
  if (result.skipped) {
    return NextResponse.json({ ...result, outcome, startedAt: result.runningSince }, { status: 200 })
  }

  // 데이터를 쓴 소스의 묶음만 { expire: 0 }으로 즉시 만료한다 — 다음 조회가 옛 값이 아니라 새 값을 받는다
  // (설계 §7.1, 라운드 5 S-2. 예전 "max"는 stale-while-revalidate라 직후 조회가 옛 수치였다).
  expireSyncCacheTags(...branchSyncBundles(result, effectiveSources))

  if (result.ok) {
    const crmLinks = effectiveSources.includes("rev") ? await runBranchRevLinkMaintenance() : undefined
    // 링크 유지보수(재부착·후보 생성)는 crm_source_links를 위 만료 이후에 다시 바꾼다 — 매칭 표시 묶음을 한 번 더 만료.
    if (crmLinks) expireSyncCacheTags("crmRevenueLinks")
    return NextResponse.json({ ...result, crmLinks, outcome }, { status: 200 })
  }
  return NextResponse.json({ ...result, outcome }, { status: 500 })
}
