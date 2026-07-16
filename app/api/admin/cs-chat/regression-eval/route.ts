import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  createDefaultRegressionEvalDeps,
  runInternalCsRegressionEval,
} from "@/lib/internal-cs-chat/regression-eval"
import { isInternalCsChatNotReadyError } from "@/lib/repositories/internal-cs-chat"

// 회귀 자동 평가(계약 2) — "자동 평가 실행" 버튼이 소비한다.
// 응답의 suggestedOutcome 은 제안일 뿐이며 DB 의 regression_outcome 을 변경하지 않는다.
// 확정은 기존 판정 PATCH(messages/[messageId])의 몫이다.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const raw =
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}

  let messageIds: string[] | undefined
  if (raw.messageIds !== undefined) {
    if (!Array.isArray(raw.messageIds) || raw.messageIds.some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "messageIds must be a string array" }, { status: 400 })
    }
    messageIds = raw.messageIds as string[]
  }

  let limit: number | undefined
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== "number" || !Number.isFinite(raw.limit)) {
      return NextResponse.json({ error: "limit must be a number" }, { status: 400 })
    }
    limit = raw.limit
  }

  try {
    const result = await runInternalCsRegressionEval(
      { messageIds, limit },
      createDefaultRegressionEvalDeps()
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error("[POST /api/admin/cs-chat/regression-eval]", error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to run regression evaluation" }, { status: 500 })
  }
}
