import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const listAdminUserDirectoryCached = vi.fn()
const getLeads = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/admin-users", () => ({ listAdminUserDirectoryCached }))
vi.mock("@/lib/repositories/leads", () => ({ getLeads }))
vi.mock("@/lib/crm/lead-assignment-snapshot", () => ({
  buildLeadAssignmentSnapshotToken: () => "snapshot-v1",
}))

function request(ids: string[]) {
  return new NextRequest("https://classin.kr/api/admin/leads/assignment-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  })
}

async function post(ids: string[]) {
  const { POST } = await import("@/app/api/admin/leads/assignment-preview/route")
  return POST(request(ids))
}

describe("POST /api/admin/leads/assignment-preview", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "admin-1" })
    listAdminUserDirectoryCached.mockResolvedValue({
      health: { ok: true, message: null },
      crmOwners: [{ ownerKey: "Owner A" }],
    })
    getLeads.mockResolvedValue([
      {
        id: "lead-1",
        source: "meta_lead_ads",
        name: "실제 리드",
        phone: "010-1111-2222",
        timestamp: new Date().toISOString(),
        status: "new",
        confirmed_at: new Date().toISOString(),
      },
      {
        id: "lead-2",
        source: "meta_lead_ads",
        name: "중복 상대",
        phone: "01011112222",
        timestamp: new Date().toISOString(),
        status: "new",
        confirmed_at: new Date().toISOString(),
      },
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("선택 밖 중복 상대를 찾아 차단하고 PII 없이 토큰·집계를 반환한다", async () => {
    const response = await post(["lead-1"])
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      snapshotToken: "snapshot-v1",
      rosterHealthy: true,
      manualReviewReady: 0,
      partialDuplicateClusters: 1,
    })
    expect(JSON.stringify(body)).not.toContain("010-1111-2222")
  })

  it("담당자 명단 장애는 미리보기부터 503으로 닫힌다", async () => {
    listAdminUserDirectoryCached.mockResolvedValueOnce({
      health: { ok: false, message: "정본 명단 경고" },
      crmOwners: [],
    })

    expect((await post(["lead-1"])).status).toBe(503)
  })

  it("빈 요청과 500건 초과 요청을 데이터 조회 전에 거부한다", async () => {
    expect((await post([])).status).toBe(400)
    expect((await post(Array.from({ length: 501 }, (_, index) => `lead-${index}`))).status).toBe(400)
    expect(getLeads).not.toHaveBeenCalled()
  })
})
