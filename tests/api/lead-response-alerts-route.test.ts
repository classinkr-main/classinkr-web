import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

async function loadRoute() {
  vi.resetModules()

  const sendLeadMorningBrief = vi.fn().mockImplementation((reportType: string) =>
    Promise.resolve({ status: "sent", reportType })
  )

  vi.doMock("@/lib/server/lead-morning-brief", () => ({ sendLeadMorningBrief }))

  const { GET } = await import("@/app/api/cron/lead-response-alerts/route")
  return { GET, sendLeadMorningBrief }
}

describe("lead response alerts cron route", () => {
  const previousCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousCronSecret
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("sends only the two morning briefs", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, sendLeadMorningBrief } = await loadRoute()
    const request = new NextRequest("https://classin.co.kr/api/cron/lead-response-alerts", {
      headers: { authorization: "Bearer test-cron-secret" },
    })

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(sendLeadMorningBrief).toHaveBeenCalledTimes(2)
    expect(sendLeadMorningBrief).toHaveBeenNthCalledWith(1, "meta")
    expect(sendLeadMorningBrief).toHaveBeenNthCalledWith(2, "homepage")
    expect(body).toMatchObject({ ok: true, errors: [] })
    expect(body).not.toHaveProperty("responseAlerts")
  })
})
