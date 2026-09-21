/**
 * unified-01 — getCrmUnifiedCustomers({ bypassCache }) 계약.
 *
 * 클라이언트 새로고침(`&force=1`)이 서버까지 관통하려면 리포지토리가 bypassCache를 받아 소스
 * 스냅샷 Data Cache(unstable_cache 60초)를 우회하고, 재수집 뒤 태그를 즉시 하드 만료해야 한다
 * (getCrmPriorityQueue({ force })와 같은 컨벤션). 모킹 패턴은
 * tests/crm/crm-unified-customers-snapshot-cache.test.ts를 따른다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const NOW = new Date("2026-09-15T09:00:00.000Z")

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

const SNAPSHOT_TAG = "admin-crm-unified-snapshot"

// 캐시 경로에서 왔다는 표식 — 실제 소스(전부 빈 배열)와 rows 건수로 구분한다.
const CACHED_SENTINEL_SNAPSHOT = {
  rows: [
    {
      key: "neo:sentinel",
      source: "neo_account",
      sourceLabel: "고객",
      name: "센티널 고객",
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
      expireAt: "2027-01-01T00:00:00.000Z",
      balance: 0,
      tags: [],
      origin: null,
      crmRegistered: false,
      provisional: false,
      slaTarget: false,
      firstResponseAt: null,
      createdAt: null,
      activeDealCount: 0,
    },
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

describe("getCrmUnifiedCustomers bypassCache 계약 (unified-01)", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(CACHED_SENTINEL_SNAPSHOT))
    mocks.revalidateTag.mockClear()
  })

  it("bypassCache 없이 부르면 캐시된 스냅샷(센티널)을 그대로 쓰고 태그를 만료하지 않는다", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository()

    const result = await getCrmUnifiedCustomers({})

    expect(result.rows.map((row) => row.key)).toEqual(["neo:sentinel"])
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("bypassCache=true면 소스 스냅샷 캐시를 우회해 실제 소스를 재수집한다", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository()

    const result = await getCrmUnifiedCustomers({ bypassCache: true })

    // 실제 소스는 전부 빈 배열로 모킹했으므로 캐시 우회 시 센티널 행이 없어야 한다.
    expect(result.rows).toEqual([])
    expect(result.summary.total).toBe(0)
  })

  it("bypassCache=true면 재수집 뒤 스냅샷 태그를 즉시 하드 만료한다({ expire: 0 })", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository()

    await getCrmUnifiedCustomers({ bypassCache: true })

    expect(mocks.revalidateTag).toHaveBeenCalledWith(SNAPSHOT_TAG, { expire: 0 })
  })

  it("health-distribution 경로도 같은 bypassCache 계약을 따른다", async () => {
    const { getCrmUnifiedHealthDistribution } = await loadRepository()

    const cached = await getCrmUnifiedHealthDistribution({})
    const fresh = await getCrmUnifiedHealthDistribution({ bypassCache: true })

    expect(cached.total).toBe(1)
    expect(fresh.total).toBe(0)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    expect(mocks.revalidateTag).toHaveBeenCalledWith(SNAPSHOT_TAG, { expire: 0 })
  })
})
