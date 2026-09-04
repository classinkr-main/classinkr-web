/**
 * lib/admin-crm-matching.ts 의 getAdminCrmMatchingInbox 소스 스냅샷 캐시 배선 계약.
 *
 * 이전에는 인스턴스 모듈 메모(matchingSnapshotMemo, 30초 TTL)였다 — Vercel Fluid 인스턴스가
 * 콜드일 때마다 비어 있어 매 요청이 9-테이블 스냅샷 재조립을 물었다. unstable_cache(Data
 * Cache)는 인스턴스 간 공유되고 stale-while-revalidate라 콜드 인스턴스에서도 다른 인스턴스가
 * 데운 값을 즉시 돌려준다. fresh=1 bypass는 캐시를 우회해 새로 계산하고, 다음 캐시 읽기가
 * 반드시 새 값을 보도록 태그를 즉시 하드 만료한다(T1의 force와 같은 컨벤션).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createRecordingSupabaseClient,
  type RecordedQueryResolver,
} from "../helpers/recording-supabase-client"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

// unstable_cache가 실제로 감싸는 값과 구분되는 "캐시에서 왔다"는 표식의 가짜 스냅샷.
const CACHED_SENTINEL_SNAPSHOT = {
  generatedAt: "sentinel-cached",
  rows: [],
  summary: {
    branch_rev_sheet: {
      reviewCount: 0,
      invalidReviewCount: 0,
      confirmedCount: 0,
      autoConfirmedCount: 0,
      unmatchedCount: 0,
      unmatchedAmount: 0,
    },
    xiaoshouyi: {
      reviewCount: 0,
      invalidReviewCount: 0,
      confirmedCount: 0,
      autoConfirmedCount: 0,
      unmatchedCount: 0,
      unmatchedAmount: 0,
    },
    lead: {
      reviewCount: 0,
      invalidReviewCount: 0,
      confirmedCount: 0,
      autoConfirmedCount: 0,
      unmatchedCount: 0,
      unmatchedAmount: 0,
    },
  },
  totals: {
    reviewCount: 0,
    invalidReviewCount: 0,
    confirmedCount: 0,
    autoConfirmedCount: 0,
    unmatchedCount: 0,
    sheetMatchedRatio: null,
  },
  warnings: [],
}

let fakeFrom: ReturnType<typeof createRecordingSupabaseClient>["client"]["from"]

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fakeFrom }),
}))
vi.mock("@/lib/external-crm/owner-names", () => ({
  resolveOwnerName: (name: string | null) => name,
}))
vi.mock("@/lib/admin-crm-scope", () => ({
  EXTERNAL_CRM_KOREA_ONLY: false,
  getKoreaTeamManagerSet: vi.fn().mockResolvedValue(new Set()),
  isKoreaScopedOwner: () => true,
  isKoreaTeamLabel: () => true,
}))

function setupEmptySources() {
  const resolve: RecordedQueryResolver = () => ({ data: [], error: null, count: 0 })
  const { client } = createRecordingSupabaseClient(resolve)
  fakeFrom = client.from
}

async function loadModule() {
  vi.resetModules()
  setupEmptySources()
  return import("@/lib/admin-crm-matching")
}

describe("getAdminCrmMatchingInbox 소스 스냅샷 캐시 배선", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset()
    mocks.unstableCache.mockImplementation(() => vi.fn().mockResolvedValue(CACHED_SENTINEL_SNAPSHOT))
    mocks.revalidateTag.mockClear()
  })

  it("unstable_cache(30초, admin-crm-matching-snapshot 태그)로 감싼다", async () => {
    const { ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG } = await loadModule()

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1)
    const [fn, keyParts, options] = mocks.unstableCache.mock.calls[0]
    expect(typeof fn).toBe("function")
    expect(keyParts).toEqual([ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG])
    expect(options).toEqual({ revalidate: 30, tags: [ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG] })
  })

  it("fresh가 아니면 캐시된 경로(모의 unstable_cache의 센티널 값)를 쓰고 revalidateTag를 부르지 않는다", async () => {
    const { getAdminCrmMatchingInbox } = await loadModule()

    const inbox = await getAdminCrmMatchingInbox({})

    expect(inbox.generatedAt).toBe("sentinel-cached")
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("fresh=true는 캐시를 우회해 새로 계산하고 태그를 즉시 하드 만료한다", async () => {
    const { getAdminCrmMatchingInbox, ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG } = await loadModule()

    const inbox = await getAdminCrmMatchingInbox({ fresh: true })

    // 실제 소스는 전부 빈 결과로 모킹했으므로 센티널이 아닌 실제 재계산 결과다.
    expect(inbox.generatedAt).not.toBe("sentinel-cached")
    expect(inbox.rows).toEqual([])
    expect(mocks.revalidateTag).toHaveBeenCalledWith(ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG, { expire: 0 })
  })
})
