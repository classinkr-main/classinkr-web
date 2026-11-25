import "server-only"

// 쓰기 확인 경로 — 사람이 오더 카드에서 확인한 표(티켓)를 실행한다. 이 경로에는 모델이 없다:
// 이 파일과 확인 라우트의 import 는 llm/·orchestrator·deps 와 공개 챗봇 서비스·모델(lib/chatbot/service·llm,
// lib/internal-cs-chat/gemini)을 부르지 않는다. 도구는 공용 레지스트리가 아니라 쓰기 정의만 담은 작은 표(write-tools.ts)에서
// 찾는다(tests/admin-ai/server/writes-confirm.test.ts 의 모듈 그래프 시험).
//
// 순서: 서명·만료(15분)·행위자 일치(tickets.ts) → 역할 재검사(작성 뒤 역할이 바뀌면 거절) → 쓰기 도구 →
//       실행기 runOpsTool(범위·가린 값·분당 상한) → 실행 직전 preview 를 서버에서 다시 계산해 서명된 요약과 대조
//       → **표 사용 표시(ticket-claims.ts, 원자적으로 한 번)** → execute.
// 표는 한 번만 쓴다: 표시에 성공한 요청만 실행한다. 표시가 이미 있으면(다른 서버·같은 서버·앞선 실패) 실행하지 않고
// 409 already_processed("이미 처리된 확인입니다 — 결과는 화면에서 확인하세요")다. 같은 결과를 다시 돌려주지 않는다.
// 실행이 실패해도 표시는 그대로 둔다(다시 누르면 중복 위험) — 사용자는 새 미리보기를 받아 다시 확인한다(consumed).
// 저장소가 없으면(운영) 503 claim_store_missing, 저장소 오류면 실행하지 않고 503 claim_store_unavailable(실패하면 닫힌다).
// idempotency_key 는 여전히 표 id 다 — 같은 인스턴스에서 앞 실행을 기다린 뒤 replay 로 끝나면 그것도 409 다.
// 감사: 도구 정의가 auditOps 로 남기고(mcp:galmae-…), 여기서 실제 어드민으로 logAdminAudit 를 한 줄 더 남긴다.
// 되돌리기는 이번 범위가 아니다(카드에 "되돌리기는 화면에서").
import type { VerifiedAdminContext } from "@/lib/admin-auth"
import { OpsToolError } from "@/lib/ops-tools/errors"
import type { OpsToolDef, ToolArgs, WriteToolDef } from "@/lib/ops-tools/types"

import { ClaimStoreError, type TicketClaimStore } from "./ticket-claims"
import { canUseWriteTool, staffActor, staffKey, type StaffIdentity } from "./actor"
import { summaryHash, TICKET_ERROR_TEXT, verifyTicket, type TicketError } from "./tickets"

export interface ConfirmDeps {
  getTool: (mcpName: string) => OpsToolDef | undefined
  run: (def: OpsToolDef, args: ToolArgs, actor: ReturnType<typeof staffActor>) => Promise<{ value: unknown; logCode?: string }>
  secret: string | null
  /** 표 일회용 판정 저장소(ticket-claims.ts readConfirmSetup). null 이면 확인을 열지 않는다(503). */
  claims: TicketClaimStore | null
  /** 도구의 어드민 화면 주소 — 이미 처리됨·실패 답에 싣는다. */
  screenHref?: (tool: string) => string | undefined
  describeError: (error: unknown) => Promise<string>
  audit: (entry: { admin: Pick<VerifiedAdminContext, "userId" | "name" | "role">; action: string; targetId: string; payload: Record<string, unknown> }) => Promise<void>
  now?: () => number
}

export type ConfirmFailureCode = TicketError | "claim_store_missing" | "claim_store_unavailable" | "already_processed" | "role_revoked" | "unknown_tool" | (string & {})

export type ConfirmResult =
  | { status: 200; body: { ok: true; orderId: string; result: string; claimStore?: "memory" } }
  | {
      status: 400 | 403 | 404 | 409 | 410 | 422 | 503
      body: {
        ok: false
        code: ConfirmFailureCode
        error: string
        /** 해당 어드민 화면 — 결과 확인·직접 등록. */
        href?: string
        /** 표를 이미 썼다 — 같은 카드로는 다시 확인할 수 없다(새 미리보기를 받아야 한다). */
        consumed?: true
        claimStore?: "memory"
      }
    }

export const ALREADY_PROCESSED_TEXT = "이미 처리된 확인입니다 — 결과는 화면에서 확인하세요."
export const CLAIM_STORE_MISSING_TEXT = "확인 저장소 설정이 없어 여기서 실행할 수 없습니다. 화면에서 직접 등록해 주세요."
export const CLAIM_STORE_UNAVAILABLE_TEXT = "확인 저장소에 닿지 못해 실행하지 않았습니다. 잠시 뒤 다시 요청해 새 카드를 확인해 주세요."
export const CONSUMED_RETRY_TEXT = "이 확인은 다시 쓸 수 없습니다 — 다시 요청해 새 미리보기를 받아 확인해 주세요."

/** 표가 이미 쓰였다 — 실행 전에 멈춘다. */
class AlreadyProcessed extends Error {}

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

/**
 * 미리본 요약과 확인 때 다시 계산한 요약이 다르면 실행 전에 거절하고, 같으면 표 사용 표시를 원자적으로 남긴 뒤에만
 * execute 로 넘어가는 정의 — 원래 정의의 execute 는 그대로다(실행기 순서: 분당 상한 → preview → execute).
 */
function guardPreview(def: WriteToolDef, expectedHash: string, claim: () => Promise<void>): WriteToolDef {
  return {
    ...def,
    preview: async (args, actor) => {
      const preview = await def.preview(args, actor)
      if (summaryHash(preview.summary) !== expectedHash) {
        throw new OpsToolError("미리본 뒤 내용(금액·대상)이 바뀌었습니다. 다시 요청해 새 카드를 확인해 주세요.", "preview_changed")
      }
      await claim()
      return preview
    },
  }
}

export async function confirmOrder(ticket: unknown, admin: StaffIdentity, deps: ConfirmDeps): Promise<ConfirmResult> {
  const now = deps.now?.() ?? Date.now()
  const verified = verifyTicket(ticket, deps.secret, staffKey(admin), now)
  if (!verified.ok) return { status: TICKET_STATUS[verified.error], body: { ok: false, code: verified.error, error: TICKET_ERROR_TEXT[verified.error] } }
  const { payload } = verified
  if (!deps.claims) {
    return { status: 503, body: { ok: false, code: "claim_store_missing", error: CLAIM_STORE_MISSING_TEXT } }
  }

  if (!canUseWriteTool(admin, payload.tool)) {
    return { status: 403, body: { ok: false, code: "role_revoked", error: "지금 역할로는 이 오더를 실행할 수 없습니다. 권한을 확인해 주세요." } }
  }
  const def = deps.getTool(payload.tool)
  if (!def || def.risk !== "R1") return { status: 404, body: { ok: false, code: "unknown_tool", error: "이 오더의 도구를 찾지 못했습니다." } }

  const claims = deps.claims
  const inMemory = claims.kind === "memory"
  const memory = inMemory ? ({ claimStore: "memory" } as const) : {}
  const href = deps.screenHref?.(payload.tool)
  const linked = href ? { href } : {}
  const actor = staffActor(admin)
  let claimed = false
  const claim = async () => {
    let outcome
    try {
      outcome = await claims.claim(payload.jti)
    } catch (error) {
      throw error instanceof ClaimStoreError ? error : new ClaimStoreError()
    }
    if (outcome !== "claimed") throw new AlreadyProcessed()
    claimed = true
  }
  const alreadyProcessed = (): ConfirmResult => ({
    status: 409,
    body: { ok: false, code: "already_processed", error: ALREADY_PROCESSED_TEXT, ...linked, ...memory },
  })

  try {
    const { value, logCode } = await deps.run(guardPreview(def, payload.sh, claim), { ...payload.args, idempotency_key: payload.jti }, actor)
    // 이 요청이 표시를 남기지 않았다 — 같은 인스턴스의 앞 실행(또는 도메인 행)을 되돌려 받은 것이다. 결과를 다시 주지 않는다.
    if (!claimed) return alreadyProcessed()
    // 실행은 끝났다 — 감사 줄이 실패해도 실패로 답하지 않는다(그러면 사용자가 실행되지 않은 줄 안다).
    await deps
      .audit({
        admin,
        action: "admin_ai.order.confirm",
        targetId: payload.jti,
        payload: { tool: payload.tool, ...(logCode ? { tool_log: logCode } : {}), ...(inMemory ? { claim_store: "memory" } : {}) },
      })
      .catch(() => undefined)
    return { status: 200, body: { ok: true, orderId: payload.jti, result: resultText(payload.tool, value), ...memory } }
  } catch (error) {
    if (error instanceof AlreadyProcessed) return alreadyProcessed()
    if (error instanceof ClaimStoreError) {
      return { status: 503, body: { ok: false, code: "claim_store_unavailable", error: CLAIM_STORE_UNAVAILABLE_TEXT, ...memory } }
    }
    const code = error instanceof OpsToolError ? error.code : "execute_failed"
    const status = code === "preview_changed" || code === "idempotency_conflict" ? 409 : code === "scope_denied" ? 403 : 422
    const described = await deps.describeError(error)
    // 표시 뒤의 실패 — 표는 이미 썼다. 같은 카드로 다시 누르면 409 라서 새 미리보기를 받게 안내한다.
    if (claimed) {
      return { status, body: { ok: false, code, error: `${described} ${CONSUMED_RETRY_TEXT}`, consumed: true, ...linked, ...memory } }
    }
    return { status, body: { ok: false, code, error: described, ...memory } }
  }
}
