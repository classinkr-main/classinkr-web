import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  convertLeadToCrm,
  LEAD_CONVERSION_FAILURE_STATUS,
} from "@/lib/crm/lead-conversion"

type RouteContext = {
  params: Promise<{ id: string }>
}

// 전환 절차 본체는 lib/crm/lead-conversion.ts에 있다 — 단체 전환(bulk-convert)과 같은 함수를 쓴다.
export async function POST(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await context.params

  try {
    const result = await convertLeadToCrm(id, { userId: admin.userId, role: admin.role })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: LEAD_CONVERSION_FAILURE_STATUS[result.code] }
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error(`[POST /api/admin/leads/${id}/convert-v2]`, error)
    return NextResponse.json({ error: "리드를 CRM으로 전환하지 못했습니다." }, { status: 500 })
  }
}
