import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  ADMIN_CRM_COVERAGE_CACHE_TAG,
  ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG,
  ADMIN_OS_SUMMARY_CACHE_TAG,
} from "@/lib/admin/crm/cache-tags"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import {
  type CrmSourceLinkAction,
  bulkUpdateCrmSourceLinkStatus,
} from "@/lib/repositories/crm-source-links"

function isCrmSourceLinkAction(value: unknown): value is CrmSourceLinkAction {
  return value === "confirm" || value === "reject" || value === "stale"
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as { ids?: unknown; action?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : []

  if (!isCrmSourceLinkAction(body?.action)) {
    return NextResponse.json({ error: "Invalid source link action" }, { status: 400 })
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "No source link ids provided" }, { status: 400 })
  }

  try {
    const result = await bulkUpdateCrmSourceLinkStatus(ids, body.action, admin.userId)
    // 소스 링크 상태가 바뀌면 coverage·os-summary·매출 집계 캐시가 낡는다 — 즉시 무효화한다.
    revalidateTag(ADMIN_CRM_COVERAGE_CACHE_TAG, "max")
    revalidateTag(ADMIN_OS_SUMMARY_CACHE_TAG, "max")
    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
    // 확정/해제된 링크는 crm-unified-customers.ts 소스 스냅샷(listConfirmedLeadCustomerLinks·
    // listConfirmedLeadNeoLinkLeadIds)의 입력이기도 하다.
    revalidateTag(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, "max")
    return NextResponse.json({ ok: result.failed.length === 0, ...result })
  } catch (error) {
    console.error("[PATCH /api/admin/crm/source-links/bulk]", error)
    return NextResponse.json({ error: "Failed to bulk update CRM source links" }, { status: 500 })
  }
}
