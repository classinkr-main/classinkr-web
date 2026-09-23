/**
 * unified-01 · unified-10 — GET /api/admin/crm/customers/unified 의 force 관통 계약.
 *
 * 클라이언트(CrmUnifiedCustomersClient)는 새로고침·리드 등록 완료에 `&force=1`을 붙인다. 라우트는
 * 홈 우선순위 큐 라우트(H1)와 같은 규칙(파라미터 존재 여부)으로 이를 읽어 리포지토리에
 * bypassCache를 넘기고, 응답은 브라우저 프라이빗 캐시에 남기지 않는다(no-store).
 * 500 응답 문구는 배너에 그대로 뜨므로 한국어 고정 문구다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getCrmUnifiedCustomers: vi.fn(),
  listAdminUserDirectory: vi.fn(),
  findAdminCrmOwner: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["admin"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/admin-users", () => ({
  CURRENT_ADMIN_OWNER_TOKEN: "__me",
  listAdminUserDirectory: mocks.listAdminUserDirectory,
  findAdminCrmOwner: mocks.findAdminCrmOwner,
}))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({
  getCrmUnifiedCustomers: mocks.getCrmUnifiedCustomers,
}))

const CUSTOMERS_STUB = {
  generatedAt: "2026-09-15T00:00:00.000Z",
  sources: { leadsOk: true, neoAccountsOk: true, portalCustomersOk: true, warnings: [], statuses: [] },
  summary: { total: 0, leadCount: 0, accountCount: 0, highPriorityCount: 0, ownerCount: 0 },
  pagination: { limit: 50, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
  owners: [],
  rows: [],
}

async function loadRoute() {
  vi.resetModules()
  return import("@/app/api/admin/crm/customers/unified/route")
}

describe("GET /api/admin/crm/customers/unified force 관통 (unified-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1", role: "ADMIN" })
    mocks.getCrmUnifiedCustomers.mockResolvedValue(CUSTOMERS_STUB)
  })

  it("?force=1 이면 리포지토리에 bypassCache=true를 넘기고 Cache-Control: no-store로 응답한다", async () => {
    const { GET } = await loadRoute()

    const response = await GET(
      new NextRequest("https://classin.kr/api/admin/crm/customers/unified?limit=50&offset=0&force=1")
    )

    expect(response.status).toBe(200)
    expect(mocks.getCrmUnifiedCustomers).toHaveBeenCalledTimes(1)
    expect(mocks.getCrmUnifiedCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0, bypassCache: true })
    )
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("force가 없으면 bypassCache=false로 부르고 표준 어드민 프라이빗 캐시 헤더를 유지한다", async () => {
    const { GET } = await loadRoute()

    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/unified?limit=50&offset=0"))

    expect(response.status).toBe(200)
    expect(mocks.getCrmUnifiedCustomers).toHaveBeenCalledWith(expect.objectContaining({ bypassCache: false }))
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30, stale-while-revalidate=120")
  })

  it("§13 S4 — ?view=meta_leads · registered_leads 는 화이트리스트를 통과해 서버 필터로 넘어간다", async () => {
    const { GET } = await loadRoute()

    await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/unified?view=meta_leads"))
    expect(mocks.getCrmUnifiedCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ view: "meta_leads" }))

    await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/unified?view=registered_leads"))
    expect(mocks.getCrmUnifiedCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: "registered_leads" })
    )

    // 모르는 값은 여전히 all 로 접는다.
    await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/unified?view=nope"))
    expect(mocks.getCrmUnifiedCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ view: "all" }))
  })

  it("리포지토리 실패는 500 + 한국어 고정 문구로 내려 배너가 그대로 띄울 수 있다 (unified-10)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.getCrmUnifiedCustomers.mockRejectedValueOnce(new Error("boom"))
    const { GET } = await loadRoute()

    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/customers/unified?force=1"))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "통합 고객 목록을 불러오지 못했습니다." })
  })
})
