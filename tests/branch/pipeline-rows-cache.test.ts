// lib/branch/pipeline-rows.ts — readBranchPipelineRows 콜드 인스턴스 재계산 방지 회귀 가드 (2026-09-04).
//
// 배경: /api/admin/branch/pipeline과 원장 페이지 서버 프리페치(app/admin/branch/ledger/
// page.tsx)가 공유하는 이 조립 함수는 listRevRevenue(필터·월별 확정액 산정·weeklyPayments
// raw 파싱·정렬)를 매 호출 재계산했다 — 하위 소스(readRevDealsFromActiveImport/
// listBranchRevDeals)가 이미 각자 unstable_cache라도, 이 조립 자체엔 캐시가 없었다.
// unstable_cache로 감싸 같은 (team, period, periodDate, manager, region) 조합이면
// 소스 재조회 + CPU 재계산 없이 재사용하게 한다. 태그는 새로 만들지 않고 하위 소스가 이미 쓰는
// SALES_LEDGER_IMPORTS_CACHE_TAG·BRANCH_REV_DEALS_CACHE_TAG를 재사용한다 — 액티브 임포트
// 재캡처·REV 미러 교체가 이 조립 캐시도 함께 무효화하게 하기 위해서다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const DEAL_ALL = {
  id: "d1", sheet_row: 1, customer_name: "고객A", branch_contact: null,
  team: "BD", manager: "Han", deal_type: "Direct", status: "New",
  first_payment: null, product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 1000,
  monthly_payments: { "2026-04": 100 },
  monthly_red: {}, monthly_confirmed: {}, monthly_high_conf: {},
  raw: { weeklyPayments: { "2026-04": [10, 20, 0, 0, 70] } },
  synced_at: "2026-07-01T00:00:00.000Z",
}

async function loadPipelineRows() {
  vi.resetModules()
  const capturedTags: Record<string, string[]> = {}
  const readRevDealsFromActiveImport = vi.fn(async () => null)
  const listBranchRevDeals = vi.fn(async () => [DEAL_ALL])

  vi.doMock("@/lib/repositories/sales-ledger-imports", () => ({
    readRevDealsFromActiveImport,
    SALES_LEDGER_IMPORTS_CACHE_TAG: "sales-ledger-imports",
  }))
  vi.doMock("@/lib/repositories/branch-deals", () => ({
    listBranchRevDeals,
    BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals",
  }))
  vi.doMock("next/cache", () => {
    const stores = new Map<string, Map<string, unknown>>()
    return {
      unstable_cache: (
        fn: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[],
        options?: { revalidate?: number; tags?: string[] },
      ) => {
        const cacheKey = keyParts.join("|")
        capturedTags[cacheKey] = options?.tags ?? []
        if (!stores.has(cacheKey)) stores.set(cacheKey, new Map())
        const store = stores.get(cacheKey)!
        return async (...args: unknown[]) => {
          const argsKey = JSON.stringify(args)
          if (store.has(argsKey)) return store.get(argsKey)
          const result = await fn(...args)
          store.set(argsKey, result)
          return result
        }
      },
    }
  })

  const mod = await import("@/lib/branch/pipeline-rows")
  return { ...mod, readRevDealsFromActiveImport, listBranchRevDeals, capturedTags }
}

describe("readBranchPipelineRows — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock("@/lib/repositories/sales-ledger-imports")
    vi.doUnmock("@/lib/repositories/branch-deals")
    vi.doUnmock("next/cache")
    vi.resetModules()
  })

  it("SALES_LEDGER_IMPORTS_CACHE_TAG·BRANCH_REV_DEALS_CACHE_TAG를 재사용하고 60초로 캐시한다", async () => {
    const { readBranchPipelineRows, capturedTags } = await loadPipelineRows()
    await readBranchPipelineRows({ team: "ALL", period: "Q", periodDate: new Date("2026-08-01") })

    const [cacheKey] = Object.keys(capturedTags)
    expect(cacheKey).toBeDefined()
    expect(capturedTags[cacheKey]).toEqual(["sales-ledger-imports", "branch-rev-deals"])
  })

  it("같은 인자로 두 번 부르면 소스 재조회 없이 재사용한다(콜드 인스턴스 재계산 제거)", async () => {
    const { readBranchPipelineRows, listBranchRevDeals } = await loadPipelineRows()
    const query = { team: "ALL" as const, period: "Q" as const, periodDate: new Date("2026-08-01") }

    await readBranchPipelineRows(query)
    await readBranchPipelineRows(query)

    expect(listBranchRevDeals).toHaveBeenCalledTimes(1)
  })

  it("team이 다르면 별도 엔트리로 재조회한다", async () => {
    const { readBranchPipelineRows, listBranchRevDeals } = await loadPipelineRows()

    await readBranchPipelineRows({ team: "ALL", period: "Q", periodDate: new Date("2026-08-01") })
    await readBranchPipelineRows({ team: "BD", period: "Q", periodDate: new Date("2026-08-01") })

    expect(listBranchRevDeals).toHaveBeenCalledTimes(2)
  })

  it("미러 폴백 호출 인자는 캐시 도입 전과 동일하게 유지된다(team 미지정이면 undefined 그대로)", async () => {
    const { readBranchPipelineRows, listBranchRevDeals } = await loadPipelineRows()
    await readBranchPipelineRows({})

    expect(listBranchRevDeals).toHaveBeenCalledWith(
      expect.objectContaining({ team: undefined }),
      { withRaw: true },
    )
  })

  it("weeklyPayments 등 조립 결과 필드는 캐시 도입 후에도 그대로 나온다", async () => {
    const { readBranchPipelineRows } = await loadPipelineRows()
    const rows = await readBranchPipelineRows({ team: "ALL" })

    expect(rows).toHaveLength(1)
    expect(rows[0].weeklyPayments["2026-04"]).toEqual([10, 20, 0, 0, 70])
  })
})
