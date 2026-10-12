import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { parseUnifiedQueryOptions } from "@/lib/crm/unified-query-options"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    // 새로고침(?force=1) — 홈 우선순위 큐 라우트와 같은 계약(파라미터 존재 여부로 판정).
    // 서버 소스 스냅샷 Data Cache(60초)를 우회해 방금 등록한 리드·동기화 결과를 즉시 반영하고,
    // 응답도 브라우저 프라이빗 캐시에 남기지 않는다(no-store).
    const force = url.searchParams.has("force")
    const customers = await getCrmUnifiedCustomers({
      // 검색·원천·상태·뷰·담당(__me)·라벨·미확인 포함·세그먼트 조건(SG4 + OR 그룹 `or` — 세그먼트 허브 미리보기)·
      // 정렬 — CSV 내보내기와 같은 파서(lib/crm/unified-query-options.ts). 모르는 값은 파서가 버린다.
      ...(await parseUnifiedQueryOptions(url.searchParams, admin)),
      limit: parseBoundedInt(url.searchParams.get("limit"), 100, 1, 200),
      offset: parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000),
      bypassCache: force,
    })
    const response = adminCachedJson(customers)
    if (force) response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/customers/unified]", error)
    // 클라이언트가 이 문자열을 배너에 그대로 띄운다 — 한국어 고정 문구.
    return NextResponse.json({ error: "통합 고객 목록을 불러오지 못했습니다." }, { status: 500 })
  }
}
