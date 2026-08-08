import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getUserChatMessages,
  listUserChatMessages,
  listUserChats,
} from "@/lib/channel-talk-api"

const ORIGINAL_ENV = { ...process.env }
const fetchMock = vi.fn()

function jsonResponse(value: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
}

beforeEach(() => {
  process.env.CHANNEL_TALK_ACCESS = "test-access"
  process.env.CHANNEL_TALK_ACCESS_SECRET = "test-secret"
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe("channel talk API pagination", () => {
  it("treats limit as total unique chats and consumes next via since with id dedupe", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({
          userChats: [{ id: "c1" }, { id: "c2" }],
          users: [{ id: "u1" }, { id: "u2" }],
          next: "cursor-2",
        })
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          userChats: [{ id: "c2" }],
          users: [{ id: "u2" }],
          next: "cursor-3",
        })
      )
      .mockImplementationOnce(() =>
        jsonResponse({ userChats: [{ id: "c3" }], users: [{ id: "u3" }] })
      )

    const result = await listUserChats({
      state: "closed",
      limit: 3,
      pageSize: 2,
      sortOrder: "desc",
    })

    expect(result.userChats.map((chat) => chat.id)).toEqual(["c1", "c2", "c3"])
    expect(result.users.map((user) => user.id)).toEqual(["u1", "u2", "u3"])
    expect(result.pagesFetched).toBe(3)
    expect(result.complete).toBe(true)

    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)))
    expect(urls[0].searchParams.get("state")).toBe("closed")
    expect(urls[0].searchParams.get("limit")).toBe("2")
    expect(urls[0].searchParams.get("since")).toBeNull()
    expect(urls[1].searchParams.get("since")).toBe("cursor-2")
    expect(urls[2].searchParams.get("since")).toBe("cursor-3")
  })

  it("paginates messages and keeps the legacy array-returning API compatible", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({ messages: [{ id: "m1" }, { id: "m2" }], next: "message-cursor" })
      )
      .mockImplementationOnce(() => jsonResponse({ messages: [{ id: "m3" }] }))

    const paged = await listUserChatMessages("chat/id", {
      limit: 3,
      pageSize: 2,
      sortOrder: "asc",
    })

    expect(paged.messages.map((message) => message.id)).toEqual(["m1", "m2", "m3"])
    expect(paged.pagesFetched).toBe(2)
    expect(paged.complete).toBe(true)
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]))
    expect(secondUrl.pathname).toContain("chat%2Fid/messages")
    expect(secondUrl.searchParams.get("since")).toBe("message-cursor")

    fetchMock.mockImplementationOnce(() => jsonResponse({ messages: [{ id: "legacy" }] }))
    await expect(getUserChatMessages("chat-id", { limit: 1 })).resolves.toEqual([
      { id: "legacy" },
    ])
  })

  it("stops on a repeated cursor and reports incomplete instead of looping", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({ messages: [{ id: "m1" }], next: "same-cursor" })
      )
      .mockImplementationOnce(() =>
        jsonResponse({ messages: [{ id: "m2" }], next: "same-cursor" })
      )

    const result = await listUserChatMessages("chat-id", {
      limit: 100,
      pageSize: 1,
      maxPages: 10,
    })

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"])
    expect(result.pagesFetched).toBe(2)
    expect(result.complete).toBe(false)
    expect(result.next).toBe("same-cursor")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
