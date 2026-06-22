import { NextRequest, NextResponse } from "next/server"

import { ChatbotInputError, handleChatbotQuery } from "@/lib/chatbot/service"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

const DEFAULT_CHATBOT_ROUTE_TIMEOUT_MS = 13_000

type ChatbotRouteResult = Awaited<ReturnType<typeof handleChatbotQuery>>

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getChatbotRouteTimeoutMs() {
  return getPositiveIntegerEnv("CHATBOT_ROUTE_TIMEOUT_MS", DEFAULT_CHATBOT_ROUTE_TIMEOUT_MS)
}

function buildChatbotTimeoutFallback(): ChatbotRouteResult {
  return {
    answer:
      "응답이 지연되고 있어 우선 기본 안내로 답드릴게요. Classin은 전자칠판, 수업 녹화, EDB 교안, LMS, 학생 관리, 관리자 데이터를 한 흐름으로 묶는 학원 시스템 OS입니다. 도입 범위, 견적, 장애처럼 담당자 확인이 필요한 내용이면 상담으로 바로 이어드릴 수 있어요.",
    answerMode: "fallback",
    confidence: 0.35,
    needsHandoff: false,
    handoffIntent: "demo",
    sources: [],
    suggestedQuestions: [...CLASSIN_POSITIONING.chatbot.fallbackQuestions],
    unresolved: true,
    warning: "챗봇 답변 생성이 지연되어 기본 안내로 전환했습니다.",
  }
}

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

    const result = await Promise.race<ChatbotRouteResult>([
      handleChatbotQuery(body, {
        userAgent: req.headers.get("user-agent"),
        referrer: req.headers.get("referer"),
      }),
      new Promise<ChatbotRouteResult>((resolve) => {
        setTimeout(() => {
          console.warn("[POST /api/chatbot/query] timed out; returning deterministic fallback.")
          resolve(buildChatbotTimeoutFallback())
        }, getChatbotRouteTimeoutMs())
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
