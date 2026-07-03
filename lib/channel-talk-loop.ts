/**
 * 채널톡 → 챗봇·CRM 루프 헬퍼.
 *
 * /admin/channel-talk 화면에서 (1) FAQ 마이닝 후보를 챗봇 추천 질문으로 승격하고,
 * (2) 미매칭 상담을 CRM 리드로 등록할 때 쓰는 payload 빌더·중복 판정 모음.
 * 순수 함수 — 오프라인/테스트 가능.
 */

import { normalizeQuestion } from "@/lib/channel-talk-mining"

/** 채널톡 발 리드의 source 값 — 리드 보드 SOURCE_LABEL과 짝을 맞춘다. */
export const CHANNEL_TALK_LEAD_SOURCE = "channel_talk"

/** 리드 보드 경로 — ?lead=<id> 딥링크로 해당 리드 드로어가 바로 열린다. */
export const LEADS_BOARD_PATH = "/admin/crm/customers/leads"

export interface PromotableFaqSuggestion {
  question: string
  count: number
  category?: string
  lastAskedAt?: string
  sampleConversationIds: string[]
}

export interface RecommendedQuestionPromotionPayload {
  label: string
  prompt: string
  placement: "starter"
  status: "draft"
  category?: string
  metadata: Record<string, unknown>
}

/** 챗봇 칩에 그대로 노출되는 label용 — 코드포인트 기준으로 자르고 말줄임표를 붙인다. */
export function truncateLabel(text: string, max = 24): string {
  const compact = text.replace(/\s+/g, " ").trim()
  const chars = Array.from(compact)
  if (chars.length <= max) return compact
  return `${chars.slice(0, max).join("").trimEnd()}…`
}

/**
 * FAQ 마이닝 후보 → POST /api/admin/chatbot/recommended-questions payload.
 * draft로 등록해 어드민이 /admin/docs 추천 질문 관리에서 검토 후 발행한다.
 */
export function buildPromotionPayload(
  suggestion: PromotableFaqSuggestion
): RecommendedQuestionPromotionPayload {
  return {
    label: truncateLabel(suggestion.question),
    prompt: suggestion.question.replace(/\s+/g, " ").trim(),
    placement: "starter",
    status: "draft",
    category: suggestion.category,
    metadata: {
      source: "channel_talk_mining",
      count: suggestion.count,
      lastAskedAt: suggestion.lastAskedAt ?? null,
      sampleConversationIds: suggestion.sampleConversationIds,
    },
  }
}

/**
 * 중복 승격 방지 — 이미 등록된 추천 질문 prompt들과 정규화(소문자·문장부호 제거) 비교.
 * DB에 unique 제약이 없어 클라이언트에서 선제 차단한다.
 */
export function isQuestionAlreadyPromoted(
  question: string,
  existingPrompts: readonly (string | null | undefined)[]
): boolean {
  const normalized = normalizeQuestion(question)
  if (!normalized) return false
  return existingPrompts.some(
    (prompt) => typeof prompt === "string" && normalizeQuestion(prompt) === normalized
  )
}

export interface LeadRegistrationConversation {
  id: string
  name?: string
  email?: string
  phone?: string
  messageCount: number
  firstQuestion?: string
  lastMessageText?: string
  lastMessageAt?: string
}

export interface ChannelTalkLeadPayload {
  name?: string
  email?: string
  phone?: string
  source: typeof CHANNEL_TALK_LEAD_SOURCE
  source_detail: string
  message?: string
  notes: string
}

/**
 * 미매칭 상담 → POST /api/admin/leads payload.
 * 식별자(이름·이메일·전화) 하나도 없으면 API가 400을 내므로 null을 돌려 버튼을 막는다.
 * 상담 요약(첫 질문·최근 메시지·메시지 수)은 notes로 남긴다.
 */
export function buildLeadPayloadFromConversation(
  conversation: LeadRegistrationConversation
): ChannelTalkLeadPayload | null {
  const name = conversation.name?.trim() || undefined
  const email = conversation.email?.trim() || undefined
  const phone = conversation.phone?.trim() || undefined
  if (!name && !email && !phone) return null

  const noteLines = [`채널톡 상담에서 등록 (chat ${conversation.id})`]
  if (conversation.firstQuestion?.trim()) {
    noteLines.push(`첫 질문: ${conversation.firstQuestion.trim()}`)
  }
  if (conversation.lastMessageText?.trim()) {
    noteLines.push(`최근 메시지: ${conversation.lastMessageText.trim()}`)
  }
  const when = conversation.lastMessageAt?.slice(0, 10)
  noteLines.push(`메시지 ${conversation.messageCount}건${when ? ` · 최근 ${when}` : ""}`)

  return {
    name,
    email,
    phone,
    source: CHANNEL_TALK_LEAD_SOURCE,
    source_detail: "채널톡 상담",
    message: conversation.firstQuestion?.trim() || undefined,
    notes: noteLines.join("\n"),
  }
}

/** 리드 보드 딥링크 — LeadsBoardClient가 ?lead=<id>로 드로어를 자동으로 연다. */
export function leadBoardDeepLink(leadId: string): string {
  return `${LEADS_BOARD_PATH}?lead=${encodeURIComponent(leadId)}`
}
