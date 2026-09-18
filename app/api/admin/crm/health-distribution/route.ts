import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmUnifiedHealthDistribution } from "@/lib/repositories/crm-unified-customers"

// 활성 고객(neo_account) 건강도 분포(안전/주의/위험) — 코크핏 도넛 + 인사이트 담당별 스택바(T2)용.
// computeCustomerHealth(SSOT)로 매핑한 실집계 · 전역(검색/담당 필터 무관).
// getCrmUnifiedCustomers({limit:1}) 대신 소스 스냅샷 → 카운트 집계만 타는 경량 경로를
// 쓴다 — 도넛 숫자에 쓰이지 않는 필터/정렬/오너 집계까지 매번 태우지 않기 위함.
// 응답: { distribution: { total, safe, watch, risk, byOwner[] }, generatedAt } — 상위 4개 키는
// 도넛이 읽던 형태 그대로(하위 호환), byOwner는 같은 순회에서 모은 담당별 분포.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const distribution = await getCrmUnifiedHealthDistribution()
    return adminCachedJson({ distribution, generatedAt: new Date().toISOString() })
  } catch (error) {
    console.error("[GET /api/admin/crm/health-distribution]", error)
    return NextResponse.json({ error: "Failed to load CRM health distribution" }, { status: 500 })
  }
}
