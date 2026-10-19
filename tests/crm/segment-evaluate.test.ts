// 저장 세그먼트 일괄 평가(evaluateCrmSegmentFilters) · OR 한 단계(통합 목록) · 통합 행 Compass 참조(A안) — 저장소
// 조립 계약. 원천은 전부 목(tests/crm/unified-last-contact-segment.test.ts 와 같은 방식)이고 저장소 구현을 그대로 탄다.
//  - 건수 일치: evaluateCrmSegmentFilters([f]).results[0].total === getCrmUnifiedCustomers({ segment: f }).summary.total
//    (미확인 리드 게이트 포함, OR 그룹 포함).
//  - sources.complete · tagsOk · NEO 신선도 노출, bypassCache 는 태그 즉시 만료.
//  - Compass 참조는 대표 1건(최근성 → id), 전화 키를 싣지 않는다, 끊기면 null, 리드 접기 때 승계.
import { afterEach, describe, expect, it, vi } from "vitest"

import { createFakePostgrest } from "./unified-fake-postgrest"

const NOW = new Date("2026-09-25T03:00:00.000Z")
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

const L1 = "11111111-1111-4111-8111-111111111111"
const L2 = "22222222-2222-4222-8222-222222222222"
const L3 = "33333333-3333-4333-8333-333333333333"

function lead(id: string, phone: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    source: "contact_page",
    name: `리드 ${id.slice(0, 4)}`,
    org: `학원 ${id.slice(0, 4)}`,
    email: `${id.slice(0, 4)}@example.com`,
    phone,
    timestamp: ago(40),
    status: "contacted",
    assigned_to: "김담당",
    confirmed_at: ago(40),
    ...extra,
  }
}

function account(accountId: string, phone: string | null, extra: Record<string, unknown> = {}) {
  return {
    accountId,
    name: `고객 ${accountId}`,
    ownerId: "neo-owner-1",
    ownerName: "박담당",
    phone,
    regionLabel: "부산",
    balance: 0,
    expireAt: ahead(400),
    lastClassAt: ago(3),
    uid: `uid-${accountId}`,
    orderAmount: 0,
    orderCount: 0,
    createdAt: ago(300),
    updatedAt: ago(90),
    riskLevel: "normal",
    riskReasons: [],
    depletionInDays: null,
    billingMode: "subscription",
    ...extra,
  }
}

interface LoadOptions {
  leads?: ReturnType<typeof lead>[]
  accounts?: ReturnType<typeof account>[]
  logs?: Array<Record<string, unknown>>
  tags?: Record<string, string[]>
  tagsFail?: boolean
  compassLeads?: Array<Record<string, unknown>>
  compassLeadsDown?: boolean
  neoLinks?: Map<string, string>
}

async function loadRepository(options: LoadOptions = {}) {
  vi.resetModules()
  const revalidateTag = vi.fn()
  vi.doMock("next/cache", () => ({
    // 캐시 경로도 호출마다 새로 수집한다(테스트는 캐시 동작이 아니라 조립을 본다).
    unstable_cache: (fn: () => Promise<unknown>) => fn,
    revalidateTag,
  }))
  const fake = createFakePostgrest({
    lead_contact_logs: (options.logs ?? []).map((row, index) => ({ id: `log-${index}`, ...row })),
    crm_customer_events: [],
  })
  const compassLeadsMock = vi.fn(async (keys: string[]) =>
    options.compassLeadsDown
      ? { rows: [], down: true, error: "bridge down" }
      : { rows: (options.compassLeads ?? []).filter((row) => keys.includes(String(row.phone_key))), down: false }
  )
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
  vi.doMock("@/lib/compass/bridge", () => ({
    getCompassLatestActivityByPhoneKeys: vi.fn().mockResolvedValue({ rows: [], down: false, truncated: false }),
    getCompassLeadsByPhoneKeys: compassLeadsMock,
  }))
  vi.doMock("@/lib/repositories/crm-customer-tags", () => ({
    getAllCustomerTagsMap: options.tagsFail
      ? vi.fn().mockRejectedValue(new Error("tags down"))
      : vi.fn().mockResolvedValue(options.tags ?? {}),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({ getLeads: vi.fn().mockResolvedValue(options.leads ?? []) }))
  vi.doMock("@/lib/repositories/lead-activity", () => ({ getLeadsActivitySummary: vi.fn().mockResolvedValue({}) }))
  vi.doMock("@/lib/crm/compass-demo-source", () => ({
    loadCompassDemoSource: vi.fn().mockResolvedValue({ demos: [], phoneKeysByCompassLeadId: new Map(), down: false }),
  }))
  vi.doMock("@/lib/portal/repositories/customers", () => ({
    listAllCustomerListItemsLite: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    listConfirmedLeadCustomerLinks: vi.fn().mockResolvedValue(new Map()),
    listConfirmedLeadNeoLinkLeadIds: vi.fn().mockResolvedValue(new Set(options.neoLinks ? [...options.neoLinks.keys()] : [])),
    listConfirmedLeadNeoAccountLinks: vi.fn().mockResolvedValue(options.neoLinks ?? new Map()),
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    crmContactTargetKey: (targetType: string, targetId: string) => `${targetType}:${targetId}`,
    getCrmCustomerContactMaps: vi.fn().mockResolvedValue({
      firstResponseByLead: new Map(),
      latestContactByTarget: new Map(
        (options.logs ?? []).map((row) => [`lead:${String(row.lead_id)}`, String(row.contacted_at)])
      ),
    }),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomers: vi.fn().mockResolvedValue({
      ok: true,
      error: null,
      latestSyncedAt: ago(1),
      generatedAt: NOW.toISOString(),
      syncHealth: { shroffAccountSyncedAt: NOW.toISOString(), shroffAccountAgeHours: 1, staleAfterHours: 24, isShroffAccountStale: false },
      summary: { totalCount: 0, withEeoCount: 0, expiringSoonCount: 0, totalBalance: 0, totalOrderAmount: 0 },
      owners: [],
      rows: options.accounts ?? [],
    }),
  }))
  const repository = await import("@/lib/repositories/crm-unified-customers")
  return { repository, revalidateTag, compassLeadsMock }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

const FIXTURE: LoadOptions = {
  leads: [
    lead(L1, "010-1111-2002"),
    // 미확인 신규 리드 — 기본 모집단(통합 목록 기본 화면)에서 빠진다.
    lead(L2, "010-2222-3003", { status: "new", confirmed_at: null }),
    lead(L3, null, { status: "new", confirmed_at: ago(2) }),
  ],
  accounts: [
    account("N1", "010-4444-5005", { expireAt: ahead(20), riskLevel: "urgent" }),
    account("N2", null, { expireAt: ahead(25) }),
    account("N3", "010-6666-7007", { expireAt: ahead(20) }),
    account("N4", null),
  ],
  logs: [{ lead_id: L1, type: "call", contacted_at: ago(5), contacted_by: "김담당" }],
  tags: { [`neo_account:N3`]: ["VIP"] },
}

describe("evaluateCrmSegmentFilters — 통합 목록과 같은 건수", () => {
  it("조건마다 total == getCrmUnifiedCustomers({ segment }).summary.total (미확인 게이트·OR 포함)", async () => {
    const { repository } = await loadRepository(FIXTURE)
    const filters = [
      { expDays: 60 },
      { expDays: 60, anyOf: [{ risk: ["urgent" as const] }, { tagsAny: ["vip"] }] },
      { kinds: ["lead" as const] },
      { noContactDays: 30 },
    ]
    const batch = await repository.evaluateCrmSegmentFilters(filters, { now: NOW })
    expect(batch.results).toHaveLength(filters.length)
    for (const [index, filter] of filters.entries()) {
      const listed = await repository.getCrmUnifiedCustomers({ segment: filter, now: NOW })
      expect(batch.results[index].total, JSON.stringify(filter)).toBe(listed.summary.total)
    }
    // OR — N1(위험 긴급) + N3(라벨 VIP) · N2 는 어느 그룹에도 안 맞는다.
    expect(batch.results[1].keys).toEqual(["neo:N1", "neo:N3"])
    expect(batch.results[1].anyOfCounts).toEqual([1, 1])
    // 미확인 리드(L2)는 빠지고 확인된 리드만.
    expect(batch.results[2].keys).toEqual([`lead:${L1}`, `lead:${L3}`].sort())
    expect(batch.results[2].bySource).toEqual({ lead: 2, neo_account: 0, customer: 0, task: 0 })
    // 무연락 30일+ — L1(5일 전 연락) 제외, 기록 없음 수를 따로 센다.
    expect(batch.results[3].keys).not.toContain(`lead:${L1}`)
    expect(batch.results[3].noContactRecordCount).toBe(batch.results[3].total)
  })

  it("통합 목록 요약에 OR 그룹·그룹별 건수·OR 문구가 실린다", async () => {
    const { repository } = await loadRepository(FIXTURE)
    const listed = await repository.getCrmUnifiedCustomers({
      segment: { expDays: 60, anyOf: [{ risk: ["urgent"] }, { tagsAny: ["vip"] }] },
      now: NOW,
    })
    expect(listed.summary.total).toBe(2)
    expect(listed.segment.spec).toEqual({ expDays: 60 })
    expect(listed.segment.anyOf).toEqual([{ risk: ["urgent"] }, { tagsAny: ["vip"] }])
    expect(listed.segment.anyOfCounts).toEqual([1, 1])
    expect(listed.segment.labels).toEqual(["만료 60일 이내", "(위험 긴급) 또는 (라벨 하나 vip)"])
    // AND 만 쓰면 기존 요약 모양 그대로(anyOf 없음).
    const andOnly = await repository.getCrmUnifiedCustomers({ segment: { expDays: 60 }, now: NOW })
    expect(andOnly.segment).not.toHaveProperty("anyOf")
    expect(andOnly.summary.total).toBe(3)
  })

  it("키 상한을 넘으면 truncated, 키는 사전순", async () => {
    const { repository } = await loadRepository(FIXTURE)
    const batch = await repository.evaluateCrmSegmentFilters([{ kinds: ["neo_account"] }], { now: NOW, maxKeys: 2 })
    expect(batch.results[0]).toMatchObject({ total: 4, keys: ["neo:N1", "neo:N2"], truncated: true })
  })

  it("원천 상태·NEO 신선도·라벨 읽기 성공 여부를 노출한다", async () => {
    const { repository } = await loadRepository(FIXTURE)
    const batch = await repository.evaluateCrmSegmentFilters([{ expDays: 60 }], { now: NOW })
    expect(batch.sources).toMatchObject({ leadsOk: true, neoAccountsOk: true, portalCustomersOk: true, complete: true, tagsOk: true })
    expect(batch.sources.neoLatestSyncedAt).toBe(ago(1))
    expect(batch.meta.compass).toBe("ok")

    const failing = await loadRepository({ ...FIXTURE, tagsFail: true })
    const degraded = await failing.repository.evaluateCrmSegmentFilters([{ tagsAny: ["VIP"] }], { now: NOW })
    expect(degraded.sources.tagsOk).toBe(false)
    expect(degraded.results[0].total).toBe(0)
  })

  it("bypassCache 는 재수집 뒤 스냅샷 태그를 즉시 만료한다(크론·수동 실행 필수)", async () => {
    const { repository, revalidateTag } = await loadRepository(FIXTURE)
    await repository.evaluateCrmSegmentFilters([{ expDays: 60 }])
    expect(revalidateTag).not.toHaveBeenCalled()
    await repository.evaluateCrmSegmentFilters([{ expDays: 60 }], { bypassCache: true })
    expect(revalidateTag).toHaveBeenCalledWith("admin-crm-unified-snapshot", { expire: 0 })
  })
})

describe("통합 행 Compass 참조(A안 'Compass에서 열기')", () => {
  it("같은 전화 키의 대표 Compass 리드 1건 — 최근성 우선, 전화 키는 싣지 않는다", async () => {
    const { repository, compassLeadsMock } = await loadRepository({
      ...FIXTURE,
      compassLeads: [
        { id: 5, phone_key: "01011112002", stage: "new", created_at: ago(30), updated_at: ago(30), last_inflow_at: ago(30) },
        { id: 9, phone_key: "01011112002", stage: "demo", created_at: ago(10), updated_at: ago(2), last_inflow_at: ago(3) },
        { id: 12, phone_key: "01044445005", stage: "won", created_at: ago(100), updated_at: null, last_inflow_at: null },
      ],
    })
    const result = await repository.getCrmUnifiedCustomers({ now: NOW, limit: 50 })
    const byKey = new Map(result.rows.map((row) => [row.key, row]))
    expect(byKey.get(`lead:${L1}`)?.compass).toEqual({
      leadId: 9,
      url: "https://mkt.classin.co.kr/leads?open=9",
      stageLabel: "데모",
    })
    expect(byKey.get("neo:N1")?.compass).toMatchObject({ leadId: 12, stageLabel: "결제" })
    expect(byKey.get("neo:N3")?.compass).toBeNull()
    expect(byKey.get("neo:N2")?.compass).toBeNull()
    expect(result.meta.compassRefs).toBe("ok")
    // 응답 행의 compass 참조에 전화 키가 섞이지 않는다.
    expect(JSON.stringify(result.rows.map((row) => row.compass))).not.toMatch(/0101111|0104444/)
    // 브리지에는 정규화 전화 키만(9자리 이상) 넘긴다.
    const requested = compassLeadsMock.mock.calls.flatMap(([keys]) => keys).sort()
    expect(requested).toEqual(["01011112002", "01022223003", "01044445005", "01066667007"])
  })

  it("Compass 가 끊기면 참조는 null(링크 없음) — 스냅샷 완성 판정에는 넣지 않는다", async () => {
    const { repository } = await loadRepository({ ...FIXTURE, compassLeadsDown: true })
    const result = await repository.getCrmUnifiedCustomers({ now: NOW, limit: 50 })
    expect(result.rows.every((row) => row.compass === null)).toBe(true)
    // 링크가 없는 이유가 "매칭 없음"이 아니라 조회 실패임을 메타로 알린다(화면 캡션).
    expect(result.meta.compassRefs).toBe("down")
    const batch = await repository.evaluateCrmSegmentFilters([{ expDays: 60 }], { now: NOW })
    expect(batch.sources.complete).toBe(true)
  })

  it("자리표시·더미 번호 행은 같은 더미의 남의 Compass 리드 링크를 받지 않는다 — 브리지에 그 키를 넘기지도 않는다", async () => {
    const { repository, compassLeadsMock } = await loadRepository({
      leads: [lead(L1, "010-0000-0000")],
      accounts: [
        account("N1", "010-1234-5678", { expireAt: ahead(20) }),
        account("N3", "010-2222-0003", { expireAt: ahead(20) }),
      ],
      compassLeads: [
        { id: 70, phone_key: "01000000000", stage: "demo", created_at: ago(10), updated_at: ago(1), last_inflow_at: null },
        { id: 71, phone_key: "01012345678", stage: "won", created_at: ago(10), updated_at: ago(1), last_inflow_at: null },
        { id: 72, phone_key: "01022220003", stage: "quote", created_at: ago(10), updated_at: ago(1), last_inflow_at: null },
      ],
    })
    const result = await repository.getCrmUnifiedCustomers({ now: NOW, limit: 50 })
    const byKey = new Map(result.rows.map((row) => [row.key, row]))
    expect(byKey.get(`lead:${L1}`)?.compass).toBeNull()
    expect(byKey.get("neo:N1")?.compass).toBeNull()
    // 대조 — 실번호 행은 같은 키의 Compass 리드에 붙는다.
    expect(byKey.get("neo:N3")?.compass).toMatchObject({ leadId: 72, stageLabel: "미팅" })
    expect(compassLeadsMock.mock.calls.flatMap(([keys]) => keys).sort()).toEqual(["01022220003"])
  })

  it("리드를 확정 NEO 계정 행으로 접으면 계정 행이 리드의 Compass 참조를 승계한다", async () => {
    const { repository } = await loadRepository({
      ...FIXTURE,
      neoLinks: new Map([[L1, "N2"]]),
      compassLeads: [{ id: 9, phone_key: "01011112002", stage: "quote", created_at: ago(10), updated_at: ago(2), last_inflow_at: null }],
    })
    const result = await repository.getCrmUnifiedCustomers({ now: NOW, limit: 50 })
    const byKey = new Map(result.rows.map((row) => [row.key, row]))
    expect(byKey.has(`lead:${L1}`)).toBe(false)
    expect(byKey.get("neo:N2")?.compass).toMatchObject({ leadId: 9, stageLabel: "미팅" })
  })
})
