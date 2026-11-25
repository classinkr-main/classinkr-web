/**
 * 승인 경계 판정(IC-01·IC-04). 승인 라우트(PATCH …/messages/[messageId])와 지식 승격 라우트가 같은 규칙을 쓴다.
 *
 * - 즉시 승인(⚡) 경로가 붙이는 quick_approved 라벨: 확인 3종과 따로 쓴 고객 문안 없이 AI 원문을 최종본으로
 *   저장하던 경로라 승인으로 받지 않고, 이미 저장된 행은 지식으로 승격하지 않는다.
 * - 교정본이 AI 원문과 같음(공백 차이만): 검토 없이 원문을 내보낸 것으로 본다.
 */
export const QUICK_APPROVED_LABEL = "quick_approved"

/** 비교용 정규화: 공백 종류·개수 차이는 같은 글로 본다. */
export function normalizeReviewText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

export function isSameAsOriginal(correctedContent: string | null | undefined, originalContent: string | null | undefined) {
  return normalizeReviewText(correctedContent) === normalizeReviewText(originalContent)
}

export function hasQuickApprovedLabel(labels: unknown) {
  return Array.isArray(labels) && labels.includes(QUICK_APPROVED_LABEL)
}
