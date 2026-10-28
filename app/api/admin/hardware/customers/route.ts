import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/app/api/admin/hardware/_validation"
import { BRANCH_READ_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { searchHardwareCustomers } from "@/lib/repositories/hardware-inventory"

/**
 * 출고 클라이언트 고르기(갭 문서 §7-3) — CRM 고객(customers) 이름·캠퍼스 검색, 최대 20건.
 * 검색어가 없으면 최근 고객. 연락처는 내려주지 않는다.
 */
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const q = req.nextUrl.searchParams.get("q")
  if (q && q.length > 100) {
    return NextResponse.json({ error: "검색어가 너무 깁니다." }, { status: 400 })
  }

  try {
    const customers = await searchHardwareCustomers(q, 20)
    return NextResponse.json({ customers }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return toErrorResponse(error, "Failed to search customers")
  }
}
