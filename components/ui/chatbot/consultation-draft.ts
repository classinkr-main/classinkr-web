// 상담 연결 카드가 쓰는 순수 함수: 문의폼·채널톡에 넘길 상담 요약(draft)과 채널톡 프로필.
import type { ChannelTalkProfile } from "@/lib/channel-talk"
import type { ChatMessage } from "@/components/ui/chatbot/types"

const HANDOFF_TRANSCRIPT_LIMIT = 6

// 상담원 연결 시 최근 대화록·인텐트를 채널톡 프로필로 넘긴다 — 상담원이 맥락을 갖고 시작.
export function buildHandoffProfile(
    messages: ChatMessage[],
    triggerMessage: ChatMessage,
    sessionId?: string,
): ChannelTalkProfile {
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content
    const transcript = messages
        .slice(-HANDOFF_TRANSCRIPT_LIMIT)
        .map((m) => `${m.role === "user" ? "고객" : "챗봇"}: ${m.content}`)
        .join("\n")

    const profile: ChannelTalkProfile = {
        chatbotHandoff: true,
        chatbotIntent: triggerMessage.handoffIntent ?? "support",
    }
    if (lastQuestion) profile.lastQuestion = lastQuestion.slice(0, 300)
    if (transcript) profile.chatbotTranscript = transcript.slice(0, 1500)
    if (sessionId) profile.chatbotSessionId = sessionId
    return profile
}

export function buildConsultationDraft(
    messages: ChatMessage[],
    triggerMessage: ChatMessage,
) {
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content
    const intentLine =
        triggerMessage.handoffIntent === "support"
            ? "계정/결제/장비 상태 확인이 필요한 문의입니다."
            : "도입 방식과 운영 흐름 상담이 필요한 문의입니다."
    const answerSummary = triggerMessage.content
        .replace(/\s+/g, " ")
        .replace(/^요약:\s*/i, "")
        .slice(0, 260)
        .trim()

    return [
        "Classin 상담 요청드립니다.",
        intentLine,
        lastQuestion ? `질문: ${lastQuestion}` : null,
        answerSummary ? `챗봇 확인 내용: ${answerSummary}` : null,
    ].filter(Boolean).join("\n")
}
