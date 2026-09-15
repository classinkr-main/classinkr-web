import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 감사 2026-09-07 §9 — getCrmUnifiedCustomers는 자기 주석("내부 일괄 매칭은 전체 고객 집합을
// 읽어야 한다")과 달리 limit을 함수 내부에서 2,000으로 clamp한다. 그 파일은 CRM 코어 소유라
// 고칠 수 없으므로, 캡처 파싱 라우트가 offset 페이지를 이어 붙여 전체 후보 풀을 모은다.
// 이 테스트는 여러 페이지가 실제로 전부 matchCaptureRows에 전달되는지를 고정한다.

const requireVerifiedAdminContext = vi.fn()
const matchCaptureRows = vi.fn()
const getCaptureBatchWithRows = vi.fn()
const replaceCaptureRows = vi.fn()
const getCrmUnifiedCustomers = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/crm/capture/matching", () => ({ matchCaptureRows }))

vi.mock("@/lib/crm/capture/parsers", () => ({
  parseUnstructuredLines: (raw: string) => raw.split("\n").filter(Boolean).map((line) => ({ raw: line })),
  parseTabularGrid: () => ({ rows: [] }),
}))

vi.mock("@/lib/crm/capture/repository", () => ({
  getCaptureBatchWithRows,
  replaceCaptureRows,
}))

vi.mock("@/lib/repositories/crm-unified-customers", () => ({ getCrmUnifiedCustomers }))

function makeCustomerRow(key: string) {
  return { key, source: "customer", name: key } as unknown as { key: string }
}

async function callParse(raw: string) {
  const { POST } = await import("@/app/api/admin/crm/capture/batches/[id]/parse/route")
  const req = new NextRequest("https://classin.kr/api/admin/crm/capture/batches/batch-1/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw, mode: "text" }),
  })
  return POST(req, { params: Promise.resolve({ id: "batch-1" }) })
}

describe("POST capture batches/[id]/parse — 고객 후보 풀 페이지네이션", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
    getCaptureBatchWithRows.mockResolvedValue({
      batch: { id: "batch-1", status: "draft" },
      rows: [],
    })
    replaceCaptureRows.mockResolvedValue([])
    matchCaptureRows.mockReturnValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("hasMore가 true인 동안 offset 페이지를 계속 이어 붙여 전체 후보 풀을 matchCaptureRows에 넘긴다", async () => {
    getCrmUnifiedCustomers
      .mockResolvedValueOnce({
        rows: [makeCustomerRow("a"), makeCustomerRow("b")],
        pagination: { limit: 2000, offset: 0, returned: 2, total: 5, hasMore: true, nextOffset: 2 },
      })
      .mockResolvedValueOnce({
        rows: [makeCustomerRow("c"), makeCustomerRow("d")],
        pagination: { limit: 2000, offset: 2, returned: 2, total: 5, hasMore: true, nextOffset: 4 },
      })
      .mockResolvedValueOnce({
        rows: [makeCustomerRow("e")],
        pagination: { limit: 2000, offset: 4, returned: 1, total: 5, hasMore: false, nextOffset: null },
      })

    const res = await callParse("리드1\n리드2")

    expect(res.status).toBe(200)
    expect(getCrmUnifiedCustomers).toHaveBeenCalledTimes(3)
    expect(getCrmUnifiedCustomers).toHaveBeenNthCalledWith(1, { limit: 2000, offset: 0 })
    expect(getCrmUnifiedCustomers).toHaveBeenNthCalledWith(2, { limit: 2000, offset: 2 })
    expect(getCrmUnifiedCustomers).toHaveBeenNthCalledWith(3, { limit: 2000, offset: 4 })

    const [, passedCustomers] = matchCaptureRows.mock.calls[0]
    expect(passedCustomers.map((row: { key: string }) => row.key)).toEqual(["a", "b", "c", "d", "e"])
  })

  it("첫 페이지에서 hasMore가 false면 한 번만 호출한다(기존 소규모 케이스 회귀 없음)", async () => {
    getCrmUnifiedCustomers.mockResolvedValueOnce({
      rows: [makeCustomerRow("a")],
      pagination: { limit: 2000, offset: 0, returned: 1, total: 1, hasMore: false, nextOffset: null },
    })

    await callParse("리드1")

    expect(getCrmUnifiedCustomers).toHaveBeenCalledTimes(1)
  })
})
