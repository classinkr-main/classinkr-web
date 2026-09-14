// lib/repositories/hardware-samples.ts — Data Cache 승격 + 무효화 배선 회귀 가드
// (admin-performance-round3-2026-09-10.md §3.3 — GET /api/admin/hardware/samples 콜드 1.1초).
//
// listSampleUnits/listSampleUnitEvents를 unstable_cache(60초)로 승격하고,
// registerSampleUnits/recordSampleUnitEvents는 저장 직후 같은 탭이 다시 조회하므로
// {expire:0}(즉시 하드 만료)로 무효화한다.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }

let queue: Result[]

function makeBuilder() {
  const b = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    like: vi.fn(() => b),
    limit: vi.fn(() => b),
    insert: vi.fn(() => b),
    update: vi.fn(() => b),
    then: (resolve: (v: Result) => void) => resolve(queue.shift() ?? { data: null, error: null }),
  }
  return b
}

const fromSpy = vi.fn(() => makeBuilder())
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: fromSpy })),
}))
vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import {
  HARDWARE_SAMPLES_CACHE_TAG,
  listSampleUnits,
  listSampleUnitEvents,
  registerSampleUnits,
  recordSampleUnitEvents,
} from "@/lib/repositories/hardware-samples"

beforeEach(() => {
  queue = []
  fromSpy.mockClear()
  revalidateTag.mockClear()
})

describe("listSampleUnits", () => {
  it("유닛 목록과 유닛별 최신 이벤트를 함께 반환한다", async () => {
    queue = [
      {
        data: [{ id: "u1", asset_code: "S-HW-01" }],
        error: null,
      },
      {
        data: [
          { id: "e2", unit_id: "u1", occurred_at: "2026-09-09", created_at: "2026-09-09T00:00:00Z" },
          { id: "e1", unit_id: "u1", occurred_at: "2026-09-08", created_at: "2026-09-08T00:00:00Z" },
        ],
        error: null,
      },
    ]

    const { units, latestEvents } = await listSampleUnits()

    expect(units).toHaveLength(1)
    // 이벤트는 occurred_at desc로 오므로 유닛당 첫 등장(가장 최신)만 남는다.
    expect(latestEvents.u1.id).toBe("e2")
  })
})

describe("listSampleUnitEvents", () => {
  it("유닛 하나의 타임라인을 반환한다", async () => {
    queue = [{ data: [{ id: "e1", unit_id: "u1" }], error: null }]

    const events = await listSampleUnitEvents("u1")

    expect(events).toEqual([{ id: "e1", unit_id: "u1" }])
  })
})

describe("registerSampleUnits", () => {
  it("성공하면 태그를 {expire:0}으로 즉시 하드 만료한다", async () => {
    queue = [
      { data: [], error: null }, // 기존 asset_code 조회
      {
        data: [{ id: "u1", asset_code: "S-HW-01", status: "office" }],
        error: null,
      }, // insert units
      { data: null, error: null }, // insert events
    ]

    const units = await registerSampleUnits({ productName: "HW-Sample", count: 1 })

    expect(units).toHaveLength(1)
    expect(revalidateTag).toHaveBeenCalledWith(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
  })
})

describe("recordSampleUnitEvents", () => {
  it("성공하면(패치 있음) 태그를 {expire:0}으로 즉시 하드 만료한다", async () => {
    queue = [
      { data: [{ id: "u1", asset_code: "S-HW-01", status: "office" }], error: null }, // 대상 유닛 조회
      { data: null, error: null }, // insert events
      { data: [{ id: "u1", asset_code: "S-HW-01", status: "loaned" }], error: null }, // update
    ]

    const units = await recordSampleUnitEvents({
      unitIds: ["u1"],
      eventType: "loan",
      customer: "테스트 고객",
    })

    expect(units[0].status).toBe("loaned")
    expect(revalidateTag).toHaveBeenCalledWith(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
  })

  it("패치 없는 이벤트(memo)도 이벤트 기록 시점에 무효화한다", async () => {
    queue = [
      { data: [{ id: "u1", asset_code: "S-HW-01", status: "office" }], error: null },
      { data: null, error: null }, // insert events
    ]

    const units = await recordSampleUnitEvents({
      unitIds: ["u1"],
      eventType: "memo",
      memo: "점검 메모",
    })

    expect(units[0].status).toBe("office") // 무변
    expect(revalidateTag).toHaveBeenCalledWith(HARDWARE_SAMPLES_CACHE_TAG, { expire: 0 })
  })

  it("검증 실패(대상 없음)는 쓰기·무효화 전에 던진다", async () => {
    await expect(
      recordSampleUnitEvents({ unitIds: [], eventType: "memo", memo: "x" })
    ).rejects.toThrow("대상 유닛을 선택하세요")
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
