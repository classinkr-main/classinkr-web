import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { ADMIN_CRM_COVERAGE_CACHE_TAG, ADMIN_OS_SUMMARY_CACHE_TAG } from "@/lib/admin/crm/cache-tags"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import {
  createManualBranchRevLinkCandidate,
  type CrmManualLinkTargetType,
} from "@/lib/repositories/crm-source-links"

function isManualTargetType(value: unknown): value is CrmManualLinkTargetType {
  return value === "partner_account" || value === "customer" || value === "deal"
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as {
    sourceRecordKey?: unknown
    targetType?: unknown
    targetId?: unknown
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
    const link = await createManualBranchRevLinkCandidate({
      sourceRecordKey: body.sourceRecordKey.trim(),
      targetType: body.targetType,
      targetId: body.targetId.trim(),
    })

    revalidateTag(ADMIN_CRM_REVENUE_CACHE_TAG, "max")

    revalidateTag(ADMIN_CRM_COVERAGE_CACHE_TAG, "max")

    revalidateTag(ADMIN_OS_SUMMARY_CACHE_TAG, "max")
    return NextResponse.json({ ok: true, link })
  } catch (error) {
    console.error("[POST /api/admin/crm/source-links/manual]", error)
    const message = error instanceof Error ? error.message : "Failed to create manual CRM source link"
    const status = message.includes("not found") ? 404 : message.includes("confirmed") ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
