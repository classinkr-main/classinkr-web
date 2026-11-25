import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { dataOwnerFromRequest } from "@/lib/admin/data-owner"
import { adminCachedJson } from "@/lib/admin-api-response"
import { isCompassFreshRequest, runWithFreshCompassReads } from "@/lib/compass/bridge"
import { buildCompassPipelineBand } from "@/lib/compass/home-band"

// CRM 홈 "마케팅 파이프라인(Compass)" 밴드(M7) 전용 집계 — 조립 정본은 lib/compass/home-band.ts.
// 서버 프리페치(lib/admin/crm/home-prefetch)가 같은 함수를 부르므로 첫 화면과 새로고침이 어긋나지 않는다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const owner = await dataOwnerFromRequest(url, admin)
    // 새로고침(?force=1)은 브리지 60초 메모까지 건너뛴다 — 안 그러면 Compass 에서 바꾼 값이 1분 동안 안 보인다.
    return adminCachedJson(await runWithFreshCompassReads(isCompassFreshRequest(url), () => buildCompassPipelineBand(owner)))
  } catch (error) {
    console.error("[GET /api/admin/crm/compass-pipeline]", error)
    return NextResponse.json({ error: "Failed to fetch Compass pipeline band" }, { status: 500 })
  }
}
