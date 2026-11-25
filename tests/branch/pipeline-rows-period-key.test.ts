// lib/branch/pipeline-rows.ts — 캐시 키의 기간은 KST 영업월(F-50). 예전에는 ISO 시각(밀리초 포함)을 키로 써서
// 분기·연 보기의 페이지 프리페치와 API 라우트가 같은 엔트리를 한 번도 나눠 쓰지 못했다.
// 행에는 읽는 시점 확도 재료(pendingCells·monthWeekMismatch)를 deal.raw 에서 옮겨 싣는다(F-08·F-15).
import { afterEach, describe, expect, it, vi } from "vitest"

const DEAL = {
  id: "d1", sheet_row: 1, customer_name: "예시학원1", branch_contact: null,
  team: "BD", manager: "예시A", deal_type: "Direct", status: "New",
  first_payment: null, product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 1000,
  monthly_payments: { "2026-12": 300 },
  monthly_red: {}, monthly_confirmed: { "2026-12": 0 }, monthly_high_conf: {},
  raw: {
    weeklyPayments: { "2026-12": [100, 200, 0, 0, 0] },
    pendingCells: { "2026-12": [{ week: 1, start: "2026-12-01", amount: 100 }, { week: 2, start: "2026-12-08", amount: 200 }] },
    monthWeekMismatch: { "2026-11": { month: 0, weeks: 50 } },
  },
  synced_at: "2026-11-30T12:00:00.000Z",
}

async function loadPipelineRows() {
  vi.resetModules()
  const readRevDealsFromActiveImport = vi.fn(async () => null)
  const listBranchRevDeals = vi.fn(async () => [DEAL])
  const keys: string[] = []
  vi.doMock("@/lib/repositories/sales-ledger-imports", () => ({
    readRevDealsFromActiveImport,
    SALES_LEDGER_IMPORTS_CACHE_TAG: "sales-ledger-imports",
  }))
  vi.doMock("@/lib/repositories/branch-deals", () => ({
    listBranchRevDeals,
    BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals",
  }))
  vi.doMock("next/cache", () => {
    const store = new Map<string, unknown>()
    return {
      unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) => async (...args: unknown[]) => {
        const key = `${keyParts.join("|")}:${JSON.stringify(args)}`
        keys.push(key)
        if (store.has(key)) return store.get(key)
        const result = await fn(...args)
        store.set(key, result)
        return result
      },
    }
  })
  const mod = await import("@/lib/branch/pipeline-rows")
  return { ...mod, readRevDealsFromActiveImport, listBranchRevDeals, keys }
}

afterEach(() => {
  vi.doUnmock("@/lib/repositories/sales-ledger-imports")
  vi.doUnmock("@/lib/repositories/branch-deals")
  vi.doUnmock("next/cache")
  vi.resetModules()
})

describe("pipelinePeriodCacheMonth", () => {
  it("기준일의 KST 영업월 — 12/1 00:05 KST 는 12월", async () => {
    const { pipelinePeriodCacheMonth } = await loadPipelineRows()
    expect(pipelinePeriodCacheMonth(new Date("2026-11-30T15:05:00Z"))).toBe("2026-12")
    expect(pipelinePeriodCacheMonth(new Date("2026-11-30T14:59:00Z"))).toBe("2026-11")
    expect(pipelinePeriodCacheMonth(null)).toBeNull()
    expect(pipelinePeriodCacheMonth(new Date("bad"))).toBeNull()
  })
})

describe("readBranchPipelineRows — 같은 영업월은 같은 캐시 엔트리", () => {
  it("프리페치(지금 시각)와 라우트(조금 뒤 시각)가 같은 키로 한 번만 읽는다", async () => {
    const { readBranchPipelineRows, listBranchRevDeals, keys } = await loadPipelineRows()
    await readBranchPipelineRows({ team: "ALL", period: "Q", periodDate: new Date("2026-11-25T01:02:03.456Z") })
    await readBranchPipelineRows({ team: "ALL", period: "Q", periodDate: new Date("2026-11-25T09:59:59.999Z") })
    expect(listBranchRevDeals).toHaveBeenCalledTimes(1)
    expect(keys[0]).toContain("branch-pipeline-rows-v4")
    expect(keys[0]).toContain('"2026-11"')
    expect(keys[0]).not.toContain("T01:02")
  })

  it("행에 deal.raw 의 pendingCells·monthWeekMismatch 를 싣는다(검증본)", async () => {
    const { readBranchPipelineRows } = await loadPipelineRows()
    const [row] = await readBranchPipelineRows({ team: "ALL", period: "M", periodDate: new Date(Date.UTC(2026, 11, 1)) })
    expect(row.pendingCells).toEqual(DEAL.raw.pendingCells)
    expect(row.monthWeekMismatch).toEqual(DEAL.raw.monthWeekMismatch)
    expect(row.weeklyPayments["2026-12"]).toEqual([100, 200, 0, 0, 0])
  })
})
