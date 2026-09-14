// P0(2026-09-11) — /api/cron/sync-branch가 동기화 실패 뒤 연속 실패 알림을 판정한다.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runAll = vi.fn()
const runBranchRevLinkMaintenance = vi.fn()
const notifyBranchSyncFailureStreaks = vi.fn()

vi.mock("@/lib/branch/sync/run-all", () => ({ runAll }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ runBranchRevLinkMaintenance }))
vi.mock("@/lib/branch/sync/failure-alert", () => ({ notifyBranchSyncFailureStreaks }))

function cronRequest() {
  return new NextRequest("https://classin.kr/api/cron/sync-branch", {
    headers: { authorization: "Bearer test-secret" },
  })
}

describe("GET /api/cron/sync-branch — 연속 실패 알림", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-secret")
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("동기화가 실패하면 연속 실패를 판정하고 결과를 응답에 싣는다", async () => {
    runAll.mockResolvedValue({ ok: false, error: "rev: permission", revOk: false })
    notifyBranchSyncFailureStreaks.mockResolvedValue([{ source: "rev", failedDays: 2, delivered: true }])
    const { GET } = await import("@/app/api/cron/sync-branch/route")

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(notifyBranchSyncFailureStreaks).toHaveBeenCalledTimes(1)
    expect(body.failureAlerts).toEqual([{ source: "rev", failedDays: 2, delivered: true }])
    expect(runBranchRevLinkMaintenance).not.toHaveBeenCalled()
  })

  it("성공·skipped면 판정하지 않는다", async () => {
    runAll.mockResolvedValueOnce({ ok: true, rev: 385, revOk: true })
    runBranchRevLinkMaintenance.mockResolvedValue({})
    const { GET } = await import("@/app/api/cron/sync-branch/route")
    await GET(cronRequest())
    runAll.mockResolvedValueOnce({ ok: false, skipped: true })
    await GET(cronRequest())

    expect(notifyBranchSyncFailureStreaks).not.toHaveBeenCalled()
  })

  it("알림 판정이 던져도 응답은 정상 JSON이다", async () => {
    runAll.mockResolvedValue({ ok: false, error: "rev: permission" })
    notifyBranchSyncFailureStreaks.mockRejectedValue(new Error("db down"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { GET } = await import("@/app/api/cron/sync-branch/route")

    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    expect((await response.json()).failureAlerts).toBeUndefined()
  })

  it("Bearer가 틀리면 401 — 판정도 동기화도 하지 않는다", async () => {
    const { GET } = await import("@/app/api/cron/sync-branch/route")
    const response = await GET(new NextRequest("https://classin.kr/api/cron/sync-branch", { headers: { authorization: "Bearer nope" } }))
    expect(response.status).toBe(401)
    expect(runAll).not.toHaveBeenCalled()
  })
})
