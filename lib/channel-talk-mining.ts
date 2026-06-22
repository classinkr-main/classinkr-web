/**
 * 채널톡 상담 → 챗봇 FAQ/골든셋 플라이휠.
 *
 * 동기화된 상담의 첫 고객 질문을 정규화·군집화해, 챗봇 골든셋이 아직 다루지 않는
 * 자주 묻는 질문을 빈도순으로 제안한다. 자동 저장하지 않는다(어드민이 검토 후 반영).
 * 순수 함수 — 오프라인/테스트 가능.
 */

import type { ChannelConversationRecord } from "@/lib/repositories/channel-conversations"

export interface FaqSuggestion {
  question: string
  normalizedQuestion: string
  count: number
  sampleConversationIds: string[]
  coveredByGoldenSet: boolean
  lastAskedAt?: string
}

const MENU_OR_ROUTING_LABEL_RE =
  /^(?:[👩💁💚📝🔎🏠❓🖐️🛠\s]*)?(고객\s*성공\s*매니저(?:에게|와)?\s*(?:문의하기|채팅\s*연결)|기술지원\s*cs\s*문의|도입\s*문의|활용\s*사례\s*구경해보기|첫\s*화면으로\s*돌아가기|자주\s*묻는\s*질문|궁금한게\s*더\s*있어요|클래스인\s*어떤\s*서비스인가요|강사에요|관리자에요|안내|신청합니다|네|넵|네네|넵넵|감사합니다|정상\s*로그인됐어요)[.!?\s]*$/i
const CONTACT_ONLY_RE =
  /^(?:\+?\d[\d\s().-]{7,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|[a-z]?\d{4,}|[a-z0-9]{4,})$/i
const PASSWORD_RESET_RE =
  /비밀번호.{0,12}(변경|재설정|설정).{0,12}(부탁|해주세요|요청)|재설정\s*비밀번호|a12345/i

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/재설정\s*비밀번호\s*[:：]?\s*\S+/gi, "재설정 비밀번호 [redacted]")
}

function isLikelyNoise(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim()
  const normalized = normalizeQuestion(compact)
  if (compact.length < 6) return true
  if (MENU_OR_ROUTING_LABEL_RE.test(compact)) return true
  if (/고객\s*성공\s*매니저|기술지원\s*cs\s*문의|도입\s*문의|자주\s*묻는\s*질문|첫\s*화면으로\s*돌아가기/.test(normalized)) {
    return true
  }
  if (/^\[(phone|email)\]$/i.test(compact)) return true
  if (CONTACT_ONLY_RE.test(compact)) return true
  if (PASSWORD_RESET_RE.test(compact)) return true
  return false
}

function getConversationCandidates(conversation: ChannelConversationRecord) {
  const candidates: { question: string; at?: string }[] = []

  for (const message of conversation.transcript ?? []) {
    if (message.author !== "customer") continue
    const redacted = redactSensitiveText(message.text).trim()
    if (isLikelyNoise(redacted)) continue
    candidates.push({ question: redacted, at: message.at })
  }

  if (candidates.length === 0 && conversation.firstQuestion) {
    const redacted = redactSensitiveText(conversation.firstQuestion).trim()
    if (!isLikelyNoise(redacted)) {
      candidates.push({ question: redacted, at: conversation.firstAskedAt })
    }
  }

  return candidates
}

export function mineFaqSuggestions(
  conversations: ChannelConversationRecord[],
  goldenQuestions: string[],
  options: { minCount?: number; limit?: number } = {}
): FaqSuggestion[] {
  const minCount = options.minCount ?? 2
  const limit = options.limit ?? 20

  const goldenSet = new Set(goldenQuestions.map(normalizeQuestion).filter(Boolean))

  const clusters = new Map<
    string,
    { question: string; ids: Set<string>; lastAskedAt?: string }
  >()

  for (const conversation of conversations) {
    for (const candidate of getConversationCandidates(conversation)) {
      const normalized = normalizeQuestion(candidate.question)
      if (!normalized) continue

      const existing = clusters.get(normalized)
      if (existing) {
        existing.ids.add(conversation.id)
        if (
          candidate.at &&
          (!existing.lastAskedAt || candidate.at > existing.lastAskedAt)
        ) {
          existing.lastAskedAt = candidate.at
        }
      } else {
        clusters.set(normalized, {
          question: candidate.question,
          ids: new Set([conversation.id]),
          lastAskedAt: candidate.at,
        })
      }
    }
  }

  return [...clusters.entries()]
    .map(([normalized, value]) => ({
      question: value.question,
      normalizedQuestion: normalized,
      count: value.ids.size,
      sampleConversationIds: [...value.ids].slice(0, 5),
      coveredByGoldenSet: goldenSet.has(normalized),
      lastAskedAt: value.lastAskedAt,
    }))
    .filter((suggestion) => suggestion.count >= minCount && !suggestion.coveredByGoldenSet)
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return (right.lastAskedAt ?? "").localeCompare(left.lastAskedAt ?? "")
    })
    .slice(0, limit)
}
