import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { confirmLeadNeoLink } from "@/lib/repositories/crm-source-links"

// 360 드로어 'NEO 등록됨' 수동 액션 — 리드를 NEO(external CRM) 계정에 확정 링크한다.
// 결과 행은 listConfirmedLeadNeoLinkLeadIds → 통합 고객 목록의 crmRegistered 배지로 흐른다.
// 통합 고객 API는 서버 캐시 태그 없이 adminCachedJson(클라이언트 캐시)만 쓰므로
// 여기서 revalidateTag는 필요 없다.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as {
    leadId?: unknown
    neoAccountId?: unknown
    name?: unknown
  } | null

  if (
    typeof body?.leadId !== "string" ||
    !body.leadId.trim() ||
    typeof body?.neoAccountId !== "string" ||
    !body.neoAccountId.trim()
  ) {
    return NextResponse.json({ error: "leadId와 neoAccountId가 필요합니다." }, { status: 400 })
  }

  try {
    const result = await confirmLeadNeoLink({
      leadId: body.leadId.trim(),
      neoAccountId: body.neoAccountId.trim(),
      // 정규화(normalizeCrmName)는 repo가 담당한다 — 여기서는 원문만 넘긴다.
      normalizedName: typeof body.name === "string" ? body.name.trim() : null,
      actorUserId: admin.userId ?? null,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[POST /api/admin/crm/leads/neo-link]", error)
    const message = error instanceof Error ? error.message : ""
    // 소스당 확정 1건 제약(다른 타깃으로 이미 확정)은 충돌로 구분해 알린다.
    if (message.includes("이미 다른 타깃")) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ error: "NEO 등록 연결에 실패했습니다." }, { status: 500 })
  }
}
