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
import {
  createManualCrmLinkCandidate,
  type CrmManualLinkSourceSystem,
  type CrmManualLinkTargetType,
} from "@/lib/repositories/crm-source-links"

function isManualTargetType(value: unknown): value is CrmManualLinkTargetType {
  return value === "partner_account" || value === "customer" || value === "deal"
}

// 수동 연결은 REV 시트뿐 아니라 리드·Neo CRM 원천도 받는다(R4). 클라이언트가 보낸 원천을 그대로
// 저장소에 넘겨 키 모양 추정 조회를 생략한다. 생략되면 저장소가 링크 행·키 모양으로 추정한다.
function parseManualSourceSystem(value: unknown): CrmManualLinkSourceSystem | undefined {
  return value === "branch_rev_sheet" || value === "lead" || value === "xiaoshouyi" ? value : undefined
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as {
    sourceRecordKey?: unknown
    targetType?: unknown
    targetId?: unknown
    sourceSystem?: unknown
    sourceObject?: unknown
  } | null

  if (
    typeof body?.sourceRecordKey !== "string" ||
    !body.sourceRecordKey.trim() ||
    !isManualTargetType(body.targetType) ||
    typeof body.targetId !== "string" ||
    !body.targetId.trim()
  ) {
    return NextResponse.json({ error: "Invalid manual CRM source link payload" }, { status: 400 })
  }

  try {
    const link = await createManualCrmLinkCandidate({
      sourceRecordKey: body.sourceRecordKey.trim(),
      targetType: body.targetType,
      targetId: body.targetId.trim(),
      sourceSystem: parseManualSourceSystem(body.sourceSystem),
      sourceObject: typeof body.sourceObject === "string" && body.sourceObject.trim() ? body.sourceObject.trim() : undefined,
    })

    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")
    // REV 링크(branch_rev_sheet)가 바뀌면 lib/admin-crm-revenue-sheet.ts의 60초 캐시도 낡는다(D1).
    // 리드·Neo 원천 수동 연결은 rev-sheet 입력이 아니지만 원천 판별 전 분기를 늘리지 않고 같이 건다.
    revalidateTag(ADMIN_CRM_REVENUE_SHEET_CACHE_TAG, "max")

    revalidateTag(ADMIN_CRM_COVERAGE_CACHE_TAG, "max")

    revalidateTag(ADMIN_OS_SUMMARY_CACHE_TAG, "max")

    // 새 후보 링크는 crm-unified-customers.ts 소스 스냅샷(listConfirmedLeadCustomerLinks·
    // listConfirmedLeadNeoLinkLeadIds)의 입력이기도 하다.
    revalidateTag(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, "max")
    return NextResponse.json({ ok: true, link })
  } catch (error) {
    console.error("[POST /api/admin/crm/source-links/manual]", error)
    const message = error instanceof Error ? error.message : "Failed to create manual CRM source link"
    const status = message.includes("not found") ? 404 : message.includes("confirmed") ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
