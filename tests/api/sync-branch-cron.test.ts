import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runAll = vi.hoisted(() => vi.fn())
const runBranchRevLinkMaintenance = vi.hoisted(() => vi.fn())

vi.mock("@/lib/branch/sync/run-all", () => ({ runAll }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ runBranchRevLinkMaintenance }))

import { GET } from "@/app/api/cron/sync-branch/route"

const ORIGINAL_ENV = { ...process.env }

function cronRequest(authorization?: string) {
  return new NextRequest("https://classin.kr/api/cron/sync-branch", {
    headers: authorization ? { authorization } : {},
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-test-secret"
  runAll.mockReset()
  runBranchRevLinkMaintenance.mockReset()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("sync-branch cron", () => {
  it("CRON_SECRET이 없으면 401 unauthorized — 이전과 동일한 body", async () => {
    delete process.env.CRON_SECRET

    const response = await GET(cronRequest("Bearer whatever"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" })
    expect(runAll).not.toHaveBeenCalled()
  })

  it("시크릿이 일치하지 않으면 401 unauthorized — 이전과 동일한 body", async () => {
    const response = await GET(cronRequest("Bearer wrong-secret"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" })
    expect(runAll).not.toHaveBeenCalled()
  })

  it("정상 인증이면 동기화 결과 + crmLinks를 200으로 반환한다", async () => {
    runAll.mockResolvedValue({ ok: true, revRows: 3 })
    runBranchRevLinkMaintenance.mockResolvedValue({ reattach: 1, candidates: 2 })

    const response = await GET(cronRequest("Bearer cron-test-secret"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revRows: 3,
      crmLinks: { reattach: 1, candidates: 2 },
    })
    expect(runAll).toHaveBeenCalledWith({ trigger: "cron" })
  })

  it("동기화가 ok:false면 crmLinks 없이 그대로 200을 반환한다", async () => {
    runAll.mockResolvedValue({ ok: false, skipped: true })

    const response = await GET(cronRequest("Bearer cron-test-secret"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: false, skipped: true })
    expect(runBranchRevLinkMaintenance).not.toHaveBeenCalled()
  })
})
