import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({
  requireVerifiedAdminContext: mocks.auth,
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN", "BRANCH"],
}))
vi.mock("@/lib/branch/read-rev-deals", () => ({ readRevDealsPreferActive: mocks.read }))

import { GET } from "@/app/api/admin/crm/performance/route"

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ role: "ADMIN" }) })
afterEach(() => vi.restoreAllMocks())

describe("CRM performance ledger read boundary", () => {
  it("returns a generic failure instead of a cached successful empty report when the ledger fails", async () => {
    mocks.read.mockRejectedValueOnce(new Error("private ledger failure detail"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await GET(new NextRequest("http://localhost/api/admin/crm/performance"))
    expect(response.status).toBe(500)
    expect(response.headers.get("cache-control") ?? "").not.toContain("max-age=30")
    expect(await response.json()).toEqual({ error: "Failed to load CRM revenue performance" })
  })

  it("still returns a normal zero report for a successfully empty ledger", async () => {
    mocks.read.mockResolvedValueOnce([])
    const response = await GET(new NextRequest("http://localhost/api/admin/crm/performance"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ total: 0, dealCount: 0 })
  })

  it("keeps unauthorized requests outside the ledger read", async () => {
    mocks.auth.mockResolvedValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    expect((await GET(new NextRequest("http://localhost/api/admin/crm/performance"))).status).toBe(401)
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
