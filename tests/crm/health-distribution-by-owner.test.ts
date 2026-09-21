/**
 * T2 — getCrmUnifiedHealthDistribution()의 담당별 분포(byOwner) 계약과
 * GET /api/admin/crm/health-distribution 응답 형태.
 *
 * - byOwner는 전체 합계와 같은 순회에서 모은다(추가 쿼리 없음) — 상위 4개 키 합계와 일치.
 * - 정렬: total 내림차순 → 이름 ko, 담당 없음("미배정")은 건수와 무관하게 맨 뒤.
 * - 라우트: { distribution: {..., byOwner}, generatedAt(ISO) } + 표준 어드민 프라이빗 캐시 헤더.
 * 모킹 패턴은 tests/crm/unified-customers-force-repository.test.ts를 따른다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const NOW = new Date("2026-09-18T09:00:00.000Z")

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

const routeMocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getCrmUnifiedHealthDistribution: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

function neoRow(overrides: Record<string, unknown>) {
  return {
    key: `neo:${String(overrides.key ?? Math.random())}`,
    source: "neo_account",
    sourceLabel: "고객",
    name: "고객",
    contact: null,
    ownerName: null,
    ownerKeys: [],
    lifecycle: "active_account",
    statusLabel: "정상",
    nextActionLabel: "-",
    priorityReason: "-",
    score: 10,
    bucket: null,
    moneyLabel: null,
    moneyState: "zero",
    href: "#",
    updatedAt: null,
    expireAt: "2027-06-01T00:00:00.000Z",
    balance: 0,
    tags: [],
    origin: null,
    crmRegistered: false,
    provisional: false,
    slaTarget: false,
    firstResponseAt: null,
    createdAt: null,
    activeDealCount: 0,
    ...overrides,
  }
}

// score 10 → 안전(100) · score 70(high −30) → 주의(70) · score 90(critical −45)+account_risk(−20) → 위험(35)
const SAFE = { score: 10 }
const WATCH = { score: 70 }
const RISK = { score: 90, lifecycle: "account_risk" }

const SNAPSHOT = {
  rows: [
    neoRow({ key: "a1", ownerName: "김담당", ownerKeys: ["김담당", "owner-kim"], ...SAFE }),
    neoRow({ key: "a2", ownerName: "김담당", ownerKeys: ["김담당", "owner-kim"], ...WATCH }),
    neoRow({ key: "a3", ownerName: "김담당 ", ownerKeys: ["김담당", "owner-kim"], ...RISK }),
    neoRow({ key: "b1", ownerName: "박담당", ownerKeys: ["박담당"], ...SAFE }),
    neoRow({ key: "b2", ownerName: "박담당", ownerKeys: ["박담당"], ...SAFE }),
    // 미배정 — 건수가 가장 많아도 맨 뒤여야 한다.
    neoRow({ key: "u1", ...SAFE }),
    neoRow({ key: "u2", ...RISK }),
    neoRow({ key: "u3", ...WATCH }),
    neoRow({ key: "u4", ...WATCH }),
    // 리드는 건강도 집계 대상이 아니다.
    neoRow({ key: "lead-1", source: "lead", sourceLabel: "리드", ownerName: "김담당", ownerKeys: ["김담당"] }),
  ],
  warnings: [],
  leadsOk: true,
  neoAccountsOk: true,
  portalCustomersOk: true,
  neoLatestSyncedAt: null,
  neoPartial: false,
  complete: true,
}

function mockRealSourcesEmpty() {
  vi.doMock("@/lib/repositories/crm-customer-tags", () => ({
    getAllCustomerTagsMap: vi.fn().mockResolvedValue({}),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({ getLeads: vi.fn().mockResolvedValue([]) }))
  vi.doMock("@/lib/repositories/lead-activity", () => ({
    getLeadsActivitySummary: vi.fn().mockResolvedValue({}),
  }))
  vi.doMock("@/lib/crm/compass-demo-source", () => ({
    loadCompassDemoSource: vi
      .fn()
      .mockResolvedValue({ demos: [], phoneKeysByCompassLeadId: new Map(), down: false }),
  }))
  vi.doMock("@/lib/portal/repositories/customers", () => ({
    listAllCustomerListItemsLite: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    listConfirmedLeadCustomerLinks: vi.fn().mockResolvedValue(new Map()),
    listConfirmedLeadNeoLinkLeadIds: vi.fn().mockResolvedValue(new Set()),
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    crmContactTargetKey: (targetType: string, targetId: string) => `${targetType}:${targetId}`,
    getCrmCustomerContactMaps: vi.fn().mockResolvedValue({
      firstResponseByLead: new Map(),
      latestContactByTarget: new Map(),
    }),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomers: vi.fn().mockResolvedValue({
      ok: true,
      error: null,
      latestSyncedAt: NOW.toISOString(),
      generatedAt: NOW.toISOString(),
      syncHealth: {
        shroffAccountSyncedAt: NOW.toISOString(),
        shroffAccountAgeHours: 0.5,
        staleAfterHours: 24,
        isShroffAccountStale: false,
      },
      summary: { totalCount: 0, withEeoCount: 0, expiringSoonCount: 0, totalBalance: 0, totalOrderAmount: 0 },
      owners: [],
      rows: [],
    }),
  }))
}

async function loadRepository() {
  vi.resetModules()
  mockRealSourcesEmpty()
  return import("@/lib/repositories/crm-unified-customers")
}

describe("getCrmUnifiedHealthDistribution byOwner (T2)", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(SNAPSHOT))
    mocks.revalidateTag.mockClear()
  })

  it("상위 4개 키는 그대로이고 byOwner 합계가 전체와 일치한다", async () => {
    const { getCrmUnifiedHealthDistribution } = await loadRepository()

    const result = await getCrmUnifiedHealthDistribution({})

    expect(result).toMatchObject({ total: 9, safe: 4, watch: 3, risk: 2 })
    const sum = result.byOwner.reduce(
      (acc, row) => ({
        total: acc.total + row.total,
        safe: acc.safe + row.safe,
        watch: acc.watch + row.watch,
        risk: acc.risk + row.risk,
      }),
      { total: 0, safe: 0, watch: 0, risk: 0 }
    )
    expect(sum).toEqual({ total: result.total, safe: result.safe, watch: result.watch, risk: result.risk })
    for (const row of result.byOwner) expect(row.safe + row.watch + row.risk).toBe(row.total)
  })

  it("total 내림차순 · 담당 없음은 '미배정'으로 맨 뒤 · 이름 공백 차이는 같은 담당으로 묶는다", async () => {
    const { CRM_HEALTH_UNASSIGNED_OWNER_LABEL, getCrmUnifiedHealthDistribution } = await loadRepository()

    const { byOwner } = await getCrmUnifiedHealthDistribution({})

    expect(byOwner.map((row) => row.ownerName)).toEqual(["김담당", "박담당", CRM_HEALTH_UNASSIGNED_OWNER_LABEL])
    expect(byOwner[0]).toEqual({ ownerId: "owner-kim", ownerName: "김담당", total: 3, safe: 1, watch: 1, risk: 1 })
    expect(byOwner[1]).toEqual({ ownerId: null, ownerName: "박담당", total: 2, safe: 2, watch: 0, risk: 0 })
    expect(byOwner[2]).toEqual({
      ownerId: null,
      ownerName: CRM_HEALTH_UNASSIGNED_OWNER_LABEL,
      total: 4,
      safe: 1,
      watch: 2,
      risk: 1,
    })
  })

  it("getCrmUnifiedCustomers().healthDistribution은 기존 4개 키 형태를 유지한다(응답 불변)", async () => {
    const { getCrmUnifiedCustomers, getCrmUnifiedHealthDistribution } = await loadRepository()

    const unified = await getCrmUnifiedCustomers({})
    const light = await getCrmUnifiedHealthDistribution({})

    expect(unified.healthDistribution).toEqual({ total: light.total, safe: light.safe, watch: light.watch, risk: light.risk })
    expect(unified.healthDistribution).not.toHaveProperty("byOwner")
  })
})

describe("GET /api/admin/crm/health-distribution 응답 형태 (T2)", () => {
  async function loadRoute() {
    vi.resetModules()
    vi.doMock("@/lib/admin-auth", () => ({
      CRM_STAFF_ADMIN_API_ROLES: ["admin"],
      requireVerifiedAdminContext: routeMocks.requireVerifiedAdminContext,
    }))
    vi.doMock("@/lib/repositories/crm-unified-customers", () => ({
      getCrmUnifiedHealthDistribution: routeMocks.getCrmUnifiedHealthDistribution,
    }))
    return import("@/app/api/admin/crm/health-distribution/route")
  }

  beforeEach(() => {
    routeMocks.requireVerifiedAdminContext.mockReset().mockResolvedValue({ userId: "admin-1", role: "ADMIN" })
    routeMocks.getCrmUnifiedHealthDistribution.mockReset().mockResolvedValue({
      total: 3,
      safe: 1,
      watch: 1,
      risk: 1,
      byOwner: [{ ownerId: "owner-kim", ownerName: "김담당", total: 3, safe: 1, watch: 1, risk: 1 }],
    })
  })

  it("distribution(4키+byOwner)과 generatedAt(ISO)을 내리고 표준 프라이빗 캐시 헤더를 유지한다", async () => {
    const { GET } = await loadRoute()

    const response = await GET(new NextRequest("https://classin.kr/api/admin/crm/health-distribution"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.distribution).toMatchObject({ total: 3, safe: 1, watch: 1, risk: 1 })
    expect(body.distribution.byOwner).toEqual([
      { ownerId: "owner-kim", ownerName: "김담당", total: 3, safe: 1, watch: 1, risk: 1 },
    ])
    expect(typeof body.generatedAt).toBe("string")
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt)
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30, stale-while-revalidate=120")
  })
})
