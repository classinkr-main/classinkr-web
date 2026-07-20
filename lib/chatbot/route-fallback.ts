import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import {
  classifyChatbotQuestion,
  type ChatbotCategory,
  type ChatbotIntent,
  type HandoffIntent,
} from "@/lib/chatbot/classification"
import type { ChatbotQueryResponse } from "@/lib/chatbot/service"

export interface ChatbotRouteFallback extends ChatbotQueryResponse {
  detectedCategory: ChatbotCategory
  detectedIntent: ChatbotIntent
}

function fallbackMessage(input: unknown) {
  if (typeof input === "string") return input.trim()
  if (!input || typeof input !== "object" || Array.isArray(input)) return ""
  const message = (input as { message?: unknown }).message
  return typeof message === "string" ? message.trim() : ""
}

function fallbackClassification(input: unknown): {
  category: ChatbotCategory
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
} {
  const message = fallbackMessage(input)
  if (!message) {
    return { category: "general", intent: "docs_lookup", handoffIntent: "demo" }
  }
  return classifyChatbotQuestion(message)
}

export function buildChatbotRouteFallback(input?: unknown): ChatbotRouteFallback {
  const { category, intent, handoffIntent } = fallbackClassification(input)
  const isSupport = handoffIntent === "support"

  return {
    answer: isSupport
      ? "응답이 지연되고 있어 정확한 확인을 위해 지원 상담으로 이어드릴게요. 오류 화면, 사용 기기, 발생 시점을 함께 남겨주시면 담당자가 더 빠르게 확인할 수 있습니다."
      : "응답이 지연되고 있어 우선 기본 안내로 답드릴게요. Classin은 전자칠판, 수업 녹화, EDB 교안, LMS, 학생 관리, 관리자 데이터를 한 흐름으로 묶는 수업 시스템 OS입니다. 도입 범위나 견적처럼 담당자 확인이 필요한 내용이면 상담으로 바로 이어드릴 수 있어요.",
    answerMode: "fallback",
    confidence: 0.35,
    needsHandoff: isSupport,
    handoffIntent,
    detectedCategory: category,
    detectedIntent: intent,
    sources: [],
    suggestedQuestions: isSupport
      ? [
          "오류 화면과 발생 시점을 남기고 싶어요",
          "사용 기기와 앱 버전을 확인하는 방법이 궁금해요",
        ]
      : [...CLASSIN_POSITIONING.chatbot.fallbackQuestions],
    unresolved: true,
    warning: "챗봇 답변 생성이 지연되어 기본 안내로 전환했습니다.",
  }
}
