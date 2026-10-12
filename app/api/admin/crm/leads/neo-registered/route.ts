import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { listConfirmedLeadNeoAccountLinks } from "@/lib/repositories/crm-source-links"

// 리드 보드의 기록 위치 판정(A안 "기록은 Compass에서", lib/crm/write-surface resolveLeadBoardWriteSurface) 입력 —
// NEO 계정 등록이 확정된 리드 id 목록. 읽기 전용(쓰기 0).
//
// 고객 360 의 crmRegistered(findConfirmedLeadNeoLink: source_object='leads', target_type='external_account',
// status='confirmed')와 같은 링크 집합을 한 번의 페이지네이션 스캔으로 읽는다. 그래서 360 에서 'NEO 등록 연결'만
// 한(리드 상태는 그대로인) 리드도 리드 목록·리드 드로어가 360 과 같이 "Home 정본"으로 판정한다.
// external_lead(밀어넣기 도구의 CRM 리드 링크)는 360 판정에 없으므로 여기서도 넣지 않는다 — 넣으면 반대 방향으로 갈린다.
//
// 조회 실패는 500 — 빈 목록을 정상 응답(브라우저 캐시)으로 내려 "등록 없음"으로 위장하지 않는다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const links = await listConfirmedLeadNeoAccountLinks()
    return adminCachedJson({
      generatedAt: new Date().toISOString(),
      leadIds: [...links.keys()].sort(),
    })
  } catch (error) {
    console.error("[GET /api/admin/crm/leads/neo-registered]", error)
    return NextResponse.json({ error: "NEO 등록 리드를 불러오지 못했습니다." }, { status: 500 })
  }
}
