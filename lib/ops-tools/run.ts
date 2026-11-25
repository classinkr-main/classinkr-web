import "server-only"

/**
 * 운영 도구 실행기 — 표면(홈 MCP, 이후 갈매봇)과 상관없이 정의를 부르는 한 곳.
 *
 * runOpsTool: 범위 확인 → (읽기) run
 *                       → (쓰기) 가린 값 거절 → idempotency 판정(메모리 → 도메인 표) → [분당 상한 → preview → execute]
 *   - replay(같은 키·같은 인자)는 분당 상한을 쓰지 않는다. preview 가 입력 오류로 실패하면 센 한 번을 되돌린다.
 *   - 상한은 preview(DB 조회)보다 앞이라 상한에 걸린 호출은 DB 를 읽지 않는다.
 * presentOpsResult: 연락처 가림(pii 범위 없으면) + 연락처가 든 읽기의 감사(값 없이 도구·대상 id·칸 수).
 * 표면 어댑터는 이 둘만 부르고 정의(run·preview·execute)를 직접 부르지 않는다.
 * 운영 문서: docs/active/home-mcp-operations.md
 */
import { type OpsActor, actorDisplayName, hasScope } from "@/lib/ops-tools/actor"
import { auditOps } from "@/lib/ops-tools/audit"
import { OpsToolError } from "@/lib/ops-tools/errors"
import { fingerprintArgs, idempotencyKeyHash, readIdempotencyKey, runIdempotent, takeWriteSlot } from "@/lib/ops-tools/guard"
import { findMaskedInput, redactContacts } from "@/lib/ops-tools/redact"
import { type OpsToolDef, type ToolArgs, type WriteExecuteResult, isWriteDef } from "@/lib/ops-tools/types"

export type OpsRunResult = { value: unknown; logCode?: string }

export async function runOpsTool(def: OpsToolDef, args: ToolArgs, actor: OpsActor): Promise<OpsRunResult> {
  if (!hasScope(actor, def.requiredScope)) {
    throw new OpsToolError(`이 토큰에는 ${def.requiredScope} 범위가 없어 ${def.mcpName} 을 부를 수 없다. 범위는 관리자가 토큰 줄에서 준다.`, "scope_denied")
  }
  if (!isWriteDef(def)) return { value: await def.run(args, actor) }

  // 가린 연락처(010-****-5678, ***@도메인)를 그대로 쓰기 인자로 넘기면 별표가 기록에 영구히 남는다 — 실행 전에 거절
  const maskedAt = findMaskedInput(args)
  if (maskedAt) {
    throw new OpsToolError(
      `인자 ${maskedAt} 에 가린 연락처(****·***@)가 들어 있다. 조회 결과의 가린 값은 쓰기에 쓰지 않는다 — 사용자에게 원문을 받거나 그 부분을 빼고 다시 부른다.`,
      "masked_input"
    )
  }

  const key = readIdempotencyKey(args)
  const fingerprint = fingerprintArgs(args)
  const keyHash = key ? idempotencyKeyHash(actor.name, def.mcpName, key) : undefined

  const executeOnce = async (): Promise<WriteExecuteResult> => {
    const slot = takeWriteSlot(actor.name)
    if (!slot.allowed) {
      throw new OpsToolError(`쓰기 호출이 너무 잦다(호출자별 분당 상한). ${Math.ceil(slot.retryAfterMs / 1000)}초 뒤 다시 시도한다.`, "rate_limited")
    }
    let preview
    try {
      preview = await def.preview(args, actor)
    } catch (e) {
      slot.release()
      throw e
    }
    return def.execute(preview, actor, keyHash ? { idempotency: { keyHash, fingerprint } } : {})
  }

  const { result, replayed } = await runIdempotent<WriteExecuteResult>(
    { caller: actor.name, tool: def.mcpName, key, fingerprint },
    executeOnce,
    keyHash && def.findExisting ? () => def.findExisting!(actor, keyHash) : undefined
  )
  // replay 도 처음 결과와 같은 꼴(배열은 배열 그대로) — replay 여부는 로그 코드로만
  if (replayed) return { value: result.output, logCode: "replayed" }
  return { value: result.output, ...(result.auditFailure ? { logCode: `audit_${result.auditFailure}` } : {}) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 호출자에게 낼 값 — pii 범위가 없으면 연락처를 가린다(공개 결과는 그대로). 연락처가 든 읽기는 감사에 남긴다.
 * auditCode 는 감사 실패 코드(읽기 결과는 그대로 돌려주고 로그에만 싣는다).
 */
export async function presentOpsResult(def: OpsToolDef, args: ToolArgs, actor: OpsActor, value: unknown): Promise<{ value: unknown; auditCode?: string }> {
  if (!isWriteDef(def) && def.publicResult?.(args, actor)) return { value }
  const reveal = hasScope(actor, "pii")
  const { value: masked, masked: contactFields } = redactContacts(value)
  let auditCode: string | undefined
  if (contactFields > 0 && !isWriteDef(def)) {
    // 개인정보(연락처)가 든 읽기 — 값 없이 도구·대상·칸 수만
    const audit = await auditOps(actor, {
      action: "mcp.read_contacts",
      targetType: "mcp_tool",
      targetId: typeof args.id === "string" && UUID.test(args.id) ? args.id : undefined,
      payload: { tool: def.mcpName, contact_fields: contactFields, revealed: reveal, actor: actorDisplayName(actor) },
    })
    if (!audit.ok) auditCode = audit.code
  }
  return { value: reveal ? value : masked, ...(auditCode ? { auditCode } : {}) }
}
