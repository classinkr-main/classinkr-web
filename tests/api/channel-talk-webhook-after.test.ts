import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 백엔드 점검 R9: 웹훅의 WeCom 알림·CRM 완결 기록이 200 응답 뒤 void 로 떠 있어 서버리스에서 잘릴 수 있었다.
// 이제 응답을 돌려주기 전에 after 로 등록한다(응답이 닫힌 뒤 등록하면 돌지 않는다 — 등록 시점을 본다).

const hoisted = vi.hoisted(() => ({
  registered: [] as Array<() => Promise<unknown>>,
  emitNotificationEvent: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
  getOrCreateCrmCustomerEventBySource: vi.fn<(...args: unknown[]) => Promise<{ record: object; created: boolean }>>(
    async () => ({ record: {}, created: true })
  ),
  createCrmCustomerEvent: vi.fn(),
}))

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>()
  return {
    ...actual,
    after: (task: () => Promise<unknown>) => {
      hoisted.registered.push(task)
    },
  }
})
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: hoisted.emitNotificationEvent }))
vi.mock("@/lib/repositories/crm-events", () => ({
  getOrCreateCrmCustomerEventBySource: hoisted.getOrCreateCrmCustomerEventBySource,
  createCrmCustomerEvent: hoisted.createCrmCustomerEvent,
}))

import { POST } from "@/app/api/webhook/channel-talk/route"

const ORIGINAL_ENV = { ...process.env }

function request(body: unknown) {
  return new NextRequest("https://classin.kr/api/webhook/channel-talk?token=dummy-token", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  hoisted.registered.length = 0
  vi.clearAllMocks()
  process.env.CHANNEL_TALK_WEBHOOK_URL_TOKEN = "dummy-token"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("채널톡 웹훅 — 응답 뒤 작업 등록", () => {
  it("고객 새 글 알림은 응답을 돌려주기 전에 after 로 등록되고, 응답 뒤에 돈다", async () => {
    const response = await POST(
      request({ type: "message", entity: { personType: "user", plainText: "견적 문의", chatId: "chat-1" } })
    )

    // POST 가 끝난 시점(응답을 돌려준 시점)에 이미 등록돼 있어야 한다.
    expect(response.status).toBe(200)
    expect(hoisted.registered).toHaveLength(1)
    expect(hoisted.emitNotificationEvent).not.toHaveBeenCalled()

    await hoisted.registered[0]()
    expect(hoisted.emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(hoisted.emitNotificationEvent.mock.calls[0][0]).toMatchObject({
      eventType: "channel_talk.message",
      sourceId: "chat-1",
      channels: ["wecom_cs_webhook"],
    })
  })

  it("상담 완결은 출처 id(channel:{chatId}) 기준으로 기록하고, 등록된 작업이 끝날 때까지 기다린다", async () => {
    let finish: () => void = () => undefined
    hoisted.getOrCreateCrmCustomerEventBySource.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ record: {}, created: true })))
    )

    await POST(request({ type: "userChat.closed", entity: { chatId: "chat-7" } }))
    expect(hoisted.registered).toHaveLength(1)

    let settled = false
    const running = hoisted.registered[0]().then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    finish()
    await running
    expect(settled).toBe(true)

    expect(hoisted.createCrmCustomerEvent).not.toHaveBeenCalled()
    expect(hoisted.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "site_inflow", sourceId: "channel:chat-7", targetId: null })
    )
  })

  it("알림이 실패해도 CRM 기록은 돈다(서로 막지 않는다)", async () => {
    hoisted.emitNotificationEvent.mockRejectedValueOnce(new Error("wecom down"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await POST(
      request({
        type: "message",
        event: "push",
        entity: { personType: "user", plainText: "안녕하세요", chatId: "chat-2" },
      })
    )
    await POST(request({ event: "userChat.closed", entity: { chatId: "chat-2" } }))
    await Promise.all(hoisted.registered.map((task) => task()))

    expect(hoisted.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledTimes(1)
  })

  it("할 일이 없는 웹훅(상담원 글)은 아무것도 등록하지 않는다", async () => {
    const response = await POST(request({ type: "message", entity: { personType: "manager" } }))
    expect(response.status).toBe(200)
    expect(hoisted.registered).toHaveLength(0)
  })
})
