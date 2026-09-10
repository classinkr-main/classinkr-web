// perf-assemble.ts — assembleMarketingPerf를 감싸는 공유 Data Cache 배선 회귀 가드 (2026-09-04).
//
// 배경: /api/admin/marketing/perf 는 route-local 45초 Map(perfMemo)으로, insights 빌더는
// 자신만의 45초 Map(buildMemo) 안에서 assembleMarketingPerf("30d")를 "따로" 다시 계산했다.
// 둘 다 모듈 메모라 Vercel Fluid 콜드 인스턴스에서는 매번 비어 있었고, 같은 period="30d"
// 호출도 두 소비처가 캐시를 공유하지 못했다. assembleMarketingPerf를 단일 unstable_cache로
// 감싸(getCachedMarketingPerf) 두 소비처가 같은 Data Cache 엔트리를 쓰게 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

async function loadPerfAssemble() {
  vi.resetModules()
  unstableCacheCalls.length = 0
  vi.doMock("next/cache", () => ({
    unstable_cache: (
      fn: (...args: unknown[]) => unknown,
      keyParts: string[],
      options?: { revalidate?: number; tags?: string[] },
    ) => {
      unstableCacheCalls.push({ keyParts, options })
      return fn
    },
    revalidateTag: vi.fn(),
  }))
  return import("@/lib/marketing/perf-assemble")
}

describe("getCachedMarketingPerf — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock("next/cache")
    vi.resetModules()
  })

  it("marketing-perf-v1 키·MARKETING_PERF_CACHE_TAG 태그·60초로 캐시한다", async () => {
    const { MARKETING_PERF_CACHE_TAG } = await import("@/lib/repositories/marketing")
    await loadPerfAssemble()

    // perf-assemble.ts는 lib/repositories/marketing.ts(자체 getCachedAllCampaigns unstable_cache
    // 보유)를 임포트 체인에 끌어오므로, 이 목은 전체 그래프의 모든 unstable_cache 호출을 잡는다 —
    // marketing-perf-v1 키를 가진 항목만 골라 검증한다(개수 단정 대신 정확한 항목 매칭).
    const call = unstableCacheCalls.find((c) => c.keyParts[0] === "marketing-perf-v1")
    expect(call).toBeDefined()
    expect(call?.keyParts).toEqual(["marketing-perf-v1"])
    expect(call?.options).toEqual({
      revalidate: 60,
      tags: [MARKETING_PERF_CACHE_TAG],
    })
    expect(MARKETING_PERF_CACHE_TAG).toBe("marketing-perf")
  })
})
