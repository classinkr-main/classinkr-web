import { NextRequest } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { listCrmNaverMapSource } from "@/lib/repositories/crm-naver-map"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (authError) return authError

  try {
    const source = await listCrmNaverMapSource()
    return adminCachedJson({
      status: "ready" as const,
      latestSyncedAt: source.latestSyncedAt,
      isStale: source.isStale,
      summary: source.summary,
      warnings: source.warnings,
    })
  } catch (error) {
    console.error("[GET /api/admin/branch/heatmap/map-source]", error)
    // 지도 원천은 보조 렌즈다. 실패를 500으로 승격해 REV 히트맵까지 오류처럼 보이게 하지 않는다.
    return adminCachedJson({
      status: "unavailable" as const,
      latestSyncedAt: null,
      isStale: true,
      summary: null,
      warnings: ["CRM 지도 원천을 불러오지 못했습니다. REV 매출 히트맵만 표시합니다."],
    })
  }
}
