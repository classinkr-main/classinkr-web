// 동기화 라우트의 캐시 만료와 결과 계약.
//
// 항목 4(최종 수리): runAll은 rev/hw 중 하나만 실패해도 ok=false로 뭉뚱그린다(lib/branch/sync/run-all.ts).
// 무효화가 `if (result.ok)` 안에만 있으면 이미 DB에 반영된 성공 소스를 캐시가 계속 가렸다 — 그래서 소스별
// 성공 신호(revOk, hw 결과 객체)로 그 소스의 묶음만 만료한다.
//
// 라운드 5(2026-09-23, S-1·S-2 — docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md §7):
// - 만료는 revalidateTag(tag, "max")(stale-while-revalidate)가 아니라 { expire: 0 } — 동기화 직후 첫 조회가
//   옛 값을 받지 않는다. 태그는 lib/server/sync-cache-tags.ts 묶음(바깥·안쪽 캐시 태그를 함께)으로 고정.
// - 응답에 outcome(done·running·partial·failed)을 더하고, 잠김이면 그 실행의 startedAt을 싣는다. 기존 필드와
//   HTTP 상태 코드는 그대로다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const runAll = vi.fn()
const runBranchRevLinkMaintenance = vi.fn()
const revalidateTag = vi.fn()

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin }))
vi.mock("@/lib/admin-crm-revenue", () => ({ ADMIN_CRM_REVENUE_CACHE_TAG: "admin-crm-revenue" }))
vi.mock("@/lib/admin-crm-revenue-sheet", () => ({ ADMIN_CRM_REVENUE_SHEET_CACHE_TAG: "admin-crm-revenue-sheet" }))
vi.mock("@/lib/branch/sync/run-all", () => ({ runAll }))
vi.mock("@/lib/repositories/branch-hw", () => ({ BRANCH_HW_CACHE_TAG: "branch-hw" }))
vi.mock("@/lib/repositories/branch-deals", () => ({ BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals" }))
vi.mock("@/lib/repositories/branch-dsh-kpi-mirror", () => ({
  BRANCH_DSH_CACHE_TAG: "branch-dsh",
  BRANCH_KPI_CACHE_TAG: "branch-kpi",
}))
vi.mock("@/lib/repositories/branch-sync", () => ({ BRANCH_SYNC_RUNS_CACHE_TAG: "branch-sync-runs" }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ HARDWARE_INVENTORY_CACHE_TAG: "hardware-inventory" }))
vi.mock("@/lib/repositories/sales-ledger-imports", () => ({ SALES_LEDGER_IMPORTS_CACHE_TAG: "sales-ledger-imports" }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ runBranchRevLinkMaintenance }))
vi.mock("next/cache", () => ({ revalidateTag }))

const EXPIRE_NOW = { expire: 0 }
const REV_BUNDLE = [
  "branch-seg",
  "branch-dsh",
  "branch-kpi",
  "branch-rev-deals",
  "admin-crm-revenue",
  "admin-crm-revenue-sheet",
  "sales-ledger-imports",
  "branch-sync-runs",
]
const HW_BUNDLE = ["branch-seg", "branch-hw", "hardware-inventory", "branch-sync-runs"]

function syncRequest(body: unknown = {}) {
  return new NextRequest("https://classin.kr/api/admin/branch/sync", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function expiredTags() {
  return revalidateTag.mock.calls.map((call) => call[0] as string)
}

describe("POST /api/admin/branch/sync — 소스별 즉시 만료 (항목 4 + 라운드 5 S-2)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("모든 만료 호출이 { expire: 0 }이다 — stale-while-revalidate(\"max\")를 쓰지 않는다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: true, rev: 10, revOk: true, hw: { inbound: 1, outbound: 1, stock: 1, sales: 1 } })
    runBranchRevLinkMaintenance.mockResolvedValue({ confirmed: 0 })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    await POST(syncRequest())

    expect(revalidateTag).toHaveBeenCalled()
    for (const call of revalidateTag.mock.calls) expect(call[1]).toEqual(EXPIRE_NOW)
  })

  it("rev 성공 + hw 실패(ok=false, revOk)면 REV 묶음만 만료하고 hw 전용 태그는 건드리지 않는다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "hw: boom", rev: 385, revOk: true, hw: undefined })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(500)
    expect(expiredTags()).toEqual(expect.arrayContaining(REV_BUNDLE))
    expect(expiredTags()).not.toContain("branch-hw")
    expect(expiredTags()).not.toContain("hardware-inventory")
  })

  it("hw가 성공 객체를 돌려주면(rev만 실패) HW 묶음을 만료하고 REV 미러 태그는 건드리지 않는다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({
      ok: false,
      error: "rev: boom",
      rev: 0,
      revOk: false,
      hw: { inbound: 1, outbound: 2, stock: 3, sales: 4 },
    })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(500)
    expect(expiredTags()).toEqual(expect.arrayContaining(HW_BUNDLE))
    expect(expiredTags()).not.toContain("branch-rev-deals")
    expect(expiredTags()).not.toContain("admin-crm-revenue-sheet")
  })

  it("skipped(다른 동기화 진행 중)면 아무 태그도 만료하지 않는다 — 실제로 아무것도 안 바뀌었으므로", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, skipped: true, runningSince: "2026-09-23T08:00:00.000Z" })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(200)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("완전 성공이면 두 묶음을 만료하되 같은 태그는 한 번만(중복 제거), 링크 유지보수 뒤 매칭 묶음을 한 번 더", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: true, rev: 10, revOk: true, hw: { inbound: 1, outbound: 1, stock: 1, sales: 1 } })
    runBranchRevLinkMaintenance.mockResolvedValue({ reattach: { reattached: 1 }, candidates: { inserted: 2 } })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(200)
    expect(expiredTags()).toEqual(expect.arrayContaining([...REV_BUNDLE, ...HW_BUNDLE]))
    expect(expiredTags().filter((tag) => tag === "branch-seg")).toHaveLength(1)
    // 링크 유지보수(재부착·후보 생성)가 crm_source_links를 다시 바꾼 뒤에도 매출시트 표시를 한 번 더 만료한다.
    const maintenanceOrder = runBranchRevLinkMaintenance.mock.invocationCallOrder[0]
    const sheetCallsAfterMaintenance = revalidateTag.mock.calls.filter(
      (call, index) => call[0] === "admin-crm-revenue-sheet" && revalidateTag.mock.invocationCallOrder[index] > maintenanceOrder,
    )
    expect(sheetCallsAfterMaintenance).toHaveLength(1)
  })

  it("hw만 요청된 동기화가 실패해도 rev 계열 태그는 건드리지 않고 상태 묶음만 만료한다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "hw: boom", hw: undefined })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    await POST(syncRequest({ sources: ["hw"] }))

    expect(expiredTags().sort()).toEqual(["branch-seg", "branch-sync-runs"])
  })

  it("rev만 요청된 동기화가 완전히 실패하면 매출시트·REV 미러 태그를 건드리지 않는다 — 스냅샷이 안 바뀌었으므로", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "rev: boom", rev: 0, revOk: false })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    await POST(syncRequest({ sources: ["rev"] }))

    expect(expiredTags()).not.toContain("admin-crm-revenue-sheet")
    expect(expiredTags()).not.toContain("branch-rev-deals")
    expect(expiredTags()).toEqual(expect.arrayContaining(["branch-sync-runs"]))
  })
})

describe("POST /api/admin/branch/sync — 결과 계약 outcome (라운드 5 S-1)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("잠김(skipped)은 200 + outcome=running + 잠금을 잡은 실행의 startedAt", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, skipped: true, runningSince: "2026-09-23T08:00:00.000Z" })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest({ sources: ["rev"] }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, skipped: true, outcome: "running", startedAt: "2026-09-23T08:00:00.000Z" }),
    )
  })

  it("완전 성공은 200 + outcome=done, 기존 필드(revImport·warnings·crmLinks)는 그대로 싣는다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({
      ok: true,
      rev: 385,
      revOk: true,
      warnings: ["REV 시트가 범위 상한(1000행)에 닿았습니다"],
      revImport: { status: "unchanged", runId: "run-1", capturedAt: "2026-09-23T08:00:00Z", lineCount: 385 },
    })
    runBranchRevLinkMaintenance.mockResolvedValue({ confirmed: 0 })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest({ sources: ["rev"] }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.outcome).toBe("done")
    expect(body.warnings).toEqual(["REV 시트가 범위 상한(1000행)에 닿았습니다"])
    expect(body.revImport).toEqual(expect.objectContaining({ status: "unchanged" }))
    expect(body.crmLinks).toEqual({ confirmed: 0 })
  })

  it("한 소스만 성공한 부분 실패는 500 + outcome=partial", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "hw: boom", rev: 385, revOk: true })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ outcome: "partial", error: "hw: boom" }))
  })

  it("전 소스 실패는 500 + outcome=failed", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "rev: The caller does not have permission", rev: 0, revOk: false })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest({ sources: ["rev"] }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ outcome: "failed" }))
  })
})
