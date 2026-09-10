import { afterEach, describe, expect, it, vi } from "vitest"

const OPS_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=ops-room"
const CRITICAL_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=critical-room"

async function loadEmitter(settingsOverride: Record<string, unknown> = {}) {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const createDeliveryLog = vi.fn().mockResolvedValue(undefined)

  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomOpsWebhookUrl: OPS_URL,
      wecomCriticalWebhookUrl: CRITICAL_URL,
      notificationAppearance: {},
      notificationDigestEmailList: [],
      webhookEnabled: {},
      ...settingsOverride,
    }),
  }))
  vi.doMock("@/lib/server/post-json", () => ({ postJson }))
  vi.doMock("@/lib/email", () => ({
    sendInternalNotification: vi.fn(),
    wrapNotificationHtml: vi.fn(),
  }))
  vi.doMock("@/lib/notifications/presentation", () => ({
    resolveNotificationPresentation: vi
      .fn()
      .mockReturnValue({ iconKey: "bell", tone: "slate" }),
  }))
  vi.doMock("@/lib/notifications/repository", () => ({
    createDeliveryLog,
    createInAppNotifications: vi.fn().mockResolvedValue(undefined),
    createNotificationEvent: vi.fn().mockResolvedValue({ id: "event-toggle" }),
  }))

  const emitter = await import("@/lib/notifications/emit-event")
  return { ...emitter, postJson, createDeliveryLog }
}

function baseEvent() {
  return {
    eventType: "ops.test",
    notificationType: "status_update" as const,
    categoryTag: "system" as const,
    severity: "info" as const,
    title: "테스트",
    message: "본문",
    source: "ops",
    sourceId: "toggle-test",
    channels: ["wecom_webhook" as const],
  }
}

describe("웹훅 켜기/끄기", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("키가 없으면 켜진 것으로 보고 발송한다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter()

    await emitNotificationEvent(baseEvent())

    expect(postJson).toHaveBeenCalledWith(OPS_URL, expect.anything())
  })

  it("꺼진 웹훅은 URL 이 남아 있어도 발송하지 않는다", async () => {
    const { emitNotificationEvent, postJson, createDeliveryLog } = await loadEmitter({
      webhookEnabled: { wecomOpsWebhookUrl: false },
    })

    await emitNotificationEvent(baseEvent())

    expect(postJson).not.toHaveBeenCalled()
    // 미설정과 구분되는 사유여야 한다 — 전달 로그만 보고 원인을 갈라낼 수 있어야 하므로.
    expect(createDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "wecom_webhook",
        status: "skipped",
        errorMessage: expect.stringContaining("관리자가 끈 채널"),
      })
    )
  })

  it("미설정 채널의 사유는 '끈 채널'과 다르게 남는다", async () => {
    const { emitNotificationEvent, createDeliveryLog } = await loadEmitter({
      wecomCsWebhookUrl: undefined,
    })

    await emitNotificationEvent({ ...baseEvent(), channels: ["wecom_cs_webhook"] })

    expect(createDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        errorMessage: "Notification channel is not configured.",
      })
    )
  })

  it("긴급 방이 미설정이어도 운영 방으로 우회하지 않는다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter({
      wecomCriticalWebhookUrl: undefined,
    })

    await emitNotificationEvent({
      ...baseEvent(),
      severity: "critical",
      notificationType: "incident",
    })

    expect(postJson).not.toHaveBeenCalled()
  })

  // 끈 채널이 폴백으로 새면 "껐는데 왜 오지"가 된다. 더 나쁜 건 반대 방향이다 —
  // 운영 방을 끄면 일상 알림이 통째로 긴급 방으로 쏟아진다.
  it("끈 채널은 폴백으로 새지 않는다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter({
      webhookEnabled: { wecomCriticalWebhookUrl: false },
    })

    await emitNotificationEvent({
      ...baseEvent(),
      severity: "critical",
      notificationType: "incident",
    })

    expect(postJson).not.toHaveBeenCalled()
  })

  it("꺼진 채널의 URL 이 없어도 비활성 사유를 보존하고 우회하지 않는다", async () => {
    const { emitNotificationEvent, postJson, createDeliveryLog } = await loadEmitter({
      wecomOpsWebhookUrl: undefined,
      webhookEnabled: { wecomOpsWebhookUrl: false },
    })
    await emitNotificationEvent(baseEvent())
    expect(postJson).not.toHaveBeenCalled()
    expect(createDeliveryLog).toHaveBeenCalledWith(expect.objectContaining({
      status: "skipped", errorMessage: "관리자가 끈 채널입니다.",
    }))
  })

  it("운영 방을 꺼도 일상 알림이 긴급 방으로 넘어가지 않는다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter({
      webhookEnabled: { wecomOpsWebhookUrl: false },
    })

    await emitNotificationEvent(baseEvent())

    expect(postJson).not.toHaveBeenCalled()
  })
})
