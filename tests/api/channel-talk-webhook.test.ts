import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/notifications/emit-event", () => ({
  emitNotificationEvent: vi.fn(),
}))

import { POST } from "@/app/api/webhook/channel-talk/route"

const ORIGINAL_ENV = { ...process.env }

function channelRequest(url: string) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({
      event: "push",
      type: "message",
      entity: {
        personType: "manager",
      },
    }),
  })
}

describe("channel talk webhook auth", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it("accepts the configured URL token", async () => {
    process.env.CHANNEL_TALK_WEBHOOK_URL_TOKEN = "dummy-token"
    delete process.env.CHANNEL_TALK_WEBHOOK_SECRET
    delete process.env.CHANNEL_WEBHOOK_SECRET

    const response = await POST(
      channelRequest("https://classin.kr/api/webhook/channel-talk?token=dummy-token")
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("rejects a missing URL token when token auth is configured", async () => {
    process.env.CHANNEL_TALK_WEBHOOK_URL_TOKEN = "dummy-token"
    delete process.env.CHANNEL_TALK_WEBHOOK_SECRET
    delete process.env.CHANNEL_WEBHOOK_SECRET

    const response = await POST(channelRequest("https://classin.kr/api/webhook/channel-talk"))

    expect(response.status).toBe(401)
  })

  it("returns unavailable when no webhook auth is configured", async () => {
    delete process.env.CHANNEL_TALK_WEBHOOK_URL_TOKEN
    delete process.env.CHANNEL_WEBHOOK_URL_TOKEN
    delete process.env.CHANNEL_TALK_WEBHOOK_SECRET
    delete process.env.CHANNEL_WEBHOOK_SECRET

    const response = await POST(channelRequest("https://classin.kr/api/webhook/channel-talk"))

    expect(response.status).toBe(503)
  })
})
