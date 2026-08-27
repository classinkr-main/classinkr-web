import { NextRequest, NextResponse } from "next/server"

import {
  BRANCH_READ_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  hasAdminCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getHardwareCustomerLinks, getHardwareDashboard } from "@/lib/repositories/hardware-inventory"

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return "Failed to read hardware inventory"
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    if (req.nextUrl.searchParams.get("scope") === "customer-links") {
      return adminCachedJson({ customers: await getHardwareCustomerLinks() })
    }
    const dashboard = await getHardwareDashboard()
    // viewer = 요청자별 필드 — 캐시되는 대시보드(unstable_cache) 밖에서 매 요청 계산한다.
    // 응답 Cache-Control이 private라 브라우저 캐시에서도 사용자 간 섞이지 않는다.
    // 클라이언트는 이 값으로 확정·취소 버튼을 비활성 표시만 하고, 강제는 항상 서버 게이트가 한다.
    return adminCachedJson({
      ...dashboard,
      viewer: { canFinalize: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY) },
    })
  } catch (error) {
    return NextResponse.json({
      error: getErrorMessage(error),
    }, { status: 500 })
  }
}
