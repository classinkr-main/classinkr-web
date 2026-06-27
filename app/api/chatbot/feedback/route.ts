import { NextRequest, NextResponse } from "next/server"

import { ChatbotInputError, saveChatbotFeedback } from "@/lib/chatbot/service"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "chatbot-feedback", {
    windowMs: 60_000,
    max: 20,
  })

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "요청 JSON을 읽지 못했습니다." }, { status: 400 })
  }

  try {
    const result = await saveChatbotFeedback(body)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChatbotInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[POST /api/chatbot/feedback] error:", error)
    return NextResponse.json(
      { error: "챗봇 피드백을 저장하지 못했습니다." },
      { status: 500 }
    )
  }
}
