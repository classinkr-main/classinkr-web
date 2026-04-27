import { NextRequest, NextResponse } from "next/server"

import { ChatbotInputError, saveChatbotFeedback } from "@/lib/chatbot/service"

export async function POST(req: NextRequest) {
  try {
    const result = await saveChatbotFeedback(await req.json())
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
