/**
 * 내부 CS 미해결 신호 → 보강 큐(question_clusters) 유입.
 *
 * 훅 2곳에서 호출된다:
 * - generate 라우트: 검색된 근거가 하나도 없어 지식이 모자란 질문 (internal_cs_fallback). 모델 호출이 실패한 요청은
 *   지식 공백이 아니라 장애라서 넣지 않는다(shouldIngestInternalCsGap). 키·한도·시간 초과로 하루 종일 실패하면
 *   무관한 질문이 보강 큐를 채우던 문제를 막는다.
 * - 메시지 검토 PATCH: 수정 요청(changes_requested) 전이 시 (internal_cs_review)
 *
 * 유입은 side-effect 다 — 본 흐름(생성/검토 응답)을 절대 막지 않기 위해 이 함수는 throw 하지 않고,
 * 실패는 console.error 로만 관측한다 (무음 .catch(() => null) 금지 원칙).
 * 내부 질문에는 고객 실명·연락처가 섞일 수 있어 공개 챗봇과 동일한 redaction 을 유입 전에 적용한다.
 */

import "server-only"

import { redactPii, upsertQuestionCluster } from "@/lib/chatbot/service"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type InternalCsGapSource = "internal_cs_fallback" | "internal_cs_review"

// 공개 챗봇 질문 상한(MAX_MESSAGE_LENGTH)과 동일 — canonical_question 이 무한정 길어지지 않게 한다.
const MAX_GAP_QUESTION_LENGTH = 1_000

/**
 * generate 결과가 지식 공백 신호인지. 모델 호출이 하나라도 실패했으면(failureKinds 가 비어 있지 않으면) 장애이므로 넣지 않고,
 * 재검토(rerun)는 같은 질문이 이미 들어갔으므로 넣지 않는다. 검색 근거가 없을 때만 넣는다.
 */
export function shouldIngestInternalCsGap(input: {
  failureKinds: readonly string[]
  evidenceNone: boolean
  isRerun?: boolean
}) {
  return input.failureKinds.length === 0 && input.evidenceNone && input.isRerun !== true
}

export async function ingestInternalCsGap(input: {
  question: string
  conversationId: string
  messageId: string
  source: InternalCsGapSource
}): Promise<void> {
  try {
    // 공개 챗봇 normalizeQuestion 과 같은 순서: 공백 정규화 → PII redaction.
    const canonical = redactPii(input.question.replace(/\s+/g, " ").trim()).slice(
      0,
      MAX_GAP_QUESTION_LENGTH
    )
    const conversationId = input.conversationId.trim()
    const messageId = input.messageId.trim()
    if (!canonical || !conversationId || !messageId) return

    const supabase = createSupabaseAdminClient()
    await upsertQuestionCluster(supabase, null, { redacted: canonical }, null, null, {
      source: input.source,
      internalCsRef: { conversationId, messageId },
    })
  } catch (error) {
    console.error(
      `[internal-cs] failed to ingest gap into question_clusters (conversation ${input.conversationId}, message ${input.messageId}):`,
      error instanceof Error ? error.message : error
    )
  }
}
