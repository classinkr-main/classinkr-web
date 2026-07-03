import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const getLeadById = vi.fn()
const updateLead = vi.fn()
const findConfirmedLeadConversionLink = vi.fn()
const upsertConfirmedLeadCustomerLink = vi.fn()
const createCustomer = vi.fn()
const createDeal = vi.fn()
const logActivity = vi.fn()
const getLeadMagnetTitleFromStore = vi.fn()
const createSupabaseAdminClient = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/leads", () => ({
  getLeadById,
  updateLead,
}))

vi.mock("@/lib/repositories/crm-source-links", () => ({
  findConfirmedLeadConversionLink,
  upsertConfirmedLeadCustomerLink,
}))

vi.mock("@/lib/portal/repositories/customers", () => ({
  createCustomer,
}))

vi.mock("@/lib/portal/repositories/deals", () => ({
  createDeal,
}))

vi.mock("@/lib/portal/repositories/activity", () => ({
  logActivity,
}))

vi.mock("@/lib/repositories/lead-magnets", () => ({
  getLeadMagnetTitleFromStore,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}))

type QueryResult = { data: unknown; error: unknown }

// supabase 쿼리 빌더 스텁 — 체이닝 가능 + thenable(await builder)/maybeSingle 둘 다 지원.
function chainable(result: QueryResult) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  for (const method of ["select", "eq", "neq", "ilike", "order", "limit", "in", "is"]) {
    builder[method] = vi.fn(self)
  }
  builder.maybeSingle = vi.fn(async () => result)
  builder.single = vi.fn(async () => result)
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject)
  return builder
}

// 테이블별 결과 큐 — 같은 테이블을 여러 번 조회하면 순서대로 소비한다.
function mockSupabaseTables(tables: Record<string, QueryResult[]>) {
  const queues = new Map(Object.entries(tables).map(([table, results]) => [table, [...results]]))
  const from = vi.fn((table: string) => {
    const queue = queues.get(table)
    const result = queue?.shift() ?? { data: null, error: null }
    return chainable(result)
  })
  createSupabaseAdminClient.mockReturnValue({ from })
  return { from }
}

const LEAD = {
  id: "lead-1",
  status: "qualified",
  name: "김원장",
  org: "클래스인 영어학원",
  email: "owner@example.com",
  phone: "010-0000-0000",
  timestamp: "2026-06-01T00:00:00.000Z",
  source: "demo_modal",
  notes: "",
}

const CUSTOMER_ROW = {
  id: "cust-1",
  partner_account_id: "pa-1",
  name: "클래스인 영어학원",
  contact_name: "김원장",
  email: "owner@example.com",
  phone: "010-0000-0000",
  notes: "이전 노트 — 마커는 지워졌을 수도 있음",
}

const DEAL_ROW = {
  id: "deal-1",
  partner_account_id: "pa-1",
  customer_id: "cust-1",
  deal_code: "D-2026-001",
  title: "클래스인 영어학원 리드 상담",
  notes: "",
}

function convertRequest() {
  return new NextRequest("https://classin.kr/api/admin/leads/lead-1/convert-v2", { method: "POST" })
}

function routeContext() {
  return { params: Promise.resolve({ id: "lead-1" }) }
}

async function callRoute() {
  const { POST } = await import("@/app/api/admin/leads/[id]/convert-v2/route")
  return POST(convertRequest(), routeContext())
}

function mockAdminAndLead() {
  requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
  getLeadById.mockResolvedValue({ ...LEAD })
  updateLead.mockResolvedValue({ ...LEAD, status: "converted" })
  getLeadMagnetTitleFromStore.mockResolvedValue(null)
  upsertConfirmedLeadCustomerLink.mockResolvedValue({ id: "link-1", status: "confirmed" })
}

describe("POST /api/admin/leads/[id]/convert-v2 — 멱등 판정", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("crm_source_links 확정 링크가 있으면 고객·딜을 재생성하지 않고 재사용한다", async () => {
    mockAdminAndLead()
    findConfirmedLeadConversionLink.mockResolvedValue({
      linkId: "link-1",
      customerId: "cust-1",
      dealId: "deal-1",
      dealCode: "D-2026-001",
      metadata: { deal_id: "deal-1", deal_code: "D-2026-001" },
    })
    mockSupabaseTables({
      customers: [{ data: CUSTOMER_ROW, error: null }],
      deals: [{ data: DEAL_ROW, error: null }],
    })

    const response = await callRoute()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      matchedBy: "source_link",
      reusedExisting: { customer: true, deal: true },
      customer: { id: "cust-1" },
      deal: { id: "deal-1" },
      links: {
        deal: "/admin/crm/deals/orders?deal=deal-1",
        customer: `/admin/crm/customers/unified?q=${encodeURIComponent("클래스인 영어학원")}`,
      },
    })
    expect(createCustomer).not.toHaveBeenCalled()
    expect(createDeal).not.toHaveBeenCalled()
    expect(logActivity).not.toHaveBeenCalled()
    // 노트 마커(ilike) 판정 없이 링크만으로 멱등 판정이 끝나야 한다.
    expect(findConfirmedLeadConversionLink).toHaveBeenCalledWith("lead-1")
  })

  it("링크 metadata에 딜 계보가 없으면 고객은 재사용하고 마커 딜로 보강한다", async () => {
    mockAdminAndLead()
    findConfirmedLeadConversionLink.mockResolvedValue({
      linkId: "link-1",
      customerId: "cust-1",
      dealId: null,
      dealCode: null,
      metadata: {},
    })
    mockSupabaseTables({
      customers: [{ data: CUSTOMER_ROW, error: null }],
      // 마커 딜 조회(customer_id + notes ilike) — 큐 소비형 thenable
      deals: [{ data: [DEAL_ROW], error: null }],
    })

    const response = await callRoute()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      matchedBy: "source_link",
      reusedExisting: { customer: true, deal: true },
    })
    expect(createCustomer).not.toHaveBeenCalled()
    expect(createDeal).not.toHaveBeenCalled()
  })

  it("링크가 없으면 레거시 notes 마커로 폴백해 기존 고객·딜을 재사용한다", async () => {
    mockAdminAndLead()
    findConfirmedLeadConversionLink.mockResolvedValue(null)
    mockSupabaseTables({
      customers: [{ data: [CUSTOMER_ROW], error: null }],
      deals: [{ data: [DEAL_ROW], error: null }],
    })

    const response = await callRoute()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      matchedBy: "notes_marker",
      reusedExisting: { customer: true, deal: true },
    })
    expect(createCustomer).not.toHaveBeenCalled()
    expect(createDeal).not.toHaveBeenCalled()
  })

  it("링크·마커 둘 다 없으면 신규 고객·딜을 생성하고 딥링크를 응답한다", async () => {
    mockAdminAndLead()
    findConfirmedLeadConversionLink.mockResolvedValue(null)
    createCustomer.mockResolvedValue({ ...CUSTOMER_ROW, id: "cust-new" })
    createDeal.mockResolvedValue({ ...DEAL_ROW, id: "deal-new", customer_id: "cust-new" })
    logActivity.mockResolvedValue(undefined)
    mockSupabaseTables({
      customers: [{ data: [], error: null }],
      partner_accounts: [{ data: [{ id: "pa-1" }], error: null }],
    })

    const response = await callRoute()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      matchedBy: null,
      reusedExisting: { customer: false, deal: false },
      links: {
        deal: "/admin/crm/deals/orders?deal=deal-new",
        customer: `/admin/crm/customers/unified?q=${encodeURIComponent("클래스인 영어학원")}`,
      },
    })
    expect(createCustomer).toHaveBeenCalledTimes(1)
    expect(createDeal).toHaveBeenCalledTimes(1)
    expect(upsertConfirmedLeadCustomerLink).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        customerId: "cust-new",
        metadata: expect.objectContaining({ deal_id: "deal-new" }),
      })
    )
  })

  it("링크 조회가 실패해도 전환을 막지 않고 레거시 판정으로 폴백한다", async () => {
    mockAdminAndLead()
    findConfirmedLeadConversionLink.mockRejectedValue(new Error("crm_source_links unavailable"))
    createCustomer.mockResolvedValue({ ...CUSTOMER_ROW, id: "cust-new" })
    createDeal.mockResolvedValue({ ...DEAL_ROW, id: "deal-new", customer_id: "cust-new" })
    logActivity.mockResolvedValue(undefined)
    mockSupabaseTables({
      customers: [{ data: [], error: null }],
      partner_accounts: [{ data: [{ id: "pa-1" }], error: null }],
    })

    const response = await callRoute()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, matchedBy: null })
    expect(createCustomer).toHaveBeenCalledTimes(1)
  })
})
