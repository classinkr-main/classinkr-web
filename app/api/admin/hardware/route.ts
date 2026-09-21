import { NextRequest, NextResponse } from "next/server"

import {
  BRANCH_READ_ADMIN_API_ROLES,
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  hasAdminApiRole,
  hasAdminCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getHardwareCustomerLinks, getHardwareDashboard, getHardwareMovementsPage } from "@/lib/repositories/hardware-inventory"

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

    // 감사(2026-09-07 #7) — 내역 탭이 기본 대시보드의 2000건 캡 너머를 "더 불러오기"로 요청할 때만
    // 탄다. 두 파라미터 중 하나라도 있으면 페이지 전용 응답(무거운 stock/alerts 재계산 없음)을
    // 돌려준다 — 기본 GET(파라미터 없음)은 지금까지와 완전히 동일하다(홈 요약·검색 등 기존
    // 소비처가 전체 배열 집계에 의존해 기본 페이로드 자체는 줄이지 않았다, 저장소 쪽 주석 참고).
    const movementsOffsetParam = req.nextUrl.searchParams.get("movementsOffset")
    const movementsLimitParam = req.nextUrl.searchParams.get("movementsLimit")
    if (movementsOffsetParam != null || movementsLimitParam != null) {
      const offset = Number(movementsOffsetParam)
      const limit = Number(movementsLimitParam)
      const page = await getHardwareMovementsPage(
        Number.isFinite(offset) ? offset : 0,
        Number.isFinite(limit) ? limit : 200
      )
      return adminCachedJson(page)
    }

    const dashboard = await getHardwareDashboard()
    // viewer = 요청자별 필드 — 캐시되는 대시보드(unstable_cache) 밖에서 매 요청 계산한다.
    // 응답 Cache-Control이 private라 브라우저 캐시에서도 사용자 간 섞이지 않는다.
    // 클라이언트는 이 값으로 확정·취소 버튼을 비활성 표시만 하고, 강제는 항상 서버 게이트가 한다.
    // name은 "내 담당" 필터의 정본 — page.tsx의 prefetchHardwareDashboard와 동일한 계산(admin.name
    // trim, 없으면 null)이어야 두 경로 응답 shape이 갈라지지 않는다.
    return adminCachedJson({
      ...dashboard,
      viewer: {
        canFinalize: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY),
        // 읽기 역할(VIEWER)은 기록을 만들 수 없다 — 화면이 쓰기 버튼을 미리 내려 403 을 보여주지 않게 한다.
        canWrite: hasAdminApiRole(admin.role, HARDWARE_EDITOR_ADMIN_API_ROLES),
        name: admin.name?.trim() || null,
      },
    })
  } catch (error) {
    return NextResponse.json({
      error: getErrorMessage(error),
    }, { status: 500 })
  }
}
