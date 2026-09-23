import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  ADMIN_CRM_COVERAGE_CACHE_TAG,
  ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG,
  ADMIN_OS_SUMMARY_CACHE_TAG,
} from "@/lib/admin/crm/cache-tags"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { ADMIN_CRM_REVENUE_SHEET_CACHE_TAG } from "@/lib/admin-crm-revenue-sheet"
import { CrmSourceLinkConflictError, confirmHwOutboundAccountLink } from "@/lib/repositories/crm-source-links"

// 360 매출 탭 M4 "연결 대기 출고" — 미매칭 HW 출고를 화면에서 바로 이 고객(NEO 계정)에
// 확정 연결한다. source-links/manual 라우트와 같은 무효화 태그 목록을 건다(REV·REV 시트·
// coverage·os-summary·통합 스냅샷). 360 GET 라우트 자체는 서버 캐시 태그 없이
// adminCachedJson(브라우저 캐시)만 쓰므로 별도 360 전용 태그는 없다.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as {
    outboundId?: unknown
    accountId?: unknown
  } | null

  const outboundId =
    typeof body?.outboundId === "string"
      ? body.outboundId.trim()
      : typeof body?.outboundId === "number" && Number.isFinite(body.outboundId)
        ? String(body.outboundId)
        : ""
  const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : ""

  if (!outboundId || !accountId) {
    return NextResponse.json({ error: "outboundId와 accountId가 필요합니다." }, { status: 400 })
  }

  try {
    const link = await confirmHwOutboundAccountLink({
      outboundId,
      accountId,
      actorUserId: admin.userId ?? null,
    })

    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
    // REV 링크와 다른 원천이지만, source-links/manual과 같은 이유로 같이 건다(원천 판별
    // 전 분기를 늘리지 않고 무효화 목록을 한 벌로 유지).
    revalidateTag(ADMIN_CRM_REVENUE_SHEET_CACHE_TAG, "max")
    revalidateTag(ADMIN_CRM_COVERAGE_CACHE_TAG, "max")
    revalidateTag(ADMIN_OS_SUMMARY_CACHE_TAG, "max")
    // 확정 링크는 crm-unified-customers.ts 소스 스냅샷의 입력이기도 하다.
    revalidateTag(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, "max")

    return NextResponse.json({ ok: true, link })
  } catch (error) {
    console.error("[POST /api/admin/crm/source-links/hw-outbound]", error)
    if (error instanceof CrmSourceLinkConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : "Failed to confirm HW outbound source link"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
