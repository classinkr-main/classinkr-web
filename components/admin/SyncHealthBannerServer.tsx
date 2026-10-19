import "server-only"

import { SyncHealthBanner } from "@/components/admin/SyncHealthBanner"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import type { SyncHealthSourceKey } from "@/lib/admin/sync-health"
import { loadSyncHealthReport } from "@/lib/admin/sync-health-server"

// 페이지 셸에서 쓰는 서버 로더 — 실행 기록을 읽어 표시 전용 SyncHealthBanner에 넘긴다.
//
// 반드시 <Suspense fallback={null}>로 감싸 쓴다: 페이지 셸들은 첫 바이트를 아무것도 기다리지 않는
// 스트리밍 구조라(openPrefetchLane), 이 조회가 TTFB나 본문 스트리밍을 붙잡으면 안 된다.
// 검증된 어드민이 아니면 아무것도 그리지 않는다(데이터 차단은 원래 각 API가 한다 — 여기는 표시만).
// 조회 실패는 loadSyncHealthReport가 원천별 "확인 불가"로 바꿔 준다 — 이 컴포넌트는 던지지 않는다.

export default async function SyncHealthBannerServer({
  sources,
  variant = "banner",
  className,
  hideOpsLink,
}: {
  sources: readonly SyncHealthSourceKey[]
  variant?: "banner" | "summary"
  className?: string
  hideOpsLink?: boolean
}) {
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch {
    admin = null
  }
  if (!admin) return null

  const report = await loadSyncHealthReport(sources)
  return (
    <SyncHealthBanner
      sources={report.sources}
      nowMs={Date.parse(report.generatedAt)}
      variant={variant}
      className={className}
      hideOpsLink={hideOpsLink}
    />
  )
}
