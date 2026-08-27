import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const listAdminUserDirectoryCached = vi.fn()
const assignLeads = vi.fn()
const assignLeadsGuarded = vi.fn()
const getLeads = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/admin-users", () => ({
  listAdminUserDirectoryCached,
  ownerLookupKeys: (owner: { ownerKey: string; displayName: string; ownerAliases: string[] }) => [
    owner.ownerKey,
    owner.displayName,
    ...owner.ownerAliases,
  ],
}))

vi.mock("@/lib/repositories/leads", () => ({ assignLeads, assignLeadsGuarded, getLeads }))

vi.mock("@/lib/crm/lead-assignment-snapshot", () => ({
  buildLeadAssignmentSnapshotToken: () => "snapshot-v1",
  buildLeadAssignmentExpectedVersions: () => ({ "lead-1": "2026-08-26T00:00:00.000Z" }),
}))

const OWNER = {
  ownerKey: "Hwang Chanwoo",
  displayName: "황찬우",
  ownerAliases: ["Chanwoo"],
}

const SAFE_LEAD = {
  id: "lead-1",
  source: "meta_lead_ads",
  name: "운영 리드",
  phone: "010-1234-5678",
  timestamp: "2026-08-26T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
  status: "new" as const,
  confirmed_at: "2026-08-26T00:01:00.000Z",
}

function patchRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/leads/bulk-assign", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function callPatch(body: unknown) {
  const { PATCH } = await import("@/app/api/admin/leads/bulk-assign/route")
  return PATCH(patchRequest(body))
}

function reviewedBody(overrides: Record<string, unknown> = {}) {
  return {
    ids: ["lead-1"],
    assigned_to: "chanwoo",
    mode: "manual_reviewed",
    reasonCode: "operator_reviewed",
    snapshotToken: "snapshot-v1",
    ...overrides,
  }
}

describe("PATCH /api/admin/leads/bulk-assign", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "admin-1", name: "운영자" })
    listAdminUserDirectoryCached.mockResolvedValue({
      health: { ok: true, message: null },
      crmOwners: [OWNER],
    })
    getLeads.mockResolvedValue([SAFE_LEAD])
    assignLeadsGuarded.mockResolvedValue([{ ...SAFE_LEAD, assigned_to: OWNER.ownerKey }])
    assignLeads.mockResolvedValue([{ ...SAFE_LEAD, assigned_to: undefined }])
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("안전 미리보기와 정규 ownerKey를 검증한 뒤 guarded RPC 저장을 한 번 호출한다", async () => {
    const response = await callPatch(reviewedBody())

    expect(response.status).toBe(200)
    expect(assignLeadsGuarded).toHaveBeenCalledTimes(1)
    expect(assignLeadsGuarded).toHaveBeenCalledWith(expect.objectContaining({
      ids: ["lead-1"],
      assignedTo: "Hwang Chanwoo",
      reasonCode: "operator_reviewed",
    }))
    expect(assignLeads).not.toHaveBeenCalled()
  })

  it("없는 ID가 하나라도 있으면 어떤 쓰기도 하기 전에 409로 닫힌다", async () => {
    const response = await callPatch(reviewedBody({ ids: ["lead-1", "missing"] }))

    expect(response.status).toBe(409)
    expect(assignLeadsGuarded).not.toHaveBeenCalled()
    expect(assignLeads).not.toHaveBeenCalled()
  })

  it("미리보기 토큰·수동 검토 사유가 없으면 배정하지 않는다", async () => {
    const response = await callPatch({ ids: ["lead-1"], assigned_to: "Chanwoo" })

    expect(response.status).toBe(409)
    expect(assignLeadsGuarded).not.toHaveBeenCalled()
  })

  it("미확인 리드는 올바른 담당자여도 차단한다", async () => {
    getLeads.mockResolvedValueOnce([{ ...SAFE_LEAD, confirmed_at: undefined }])

    const response = await callPatch(reviewedBody())

    expect(response.status).toBe(409)
    expect(assignLeadsGuarded).not.toHaveBeenCalled()
  })

  it("명단 health가 비정상이면 fail-closed 503을 반환한다", async () => {
    listAdminUserDirectoryCached.mockResolvedValueOnce({
      health: { ok: false, message: "정본 스키마 경고" },
      crmOwners: [OWNER],
    })

    const response = await callPatch(reviewedBody())

    expect(response.status).toBe(503)
    expect(assignLeadsGuarded).not.toHaveBeenCalled()
  })

  it("저장 직전 버전 충돌은 부분 성공 대신 409로 반환한다", async () => {
    assignLeadsGuarded.mockRejectedValueOnce(new Error("lead assignment snapshot changed"))

    const response = await callPatch(reviewedBody())

    expect(response.status).toBe(409)
  })

  it("배정 해제는 존재 확인 뒤 정본 명단 조회 없이 가역 저장한다", async () => {
    const response = await callPatch({ ids: ["lead-1"], assigned_to: null })

    expect(response.status).toBe(200)
    expect(listAdminUserDirectoryCached).not.toHaveBeenCalled()
    expect(assignLeads).toHaveBeenCalledWith(["lead-1"], null)
  })

  it("빈 ID와 500건 초과 요청을 저장 전에 거부한다", async () => {
    expect((await callPatch({ ids: [], assigned_to: null })).status).toBe(400)
    expect((await callPatch({
      ids: Array.from({ length: 501 }, (_, index) => `lead-${index}`),
      assigned_to: null,
    })).status).toBe(400)
    expect(getLeads).not.toHaveBeenCalled()
  })
})
