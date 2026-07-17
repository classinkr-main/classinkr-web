import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}))

import {
  buildConversationChunkInputs,
  channelConversationsSupabaseEnabled,
  getDurableConversationsByIds,
  getDurableConversationSyncMeta,
  replaceConversationChunks,
  upsertDurableConversations,
  type ChannelConversationMessage,
  type ChannelConversationRecord,
  listDurableConversations,
} from "@/lib/repositories/channel-conversations"

const SUPABASE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CHANNEL_TALK_CONVERSATIONS_FILE",
] as const

const originalEnv: Record<string, string | undefined> = {}

function enableSupabase() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test"
  process.env.SUPABASE_SECRET_KEY = "secret-test"
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
}

function disableSupabase() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  delete process.env.SUPABASE_SECRET_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  // 존재하지 않는 스크래치 파일 → JSON readAll 은 [] 를 돌려준다(실제 data 파일 격리).
  process.env.CHANNEL_TALK_CONVERSATIONS_FILE = "__vitest_channel_conversations_absent.json"
}

beforeEach(() => {
  for (const key of SUPABASE_ENV_KEYS) originalEnv[key] = process.env[key]
  createSupabaseAdminClient.mockReset()
  vi.restoreAllMocks()
})

afterEach(() => {
  for (const key of SUPABASE_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

function message(
  author: ChannelConversationMessage["author"],
  text: string,
  at = "2026-07-16T01:00:00.000Z"
): ChannelConversationMessage {
  return { id: `${author}-${text.slice(0, 4)}`, author, text, at }
}

describe("channelConversationsSupabaseEnabled", () => {
  it("is true only when url + publishable + a secret key are all present", () => {
    expect(
      channelConversationsSupabaseEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "u",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p",
        SUPABASE_SECRET_KEY: "s",
      })
    ).toBe(true)

    expect(
      channelConversationsSupabaseEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "u",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p",
        SUPABASE_SERVICE_ROLE_KEY: "sr",
      })
    ).toBe(true)
  })

  it("is false when any required key is missing", () => {
    expect(channelConversationsSupabaseEnabled({})).toBe(false)
    expect(
      channelConversationsSupabaseEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "u",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p",
      })
    ).toBe(false)
  })
})

describe("buildConversationChunkInputs", () => {
  it("groups consecutive same-author turns, skips bot, labels role, sequences seq", () => {
    const transcript: ChannelConversationMessage[] = [
      message("customer", "안녕하세요"),
      message("customer", "견적 문의합니다"),
      message("agent", "네 안내드릴게요"),
      message("bot", "💁 고객 성공 매니저와 채팅 연결"),
      message("customer", "감사합니다"),
    ]

    const chunks = buildConversationChunkInputs(transcript, (value) => value)

    expect(chunks).toEqual([
      { seq: 0, content: "고객: 안녕하세요 견적 문의합니다", category: null },
      { seq: 1, content: "상담원: 네 안내드릴게요", category: null },
      { seq: 2, content: "고객: 감사합니다", category: null },
    ])
  })

  it("routes chunk content through the injected redactor", () => {
    const transcript: ChannelConversationMessage[] = [
      message("customer", "제 번호는 010-1234-5678 입니다"),
    ]

    const redact = vi.fn((value: string) => value.replace(/010-\d{4}-\d{4}/g, "[phone]"))
    const chunks = buildConversationChunkInputs(transcript, redact)

    expect(redact).toHaveBeenCalled()
    expect(chunks[0].content).toBe("고객: 제 번호는 [phone] 입니다")
    expect(chunks[0].content).not.toContain("010-1234-5678")
  })

  it("category is always null until the topic crosswalk is wired (T2)", () => {
    const chunks = buildConversationChunkInputs([message("customer", "결제 문의")], (v) => v)
    expect(chunks.every((chunk) => chunk.category === null)).toBe(true)
  })

  it("drops turns that are empty after trimming", () => {
    const transcript: ChannelConversationMessage[] = [
      message("customer", "   "),
      message("agent", "실제 답변"),
    ]
    const chunks = buildConversationChunkInputs(transcript, (v) => v)
    expect(chunks).toEqual([{ seq: 0, content: "상담원: 실제 답변", category: null }])
  })
})

describe("getDurableConversationsByIds", () => {
  it("returns an empty map without querying for empty ids", async () => {
    enableSupabase()
    const result = await getDurableConversationsByIds([])
    expect(result.size).toBe(0)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("reads from Supabase first and maps rows into records", async () => {
    enableSupabase()
    const inFn = vi.fn(() => ({
      data: [
        {
          id: "chat-1",
          name: "김원장",
          email: null,
          phone: null,
          state: "opened",
          tags: ["결제"],
          first_question: "견적 문의",
          matched_lead_id: "lead-1",
          matched_org: "행복학원",
          last_message_at: "2026-07-16T02:00:00.000Z",
          transcript: [
            { id: "m1", author: "customer", text: "견적 문의", at: "2026-07-16T01:00:00.000Z" },
            { id: "m2", author: "agent", text: "안내드릴게요", at: "2026-07-16T01:01:00.000Z" },
          ],
          synced_at: "2026-07-16T02:05:00.000Z",
        },
      ],
      error: null,
    }))
    const select = vi.fn(() => ({ in: inFn }))
    const from = vi.fn(() => ({ select }))
    createSupabaseAdminClient.mockReturnValue({ from })

    const result = await getDurableConversationsByIds(["chat-1"])

    expect(from).toHaveBeenCalledWith("channel_conversations")
    expect(inFn).toHaveBeenCalledWith("id", ["chat-1"])
    const record = result.get("chat-1")
    expect(record).toBeDefined()
    expect(record?.userChatId).toBe("chat-1")
    expect(record?.messageCount).toBe(2)
    expect(record?.firstQuestion).toBe("견적 문의")
    expect(record?.firstAskedAt).toBe("2026-07-16T01:00:00.000Z")
    expect(record?.lastMessageText).toBe("안내드릴게요")
    expect(record?.matchedLeadId).toBe("lead-1")
    expect(record?.matchedLeadOrg).toBe("행복학원")
  })

  it("falls back to JSON (no Supabase call) when unconfigured", async () => {
    disableSupabase()
    const result = await getDurableConversationsByIds(["chat-1"])
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it("falls back to JSON and never throws on a Supabase error", async () => {
    enableSupabase()
    process.env.CHANNEL_TALK_CONVERSATIONS_FILE = "__vitest_channel_conversations_absent.json"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const inFn = vi.fn(() => ({ data: null, error: { message: "rls denied" } }))
    const select = vi.fn(() => ({ in: inFn }))
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const result = await getDurableConversationsByIds(["chat-1"])

    expect(createSupabaseAdminClient).toHaveBeenCalled()
    expect(result.size).toBe(0)
    expect(warn).toHaveBeenCalled()
  })
})

// 어드민 탭 읽기 경로(durable 우선) — 목록 전체를 최신 응답 순으로 읽고, 미설정/실패 시 null 을
// 돌려 호출자(라우트)가 레거시 JSON 으로 폴백하게 한다.
describe("listDurableConversations", () => {
  it("reads the full list from Supabase ordered by last_message_at desc", async () => {
    enableSupabase()
    const limitFn = vi.fn(() => ({
      data: [
        {
          id: "chat-2",
          name: null,
          email: null,
          phone: null,
          state: "opened",
          tags: ["잠재고객/도입문의"],
          first_question: "도입 문의",
          matched_lead_id: null,
          matched_org: null,
          last_message_at: "2026-07-17T02:00:00.000Z",
          transcript: [],
          synced_at: "2026-07-17T02:05:00.000Z",
        },
      ],
      error: null,
    }))
    const order = vi.fn(() => ({ limit: limitFn }))
    const select = vi.fn(() => ({ order }))
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const records = await listDurableConversations(300)

    expect(order).toHaveBeenCalledWith("last_message_at", { ascending: false, nullsFirst: false })
    expect(limitFn).toHaveBeenCalledWith(300)
    expect(records).toHaveLength(1)
    expect(records?.[0]?.id).toBe("chat-2")
    expect(records?.[0]?.tags).toEqual(["잠재고객/도입문의"])
  })

  it("returns null when Supabase is unconfigured", async () => {
    disableSupabase()
    const records = await listDurableConversations()
    expect(records).toBeNull()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("returns null (with a warning) on a Supabase error so the caller can fall back", async () => {
    enableSupabase()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const limitFn = vi.fn(() => ({ data: null, error: { message: "rls denied" } }))
    const order = vi.fn(() => ({ limit: limitFn }))
    const select = vi.fn(() => ({ order }))
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const records = await listDurableConversations()

    expect(records).toBeNull()
    expect(warn).toHaveBeenCalled()
  })
})

describe("upsertDurableConversations", () => {
  const record: ChannelConversationRecord = {
    id: "chat-1",
    userChatId: "chat-1",
    state: "opened",
    tags: ["결제"],
    messageCount: 1,
    firstQuestion: "견적 문의",
    lastMessageAt: "2026-07-16T02:00:00.000Z",
    matchedLeadId: "lead-1",
    matchedLeadOrg: "행복학원",
    syncedAt: "2026-07-16T02:05:00.000Z",
    transcript: [{ id: "m1", author: "customer", text: "견적 문의", at: "2026-07-16T01:00:00.000Z" }],
  }

  it("upserts mapped rows to Supabase with onConflict id", async () => {
    enableSupabase()
    const upsert = vi.fn((_payload: Record<string, unknown>[], _options?: { onConflict?: string }) => ({
      error: null,
    }))
    const from = vi.fn(() => ({ upsert }))
    createSupabaseAdminClient.mockReturnValue({ from })

    const result = await upsertDurableConversations([record])

    expect(from).toHaveBeenCalledWith("channel_conversations")
    expect(upsert.mock.calls[0]?.[1]).toEqual({ onConflict: "id" })
    expect(upsert.mock.calls[0]?.[0]?.[0]).toMatchObject({
      id: "chat-1",
      matched_lead_id: "lead-1",
      matched_org: "행복학원",
      first_question: "견적 문의",
      synced_at: "2026-07-16T02:05:00.000Z",
    })
    expect(result).toEqual({ upserted: 1 })
  })

  it("returns 0 without querying for an empty batch", async () => {
    enableSupabase()
    const result = await upsertDurableConversations([])
    expect(result).toEqual({ upserted: 0 })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})

describe("replaceConversationChunks", () => {
  it("is a no-op (written 0) and does not touch Supabase when unconfigured", async () => {
    disableSupabase()
    const result = await replaceConversationChunks("chat-1", [
      { seq: 0, content: "고객: 문의", category: null },
    ])
    expect(result).toEqual({ written: 0 })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("deletes existing chunks then inserts the new ones with null embedding", async () => {
    enableSupabase()
    const eq = vi.fn(() => ({ error: null }))
    const del = vi.fn(() => ({ eq }))
    const insert = vi.fn((_payload: Record<string, unknown>[]) => ({ error: null }))
    const from = vi.fn(() => ({ delete: del, insert }))
    createSupabaseAdminClient.mockReturnValue({ from })

    const result = await replaceConversationChunks("chat-1", [
      { seq: 0, content: "고객: 문의", category: null },
      { seq: 1, content: "상담원: 답변", category: "billing" },
    ])

    expect(from).toHaveBeenCalledWith("channel_conversation_chunks")
    expect(eq).toHaveBeenCalledWith("conversation_id", "chat-1")
    const payload = insert.mock.calls[0]?.[0] ?? []
    expect(payload).toHaveLength(2)
    expect(payload[0]).toEqual({
      conversation_id: "chat-1",
      seq: 0,
      content: "고객: 문의",
      category: null,
      embedding: null,
    })
    expect(payload[1]).toMatchObject({ seq: 1, category: "billing", embedding: null })
    expect(result).toEqual({ written: 2 })
  })

  it("deletes but does not insert when there are no chunks", async () => {
    enableSupabase()
    const eq = vi.fn(() => ({ error: null }))
    const del = vi.fn(() => ({ eq }))
    const insert = vi.fn(() => ({ error: null }))
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ delete: del, insert })) })

    const result = await replaceConversationChunks("chat-1", [])

    expect(del).toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
    expect(result).toEqual({ written: 0 })
  })
})

describe("getDurableConversationSyncMeta", () => {
  it("computes lastSyncedAt(max), matchedLeads, total from Supabase", async () => {
    enableSupabase()
    const select = vi.fn(() => ({
      data: [
        { synced_at: "2026-07-16T01:00:00.000Z", matched_lead_id: "lead-1" },
        { synced_at: "2026-07-16T03:00:00.000Z", matched_lead_id: null },
        { synced_at: "2026-07-16T02:00:00.000Z", matched_lead_id: "lead-2" },
      ],
      error: null,
    }))
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const meta = await getDurableConversationSyncMeta()

    expect(select).toHaveBeenCalledWith("synced_at, matched_lead_id")
    expect(meta).toEqual({
      lastSyncedAt: "2026-07-16T03:00:00.000Z",
      matchedLeads: 2,
      total: 3,
    })
  })

  it("falls back to JSON meta when unconfigured", async () => {
    disableSupabase()
    const meta = await getDurableConversationSyncMeta()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(meta).toEqual({ lastSyncedAt: null, matchedLeads: 0, total: 0 })
  })
})
