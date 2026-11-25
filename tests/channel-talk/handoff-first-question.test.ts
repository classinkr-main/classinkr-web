import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 내부 점검 handoff-1: 챗봇이 만든 상담방은 첫 글이 봇의 "[챗봇 상담 전환]" 글이라 고객 글이 없어 Inbox 의 "첫 질문"이 비었다.
// 동기화가 그 글의 [고객 질문]을 대체값으로 쓰는지 본다(새 형식·옛 형식). 목 구성은 channel-talk-sync.test.ts 와 같다.
const mocks = vi.hoisted(() => ({
  isChannelApiConfigured: vi.fn(() => true),
  listUserChats: vi.fn(),
  listUserChatMessages: vi.fn(),
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
  listUserChatMessages: mocks.listUserChatMessages,
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
import { formatHandoffMessage } from "@/lib/chatbot/channel-handoff"

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
  mocks.listUserChatMessages.mockResolvedValue({
    messages: [],
    pagesFetched: 1,
    complete: true,
  })
  mocks.replaceConversationChunks.mockImplementation(async (_id: string, chunks: unknown[]) => ({
    written: (chunks as unknown[]).length,
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

const OLD_FORMAT = [
  "[챗봇 상담 전환]",
  "",
  "전환 사유: needs_handoff",
  "문의 유형: billing / billing_support",
  "",
  "[고객 질문]",
  "환불은 어떻게 하나요?",
  "",
  "[AI 답변]",
  "담당자가 안내해 드려요.",
].join("\n")

const NEW_FORMAT = formatHandoffMessage(
  {
    answerEventId: "e-1",
    sessionId: "s-1",
    question: "전자칠판 견적 받을 수 있나요?",
    answer: "담당자가 안내해 드려요.",
    answerMode: "handoff",
    confidence: 0.4,
    unresolved: false,
    needsHandoff: true,
    handoffIntent: "demo",
    sources: [],
  },
  ["needs_handoff"]
)

async function syncOne(messages: Array<{ id: string; personType: string; plainText: string; createdAt: number }>) {
  mocks.listUserChats.mockResolvedValue({
    userChats: [{ id: "chat-h", state: "opened", openedAt: 100, frontMessageId: messages.at(-1)?.id }],
    users: [],
    complete: true,
  })
  mocks.getDurableConversationsByIds.mockResolvedValue(new Map())
  mocks.listUserChatMessages.mockResolvedValue({ messages, pagesFetched: 1, complete: true })
  await syncChannelConversations({ force: true, state: "opened" })
  const [records] = mocks.upsertDurableConversations.mock.calls[0] as [ChannelConversationRecord[]]
  return records[0]
}

describe("syncChannelConversations — 챗봇 상담 전환 글의 첫 질문", () => {
  it("고객 글이 없으면 새 형식 전환 글의 [고객 질문]을 첫 질문으로 쓴다", async () => {
    const record = await syncOne([{ id: "b1", personType: "bot", plainText: NEW_FORMAT, createdAt: 100 }])
    expect(record.firstQuestion).toBe("전자칠판 견적 받을 수 있나요?")
  })

  it("옛 형식 전환 글에서도 고객 질문을 읽는다", async () => {
    const record = await syncOne([{ id: "b1", personType: "bot", plainText: OLD_FORMAT, createdAt: 100 }])
    expect(record.firstQuestion).toBe("환불은 어떻게 하나요?")
  })

  it("고객이 직접 쓴 글이 있으면 그 글이 우선이다", async () => {
    const record = await syncOne([
      { id: "b1", personType: "bot", plainText: NEW_FORMAT, createdAt: 100 },
      { id: "u1", personType: "user", plainText: "추가로 여쭤요", createdAt: 200 },
    ])
    expect(record.firstQuestion).toBe("추가로 여쭤요")
  })

  it("전환 글이 아닌 봇 글뿐이면 비워 둔다(지금 동작)", async () => {
    const record = await syncOne([{ id: "b1", personType: "bot", plainText: "운영 시간 안내", createdAt: 100 }])
    expect(record.firstQuestion).toBeUndefined()
  })
})
