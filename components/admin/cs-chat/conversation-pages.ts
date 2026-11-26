import type { ConversationListResponse, InternalCsConversation } from "./types"

export const CONVERSATION_PAGE_SIZE = 100
// 페이지 상한 — 첫 페이지 + 추가 (상한 - 1)쪽. 넘으면 잘렸음을 호출부가 알린다.
export const CONVERSATION_MAX_PAGES = 10

export interface ConversationPagesResult {
  conversations: InternalCsConversation[]
  total: number
  /** 상한 또는 추가 페이지 조회 실패로 total보다 적게 받았다. */
  incomplete: boolean
  failed: boolean
}

// 첫 페이지(캐시·예열 URL 그대로)를 받은 뒤 pagination.total 까지 offset 으로 이어 받는다.
// 추가 페이지가 실패하면 이미 받은 목록은 유지하고 failed 로 알린다(빈 목록으로 바꾸지 않는다).
export async function fetchRemainingConversationPages(
  first: ConversationListResponse,
  fetchPage: (offset: number) => Promise<ConversationListResponse>,
): Promise<ConversationPagesResult> {
  const byId = new Map<string, InternalCsConversation>()
  for (const item of first.conversations) byId.set(item.id, item)
  const total = first.pagination?.total ?? first.conversations.length
  let pages = 1
  let failed = false
  let lastReturned = first.conversations.length
  while (lastReturned > 0 && byId.size < total && pages < CONVERSATION_MAX_PAGES) {
    try {
      const page = await fetchPage(byId.size)
      pages += 1
      lastReturned = page.conversations.length
      for (const item of page.conversations) byId.set(item.id, item)
    } catch {
      failed = true
      break
    }
  }
  return { conversations: Array.from(byId.values()), total, incomplete: byId.size < total, failed }
}
