/**
 * H1 — GET /api/admin/crm/home/priority-queue 의 force 관통 계약.
 *
 * 클라이언트(CrmPriorityQueuePanel)는 새로고침에 `&force=1`을 붙인다. 라우트는 overview 라우트와
 * 같은 규칙(파라미터 존재 여부)으로 이를 읽어 리포지토리에 force를 넘기고, 응답은 브라우저
 * 프라이빗 캐시에 남기지 않는다(no-store).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getCrmPriorityQueue: vi.fn(),
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
vi.mock("@/lib/repositories/crm-priority-queue", () => ({
  getCrmPriorityQueue: mocks.getCrmPriorityQueue,
}))

const QUEUE_STUB = {
  generatedAt: "2026-09-12T00:00:00.000Z",
  sources: { leadsOk: true, neoAccountsOk: true, tasksOk: true, warnings: [] },
  summary: {},
  buckets: [],
  lanes: [],
  owners: [],
  items: [],
}

async function loadRoute() {
  vi.resetModules()
  return import("@/app/api/admin/crm/home/priority-queue/route")
}

describe("GET /api/admin/crm/home/priority-queue force 관통 (H1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1", role: "ADMIN" })
    mocks.getCrmPriorityQueue.mockResolvedValue(QUEUE_STUB)
  })

  it("?force=1 이면 리포지토리에 force=true를 넘기고 Cache-Control: no-store로 응답한다", async () => {
    const { GET } = await loadRoute()

    const response = await GET(
      new NextRequest("https://classin.kr/api/admin/crm/home/priority-queue?limit=50&source=customer&v=3&force=1")
    )

    expect(response.status).toBe(200)
    expect(mocks.getCrmPriorityQueue).toHaveBeenCalledTimes(1)
    expect(mocks.getCrmPriorityQueue).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, source: "customer", force: true })
    )
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("force가 없으면 force=false로 부르고 표준 어드민 프라이빗 캐시 헤더를 유지한다", async () => {
    const { GET } = await loadRoute()

    const response = await GET(
      new NextRequest("https://classin.kr/api/admin/crm/home/priority-queue?limit=50&source=customer&v=3")
    )

    expect(response.status).toBe(200)
    expect(mocks.getCrmPriorityQueue).toHaveBeenCalledWith(expect.objectContaining({ force: false }))
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30, stale-while-revalidate=120")
  })
})
