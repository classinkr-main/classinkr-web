import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runAll = vi.hoisted(() => vi.fn())
const runBranchRevLinkMaintenance = vi.hoisted(() => vi.fn())

vi.mock("@/lib/branch/sync/failure-alert", () => ({ notifyBranchSyncFailureStreaks: vi.fn().mockResolvedValue([]) }))
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("@/lib/admin-crm-revenue", () => ({ ADMIN_CRM_REVENUE_CACHE_TAG: "admin-crm-revenue" }))
vi.mock("@/lib/admin-crm-revenue-sheet", () => ({ ADMIN_CRM_REVENUE_SHEET_CACHE_TAG: "admin-crm-revenue-sheet" }))
vi.mock("@/lib/repositories/branch-hw", () => ({ BRANCH_HW_CACHE_TAG: "branch-hw" }))
vi.mock("@/lib/repositories/branch-deals", () => ({ BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals" }))
vi.mock("@/lib/repositories/branch-dsh-kpi-mirror", () => ({ BRANCH_DSH_CACHE_TAG: "branch-dsh", BRANCH_KPI_CACHE_TAG: "branch-kpi" }))
vi.mock("@/lib/repositories/branch-sync", () => ({ BRANCH_SYNC_RUNS_CACHE_TAG: "branch-sync-runs" }))
vi.mock("@/lib/repositories/sales-ledger-imports", () => ({ SALES_LEDGER_IMPORTS_CACHE_TAG: "sales-ledger-imports" }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ HARDWARE_INVENTORY_CACHE_TAG: "hardware-inventory" }))
vi.mock("@/lib/branch/sync/run-all", () => ({ runAll }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ runBranchRevLinkMaintenance }))

import { GET } from "@/app/api/cron/sync-branch/route"
import { revalidateTag } from "next/cache"

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
  vi.mocked(revalidateTag).mockClear()
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
      outcome: "done",
    })
    expect(runAll).toHaveBeenCalledWith({ trigger: "cron" })
  })

  it("동기화가 ok:false면 crmLinks 없이 그대로 200을 반환한다", async () => {
    runAll.mockResolvedValue({ ok: false, skipped: true })

    const response = await GET(cronRequest("Bearer cron-test-secret"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: false, skipped: true, outcome: "running" })
    expect(runBranchRevLinkMaintenance).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("REV 성공·HW 실패 시에도 CRM 링크와 매출 시트 캐시를 갱신한다", async () => {
    runAll.mockResolvedValue({ ok: false, revOk: true, rev: 3, error: "hw: unavailable" })
    runBranchRevLinkMaintenance.mockResolvedValue({ reattach: 1 })
    const response = await GET(cronRequest("Bearer cron-test-secret"))
    expect((await response.json()).crmLinks).toEqual({ reattach: 1 })
    expect(revalidateTag).toHaveBeenCalledWith("admin-crm-revenue-sheet", { expire: 0 })
    expect(revalidateTag).not.toHaveBeenCalledWith("branch-hw", { expire: 0 })
  })
})
