/**
 * lib/repositories/crm-unified-customers.ts 의 소스 스냅샷 캐시 배선 계약.
 *
 * 이전에는 인스턴스 모듈 메모(sourceSnapshotCache + sourceSnapshotInFlight, 60초 TTL)였다 —
 * Vercel Fluid 인스턴스가 콜드일 때마다 비어 있어 매 요청이 6개 소스 전량 재수집을 물었다.
 * unstable_cache(Data Cache)는 인스턴스 간 공유되고 stale-while-revalidate라 콜드 인스턴스에서도
 * 다른 인스턴스가 데운 값을 즉시 돌려준다.
 *
 * options.now가 주어진 호출(테스트·고정 시각)은 캐시를 읽지도 쓰지도 않는다 — 이 계약은
 * getCrmUnifiedHealthDistribution({ now })가 unstable_cache 경로를 우회해 직접 재수집하는지로
 * 검증한다(모의 unstable_cache가 실제와 다른 "캐시된 센티널" 값을 반환하도록 해 구분한다).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const NOW = new Date("2026-06-26T09:00:00.000Z")

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

// unstable_cache가 실제로 감싸는 값과 구분되는 "캐시에서 왔다"는 표식의 가짜 스냅샷.
// getCrmUnifiedHealthDistribution은 snapshot.rows 중 source === "neo_account"인 행만 센다.
const CACHED_SENTINEL_SNAPSHOT = {
  rows: [
    {
      key: "neo:sentinel",
      source: "neo_account",
      sourceLabel: "동기화 고객",
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

// 확인 게이트 케이스용 센티널 — 미확인(provisional) 리드 1건 + 확인된 리드 1건.
const CACHED_SNAPSHOT_WITH_UNCONFIRMED = {
  ...CACHED_SENTINEL_SNAPSHOT,
  rows: [
    {
      ...CACHED_SENTINEL_SNAPSHOT.rows[0],
      key: "lead:unconfirmed",
      source: "lead",
      sourceLabel: "데모 신청",
      name: "미확인 리드",
      ownerName: "미확인담당",
      ownerKeys: ["미확인담당"],
      lifecycle: "new_lead",
      statusLabel: "신규 리드",
      moneyState: "none",
      expireAt: null,
      balance: null,
      origin: "site",
      provisional: true,
      slaTarget: true,
      createdAt: "2026-06-25T00:00:00.000Z",
    },
    {
      ...CACHED_SENTINEL_SNAPSHOT.rows[0],
      key: "lead:confirmed",
      source: "lead",
      sourceLabel: "문의",
      name: "확인 리드",
      ownerName: "김담당",
      ownerKeys: ["김담당"],
      lifecycle: "new_lead",
      statusLabel: "신규 리드",
      moneyState: "none",
      expireAt: null,
      balance: null,
      origin: "site",
      provisional: false,
      slaTarget: true,
      createdAt: "2026-06-25T00:00:00.000Z",
    },
  ],
}

function mockRealSourcesEmpty() {
  // getCrmUnifiedCustomers가 요청마다 붙이는 수기 라벨 — 여기서는 관심 밖이라 빈 맵.
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

describe("crm-unified-customers 소스 스냅샷 캐시 배선", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(CACHED_SENTINEL_SNAPSHOT))
    mocks.revalidateTag.mockClear()
  })

  it("unstable_cache(60초, admin-crm-unified-snapshot 태그)로 감싼다", async () => {
    await loadRepository()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual(["admin-crm-unified-snapshot"])
    expect(options).toEqual({ revalidate: 60, tags: ["admin-crm-unified-snapshot"] })
  })

  it("now 없이 부르면 캐시된 경로(모의 unstable_cache의 센티널 값)를 그대로 쓴다", async () => {
    const { getCrmUnifiedHealthDistribution } = await loadRepository()

    const result = await getCrmUnifiedHealthDistribution({})

    // 센티널 스냅샷의 neo_account 1건이 그대로 집계됐다 — 실제 재수집(빈 소스)이었다면 total=0.
    expect(result.total).toBe(1)
  })

  it("now가 주어지면 캐시를 우회해 실제 소스를 직접 재수집한다", async () => {
    const { getCrmUnifiedHealthDistribution } = await loadRepository()

    const result = await getCrmUnifiedHealthDistribution({ now: NOW })

    // 실제 소스는 전부 빈 배열로 모킹했으므로 캐시 우회 시 total=0이어야 한다.
    expect(result.total).toBe(0)
  })

  describe("숨긴 미확인 건수 + includeUnconfirmed 토글 (C2)", () => {
    beforeEach(() => {
      mocks.unstableCache.mockImplementation(() =>
        vi.fn().mockResolvedValue(CACHED_SNAPSHOT_WITH_UNCONFIRMED)
      )
    })

    it("토글은 스냅샷 캐시 키·옵션을 바꾸지 않는다 — 게이트는 캐시 뒤 요청별 후처리다", async () => {
      const { getCrmUnifiedCustomers } = await loadRepository()

      await getCrmUnifiedCustomers({})
      await getCrmUnifiedCustomers({ includeUnconfirmed: true })

      // 모듈 로드 시 1회 감싸고, 이후 호출은 같은 캐시 함수를 재사용한다(토글별 키 분기 없음).
      expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
      expect(mocks.unstableCache.mock.calls[0][1]).toEqual(["admin-crm-unified-snapshot"])
    })

    it("기본(토글 off): 미확인 리드는 숨기고 summary.hiddenUnconfirmedCount로 건수만 내려준다", async () => {
      const { getCrmUnifiedCustomers } = await loadRepository()

      const result = await getCrmUnifiedCustomers({})

      expect(result.rows.map((row) => row.key)).toEqual(["lead:confirmed"])
      expect(result.summary.total).toBe(1)
      expect(result.summary.hiddenUnconfirmedCount).toBe(1)
      // 숨긴 행의 담당자는 담당 셀렉트 카운트에도 새지 않는다(목록·배지 정합).
      expect(result.owners.map((owner) => owner.ownerName)).not.toContain("미확인담당")
    })

    it("includeUnconfirmed=true: 숨겼던 건수만큼 목록에 추가되고 hiddenUnconfirmedCount는 0", async () => {
      const { getCrmUnifiedCustomers } = await loadRepository()

      const hidden = await getCrmUnifiedCustomers({})
      const included = await getCrmUnifiedCustomers({ includeUnconfirmed: true })

      expect(new Set(included.rows.map((row) => row.key))).toEqual(new Set(["lead:confirmed", "lead:unconfirmed"]))
      expect(included.summary.total).toBe(hidden.summary.total + hidden.summary.hiddenUnconfirmedCount)
      expect(included.summary.hiddenUnconfirmedCount).toBe(0)
      expect(included.owners.map((owner) => owner.ownerName)).toContain("미확인담당")
    })

    it("게이트 면제 뷰(unanswered)에서는 애초에 숨긴 게 없어 건수가 0이다", async () => {
      const { getCrmUnifiedCustomers } = await loadRepository()

      const result = await getCrmUnifiedCustomers({ view: "unanswered" })

      expect(result.rows.map((row) => row.key).sort()).toEqual(["lead:confirmed", "lead:unconfirmed"])
      expect(result.summary.hiddenUnconfirmedCount).toBe(0)
    })

    it("검색 범위가 미확인 리드를 제외하면 건수도 그 범위 안에서만 센다", async () => {
      const { getCrmUnifiedCustomers } = await loadRepository()

      const result = await getCrmUnifiedCustomers({ q: "확인 리드" })

      // "확인 리드"는 두 이름 모두에 포함되므로 1건 숨김, 담당자로 좁히면 0건.
      expect(result.summary.hiddenUnconfirmedCount).toBe(1)
      const narrowed = await getCrmUnifiedCustomers({ owner: "김담당" })
      expect(narrowed.summary.hiddenUnconfirmedCount).toBe(0)
    })
  })

  it("invalidateCrmUnifiedSourceSnapshot()은 admin-crm-unified-snapshot 태그를 SWR로 무효화한다", async () => {
    const { invalidateCrmUnifiedSourceSnapshot } = await loadRepository()

    invalidateCrmUnifiedSourceSnapshot()

    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-unified-snapshot", "max")
  })
})
