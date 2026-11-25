import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminAiMode } from "@/lib/admin-ai/preview"
import { GALMAE_CHAT_ROLES, staffActor, staffKey } from "@/lib/admin-ai/server/actor"
import { buildServerOrchestratorDeps } from "@/lib/admin-ai/server/deps"
import { runTurn } from "@/lib/admin-ai/server/orchestrator"
import { parseChatBody } from "@/lib/admin-ai/server/request"
import { ADMIN_AI_STREAM_CONTENT_TYPE, encodeStreamEvent, type AdminAiStreamEvent } from "@/lib/admin-ai/stream-protocol"
import { checkRateLimitDistributed } from "@/lib/server/rate-limit"

// 갈매봇 대화 API(서버 1단계) — 조회·묻기, 쓰기는 미리보기(오더 카드)까지. 실행은 /api/admin/ai/orders/confirm 에서만.
// 인증 가드는 CS 코파일럿·견적 API 와 같은 requireVerifiedAdminContext + CRM 스태프 역할. 실제 모드 스위치
// (NEXT_PUBLIC_ADMIN_AI_LIVE=1)가 꺼져 있으면 없는 경로처럼 404 다.
// 응답은 NDJSON 스트림: step* → (block | order)* → done, 실패하면 error 한 줄(lib/admin-ai/stream-protocol.ts).
// 근거 조립(공개 근거 검색·내부 문서)이 몇 초 걸릴 수 있어 함수 시간을 늘린다.
export const maxDuration = 60
export const dynamic = "force-dynamic"

// 사용자(계정)별 분당 20회 — 인스턴스 메모리 기준, Upstash 설정이 있으면 분산 제한(lib/server/rate-limit.ts).
const CHAT_RATE_LIMIT = { windowMs: 60_000, max: 20 }

export async function POST(req: NextRequest) {
  if (adminAiMode() !== "live") return NextResponse.json({ error: "Not found" }, { status: 404 })

  const admin = await requireVerifiedAdminContext(req, GALMAE_CHAT_ROLES)
  if (admin instanceof NextResponse) return admin

  const { allowed, resetAt } = await checkRateLimitDistributed(staffKey(admin), "admin-ai-chat", CHAT_RATE_LIMIT)
  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦습니다. 잠시 뒤 다시 물어봐 주세요." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } }
    )
  }

  const parsed = parseChatBody(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const actor = staffActor(admin)
  const deps = buildServerOrchestratorDeps({ sub: staffKey(admin) })
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const emit = (event: AdminAiStreamEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)))
        } catch {
          closed = true
        }
      }
      try {
        await runTurn(
          { text: parsed.value.text, history: parsed.value.history, context: parsed.value.context, actor, now: Date.now() },
          deps,
          emit
        )
        emit({ type: "done" })
      } catch (error) {
        // 글 원문 없이 코드만 남긴다(질문·도구 결과에 고객 정보가 섞일 수 있다).
        console.error(`[admin-ai/chat] turn_failed code=${error instanceof Error ? error.name.replace(/\W/g, "") : "unknown"}`)
        emit({ type: "error", message: "답을 만들지 못했습니다. 잠시 뒤 다시 물어봐 주세요.", code: "turn_failed" })
      } finally {
        if (!closed) controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": ADMIN_AI_STREAM_CONTENT_TYPE, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  })
}
