import { NextRequest, NextResponse } from "next/server"

import { ChatbotInputError, handleChatbotQuery } from "@/lib/chatbot/service"
import { buildChatbotRouteFallback } from "@/lib/chatbot/route-fallback"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"

const DEFAULT_CHATBOT_ROUTE_TIMEOUT_MS = 13_000

type ChatbotRouteResult = Awaited<ReturnType<typeof handleChatbotQuery>>

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getChatbotRouteTimeoutMs() {
  return getPositiveIntegerEnv("CHATBOT_ROUTE_TIMEOUT_MS", DEFAULT_CHATBOT_ROUTE_TIMEOUT_MS)
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "chatbot-query", {
    windowMs: 60_000,
    max: 12,
  })

  if (!allowed) {
    return NextResponse.json({ error: "질문이 잠시 많이 들어왔습니다. 잠깐 후 다시 시도해 주세요." }, { status: 429 })
  }

  try {
    const body: unknown = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ChatbotInputError("요청 형식이 올바르지 않습니다.")
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<ChatbotRouteResult>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn("[POST /api/chatbot/query] timed out; returning deterministic fallback.")
        resolve(buildChatbotRouteFallback())
      }, getChatbotRouteTimeoutMs())
    })
    const result = await Promise.race<ChatbotRouteResult>([
      handleChatbotQuery(body, {
        userAgent: req.headers.get("user-agent"),
        referrer: req.headers.get("referer"),
      }),
      timeoutPromise,
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId)
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChatbotInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "요청 JSON을 읽지 못했습니다." }, { status: 400 })
    }

    console.error("[POST /api/chatbot/query] error:", error)
    return NextResponse.json(buildChatbotRouteFallback())
  }
}
