/**
 * 견적서 작업 큐 — 견적 한 건이 지금 어느 단계이고 다음에 무엇을 해야 하는지 판정한다.
 * 목록 그룹·상세 타임라인·다음 할 일 버튼이 모두 이 판정 하나를 공유한다.
 *
 * 단계 우선순위: 동의 > 작성 중(상태 정본) > 검토 확인 > 열람 > 발송.
 * - 작성 중(draft/pending_approval)은 공유 링크가 미리 만들어졌어도 '발송'으로 보지 않는다.
 * - 검토 확인은 열람 기록이 없어도(열람 추적 이전 건) 열람보다 뒤 단계로 본다.
 */

export type QuoteStage = 1 | 2 | 3 | 4 | 5

export type QuoteQueueKey = "convert" | "remind" | "send" | "terms" | "close" | "closed"

export type QuoteQueueInput = {
  status: string
  shareCount: number
  shareUrl: string | null
  latestShareCreatedAt: string | null
  viewCount: number
  lastViewedAt: string | null
  reviewConfirmedAt: string | null
  acceptedAt: string | null
}

export const QUOTE_STAGE_LABELS = ["작성", "발송", "열람", "검토 확인", "동의"] as const

/** 그룹 표시 순서 = 처리 우선순위. tone 은 점 색 결정용(warn=주황, go=초록). */
export const QUOTE_QUEUE_GROUPS: Array<{ key: QuoteQueueKey; label: string; tone: "go" | "warn" | "neutral" | "muted" }> = [
  { key: "convert", label: "계약 전환", tone: "go" },
  { key: "remind", label: "열람 리마인드", tone: "warn" },
  { key: "send", label: "검토 후 발송", tone: "warn" },
  { key: "terms", label: "조건 확인", tone: "neutral" },
  { key: "close", label: "동의 요청", tone: "neutral" },
  { key: "closed", label: "만료 · 보관", tone: "muted" },
]

const DAY_MS = 86_400_000

export function isDraftQuoteStatus(status: string) {
  return status === "draft" || status === "pending_approval"
}

export function getQuoteStage(quote: QuoteQueueInput): QuoteStage {
  if (quote.status === "accepted" || quote.acceptedAt) return 5
  if (isDraftQuoteStatus(quote.status)) return 1
  if (quote.reviewConfirmedAt) return 4
  if (quote.lastViewedAt || quote.viewCount > 0) return 3
  if (quote.status === "shared" || quote.shareCount > 0 || quote.shareUrl) return 2
  return 1
}

export function getQuoteQueueKey(quote: QuoteQueueInput): QuoteQueueKey {
  if (quote.status === "expired" || quote.status === "archived") return "closed"

  switch (getQuoteStage(quote)) {
    case 5:
      return "convert"
    case 4:
      return "close"
    case 3:
      return "terms"
    case 2:
      return "remind"
    default:
      return "send"
  }
}

/** 발송 후 미열람 경과 일수 — 발송 단계(2)에서만 의미가 있다. */
export function getQuoteSentDays(quote: QuoteQueueInput, now = Date.now()): number | null {
  if (getQuoteStage(quote) !== 2 || !quote.latestShareCreatedAt) return null
  const sentAt = Date.parse(quote.latestShareCreatedAt)
  if (Number.isNaN(sentAt)) return null
  return Math.max(0, Math.floor((now - sentAt) / DAY_MS))
}
