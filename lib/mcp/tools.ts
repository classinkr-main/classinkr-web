import "server-only"

/**
 * 홈 MCP 도구 어댑터 — 공용 운영 도구 레지스트리(lib/ops-tools/registry.ts)를 MCP tools/list·tools/call 꼴로 내보낸다.
 *
 * - tools/list: 레지스트리 정의 그대로(이름·설명·스키마·주석). 쓰기 도구에는 선택 인자 idempotency_key 만 더한다.
 * - tools/call: 실행기(lib/ops-tools/run.ts)의 runOpsTool(범위 → 쓰기 안전장치 → 실행) → presentOpsResult(가림·감사)
 *   → 직렬화. MCP 쓰기는 지금처럼 execute 까지 간다(확인은 호출하는 쪽 승인 창).
 * - 서버가 쓰기를 실행할 때는 호출자가 보낸 원문을 쓴다(가림은 응답에만, pii 범위가 없는 넓힌 형식 토큰에만).
 *   가린 값이 인자로 다시 오면 실행기가 거절한다. 옛 형식 토큰은 pii 를 가져 전처럼 원문을 받는다.
 * 운영 문서: docs/active/home-mcp-operations.md
 */
import type { McpCaller, ToolResult } from "@/lib/mcp/server"
import { UNKNOWN_TOOL_ERROR_TEXT, classifyToolError } from "@/lib/ops-tools/errors"
import { hasScope } from "@/lib/ops-tools/actor"
import { IDEMPOTENCY_KEY_MAX } from "@/lib/ops-tools/guard"
import { maskContactText } from "@/lib/ops-tools/redact"
import { OPS_TOOLS, getOpsToolByMcpName } from "@/lib/ops-tools/registry"
import { presentOpsResult, runOpsTool } from "@/lib/ops-tools/run"
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

/** 직렬화 — 글자 상한 */
function serialize(value: unknown): string {
  const out = JSON.stringify(value, null, 1) ?? "null"
  return out.length > MAX_RESULT_CHARS ? `${out.slice(0, MAX_RESULT_CHARS)}\n…(잘림: ${out.length}자 중 ${MAX_RESULT_CHARS}자. 조건을 좁혀 다시 부른다)` : out
}

/** 도구 실행 — 입력·규칙 오류는 isError 결과로(사람·Claude 가 고칠 수 있다, pii 범위가 없으면 연락처는 가린다). 모르는 오류는 고정 문구, 코드는 로그에만 */
export async function callTool(name: string, rawArgs: unknown, caller: McpCaller): Promise<McpToolCallResult> {
  const def = getOpsToolByMcpName(name)
  if (!def) return text(`모르는 도구: ${name.slice(0, 60)}`, true, "unknown_tool")
  if (rawArgs != null && (typeof rawArgs !== "object" || Array.isArray(rawArgs))) return text("arguments 는 객체여야 한다.", true, "invalid_input")
  const args = (rawArgs ?? {}) as ToolArgs

  let value: unknown
  let logCode: string | undefined
  try {
    ;({ value, logCode } = await runOpsTool(def, args, caller))
  } catch (e) {
    const classified = await classifyToolError(e)
    if (classified.kind === "user") {
      return text(hasScope(caller, "pii") ? classified.message : maskContactText(classified.message), true, classified.code)
    }
    return text(UNKNOWN_TOOL_ERROR_TEXT, true, classified.code)
  }

  const presented = await presentOpsResult(def, args, caller, value)
  return text(serialize(presented.value), undefined, logCode ?? (presented.auditCode ? `audit_${presented.auditCode}` : undefined))
}
