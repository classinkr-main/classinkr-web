import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const convertLeadToCrm = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/crm/lead-conversion", () => ({
  convertLeadToCrm,
  LEAD_CONVERSION_FAILURE_STATUS: { not_found: 404, already_converted: 409, lead_update_failed: 500 },
}))

function bulkRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/leads/bulk-convert", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

async function callRoute(body: unknown) {
  const { POST } = await import("@/app/api/admin/leads/bulk-convert/route")
  return POST(bulkRequest(body))
}

function successFor(leadId: string) {
  return {
    ok: true,
    customer: { id: `cust-${leadId}`, name: `학원 ${leadId}` },
    deal: { id: `deal-${leadId}`, deal_code: `D-${leadId}` },
    links: { deal: `/admin/crm/deals/orders?deal=deal-${leadId}`, customer: "/admin/crm/customers/unified?q=x" },
  }
}

describe("POST /api/admin/leads/bulk-convert", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  function mockAdmin() {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
  }

  it("성공·이미 전환·사고를 각각 converted/skipped/failed로 분류한다", async () => {
    mockAdmin()
    convertLeadToCrm.mockImplementation(async (leadId: string) => {
      if (leadId === "lead-ok") return successFor(leadId)
      if (leadId === "lead-done") return { ok: false, code: "already_converted", error: "이미 전환된 리드입니다." }
      throw new Error("deals insert failed")
    })

    const response = await callRoute({ ids: ["lead-ok", "lead-done", "lead-boom"] })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      requested: 3,
      converted: 1,
      skipped: 1,
      failed: 1,
    })
    // 한 건이 던져도 나머지는 계속 전환된다.
    expect(convertLeadToCrm).toHaveBeenCalledTimes(3)
  })

  it("중복 id는 한 번만 전환한다", async () => {
    mockAdmin()
    convertLeadToCrm.mockImplementation(async (leadId: string) => successFor(leadId))

    const response = await callRoute({ ids: ["lead-1", "lead-1", "lead-2"] })

    await expect(response.json()).resolves.toMatchObject({ requested: 2, converted: 2 })
    expect(convertLeadToCrm).toHaveBeenCalledTimes(2)
  })

  it("성공 행은 고객·딜 딥링크를 함께 돌려준다", async () => {
    mockAdmin()
    convertLeadToCrm.mockImplementation(async (leadId: string) => successFor(leadId))

    const response = await callRoute({ ids: ["lead-1"] })
    const body = (await response.json()) as { results: Array<Record<string, unknown>> }

    expect(body.results[0]).toMatchObject({
      leadId: "lead-1",
      ok: true,
      dealId: "deal-lead-1",
      dealCode: "D-lead-1",
      dealUrl: "/admin/crm/deals/orders?deal=deal-lead-1",
    })
  })

  it("상한(25건)을 넘으면 전환을 시작하지 않고 400으로 막는다", async () => {
    mockAdmin()
    const ids = Array.from({ length: 26 }, (_, i) => `lead-${i}`)

    const response = await callRoute({ ids })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ limit: 25 })
    expect(convertLeadToCrm).not.toHaveBeenCalled()
  })

  it("ids가 배열이 아니거나 비면 400", async () => {
    mockAdmin()

    expect((await callRoute({})).status).toBe(400)
    vi.resetModules()
    expect((await callRoute({ ids: ["", "  "] })).status).toBe(400)
    expect(convertLeadToCrm).not.toHaveBeenCalled()
  })

  it("인증 실패 응답은 그대로 통과시킨다", async () => {
    // 가드는 거절 시 NextResponse를 돌려준다 — 라우트가 instanceof로 판정해 그대로 반환해야 한다.
    const { NextResponse } = await import("next/server")
    requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))

    const response = await callRoute({ ids: ["lead-1"] })

    expect(response.status).toBe(403)
    expect(convertLeadToCrm).not.toHaveBeenCalled()
  })
})
