// 시트 고정(D5) 뒤 동기화 라우트 — 실제로 돌린 부분(ranSources)으로 캐시를 만료하고, 관리자 스냅샷 다시 읽기 표시를 넘긴다.
// runAll 은 목(고정 판정·부분 매핑은 tests/branch/sync/run-all-lock.test.ts).
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const runAll = vi.fn()
const runBranchRevLinkMaintenance = vi.fn()
const revalidateTag = vi.fn()
const notifyBranchSyncFailureStreaks = vi.fn(async () => [])

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin }))
vi.mock("@/lib/admin-crm-revenue", () => ({ ADMIN_CRM_REVENUE_CACHE_TAG: "admin-crm-revenue" }))
vi.mock("@/lib/admin-crm-revenue-sheet", () => ({ ADMIN_CRM_REVENUE_SHEET_CACHE_TAG: "admin-crm-revenue-sheet" }))
vi.mock("@/lib/branch/sync/run-all", () => ({ runAll }))
vi.mock("@/lib/branch/sync/failure-alert", () => ({ notifyBranchSyncFailureStreaks }))
vi.mock("@/lib/repositories/branch-hw", () => ({ BRANCH_HW_CACHE_TAG: "branch-hw" }))
vi.mock("@/lib/repositories/branch-deals", () => ({ BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals" }))
vi.mock("@/lib/repositories/branch-dsh-kpi-mirror", () => ({ BRANCH_DSH_CACHE_TAG: "branch-dsh", BRANCH_KPI_CACHE_TAG: "branch-kpi" }))
vi.mock("@/lib/repositories/branch-sync", () => ({ BRANCH_SYNC_RUNS_CACHE_TAG: "branch-sync-runs" }))
vi.mock("@/lib/repositories/sales-ledger-imports", () => ({ SALES_LEDGER_IMPORTS_CACHE_TAG: "sales-ledger-imports" }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ HARDWARE_INVENTORY_CACHE_TAG: "hardware-inventory" }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ runBranchRevLinkMaintenance }))
vi.mock("next/cache", () => ({ revalidateTag }))

const HW = { inbound: 1, outbound: 1, stock: 1, sales: 1 }
const LOCK = { lockedAt: "2026-12-01", reread: false }

function syncRequest(body: unknown = {}) {
  return new NextRequest("https://classin.kr/api/admin/branch/sync", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function expiredTags() {
  return revalidateTag.mock.calls.map((call) => call[0])
}

describe("POST /api/admin/branch/sync — 시트 고정 뒤", () => {
  afterEach(() => vi.clearAllMocks())

  it("DSH·HW 만 돈 런은 DSH·KPI·HW 캐시만 만료하고 REV 미러·임포트·CRM 매출·링크 유지보수는 건드리지 않는다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: true, rev: 0, dsh: 40, dshOk: true, hw: HW, ranSources: ["dsh", "hw"], revSheetLock: LOCK })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest({ sources: ["rev", "hw"] }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.outcome).toBe("done")
    expect(expiredTags()).toEqual(expect.arrayContaining(["branch-dsh", "branch-kpi", "branch-hw", "branch-sync-runs"]))
    for (const tag of ["branch-rev-deals", "sales-ledger-imports", "admin-crm-revenue", "admin-crm-revenue-sheet"]) {
      expect(expiredTags()).not.toContain(tag)
    }
    expect(runBranchRevLinkMaintenance).not.toHaveBeenCalled()
  })

  it("revSnapshotReread:true 는 runAll 에 allowLockedRevRead 로 넘기고, 결과가 REV 를 읽었으면 REV 계열을 만료한다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: true, rev: 385, revOk: true, ranSources: ["rev"], revSheetLock: { ...LOCK, reread: true } })
    runBranchRevLinkMaintenance.mockResolvedValue({})

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const body = await (await POST(syncRequest({ sources: ["rev"], revSnapshotReread: true }))).json()

    expect(runAll).toHaveBeenCalledWith({ trigger: "manual", sources: ["rev"], allowLockedRevRead: true })
    expect(expiredTags()).toEqual(expect.arrayContaining(["branch-rev-deals", "sales-ledger-imports", "admin-crm-revenue-sheet"]))
    expect(runBranchRevLinkMaintenance).toHaveBeenCalledTimes(1)
    expect(body.revSheetLock).toEqual({ lockedAt: "2026-12-01", reread: true })
  })

  it.each([["문자열 'true'", "true"], ["1", 1], ["없음", undefined]])(
    "revSnapshotReread 가 글자 그대로 true 가 아니면(%s) 표시를 넘기지 않는다",
    async (_label, value) => {
      verifyAdmin.mockResolvedValue(null)
      runAll.mockResolvedValue({ ok: true, dshOk: true, ranSources: ["dsh"], revSheetLock: LOCK })

      const { POST } = await import("@/app/api/admin/branch/sync/route")
      await POST(syncRequest({ sources: ["rev"], revSnapshotReread: value }))

      expect(runAll).toHaveBeenCalledWith({ trigger: "manual", sources: ["rev"] })
    },
  )

  it("관리자 문이 막으면 runAll 을 부르지 않는다(스냅샷 다시 읽기 포함)", async () => {
    const { NextResponse } = await import("next/server")
    verifyAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }))

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest({ sources: ["rev"], revSnapshotReread: true }))

    expect(response.status).toBe(403)
    expect(runAll).not.toHaveBeenCalled()
  })

  it("DSH 성공 + HW 실패는 partial — DSH 캐시는 만료한다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "hw: boom", rev: 0, dsh: 40, dshOk: true, hw: undefined, ranSources: ["dsh", "hw"], revSheetLock: LOCK })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest({ sources: ["rev", "hw"] }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.outcome).toBe("partial")
    expect(expiredTags()).toEqual(expect.arrayContaining(["branch-dsh", "branch-kpi"]))
    expect(expiredTags()).not.toContain("branch-hw")
    expect(expiredTags()).not.toContain("branch-rev-deals")
  })

  it("DSH 실패면 실행 기록 캐시만 만료한다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "rev: [DSH·KPI] boom", rev: 0, dsh: 0, dshOk: false, ranSources: ["dsh"], revSheetLock: LOCK })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const body = await (await POST(syncRequest({ sources: ["rev"] }))).json()

    expect(body.outcome).toBe("failed")
    expect(expiredTags()).toEqual(expect.arrayContaining(["branch-sync-runs"]))
    expect(expiredTags()).not.toContain("branch-dsh")
  })
})

describe("GET /api/cron/sync-branch — 시트 고정 뒤", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("DSH·HW 런은 링크 유지보수 없이 DSH·HW 캐시만 만료한다", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret")
    runAll.mockResolvedValue({ ok: true, dsh: 40, dshOk: true, hw: HW, ranSources: ["dsh", "hw"], revSheetLock: LOCK })

    const { GET } = await import("@/app/api/cron/sync-branch/route")
    const response = await GET(
      new NextRequest("https://classin.kr/api/cron/sync-branch", { headers: { authorization: "Bearer cron-test-secret" } }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(runAll).toHaveBeenCalledWith({ trigger: "cron" })
    expect(body.outcome).toBe("done")
    expect(runBranchRevLinkMaintenance).not.toHaveBeenCalled()
    expect(expiredTags()).toEqual(expect.arrayContaining(["branch-dsh", "branch-hw"]))
    expect(expiredTags()).not.toContain("branch-rev-deals")
  })
})
