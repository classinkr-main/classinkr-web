import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { buildNeoCrmCustomerListResponse, getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"

// 2026-09-07 감사 #8: 무페이징 전량 응답이 443.9KB였다 — 유일한 소비처
// (NeoCrmCustomersClient)가 실제로 렌더하는 필드만 남기고(buildNeoCrmCustomerListResponse
// 참고), scope=summary(행 없이 집계만)·limit/offset(옵트인 페이징)을 도입한다. 파라미터를
// 안 주면 기존과 동일하게 전량을 받는다 — 화면의 클라이언트 검색·정렬이 전량을 전제하므로
// 기본 동작은 바꾸지 않았다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const list = await getNeoCrmCustomers()
    const { searchParams } = new URL(req.url)
    const payload = buildNeoCrmCustomerListResponse(list, {
      scope: searchParams.get("scope") === "summary" ? "summary" : "full",
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
    })
    return adminCachedJson(payload)
  } catch (error) {
    console.error("[GET /api/admin/crm/customers-neo]", error)
    return NextResponse.json({ error: "Failed to load Neo CRM customers" }, { status: 500 })
  }
}
