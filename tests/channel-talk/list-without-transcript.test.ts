import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}))

import { listDurableConversations } from "@/lib/repositories/channel-conversations"

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

function mockSelect(row: Record<string, unknown>) {
  const limitFn = vi.fn(() => ({ data: [row], error: null }))
  const order = vi.fn(() => ({ limit: limitFn }))
  const select = vi.fn((columns: string) => {
    void columns
    return { order }
  })
  createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })) })
  return select
}

describe("listDurableConversations withTranscript option", () => {
  it("excludes transcript from the select column list when withTranscript: false", async () => {
    enableSupabase()
    const select = mockSelect({
      id: "chat-1",
      name: null,
      email: null,
      phone: null,
      state: "opened",
      tags: [],
      first_question: null,
      matched_lead_id: null,
      matched_org: null,
      last_message_at: "2026-07-16T02:00:00.000Z",
      synced_at: "2026-07-16T02:05:00.000Z",
    })

    const records = await listDurableConversations(500, { withTranscript: false })

    const columnArg = select.mock.calls[0]?.[0] as string
    expect(columnArg).not.toMatch(/\btranscript\b/)
    expect(records).toHaveLength(1)
    // 마퍼는 누락된 transcript 를 [] 로 취급한다 (타입 ChannelConversationRecord.transcript 는 배열).
    expect(records?.[0]?.transcript).toEqual([])
    expect(records?.[0]?.messageCount).toBe(0)
  })

  it("includes transcript in the select column list by default", async () => {
    enableSupabase()
    const select = mockSelect({
      id: "chat-2",
      name: null,
      email: null,
      phone: null,
      state: "opened",
      tags: [],
      first_question: null,
      matched_lead_id: null,
      matched_org: null,
      last_message_at: "2026-07-16T02:00:00.000Z",
      transcript: [{ id: "m1", author: "customer", text: "문의", at: "2026-07-16T01:00:00.000Z" }],
      synced_at: "2026-07-16T02:05:00.000Z",
    })

    const records = await listDurableConversations()

    const columnArg = select.mock.calls[0]?.[0] as string
    expect(columnArg).toMatch(/\btranscript\b/)
    expect(records?.[0]?.transcript).toHaveLength(1)
  })
})
