import { afterEach, describe, expect, it, vi } from "vitest"

async function loadEmitter() {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const createDeliveryLog = vi.fn().mockResolvedValue(undefined)

  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomOpsWebhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=existing-room",
      notificationAppearance: {},
      notificationDigestEmailList: [],
    }),
  }))
  vi.doMock("@/lib/server/post-json", () => ({ postJson }))
  vi.doMock("@/lib/email", () => ({
    sendInternalNotification: vi.fn(),
    wrapNotificationHtml: vi.fn(),
  }))
  vi.doMock("@/lib/notifications/presentation", () => ({
    resolveNotificationPresentation: vi.fn().mockReturnValue({
      iconKey: "user-round-plus",
      tone: "emerald",
    }),
  }))
  vi.doMock("@/lib/notifications/repository", () => ({
    createDeliveryLog,
    createInAppNotifications: vi.fn().mockResolvedValue(undefined),
    createNotificationEvent: vi.fn().mockResolvedValue({ id: "event-1" }),
  }))

  const emitter = await import("@/lib/notifications/emit-event")
  return { ...emitter, postJson, createDeliveryLog }
}

describe("WeCom lead notification", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("uses the existing operations room and includes the CONTACT inquiry", async () => {
    const { emitNotificationEvent, postJson, createDeliveryLog } = await loadEmitter()

    await emitNotificationEvent({
      eventType: "lead.created",
      notificationType: "action_required",
      categoryTag: "lead",
      severity: "info",
      title: "새 리드: Codex Test Academy",
      message: "Codex Test / Codex Test Academy / contact_page",
      routeUrl: "/admin/crm",
      source: "lead",
      sourceId: "lead-contact-wecom-1",
      payload: {
        source: "contact_page",
        sourceDetail: "도입 상담",
        org: "Codex Test Academy",
        name: "Codex Test",
        phone: "010-1234-5678",
        message: "문의 유형: 도입 상담\n도입 절차가 궁금합니다.",
      },
      channels: ["wecom_webhook"],
    })

    expect(postJson).toHaveBeenCalledWith(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=existing-room",
      {
        msgtype: "text",
        text: {
          content: expect.stringContaining(
            "문의 내용: 문의 유형: 도입 상담 도입 절차가 궁금합니다."
          ),
        },
      }
    )
    expect(createDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "wecom_webhook",
        status: "sent",
      })
    )
  })
})
