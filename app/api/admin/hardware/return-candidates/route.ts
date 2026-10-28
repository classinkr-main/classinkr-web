import { NextRequest, NextResponse } from "next/server"

import { isUuid, toErrorResponse } from "@/app/api/admin/hardware/_validation"
import { BRANCH_READ_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { listHardwareReturnCandidates } from "@/lib/repositories/hardware-inventory"

/**
 * 회수 등록의 원 출고 고르기(갭 문서 §7-3) — 고객사로 실제 출고된 건 중 회수할 수량이 남은 것.
 * q 는 품목·고객사·담당·물류번호·메모 부분 일치(공백 무시), customerId 는 CRM 고객.
 */
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const params = req.nextUrl.searchParams
  const customerId = params.get("customerId")?.trim() || null
  if (customerId && !isUuid(customerId)) {
    return NextResponse.json({ error: "customerId 형식이 올바르지 않습니다." }, { status: 400 })
  }
  const limitParam = Number(params.get("limit"))

  try {
    const candidates = await listHardwareReturnCandidates({
      q: params.get("q"),
      customerId,
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
    })
    return NextResponse.json({ candidates }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return toErrorResponse(error, "Failed to read hardware return candidates")
  }
}
