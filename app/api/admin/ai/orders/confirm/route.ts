import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminAiMode } from "@/lib/admin-ai/preview"
import { GALMAE_CHAT_ROLES } from "@/lib/admin-ai/server/actor"
import { confirmOrder } from "@/lib/admin-ai/server/confirm"
import { readTicketSecret } from "@/lib/admin-ai/server/tickets"
import { logAdminAudit } from "@/lib/auth/audit"
import { classifyToolError, UNKNOWN_TOOL_ERROR_TEXT } from "@/lib/ops-tools/errors"
import { maskContactText } from "@/lib/ops-tools/redact"
import { getOpsToolByMcpName } from "@/lib/ops-tools/registry"
import { runOpsTool } from "@/lib/ops-tools/run"

// 갈매봇 오더 확인(실행) — 사람이 카드에서 누른 확인만 여기로 온다. 이 경로에는 모델이 없다(lib/admin-ai/server/confirm.ts).
// 세션 쿠키 + same-origin(requireVerifiedAdminContext) → 서명 표 검증·역할 재검사·미리보기 대조 → 실행기 → 감사.
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (adminAiMode() !== "live") return NextResponse.json({ error: "Not found" }, { status: 404 })

  const admin = await requireVerifiedAdminContext(req, GALMAE_CHAT_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as { ticket?: unknown } | null
  const result = await confirmOrder(body?.ticket, admin, {
    getTool: getOpsToolByMcpName,
    run: runOpsTool,
    secret: readTicketSecret(),
    describeError: async (error) => {
      const classified = await classifyToolError(error)
      return classified.kind === "user" ? maskContactText(classified.message) : UNKNOWN_TOOL_ERROR_TEXT
    },
    audit: async ({ admin: actor, action, targetId, payload }) => {
      await logAdminAudit({ admin: actor, action, targetType: "admin_ai_order", targetId, payload })
    },
  })
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } })
}
