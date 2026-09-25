/**
 * 세그먼트 허브 API(C안 ②, 2026-09-25) — app/api/admin/crm/segments/**.
 *  - 역할: 목록·상세·회원·드라이런·생성 = CRM_STAFF, 수정·보관 = 소유자 또는 관리자(팀 세그먼트),
 *    자동 태그 켜기·끄기·적용 실행 = 관리자(SUPER_ADMIN·ADMIN)만.
 *  - 남의 "내 것"은 SUPER_ADMIN 에게도 안 보인다(목록·상세 404).
 *  - 표 미적용: 목록 GET 200 available:false, 쓰기 503. 활성 자동 라벨 중복 409.
 *  - 응답 모양은 lib/crm/saved-segment-api.ts 계약.
 */
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedSegmentRecord } from "@/lib/crm/saved-segments"

const mocks = vi.hoisted(() => {
  class SavedSegmentsNotReadyError extends Error {}
  class SavedSegmentAutoTagLabelConflictError extends Error {}
  class SavedSegmentConstraintError extends Error {}
  return {
    SavedSegmentsNotReadyError,
    SavedSegmentAutoTagLabelConflictError,
    SavedSegmentConstraintError,
    requireVerifiedAdminContext: vi.fn(),
    logAdminAudit: vi.fn(),
    listSavedSegments: vi.fn(),
    getSavedSegment: vi.fn(),
    createSavedSegment: vi.fn(),
    updateSavedSegment: vi.fn(),
    archiveSavedSegment: vi.fn(),
    listSavedSegmentDailyPoints: vi.fn(),
    evaluateCrmSegmentFilters: vi.fn(),
    getCrmUnifiedCustomersForExport: vi.fn(),
    detachSegmentAutoTags: vi.fn(),
    runCrmSegmentDaily: vi.fn(),
  }
})

const CRM_STAFF = ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"]

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
  hasAdminApiRole: (role: string, allowed: readonly string[]) => allowed.includes(role.trim().toUpperCase()),
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.logAdminAudit }))
vi.mock("@/lib/repositories/crm-saved-segments", () => ({
  SAVED_SEGMENTS_NOT_READY_MESSAGE: "저장 세그먼트 표가 아직 적용되지 않았습니다.",
  SavedSegmentsNotReadyError: mocks.SavedSegmentsNotReadyError,
  SavedSegmentAutoTagLabelConflictError: mocks.SavedSegmentAutoTagLabelConflictError,
  SavedSegmentConstraintError: mocks.SavedSegmentConstraintError,
  listSavedSegments: mocks.listSavedSegments,
  getSavedSegment: mocks.getSavedSegment,
  createSavedSegment: mocks.createSavedSegment,
  updateSavedSegment: mocks.updateSavedSegment,
  archiveSavedSegment: mocks.archiveSavedSegment,
  listSavedSegmentDailyPoints: mocks.listSavedSegmentDailyPoints,
}))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({
  evaluateCrmSegmentFilters: mocks.evaluateCrmSegmentFilters,
  getCrmUnifiedCustomersForExport: mocks.getCrmUnifiedCustomersForExport,
}))
vi.mock("@/lib/repositories/crm-customer-tags", () => ({ detachSegmentAutoTags: mocks.detachSegmentAutoTags }))
vi.mock("@/lib/server/crm-segment-daily", () => ({ runCrmSegmentDaily: mocks.runCrmSegmentDaily }))

const ADMIN = { userId: "u-admin", role: "ADMIN", name: "관리자" }
const SUPER = { userId: "u-super", role: "SUPER_ADMIN", name: "최고" }
const EDITOR = { userId: "u-editor", role: "EDITOR", name: "편집자" }
const OTHER_EDITOR = { userId: "u-other", role: "EDITOR", name: "다른 편집자" }

const ID_TEAM = "11111111-1111-4111-8111-111111111111"
const ID_MINE = "22222222-2222-4222-8222-222222222222"
const ID_OTHERS_MINE = "33333333-3333-4333-8333-333333333333"
const ID_OR = "44444444-4444-4444-8444-444444444444"

function record(id: string, extra: Partial<SavedSegmentRecord> = {}): SavedSegmentRecord {
  return {
    id,
    name: `세그먼트 ${id.slice(0, 4)}`,
    description: null,
    spec: { expDays: 30 },
    specVersion: 1,
    specHash: "hash",
    visibility: "team",
    ownerUserId: "u-editor",
    ownerName: "편집자",
    autoTagEnabled: false,
    autoTagLabel: null,
    autoUntag: false,
    lastCount: 7,
    lastEvaluatedAt: "2026-09-24T21:00:00.000Z",
    lastRunStatus: "off",
    lastRunDetail: null,
    archivedAt: null,
    archivedBy: null,
    createdBy: "편집자",
    updatedBy: "편집자",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...extra,
  }
}

const SEGMENTS = [
  record(ID_TEAM),
  record(ID_MINE, { visibility: "mine" }),
  record(ID_OTHERS_MINE, { visibility: "mine", ownerUserId: "u-other" }),
  record(ID_OR, { spec: { expDays: 60, anyOf: [{ risk: ["urgent"] }, { noContactDays: 60 }] } }),
]

function evaluation(totals: number[]) {
  return {
    generatedAt: "2026-09-25T00:00:00.000Z",
    meta: { compass: "ok", homeContactDetail: "ok" },
    sources: {
      leadsOk: true,
      neoAccountsOk: true,
      portalCustomersOk: true,
      complete: true,
      tagsOk: true,
      neoLatestSyncedAt: "2026-08-28T00:00:00.000Z",
      neoPartial: false,
    },
    results: totals.map((total) => ({
      total,
      bySource: { lead: total, neo_account: 0, customer: 0, task: 0 },
      keys: [],
      truncated: false,
      noContactRecordCount: 0,
      anyOfCounts: [1, 2],
    })),
  }
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(`https://classin.kr${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function listRoute() {
  return import("@/app/api/admin/crm/segments/route")
}
async function itemRoute() {
  return import("@/app/api/admin/crm/segments/[id]/route")
}
async function runRoute() {
  return import("@/app/api/admin/crm/segments/[id]/run/route")
}
async function membersRoute() {
  return import("@/app/api/admin/crm/segments/[id]/members/route")
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireVerifiedAdminContext.mockResolvedValue(EDITOR)
  mocks.listSavedSegments.mockResolvedValue({ available: true, segments: SEGMENTS })
  mocks.getSavedSegment.mockImplementation(async (id: string) => SEGMENTS.find((segment) => segment.id === id) ?? null)
  mocks.listSavedSegmentDailyPoints.mockResolvedValue({ available: true, points: [] })
  mocks.evaluateCrmSegmentFilters.mockImplementation(async (filters: unknown[]) => evaluation(filters.map((_, index) => 10 + index)))
  mocks.createSavedSegment.mockImplementation(async (input: Record<string, unknown>) =>
    record("55555555-5555-4555-8555-555555555555", {
      name: input.name as string,
      visibility: input.visibility as "team" | "mine",
      ownerUserId: input.ownerUserId as string,
      autoTagEnabled: (input.autoTag as { enabled: boolean }).enabled,
      autoTagLabel: (input.autoTag as { label: string | null }).label,
    })
  )
  mocks.updateSavedSegment.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
    ...SEGMENTS.find((segment) => segment.id === id)!,
    ...(patch.autoTagEnabled !== undefined ? { autoTagEnabled: patch.autoTagEnabled as boolean } : {}),
    ...(patch.autoTagLabel !== undefined ? { autoTagLabel: patch.autoTagLabel as string } : {}),
    ...(patch.visibility !== undefined ? { visibility: patch.visibility as "team" | "mine" } : {}),
    ...(patch.name !== undefined ? { name: patch.name as string } : {}),
    ...(patch.restore ? { archivedAt: null } : {}),
  }))
  mocks.archiveSavedSegment.mockImplementation(async (id: string) => ({
    ...SEGMENTS.find((segment) => segment.id === id)!,
    archivedAt: "2026-09-25T01:00:00.000Z",
    autoTagEnabled: false,
  }))
  mocks.detachSegmentAutoTags.mockResolvedValue({ candidates: 4, removed: 4, failed: 0 })
})

describe("GET /api/admin/crm/segments", () => {
  it("CRM_STAFF 역할로 인증하고, 팀 공유 + 내 것만 싣는다(남의 내 것은 SUPER_ADMIN 에게도 비노출)", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(SUPER)
    const { GET } = await listRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/segments"))
    const body = await response.json()

    expect(mocks.requireVerifiedAdminContext.mock.calls[0][1]).toEqual(CRM_STAFF)
    expect(response.status).toBe(200)
    expect(body.segments.map((segment: { id: string }) => segment.id)).toEqual([ID_TEAM, ID_OR])
    expect(body.scopeCounts).toEqual({ all: 2, team: 2, mine: 0 })
  })

  it("소유자에게는 자기 내 것이 보이고, scope=mine 으로 좁힌다 — 라이브 건수·8주 추이·딥링크", async () => {
    const { GET } = await listRoute()
    const all = await (await GET(new NextRequest("https://classin.kr/api/admin/crm/segments"))).json()
    expect(all.available).toBe(true)
    expect(all.scopeCounts).toEqual({ all: 3, team: 2, mine: 1 })
    expect(all.live).toEqual({ ok: true, compass: "ok", neoStale: true, neoLatestSyncedAt: "2026-08-28T00:00:00.000Z" })

    const team = all.segments.find((segment: { id: string }) => segment.id === ID_TEAM)
    expect(team).toMatchObject({
      isMine: true,
      canEdit: true,
      canManageAutoTag: false,
      specReadable: true,
      andOnly: true,
      labels: ["만료 30일 이내"],
      listHref: "/admin/crm/customers/unified?expDays=30",
      count: 10,
      lastCount: 7,
      autoTag: { enabled: false, label: null, untag: false, scheduleLabel: "매일 06시" },
      trendDays: 0,
    })
    expect(team.trend).toHaveLength(8)
    // OR 세그먼트도 통합 목록 링크를 준다 — 목록은 or= 를 받아 같은 결과를 보이고 편집은 허브에서.
    const orSegment = all.segments.find((segment: { id: string }) => segment.id === ID_OR)
    expect(orSegment).toMatchObject({ andOnly: false })
    expect(orSegment.listHref).toMatch(/^\/admin\/crm\/customers\/unified\?.*or=/)
    expect(orSegment.labels).toEqual(["만료 60일 이내", "(무연락 60일+) 또는 (위험 긴급)"])

    const mine = await (await GET(new NextRequest("https://classin.kr/api/admin/crm/segments?scope=mine"))).json()
    expect(mine.segments.map((segment: { id: string }) => segment.id)).toEqual([ID_MINE])
  })

  it("표 미적용이면 200 available:false + 안내 + 빈 목록", async () => {
    mocks.listSavedSegments.mockResolvedValue({ available: false, warning: "적용 필요", segments: [] })
    const { GET } = await listRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/segments"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ available: false, warning: "적용 필요", segments: [] })
  })

  it("라이브 평가가 실패하면 count=null(0 으로 위장하지 않음), 일별 표가 없으면 trendWarning — 캐시하지 않는다", async () => {
    mocks.evaluateCrmSegmentFilters.mockRejectedValue(new Error("snapshot"))
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({ available: false, warning: "일별 표 없음", points: [] })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { GET } = await listRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/segments"))
    const body = await response.json()
    expect(body.live.ok).toBe(false)
    expect(body.trendWarning).toBe("일별 표 없음")
    expect(body.segments.every((segment: { count: number | null }) => segment.count === null)).toBe(true)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it.each([
    ["핵심 원천 일부 실패(미완성 스냅샷)", { complete: false, portalCustomersOk: false }],
    ["라벨 읽기 실패", { tagsOk: false }],
  ])("%s — 과소 건수를 지금 건수로 싣지 않는다: live.ok=false · count=null(lastCount 폴백) · 캐시하지 않음", async (_label, sources) => {
    mocks.evaluateCrmSegmentFilters.mockImplementation(async (filters: unknown[]) => {
      const batch = evaluation(filters.map(() => 0))
      return { ...batch, meta: { compass: "partial", homeContactDetail: "ok" }, sources: { ...batch.sources, ...sources } }
    })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { GET } = await listRoute()
    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/segments"))
    const body = await response.json()
    expect(response.status).toBe(200)
    // Compass·NEO 상태는 그대로 싣는다(화면 안내용) — ok 만 false.
    expect(body.live).toEqual({ ok: false, compass: "partial", neoStale: true, neoLatestSyncedAt: "2026-08-28T00:00:00.000Z" })
    expect(body.segments.length).toBeGreaterThan(0)
    for (const segment of body.segments as Array<{ count: number | null; lastCount: number | null }>) {
      expect(segment.count).toBeNull()
      expect(segment.lastCount).toBe(7)
    }
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(warn).toHaveBeenCalled()
  })
})

describe("POST /api/admin/crm/segments", () => {
  it("201 — 소유자는 로그인 사용자, 조건은 정규형", async () => {
    const { POST } = await listRoute()
    const response = await POST(
      jsonRequest("/api/admin/crm/segments", "POST", { name: "만료 임박", spec: { expDays: "30", risk: ["urgent", "bogus"] } })
    )
    expect(response.status).toBe(201)
    expect(mocks.createSavedSegment.mock.calls[0][0]).toMatchObject({
      name: "만료 임박",
      spec: { expDays: 30, risk: ["urgent"] },
      visibility: "mine",
      ownerUserId: "u-editor",
      autoTag: { enabled: false, label: null, untag: false },
    })
    expect((await response.json()).segment).toMatchObject({ isMine: true, name: "만료 임박" })
    expect(mocks.logAdminAudit.mock.calls[0][0]).toMatchObject({ action: "crm.segments.create" })
  })

  it("400 — 빈 조건·빈 OR 그룹", async () => {
    const { POST } = await listRoute()
    expect((await POST(jsonRequest("/api/admin/crm/segments", "POST", { name: "a", spec: {} }))).status).toBe(400)
    expect(
      (await POST(jsonRequest("/api/admin/crm/segments", "POST", { name: "a", spec: { expDays: 30, anyOf: [{}] } }))).status
    ).toBe(400)
    expect(mocks.createSavedSegment).not.toHaveBeenCalled()
  })

  it("403 — 자동 태그 켜기는 관리자만", async () => {
    const { POST } = await listRoute()
    const response = await POST(
      jsonRequest("/api/admin/crm/segments", "POST", {
        name: "a",
        spec: { expDays: 30 },
        visibility: "team",
        autoTag: { enabled: true, label: "만료임박" },
      })
    )
    expect(response.status).toBe(403)
    expect(mocks.createSavedSegment).not.toHaveBeenCalled()
  })

  it("관리자 자동 태그 켜기 — 감사 로그 crm.segments.auto_tag.update · 409 라벨 중복 · 503 미적용", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    const { POST } = await listRoute()
    const body = { name: "a", spec: { expDays: 30 }, visibility: "team", autoTag: { enabled: true, label: "만료임박" } }
    expect((await POST(jsonRequest("/api/admin/crm/segments", "POST", body))).status).toBe(201)
    expect(mocks.logAdminAudit.mock.calls[0][0]).toMatchObject({ action: "crm.segments.auto_tag.update" })

    mocks.createSavedSegment.mockRejectedValueOnce(new mocks.SavedSegmentAutoTagLabelConflictError("dup"))
    const conflict = await POST(jsonRequest("/api/admin/crm/segments", "POST", body))
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).code).toBe("auto_tag_label_conflict")

    mocks.createSavedSegment.mockRejectedValueOnce(new mocks.SavedSegmentsNotReadyError("not ready"))
    expect((await POST(jsonRequest("/api/admin/crm/segments", "POST", body))).status).toBe(503)
  })
})

describe("GET /api/admin/crm/segments/[id]", () => {
  it("상세 — 그룹별 건수·원천별 건수·일별 점(조건 변경·품질 표시)", async () => {
    mocks.listSavedSegmentDailyPoints.mockResolvedValue({
      available: true,
      points: [
        { segmentId: ID_OR, snapshotDate: "2026-09-24", total: 9, specHash: "old", flags: ["compass_down"], autoTagStatus: "off" },
        { segmentId: ID_OR, snapshotDate: "2026-09-25", total: 10, specHash: "hash", flags: [], autoTagStatus: "off" },
      ],
    })
    const { GET } = await itemRoute()
    const body = await (await GET(new NextRequest(`https://classin.kr/api/admin/crm/segments/${ID_OR}`), ctx(ID_OR))).json()
    expect(body).toMatchObject({
      available: true,
      anyOfCounts: [1, 2],
      bySource: { lead: 10, neo_account: 0, customer: 0 },
      daily: [
        { date: "2026-09-24", total: 9, specChanged: true, degraded: true, autoTagStatus: "off" },
        { date: "2026-09-25", total: 10, specChanged: false, degraded: false, autoTagStatus: "off" },
      ],
    })
    expect(body.segment).toMatchObject({ id: ID_OR, count: 10, trendDays: 2 })
  })

  it("미완성 스냅샷이면 상세도 live.ok=false · count=null · 그룹·원천 건수 0 채움(화면이 '모름'으로 본다) · 캐시하지 않음", async () => {
    mocks.evaluateCrmSegmentFilters.mockImplementation(async (filters: unknown[]) => {
      const batch = evaluation(filters.map(() => 3))
      return { ...batch, sources: { ...batch.sources, complete: false, leadsOk: false } }
    })
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { GET } = await itemRoute()
    const response = await GET(new NextRequest(`https://classin.kr/api/admin/crm/segments/${ID_OR}`), ctx(ID_OR))
    const body = await response.json()
    expect(body.live.ok).toBe(false)
    expect(body.segment).toMatchObject({ id: ID_OR, count: null, lastCount: 7 })
    expect(body.anyOfCounts).toEqual([0, 0])
    expect(body.bySource).toEqual({ lead: 0, neo_account: 0, customer: 0, task: 0 })
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("남의 내 것은 404, id 형식 오류 400, 표 미적용 404 available:false", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(SUPER)
    const { GET } = await itemRoute()
    expect((await GET(new NextRequest("https://classin.kr/x"), ctx(ID_OTHERS_MINE))).status).toBe(404)
    expect((await GET(new NextRequest("https://classin.kr/x"), ctx("nope"))).status).toBe(400)
    mocks.getSavedSegment.mockRejectedValueOnce(new mocks.SavedSegmentsNotReadyError("not ready"))
    const notReady = await GET(new NextRequest("https://classin.kr/x"), ctx(ID_TEAM))
    expect(notReady.status).toBe(404)
    expect(await notReady.json()).toMatchObject({ available: false })
  })
})

describe("PATCH /api/admin/crm/segments/[id]", () => {
  it("팀 세그먼트 — 소유자가 아닌 편집자는 403, 관리자는 수정 가능", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(OTHER_EDITOR)
    const { PATCH } = await itemRoute()
    expect((await PATCH(jsonRequest(`/x`, "PATCH", { name: "새 이름" }), ctx(ID_TEAM))).status).toBe(403)

    mocks.requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    const ok = await PATCH(jsonRequest(`/x`, "PATCH", { name: "새 이름" }), ctx(ID_TEAM))
    expect(ok.status).toBe(200)
    expect((await ok.json()).segment.name).toBe("새 이름")
  })

  it("자동 태그 설정은 관리자만 — 소유자 편집자라도 403", async () => {
    const { PATCH } = await itemRoute()
    const response = await PATCH(jsonRequest(`/x`, "PATCH", { autoTag: { enabled: true, label: "L" } }), ctx(ID_TEAM))
    expect(response.status).toBe(403)
    expect(mocks.updateSavedSegment).not.toHaveBeenCalled()
  })

  it("관리자 자동 태그 켜기 + 붙은 태그 떼기 — 감사 로그에 전후 설정·뗀 수", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    const { PATCH } = await itemRoute()
    const response = await PATCH(
      jsonRequest(`/x`, "PATCH", { autoTag: { enabled: true, label: "만료임박", detachExisting: true } }),
      ctx(ID_TEAM)
    )
    expect(response.status).toBe(200)
    expect(mocks.updateSavedSegment.mock.calls[0][1]).toMatchObject({ autoTagEnabled: true, autoTagLabel: "만료임박" })
    expect(mocks.detachSegmentAutoTags).toHaveBeenCalledWith(`auto:seg:${ID_TEAM}`)
    expect(mocks.logAdminAudit.mock.calls[0][0]).toMatchObject({
      action: "crm.segments.auto_tag.update",
      targetId: ID_TEAM,
      payload: { before: { enabled: false }, after: { enabled: true, label: "만료임박" }, detached: 4 },
    })
  })

  it("자동 태그가 켜진 세그먼트의 조건은 관리자만 바꾼다", async () => {
    mocks.getSavedSegment.mockResolvedValueOnce(record(ID_TEAM, { autoTagEnabled: true, autoTagLabel: "L" }))
    const { PATCH } = await itemRoute()
    const response = await PATCH(jsonRequest(`/x`, "PATCH", { spec: { expDays: 14 } }), ctx(ID_TEAM))
    expect(response.status).toBe(403)
  })

  it("'내 것'으로 바꾸기는 소유자만(관리자도 남의 팀 세그먼트를 숨기지 못한다)", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    const { PATCH } = await itemRoute()
    expect((await PATCH(jsonRequest(`/x`, "PATCH", { visibility: "mine" }), ctx(ID_TEAM))).status).toBe(403)
  })

  it("쓰기 미적용 503", async () => {
    mocks.getSavedSegment.mockRejectedValueOnce(new mocks.SavedSegmentsNotReadyError("not ready"))
    const { PATCH } = await itemRoute()
    expect((await PATCH(jsonRequest(`/x`, "PATCH", { name: "a" }), ctx(ID_TEAM))).status).toBe(503)
  })
})

describe("DELETE /api/admin/crm/segments/[id] — 보관", () => {
  it("소유자가 보관 — 물리 삭제 아님, 감사 로그 crm.segments.archive", async () => {
    const { DELETE } = await itemRoute()
    const response = await DELETE(new NextRequest(`https://classin.kr/api/admin/crm/segments/${ID_TEAM}`, { method: "DELETE" }), ctx(ID_TEAM))
    expect(response.status).toBe(200)
    expect(mocks.archiveSavedSegment).toHaveBeenCalledWith(ID_TEAM, "편집자")
    expect(mocks.detachSegmentAutoTags).not.toHaveBeenCalled()
    expect(mocks.logAdminAudit.mock.calls[0][0]).toMatchObject({ action: "crm.segments.archive", targetId: ID_TEAM })
    expect((await response.json()).segment.archivedAt).toBe("2026-09-25T01:00:00.000Z")
  })

  it("붙은 자동 태그 떼기(detachAutoTags=1)는 관리자만", async () => {
    const { DELETE } = await itemRoute()
    const url = `https://classin.kr/api/admin/crm/segments/${ID_TEAM}?detachAutoTags=1`
    expect((await DELETE(new NextRequest(url, { method: "DELETE" }), ctx(ID_TEAM))).status).toBe(403)
    mocks.requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    const response = await DELETE(new NextRequest(url, { method: "DELETE" }), ctx(ID_TEAM))
    expect(response.status).toBe(200)
    expect((await response.json()).detached).toBe(4)
  })
})

describe("POST /api/admin/crm/segments/[id]/run", () => {
  const report = {
    status: "ok",
    daily: "skipped",
    segments: [
      {
        id: ID_TEAM,
        name: "t",
        readable: true,
        total: 12,
        bySource: { lead: 12, neo_account: 0, customer: 0, task: 0 },
        flags: ["neo_stale"],
        autoTagStatus: "skipped_neo_stale",
        tagged: 0,
        untagged: 0,
        failed: 0,
        invalid: 0,
      },
    ],
  }

  it("드라이런(기본) — 편집자도 가능, 미리볼 라벨을 넘긴다, 쓰기·감사 없음", async () => {
    mocks.runCrmSegmentDaily.mockResolvedValue(report)
    const { POST } = await runRoute()
    const response = await POST(jsonRequest(`/x`, "POST", { autoTag: { label: " 만료  임박 " } }), ctx(ID_TEAM))
    expect(response.status).toBe(200)
    expect(mocks.runCrmSegmentDaily).toHaveBeenCalledWith({
      trigger: "manual",
      segmentIds: [ID_TEAM],
      dryRun: true,
      simulateAutoTag: { label: "만료 임박" },
    })
    expect(await response.json()).toEqual({
      dryRun: true,
      total: 12,
      bySource: { lead: 12, neo_account: 0, customer: 0, task: 0 },
      flags: ["neo_stale"],
      autoTagStatus: "skipped_neo_stale",
      tagged: 0,
      untagged: 0,
      failed: 0,
      invalid: 0,
      blockedUntag: false,
      daily: "skipped",
    })
    expect(mocks.logAdminAudit).not.toHaveBeenCalled()
  })

  it("적용 실행은 관리자만 — 감사 로그 crm.segments.auto_tag.run", async () => {
    mocks.runCrmSegmentDaily.mockResolvedValue({ ...report, daily: "written" })
    const { POST } = await runRoute()
    expect((await POST(jsonRequest(`/x`, "POST", { dryRun: false }), ctx(ID_TEAM))).status).toBe(403)
    expect(mocks.runCrmSegmentDaily).not.toHaveBeenCalled()

    mocks.requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    const response = await POST(jsonRequest(`/x`, "POST", { dryRun: false }), ctx(ID_TEAM))
    expect(response.status).toBe(200)
    expect(mocks.runCrmSegmentDaily.mock.calls[0][0]).toMatchObject({ dryRun: false, trigger: "manual" })
    expect(mocks.logAdminAudit.mock.calls[0][0]).toMatchObject({ action: "crm.segments.auto_tag.run", targetId: ID_TEAM })
  })

  it("보관된 세그먼트 409 · 새 판 조건 409 · 표 미적용 503", async () => {
    const { POST } = await runRoute()
    mocks.getSavedSegment.mockResolvedValueOnce(record(ID_TEAM, { archivedAt: "2026-09-20T00:00:00.000Z" }))
    expect((await POST(jsonRequest(`/x`, "POST", {}), ctx(ID_TEAM))).status).toBe(409)
    mocks.getSavedSegment.mockResolvedValueOnce(record(ID_TEAM, { specVersion: 2 }))
    expect((await POST(jsonRequest(`/x`, "POST", {}), ctx(ID_TEAM))).status).toBe(409)
    mocks.getSavedSegment.mockRejectedValueOnce(new mocks.SavedSegmentsNotReadyError("x"))
    expect((await POST(jsonRequest(`/x`, "POST", {}), ctx(ID_TEAM))).status).toBe(503)
  })
})

describe("GET /api/admin/crm/segments/[id]/members", () => {
  it("추천순 회원 키(상한 1,000) — 통합 목록과 같은 계산, 캐시하지 않는다", async () => {
    mocks.getCrmUnifiedCustomersForExport.mockResolvedValue({
      total: 1_500,
      rows: [{ key: "neo:B" }, { key: "lead:A" }],
      truncated: true,
      limit: 1_000,
    })
    const { GET } = await membersRoute()
    const response = await GET(new NextRequest(`https://classin.kr/api/admin/crm/segments/${ID_OR}/members?limit=5000`), ctx(ID_OR))
    expect(response.status).toBe(200)
    expect(mocks.getCrmUnifiedCustomersForExport).toHaveBeenCalledWith(
      { segment: { expDays: 60, anyOf: [{ noContactDays: 60 }, { risk: ["urgent"] }] } },
      1_000
    )
    expect(await response.json()).toEqual({ total: 1_500, keys: ["neo:B", "lead:A"], truncated: true, limit: 1_000 })
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("남의 내 것은 404", async () => {
    const { GET } = await membersRoute()
    expect((await GET(new NextRequest("https://classin.kr/x"), ctx(ID_OTHERS_MINE))).status).toBe(404)
  })
})

describe("인증 실패는 그대로 돌려준다", () => {
  it("401 응답을 저장소 조회 없이 그대로", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const { GET } = await listRoute()
    expect((await GET(new NextRequest("https://classin.kr/api/admin/crm/segments"))).status).toBe(401)
    expect(mocks.listSavedSegments).not.toHaveBeenCalled()
  })
})
