import { Suspense } from "react"
import AdminRouteLoading from "@/components/admin/AdminRouteLoading"
import HardwareInventoryClient, {
  type HardwareDashboardPrefetch,
  type HardwareDashboardResponse,
} from "@/components/admin/hardware/HardwareInventoryClient"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane } from "@/lib/admin/prefetch-budget"
import {
  BRANCH_READ_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  hasAdminApiRole,
  hasAdminCapability,
} from "@/lib/admin-auth"
import { getHardwareDashboard } from "@/lib/repositories/hardware-inventory"

export const dynamic = "force-dynamic"

/**
 * 첫 화면 서버 프리페치 — GET /api/admin/hardware(app/api/admin/hardware/route.ts)를 미러링한다.
 * 검증(BRANCH_READ_ADMIN_API_ROLES)·조립(getHardwareDashboard + 요청자별 viewer)이 라우트와
 * 동일해야 클라이언트가 받는 응답 shape이 두 경로에서 갈라지지 않는다.
 * 컨텍스트가 없거나 역할이 허용 목록 밖이면 데이터를 만들지 않고 null을 돌려준다 — 그 경우
 * (아래 openPrefetchLane이 감싸는) promise가 null로 settle되고, 화면은 지금까지처럼 클라이언트
 * 페치로 떨어지며 그 요청은 API가 401/403으로 막는다.
 *
 * 횡단 인프라 개편(2026-09-10 스트리밍 전환): 검증(getVerifiedAdminContextForPage)까지 이 함수
 * 안으로 들어왔다 — 예전엔 page.tsx가 이 await를 직접 했지만, 이제 page.tsx는 아무것도 기다리지
 * 않는다(TTFB 0ms). 요청자 컨텍스트는 매 요청 이 run() 콜백 안에서 새로 평가되므로(캐시 밖)
 * hardware.finalize capability 게이트는 그대로 유지된다 — 스트리밍으로 옮겨도 순서는 바뀌지 않는다.
 */
async function prefetchHardwareDashboard(): Promise<HardwareDashboardResponse | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const dashboard = await getHardwareDashboard()
  // viewer는 캐시(unstable_cache) 밖에서 요청자 컨텍스트로 계산한다 — 라우트와 같은 규약.
  // name은 "내 담당" 필터(myIntent)가 movement.owner와 비교하는 정본 — 여기와 route.ts 양쪽에서
  // 반드시 같은 admin.name 그대로(trim만) 내려야 두 경로 응답이 갈라지지 않는다.
  return {
    ...dashboard,
    viewer: {
      canFinalize: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY),
      name: admin.name?.trim() || null,
    },
  }
}

export default function AdminHardwarePage() {
  // openPrefetchLane은 run()을 기다리지 않고 즉시 {promise, generatedAt}을 돌려준다 — 소스
  // (getHardwareDashboard 콜드 미스=원장 전체 스캔)가 아무리 느려도 TTFB에 1ms도 얹지 않는다.
  // 예전 settleWithinBudget은 1.2초 예산을 다 기다린 뒤에야 null을 반환했는데, 그 null을 받은
  // 클라이언트가 다시 같은 데이터를 요청해 "1.2초 낭비 + 클라이언트 왕복"의 이중비용이 났다
  // (tmp/admin-overhaul-2026-09-10/platform.md §2.0). 이제 그 1.2초 대기 자체가 없다.
  const initialData: HardwareDashboardPrefetch = openPrefetchLane(prefetchHardwareDashboard)

  // HardwareInventoryClient는 initialData.promise를 React use()로 풀고 컴포넌트 전체(3,600여
  // 줄, 탭·시트·폼을 포함한 단일 클라이언트 컴포넌트)가 그 값에 의존하므로, 소스별로 더 잘게
  // 쪼갤 내부 하위 소스가 없다 — 화면 전체를 하나의 Suspense 경계로 감싼다(§2.2 (a) 권고와
  // 동일). fallback은 이 라우트의 기존 loading.tsx와 같은 AdminRouteLoading을 재사용해 새
  // 로딩 UI를 만들지 않는다 — 220ms 안에 settle되면 사용자는 빈 화면조차 못 본다(그 컴포넌트
  // 자체의 "quiet" 단계).
  return (
    <Suspense fallback={<AdminRouteLoading />}>
      <HardwareInventoryClient initialData={initialData} />
    </Suspense>
  )
}
