import { NextRequest, NextResponse } from "next/server"

import {
  CS_COPILOT_API_ROLES,
  CS_REGRESSION_RUN_CAPABILITY,
  requireCsCopilotCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import {
  createDefaultRegressionEvalDeps,
  runInternalCsRegressionEval,
} from "@/lib/internal-cs-chat/regression-eval"
import { isInternalCsChatNotReadyError } from "@/lib/repositories/internal-cs-chat"
import { checkRateLimitDistributed } from "@/lib/server/rate-limit"

// 후보 최대 10건 × (재생성 + 심판) 순차 LLM 호출 — 기본 함수 타임아웃을 넘을 수 있어 1분으로 연장.
export const maxDuration = 60

// 회귀 자동 평가(계약 2) — "자동 평가 실행" 버튼이 소비한다.
// 응답의 suggestedOutcome 은 제안일 뿐이며 DB 의 regression_outcome 을 변경하지 않는다.
// 확정은 기존 판정 PATCH(messages/[messageId])의 몫이다.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CS_COPILOT_API_ROLES)
  if (admin instanceof NextResponse) return admin
  // 재생성·심판 모델을 여러 번 부르는 비싼 실행 — capability 가 필요하다(기본 부여 역할은 lib/admin-auth.ts).
  const capabilityError = requireCsCopilotCapability(admin, CS_REGRESSION_RUN_CAPABILITY)
  if (capabilityError) return capabilityError

  // 한 번에 최대 10건 × (재생성 + 심판)을 부르는 비싼 요청이라 사용자별 분당 3회로 제한한다(IC-16).
  const { allowed } = await checkRateLimitDistributed(
    admin.userId || admin.name?.trim() || admin.role,
    "admin-internal-cs-regression-eval",
    { windowMs: 60_000, max: 3 }
  )
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

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
