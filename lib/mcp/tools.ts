import "server-only"

/**
 * 홈 MCP 도구 어댑터 — 공용 운영 도구 레지스트리(lib/ops-tools/registry.ts)를 MCP tools/list·tools/call 꼴로 내보낸다.
 *
 * - tools/list: 레지스트리 정의 그대로(이름·설명·스키마·주석). 쓰기 도구에는 선택 인자 idempotency_key 만 더한다.
 * - tools/call: 범위 확인 → (쓰기) preview → 분당 상한 → idempotency_key 로 한 번만 execute → 가림 → 직렬화.
 *   MCP 쓰기는 지금처럼 execute 까지 간다(확인은 호출하는 쪽 승인 창).
 * - 사람 연락처 가림은 직렬화 직전 이 한 곳(serialize)에서 한다. pii 범위가 있는 넓힌 형식 토큰만 원문을 받는다.
 *   서버가 쓰기를 실행할 때는 원문을 쓴다(가림은 응답에만).
 * - 연락처가 든 읽기는 audit_logs 에 도구 이름·대상 id·칸 수만 남긴다(값은 싣지 않는다).
 * 운영 문서: docs/active/home-mcp-operations.md
 */
import type { McpCaller, ToolResult } from "@/lib/mcp/server"
import { actorDisplayName, hasScope } from "@/lib/ops-tools/actor"
import { auditOps } from "@/lib/ops-tools/audit"
import { OpsToolError, classifyToolError } from "@/lib/ops-tools/errors"
import { IDEMPOTENCY_KEY_MAX, fingerprintArgs, readIdempotencyKey, runIdempotent, takeWriteSlot } from "@/lib/ops-tools/guard"
import { redactContacts } from "@/lib/ops-tools/redact"
import { OPS_TOOLS, getOpsToolByMcpName } from "@/lib/ops-tools/registry"
import { type OpsToolDef, type ToolArgs, isWriteDef } from "@/lib/ops-tools/types"

/** 도구 결과 글자 상한 — 넘으면 자르고 알린다(Claude 문맥 보호) */
export const MAX_RESULT_CHARS = 100_000

type McpToolDef = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: false; idempotentHint: boolean; openWorldHint: false }
}

const IDEMPOTENCY_KEY_PROPERTY = {
  type: "string",
  maxLength: IDEMPOTENCY_KEY_MAX,
  description: "같은 쓰기를 다시 보낼 때 같은 값을 주면 두 번 만들지 않는다(재시도 대비, 선택)",
}

function toMcpDef(def: OpsToolDef): McpToolDef {
  const write = isWriteDef(def)
  const inputSchema = write
    ? { ...def.inputSchema, properties: { ...(def.inputSchema.properties as Record<string, unknown>), idempotency_key: IDEMPOTENCY_KEY_PROPERTY } }
    : def.inputSchema
  return {
    name: def.mcpName,
    title: def.title,
    description: def.description,
    inputSchema,
    annotations: { title: def.title, readOnlyHint: !write, destructiveHint: false, idempotentHint: !write, openWorldHint: false },
  }
}

const MCP_DEFS = OPS_TOOLS.map(toMcpDef)

export const listTools = () => MCP_DEFS

/** 쓰기 도구인가 — server.ts 가 JSON-RPC 묶음 하나에 쓰기를 1개로 묶을 때 쓴다 */
export const isWriteTool = (name: string) => {
  const def = getOpsToolByMcpName(name)
  return !!def && isWriteDef(def)
}

/** tools/call 결과 + 로그용 닫힌 코드(server.ts 가 응답에서 떼어 로그에만 싣는다) */
export type McpToolCallResult = ToolResult & { logCode?: string }

const text = (value: string, isError?: boolean, logCode?: string): McpToolCallResult => ({
  content: [{ type: "text", text: value }],
  ...(isError ? { isError } : {}),
  ...(logCode ? { logCode } : {}),
})

/** 직렬화 직전 한 곳 — 연락처 가림(pii 범위 없으면), 글자 상한 */
function serialize(value: unknown, revealContacts: boolean): { text: string; contactFields: number } {
  const { value: masked, masked: contactFields } = redactContacts(value)
  const out = JSON.stringify(revealContacts ? value : masked, null, 1) ?? "null"
  return {
    text: out.length > MAX_RESULT_CHARS ? `${out.slice(0, MAX_RESULT_CHARS)}\n…(잘림: ${out.length}자 중 ${MAX_RESULT_CHARS}자. 조건을 좁혀 다시 부른다)` : out,
    contactFields,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function runTool(def: OpsToolDef, args: ToolArgs, caller: McpCaller): Promise<{ value: unknown; logCode?: string }> {
  if (!isWriteDef(def)) return { value: await def.run(args, caller) }

  const idempotencyKey = readIdempotencyKey(args)
  const preview = await def.preview(args, caller)
  const slot = takeWriteSlot(caller.name)
  if (!slot.allowed) {
    throw new OpsToolError(`쓰기 호출이 너무 잦다(호출자별 분당 상한). ${Math.ceil(slot.retryAfterMs / 1000)}초 뒤 다시 시도한다.`, "rate_limited")
  }
  const { result, replayed } = await runIdempotent(
    { caller: caller.name, tool: def.mcpName, key: idempotencyKey, fingerprint: fingerprintArgs(args) },
    () => def.execute(preview, caller, { idempotencyKey }),
    idempotencyKey && def.findExisting ? () => def.findExisting!(caller, idempotencyKey) : undefined
  )
  if (!replayed) return { value: result }
  return {
    value: { replayed: true, note: "같은 idempotency_key 로 이미 실행한 쓰기다. 새로 만들지 않고 처음 결과를 돌려준다.", result },
    logCode: "replayed",
  }
}

/** 도구 실행 — 입력·규칙 오류는 isError 결과로(사람·Claude 가 고칠 수 있다). 모르는 오류는 코드만 싣는다 */
export async function callTool(name: string, rawArgs: unknown, caller: McpCaller): Promise<McpToolCallResult> {
  const def = getOpsToolByMcpName(name)
  if (!def) return text(`모르는 도구: ${name.slice(0, 60)}`, true, "unknown_tool")
  if (rawArgs != null && (typeof rawArgs !== "object" || Array.isArray(rawArgs))) return text("arguments 는 객체여야 한다.", true, "invalid_input")
  if (!hasScope(caller, def.requiredScope)) {
    return text(`이 토큰에는 ${def.requiredScope} 범위가 없어 ${def.mcpName} 을 부를 수 없다. 범위는 관리자가 토큰 줄에서 준다.`, true, "scope_denied")
  }
  const args = (rawArgs ?? {}) as ToolArgs

  let value: unknown
  let logCode: string | undefined
  try {
    ;({ value, logCode } = await runTool(def, args, caller))
  } catch (e) {
    const classified = classifyToolError(e)
    if (classified.kind === "user") return text(classified.message, true, classified.code)
    return text(`서버 쪽에서 실패했다(코드 ${classified.code}). 잠시 뒤 다시 시도한다`, true, classified.code)
  }

  const reveal = hasScope(caller, "pii")
  const { text: out, contactFields } = serialize(value, reveal)
  if (contactFields > 0 && !isWriteDef(def)) {
    // 개인정보(연락처)가 든 읽기 — 값 없이 도구·대상·칸 수만. 실패해도 읽기 결과는 돌려주고 코드만 로그에 남긴다
    const audit = await auditOps(caller, {
      action: "mcp.read_contacts",
      targetType: "mcp_tool",
      targetId: typeof args.id === "string" && UUID.test(args.id) ? args.id : undefined,
      payload: { tool: def.mcpName, contact_fields: contactFields, revealed: reveal, actor: actorDisplayName(caller) },
    })
    if (!audit.ok) logCode = `audit_${audit.code}`
  }
  return text(out, undefined, logCode)
}
