import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 드로어 단건 담당자 변경 — 대량 배정의 안전 코호트 조건 없이 전환 리드·재배정도 저장돼야 한다.
const requireVerifiedAdminContext = vi.fn()
const listAdminUserDirectoryCached = vi.fn()
const getLeadById = vi.fn()
const updateLead = vi.fn()
const logAdminAudit = vi.fn()

class LeadVersionConflictError extends Error {}

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit }))
vi.mock("@/lib/repositories/admin-users", () => ({
  listAdminUserDirectoryCached,
  ownerLookupKeys: (owner: { ownerKey: string; displayName: string; ownerAliases: string[] }) => [
    owner.ownerKey,
    owner.displayName,
    ...owner.ownerAliases,
  ],
}))
vi.mock("@/lib/repositories/leads", () => ({ getLeadById, updateLead, LeadVersionConflictError }))

const OWNER = { ownerKey: "MOON", displayName: "문", ownerAliases: ["moon-alias"] }

const CONVERTED_LEAD = {
  id: "lead-1",
  source: "contact_page",
  name: "이태현",
  timestamp: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
  status: "converted" as const,
  assigned_to: "classin-admin",
}

async function callPatch(body: unknown) {
  const { PATCH } = await import("@/app/api/admin/leads/[id]/assignee/route")
  return PATCH(
    new NextRequest("https://classin.kr/api/admin/leads/lead-1/assignee", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "lead-1" }) }
  )
}

describe("PATCH /api/admin/leads/[id]/assignee", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "admin-1", name: "운영자" })
    listAdminUserDirectoryCached.mockResolvedValue({ health: { ok: true, message: null }, crmOwners: [OWNER] })
    getLeadById.mockResolvedValue(CONVERTED_LEAD)
    updateLead.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
      ...CONVERTED_LEAD,
      id,
      ...patch,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("reassigns a converted, already-assigned lead to the canonical owner key with a row lock", async () => {
    const res = await callPatch({ assigned_to: "moon-alias", expectedUpdatedAt: CONVERTED_LEAD.updated_at })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.lead.assigned_to).toBe("MOON")
    expect(updateLead).toHaveBeenCalledWith(
      "lead-1",
      { assigned_to: "MOON" },
      { expectedUpdatedAt: CONVERTED_LEAD.updated_at }
    )
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.assignment.single",
        targetId: "lead-1",
        payload: expect.objectContaining({ previousAssignedTo: "classin-admin", assignedTo: "MOON" }),
      })
    )
  })

  it("unassigns with null without consulting the owner directory", async () => {
    const res = await callPatch({ assigned_to: null })
    expect(res.status).toBe(200)
    expect(listAdminUserDirectoryCached).not.toHaveBeenCalled()
    expect(updateLead).toHaveBeenCalledWith("lead-1", { assigned_to: null }, { expectedUpdatedAt: undefined })
  })

  it("skips the write when the owner is unchanged", async () => {
    getLeadById.mockResolvedValue({ ...CONVERTED_LEAD, assigned_to: "MOON" })
    const res = await callPatch({ assigned_to: "MOON" })
    expect(res.status).toBe(200)
    expect((await res.json()).changed).toBe(false)
    expect(updateLead).not.toHaveBeenCalled()
    expect(logAdminAudit).not.toHaveBeenCalled()
  })

  it("rejects owners outside the verified CRM roster", async () => {
    const res = await callPatch({ assigned_to: "someone-else" })
    expect(res.status).toBe(409)
    expect(updateLead).not.toHaveBeenCalled()
  })

  it("fails closed when the roster is unhealthy", async () => {
    listAdminUserDirectoryCached.mockResolvedValue({
      health: { ok: false, message: "명단 동기화 실패" },
      crmOwners: [OWNER],
    })
    const res = await callPatch({ assigned_to: "MOON" })
    expect(res.status).toBe(503)
    expect(updateLead).not.toHaveBeenCalled()
  })

  it("returns 409 on a concurrent edit", async () => {
    updateLead.mockRejectedValue(new LeadVersionConflictError("다른 곳에서 먼저 이 리드를 수정했습니다."))
    const res = await callPatch({ assigned_to: "MOON", expectedUpdatedAt: "2026-10-01T00:00:00.000Z" })
    expect(res.status).toBe(409)
    expect(logAdminAudit).not.toHaveBeenCalled()
  })

  it("returns 404 for a missing lead and 400 for a bad body", async () => {
    getLeadById.mockResolvedValue(null)
    expect((await callPatch({ assigned_to: "MOON" })).status).toBe(404)
    expect((await callPatch({})).status).toBe(400)
    expect((await callPatch({ assigned_to: 3 })).status).toBe(400)
  })
})
