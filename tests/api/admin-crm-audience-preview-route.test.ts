/**
 * 세그먼트 → 메시지 발송 1단계(대상 미리보기, 2026-09-25) — 라우트 + 서버 해석기(lib/repositories/crm-segment-audience.ts).
 *   GET  /api/admin/crm/segments/[id]/audience-preview   (저장 세그먼트)
 *   POST /api/admin/crm/customers/audience-preview       (저장 전 조건, 본문 { params })
 *  - 역할 CRM_STAFF, viewer.canSend = SUPER_ADMIN·ADMIN
 *  - 응답에 이메일·전화 원문·행 키가 없다(건수만), Cache-Control no-store
 *  - 원천 조회 실패 → unresolved, 동의 조회 실패 → 발송 가능 0
 *  - POST 는 keys 를 무시하고 조건 전체 기준, segment.id 는 null
 * 발송 함수는 어디에도 연결돼 있지 않다 — 이 경로는 읽기뿐이다.
 */
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SavedSegmentRecord } from "@/lib/crm/saved-segments"

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => {
  class SavedSegmentsNotReadyError extends Error {}
  class SavedSegmentAutoTagLabelConflictError extends Error {}
  class SavedSegmentConstraintError extends Error {}
  return {
    SavedSegmentsNotReadyError,
    SavedSegmentAutoTagLabelConflictError,
    SavedSegmentConstraintError,
    requireVerifiedAdminContext: vi.fn(),
    getSavedSegment: vi.fn(),
    evaluateCrmSegmentFilters: vi.fn(),
    getCrmUnifiedCustomersForExport: vi.fn(),
    listAdminUserDirectory: vi.fn(),
    findAdminCrmOwner: vi.fn(),
    isSolapiConfigured: vi.fn(() => false),
  }
})

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  fail: new Set<string>(),
  inCalls: [] as Array<{ table: string; column: string; values: unknown[] }>,
}))

function builder(table: string) {
  const state: { eq: Array<[string, unknown]>; in: [string, unknown[]] | null; range: [number, number] | null } = {
    eq: [],
    in: null,
    range: null,
  }
  const resolve = () => {
    if (db.fail.has(table)) return { data: null, error: { message: `${table} down` } }
    let rows = db.tables[table] ?? []
    for (const [column, value] of state.eq) rows = rows.filter((row) => row[column] === value)
    if (state.in) {
      const [column, values] = state.in
      db.inCalls.push({ table, column, values })
      rows = rows.filter((row) => values.includes(row[column]))
    }
    if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1)
    return { data: rows, error: null }
  }
  const chain: Record<string, unknown> = {}
  Object.assign(chain, {
    select: () => chain,
    order: () => chain,
    not: () => chain,
    eq: (column: string, value: unknown) => {
      state.eq.push([column, value])
      return chain
    },
    in: (column: string, values: unknown[]) => {
      state.in = [column, values]
      return chain
    },
    range: (from: number, to: number) => {
      state.range = [from, to]
      return chain
    },
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected),
  })
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
  hasAdminApiRole: (role: string, allowed: readonly string[]) => allowed.includes(role.trim().toUpperCase()),
}))
vi.mock("@/lib/repositories/crm-saved-segments", () => ({
  SAVED_SEGMENTS_NOT_READY_MESSAGE: "저장 세그먼트 표가 아직 적용되지 않았습니다.",
  SavedSegmentsNotReadyError: mocks.SavedSegmentsNotReadyError,
  SavedSegmentAutoTagLabelConflictError: mocks.SavedSegmentAutoTagLabelConflictError,
  SavedSegmentConstraintError: mocks.SavedSegmentConstraintError,
  getSavedSegment: mocks.getSavedSegment,
  listSavedSegmentDailyPoints: vi.fn(),
}))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({
  CRM_UNIFIED_EXPORT_MAX_ROWS: 5000,
  evaluateCrmSegmentFilters: mocks.evaluateCrmSegmentFilters,
  getCrmUnifiedCustomersForExport: mocks.getCrmUnifiedCustomersForExport,
}))
vi.mock("@/lib/repositories/admin-users", () => ({
  CURRENT_ADMIN_OWNER_TOKEN: "__me",
  listAdminUserDirectory: mocks.listAdminUserDirectory,
  findAdminCrmOwner: mocks.findAdminCrmOwner,
}))
vi.mock("@/lib/messaging/solapi", () => ({ isSolapiConfigured: mocks.isSolapiConfigured }))

import { GET } from "@/app/api/admin/crm/segments/[id]/audience-preview/route"
import { POST } from "@/app/api/admin/crm/customers/audience-preview/route"

const ADMIN = { userId: "u-admin", role: "ADMIN", name: "관리자" }
const EDITOR = { userId: "u-editor", role: "EDITOR", name: "편집자" }
const CRM_STAFF = ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"]

const SEGMENT_ID = "11111111-1111-4111-8111-111111111111"
const LEAD_A = "aaaaaaaa-0000-4000-8000-000000000001"
const LEAD_B = "aaaaaaaa-0000-4000-8000-000000000002"
const LEAD_C = "aaaaaaaa-0000-4000-8000-000000000003"
const CUSTOMER_A = "cccccccc-0000-4000-8000-000000000001"

const KEYS = [`lead:${LEAD_A}`, `lead:${LEAD_B}`, `lead:${LEAD_C}`, "neo:ACC-1", `customer:${CUSTOMER_A}`]

function record(extra: Partial<SavedSegmentRecord> = {}): SavedSegmentRecord {
  return {
    id: SEGMENT_ID,
    name: "만료 60일",
    description: null,
    spec: { expDays: 60 },
    specVersion: 1,
    specHash: "hash",
    visibility: "team",
    ownerUserId: "u-editor",
    ownerName: "편집자",
    autoTagEnabled: false,
    autoTagLabel: null,
    autoUntag: false,
    lastCount: 5,
    lastEvaluatedAt: null,
    lastRunStatus: null,
    lastRunDetail: null,
    archivedAt: null,
    archivedBy: null,
    createdBy: "편집자",
    updatedBy: "편집자",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  }
}

function evaluation(keys: string[], extra: { complete?: boolean; total?: number; truncated?: boolean } = {}) {
  return {
    generatedAt: "2026-09-25T00:00:00.000Z",
    meta: { compass: "ok", homeContactDetail: "ok" },
    sources: {
      leadsOk: true,
      neoAccountsOk: true,
      portalCustomersOk: true,
      complete: extra.complete ?? true,
      tagsOk: true,
      neoLatestSyncedAt: null,
      neoPartial: false,
    },
    results: [
      {
        total: extra.total ?? keys.length,
        bySource: { lead: 3, neo_account: 1, customer: 1 },
        keys,
        truncated: extra.truncated ?? false,
        noContactRecordCount: 0,
        anyOfCounts: [],
      },
    ],
  }
}

function getRequest(id: string) {
  return new NextRequest(`https://classin.kr/api/admin/crm/segments/${id}/audience-preview`)
}

function postRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/customers/audience-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function getPreview(id = SEGMENT_ID) {
  return GET(getRequest(id), { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSolapiConfigured.mockReturnValue(false)
  mocks.requireVerifiedAdminContext.mockResolvedValue(ADMIN)
  mocks.getSavedSegment.mockResolvedValue(record())
  mocks.evaluateCrmSegmentFilters.mockResolvedValue(evaluation(KEYS))
  mocks.listAdminUserDirectory.mockResolvedValue([])
  mocks.findAdminCrmOwner.mockReturnValue({ ownerKeys: ["owner-admin"] })
  db.fail = new Set()
  db.inCalls = []
  db.tables = {
    leads: [
      { id: LEAD_A, email: "Active@Example.com", phone: "010-1111-2222" },
      { id: LEAD_B, email: "gone@example.com", phone: null },
      { id: LEAD_C, email: null, phone: "010-3333-4444" },
    ],
    customers: [{ id: CUSTOMER_A, email: "active@example.com", phone: "02-555-6666" }],
    crm_neo_customer_snapshots: [{ source_system: "xiaoshouyi", account_id: "ACC-1", phone: "010-7777-8888" }],
    newsletter_subscribers: [
      { id: 1, email: "active@example.com", status: "active" },
      { id: 2, email: "gone@example.com", status: "unsubscribed" },
    ],
    user_profiles: [{ id: "p1", email: "profile@example.com", marketing_consent: true }],
  }
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_WEBHOOK_URL
})

function expectNoPii(json: string) {
  expect(json).not.toContain("@")
  expect(json).not.toMatch(/010-?\d{3,4}-?\d{4}/)
  expect(json).not.toContain("lead:")
  expect(json).not.toContain("neo:")
  expect(json).not.toContain("customer:")
  expect(json).not.toContain(LEAD_A)
  expect(json).not.toContain("ACC-1")
}

describe("GET /api/admin/crm/segments/[id]/audience-preview", () => {
  it("역할 CRM_STAFF · no-store · 건수만(이메일·전화·행 키 없음) · 구독 active 고유 주소만 발송 가능", async () => {
    const response = await getPreview()
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.anything(), CRM_STAFF)
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const text = await response.text()
    expectNoPii(text)
    const body = JSON.parse(text)
    expect(body.segment).toEqual({ id: SEGMENT_ID, name: "만료 60일", labels: expect.any(Array), archived: false })
    expect(body.totalRows).toBe(5)
    // 리드 A 와 전환 고객 A 는 같은 주소(대소문자만 다름) — 고유 주소 1개
    expect(body.email.eligible).toBe(1)
    expect(body.email.rows).toMatchObject({ eligible: 1, duplicate: 1, unsubscribed: 1, noEmailPhoneOnly: 2, unresolved: 0 })
    expect(body.sms).toEqual({ eligible: 0, withPhone: 4, blockedReason: "sms_consent_policy_pending" })
    expect(body.byKind.neo_account).toEqual({ rows: 1, emailEligible: 0 })
    expect(body.consent).toBe("ok")
    expect(body.sources).toBe("ok")
    expect(body.channels).toEqual({ email: "none", smsConfigured: false })
    expect(body.viewer).toEqual({ canSend: true })
    expect(mocks.evaluateCrmSegmentFilters).toHaveBeenCalledWith([{ expDays: 60 }], { maxKeys: 5000 })
  })

  it("원천 id 는 원천별로 나눠 조회한다(NEO 는 xiaoshouyi 스냅샷 account_id)", async () => {
    await getPreview()
    const byTable = Object.fromEntries(db.inCalls.map((call) => [call.table, call]))
    expect(byTable.leads).toMatchObject({ column: "id", values: [LEAD_A, LEAD_B, LEAD_C] })
    expect(byTable.customers).toMatchObject({ column: "id", values: [CUSTOMER_A] })
    expect(byTable.crm_neo_customer_snapshots).toMatchObject({ column: "account_id", values: ["ACC-1"] })
  })

  it("EDITOR 는 미리보기는 되지만 메시지 탭 넘김 권한이 없다(canSend false)", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(EDITOR)
    const body = await (await getPreview()).json()
    expect(body.viewer).toEqual({ canSend: false })
  })

  it("리드 원천 조회가 실패하면 그 행을 unresolved 로 센다(0 과 구분)", async () => {
    db.fail.add("leads")
    const body = await (await getPreview()).json()
    expect(body.email.rows.unresolved).toBe(3)
    expect(body.email.eligible).toBe(1) // 전환 고객 주소는 그대로 판정
  })

  it("동의 목록 조회가 실패하면 발송 가능 0 · consent unavailable(미확인 = 거부)", async () => {
    db.fail.add("newsletter_subscribers")
    const body = await (await getPreview()).json()
    expect(body.consent).toBe("unavailable")
    expect(body.email.eligible).toBe(0)
    expect(body.email.rows.consentUnknown).toBe(2)
  })

  it("미완성 스냅샷이면 sources incomplete, 절단이면 truncated", async () => {
    mocks.evaluateCrmSegmentFilters.mockResolvedValue(evaluation(KEYS, { complete: false, total: 9_000, truncated: true }))
    const body = await (await getPreview()).json()
    expect(body.sources).toBe("incomplete")
    expect(body.truncated).toBe(true)
    expect(body.totalRows).toBe(9_000)
    expect(body.evaluatedRows).toBe(5)
  })

  it("id 형식 400 · 남의 '내 것' 404 · 표 미적용 404 · 새 조건 판 409 · 역할 거부는 그대로", async () => {
    expect((await getPreview("not-a-uuid")).status).toBe(400)

    mocks.getSavedSegment.mockResolvedValueOnce(record({ visibility: "mine", ownerUserId: "u-other" }))
    expect((await getPreview()).status).toBe(404)

    mocks.getSavedSegment.mockRejectedValueOnce(new mocks.SavedSegmentsNotReadyError("missing"))
    expect((await getPreview()).status).toBe(404)

    mocks.getSavedSegment.mockResolvedValueOnce(record({ specVersion: 99 }))
    expect((await getPreview()).status).toBe(409)

    mocks.requireVerifiedAdminContext.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await getPreview()).status).toBe(403)
    expect(mocks.evaluateCrmSegmentFilters).not.toHaveBeenCalled()
  })

  it("보관된 세그먼트는 archived:true(화면이 넘김을 막는다)", async () => {
    mocks.getSavedSegment.mockResolvedValue(record({ archivedAt: "2026-09-20T00:00:00.000Z" }))
    const body = await (await getPreview()).json()
    expect(body.segment.archived).toBe(true)
  })
})

describe("POST /api/admin/crm/customers/audience-preview", () => {
  beforeEach(() => {
    mocks.getCrmUnifiedCustomersForExport.mockResolvedValue({
      generatedAt: "2026-09-25T00:00:00.000Z",
      total: KEYS.length,
      rows: KEYS.map((key) => ({ key })),
      truncated: false,
      limit: 5000,
      meta: { compass: "ok", homeContactDetail: "ok" },
      segmentLabels: ["만료 60일 이내"],
    })
  })

  it("본문 params 를 통합 목록 파서로 읽고 keys·limit 은 무시한다 — segment.id null, 건수만", async () => {
    const response = await POST(
      postRequest({ params: `q=${encodeURIComponent("가나학원")}&expDays=60&owner=__me&keys=lead:${LEAD_A}&limit=3` })
    )
    expect(response.status).toBe(200)
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.anything(), CRM_STAFF)
    const [options, maxRows] = mocks.getCrmUnifiedCustomersForExport.mock.calls[0]
    expect(options).toMatchObject({ q: "가나학원", segment: { expDays: 60 }, ownerKeys: ["owner-admin"] })
    expect(options).not.toHaveProperty("keys")
    expect(options.owner).toBeUndefined()
    expect(maxRows).toBe(5000)
    const text = await response.text()
    expectNoPii(text)
    const body = JSON.parse(text)
    expect(body.segment).toEqual({ id: null, name: null, labels: ["만료 60일 이내"], archived: false })
    expect(body.sources).toBe("unknown")
    expect(body.email.eligible).toBe(1)
  })

  it("본문이 없거나 params 가 문자열이 아니면 400", async () => {
    expect((await POST(postRequest(null))).status).toBe(400)
    expect((await POST(postRequest({ params: 42 }))).status).toBe(400)
    expect((await POST(postRequest({ params: "x".repeat(4_001) }))).status).toBe(400)
    expect(mocks.getCrmUnifiedCustomersForExport).not.toHaveBeenCalled()
  })
})
