/**
 * 승인 경계 판정(IC-01·IC-04). 승인 라우트(PATCH …/messages/[messageId])와 지식 승격 라우트가 같은 규칙을 쓴다.
 *
 * - 즉시 승인(⚡) 경로가 붙이는 quick_approved 라벨: 확인 3종과 따로 쓴 고객 문안 없이 AI 원문을 최종본으로
 *   저장하던 경로라 승인으로 받지 않고, 이미 저장된 행은 지식으로 승격하지 않는다.
 * - 교정본이 AI 원문과 같음(공백 차이만): 검토 없이 원문을 내보낸 것으로 본다.
 */
export const QUICK_APPROVED_LABEL = "quick_approved"

/**
 * 비교용 정규화: 공백·문장부호·기호·폭 없는 문자(\p{Cf})·전각/반각 차이는 같은 글로 본다.
 * 원문에 '.' 하나나 U+200B 하나를 더해 승인 가드를 넘던 길(검토 안전-3)을 막는다. 비교에만 쓰고 저장 글은 바꾸지 않는다.
 */
export function normalizeReviewText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").replace(/[\p{Cf}\p{P}\p{S}\s]+/gu, "")
}

export function isSameAsOriginal(correctedContent: string | null | undefined, originalContent: string | null | undefined) {
  return normalizeReviewText(correctedContent) === normalizeReviewText(originalContent)
}

export function hasQuickApprovedLabel(labels: unknown) {
  return Array.isArray(labels) && labels.includes(QUICK_APPROVED_LABEL)
}

export interface ReviewedAnswerLike {
  role: string
  review_state: string | null
  content: string
  corrected_content?: string | null
  feedback_labels?: unknown
}

/**
 * 사람이 확인해 쓴 승인본인지. 이력(history.ts)·회귀 기준·고객 초안 기준(formatters)이 같은 규칙을 쓴다.
 * 즉시 승인 라벨이 있거나 교정본이 AI 원문과 같으면 승인 상태여도 쓰지 않는다(검토 안전-1).
 */
export function isUsableApprovedAnswer(message: ReviewedAnswerLike) {
  if (message.role !== "assistant" || message.review_state !== "approved") return false
  if (hasQuickApprovedLabel(message.feedback_labels)) return false
  const corrected = message.corrected_content?.trim()
  if (!corrected) return false
  return !isSameAsOriginal(corrected, message.content)
}

/** 승인 상태로 저장됐지만 사람 승인본으로 쓸 수 없는 행(예전 즉시 승인 등). 화면은 '재검토 필요'로 보인다. */
export function needsReReview(message: ReviewedAnswerLike) {
  return message.role === "assistant" && message.review_state === "approved" && !isUsableApprovedAnswer(message)
}
