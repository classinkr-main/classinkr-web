import { NextRequest, NextResponse } from "next/server"

import {
  ChatbotInputError,
  streamChatbotQuery,
  validateChatbotQueryInput,
  type ChatbotQueryRequest,
  type ChatbotStreamEvent,
} from "@/lib/chatbot/service"
import { buildChatbotRouteFallback } from "@/lib/chatbot/route-fallback"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

const DEFAULT_CHATBOT_ROUTE_TIMEOUT_MS = 13_000

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getChatbotRouteTimeoutMs() {
  return getPositiveIntegerEnv("CHATBOT_ROUTE_TIMEOUT_MS", DEFAULT_CHATBOT_ROUTE_TIMEOUT_MS)
}

// NDJSON 스트리밍 응답. 한 줄당 하나의 JSON 이벤트:
//   {"type":"delta","text":"..."}    답변 텍스트 조각 추가(미리보기)
//   {"type":"replace","answer":"..."} 정제·검증된 최종 답변으로 확정
//   {"type":"meta", ...}              출처/제안질문/세션/answerEventId 등 메타데이터
//   {"type":"error","error":"..."}   처리 실패
function emitRouteFallback(emit: (event: ChatbotStreamEvent) => void) {
  const fallback = buildChatbotRouteFallback()
  emit({ type: "replace", answer: fallback.answer })
  emit({
    type: "meta",
    meta: {
      answerMode: fallback.answerMode,
      confidence: fallback.confidence,
      needsHandoff: fallback.needsHandoff,
      unresolved: fallback.unresolved,
      handoffIntent: fallback.handoffIntent,
      detectedCategory: "general",
      detectedIntent: "docs_lookup",
      sources: fallback.sources,
      suggestedQuestions: fallback.suggestedQuestions,
      warning: fallback.warning,
    },
  })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "chatbot-query", {
    windowMs: 60_000,
    max: 12,
  })

  if (!allowed) {
    return NextResponse.json(
      { error: "질문이 잠시 많이 들어왔습니다. 잠깐 후 다시 시도해 주세요." },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽지 못했습니다." }, { status: 400 })
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 })
  }

  const requestBody = body
  try {
    validateChatbotQueryInput(requestBody as ChatbotQueryRequest)
  } catch (error) {
    if (error instanceof ChatbotInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[POST /api/chatbot/query/stream] validation error:", error)
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 })
  }

  const userAgent = req.headers.get("user-agent")
  const referrer = req.headers.get("referer")

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      const emit = (event: ChatbotStreamEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          closed = true
        }
      }
      const timeoutId = setTimeout(() => {
        if (closed) return
        console.warn("[POST /api/chatbot/query/stream] timed out; returning deterministic fallback.")
        emitRouteFallback(emit)
        close()
      }, getChatbotRouteTimeoutMs())

      try {
        await streamChatbotQuery(requestBody, { userAgent, referrer }, emit)
      } catch (error) {
        if (closed) return
        if (error instanceof ChatbotInputError) {
          emit({ type: "error", error: error.message })
        } else {
          console.error("[POST /api/chatbot/query/stream] error:", error)
          emitRouteFallback(emit)
        }
      } finally {
        clearTimeout(timeoutId)
        close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
