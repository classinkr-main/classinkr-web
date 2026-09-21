import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Compass 요약(§13 D1) — lib/compass/bridge.ts의 새 슬라이스 함수와 lib/compass/summary.ts의
// 집계를 함께 검증한다. 다른 compass 브리지 테스트(bridge-memo.test.ts 등)와 같은 방식으로
// @/lib/supabase/admin만 목으로 세우고 브리지·summary 모듈은 실제 구현을 그대로 통과시킨다 —
// buildCompassSummary가 실제로 부르는 select 컬럼·테이블·페이지네이션까지 한 번에 고정된다.

type Chain = Record<string, ReturnType<typeof vi.fn>>

let leadsChain: Chain
let demosChain: Chain
let fromMock: ReturnType<typeof vi.fn>

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import {
  __resetCompassBridgeMemoForTests,
  getCompassLeadSliceByInflowRange,
} from "@/lib/compass/bridge"
import { buildCompassSummary } from "@/lib/compass/summary"
import { compassLeadUrl } from "@/lib/compass/normalize"
import {
  COMPASS_CARE_STAGES,
  COMPASS_FUNNEL_STAGES,
  COMPASS_SUMMARY_ACTION_LIMIT,
  COMPASS_SUMMARY_OWNER_LIMIT,
} from "@/lib/compass/summary-contract"

// ---------------------------------------------------------------------------
// 체인 팩토리 — compass_leads_v는 세 갈래(슬라이스 .range / BD카운트 .is / 다음액션 .limit)로
// 갈리므로 종단 메서드 이름이 겹치지 않아 하나의 체인으로 셋 다 서빙할 수 있다.
// compass_demos_v는 별도(select→gte→lte→order, 종단이 .order).
// ---------------------------------------------------------------------------

function leadsViewChain(config: {
  onRange?: (from: number, to: number) => { data?: unknown[] | null; error?: unknown }
  bdCount?: { count?: number | null; error?: unknown }
  upcoming?: { data?: unknown[] | null; error?: unknown }
}): Chain {
  const chain: Chain = {}
  chain.select = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.is = vi.fn(() => Promise.resolve(config.bdCount ?? { count: 0, error: null }))
  chain.range = vi.fn((from: number, to: number) =>
    Promise.resolve(config.onRange ? config.onRange(from, to) : { data: [], error: null })
  )
  chain.limit = vi.fn(() => Promise.resolve(config.upcoming ?? { data: [], error: null }))
  return chain
}

function demosViewChain(result: { data?: unknown[] | null; error?: unknown }): Chain {
  const chain: Chain = {}
  chain.select = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.order = vi.fn(() => Promise.resolve(result))
  return chain
}

function routeFrom(table: string) {
  return table === "compass_demos_v" ? demosChain : leadsChain
}

function sliceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    academy: "학원",
    name: "홍길동",
    phone_key: null,
    stage: "new",
    lost_reason: null,
    owner: null,
    caller: null,
    team: null,
    channel: null,
    platform: null,
    meta_ad_id: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: null,
    last_inflow_at: "2026-09-15T00:00:00.000Z",
    demo_at: null,
    account_at: null,
    neocrm_registered_at: null,
    care_stage: null,
    care_track: null,
    next_action_at: null,
    next_action: null,
    bd_owner: null,
    bd_prob: null,
    bd_paid_at: null,
    ...overrides,
  }
}

function upcomingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    academy: "학원",
    name: "홍길동",
    stage: "consult",
    owner: "김담당",
    caller: null,
    next_action: "통화",
    next_action_at: "2026-09-20T06:00:00.000Z",
    ...overrides,
  }
}

const NOW = new Date("2026-09-20T04:00:00.000Z") // KST 13:00, 같은 날 안에서 오늘 KST 경계 안전

beforeEach(() => {
  __resetCompassBridgeMemoForTests()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getCompassLeadSliceByInflowRange — range 페이지네이션(브리지 추가 함수)
// ---------------------------------------------------------------------------
describe("getCompassLeadSliceByInflowRange", () => {
  it("2페이지(가득 찬 1,000행 + 나머지)를 모아 truncated=false를 낸다", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => sliceRow({ id: i + 1 }))
    const page2 = Array.from({ length: 200 }, (_, i) => sliceRow({ id: 1000 + i + 1 }))
    leadsChain = leadsViewChain({
      onRange: (from) => (from === 0 ? { data: page1, error: null } : { data: page2, error: null }),
    })
    fromMock = vi.fn(routeFrom)

    const result = await getCompassLeadSliceByInflowRange(
      "2026-09-01T00:00:00+09:00",
      "2026-09-10T00:00:00.000Z"
    )

    expect(result.down).toBe(false)
    expect(result.truncated).toBe(false)
    expect(result.rows).toHaveLength(1200)
    expect(leadsChain.range).toHaveBeenCalledTimes(2)
    expect(leadsChain.range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(leadsChain.range).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it("maxRows에 정확히 닿으면 truncated=true", async () => {
    leadsChain = leadsViewChain({
      onRange: () => ({ data: Array.from({ length: 1000 }, (_, i) => sliceRow({ id: i + 1 })), error: null }),
    })
    fromMock = vi.fn(routeFrom)

    const result = await getCompassLeadSliceByInflowRange(
      "2026-09-01T00:00:00+09:00",
      "2026-09-10T00:00:00.000Z",
      { maxRows: 2000 }
    )

    expect(result.truncated).toBe(true)
    expect(result.rows).toHaveLength(2000)
    expect(leadsChain.range).toHaveBeenCalledTimes(2)
  })

  it("금액 컬럼(paid_amount·paid_month)을 select 하지 않는다", async () => {
    leadsChain = leadsViewChain({ onRange: () => ({ data: [], error: null }) })
    fromMock = vi.fn(routeFrom)

    await getCompassLeadSliceByInflowRange("2026-09-01T00:00:00+09:00", "2026-09-10T00:00:00.000Z")

    expect(fromMock).toHaveBeenCalledWith("compass_leads_v")
    const selectArg = leadsChain.select.mock.calls[0]?.[0] as string
    expect(selectArg).not.toMatch(/paid_amount/)
    expect(selectArg).not.toMatch(/paid_month/)
    expect(selectArg).toContain("last_inflow_at")
    expect(selectArg).toContain("bd_paid_at")
  })

  it("실패하면 down=true, truncated=false로 강등한다(무음 실패 금지)", async () => {
    leadsChain = leadsViewChain({ onRange: () => ({ data: null, error: new Error("relation does not exist") }) })
    fromMock = vi.fn(routeFrom)

    const result = await getCompassLeadSliceByInflowRange(
      "2026-09-01T00:00:00+09:00",
      "2026-09-10T00:00:00.000Z"
    )

    expect(result.down).toBe(true)
    expect(result.truncated).toBe(false)
    expect(result.rows).toEqual([])
    expect(result.error).toBe("relation does not exist")
  })
})

// ---------------------------------------------------------------------------
// buildCompassSummary — 집계(lib/compass/summary.ts)
// ---------------------------------------------------------------------------
describe("buildCompassSummary", () => {
  it("기간을 KST 기준 오늘-(days-1) 00:00 ~ now로 계산한다", async () => {
    leadsChain = leadsViewChain({ onRange: () => ({ data: [], error: null }) })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.period).toEqual({
      key: "7d",
      since: "2026-09-14T00:00+09:00",
      until: "2026-09-20T04:00:00.000Z",
    })
    expect(summary.generatedAt).toBe("2026-09-20T04:00:00.000Z")
  })

  it("퍼널이 COMPASS_FUNNEL_STAGES 순서로 누적되고 lost는 별도다(단조 비증가)", async () => {
    const rows = [
      sliceRow({ id: 1, stage: "new" }),
      sliceRow({ id: 2, stage: "new" }),
      sliceRow({ id: 3, stage: "contact" }),
      sliceRow({ id: 4, stage: "demo" }),
      sliceRow({ id: 5, stage: "demo" }),
      sliceRow({ id: 6, stage: "won" }),
      sliceRow({ id: 7, stage: "lost" }),
    ]
    leadsChain = leadsViewChain({ onRange: (from) => (from === 0 ? { data: rows, error: null } : { data: [], error: null }) })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.down).toBe(false)
    expect(summary.inflowTotal).toBe(7)
    expect(summary.lost).toBe(1)
    expect(summary.won).toBe(1)
    expect(summary.stages.map((s) => s.key)).toEqual([...COMPASS_FUNNEL_STAGES])
    const counts = summary.stages.map((s) => s.count)
    expect(counts).toEqual([6, 4, 3, 3, 1, 1, 1]) // new/contact/consult/demo/quote/bd/won
    for (let i = 0; i < counts.length - 1; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1])
    }
    // lost가 퍼널에서 완전히 빠졌는지 — 전부 합쳐도 lost 1건만큼 inflowTotal보다 적다.
    expect(counts[0]).toBe(summary.inflowTotal - summary.lost)
  })

  it("byPlatform이 meta/facebook/instagram/fb/ig 계열을 하나로 묶고 나머지는 channel 원문·기타로 나눈다", async () => {
    const rows = [
      sliceRow({ id: 1, platform: "Meta Ads", channel: null }),
      sliceRow({ id: 2, platform: null, channel: "Facebook 캠페인" }),
      sliceRow({ id: 3, platform: null, channel: "블로그" }),
      sliceRow({ id: 4, platform: null, channel: null }),
      sliceRow({ id: 5, platform: "google", channel: "구글 검색" }),
    ]
    leadsChain = leadsViewChain({ onRange: (from) => (from === 0 ? { data: rows, error: null } : { data: [], error: null }) })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.byPlatform[0]).toEqual({ key: "meta", label: "메타", count: 2 })
    expect(summary.metaInflow).toBe(2)
    const totalAcrossGroups = summary.byPlatform.reduce((sum, g) => sum + g.count, 0)
    expect(totalAcrossGroups).toBe(5)
    const byKey = Object.fromEntries(summary.byPlatform.map((g) => [g.key, g.count]))
    expect(byKey["블로그"]).toBe(1)
    expect(byKey["기타"]).toBe(1)
    expect(byKey["구글 검색"]).toBe(1) // platform="google"은 메타 계열이 아니라 channel 원문으로 폴백
    // 내림차순 정렬 확인
    for (let i = 0; i < summary.byPlatform.length - 1; i += 1) {
      expect(summary.byPlatform[i].count).toBeGreaterThanOrEqual(summary.byPlatform[i + 1].count)
    }
  })

  it("byOwner는 caller 우선 → owner → 미배정 순으로 묶고, total 내림차순 상위에서도 미배정은 맨 뒤다", async () => {
    const rows = [
      // 김철수(owner) — total 3, demo 2, bd 1
      sliceRow({ id: 1, owner: "김철수", stage: "contact", demo_at: "2026-09-15T00:00:00Z" }),
      sliceRow({ id: 2, owner: "김철수", stage: "demo", demo_at: "2026-09-16T00:00:00Z" }),
      sliceRow({ id: 3, owner: "김철수", stage: "bd" }),
      // 박영희(caller) — caller가 owner보다 우선. total 2, won 1
      sliceRow({ id: 4, caller: "박영희", owner: "다른사람", stage: "won" }),
      sliceRow({ id: 5, caller: "박영희", owner: null, stage: "new" }),
      // 미배정 — total 5(가장 큼) 이지만 맨 뒤로 가야 한다. lost 2건 포함.
      ...Array.from({ length: 5 }, (_, i) =>
        sliceRow({ id: 10 + i, owner: null, caller: null, stage: i < 2 ? "lost" : "new" })
      ),
    ]
    leadsChain = leadsViewChain({ onRange: (from) => (from === 0 ? { data: rows, error: null } : { data: [], error: null }) })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.byOwner.map((o) => o.owner)).toEqual(["김철수", "박영희", "미배정"])
    expect(summary.byOwner[summary.byOwner.length - 1].owner).toBe("미배정")
    expect(summary.byOwner[0]).toMatchObject({ owner: "김철수", total: 3, demo: 2, bd: 1, won: 0, lost: 0 })
    expect(summary.byOwner[1]).toMatchObject({ owner: "박영희", total: 2, won: 1 })
    expect(summary.byOwner[2]).toMatchObject({ owner: "미배정", total: 5, lost: 2 })
  })

  it("byOwner는 total 상위 COMPASS_SUMMARY_OWNER_LIMIT까지만 담는다", async () => {
    const owners = Array.from({ length: COMPASS_SUMMARY_OWNER_LIMIT + 4 }, (_, i) => `담당${i}`)
    const rows = owners.flatMap((owner, ownerIndex) =>
      // 뒤 담당자일수록 total이 작아 상위 N에서 밀려난다.
      Array.from({ length: owners.length - ownerIndex }, (_, i) => sliceRow({ id: ownerIndex * 100 + i, owner }))
    )
    leadsChain = leadsViewChain({ onRange: (from) => (from === 0 ? { data: rows, error: null } : { data: [], error: null }) })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.byOwner).toHaveLength(COMPASS_SUMMARY_OWNER_LIMIT)
    expect(summary.byOwner[0].owner).toBe("담당0") // total이 가장 큰 담당자
  })

  it("careStages는 COMPASS_CARE_STAGES 5단계를 0건 포함 고정 순서로 낸다", async () => {
    const rows = [sliceRow({ id: 1, care_stage: "member" }), sliceRow({ id: 2, care_stage: "paid" })]
    leadsChain = leadsViewChain({ onRange: (from) => (from === 0 ? { data: rows, error: null } : { data: [], error: null }) })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.careStages.map((c) => c.key)).toEqual([...COMPASS_CARE_STAGES])
    expect(summary.careStages.find((c) => c.key === "member")?.count).toBe(1)
    expect(summary.careStages.find((c) => c.key === "paid")?.count).toBe(1)
    expect(summary.careStages.find((c) => c.key === "leader")?.count).toBe(0)
  })

  it("upcomingActions는 nextActionAt 오름차순으로 상위 COMPASS_SUMMARY_ACTION_LIMIT만 담고, upcomingActionCount는 전체 건수다", async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      upcomingRow({ id: i + 1, next_action_at: `2026-09-20T${String(20 - i).padStart(2, "0")}:00:00.000Z` })
    ) // 역순으로 생성해 정렬이 실제로 일어나는지 검증
    leadsChain = leadsViewChain({ onRange: () => ({ data: [], error: null }), upcoming: { data: rows, error: null } })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.upcomingActionCount).toBe(10)
    expect(summary.upcomingActions).toHaveLength(COMPASS_SUMMARY_ACTION_LIMIT)
    const timestamps = summary.upcomingActions.map((a) => a.nextActionAt)
    expect(timestamps).toEqual([...timestamps].sort())
    expect(summary.upcomingActions[0].url).toBe(compassLeadUrl(summary.upcomingActions[0].compassLeadId))
  })

  describe("down 전파", () => {
    it("슬라이스가 down이면 전체 down=true — 다른 조회가 살아 있어도 숫자를 0으로 낸다", async () => {
      leadsChain = leadsViewChain({
        onRange: () => ({ data: null, error: new Error("slice down") }),
        bdCount: { count: 9, error: null },
      })
      demosChain = demosViewChain({ data: [{ id: 1 }], error: null })
      fromMock = vi.fn(routeFrom)

      const summary = await buildCompassSummary("7d", NOW)

      expect(summary.down).toBe(true)
      expect(summary.error).toBeTruthy()
      expect(summary.inflowTotal).toBe(0)
      expect(summary.bdOpen).toBe(0)
      expect(summary.todayDemoCount).toBe(0)
      expect(summary.byPlatform).toEqual([])
      expect(summary.stages.every((s) => s.count === 0)).toBe(true)
    })

    it("보조 조회(BD인계)만 down이면 down=false, bdOpen=0 + error에 사유", async () => {
      leadsChain = leadsViewChain({
        onRange: (from) => (from === 0 ? { data: [sliceRow({ id: 1 })], error: null } : { data: [], error: null }),
        bdCount: { count: null, error: new Error("bd boom") },
      })
      demosChain = demosViewChain({ data: [], error: null })
      fromMock = vi.fn(routeFrom)

      const summary = await buildCompassSummary("7d", NOW)

      expect(summary.down).toBe(false)
      expect(summary.bdOpen).toBe(0)
      expect(summary.error).toContain("bd")
      expect(summary.inflowTotal).toBe(1) // 슬라이스는 살아 있으니 신뢰한다
    })

    it("보조 조회(오늘 데모)만 down이면 down=false, todayDemoCount=0 + error에 사유", async () => {
      leadsChain = leadsViewChain({ onRange: () => ({ data: [], error: null }) })
      demosChain = demosViewChain({ data: null, error: new Error("demo boom") })
      fromMock = vi.fn(routeFrom)

      const summary = await buildCompassSummary("7d", NOW)

      expect(summary.down).toBe(false)
      expect(summary.todayDemoCount).toBe(0)
      expect(summary.error).toContain("demo")
    })

    it("보조 조회(다음 액션)만 down이면 down=false, upcomingActions=[] + error에 사유", async () => {
      leadsChain = leadsViewChain({
        onRange: () => ({ data: [], error: null }),
        upcoming: { data: null, error: new Error("action boom") },
      })
      demosChain = demosViewChain({ data: [], error: null })
      fromMock = vi.fn(routeFrom)

      const summary = await buildCompassSummary("7d", NOW)

      expect(summary.down).toBe(false)
      expect(summary.upcomingActions).toEqual([])
      expect(summary.upcomingActionCount).toBe(0)
      expect(summary.error).toContain("action")
    })
  })

  it("truncated가 슬라이스에서 그대로 전파된다", async () => {
    // maxRows(5,000)에 정확히 닿도록 페이지마다 1,000행씩 5번 채운다.
    leadsChain = leadsViewChain({
      onRange: () => ({ data: Array.from({ length: 1000 }, (_, i) => sliceRow({ id: i + 1 })), error: null }),
    })
    demosChain = demosViewChain({ data: [], error: null })
    fromMock = vi.fn(routeFrom)

    const summary = await buildCompassSummary("7d", NOW)

    expect(summary.truncated).toBe(true)
    expect(summary.inflowTotal).toBe(5000)
  })
})
