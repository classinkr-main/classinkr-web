import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  listCrmRegionAssignments,
  setCrmRegionAssignment,
} from "@/lib/repositories/crm-region-assignments"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    return NextResponse.json(await listCrmRegionAssignments())
  } catch (error) {
    console.error("[GET /api/admin/crm/region-assignments]", error)
    return NextResponse.json({ error: "지역 분배를 불러오지 못했습니다." }, { status: 500 })
  }
}

// 배정 교체는 팀 라우팅을 바꾸는 쓰기다 — GET보다 좁은 기본 역할 검증을 쓴다.
export async function PUT(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || Array.isArray(body)) {
    return NextResponse.json({ error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 })
  }

  const regionLabel = typeof body.regionLabel === "string" ? body.regionLabel : ""
  if (!regionLabel.trim()) {
    return NextResponse.json({ error: "시도(regionLabel)가 필요합니다." }, { status: 400 })
  }
  // null = 배정 해제. 빈 문자열도 같은 뜻으로 받는다(select의 '미배정' 옵션).
  const ownerKey = typeof body.ownerKey === "string" && body.ownerKey.trim() ? body.ownerKey : null

  try {
    const result = await setCrmRegionAssignment({
      regionLabel,
      ownerKey,
      ownerName: typeof body.ownerName === "string" ? body.ownerName : null,
      note: typeof body.note === "string" ? body.note : null,
      actor: admin.name?.trim() || admin.userId || admin.role,
    })

    if (!result.ok) {
      const status = result.reason === "unavailable" ? 503 : 400
      const message =
        result.reason === "unavailable"
          ? "지역 분배 표가 아직 적용되지 않았습니다."
          : "17개 시도 중 하나여야 합니다."
      return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({ ok: true, changed: result.changed })
  } catch (error) {
    console.error("[PUT /api/admin/crm/region-assignments]", error)
    return NextResponse.json({ error: "지역 분배를 저장하지 못했습니다." }, { status: 500 })
  }
}
