import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getAdminCrmMatchingInbox: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["admin"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/admin-crm-matching", () => ({
  getAdminCrmMatchingInbox: mocks.getAdminCrmMatchingInbox,
}))

describe("GET /api/admin/crm/matching", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1" })
    mocks.getAdminCrmMatchingInbox.mockResolvedValue({ rows: [], page: { total: 0 } })
  })

  it("passes bounded server filters, page and fresh intent to the repository", async () => {
    const { GET } = await import("@/app/api/admin/crm/matching/route")
    const response = await GET(
      new NextRequest(
        "https://classin.kr/api/admin/crm/matching?source=lead&status=confirmed&limit=40&offset=80&name=ClassIn&fresh=1"
      )
    )

    expect(response.status).toBe(200)
    expect(mocks.getAdminCrmMatchingInbox).toHaveBeenCalledWith({
      source: "lead",
      status: "confirmed",
      limit: 40,
      offset: 80,
      name: "ClassIn",
      fresh: true,
    })
  })

  it("rejects invalid filters before running the expensive snapshot", async () => {
    const { GET } = await import("@/app/api/admin/crm/matching/route")
    const response = await GET(
      new NextRequest("https://classin.kr/api/admin/crm/matching?source=unknown&status=review&offset=-1")
    )

    expect(response.status).toBe(400)
    expect(mocks.getAdminCrmMatchingInbox).not.toHaveBeenCalled()
  })
})
