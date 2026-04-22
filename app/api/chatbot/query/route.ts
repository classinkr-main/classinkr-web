import { NextRequest, NextResponse } from "next/server"

import { ChatbotInputError, handleChatbotQuery } from "@/lib/chatbot/service"

export async function POST(req: NextRequest) {
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
      { error: "챗봇 응답을 생성하지 못했습니다." },
      { status: 500 }
    )
  }
}
