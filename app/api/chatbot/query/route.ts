import { NextRequest, NextResponse } from "next/server"

import { ChatbotInputError, handleChatbotQuery } from "@/lib/chatbot/service"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

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
    const body = await req.json()
    const result = await handleChatbotQuery(body, {
      userAgent: req.headers.get("user-agent"),
      referrer: req.headers.get("referer"),
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChatbotInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[POST /api/chatbot/query] error:", error)
    return NextResponse.json(
      { error: "답변을 준비하지 못했습니다. 잠시 후 다시 시도하거나 상담으로 남겨주세요." },
      { status: 500 }
    )
  }
}
