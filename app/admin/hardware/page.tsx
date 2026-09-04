import HardwareInventoryClient, {
  type HardwareDashboardPrefetch,
  type HardwareDashboardResponse,
} from "@/components/admin/hardware/HardwareInventoryClient"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { settleWithinBudget } from "@/lib/admin/prefetch-budget"
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
 * 컨텍스트가 없거나 역할이 허용 목록 밖이면 데이터를 만들지 않고 null을 돌려준다 —
 * 그 경우 화면은 지금까지처럼 클라이언트 페치로 떨어지고, 그 요청은 API가 401/403으로 막는다.
 */
async function prefetchHardwareDashboard(): Promise<HardwareDashboardPrefetch | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const dashboard = await getHardwareDashboard()
  // viewer는 캐시(unstable_cache) 밖에서 요청자 컨텍스트로 계산한다 — 라우트와 같은 규약.
  const data: HardwareDashboardResponse = {
    ...dashboard,
    viewer: { canFinalize: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY) },
  }
  // generatedAt(T3) — 이 프리페치가 지금 settle된 시각. staleTimes.dynamic(180초)로 클라이언트
  // 라우터 캐시가 이 RSC 응답을 재사용하면, HardwareInventoryClient가 받는 시점엔 이미 오래된
  // 값일 수 있다 — isPrefetchFresh(lib/admin/prefetch-freshness.ts)가 이 값으로 판정한다.
  return { data, generatedAt: Date.now() }
}

export default async function AdminHardwarePage() {
  // 프리페치는 공용 예산(1.2초) 안에서만 기다린다. 이 페이지는 force-dynamic이라 프리페치가
  // 끝나야 HTML이 흐르는데, getHardwareDashboard 콜드 미스(원장 전체 스캔)가 TTFB를 무제한
  // 붙잡으면 스켈레톤 대신 빈 탭을 오래 보게 된다. 초과·실패는 모두 null =
  // "프리페치 없음"으로 떨어져 지금까지처럼 클라이언트 페치 경로를 탄다.
  const initialData: HardwareDashboardPrefetch | null = await settleWithinBudget(prefetchHardwareDashboard)

  return <HardwareInventoryClient initialData={initialData} />
}
