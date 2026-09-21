/**
 * A4 — GET /api/admin/crm/events의 from/to(기간 칩) 파라미터 파싱 계약.
 * 잘못된 값(파싱 실패)은 조용히 무시(undefined)한다 — 400을 던지지 않고 무제한 조회로 폴백.
 * POST는 이 변경의 대상이 아니므로 다루지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  listCrmCustomerEvents: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["admin"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/crm-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/crm-events")>("@/lib/repositories/crm-events")
  return {
    ...actual,
    listCrmCustomerEvents: mocks.listCrmCustomerEvents,
  }
})

const EVENTS_RESULT = {
  generatedAt: "2026-09-21T00:00:00.000Z",
  health: { ok: true, message: null },
  summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 },
  pagination: { limit: 50, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
  rows: [],
}

async function loadRoute() {
  vi.resetModules()
  return import("@/app/api/admin/crm/events/route")
}

describe("GET /api/admin/crm/events from/to 파싱 (A4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1", role: "ADMIN" })
    mocks.listCrmCustomerEvents.mockResolvedValue(EVENTS_RESULT)
  })

  it("유효한 from·to를 ISO로 정규화해 리포지토리에 넘긴다", async () => {
    const { GET } = await loadRoute()

    const response = await GET(
      new NextRequest(
        "https://classin.kr/api/admin/crm/events?from=2026-09-15T00:00:00.000Z&to=2026-09-21T23:59:59.999Z"
      )
    )

    expect(response.status).toBe(200)
    expect(mocks.listCrmCustomerEvents).toHaveBeenCalledWith(
      expect.objectContaining({ from: "2026-09-15T00:00:00.000Z", to: "2026-09-21T23:59:59.999Z" })
    )
  })

  it("잘못된 값은 무시(undefined)하고 200으로 응답한다(400 아님)", async () => {
    const { GET } = await loadRoute()

    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/events?from=not-a-date&to=역시-아님"))

    expect(response.status).toBe(200)
    expect(mocks.listCrmCustomerEvents).toHaveBeenCalledWith(
      expect.objectContaining({ from: undefined, to: undefined })
    )
  })

  it("from/to가 없으면 undefined로 넘긴다(기존 무제한 조회 동작 불변)", async () => {
    const { GET } = await loadRoute()

    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/events?limit=10"))

    expect(response.status).toBe(200)
    expect(mocks.listCrmCustomerEvents).toHaveBeenCalledWith(
      expect.objectContaining({ from: undefined, to: undefined })
    )
  })
})
