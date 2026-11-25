import "server-only"

// 쓰기 확인 경로 — 사람이 오더 카드에서 확인한 표(티켓)를 실행한다. 이 경로에는 모델이 없다:
// 이 파일과 확인 라우트의 import 는 llm/·orchestrator·deps 와 공개 챗봇 서비스·모델(lib/chatbot/service·llm,
// lib/internal-cs-chat/gemini)을 부르지 않는다. 도구는 공용 레지스트리가 아니라 쓰기 정의만 담은 작은 표(write-tools.ts)에서
// 찾는다(tests/admin-ai/server/writes-confirm.test.ts 의 모듈 그래프 시험).
//
// 순서: 서명·만료(15분)·행위자 일치(tickets.ts) → 역할 재검사(작성 뒤 역할이 바뀌면 거절) → 레지스트리 쓰기 도구 →
//       실행기 runOpsTool(범위·가린 값·분당 상한·idempotency) — idempotency_key 는 표 id 라 같은 표를 두 번 눌러도 실행은 한 번.
//       실행기 안에서 preview 를 서버에서 다시 계산하고, 그 요약이 표에 서명된 요약과 다르면(그사이 금액·대상이 바뀜) 거절한다.
// 감사: 도구 정의가 auditOps 로 남기고(mcp:galmae-…), 여기서 실제 어드민으로 logAdminAudit 를 한 줄 더 남긴다.
// 되돌리기는 이번 범위가 아니다(카드에 "되돌리기는 화면에서").
import type { VerifiedAdminContext } from "@/lib/admin-auth"
import { OpsToolError } from "@/lib/ops-tools/errors"
import type { OpsToolDef, ToolArgs, WriteToolDef } from "@/lib/ops-tools/types"

import { canUseWriteTool, staffActor, staffKey, type StaffIdentity } from "./actor"
import { summaryHash, TICKET_ERROR_TEXT, verifyTicket, type TicketError } from "./tickets"

export interface ConfirmDeps {
  getTool: (mcpName: string) => OpsToolDef | undefined
  run: (def: OpsToolDef, args: ToolArgs, actor: ReturnType<typeof staffActor>) => Promise<{ value: unknown; logCode?: string }>
  secret: string | null
  describeError: (error: unknown) => Promise<string>
  audit: (entry: { admin: Pick<VerifiedAdminContext, "userId" | "name" | "role">; action: string; targetId: string; payload: Record<string, unknown> }) => Promise<void>
  now?: () => number
}

export type ConfirmResult =
  | { status: 200; body: { ok: true; orderId: string; replayed: boolean; result: string } }
  | { status: 400 | 403 | 404 | 409 | 410 | 422 | 503; body: { ok: false; code: string; error: string } }

const TICKET_STATUS: Record<TicketError, 400 | 403 | 410 | 503> = {
  no_secret: 503,
  malformed: 400,
  bad_signature: 400,
  expired: 410,
  actor_mismatch: 403,
}

function resultText(tool: string, value: unknown): string {
  if (tool === "quote_create_draft" && value && typeof value === "object" && !Array.isArray(value)) {
    const number = (value as { quote_number?: unknown }).quote_number
    return typeof number === "string" ? `견적 초안 ${number}을 만들었습니다.` : "견적 초안을 만들었습니다."
  }
  if (tool === "hw_plan_movement" && Array.isArray(value)) return `배송 예정 ${value.length}건을 등록했습니다.`
  return "실행했습니다."
}

/** 미리본 요약과 확인 때 다시 계산한 요약이 다르면 실행 전에 거절하는 정의 — 원래 정의의 execute 는 그대로다. */
function guardPreview(def: WriteToolDef, expectedHash: string): WriteToolDef {
  return {
    ...def,
    preview: async (args, actor) => {
      const preview = await def.preview(args, actor)
      if (summaryHash(preview.summary) !== expectedHash) {
        throw new OpsToolError("미리본 뒤 내용(금액·대상)이 바뀌었습니다. 다시 요청해 새 카드를 확인해 주세요.", "preview_changed")
      }
      return preview
    },
  }
}

export async function confirmOrder(ticket: unknown, admin: StaffIdentity, deps: ConfirmDeps): Promise<ConfirmResult> {
  const now = deps.now?.() ?? Date.now()
  const verified = verifyTicket(ticket, deps.secret, staffKey(admin), now)
  if (!verified.ok) return { status: TICKET_STATUS[verified.error], body: { ok: false, code: verified.error, error: TICKET_ERROR_TEXT[verified.error] } }
  const { payload } = verified

  if (!canUseWriteTool(admin, payload.tool)) {
    return { status: 403, body: { ok: false, code: "role_revoked", error: "지금 역할로는 이 오더를 실행할 수 없습니다. 권한을 확인해 주세요." } }
  }
  const def = deps.getTool(payload.tool)
  if (!def || def.risk !== "R1") return { status: 404, body: { ok: false, code: "unknown_tool", error: "이 오더의 도구를 찾지 못했습니다." } }

  const actor = staffActor(admin)
  try {
    const { value, logCode } = await deps.run(guardPreview(def, payload.sh), { ...payload.args, idempotency_key: payload.jti }, actor)
    const replayed = logCode === "replayed"
    await deps.audit({
      admin,
      action: "admin_ai.order.confirm",
      targetId: payload.jti,
      payload: { tool: payload.tool, replayed, ...(logCode && !replayed ? { tool_log: logCode } : {}) },
    })
    return { status: 200, body: { ok: true, orderId: payload.jti, replayed, result: resultText(payload.tool, value) } }
  } catch (error) {
    const code = error instanceof OpsToolError ? error.code : "execute_failed"
    const status = code === "preview_changed" || code === "idempotency_conflict" ? 409 : code === "scope_denied" ? 403 : 422
    return { status, body: { ok: false, code, error: await deps.describeError(error) } }
  }
}
