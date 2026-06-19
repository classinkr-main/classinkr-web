import { NextRequest, NextResponse } from "next/server"

import { ChatbotInputError, handleChatbotQuery } from "@/lib/chatbot/service"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

const CHATBOT_ROUTE_TIMEOUT_MS = 10_000

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "chatbot-query", {
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

    const result = await Promise.race([
      handleChatbotQuery(body, {
        userAgent: req.headers.get("user-agent"),
        referrer: req.headers.get("referer"),
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("chatbot_timeout")), CHATBOT_ROUTE_TIMEOUT_MS)
      }),
    ])

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChatbotInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "요청 JSON을 읽지 못했습니다." }, { status: 400 })
    }

    console.error("[POST /api/chatbot/query] error:", error)
    const isTimeout = error instanceof Error && error.message === "chatbot_timeout"
    return NextResponse.json(
      {
        error: isTimeout
          ? "응답이 지연되고 있습니다. 잠깐 후 다시 시도해 주세요."
          : "답변을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
