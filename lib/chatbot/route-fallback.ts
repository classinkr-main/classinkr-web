import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import type { ChatbotQueryResponse } from "@/lib/chatbot/service"

export function buildChatbotRouteFallback(): ChatbotQueryResponse {
  return {
    answer:
      "응답이 지연되고 있어 우선 기본 안내로 답드릴게요. Classin은 전자칠판, 수업 녹화, EDB 교안, LMS, 학생 관리, 관리자 데이터를 한 흐름으로 묶는 수업 시스템 OS입니다. 도입 범위, 견적, 장애처럼 담당자 확인이 필요한 내용이면 상담으로 바로 이어드릴 수 있어요.",
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
