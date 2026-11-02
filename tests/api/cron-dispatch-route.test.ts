import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { mergeNotificationSchedule } from "@/lib/notifications/schedule"

async function loadRoute(
  leadDaily?: Record<string, unknown>,
  segmentsReport?: Record<string, unknown> | Error,
  options: { settingsError?: Error; hardwareReport?: Record<string, unknown> | Error } = {}
) {
  vi.resetModules()

  // 저장 세그먼트 매일 잡(KST 06시 = UTC 슬롯 21) — 동적 import 라 모듈 팩토리 실행 여부로 "다른 슬롯은 불러오지도
  // 않는다"를 확인한다.
  const segmentsModuleLoaded = vi.fn()
  const runCrmSegmentDaily = vi.fn(async (options: { dryRun?: boolean }) => {
    if (segmentsReport instanceof Error) throw segmentsReport
    return {
      status: "ok",
      trigger: "cron",
      dryRun: options.dryRun === true,
      snapshotDate: "2026-09-25",
      daily: options.dryRun ? "skipped" : "written",
      durationMs: 12,
      segments: [
        { id: "s1", name: "만료 임박", total: 3, flags: [], autoTagStatus: "applied", tagged: 2, untagged: 0, failed: 0, invalid: 0 },
      ],
      ...(segmentsReport ?? {}),
    }
  })
  vi.doMock("@/lib/server/crm-segment-daily", () => {
    segmentsModuleLoaded()
    return { runCrmSegmentDaily }
  })

  // 하드웨어 일일 알림(KST 08시 = UTC 슬롯 23) — 같은 동적 import 격리.
  const hardwareModuleLoaded = vi.fn()
  const runHardwareProcessAlerts = vi.fn(async (runOptions: { dryRun?: boolean }) => {
    if (options.hardwareReport instanceof Error) throw options.hardwareReport
    return {
      status: runOptions.dryRun ? "preview" : "sent",
      dryRun: runOptions.dryRun === true,
      dateKey: "2026-10-28",
      stalePlannedCount: 2,
      overdueSampleCount: 1,
      ownerCount: 2,
      shownItems: 3,
      omittedItems: 0,
      sampleCheckAvailable: true,
      owners: [],
      ...(options.hardwareReport ?? {}),
    }
  })
  vi.doMock("@/lib/server/hardware-process-alerts", () => {
    hardwareModuleLoaded()
    return { runHardwareProcessAlerts }
  })

  const sendLeadMorningBrief = vi
    .fn()
    .mockResolvedValue({ status: "sent", eventId: "event-daily", totalLeads: 4 })

  const previewLeadMorningBrief = vi.fn().mockResolvedValue({ totalLeads: 4, maxDeliveries: 1 })
  vi.doMock("@/lib/server/lead-morning-brief", () => ({ sendLeadMorningBrief, previewLeadMorningBrief }))
  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: options.settingsError
      ? vi.fn().mockRejectedValue(options.settingsError)
      : vi.fn().mockResolvedValue({
          notificationSchedule: mergeNotificationSchedule(
            leadDaily ? { leadDaily } : undefined
          ),
        }),
  }))

  const { GET } = await import("@/app/api/cron/dispatch/[slot]/route")
  return {
    GET,
    sendLeadMorningBrief,
    previewLeadMorningBrief,
    runCrmSegmentDaily,
    segmentsModuleLoaded,
    runHardwareProcessAlerts,
    hardwareModuleLoaded,
  }
}

function request(slot: string, secret = "test-cron-secret") {
  return new NextRequest(`https://classin.co.kr/api/cron/dispatch/${slot}`, {
    headers: { authorization: `Bearer ${secret}` },
  })
}

function context(slot: string) {
  return { params: Promise.resolve({ slot }) }
}

describe("시간 슬롯 크론 디스패처", () => {
  const previousCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousCronSecret
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("CRON_SECRET 이 없으면 401", async () => {
    delete process.env.CRON_SECRET
    const { GET } = await loadRoute()

    const response = await GET(request("02"), context("02"))

    expect(response.status).toBe(401)
  })

  it("Bearer 가 틀리면 401", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, sendLeadMorningBrief } = await loadRoute()

    const response = await GET(request("02", "wrong"), context("02"))

    expect(response.status).toBe(401)
    expect(sendLeadMorningBrief).not.toHaveBeenCalled()
  })

  it("슬롯이 0-23 밖이면 400", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET } = await loadRoute()

    expect((await GET(request("24"), context("24"))).status).toBe(400)
    expect((await GET(request("ab"), context("ab"))).status).toBe(400)
  })

  it("기본 설정(11시 KST)에서는 UTC 슬롯 02 가 아침 카드를 보낸다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, sendLeadMorningBrief } = await loadRoute()

    const response = await GET(request("02"), context("02"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(sendLeadMorningBrief).toHaveBeenCalledTimes(1)
    expect(body).toMatchObject({ ok: true, slot: 2, kstHour: 11 })
    expect(body.ran).toHaveLength(1)
    expect(body.ran[0]).toMatchObject({ job: "leadDaily", status: "sent" })
  })

  it("맞지 않는 슬롯은 아무것도 실행하지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, sendLeadMorningBrief } = await loadRoute()

    const response = await GET(request("05"), context("05"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(sendLeadMorningBrief).not.toHaveBeenCalled()
    expect(body).toMatchObject({ ok: true, ran: [] })
  })

  it("발송 시각을 08시 KST 로 바꾸면 슬롯 23 이 담당한다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, sendLeadMorningBrief } = await loadRoute({ deliveryHourKst: 8 })

    const notDue = await GET(request("02"), context("02"))
    expect(await notDue.json()).toMatchObject({ ran: [] })
    expect(sendLeadMorningBrief).not.toHaveBeenCalled()

    const due = await GET(request("23"), context("23"))
    expect(await due.json()).toMatchObject({ kstHour: 8 })
    expect(sendLeadMorningBrief).toHaveBeenCalledTimes(1)
  })

  it("dryRun 은 집계만 조회하고 발송하지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, sendLeadMorningBrief, previewLeadMorningBrief } = await loadRoute()
    const response = await GET(request("02?dryRun=true"), context("02"))
    expect(await response.json()).toMatchObject({ dryRun: true, ran: [], preview: { maxDeliveries: 1 } })
    expect(previewLeadMorningBrief).toHaveBeenCalledOnce()
    expect(sendLeadMorningBrief).not.toHaveBeenCalled()
  })

  // 한 잡이 죽어도 같은 슬롯의 다른 잡과 크론 자체를 끌고 내려가면 안 된다.
  it("잡 실패는 500 으로 보고하고 외부 오류를 노출하지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, sendLeadMorningBrief } = await loadRoute()
    sendLeadMorningBrief.mockRejectedValueOnce(new Error("위컴 500"))

    const response = await GET(request("02"), context("02"))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.ran[0]).toMatchObject({ job: "leadDaily", status: "failed" })
    expect(body.ran[0].error).toBe("Lead daily report failed.")
  })
})

describe("고정 슬롯 잡 — 저장 세그먼트 매일 평가·자동 태그(UTC 21 = KST 06시)", () => {
  const previousCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousCronSecret
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("슬롯 21 에서 crmSegmentsDaily 가 돈다(쓰기 실행) — 요약만 싣는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runCrmSegmentDaily, sendLeadMorningBrief } = await loadRoute()

    const response = await GET(request("21"), context("21"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(runCrmSegmentDaily).toHaveBeenCalledWith(expect.objectContaining({ trigger: "cron", dryRun: false }))
    expect(sendLeadMorningBrief).not.toHaveBeenCalled()
    expect(body).toMatchObject({ ok: true, slot: 21, kstHour: 6 })
    expect(body.ran).toEqual([
      expect.objectContaining({
        job: "crmSegmentsDaily",
        status: "ok",
        detail: expect.objectContaining({
          daily: "written",
          segments: [expect.objectContaining({ id: "s1", autoTagStatus: "applied", tagged: 2 })],
        }),
      }),
    ])
  })

  it("다른 슬롯에서는 세그먼트 모듈을 불러오지도 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runCrmSegmentDaily, segmentsModuleLoaded } = await loadRoute()

    await GET(request("02"), context("02"))
    await GET(request("20"), context("20"))

    expect(runCrmSegmentDaily).not.toHaveBeenCalled()
    expect(segmentsModuleLoaded).not.toHaveBeenCalled()
  })

  it("아침 카드를 06시로 옮기면 같은 슬롯에서 알림 잡 뒤에 순차로 돈다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET } = await loadRoute({ deliveryHourKst: 6 })

    const body = await (await GET(request("21"), context("21"))).json()

    expect(body.ran.map((result: { job: string }) => result.job)).toEqual(["leadDaily", "crmSegmentsDaily"])
  })

  it("세그먼트 잡이 던져도 격리 — failed 로 보고(ok=false, 500), 오류 원문은 노출하지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { GET } = await loadRoute({ deliveryHourKst: 6 }, new Error("secret db url"))

    const response = await GET(request("21"), context("21"))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.ran[0]).toMatchObject({ job: "leadDaily", status: "sent" })
    expect(body.ran[1]).toEqual({ job: "crmSegmentsDaily", status: "failed", error: "CRM segments daily job failed." })
    expect(JSON.stringify(body)).not.toContain("secret db url")
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("secret db url")
  })

  it("표 미적용(skipped)은 실패가 아니다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET } = await loadRoute(undefined, { status: "skipped", reason: "not_ready", segments: [] })

    const response = await GET(request("21"), context("21"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ran[0]).toMatchObject({ job: "crmSegmentsDaily", status: "skipped", detail: { reason: "not_ready" } })
  })

  it("dryRun 은 세그먼트도 미리보기만(쓰기 0) — segmentsPreview 로 싣는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runCrmSegmentDaily } = await loadRoute()

    const body = await (await GET(request("21?dryRun=true"), context("21"))).json()

    expect(runCrmSegmentDaily).toHaveBeenCalledTimes(1)
    expect(runCrmSegmentDaily).toHaveBeenCalledWith(expect.objectContaining({ trigger: "cron", dryRun: true }))
    expect(body).toMatchObject({
      ok: true,
      dryRun: true,
      ran: [],
      segmentsPreview: { job: "crmSegmentsDaily", status: "ok", detail: { dryRun: true, daily: "skipped" } },
    })
  })

  // 교차 리뷰 [21] — 세그먼트 잡은 알림 설정을 쓰지 않는다. 설정 읽기가 실패해도 슬롯 21 의 세그먼트 잡은 돈다.
  it("슬롯 21 에서 알림 설정 읽기가 실패해도 세그먼트 잡은 돈다 — 알림 잡만 failed(응답 500)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runCrmSegmentDaily, sendLeadMorningBrief } = await loadRoute(undefined, undefined, {
      settingsError: new Error("settings down"),
    })

    const response = await GET(request("21"), context("21"))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(runCrmSegmentDaily).toHaveBeenCalledTimes(1)
    expect(runCrmSegmentDaily).toHaveBeenCalledWith(expect.objectContaining({ trigger: "cron", dryRun: false }))
    expect(sendLeadMorningBrief).not.toHaveBeenCalled()
    expect(body.ran).toEqual([
      { job: "notificationSettings", status: "failed", error: "Notification settings unavailable." },
      expect.objectContaining({ job: "crmSegmentsDaily", status: "ok" }),
    ])
    expect(JSON.stringify(body)).not.toContain("settings down")
  })

  it("다른 슬롯은 설정 읽기 실패면 예전처럼 503 — 세그먼트 모듈을 불러오지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runCrmSegmentDaily, segmentsModuleLoaded } = await loadRoute(undefined, undefined, {
      settingsError: new Error("settings down"),
    })

    const response = await GET(request("02"), context("02"))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: "Notification settings unavailable." })
    expect(runCrmSegmentDaily).not.toHaveBeenCalled()
    expect(segmentsModuleLoaded).not.toHaveBeenCalled()
  })

  it("dryRun — 슬롯 21 에서 설정·알림 미리보기가 실패해도 segmentsPreview 는 싣는다(503 + error)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const settingsDown = await loadRoute(undefined, undefined, { settingsError: new Error("settings down") })
    const response = await settingsDown.GET(request("21?dryRun=true"), context("21"))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      ok: false,
      dryRun: true,
      error: "Notification settings unavailable.",
      segmentsPreview: { job: "crmSegmentsDaily", status: "ok", detail: { dryRun: true } },
    })
    expect(settingsDown.runCrmSegmentDaily).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))

    const previewDown = await loadRoute({ deliveryHourKst: 6 })
    previewDown.previewLeadMorningBrief.mockRejectedValueOnce(new Error("preview boom"))
    const previewResponse = await previewDown.GET(request("21?dryRun=true"), context("21"))
    expect(previewResponse.status).toBe(503)
    const previewBody = await previewResponse.json()
    expect(previewBody).toMatchObject({ ok: false, error: "Report preview unavailable.", segmentsPreview: { status: "ok" } })
    expect(JSON.stringify(previewBody)).not.toContain("preview boom")

    // 다른 슬롯의 dryRun 미리보기 실패는 예전처럼 503 만.
    const otherSlot = await loadRoute()
    otherSlot.previewLeadMorningBrief.mockRejectedValueOnce(new Error("preview boom"))
    const otherResponse = await otherSlot.GET(request("02?dryRun=true"), context("02"))
    expect(otherResponse.status).toBe(503)
    expect(await otherResponse.json()).toEqual({ ok: false, error: "Report preview unavailable." })
    expect(otherSlot.runCrmSegmentDaily).not.toHaveBeenCalled()
  })

  // 교차 리뷰 [35] — 세그먼트 잡 시간 예산은 요청 시작 기준(maxDuration 60초는 요청 전체에 걸린다).
  it("시간 예산 — 같은 슬롯에서 아침 카드가 쓴 시간만큼 세그먼트 잡 예산을 줄여 넘긴다(요청 시작 기준 40초)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    let clock = 1_000_000
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock)
    try {
      const { GET, runCrmSegmentDaily, sendLeadMorningBrief } = await loadRoute({ deliveryHourKst: 6 })
      sendLeadMorningBrief.mockImplementationOnce(async () => {
        clock += 12_000
        return { status: "sent", eventId: "event-daily", totalLeads: 4 }
      })

      await GET(request("21"), context("21"))

      expect(runCrmSegmentDaily).toHaveBeenCalledWith({ trigger: "cron", dryRun: false, timeBudgetMs: 28_000 })

      // 앞 잡이 예산을 다 쓰면 0 — 잡은 건수 기록만 하고 자동 태그는 다음 실행으로 미룬다(skipped_time_budget).
      const slow = await loadRoute({ deliveryHourKst: 6 })
      slow.sendLeadMorningBrief.mockImplementationOnce(async () => {
        clock += 45_000
        return { status: "sent", eventId: "event-daily", totalLeads: 4 }
      })
      await slow.GET(request("21"), context("21"))
      expect(slow.runCrmSegmentDaily).toHaveBeenCalledWith({ trigger: "cron", dryRun: false, timeBudgetMs: 0 })
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe("고정 슬롯 잡 — 하드웨어 일일 알림(UTC 23 = KST 08시)", () => {
  const previousCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousCronSecret
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("슬롯 23 에서 hardwareProcessAlerts 가 돈다(발송)", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runHardwareProcessAlerts, sendLeadMorningBrief } = await loadRoute()

    const response = await GET(request("23"), context("23"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(runHardwareProcessAlerts).toHaveBeenCalledWith({ dryRun: false })
    expect(sendLeadMorningBrief).not.toHaveBeenCalled()
    expect(body).toMatchObject({ ok: true, slot: 23, kstHour: 8 })
    expect(body.ran).toEqual([
      expect.objectContaining({ job: "hardwareProcessAlerts", status: "sent", detail: expect.objectContaining({ stalePlannedCount: 2 }) }),
    ])
  })

  it("Bearer 가 틀리면 401 — 알림 모듈을 불러오지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, hardwareModuleLoaded } = await loadRoute()

    const response = await GET(request("23", "wrong"), context("23"))

    expect(response.status).toBe(401)
    expect(hardwareModuleLoaded).not.toHaveBeenCalled()
  })

  it("다른 슬롯에서는 하드웨어 알림 모듈을 불러오지도 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, hardwareModuleLoaded } = await loadRoute()

    await GET(request("02"), context("02"))
    await GET(request("21"), context("21"))

    expect(hardwareModuleLoaded).not.toHaveBeenCalled()
  })

  it("아침 카드를 08시로 옮기면 같은 슬롯에서 알림 잡 뒤에 순차로 돈다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET } = await loadRoute({ deliveryHourKst: 8 })

    const body = await (await GET(request("23"), context("23"))).json()

    expect(body.ran.map((result: { job: string }) => result.job)).toEqual(["leadDaily", "hardwareProcessAlerts"])
  })

  it("empty·already_sent·disabled 는 실패가 아니다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    for (const status of ["empty", "already_sent", "disabled"]) {
      const { GET } = await loadRoute(undefined, undefined, { hardwareReport: { status } })
      const response = await GET(request("23"), context("23"))
      expect(response.status).toBe(200)
      expect((await response.json()).ran[0]).toMatchObject({ job: "hardwareProcessAlerts", status })
    }
  })

  it("잡이 던져도 격리 — failed(500), 오류 원문은 노출하지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { GET } = await loadRoute(undefined, undefined, {
      hardwareReport: new Error("wecom: HTTP 500 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret"),
    })

    const response = await GET(request("23"), context("23"))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.ran[0]).toEqual({ job: "hardwareProcessAlerts", status: "failed", error: "Hardware process alerts failed." })
    expect(JSON.stringify(body)).not.toContain("qyapi")
  })

  it("알림 설정 읽기가 실패해도 하드웨어 알림은 돈다 — 알림 잡만 failed", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runHardwareProcessAlerts } = await loadRoute(undefined, undefined, {
      settingsError: new Error("settings down"),
    })

    const response = await GET(request("23"), context("23"))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(runHardwareProcessAlerts).toHaveBeenCalledOnce()
    expect(body.ran).toEqual([
      { job: "notificationSettings", status: "failed", error: "Notification settings unavailable." },
      expect.objectContaining({ job: "hardwareProcessAlerts", status: "sent" }),
    ])
  })

  it("dryRun 은 hardwareAlertsPreview 로 미리보기만 싣는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, runHardwareProcessAlerts } = await loadRoute()

    const response = await GET(request("23?dryRun=true"), context("23"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(runHardwareProcessAlerts).toHaveBeenCalledWith({ dryRun: true })
    expect(body).toMatchObject({
      ok: true,
      dryRun: true,
      ran: [],
      hardwareAlertsPreview: { job: "hardwareProcessAlerts", status: "preview", detail: { dryRun: true } },
    })
  })
})
