import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 채널톡 API·리드·알림은 스텁, 상담 저장소는 순수 헬퍼(buildConversationChunkInputs)는 실제,
// IO(durable 함수)만 스파이로 교체한다. redactPii 가 청크에 실제로 적용되는지 검증한다.
const mocks = vi.hoisted(() => ({
  isChannelApiConfigured: vi.fn(() => true),
  listUserChats: vi.fn(),
  getUserChatMessages: vi.fn(),
  extractUserContact: vi.fn(() => ({})),
  getLeads: vi.fn(async () => []),
  emitNotificationEvent: vi.fn(async () => {}),
  getDurableConversationsByIds: vi.fn(),
  getDurableConversationSyncMeta: vi.fn(async () => ({
    lastSyncedAt: null as string | null,
    matchedLeads: 0,
    total: 0,
  })),
  upsertDurableConversations: vi.fn(async (records: unknown[]) => ({ upserted: records.length })),
  replaceConversationChunks: vi.fn(async (_id: string, chunks: unknown[]) => ({ written: chunks.length })),
  redactPii: vi.fn((value: string) => value.replace(/010-\d{4}-\d{4}/g, "[phone]")),
}))

vi.mock("@/lib/channel-talk-api", () => ({
  isChannelApiConfigured: mocks.isChannelApiConfigured,
  listUserChats: mocks.listUserChats,
  getUserChatMessages: mocks.getUserChatMessages,
  extractUserContact: mocks.extractUserContact,
}))

vi.mock("@/lib/repositories/leads", () => ({
  getLeads: mocks.getLeads,
}))

vi.mock("@/lib/notifications/emit-event", () => ({
  emitNotificationEvent: mocks.emitNotificationEvent,
}))

vi.mock("@/lib/chatbot/service", () => ({
  redactPii: mocks.redactPii,
}))

vi.mock("@/lib/repositories/channel-conversations", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/repositories/channel-conversations")>()
  return {
    ...actual,
    getDurableConversationsByIds: mocks.getDurableConversationsByIds,
    getDurableConversationSyncMeta: mocks.getDurableConversationSyncMeta,
    upsertDurableConversations: mocks.upsertDurableConversations,
    replaceConversationChunks: mocks.replaceConversationChunks,
  }
})

import { syncChannelConversations } from "@/lib/channel-talk-sync"
import type { ChannelConversationRecord } from "@/lib/repositories/channel-conversations"

beforeEach(() => {
  for (const spy of Object.values(mocks)) spy.mockClear()
  mocks.isChannelApiConfigured.mockReturnValue(true)
  mocks.extractUserContact.mockReturnValue({})
  mocks.getDurableConversationSyncMeta.mockResolvedValue({
    lastSyncedAt: null,
    matchedLeads: 0,
    total: 0,
  })
  mocks.upsertDurableConversations.mockImplementation(async (records: unknown[]) => ({
    upserted: (records as unknown[]).length,
  }))
  mocks.replaceConversationChunks.mockImplementation(async (_id: string, chunks: unknown[]) => ({
    written: (chunks as unknown[]).length,
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("syncChannelConversations — 상담 청크 재생성", () => {
  it("트랜스크립트가 새로 온 대화만 청크를 재생성하고 redactPii 를 적용한다", async () => {
    mocks.listUserChats.mockResolvedValue({
      userChats: [
        { id: "chatA", userId: "uA", frontMessageId: "a2", state: "opened", tags: ["결제"] },
        { id: "chatB", userId: "uB", frontMessageId: "b1", state: "opened", tags: [] },
      ],
      users: [
        { id: "uA", name: "김원장" },
        { id: "uB", name: "이원장" },
      ],
    })

    // chatB 는 기존 트랜스크립트의 마지막 메시지 id 가 frontMessageId(b1)와 같아 재사용 → 청크 재생성 없음.
    const existing = new Map<string, ChannelConversationRecord>([
      [
        "chatB",
        {
          id: "chatB",
          userChatId: "chatB",
          state: "opened",
          tags: [],
          messageCount: 1,
          transcript: [{ id: "b1", author: "customer", text: "기존 질문", at: "2026-07-15T00:00:00.000Z" }],
          syncedAt: "2026-07-15T00:00:00.000Z",
        },
      ],
    ])
    mocks.getDurableConversationsByIds.mockResolvedValue(existing)

    // chatA(신규)만 메시지를 새로 받는다.
    mocks.getUserChatMessages.mockResolvedValue([
      { id: "a1", personType: "user", plainText: "제 번호는 010-1234-5678", createdAt: 1_700_000_000_000 },
      { id: "a2", personType: "manager", plainText: "확인했습니다", createdAt: 1_700_000_060_000 },
    ])

    const result = await syncChannelConversations({ force: true })

    // chatA 만 메시지 페치 + 청크 재생성. chatB 는 재사용.
    expect(mocks.getUserChatMessages).toHaveBeenCalledTimes(1)
    expect(mocks.getUserChatMessages).toHaveBeenCalledWith("chatA", expect.anything())
    expect(result.reusedTranscripts).toBe(1)
    expect(result.newConversations).toBe(1)

    expect(mocks.replaceConversationChunks).toHaveBeenCalledTimes(1)
    const [conversationId, chunks] = mocks.replaceConversationChunks.mock.calls[0] as [
      string,
      { seq: number; content: string; category: string | null }[],
    ]
    expect(conversationId).toBe("chatA")
    expect(chunks).toEqual([
      { seq: 0, content: "고객: 제 번호는 [phone]", category: null },
      { seq: 1, content: "상담원: 확인했습니다", category: null },
    ])
    expect(mocks.redactPii).toHaveBeenCalled()
    expect(result.chunksRewritten).toBe(2)
  })

  it("모든 상담을 durable 저장소로 upsert 한다", async () => {
    mocks.listUserChats.mockResolvedValue({
      userChats: [{ id: "chatA", userId: "uA", frontMessageId: "a1", state: "opened", tags: [] }],
      users: [{ id: "uA", name: "김원장" }],
    })
    mocks.getDurableConversationsByIds.mockResolvedValue(new Map())
    mocks.getUserChatMessages.mockResolvedValue([
      { id: "a1", personType: "user", plainText: "질문", createdAt: 1_700_000_000_000 },
    ])

    const result = await syncChannelConversations({ force: true })

    expect(mocks.upsertDurableConversations).toHaveBeenCalledTimes(1)
    const [records] = mocks.upsertDurableConversations.mock.calls[0] as [ChannelConversationRecord[]]
    expect(records).toHaveLength(1)
    expect(records[0].id).toBe("chatA")
    expect(result.upserted).toBe(1)
    expect(result.ok).toBe(true)
  })

  it("durable upsert 실패는 무음 유실 대신 경고 결과로 표면화한다", async () => {
    mocks.listUserChats.mockResolvedValue({
      userChats: [{ id: "chatA", userId: "uA", frontMessageId: "a1", state: "opened", tags: [] }],
      users: [{ id: "uA", name: "김원장" }],
    })
    mocks.getDurableConversationsByIds.mockResolvedValue(new Map())
    mocks.getUserChatMessages.mockResolvedValue([
      { id: "a1", personType: "user", plainText: "질문", createdAt: 1_700_000_000_000 },
    ])
    mocks.upsertDurableConversations.mockRejectedValue(new Error("저장소 오류"))

    const result = await syncChannelConversations({ force: true })

    expect(result.ok).toBe(false)
    expect(result.warning).toBe("저장소 오류")
    expect(mocks.replaceConversationChunks).not.toHaveBeenCalled()
  })
})
