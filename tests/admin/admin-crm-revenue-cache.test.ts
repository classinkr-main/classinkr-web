/**
 * lib/admin-crm-revenue.ts 의 getAdminCrmRevenueDashboard 캐시 배선 계약.
 *
 * 근본 원인(T3): assembleAdminCrmRevenueDashboard(months)는 unstable_cache로 감싸여
 * 있었지만 months가 호출 인자였다 — 14개 테이블 스캔(파트너/견적/계약/영수증/계정/고객/거래/
 * 시트/소스링크×2/외부스냅샷/싱크런/쓰기요청)은 전부 updated_at 최신순 limit이라 months와
 * 무관하게 같은 행을 읽는데도, unstable_cache 인자로 들어간 months(3~12, 최대 10가지 값)가
 * 서로 다른 캐시 키를 만들어 웜 히트율을 쪼갰다(months=6 반복 요청도 다른 months로 요청이
 * 섞이면 45초 창을 다 못 채우고 다시 콜드가 됨). 실제로 range/monthly[]만 months에 의존하고
 * summary/partners/risks/documents/sheetMatches/sources/identity/externalSnapshot은 전부
 * 이 고정 행 집합에서만 계산된다(addMonthlyAmountByKey가 유일한 월 종속 지점).
 *
 * 수정: 무거운 조립은 12개월(최대 clamp) 고정 단일 키로 unstable_cache하고, 요청 months로
 * 좁히는 건 캐시 밖에서 순수 슬라이스로 처리한다 — T1/T2와 같은 "인자 없는" 검증된 패턴.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
}))
// lib/repositories/sales-ledger-imports.ts는 그 자체로 unstable_cache 호출부를 4개 갖고
// 있어(readCachedRevDealsForImportRun 등) admin-crm-revenue.ts를 import하기만 해도
// 모듈 최상단에서 함께 실행된다 — 이 파일이 검증할 캐시 배선(admin-crm-revenue 태그)과
// 무관하므로 여기서는 readRevDealsFromActiveImport만 안전한 스텁으로 대체한다.
vi.mock("@/lib/repositories/sales-ledger-imports", () => ({
  readRevDealsFromActiveImport: vi.fn().mockResolvedValue(null),
}))

const MONTHS_12 = Array.from({ length: 12 }, (_, index) => {
  const month = `2026-${String(index + 1).padStart(2, "0")}`
  return {
    month,
    quotedAmount: (index + 1) * 100,
    contractedAmount: 0,
    paidAmount: 0,
    expectedAmount: 0,
    sheetConfirmedAmount: 0,
    sheetHighConfidenceAmount: 0,
    sheetExpectedAmount: 0,
  }
})

const CACHED_SENTINEL_DASHBOARD = {
  generatedAt: "",
  range: { months: 12, startMonth: MONTHS_12[0].month, endMonth: MONTHS_12[11].month },
  monthly: MONTHS_12,
  summary: { contractedAmount: 999_000, sourceRecordCount: 7 },
  sheet: null,
  identity: null,
  sheetMatches: [],
  externalSnapshot: null,
  externalRecords: [],
  externalLinks: [],
  writeRequests: [],
  partners: [],
  risks: [],
  documents: [],
  sources: [],
  warnings: [],
}

async function loadModule() {
  vi.resetModules()
  return import("@/lib/admin-crm-revenue")
}

describe("getAdminCrmRevenueDashboard 캐시 배선", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(CACHED_SENTINEL_DASHBOARD))
  })

  it("unstable_cache(45초, admin-crm-revenue 태그)로 감싸고, 그 콜백은 인자를 받지 않는다", async () => {
    const { getAdminCrmRevenueDashboard, ADMIN_CRM_REVENUE_CACHE_TAG } = await loadModule()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(keyParts).toEqual([ADMIN_CRM_REVENUE_CACHE_TAG])
    expect(options).toEqual({ revalidate: 45, tags: [ADMIN_CRM_REVENUE_CACHE_TAG] })

    const cachedFn = mocks.unstableCache.mock.results[0].value
    await getAdminCrmRevenueDashboard(6)
    // 캐시된 콜백은 months를 인자로 받지 않는다 — 인자가 다르면 unstable_cache가 별도
    // 캐시 키를 만들어 웜 히트율을 쪼개던 근본 원인이 사라졌는지 여기서 고정한다.
    expect(cachedFn).toHaveBeenCalledWith()
  })

  it("months가 달라도 unstable_cache 등록은 한 번뿐이다(캐시 키 분열 없음)", async () => {
    const { getAdminCrmRevenueDashboard } = await loadModule()

    await getAdminCrmRevenueDashboard(3)
    await getAdminCrmRevenueDashboard(6)
    await getAdminCrmRevenueDashboard(12)

    // unstable_cache(...)는 모듈 로드 시 한 번만 호출된다 — months별로 다시 부르지 않는다.
    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const cachedFn = mocks.unstableCache.mock.results[0].value
    expect(cachedFn).toHaveBeenCalledTimes(3)
    for (const call of cachedFn.mock.calls) {
      expect(call).toEqual([])
    }
  })

  it("months=3은 캐시된 12개월 monthly[]의 마지막 3개로 좁힌다", async () => {
    const { getAdminCrmRevenueDashboard } = await loadModule()

    const dashboard = await getAdminCrmRevenueDashboard(3)

    expect(dashboard.monthly.map((point) => point.month)).toEqual(["2026-10", "2026-11", "2026-12"])
    expect(dashboard.range).toEqual({ months: 3, startMonth: "2026-10", endMonth: "2026-12" })
  })

  it("months와 무관한 필드(summary 등)는 캐시된 값을 그대로 통과시킨다", async () => {
    const { getAdminCrmRevenueDashboard } = await loadModule()

    const dashboard3 = await getAdminCrmRevenueDashboard(3)
    const dashboard12 = await getAdminCrmRevenueDashboard(12)

    expect(dashboard3.summary).toEqual({ contractedAmount: 999_000, sourceRecordCount: 7 })
    expect(dashboard12.summary).toEqual(dashboard3.summary)
  })

  it("캐시 히트여도 매 호출 최신 generatedAt을 찍는다", async () => {
    const { getAdminCrmRevenueDashboard } = await loadModule()

    const dashboard = await getAdminCrmRevenueDashboard(6)

    expect(dashboard.generatedAt).toEqual(expect.any(String))
    expect(dashboard.generatedAt).not.toBe("")
  })
})
