import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// /api/admin/team-contacts — 역할 경계(읽기 SUPER_ADMIN·ADMIN, 쓰기 SUPER_ADMIN 만), 검사·미적용·영역 겹침 응답,
// CSV 미리보기는 쓰지 않고 넣기만 쓴다. 저장소는 가짜다(DB 를 부르지 않는다). 값은 지어낸 것이다.

const mocks = vi.hoisted(() => ({
  role: "SUPER_ADMIN",
  logAdminAudit: vi.fn(),
  listTeamContacts: vi.fn(),
  createTeamContact: vi.fn(),
  getTeamContact: vi.fn(),
  updateTeamContact: vi.fn(),
  setTeamContactActive: vi.fn(),
  confirmTeamContact: vi.fn(),
  applyTeamContactImport: vi.fn(),
}))

// 실제 역할 판정(hasAdminApiRole)으로 라우트가 넘긴 역할 묶음을 검사한다 — 세션 조회만 가짜.
vi.mock("@/lib/admin-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth")
  return {
    ...actual,
    requireVerifiedAdminContext: vi.fn(async (_req: unknown, roles: readonly string[]) =>
      actual.hasAdminApiRole(mocks.role, roles as Parameters<typeof actual.hasAdminApiRole>[1])
        ? { source: "supabase", role: mocks.role, name: "관리자 갑", userId: "user-1", capabilities: [] }
        : NextResponse.json({ error: "Forbidden" }, { status: 403 })
    ),
  }
})
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.logAdminAudit }))
vi.mock("@/lib/repositories/team-contacts", async () => {
  class TeamContactsNotReadyError extends Error {}
  class TeamContactAreaTakenError extends Error {}
  return {
    TeamContactsNotReadyError,
    TeamContactAreaTakenError,
    TEAM_CONTACTS_NOT_READY_MESSAGE: "표 미적용",
    listTeamContacts: mocks.listTeamContacts,
    createTeamContact: mocks.createTeamContact,
    getTeamContact: mocks.getTeamContact,
    updateTeamContact: mocks.updateTeamContact,
    setTeamContactActive: mocks.setTeamContactActive,
    confirmTeamContact: mocks.confirmTeamContact,
    applyTeamContactImport: mocks.applyTeamContactImport,
  }
})

const ID = "00000000-0000-4000-8000-000000000001"
const ROW = {
  id: ID,
  org: "KR",
  area: "quote",
  role: "BD 팀 매니저",
  name: "담당자 A",
  deputy: null,
  channel: "위컴 1:1",
  prep: [],
  adminLink: null,
  note: null,
  confirmedAt: null,
  confirmedBy: null,
  active: true,
  sortOrder: 0,
  createdAt: "2026-11-26T00:00:00Z",
  updatedAt: "2026-11-26T00:00:00Z",
}
const HEADER = "업무 영역,예시 질문,1차 담당 역할,1차 담당자,대리 담당자,연락 방법,준비해 갈 것,관련 어드민 화면 링크,비고,확인일"

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const ctx = { params: Promise.resolve({ id: ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.role = "SUPER_ADMIN"
  mocks.listTeamContacts.mockResolvedValue({ available: true, warning: null, rows: [ROW] })
  mocks.createTeamContact.mockResolvedValue(ROW)
  mocks.getTeamContact.mockResolvedValue(ROW)
  mocks.updateTeamContact.mockResolvedValue(ROW)
  mocks.setTeamContactActive.mockResolvedValue({ ...ROW, active: false })
  mocks.confirmTeamContact.mockResolvedValue({ ...ROW, confirmedAt: "2026-11-26" })
  mocks.applyTeamContactImport.mockResolvedValue({ created: 1, updated: 0, failed: [] })
})

describe("GET /api/admin/team-contacts", () => {
  it("ADMIN 은 읽되 쓸 수 없다고 받는다(영역 목록은 코드 정본에서)", async () => {
    mocks.role = "ADMIN"
    const { GET } = await import("@/app/api/admin/team-contacts/route")
    const response = await GET(request("/api/admin/team-contacts", "GET"))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.viewer).toEqual({ canEdit: false })
    expect(body.rows).toHaveLength(1)
    expect(body.areas.KR.map((area: { key: string }) => area.key)).toContain("quote")
    expect(body.areas.HQ.map((area: { key: string }) => area.key)).toContain("camera")
  })

  it.each(["BRANCH", "EDITOR", "VIEWER"])("%s 는 읽지도 못한다(403)", async (role) => {
    mocks.role = role
    const { GET } = await import("@/app/api/admin/team-contacts/route")
    expect((await GET(request("/api/admin/team-contacts", "GET"))).status).toBe(403)
    expect(mocks.listTeamContacts).not.toHaveBeenCalled()
  })

  it("SUPER_ADMIN 은 canEdit, ?inactive=1 이면 비활성 행도", async () => {
    const { GET } = await import("@/app/api/admin/team-contacts/route")
    const body = await (await GET(request("/api/admin/team-contacts?inactive=1", "GET"))).json()
    expect(body.viewer).toEqual({ canEdit: true })
    expect(mocks.listTeamContacts).toHaveBeenCalledWith({ includeInactive: true })
  })
})

describe("쓰기는 SUPER_ADMIN 만", () => {
  it.each(["ADMIN", "BRANCH", "EDITOR"])("%s — 만들기·고치기·비활성화·CSV 넣기 모두 403, 저장소를 부르지 않는다", async (role) => {
    mocks.role = role
    const { POST } = await import("@/app/api/admin/team-contacts/route")
    const item = await import("@/app/api/admin/team-contacts/[id]/route")
    const importRoute = await import("@/app/api/admin/team-contacts/import/route")
    expect((await POST(request("/api/admin/team-contacts", "POST", { org: "KR", area: "quote", name: "담당자 A" }))).status).toBe(403)
    expect((await item.PATCH(request(`/api/admin/team-contacts/${ID}`, "PATCH", { action: "confirm" }), ctx)).status).toBe(403)
    expect((await item.DELETE(request(`/api/admin/team-contacts/${ID}`, "DELETE"), ctx)).status).toBe(403)
    expect((await importRoute.POST(request("/api/admin/team-contacts/import", "POST", { csv: HEADER, apply: true }))).status).toBe(403)
    expect(mocks.createTeamContact).not.toHaveBeenCalled()
    expect(mocks.getTeamContact).not.toHaveBeenCalled()
    expect(mocks.applyTeamContactImport).not.toHaveBeenCalled()
  })

  it("SUPER_ADMIN 만들기 — 201, 감사 기록에는 이름을 옮기지 않는다", async () => {
    const { POST } = await import("@/app/api/admin/team-contacts/route")
    const response = await POST(request("/api/admin/team-contacts", "POST", { org: "KR", area: "quote", role: "BD 팀 매니저", name: "담당자 A" }))
    expect(response.status).toBe(201)
    expect(mocks.createTeamContact).toHaveBeenCalledWith(expect.objectContaining({ org: "KR", area: "quote", name: "담당자 A" }), { name: "관리자 갑" })
    expect(JSON.stringify(mocks.logAdminAudit.mock.calls)).not.toContain("담당자 A")
  })

  it("검사 실패는 400(연락처 값·모르는 영역), 표 미적용은 503, 영역 겹침은 409", async () => {
    const { POST } = await import("@/app/api/admin/team-contacts/route")
    const repo = await import("@/lib/repositories/team-contacts")
    expect((await POST(request("/api/admin/team-contacts", "POST", { org: "KR", area: "quote", name: "담당자 A", channel: "010-0000-0000" }))).status).toBe(400)
    expect((await POST(request("/api/admin/team-contacts", "POST", { org: "KR", area: "nope", name: "담당자 A" }))).status).toBe(400)
    mocks.createTeamContact.mockRejectedValueOnce(new repo.TeamContactsNotReadyError())
    expect((await POST(request("/api/admin/team-contacts", "POST", { org: "KR", area: "quote", name: "담당자 A" }))).status).toBe(503)
    mocks.createTeamContact.mockRejectedValueOnce(new repo.TeamContactAreaTakenError())
    expect((await POST(request("/api/admin/team-contacts", "POST", { org: "KR", area: "quote", name: "담당자 A" }))).status).toBe(409)
  })

  it("PATCH — 확인일 찍기·고치기, 영역은 바꾸지 않는다 · DELETE 는 비활성화", async () => {
    const item = await import("@/app/api/admin/team-contacts/[id]/route")
    expect((await item.PATCH(request(`/api/admin/team-contacts/${ID}`, "PATCH", { action: "confirm" }), ctx)).status).toBe(200)
    expect(mocks.confirmTeamContact).toHaveBeenCalledWith(ID, { name: "관리자 갑" })
    expect((await item.PATCH(request(`/api/admin/team-contacts/${ID}`, "PATCH", { deputy: "담당자 B" }), ctx)).status).toBe(200)
    expect(mocks.updateTeamContact).toHaveBeenCalledWith(ROW, expect.objectContaining({ deputy: "담당자 B", name: "담당자 A" }), { name: "관리자 갑" })
    expect((await item.PATCH(request(`/api/admin/team-contacts/${ID}`, "PATCH", { area: "contract" }), ctx)).status).toBe(400)
    expect((await item.DELETE(request(`/api/admin/team-contacts/${ID}`, "DELETE"), ctx)).status).toBe(200)
    expect(mocks.setTeamContactActive).toHaveBeenCalledWith(ID, false)
  })

  it("없는 id 는 404", async () => {
    const item = await import("@/app/api/admin/team-contacts/[id]/route")
    const bad = { params: Promise.resolve({ id: "not-a-uuid" }) }
    expect((await item.PATCH(request("/api/admin/team-contacts/x", "PATCH", { action: "confirm" }), bad)).status).toBe(404)
    mocks.getTeamContact.mockResolvedValueOnce(null)
    expect((await item.DELETE(request(`/api/admin/team-contacts/${ID}`, "DELETE"), ctx)).status).toBe(404)
  })
})

describe("POST /api/admin/team-contacts/import", () => {
  const CSV = [HEADER, "견적,,,담당자 A,,위컴 1:1,,,,", "계약,,,담당자 C,,,,,,", "없는 영역,,,담당자 D,,,,,,"].join("\n")

  it("미리보기는 쓰지 않고 계획만 돌려준다", async () => {
    const { POST } = await import("@/app/api/admin/team-contacts/import/route")
    const response = await POST(request("/api/admin/team-contacts/import", "POST", { csv: CSV }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.plan.counts).toEqual({ create: 1, update: 0, same: 1, skipped: 1 })
    expect(body.result).toBeUndefined()
    expect(mocks.applyTeamContactImport).not.toHaveBeenCalled()
  })

  it("apply:true 면 그대로인 줄을 빼고 넣는다", async () => {
    const { POST } = await import("@/app/api/admin/team-contacts/import/route")
    const response = await POST(request("/api/admin/team-contacts/import", "POST", { csv: CSV, apply: true }))
    expect(response.status).toBe(200)
    expect(mocks.applyTeamContactImport).toHaveBeenCalledWith([
      expect.objectContaining({ existingId: null, input: expect.objectContaining({ area: "contract", name: "담당자 C" }) }),
    ])
    expect((await response.json()).result).toEqual({ created: 1, updated: 0, failed: [] })
  })

  it("양식이 아니면 400, 비었으면 400, 표 미적용이면 503", async () => {
    const { POST } = await import("@/app/api/admin/team-contacts/import/route")
    expect((await POST(request("/api/admin/team-contacts/import", "POST", { csv: "이름,전화\n담당자 A,x" }))).status).toBe(400)
    expect((await POST(request("/api/admin/team-contacts/import", "POST", { csv: "  " }))).status).toBe(400)
    mocks.listTeamContacts.mockResolvedValueOnce({ available: false, warning: "표 미적용", rows: [] })
    expect((await POST(request("/api/admin/team-contacts/import", "POST", { csv: CSV }))).status).toBe(503)
  })
})
