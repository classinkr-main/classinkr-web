import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  confirmCrmNaverMapLink,
  type CrmNaverMapLinkTargetType,
} from "@/lib/repositories/crm-naver-map"

function isTargetType(value: unknown): value is CrmNaverMapLinkTargetType {
  return (
    value === "external_account" ||
    value === "customer" ||
    value === "partner_account" ||
    value === "lead"
  )
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (
    !body ||
    typeof body.externalId !== "string" ||
    !body.externalId.trim() ||
    !isTargetType(body.targetType) ||
    typeof body.targetId !== "string" ||
    !body.targetId.trim()
  ) {
    return NextResponse.json({ error: "지도 장소와 CRM 연결 대상을 확인하세요." }, { status: 400 })
  }

  try {
    const link = await confirmCrmNaverMapLink({
      externalId: body.externalId,
      targetType: body.targetType,
      targetId: body.targetId,
      actorUserId: admin.userId,
      actorLabel: admin.name ?? admin.role,
    })
    return NextResponse.json({ ok: true, link })
  } catch (error) {
    console.error("[POST /api/admin/crm/map-source/link]", error)
    const message = error instanceof Error ? error.message : "지도 장소를 연결하지 못했습니다."
    const status = /찾지 못|지정|약해/.test(message) ? 400 : /이미|이전 스냅샷/.test(message) ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
