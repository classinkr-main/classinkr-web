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
import { fingerprintArgs, idempotencyConflict, idempotencyKeyHash, readIdempotencyKey, runIdempotent, takeWriteSlot } from "@/lib/ops-tools/guard"
import { type SharedIdempotencyStore, readSharedIdempotencyStore } from "@/lib/ops-tools/idempotency-store"
import { findMaskedInput, redactContacts } from "@/lib/ops-tools/redact"
import { type OpsToolDef, type ToolArgs, type WriteExecuteResult, isWriteDef } from "@/lib/ops-tools/types"

export type OpsRunResult = { value: unknown; logCode?: string }

const SHARED_WAIT_MS = 5_000
const SHARED_POLL_MS = 200
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 공용 저장소로 같은 키 동시 실행을 한 번으로 막는다(sharedIdempotency 도구). 키를 먼저 잡은 쪽만 execute 하고,
 * 다른 인스턴스에서 같은 키가 오면 끝난 결과(처음 결과)를 돌려준다. 실행이 실패하면 키를 지워 다시 시도할 수 있게 한다.
 * 저장소 호출이 실패하면 닫지 않고 execute 를 그대로 한다(인스턴스 메모리 판정 — idempotencyScope 로 표시).
 */
async function executeWithSharedClaim(
  store: SharedIdempotencyStore,
  keyHash: string,
  fingerprint: string,
  execute: () => Promise<WriteExecuteResult>,
  waitMs: number = SHARED_WAIT_MS
): Promise<WriteExecuteResult> {
  const deadline = Date.now() + waitMs
  for (;;) {
    let claim: Awaited<ReturnType<SharedIdempotencyStore["claim"]>>
    try {
      claim = await store.claim(keyHash, fingerprint)
    } catch {
      console.error("[mcp] idempotency_store_unavailable")
      return { ...(await execute()), idempotencyScope: "instance_memory" }
    }
    if (claim.won) {
      try {
        const result = await execute()
        await store.complete(keyHash, fingerprint, result).catch(() => console.error("[mcp] idempotency_store_complete_failed"))
        return result
      } catch (e) {
        await store.release(keyHash).catch(() => undefined)
        throw e
      }
    }
    const record = claim.record
    if (record) {
      if (record.fingerprint !== fingerprint) throw idempotencyConflict()
      if (record.state === "done" && record.result) return { ...record.result, replayed: true }
    }
    // 진행 중(또는 읽는 사이 지워졌다) — 잠깐 기다렸다가 다시 본다
    if (Date.now() >= deadline) {
      throw new OpsToolError("같은 idempotency_key 로 진행 중인 호출이 있다. 잠시 뒤 같은 키로 다시 부른다.", "idempotency_in_progress")
    }
    await sleep(SHARED_POLL_MS)
  }
}

/** 시험 전용 */
export const executeWithSharedClaimForTest = executeWithSharedClaim

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

  // 도메인 행에 키를 실을 칸이 없는 도구 — 공용 저장소가 있으면 거기서, 없으면 인스턴스 메모리(아래에서 표시)
  const sharedStore = keyHash && def.sharedIdempotency ? readSharedIdempotencyStore() : null
  const memoryJudged = Boolean(keyHash && def.sharedIdempotency && !sharedStore)
  const execute = sharedStore && keyHash ? () => executeWithSharedClaim(sharedStore, keyHash, fingerprint, executeOnce) : executeOnce

  const { result, replayed } = await runIdempotent<WriteExecuteResult>(
    { caller: actor.name, tool: def.mcpName, key, fingerprint },
    execute,
    keyHash && def.findExisting ? () => def.findExisting!(actor, keyHash) : undefined
  )
  // replay 도 처음 결과와 같은 꼴(배열은 배열 그대로) — replay 여부는 로그 코드로만
  // 메모리로만 판정했으면(공용 저장소 없음·실패) 객체 결과에 칸 하나(idempotency_scope)를 더하고 로그에도 남긴다
  const memory = memoryJudged || result.idempotencyScope === "instance_memory"
  const out = result.output
  const value = memory && out && typeof out === "object" && !Array.isArray(out) ? { ...(out as Record<string, unknown>), idempotency_scope: "instance_memory" } : out
  const base = replayed || result.replayed ? "replayed" : result.auditFailure ? `audit_${result.auditFailure}` : undefined
  const logCode = [base, memory ? "idem_memory" : undefined].filter(Boolean).join("-") || undefined
  return { value, ...(logCode ? { logCode } : {}) }
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
