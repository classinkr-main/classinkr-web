import { type NextRequest, NextResponse } from "next/server"

import { RPC, authenticateMcp, formatMcpAuthDenied, formatMcpLog, handleMcpPayload } from "@/lib/mcp/server"
import { callTool, isWriteTool, listTools } from "@/lib/mcp/tools"

/**
 * 홈 MCP 원격 엔드포인트 — Claude Code·Claude 데스크톱·claude.ai 커스텀 커넥터가 Streamable HTTP 로 붙는다(내부 직원용).
 *
 * 인증: `Authorization: Bearer <토큰>`, 토큰 목록은 `HOME_MCP_TOKENS`(옛 형식 `이름:토큰`, 넓힌 형식
 * `이름:토큰;scope=…;exp=…;admin=…` — lib/mcp/server.ts authenticateMcp, docs/active/home-mcp-operations.md). 비어 있으면 늘 401.
 * 어드민 세션 쿠키는 보지 않는다 — proxy.ts 에서 이 경로를 건너뛰고, 이 줄이 유일한 문이다.
 * 전송: 무상태 — 요청 하나에 JSON 응답 하나(SSE·세션 id 없음). GET·DELETE 는 내보내지 않아 405(스펙이 허용하는 답).
 * 연결: `claude mcp add --transport http classin-home https://classin.co.kr/api/mcp --header "Authorization: Bearer <토큰>"`
 */
export const maxDuration = 60

/** 요청 몸통 상한 — 도구 인자는 작다 */
const MAX_BODY_BYTES = 64 * 1024

const rpcErrorResponse = (status: number, code: number, message: string) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(req: NextRequest) {
  const auth = authenticateMcp(req.headers.get("authorization"), process.env.HOME_MCP_TOKENS)
  if (!auth.ok) {
    // 실패 이유는 닫힌 어휘로 로그에만(missing·unconfigured·invalid·expired·duplicate). 응답은 전과 같은 401 하나
    console.info(formatMcpAuthDenied(auth.reason))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } })
  }
  const caller = auth.caller

  const text = await req.text()
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return rpcErrorResponse(413, RPC.INVALID_REQUEST, "요청이 너무 크다")

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return rpcErrorResponse(400, RPC.PARSE, "JSON 이 아니다")
  }

  const out = await handleMcpPayload(payload, {
    caller,
    listTools,
    callTool,
    isWriteTool,
    log: (line) => console.info(formatMcpLog(line)),
  })
  // 알림·응답만 온 요청 — 본문 없이 202(Streamable HTTP)
  if (out == null) return new NextResponse(null, { status: 202 })
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } })
}
