import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getLeadActionStats } from "@/lib/repositories/leads"

// '미응답 리드' 정의의 캐논 원천(W2-8): getLeadActionStats —
// status=new AND source∈RESPONSE_TARGET_SOURCES(데모·문의·Meta), 확인 게이트 미적용(응대 SLA 관점).
// Overview 골든타임 타일·주의신호 카드와 /admin/crm 액션 밴드가 전부 이 수치를 소비한다.
// 화면 쪽 파생/폴백은 lib/admin/overview/insights.resolveUnrespondedSignal 한 곳으로 제한할 것.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    return adminCachedJson({ leads: await getLeadActionStats() })
  } catch (error) {
    console.error("[GET /api/admin/crm/action-kpis]", error)
    return NextResponse.json({ error: "Failed to fetch CRM action KPIs" }, { status: 500 })
  }
}
