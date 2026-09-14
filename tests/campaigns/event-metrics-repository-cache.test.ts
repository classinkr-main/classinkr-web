// lib/repositories/event-metrics.ts — 쓰기 경로 회귀 가드.
//
// admin-performance-round3-2026-09-10.md §3.4 — perf 조립(lib/marketing/perf-assemble.ts)이
// getAllEventMetrics로 channelSpend/eventAdSpend를 계산해 MARKETING_PERF_CACHE_TAG로
// 캐시하는데, 저장/삭제가 그 태그를 무효화하지 않아 행사 광고비 수기 입력이 최대 60초 동안
// perf 대시보드에 반영되지 않았다. Supabase 클라이언트를 목킹해 무효화 호출만 고정한다.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }

// getEventMetrics(읽기, maybeSingle)와 saveEventMetrics의 upsert/delete(쓰기, 직접 awaited
// thenable)는 서로 다른 결과가 필요하다 — read-merge-upsert에서 읽기는 성공하되 쓰기만
// 실패하는 경우를 검증해야 하기 때문이다.
let readResult: Result
let writeResult: Result
const fromSpy = vi.fn(() => makeBuilder())
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))
// event-metrics.ts가 MARKETING_PERF_CACHE_TAG를 얻으려 lib/repositories/marketing.ts를
// 임포트하는데, 그 파일도 자체 unstable_cache 호출을 모듈 스코프에서 갖고 있어 함께 목킹한다.
vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { saveEventMetrics, deleteEventMetrics } from "@/lib/repositories/event-metrics"

function makeBuilder() {
  const b = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    delete: vi.fn(() => b),
    upsert: vi.fn(() => b),
    maybeSingle: vi.fn(() => Promise.resolve(readResult)),
    then: (resolve: (v: Result) => void) => resolve(writeResult),
  }
  return b
}

beforeEach(() => {
  readResult = { data: null, error: null } // 신규 이벤트 — 기본값에서 병합 시작
  writeResult = { data: null, error: null }
  fromSpy.mockClear()
  revalidateTag.mockClear()
})

describe("saveEventMetrics", () => {
  it("성공하면 marketing-perf 태그를 max(SWR)로 무효화한다", async () => {
    const saved = await saveEventMetrics("evt-1", { targetLeads: 50 })

    expect(saved.targetLeads).toBe(50)
    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("upsert 가 실패하면 무효화 없이 던진다", async () => {
    writeResult = { data: null, error: { message: "upsert failed" } }

    await expect(saveEventMetrics("evt-1", { targetLeads: 50 })).rejects.toThrow(
      "[event-metrics] 저장 실패"
    )
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe("deleteEventMetrics", () => {
  it("성공하면 marketing-perf 태그를 max(SWR)로 무효화한다", async () => {
    await deleteEventMetrics("evt-1")

    expect(revalidateTag).toHaveBeenCalledWith("marketing-perf", "max")
  })

  it("실패하면 무효화 없이 던진다", async () => {
    writeResult = { data: null, error: { message: "delete failed" } }

    await expect(deleteEventMetrics("evt-1")).rejects.toThrow("[event-metrics] 삭제 실패")
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
