import { afterEach, describe, expect, it, vi } from "vitest"

// 알림 표(notification_events) 쓰기가 실패해도 외부 채널(WeCom)은 나간다 — 장애 알림이 가장 필요한 때가
// DB 쓰기가 거절될 때다. 발송 기록 쓰기 실패도 이미 나간 발송을 실패로 바꾸지 않는다(2026-10-12).

async function loadEmitter(options: { storeFails?: boolean; logFails?: boolean; postOk?: boolean }) {
  vi.resetModules()
  const postJson = vi.fn().mockResolvedValue({ ok: options.postOk ?? true, status: options.postOk === false ? 500 : 200 })
  const createDeliveryLog = vi.fn(async () => {
    if (options.logFails) throw new Error("[notifications] create delivery log failed: JWT expired")
  })
  const createInAppNotifications = vi.fn().mockResolvedValue(undefined)
  const createNotificationEvent = vi.fn(async () => {
    if (options.storeFails) throw new Error("[notifications] create event failed: PGRST303")
    return { id: "event-1" }
  })
  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomCriticalWebhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=critical-room",
      notificationAppearance: {},
      notificationDigestEmailList: [],
    }),
  }))
  vi.doMock("@/lib/server/post-json", () => ({ postJson }))
  vi.doMock("@/lib/email", () => ({ sendInternalNotification: vi.fn(), wrapNotificationHtml: vi.fn() }))
  vi.doMock("@/lib/notifications/presentation", () => ({
    resolveNotificationPresentation: vi.fn().mockReturnValue({ iconKey: "alert", tone: "red" }),
  }))
  vi.doMock("@/lib/notifications/repository", () => ({ createDeliveryLog, createInAppNotifications, createNotificationEvent }))
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const emitter = await import("@/lib/notifications/emit-event")
  return { ...emitter, postJson, createDeliveryLog, createInAppNotifications }
}

const INCIDENT = {
  eventType: "integration.webhook_failed",
  notificationType: "incident" as const,
  categoryTag: "system" as const,
  severity: "critical" as const,
  title: "리드 저장 실패",
  message: "Supabase write rejected",
  channels: ["wecom_webhook" as const],
}

describe("emitNotificationEvent — 알림 표 장애", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("이벤트 행을 못 써도 WeCom 긴급 방으로 보내고, 인앱은 건너뛴다", async () => {
    const { emitNotificationEvent, postJson, createInAppNotifications, createDeliveryLog } = await loadEmitter({ storeFails: true })

    const result = await emitNotificationEvent(INCIDENT)

    expect(postJson).toHaveBeenCalledWith(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=critical-room",
      expect.anything()
    )
    expect(createInAppNotifications).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: null, eventStored: false, deliveryResults: [{ channel: "wecom_webhook", status: "sent" }] })
    expect(createDeliveryLog).toHaveBeenCalledWith(expect.objectContaining({ eventId: null, status: "sent" }))
  })

  it("이벤트 행도 없고 외부 발송도 실패하면 원래 오류를 던진다 — 어디에도 닿지 않았다", async () => {
    const { emitNotificationEvent } = await loadEmitter({ storeFails: true, postOk: false })
    await expect(emitNotificationEvent(INCIDENT)).rejects.toThrow(/PGRST303/)
  })

  it("외부 채널이 없는 알림은 예전처럼 던진다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter({ storeFails: true })
    await expect(emitNotificationEvent({ ...INCIDENT, channels: [] })).rejects.toThrow(/PGRST303/)
    expect(postJson).not.toHaveBeenCalled()
  })

  it("발송 기록 쓰기가 실패해도 이미 나간 발송은 sent 로 돌려준다", async () => {
    const { emitNotificationEvent } = await loadEmitter({ logFails: true })
    const result = await emitNotificationEvent(INCIDENT)
    expect(result).toMatchObject({ id: "event-1", eventStored: true, deliveryResults: [{ channel: "wecom_webhook", status: "sent" }] })
  })
})
