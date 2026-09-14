import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { mergeNotificationSchedule } from "@/lib/notifications/schedule"

const SYNC_OK = {
  status: "ok",
  dryRun: false,
  scanned: 3,
  matched: 3,
  toContacted: 2,
  toClosed: 1,
  applied: { contacted: 2, closed: 1 },
}

async function loadRoute(leadDaily?: Record<string, unknown>, options: { settingsError?: Error } = {}) {
  vi.resetModules()

  const sendLeadMorningBrief = vi
    .fn()
    .mockResolvedValue({ status: "sent", eventId: "event-daily", totalLeads: 4 })

  const previewLeadMorningBrief = vi.fn().mockResolvedValue({ totalLeads: 4, maxDeliveries: 1 })
  const syncLeadContactFromCompassWithinBudget = vi.fn().mockResolvedValue(SYNC_OK)
  vi.doMock("@/lib/server/lead-morning-brief", () => ({ sendLeadMorningBrief, previewLeadMorningBrief }))
  vi.doMock("@/lib/server/lead-contact-compass-sync", () => ({ syncLeadContactFromCompassWithinBudget }))
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
  return { GET, sendLeadMorningBrief, previewLeadMorningBrief, syncLeadContactFromCompassWithinBudget }
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

  describe("MKT(Compass) 리드 연락 반영", () => {
    it("잡이 없는 슬롯에서도 매시간 돌고, 결과를 응답에 싣는다", async () => {
      process.env.CRON_SECRET = "test-cron-secret"
      const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()

      const response = await GET(request("05"), context("05"))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(syncLeadContactFromCompassWithinBudget).toHaveBeenCalledWith({ budgetMs: 20_000, dryRun: false })
      expect(body).toMatchObject({ ok: true, ran: [], leadContactSync: SYNC_OK })
    })

    it("같은 슬롯의 예약 잡(아침 카드)이 끝난 뒤에 돈다 — 느려져도 아침 카드를 굶기지 않는다", async () => {
      process.env.CRON_SECRET = "test-cron-secret"
      const { GET, sendLeadMorningBrief, syncLeadContactFromCompassWithinBudget } = await loadRoute()

      await GET(request("02"), context("02"))

      expect(sendLeadMorningBrief).toHaveBeenCalledTimes(1)
      expect(syncLeadContactFromCompassWithinBudget).toHaveBeenCalledTimes(1)
      expect(sendLeadMorningBrief.mock.invocationCallOrder[0]).toBeLessThan(
        syncLeadContactFromCompassWithinBudget.mock.invocationCallOrder[0]
      )
    })

    it("반영이 끊기거나 실패해도 슬롯 ok·상태코드는 잡 결과만 따른다", async () => {
      process.env.CRON_SECRET = "test-cron-secret"
      const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()
      syncLeadContactFromCompassWithinBudget.mockResolvedValueOnce({ ...SYNC_OK, status: "bridge_down" })

      const down = await GET(request("02"), context("02"))
      expect(down.status).toBe(200)
      expect(await down.json()).toMatchObject({ ok: true, leadContactSync: { status: "bridge_down" } })

      syncLeadContactFromCompassWithinBudget.mockRejectedValueOnce(new Error("boom"))
      const thrown = await GET(request("05"), context("05"))
      expect(thrown.status).toBe(200)
      expect(await thrown.json()).toMatchObject({
        ok: true,
        leadContactSync: { status: "failed", error: "Lead contact sync failed." },
      })
    })

    it("dryRun 이면 반영도 미리보기로만 돌린다", async () => {
      process.env.CRON_SECRET = "test-cron-secret"
      const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()
      syncLeadContactFromCompassWithinBudget.mockResolvedValueOnce({ ...SYNC_OK, dryRun: true, applied: { contacted: 0, closed: 0 } })

      const response = await GET(request("05?dryRun=true"), context("05"))
      const body = await response.json()

      expect(syncLeadContactFromCompassWithinBudget).toHaveBeenCalledWith({ budgetMs: 20_000, dryRun: true })
      expect(body).toMatchObject({ dryRun: true, leadContactSync: { dryRun: true, toContacted: 2, toClosed: 1 } })
    })

    it("알림 설정을 못 읽는 503 에서는 반영도 건너뛴다", async () => {
      process.env.CRON_SECRET = "test-cron-secret"
      const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute(undefined, {
        settingsError: new Error("settings down"),
      })

      const response = await GET(request("02"), context("02"))

      expect(response.status).toBe(503)
      expect(syncLeadContactFromCompassWithinBudget).not.toHaveBeenCalled()
    })
  })
})
