import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ChannelConversationRecord } from "@/lib/repositories/channel-conversations"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  listDurableConversations: vi.fn(),
  getConversations: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin: mocks.verifyAdmin,
}))

vi.mock("@/lib/repositories/channel-conversations", () => ({
  listDurableConversations: mocks.listDurableConversations,
  getConversations: mocks.getConversations,
}))

import { GET } from "@/app/api/admin/channel-talk/mine/route"

function conversation(id: string, symptom: string): ChannelConversationRecord {
  return {
    id,
    userChatId: id,
    state: "closed",
    tags: [],
    messageCount: 1,
    firstQuestion: symptom,
    firstAskedAt: "2026-08-06T06:00:00.000Z",
    lastMessageAt: "2026-08-06T06:00:00.000Z",
    syncedAt: "2026-08-06T06:05:00.000Z",
    transcript: [
      {
        id: `${id}-m1`,
        author: "customer",
        text: symptom,
        at: "2026-08-06T06:00:00.000Z",
      },
    ],
  }
}

function request() {
  return new NextRequest("https://classin.kr/api/admin/channel-talk/mine")
}

beforeEach(() => {
  mocks.verifyAdmin.mockReset()
  mocks.listDurableConversations.mockReset()
  mocks.getConversations.mockReset()
  mocks.verifyAdmin.mockResolvedValue(null)
})
describe("GET /api/admin/channel-talk/mine", () => {
  it("uses durable Supabase conversations before local JSON", async () => {
    mocks.listDurableConversations.mockResolvedValue([
      conversation("durable-chat", "학생이 1강 다시보기가 안 떠요"),
    ])
    mocks.getConversations.mockReturnValue([
      conversation("local-chat", "아이폰에서 숙제가 깨져 보여요"),
    ])

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.source).toBe("supabase")
    expect(body.rootCauseCandidates).toHaveLength(1)
    expect(body.rootCauseCandidates[0]).toMatchObject({
      conversationId: "durable-chat",
      ruleId: "late_joiner_replay",
    })
    expect(mocks.getConversations).not.toHaveBeenCalled()
  })

  it("falls back to local JSON when durable storage is unavailable", async () => {
    mocks.listDurableConversations.mockResolvedValue(null)
    mocks.getConversations.mockReturnValue([
      conversation("local-chat", "아이폰에서 숙제가 깨져 보여요"),
    ])

    const response = await GET(request())
    const body = await response.json()

    expect(body.source).toBe("local_json")
    expect(body.rootCauseCandidates[0]).toMatchObject({
      conversationId: "local-chat",
      ruleId: "homework_rendering",
    })
    expect(mocks.getConversations).toHaveBeenCalledTimes(1)
  })

  it("returns the admin authentication response without reading conversations", async () => {
    mocks.verifyAdmin.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    )

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mocks.listDurableConversations).not.toHaveBeenCalled()
    expect(mocks.getConversations).not.toHaveBeenCalled()
  })
})
