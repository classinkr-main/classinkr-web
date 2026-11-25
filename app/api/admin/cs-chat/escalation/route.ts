import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { buildEscalationResult, parseEscalationInput } from "@/lib/internal-cs-chat/escalation-routing"

// 본사 담당 분류와 본사·인수인계 초안을 서버에서 만든다(2026-11 B2, R2).
// 담당 표(실명·위컴 멘션)는 server-only 모듈에만 있고, 화면은 이 응답(해당 도메인 한 줄과 초안)만 받는다.
// 읽기 전용 계산이라 DB 를 쓰지 않는다. 인증은 다른 cs-chat 라우트와 같은 가드.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const input = parseEscalationInput(body)
  if (!input) {
    return NextResponse.json({ error: "Invalid escalation input" }, { status: 400 })
  }

  try {
    return NextResponse.json(buildEscalationResult(input), {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    console.error("[POST /api/admin/cs-chat/escalation]", error)
    return NextResponse.json({ error: "Failed to build escalation drafts" }, { status: 500 })
  }
}
