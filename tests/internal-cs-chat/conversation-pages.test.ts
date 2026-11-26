import { describe, expect, it, vi } from "vitest"

import { fetchRemainingConversationPages } from "@/components/admin/cs-chat/conversation-pages"
import type { ConversationListResponse, InternalCsConversation } from "@/components/admin/cs-chat/types"

const rows = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => ({ id: `c${from + i}`, status: "queue" }) as unknown as InternalCsConversation)
const page = (from: number, to: number, total: number): ConversationListResponse => ({ conversations: rows(from, to), pagination: { total } })

describe("fetchRemainingConversationPages", () => {
  it("첫 100건 뒤의 대화를 pagination.total 까지 offset 으로 이어 받는다", async () => {
    const fetchPage = vi.fn(async (offset: number) => page(offset, Math.min(offset + 100, 250), 250))
    const result = await fetchRemainingConversationPages(page(0, 100, 250), fetchPage)
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([100, 200])
    expect(result.conversations).toHaveLength(250)
    expect(result.incomplete).toBe(false)
  })

  it("한 페이지로 끝나면 추가 요청을 하지 않는다", async () => {
    const fetchPage = vi.fn()
    const result = await fetchRemainingConversationPages(page(0, 30, 30), fetchPage)
    expect(fetchPage).not.toHaveBeenCalled()
    expect(result.incomplete).toBe(false)
  })

  it("추가 페이지 실패 시 받은 목록은 유지하고 불완전·실패로 알린다", async () => {
    const result = await fetchRemainingConversationPages(page(0, 100, 250), async () => { throw new Error("boom") })
    expect(result.conversations).toHaveLength(100)
    expect(result.failed).toBe(true)
    expect(result.incomplete).toBe(true)
  })

  it("페이지 상한(10쪽)을 넘으면 잘렸음을 알린다", async () => {
    const fetchPage = vi.fn(async (offset: number) => page(offset, offset + 100, 5000))
    const result = await fetchRemainingConversationPages(page(0, 100, 5000), fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(9)
    expect(result.conversations).toHaveLength(1000)
    expect(result.incomplete).toBe(true)
    expect(result.total).toBe(5000)
  })
})
