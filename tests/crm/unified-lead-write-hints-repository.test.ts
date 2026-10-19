// 통합 고객 리드 행의 기록 위치 판정 힌트(R2-hints, 2026-09-26 교차 리뷰 [25] 후속) — 저장소 조립 계약.
//  - leadStatus: 리드 행에 leads.status 원값을 싣는다(화면이 statusLabel 문자열로 되짚지 않게). 다른 원천 행에는 없다.
//  - neoAccountConfirmed: 리드 → NEO 계정(external_account) 등록 확정 — 360 findConfirmedLeadNeoLink·neo-registered 라우트와
//    같은 집합(listConfirmedLeadNeoAccountLinks)만. row.crmRegistered(external_lead 포함 배지)를 재사용하지 않는다.
//    계정 링크 조회 실패·배지 집합 조회 실패면 필드를 싣지 않는다(모름 — false 로 위장하지 않는다).
//  - CSV(열 화이트리스트)에는 새 필드가 나가지 않는다.
// 원천은 전부 목이고 저장소 구현을 그대로 탄다(tests/crm/segment-evaluate.test.ts 와 같은 방식).
import { afterEach, describe, expect, it, vi } from "vitest"

import { createFakePostgrest } from "./unified-fake-postgrest"

const NOW = new Date("2026-09-26T03:00:00.000Z")
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

type LeadStatus = "new" | "contacted" | "converted" | "closed"

function lead(id: string, status: LeadStatus, phone: string | null = null) {
  return {
    id,
    source: "contact_page",
    name: `리드 ${id}`,
    org: `학원 ${id}`,
    email: `${id}@example.com`,
    phone,
    timestamp: ago(10),
    status,
    assigned_to: "김담당",
    confirmed_at: ago(10),
  }
}

function account(accountId: string) {
  return {
    accountId,
    name: `고객 ${accountId}`,
    ownerId: "neo-owner-1",
    ownerName: "박담당",
    phone: null,
    regionLabel: null,
    balance: 0,
    expireAt: ahead(300),
    lastClassAt: ago(3),
    uid: `uid-${accountId}`,
    orderAmount: 0,
    orderCount: 0,
    createdAt: ago(300),
    updatedAt: ago(10),
  }
}

interface LoadOptions {
  leads?: ReturnType<typeof lead>[]
  accounts?: ReturnType<typeof account>[]
  /** listConfirmedLeadNeoLinkLeadIds — external_account + external_lead 배지 집합 */
  badgeLeadIds?: string[]
  badgeFail?: boolean
  /** listConfirmedLeadNeoAccountLinks — external_account 만(리드 id → 계정 id) */
  accountLinks?: Record<string, string>
  accountLinksFail?: boolean
}

async function loadRepository(options: LoadOptions = {}) {
  vi.resetModules()
  vi.doMock("next/cache", () => ({
    unstable_cache: (fn: () => Promise<unknown>) => fn,
    revalidateTag: vi.fn(),
  }))
  const fake = createFakePostgrest({ lead_contact_logs: [], crm_customer_events: [] })
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fake.client }))
  vi.doMock("@/lib/compass/bridge", () => ({
    getCompassLatestActivityByPhoneKeys: vi.fn().mockResolvedValue({ rows: [], down: false, truncated: false }),
    getCompassLeadsByPhoneKeys: vi.fn().mockResolvedValue({ rows: [], down: false }),
  }))
  vi.doMock("@/lib/repositories/crm-customer-tags", () => ({ getAllCustomerTagsMap: vi.fn().mockResolvedValue({}) }))
  vi.doMock("@/lib/repositories/leads", () => ({ getLeads: vi.fn().mockResolvedValue(options.leads ?? []) }))
  vi.doMock("@/lib/repositories/lead-activity", () => ({ getLeadsActivitySummary: vi.fn().mockResolvedValue({}) }))
  vi.doMock("@/lib/crm/compass-demo-source", () => ({
    loadCompassDemoSource: vi.fn().mockResolvedValue({ demos: [], phoneKeysByCompassLeadId: new Map(), down: false }),
  }))
  vi.doMock("@/lib/portal/repositories/customers", () => ({
    listAllCustomerListItemsLite: vi.fn().mockResolvedValue([]),
  }))
  const accountLinksMock = options.accountLinksFail
    ? vi.fn().mockRejectedValue(new Error("account links down"))
    : vi.fn().mockResolvedValue(new Map(Object.entries(options.accountLinks ?? {})))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    listConfirmedLeadCustomerLinks: vi.fn().mockResolvedValue(new Map()),
    listConfirmedLeadNeoLinkLeadIds: options.badgeFail
      ? vi.fn().mockRejectedValue(new Error("badge links down"))
      : vi.fn().mockResolvedValue(new Set(options.badgeLeadIds ?? [])),
    listConfirmedLeadNeoAccountLinks: accountLinksMock,
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    crmContactTargetKey: (targetType: string, targetId: string) => `${targetType}:${targetId}`,
    getCrmCustomerContactMaps: vi.fn().mockResolvedValue({ firstResponseByLead: new Map(), latestContactByTarget: new Map() }),
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
  return { repository, accountLinksMock }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

async function rowsByKey(options: LoadOptions) {
  const { repository, accountLinksMock } = await loadRepository(options)
  const result = await repository.getCrmUnifiedCustomers({ now: NOW, includeUnconfirmed: true, limit: 200 })
  return { byKey: new Map(result.rows.map((row) => [row.key, row])), result, accountLinksMock }
}

describe("리드 행 leadStatus — 상태 원값", () => {
  it("리드 행마다 leads.status 원값, NEO 행에는 없다", async () => {
    const { byKey } = await rowsByKey({
      leads: [lead("n", "new"), lead("c", "contacted"), lead("v", "converted"), lead("x", "closed")],
      accounts: [account("A1")],
    })
    expect(byKey.get("lead:n")?.leadStatus).toBe("new")
    expect(byKey.get("lead:c")?.leadStatus).toBe("contacted")
    expect(byKey.get("lead:v")?.leadStatus).toBe("converted")
    expect(byKey.get("lead:x")?.leadStatus).toBe("closed")
    // 표시 문구는 그대로(원값은 판정 입력용).
    expect(byKey.get("lead:v")?.statusLabel).toBe("전환 완료")
    expect(byKey.get("neo:A1")).toBeDefined()
    expect(byKey.get("neo:A1")).not.toHaveProperty("leadStatus")
  })
})

describe("리드 행 neoAccountConfirmed — external_account 확정 링크만", () => {
  it("계정 행이 없어 접히지 않은 등록 리드는 true, external_lead 배지만 있으면 false, 링크 없으면 false", async () => {
    const { byKey } = await rowsByKey({
      leads: [lead("reg", "contacted"), lead("badge", "contacted"), lead("plain", "contacted")],
      // reg 의 계정(A9)은 스냅샷에 없다 → 리드 행으로 남는다.
      accounts: [account("A1")],
      badgeLeadIds: ["reg", "badge"],
      accountLinks: { reg: "A9" },
    })
    expect(byKey.get("lead:reg")).toMatchObject({ neoAccountConfirmed: true, crmRegistered: true })
    // 배지(crmRegistered)는 external_lead 까지 센다 — 등록 확정 힌트로 재사용하지 않는다.
    expect(byKey.get("lead:badge")).toMatchObject({ neoAccountConfirmed: false, crmRegistered: true })
    expect(byKey.get("lead:plain")).toMatchObject({ neoAccountConfirmed: false, crmRegistered: false })
    // 비리드 행에는 싣지 않는다.
    expect(byKey.get("neo:A1")).not.toHaveProperty("neoAccountConfirmed")
  })

  it("계정 행이 있으면 리드 행은 접혀 사라진다(기존 폴드 그대로) — 남은 리드만 힌트를 갖는다", async () => {
    const { byKey } = await rowsByKey({
      leads: [lead("reg", "contacted"), lead("plain", "new")],
      accounts: [account("A1")],
      badgeLeadIds: ["reg"],
      accountLinks: { reg: "A1" },
    })
    expect(byKey.has("lead:reg")).toBe(false)
    expect(byKey.get("lead:plain")?.neoAccountConfirmed).toBe(false)
  })

  it("배지 집합이 비면(조회 성공) 계정 링크를 읽지 않고 전부 false — 알려진 '미등록'", async () => {
    const { byKey, accountLinksMock } = await rowsByKey({ leads: [lead("a", "contacted"), lead("b", "new")] })
    expect(accountLinksMock).not.toHaveBeenCalled()
    expect(byKey.get("lead:a")?.neoAccountConfirmed).toBe(false)
    expect(byKey.get("lead:b")?.neoAccountConfirmed).toBe(false)
  })

  it("계정 링크 조회 실패 — 필드를 싣지 않는다(모름). 리드 상태 원값은 그대로", async () => {
    const { byKey, result } = await rowsByKey({
      leads: [lead("reg", "contacted"), lead("plain", "contacted")],
      badgeLeadIds: ["reg"],
      accountLinksFail: true,
    })
    for (const key of ["lead:reg", "lead:plain"]) {
      expect(byKey.get(key)).not.toHaveProperty("neoAccountConfirmed")
      expect(byKey.get(key)?.leadStatus).toBe("contacted")
    }
    expect(result.sources.warnings.join(" ")).toContain("계정 등록 링크")
  })

  it("배지 집합 조회 실패 — 계정 링크를 읽지 않으므로 역시 필드 없음(모름)", async () => {
    const { byKey, accountLinksMock } = await rowsByKey({
      leads: [lead("a", "contacted")],
      badgeFail: true,
      accountLinks: { a: "A1" },
    })
    expect(accountLinksMock).not.toHaveBeenCalled()
    expect(byKey.get("lead:a")).not.toHaveProperty("neoAccountConfirmed")
  })
})

describe("응답 크기·반출 범위", () => {
  it("CSV(열 화이트리스트)에는 새 힌트가 나가지 않는다", async () => {
    const { repository } = await loadRepository({
      leads: [lead("reg", "converted")],
      badgeLeadIds: ["reg"],
      accountLinks: { reg: "A9" },
    })
    const exported = await repository.getCrmUnifiedCustomersForExport({ now: NOW, includeUnconfirmed: true })
    expect(exported.rows[0]).toMatchObject({ leadStatus: "converted", neoAccountConfirmed: true })
    const { buildUnifiedCustomersCsv } = await import("@/app/api/admin/crm/customers/export/unified-customers-csv")
    const csv = buildUnifiedCustomersCsv(exported.rows, NOW.getTime())
    expect(csv).not.toContain("neoAccountConfirmed")
    expect(csv).not.toContain("leadStatus")
    expect(csv).not.toMatch(/,converted[,\r\n]/)
  })

  it("세그먼트 일괄 평가는 키·건수만 — 행 필드를 싣지 않는다", async () => {
    const { repository } = await loadRepository({ leads: [lead("a", "contacted")] })
    const batch = await repository.evaluateCrmSegmentFilters([{}], { now: NOW })
    expect(batch.results[0]).toEqual(
      expect.objectContaining({ keys: ["lead:a"], total: 1 })
    )
    expect(JSON.stringify(batch)).not.toContain("neoAccountConfirmed")
    expect(JSON.stringify(batch)).not.toContain("leadStatus")
  })
})
