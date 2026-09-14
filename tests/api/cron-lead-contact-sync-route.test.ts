import { readFileSync } from "node:fs"
import path from "node:path"

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 리드 연락 상태 MKT(Compass) 반영 전용 크론 라우트.

const REPORT_OK = {
  status: "ok",
  dryRun: false,
  scanned: 3,
  matched: 3,
  toContacted: 2,
  toClosed: 1,
  applied: { contacted: 2, closed: 1 },
}

async function loadRoute() {
  vi.resetModules()
  const syncLeadContactFromCompassWithinBudget = vi.fn().mockResolvedValue(REPORT_OK)
  vi.doMock("@/lib/server/lead-contact-compass-sync", () => ({ syncLeadContactFromCompassWithinBudget }))
  const { GET } = await import("@/app/api/cron/lead-contact-sync/route")
  return { GET, syncLeadContactFromCompassWithinBudget }
}

function request(query = "", secret = "test-cron-secret") {
  return new NextRequest(`https://classin.co.kr/api/cron/lead-contact-sync${query}`, {
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe("리드 연락 반영 전용 크론", () => {
  const previousCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousCronSecret
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("CRON_SECRET 이 없으면 401 이고 반영을 돌리지 않는다", async () => {
    delete process.env.CRON_SECRET
    const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(syncLeadContactFromCompassWithinBudget).not.toHaveBeenCalled()
  })

  it("Bearer 가 틀리면 401 이고 반영을 돌리지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()

    const response = await GET(request("", "wrong"))

    expect(response.status).toBe(401)
    expect(syncLeadContactFromCompassWithinBudget).not.toHaveBeenCalled()
  })

  it("정상 실행은 200 과 보고서를 돌려준다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, ...REPORT_OK })
    expect(syncLeadContactFromCompassWithinBudget).toHaveBeenCalledWith({ budgetMs: 45_000, dryRun: false })
  })

  it("dryRun=true 면 미리보기로만 돌린다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()

    await GET(request("?dryRun=true"))

    expect(syncLeadContactFromCompassWithinBudget).toHaveBeenCalledWith({ budgetMs: 45_000, dryRun: true })
  })

  it("건너뜀·실패·시간 초과는 크론 대시보드에서 보이게 2xx 가 아닌 코드로 돌려준다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()

    for (const [status, code] of [
      ["bridge_down", 503],
      ["failed", 500],
      ["timeout", 504],
    ] as const) {
      syncLeadContactFromCompassWithinBudget.mockResolvedValueOnce({ ...REPORT_OK, status })
      const response = await GET(request())
      expect(response.status).toBe(code)
      expect(await response.json()).toMatchObject({ ok: false, status })
    }
  })

  it("예상 못 한 예외는 500 과 일반 문구로 돌려준다", async () => {
    process.env.CRON_SECRET = "test-cron-secret"
    const { GET, syncLeadContactFromCompassWithinBudget } = await loadRoute()
    syncLeadContactFromCompassWithinBudget.mockRejectedValueOnce(new Error("boom"))

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      status: "failed",
      dryRun: false,
      error: "Lead contact sync failed.",
    })
  })
})

describe("vercel.json — 리드 연락 반영 일정", () => {
  it("평일 근무 시간(KST 09~18시) 안에서 하루 최대 5회만 돈다 — 사용자 결정(2026-09-14)", () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>
    }
    const entries = config.crons.filter((cron) => cron.path === "/api/cron/lead-contact-sync")
    expect(entries).toHaveLength(1)

    const [minute, hour, dayOfMonth, month, dayOfWeek] = entries[0].schedule.trim().split(/\s+/)
    expect(minute).toMatch(/^\d{1,2}$/)
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "1-5"])

    const utcHours = hour.split(",").map(Number)
    expect(utcHours.length).toBeLessThanOrEqual(5)
    // UTC 0~8시 = KST 9~17시 — 같은 날짜라 요일 필터(1-5)가 KST 평일과 일치한다.
    for (const utcHour of utcHours) {
      expect(utcHour).toBeGreaterThanOrEqual(0)
      expect(utcHour).toBeLessThanOrEqual(8)
    }
  })
})
