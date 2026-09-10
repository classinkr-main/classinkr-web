import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_NOTIFICATION_SCHEDULE,
  kstHourToUtcSlot,
  mergeNotificationSchedule,
  utcSlotToKstHour,
} from "@/lib/notifications/schedule"

async function loadMorningBrief(scheduleOverride?: Record<string, unknown>) {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const claimLeadDigestRun = vi.fn().mockResolvedValue({
    claimed: true,
    run: { id: "run-daily", reportType: "daily", status: "pending" },
  })

  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomLeadReportWebhookUrl:
        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-room",
      notificationAppearance: {},
      notificationDigestEmailList: [],
      webhookEnabled: {},
      notificationSchedule: scheduleOverride
        ? mergeNotificationSchedule({ leadDaily: scheduleOverride })
        : DEFAULT_NOTIFICATION_SCHEDULE,
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
    createDeliveryLog: vi.fn().mockResolvedValue(undefined),
    createInAppNotifications: vi.fn().mockResolvedValue(undefined),
    createNotificationEvent: vi.fn().mockResolvedValue({ id: "event-daily" }),
  }))
  vi.doMock("@/lib/repositories/lead-digest-runs", () => ({
    claimLeadDigestRun,
    markLeadDigestRunSent: vi.fn().mockResolvedValue(undefined),
    markLeadDigestRunFailed: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue([]),
  }))

  const mod = await import("@/lib/server/lead-morning-brief")
  return { ...mod, postJson, claimLeadDigestRun }
}

describe("KST 시 ↔ UTC 슬롯", () => {
  it("KST 11시는 UTC 슬롯 02", () => {
    expect(kstHourToUtcSlot(11)).toBe(2)
    expect(utcSlotToKstHour(2)).toBe(11)
  })

  // 자정을 넘는 구간에서 음수 나머지가 나오면 슬롯이 통째로 어긋난다.
  it("자정을 감싸도 0-23 안에 머문다", () => {
    expect(kstHourToUtcSlot(0)).toBe(15)
    expect(kstHourToUtcSlot(8)).toBe(23)
    expect(kstHourToUtcSlot(9)).toBe(0)
    expect(utcSlotToKstHour(23)).toBe(8)
    for (let hour = 0; hour < 24; hour += 1) {
      expect(utcSlotToKstHour(kstHourToUtcSlot(hour))).toBe(hour)
    }
  })
})

describe("스케줄 정규화", () => {
  it("범위를 벗어난 값은 기본값으로 되돌린다", () => {
    const merged = mergeNotificationSchedule({
      leadDaily: { deliveryHourKst: 99, windowEndMinuteKst: -3 },
    })

    expect(merged.leadDaily.deliveryHourKst).toBe(11)
    expect(merged.leadDaily.windowEndMinuteKst).toBe(10)
  })

  it("빈 값이면 2026-09-07 이전 고정 동작과 같은 값을 쓴다", () => {
    expect(mergeNotificationSchedule(undefined).leadDaily).toEqual({
      deliveryHourKst: 11,
      windowEndHourKst: 10,
      windowEndMinuteKst: 10,
      weekdaysOnly: true,
    })
  })
})

describe("집계 창이 설정된 시각을 따른다", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("스케줄을 안 넘기면 10:10 KST 그대로다", async () => {
    const { getLeadMorningWindow } = await loadMorningBrief()

    // 2026-09-09(수) 18:00 KST
    const window = getLeadMorningWindow(new Date("2026-09-09T09:00:00.000Z"))

    expect(window.end.toISOString()).toBe("2026-09-09T01:10:00.000Z")
  })

  it("창 끝을 08:00 KST 로 바꾸면 창도 같이 움직인다", async () => {
    const { getLeadMorningWindow } = await loadMorningBrief()
    const schedule = mergeNotificationSchedule({
      leadDaily: { windowEndHourKst: 8, windowEndMinuteKst: 0 },
    }).leadDaily

    const window = getLeadMorningWindow(new Date("2026-09-09T09:00:00.000Z"), schedule)

    // 2026-09-09 08:00 KST = 2026-09-08T23:00Z
    expect(window.end.toISOString()).toBe("2026-09-08T23:00:00.000Z")
    expect(window.start.toISOString()).toBe("2026-09-07T23:00:00.000Z")
  })

  it("발송이 설정 창 끝보다 이르면 아직 안 닫힌 오늘 창 대신 어제 창을 쓴다", async () => {
    const { getLeadMorningWindow } = await loadMorningBrief()
    const schedule = mergeNotificationSchedule({
      leadDaily: { windowEndHourKst: 8, windowEndMinuteKst: 0 },
    }).leadDaily

    // 2026-09-09(수) 07:00 KST — 08:00 창이 닫히기 전
    const window = getLeadMorningWindow(new Date("2026-09-08T22:00:00.000Z"), schedule)

    expect(window.end.toISOString()).toBe("2026-09-07T23:00:00.000Z")
  })

  it("sendLeadMorningBrief 는 설정에서 스케줄을 읽는다", async () => {
    const { sendLeadMorningBrief } = await loadMorningBrief({
      windowEndHourKst: 8,
      windowEndMinuteKst: 0,
    })

    // 2026-09-09(수) 09:00 KST
    const result = await sendLeadMorningBrief(new Date("2026-09-09T00:00:00.000Z"))

    expect(result).toMatchObject({
      status: "sent",
      windowEnd: "2026-09-08T23:00:00.000Z",
    })
  })

  it("weekdaysOnly 를 끄면 토요일에도 보낸다", async () => {
    const { sendLeadMorningBrief } = await loadMorningBrief({ weekdaysOnly: false })

    // 2026-08-08 = 토요일
    const result = await sendLeadMorningBrief(new Date("2026-08-08T03:00:00.000Z"))

    expect(result.status).toBe("sent")
  })

  it("weekdaysOnly 가 켜져 있으면 토요일은 실행 레코드도 남기지 않는다", async () => {
    const { sendLeadMorningBrief, claimLeadDigestRun } = await loadMorningBrief()

    const result = await sendLeadMorningBrief(new Date("2026-08-08T03:00:00.000Z"))

    expect(result).toMatchObject({ status: "skipped", reason: "weekend" })
    expect(claimLeadDigestRun).not.toHaveBeenCalled()
  })
})
