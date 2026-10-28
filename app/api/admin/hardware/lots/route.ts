import { NextRequest, NextResponse } from "next/server"

import { isUuid, toErrorResponse } from "@/app/api/admin/hardware/_validation"
import { BRANCH_READ_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getHardwareLotChoices } from "@/lib/repositories/hardware-inventory"

/**
 * 물류번호 고르기(갭 문서 §7-3) — 출고·확정·입고 화면이 품목의 잔여 물류번호와 다음 신규 번호를 읽는다.
 * 잔여는 배송 예정까지 뺀 값(§6 D6). excludeMovementId 는 확정·수정 중인 예정 행 자신.
 * 쓰기 화면용이지만 읽기라 조회 역할에도 연다(저장 권한은 쓰기 API 가 본다).
 */
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const params = req.nextUrl.searchParams
  const itemId = params.get("itemId")?.trim() || null
  const product = params.get("product")?.trim() || null
  const excludeMovementId = params.get("excludeMovementId")?.trim() || null
  if (!itemId && !product) {
    return NextResponse.json({ error: "itemId 또는 product 가 필요합니다." }, { status: 400 })
  }
  if ((itemId && !isUuid(itemId)) || (excludeMovementId && !isUuid(excludeMovementId))) {
    return NextResponse.json({ error: "id 형식이 올바르지 않습니다." }, { status: 400 })
  }

  try {
    const choices = await getHardwareLotChoices({ itemId, product, excludeMovementId })
    // 잔여는 저장 직후 바로 바뀐다 — 캐시하지 않는다.
    return NextResponse.json(choices, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return toErrorResponse(error, "Failed to read hardware lots")
  }
}
