// 최종 수리 — 항목 4: sync 라우트의 revalidateTag 호출이 전부 `if (result.ok)` 게이트 안에만
// 있으면, rev/hw 중 하나만 실패해도(runAll은 부분 실패까지 ok=false로 뭉뚱그린다 —
// lib/branch/sync/run-all.ts: errors.length>0 -> ok:false) 이미 DB에 반영된 성공 소스의
// 변경분을 캐시가 계속 가려서 다음 조회가 stale한 값을 보여줬다.
// 수정: branch-seg는 skipped가 아닌 한 항상(성공/부분실패/완전실패 모두) 무효화하고, hw는
// runAll의 신뢰 가능한 성공 시그널(result.hw 객체 존재)이 있을 때 부분 실패 경로에서도
// 추가로 무효화한다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const runAll = vi.fn()
const runBranchRevLinkMaintenance = vi.fn()
const revalidateTag = vi.fn()

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin }))
vi.mock("@/lib/admin-crm-revenue", () => ({ ADMIN_CRM_REVENUE_CACHE_TAG: "admin-crm-revenue" }))
vi.mock("@/lib/branch/sync/run-all", () => ({ runAll }))
vi.mock("@/lib/repositories/branch-hw", () => ({ BRANCH_HW_CACHE_TAG: "branch-hw" }))
vi.mock("@/lib/repositories/branch-deals", () => ({ BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals" }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ runBranchRevLinkMaintenance }))
vi.mock("next/cache", () => ({ revalidateTag }))

function syncRequest(body: unknown = {}) {
  return new NextRequest("https://classin.kr/api/admin/branch/sync", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

describe("POST /api/admin/branch/sync — 부분 실패 시 캐시 무효화 (항목 4)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("rev 성공 + hw 실패(ok=false)에서도 branch-seg는 무효화하지만, hw 전용 태그는 무효화하지 않는다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "hw: boom", rev: 42, hw: undefined })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(500)
    expect(revalidateTag).toHaveBeenCalledWith("branch-seg", "max")
    expect(revalidateTag).not.toHaveBeenCalledWith("branch-hw", "max")
  })

  it("hw가 성공 객체를 돌려주면(rev만 실패) branch-seg와 함께 BRANCH_HW_CACHE_TAG도 무효화한다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({
      ok: false,
      error: "rev: boom",
      rev: 0,
      hw: { inbound: 1, outbound: 2, stock: 3, sales: 4 },
    })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(500)
    expect(revalidateTag).toHaveBeenCalledWith("branch-seg", "max")
    expect(revalidateTag).toHaveBeenCalledWith("branch-hw", "max")
  })

  it("skipped(다른 동기화 진행 중)면 아무 태그도 무효화하지 않는다 — 실제로 아무것도 안 바뀌었으므로", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, skipped: true })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(200)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("완전 성공(ok=true)에서는 기존과 동일하게 소스별 태그 전체를 무효화하고, branch-seg는 정확히 한 번만 무효화한다(회귀 방지)", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({
      ok: true,
      rev: 10,
      hw: { inbound: 1, outbound: 1, stock: 1, sales: 1 },
    })
    runBranchRevLinkMaintenance.mockResolvedValue({ confirmed: 0 })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    const response = await POST(syncRequest())

    expect(response.status).toBe(200)
    const tags = revalidateTag.mock.calls.map((call) => call[0])
    expect(tags).toEqual(
      expect.arrayContaining([
        "branch-seg",
        "branch-dsh",
        "branch-kpi",
        "branch-rev-deals",
        "admin-crm-revenue",
        "branch-hw",
      ]),
    )
    expect(tags.filter((tag) => tag === "branch-seg")).toHaveLength(1)
  })

  it("hw만 요청된 부분 동기화(sources=['hw'])가 실패해도 rev 전용 태그는 건드리지 않는다", async () => {
    verifyAdmin.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "hw: boom", hw: undefined })

    const { POST } = await import("@/app/api/admin/branch/sync/route")
    await POST(syncRequest({ sources: ["hw"] }))

    expect(revalidateTag).toHaveBeenCalledWith("branch-seg", "max")
    expect(revalidateTag).not.toHaveBeenCalledWith("branch-rev-deals", "max")
    expect(revalidateTag).not.toHaveBeenCalledWith("admin-crm-revenue", "max")
  })
})
