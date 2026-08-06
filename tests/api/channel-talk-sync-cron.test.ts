import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const syncChannelConversations = vi.hoisted(() => vi.fn())

vi.mock("@/lib/channel-talk-sync", () => ({
  syncChannelConversations,
}))

import { GET } from "@/app/api/cron/channel-talk-sync/route"

const ORIGINAL_ENV = { ...process.env }

function cronRequest() {
  return new NextRequest("https://classin.kr/api/cron/channel-talk-sync", {
    headers: {
      authorization: "Bearer cron-test-secret",
      "x-vercel-cron": "1",
    },
  })
}

beforeEach(() => {
  process.env.VERCEL = "1"
  process.env.CRON_SECRET = "cron-test-secret"
  syncChannelConversations.mockReset()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("channel talk sync cron", () => {
  it("returns 502 when a configured upstream sync fails", async () => {
    syncChannelConversations.mockResolvedValue({
      ok: false,
      configured: true,
      fetchedChats: 0,
      upserted: 0,
      newConversations: 0,
      matchedLeads: 0,
      warning: "Channel API unavailable",
    })

    const response = await GET(cronRequest())

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      configured: true,
      warning: "Channel API unavailable",
    })
  })

  it("returns 503 when credentials are not configured", async () => {
    syncChannelConversations.mockResolvedValue({
      ok: false,
      configured: false,
      fetchedChats: 0,
      upserted: 0,
      newConversations: 0,
      matchedLeads: 0,
    })

    const response = await GET(cronRequest())

    expect(response.status).toBe(503)
  })

  it("keeps successful sync responses at 200", async () => {
    syncChannelConversations.mockResolvedValue({
      ok: true,
      configured: true,
      fetchedChats: 5,
      upserted: 5,
      newConversations: 2,
      matchedLeads: 1,
    })

    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    expect(syncChannelConversations).toHaveBeenCalledWith({ limit: 50 })
  })
})
