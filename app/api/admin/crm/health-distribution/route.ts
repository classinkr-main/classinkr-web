import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"

// 활성 고객(neo_account) 건강도 분포(안전/주의/위험) — 코크핏 도넛용.
// computeCustomerHealth(SSOT)로 매핑한 실집계 · 전역(검색/담당 필터 무관).
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const result = await getCrmUnifiedCustomers({ limit: 1 })
    return adminCachedJson({ distribution: result.healthDistribution })
  } catch (error) {
    console.error("[GET /api/admin/crm/health-distribution]", error)
    return NextResponse.json({ error: "Failed to load CRM health distribution" }, { status: 500 })
  }
}
