/**
 * 홈 MCP 프로토콜 처리 — JSON-RPC 2.0 메시지 하나(또는 묶음) → 응답.
 *
 * Compass MCP(classin_mkt lib/mcpServer.ts)와 같은 꼴이다. 도구만 내는 서버라
 * initialize · ping · tools/list · tools/call 네 메서드만 받는다. 알림(id 없는 메시지)에는 답하지 않는다(null).
 * 로그는 한 줄 · 닫힌 어휘와 정수만(호출자·도구·결과·ms) — 인자·값은 싣지 않는다.
 * 순수 모듈이다(도구 실행은 deps.callTool 로 받는다) — tests/mcp/server.test.ts.
 */
import { timingSafeEqual } from "crypto"

export const MCP_SERVER_INFO = { name: "classin-home", title: "ClassIn 홈페이지 어드민", version: "1.0.0" } as const

/** 받는 프로토콜 판 — 클라이언트가 이 중 하나를 말하면 그대로, 아니면 맨 앞(최신)을 답한다 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const

export const MCP_INSTRUCTIONS = [
  "ClassIn 한국 홈페이지 어드민(classin.co.kr) 데이터를 다루는 내부용 서버다.",
  "읽기: hw_stock(HW 재고)·hw_movements(입출고 기록)·hw_sales(회계연도 판매)·deals_list(딜)·quotes_list/quote_get(견적)·chatbot_ask(공개 챗봇 답 미리보기)·site_traffic(방문·유입·리드 전환).",
  "쓰기는 두 가지뿐이다: quote_create_draft(견적 초안 — 발송·공유 링크 없음), hw_plan_movement(배송 예정 출고 — 확정은 어드민 화면에서 사람이).",
  "쓰기 전에 사용자에게 무엇을 만들지 확인받는다. 리드·CRM 고객 조회는 Compass MCP 몫이다.",
  "시각은 ISO(UTC) 그대로 온다 — 사람에게 말할 때는 KST 로 바꾼다.",
].join("\n")

export type McpCaller = { name: string }

/** 호출 결과 — MCP tools/call result 그대로 */
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean }

export type McpLogLine = { caller: string; method: string; tool?: string; ok: boolean; ms: number }

export type McpDeps = {
  caller: McpCaller
  listTools: () => readonly unknown[]
  callTool: (name: string, args: unknown, caller: McpCaller) => Promise<ToolResult>
  log?: (line: McpLogLine) => void
  now?: () => number
}

type JsonRpcId = string | number
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string } }

/** JSON-RPC 표준 오류 번호 */
export const RPC = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602 } as const

const rpcError = (id: JsonRpcId | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } })
const rpcResult = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result })
const isId = (v: unknown): v is JsonRpcId => typeof v === "string" || (typeof v === "number" && Number.isFinite(v))

/**
 * `HOME_MCP_TOKENS` = `이름:토큰,이름:토큰` — 사람마다 토큰을 따로 줘서 감사 로그에 누가 썼는지 남긴다.
 * 비었거나 맞는 토큰이 없으면 null(→ 401). 토큰은 timingSafeEqual 로 비교한다(lib/server/cron-auth.ts 와 같은 이유).
 */
export function resolveMcpCaller(authHeader: string | null, tokensEnv: string | undefined): McpCaller | null {
  if (!authHeader?.startsWith("Bearer ") || !tokensEnv) return null
  const provided = Buffer.from(authHeader.slice(7).trim(), "utf8")
  if (provided.length < 16) return null
  for (const entry of tokensEnv.split(",")) {
    const at = entry.indexOf(":")
    const name = entry.slice(0, at).trim()
    const token = Buffer.from(entry.slice(at + 1).trim(), "utf8")
    if (at > 0 && name && token.length === provided.length && timingSafeEqual(token, provided)) return { name }
  }
  return null
}

export function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0]
}

/** 메시지 하나. 알림·응답(클라이언트가 보낸 result/error)이면 null */
export async function handleMcpMessage(msg: unknown, deps: McpDeps): Promise<JsonRpcResponse | null> {
  const now = deps.now ?? Date.now
  const started = now()
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return rpcError(null, RPC.INVALID_REQUEST, "JSON-RPC 객체가 아니다")
  const m = msg as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
  const hasId = "id" in m && m.id !== undefined
  if (m.jsonrpc !== "2.0") return rpcError(hasId && isId(m.id) ? m.id : null, RPC.INVALID_REQUEST, "jsonrpc 는 \"2.0\"")
  if (typeof m.method !== "string") return null
  if (!hasId) return null
  if (!isId(m.id)) return rpcError(null, RPC.INVALID_REQUEST, "id 는 글자나 수")
  const id = m.id
  const params = (m.params && typeof m.params === "object" && !Array.isArray(m.params) ? m.params : {}) as Record<string, unknown>

  switch (m.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_INSTRUCTIONS,
      })
    case "ping":
      return rpcResult(id, {})
    case "tools/list":
      return rpcResult(id, { tools: deps.listTools() })
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : ""
      if (!name) return rpcError(id, RPC.INVALID_PARAMS, "params.name 이 없다")
      let result: ToolResult
      try {
        result = await deps.callTool(name, params.arguments, deps.caller)
      } catch (e) {
        // 모르는 오류(DB 접속·버그) — 내용은 응답에 싣지 않는다(값·접속 문자열이 섞일 수 있다)
        console.error("[mcp] 도구 실행 실패", name, e instanceof Error ? e.message.slice(0, 200) : typeof e)
        result = { content: [{ type: "text", text: "서버 쪽에서 실패했다. 잠시 뒤 다시 시도한다" }], isError: true }
      }
      deps.log?.({ caller: deps.caller.name, method: m.method, tool: name, ok: !result.isError, ms: now() - started })
      return rpcResult(id, result)
    }
    default:
      return rpcError(id, RPC.METHOD_NOT_FOUND, `지원하지 않는 메서드: ${m.method.slice(0, 60)}`)
  }
}

/** 몸통 하나(메시지 또는 묶음 배열) → 응답(없으면 null). 묶음은 하나씩 차례로, 20개까지 */
export async function handleMcpPayload(payload: unknown, deps: McpDeps): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(payload)) {
    if (!payload.length) return rpcError(null, RPC.INVALID_REQUEST, "빈 묶음")
    const out: JsonRpcResponse[] = []
    for (const msg of payload.slice(0, 20)) {
      const r = await handleMcpMessage(msg, deps)
      if (r) out.push(r)
    }
    return out.length ? out : null
  }
  return handleMcpMessage(payload, deps)
}

/** 로그 한 줄 — `[mcp] caller=moon method=tools/call tool=hw_stock ok=1 ms=230` */
export function formatMcpLog(l: McpLogLine): string {
  const safe = (v: string) => v.replace(/[^\p{L}\p{N}_-]/gu, "?").slice(0, 40)
  return ["[mcp]", `caller=${safe(l.caller)}`, `method=${l.method}`, l.tool ? `tool=${safe(l.tool)}` : "", `ok=${l.ok ? 1 : 0}`, `ms=${l.ms}`]
    .filter(Boolean)
    .join(" ")
}
