import { afterEach, describe, expect, it, vi } from "vitest"

// 저장소 함수는 모두 가짜다(운영 DB·모델 API 를 부르지 않는다). 값은 지어낸 것이다.
const mocks = vi.hoisted(() => ({
  getCrmUnifiedCustomers: vi.fn(),
  getCrmCustomer360: vi.fn(),
  listAdminUserDirectoryCached: vi.fn(),
  searchConsultationEvidence: vi.fn(),
  readActiveTeamContactsCached: vi.fn(),
}))

vi.mock("@/lib/repositories/crm-unified-customers", () => ({ getCrmUnifiedCustomers: mocks.getCrmUnifiedCustomers }))
vi.mock("@/lib/repositories/crm-customer-360", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/crm-customer-360")>(
    "@/lib/repositories/crm-customer-360"
  ).catch(() => null)
  return {
    getCrmCustomer360: mocks.getCrmCustomer360,
    parseUnifiedCustomerKey:
      actual?.parseUnifiedCustomerKey ??
      ((key: string) => {
        const [source, entityId] = key.split(":")
        return { source, entityId, targetType: source === "neo" ? "neo_account" : "lead" }
      }),
  }
})
vi.mock("@/lib/repositories/admin-users", () => ({ listAdminUserDirectoryCached: mocks.listAdminUserDirectoryCached }))
vi.mock("@/lib/internal-cs-chat/consultation-search", () => ({ searchConsultationEvidence: mocks.searchConsultationEvidence }))
vi.mock("@/lib/repositories/team-contacts", () => ({ readActiveTeamContactsCached: mocks.readActiveTeamContactsCached }))

import { resolveContact } from "@/lib/internal-cs-chat/contact"
import { buildContactDeps, matchCustomersInText, toKrContactRows } from "@/lib/internal-cs-chat/contact-deps"
import type { TeamContactRecord } from "@/lib/team-contacts/model"

function teamRow(overrides: Partial<TeamContactRecord> = {}): TeamContactRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    org: "KR",
    area: "quote",
    role: "BD 팀 매니저",
    name: "담당자 A",
    deputy: "담당자 B",
    channel: "위컴 1:1",
    prep: ["고객사"],
    adminLink: "/admin/quotes",
    note: null,
    confirmedAt: "2026-11-20",
    confirmedBy: "관리자",
    active: true,
    sortOrder: 0,
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: "2026-11-20T00:00:00Z",
    ...overrides,
  }
}

const ROWS = [
  { key: "neo:a1", name: "가상학원", href: "/admin/crm/customers/neo%3Aa1" },
  { key: "neo:a2", name: "가상학원 본점", href: "/admin/crm/customers/neo%3Aa2" },
  { key: "lead:l1", name: "AB", href: "/admin/crm/customers/lead%3Al1" },
]

afterEach(() => vi.clearAllMocks())

describe("matchCustomersInText", () => {
  it("matches whole names in the question, longer names first, ignoring very short names", () => {
    expect(matchCustomersInText("가상학원 본점 결제 이력", ROWS).map((row) => row.key)).toEqual(["neo:a2"])
    expect(matchCustomersInText("가상학원 견적", ROWS).map((row) => row.key)).toEqual(["neo:a1"])
    expect(matchCustomersInText("AB 문의", ROWS)).toEqual([])
  })

  it("keeps every customer with the same name (distinct keys) instead of silently picking one", () => {
    const rows = [
      { key: "neo:d1", name: "동명학원", href: "/h/d1" },
      { key: "lead:d2", name: "동명학원", href: "/h/d2" },
      { key: "neo:d1", name: "동명학원", href: "/h/d1" },
    ]
    expect(matchCustomersInText("동명학원 결제 이력", rows).map((row) => row.key)).toEqual(["neo:d1", "lead:d2"])
  })
})

describe("matchCustomersInText 동명 고객", () => {
  it("이름 후보는 서로 다른 이름 3개까지만 자르고, 같은 이름 고객은 인원이 잘리지 않게 모두 남긴다", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ key: `neo:s${i}`, name: "동명학원", href: `/h/s${i}` }))
    expect(matchCustomersInText("동명학원 결제 이력", rows)).toHaveLength(5)
  })

  it("공백·대소문자만 다른 이름도 같은 이름 고객으로 함께 남긴다", () => {
    const rows = [
      { key: "neo:g1", name: "가나학원", href: "/h/g1" },
      { key: "neo:g2", name: "가나 학원", href: "/h/g2" },
    ]
    expect(matchCustomersInText("가나학원 결제 이력", rows).map((row) => row.key)).toEqual(["neo:g1", "neo:g2"])
  })
})

describe("buildContactDeps (wired to repository functions, faked here)", () => {
  it("maps customer 360 into owner evidence and staff directory into roles", async () => {
    mocks.getCrmUnifiedCustomers.mockResolvedValue({ rows: ROWS })
    mocks.getCrmCustomer360.mockResolvedValue({
      found: true,
      generatedAt: "2026-11-25T00:00:00Z",
      health: { ok: true, warnings: [] },
      header: { ownerName: "매니저 갑", sourceLabel: "NEO 계정" },
      deals: { summary: { total: 2, open: 1 }, rows: [{ ownerNameSnapshot: "매니저 을" }, { ownerNameSnapshot: null }] },
      money: { available: true, orders: [{}, {}, {}], collections: [{}] },
      risk: { reasons: ["미수 잔액"] },
      serviceRisk: { reasons: [{ code: "subscription_expiring", label: "구독 만료 임박" }] },
      activity: { summary: { total: 7 } },
      contactSummary: { last: { at: "2026-11-01T00:00:00Z", actor: "매니저 을" } },
    })
    mocks.listAdminUserDirectoryCached.mockResolvedValue({
      users: [{ displayName: "지사장 병", role: "BRANCH", teamRole: "branch_director", capabilities: [], status: "ACTIVE" }],
    })

    const deps = buildContactDeps()
    expect(deps.searchConsultations).toBeUndefined()
    const card = await resolveContact("가상학원 결제 이력 알려줘", deps)
    expect(card.kind).toBe("customer_owner")
    expect(card.who).toContain("매니저 갑")
    const counts = Object.fromEntries(card.evidence.map((item) => [item.kind, item.count]))
    expect(counts).toMatchObject({ owner_assignment: 1, deal: 2, order: 3, payment: 1, issue: 2, contact_history: 7 })
    expect(mocks.getCrmCustomer360).toHaveBeenCalledWith(expect.objectContaining({ source: "neo", entityId: "a1" }), expect.anything())
    expect(mocks.searchConsultationEvidence).not.toHaveBeenCalled()
  })

  it("only searches past consultations when asked (it embeds the question)", async () => {
    mocks.searchConsultationEvidence.mockResolvedValue([
      { conversationId: "c1", matchedOrg: "가상학원", occurredAt: null },
      { conversationId: "c2", matchedOrg: "다른곳", occurredAt: null },
    ])
    const deps = buildContactDeps({ consultations: true })
    const hits = await deps.searchConsultations!("결제", { key: "neo:a1", name: "가상학원", href: "/admin/x" })
    expect(hits.map((hit) => hit.conversationId)).toEqual(["c1"])
  })

  it("customers:false 면 고객사 갈래(통합 고객 목록·고객 360·과거 상담)를 부르지 않는다 — 위컴 단체방용", async () => {
    mocks.getCrmUnifiedCustomers.mockResolvedValue({ rows: ROWS })
    mocks.listAdminUserDirectoryCached.mockResolvedValue({ users: [] })
    const deps = buildContactDeps({ customers: false, consultations: true })
    expect(deps.findCustomersInText).toBeUndefined()
    expect(deps.loadCustomerEvidence).toBeUndefined()
    expect(deps.searchConsultations).toBeUndefined()
    const card = await resolveContact("가상학원 담당 누구야?", deps)
    expect(card.kind).not.toBe("customer_owner")
    expect(mocks.getCrmUnifiedCustomers).not.toHaveBeenCalled()
    expect(mocks.getCrmCustomer360).not.toHaveBeenCalled()
  })
})

describe("buildContactDeps — 한국 담당표(DB internal_team_contacts)", () => {
  it("DB 의 활성 KR 행이 한국 지사 카드에 나온다(갈매봇 어드민·위컴 1:1 이 같은 연결을 쓴다)", async () => {
    mocks.listAdminUserDirectoryCached.mockResolvedValue({ users: [] })
    mocks.readActiveTeamContactsCached.mockResolvedValue({ rows: [teamRow()], failed: false, warning: null })
    const card = await resolveContact("견적서 보내 주세요", buildContactDeps())
    expect(card.kind).toBe("kr")
    expect(card.who).toBe("BD 팀 매니저 — 담당자 A")
    expect(card.backup).toBe("담당자 B")
    expect(card.verifiedAt).toBe("2026-11-20")
  })

  it("DB 를 읽지 못하면 빈 표 + 카드에 실패 표시(지금의 역할 답은 그대로)", async () => {
    mocks.listAdminUserDirectoryCached.mockResolvedValue({ users: [] })
    mocks.readActiveTeamContactsCached.mockResolvedValue({ rows: [], failed: true, warning: null })
    const card = await resolveContact("견적서 보내 주세요", buildContactDeps({ customers: false }))
    expect(card.kind).toBe("kr")
    expect(card.who).not.toContain("담당자 A")
    expect(card.gaps[0]).toContain("한국 담당자 표를 읽지 못해")
  })

  it("names:false(위컴 단체방) — 같은 DB 행이어도 이름 없이 역할만", async () => {
    mocks.listAdminUserDirectoryCached.mockResolvedValue({
      users: [{ displayName: "지사장 가", role: "BRANCH", teamRole: "branch_director", capabilities: [], status: "ACTIVE" }],
    })
    mocks.readActiveTeamContactsCached.mockResolvedValue({ rows: [teamRow()], failed: false, warning: null })
    const deps = buildContactDeps({ customers: false, names: false })
    expect(deps.roleOnly).toBe(true)
    const card = await resolveContact("견적서 보내 주세요", deps)
    expect(card.namesHidden).toBe(true)
    expect(card.who).toContain("BD 팀 매니저")
    expect(JSON.stringify(card)).not.toMatch(/담당자 A|담당자 B|지사장 가/)
  })

  it("toKrContactRows — 본사 행·비활성 행·모르는 영역은 넘기지 않는다", () => {
    const rows = toKrContactRows([
      teamRow(),
      teamRow({ id: "x2", org: "HQ", area: "camera" }),
      teamRow({ id: "x3", area: "contract", active: false }),
      teamRow({ id: "x4", area: "unknown_area" }),
    ])
    expect(rows).toEqual([
      expect.objectContaining({ topic: "quote", role: "BD 팀 매니저", primaryName: "담당자 A", backupName: "담당자 B", prepare: ["고객사"] }),
    ])
  })
})
