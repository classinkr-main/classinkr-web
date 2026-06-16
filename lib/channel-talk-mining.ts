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

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
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
    const question = conversation.firstQuestion?.trim()
    if (!question || question.length < 6) continue

    const normalized = normalizeQuestion(question)
    if (!normalized) continue

    const existing = clusters.get(normalized)
    if (existing) {
      existing.ids.add(conversation.id)
      if (
        conversation.firstAskedAt &&
        (!existing.lastAskedAt || conversation.firstAskedAt > existing.lastAskedAt)
      ) {
        existing.lastAskedAt = conversation.firstAskedAt
      }
    } else {
      clusters.set(normalized, {
        question,
        ids: new Set([conversation.id]),
        lastAskedAt: conversation.firstAskedAt,
      })
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
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
}
