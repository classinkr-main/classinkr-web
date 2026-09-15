// lib/repositories/campaign-updates.ts — 쓰기 경로 회귀 가드.
//
// admin-performance-round3-2026-09-10.md §3.4 — 이 로그 테이블은 marketing-perf
// 대시보드(lib/marketing/perf-assemble.ts의 listRecentUpdates/latestUpdatesByCampaign)가
// 읽어 MARKETING_PERF_CACHE_TAG로 캐시하는데, 생성/삭제가 그 태그를 무효화하지 않아
// 새 업데이트 로그가 최대 60초 동안 대시보드 피드에 나타나지 않았다. 마이그레이션/DB는
// 건드리지 않는다 — Supabase 클라이언트를 목킹해 무효화 호출만 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }

let result: Result
let builder: ReturnType<typeof makeBuilder>
const fromSpy = vi.fn(() => builder)
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))
// campaign-updates.ts가 MARKETING_PERF_CACHE_TAG를 얻으려 lib/repositories/marketing.ts를
// 임포트하는데, 그 파일도 자체 getCachedAllCampaigns를 모듈 스코프에서 unstable_cache로
// 감싸므로 함께 목킹해야 한다(tests/repositories/marketing-campaigns.test.ts와 동일 사유).
vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import {
  createCampaignUpdate,
  deleteCampaignUpdate,
} from "@/lib/repositories/campaign-updates"

function makeBuilder() {
  const b = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    insert: vi.fn(() => b),
    delete: vi.fn(() => b),
    single: vi.fn(() => b),
    then: (resolve: (v: Result) => void) => resolve(result),
  }
  return b
}

beforeEach(() => {
  result = { data: null, error: null }
  builder = makeBuilder()
  fromSpy.mockClear()
  revalidateTag.mockClear()
})

describe("createCampaignUpdate", () => {
  it("성공하면 marketing-perf 태그를 max(SWR)로 무효화한다", async () => {
    result = {
      data: {
        id: "upd-1",
        campaign_id: "camp-1",
        kind: "note",
        body: "진행 중",
        created_by: "manager-1",
        created_at: "2026-09-10T00:00:00.000Z",
      },
      error: null,
    }

    const update = await createCampaignUpdate({
      campaignId: "camp-1",
      kind: "note",
      body: "진행 중",
      createdBy: "manager-1",
    })

    expect(update.id).toBe("upd-1")
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("실패하면 무효화 없이 던진다", async () => {
    result = { data: null, error: { message: "insert failed" } }

    await expect(
      createCampaignUpdate({ campaignId: "camp-1", kind: "note", body: "x" })
    ).rejects.toThrow("[campaign-updates] 생성 실패")
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe("deleteCampaignUpdate", () => {
  it("성공하면 marketing-perf 태그를 max(SWR)로 무효화한다", async () => {
    result = { data: null, error: null }

    await deleteCampaignUpdate("camp-1", "upd-1")

    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("실패하면 무효화 없이 던진다", async () => {
    result = { data: null, error: { message: "delete failed" } }

    await expect(deleteCampaignUpdate("camp-1", "upd-1")).rejects.toThrow(
      "[campaign-updates] 삭제 실패"
    )
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
