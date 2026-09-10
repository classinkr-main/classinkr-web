import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { mergeNotificationSchedule } from "@/lib/notifications/schedule"

async function loadRoute(leadDaily?: Record<string, unknown>) {
  vi.resetModules()

  const sendLeadMorningBrief = vi
    .fn()
    .mockResolvedValue({ status: "sent", eventId: "event-daily", totalLeads: 4 })

  const previewLeadMorningBrief = vi.fn().mockResolvedValue({ totalLeads: 4, maxDeliveries: 1 })
  vi.doMock("@/lib/server/lead-morning-brief", () => ({ sendLeadMorningBrief, previewLeadMorningBrief }))
  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      notificationSchedule: mergeNotificationSchedule(
        leadDaily ? { leadDaily } : undefined
      ),
    }),
  }))

  const { GET } = await import("@/app/api/cron/dispatch/[slot]/route")
  return { GET, sendLeadMorningBrief, previewLeadMorningBrief }
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
