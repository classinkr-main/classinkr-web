/**
 * lib/repositories/crm-region-map.ts 의 getCrmRegionMap 캐시 배선 계약 (2026-09-10 3라운드 §3.3).
 *
 * 이전엔 module-level `let cache`+`inFlight`로 손으로 구현한 60초 캐시+동시요청 합치기였다 —
 * process-local이라 Vercel Fluid 인스턴스마다 따로 놀았다. unstable_cache(Data Cache)로 옮기고
 * 동시요청 합치기는 shareInFlight로 대체했다. 무효화는 부분적이다(naver-map 재수집·NEO 동기화만) —
 * 그래서 TTL은 이전과 같은 60초로 유지했다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, type RecordedQueryResolver } from "../helpers/recording-supabase-client"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

const CACHED_SENTINEL: unknown = { generatedAt: "sentinel-cached", provinces: [], layers: [] }

let fakeFrom: ReturnType<typeof createRecordingSupabaseClient>["client"]["from"]

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fakeFrom }),
}))

function setupEmptySources() {
  const resolve: RecordedQueryResolver = () => ({ data: [], error: null })
  const { client } = createRecordingSupabaseClient(resolve)
  fakeFrom = client.from
}

async function loadModule() {
  vi.resetModules()
  setupEmptySources()
  return import("@/lib/repositories/crm-region-map")
}

describe("crm-region-map getCrmRegionMap 캐시 배선", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(CACHED_SENTINEL))
    mocks.revalidateTag.mockClear()
  })

  it("unstable_cache(60초, admin-crm-region-map 태그)로 감싼다", async () => {
    await loadModule()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual(["admin-crm-region-map-v1"])
    expect(options).toEqual({ revalidate: 60, tags: ["admin-crm-region-map"] })
  })

  it("force 없이 부르면 캐시된 경로(센티널)를 쓴다", async () => {
    const { getCrmRegionMap } = await loadModule()

    const result = await getCrmRegionMap()

    expect(result).toEqual(CACHED_SENTINEL)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("force:true는 캐시를 우회해 실제 재계산하고, 다음 읽기를 위해 태그도 무효화한다", async () => {
    const { getCrmRegionMap } = await loadModule()

    const result = await getCrmRegionMap({ force: true })

    // 실제 소스는 빈 배열로 모킹했으므로 센티널이 아닌 실제 재계산 결과(coverage 0)여야 한다.
    expect(result).not.toEqual(CACHED_SENTINEL)
    expect(result.provinces.length).toBeGreaterThan(0)
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-region-map", "max")
  })

  it("invalidateCrmRegionMapCache()는 admin-crm-region-map 태그를 SWR로 무효화한다", async () => {
    const { invalidateCrmRegionMapCache } = await loadModule()

    invalidateCrmRegionMapCache()

    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-crm-region-map", "max")
  })
})
