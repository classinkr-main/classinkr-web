import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { dataOwnerFromRequest } from "@/lib/admin/data-owner"
import { getOverviewOperations } from "@/lib/admin/overview/operations"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const summary = await getOverviewOperations(hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES), new Date(), await dataOwnerFromRequest(new URL(req.url), admin))
  // 부분 실패를 정상 응답으로 영속 캐시하지 않는다. 각 원천은 자체 짧은 서버 캐시를 공유한다.
  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } })
}
