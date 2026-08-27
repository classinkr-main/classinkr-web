import HardwareInventoryClient, { type HardwareDashboardResponse } from "@/components/admin/hardware/HardwareInventoryClient"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
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
async function prefetchHardwareDashboard(): Promise<HardwareDashboardResponse | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const dashboard = await getHardwareDashboard()
  // viewer는 캐시(unstable_cache) 밖에서 요청자 컨텍스트로 계산한다 — 라우트와 같은 규약.
  return {
    ...dashboard,
    viewer: { canFinalize: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY) },
  }
}

export default async function AdminHardwarePage() {
  let initialData: HardwareDashboardResponse | null = null
  try {
    initialData = await prefetchHardwareDashboard()
  } catch {
    // 프리페치 실패는 화면을 죽이지 않는다 — 데이터 없이 렌더하고 클라이언트가 다시 받아온다.
    initialData = null
  }

  return <HardwareInventoryClient initialData={initialData} />
}
