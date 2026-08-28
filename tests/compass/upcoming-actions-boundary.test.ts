import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// M7 — CRM 홈 "마케팅 파이프라인(Compass)" 밴드의 "다음 액션 임박" 경계 테스트.
// getCompassUpcomingActions(withinHours)는 now~+withinHours 사이 next_action_at 행만 센다.
// 여기서는 실제 DB 대신 supabase 체인을 가짜로 세워 gte/lte에 전달되는 경계값 자체를 검증한다.

// getCompassUpcomingActions 체인: select→gte→lte→order→limit(terminal).
// getCompassBdOpenCount 체인: select→eq→is(terminal). 두 체인이 order/limit vs is에서
// 갈리므로 기본은 전부 self-chainable로 두고, 각 테스트가 실제 종단 메서드만 Promise로 덮어쓴다.
function createChain(result: { data?: unknown; error: unknown; count?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.select = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve(result))
  return chain
}

let chain: ReturnType<typeof createChain>
let fromMock: ReturnType<typeof vi.fn>

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

describe("getCompassUpcomingActions — 임박 경계", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-28T03:00:00.000Z"))
    chain = createChain({ data: [], error: null })
    fromMock = vi.fn(() => chain)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("gte=now, lte=now+withinHours를 정확한 ISO로 건다(48h)", async () => {
    const { getCompassUpcomingActions } = await import("@/lib/compass/bridge")
    await getCompassUpcomingActions(48)

    expect(fromMock).toHaveBeenCalledWith("compass_leads_v")
    expect(chain.gte).toHaveBeenCalledWith("next_action_at", "2026-08-28T03:00:00.000Z")
    // 48시간 = 2일 뒤 같은 시각. 24h/48분 등 단위 착오가 있으면 여기서 깨진다.
    expect(chain.lte).toHaveBeenCalledWith("next_action_at", "2026-08-30T03:00:00.000Z")
  })

  it("withinHours가 다르면 상한 경계만 늘어난다(gte는 항상 now)", async () => {
    const { getCompassUpcomingActions } = await import("@/lib/compass/bridge")
    await getCompassUpcomingActions(1)

    expect(chain.gte).toHaveBeenCalledWith("next_action_at", "2026-08-28T03:00:00.000Z")
    expect(chain.lte).toHaveBeenCalledWith("next_action_at", "2026-08-28T04:00:00.000Z")
  })

  it("withinHours=0이면 gte===lte — 지금 이 순간 하나뿐인 경계도 오류 없이 처리한다", async () => {
    const { getCompassUpcomingActions } = await import("@/lib/compass/bridge")
    await getCompassUpcomingActions(0)

    const gteArg = chain.gte.mock.calls[0]?.[1]
    const lteArg = chain.lte.mock.calls[0]?.[1]
    expect(gteArg).toBe(lteArg)
  })

  it("성공 시 rows를 그대로 담고 down은 false다", async () => {
    chain.limit = vi.fn(() =>
      Promise.resolve({
        data: [{ id: 1, next_action_at: "2026-08-29T00:00:00.000Z", stage: "quote" }],
        error: null,
      })
    )
    const { getCompassUpcomingActions } = await import("@/lib/compass/bridge")
    const result = await getCompassUpcomingActions(48)
    expect(result.down).toBe(false)
    expect(result.rows).toHaveLength(1)
  })

  it("supabase가 에러를 돌려주면 down=true, rows=[]로 강등한다(무음 실패 금지)", async () => {
    // 실제 supabase-js PostgrestError는 Error를 상속한다(downResult의 instanceof Error 분기가
    // 이걸 전제로 message를 꺼낸다) — 평범한 객체 리터럴을 쓰면 대신 "[object Object]"가 나와
    // 브리지 코드가 아니라 목이 틀린 것이 된다.
    chain.limit = vi.fn(() => Promise.resolve({ data: null, error: new Error("relation does not exist") }))
    const { getCompassUpcomingActions } = await import("@/lib/compass/bridge")
    const result = await getCompassUpcomingActions(48)
    expect(result.down).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toBe("relation does not exist")
  })

  it("쿼리가 던져도(throw) down=true로 흡수한다", async () => {
    fromMock = vi.fn(() => {
      throw new Error("network down")
    })
    const { getCompassUpcomingActions } = await import("@/lib/compass/bridge")
    const result = await getCompassUpcomingActions(48)
    expect(result.down).toBe(true)
  })
})

describe("getCompassBdOpenCount", () => {
  beforeEach(() => {
    chain = createChain({ data: [], error: null })
    fromMock = vi.fn(() => chain)
  })

  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("stage='bd' AND bd_paid_at IS NULL로 head count를 건다", async () => {
    // count는 select()의 두 번째 인자로 전달되고, .eq/.is 체인 끝에서 값이 나온다.
    chain.is = vi.fn(() => Promise.resolve({ count: 7, error: null }))
    const { getCompassBdOpenCount } = await import("@/lib/compass/bridge")
    const result = await getCompassBdOpenCount()

    expect(fromMock).toHaveBeenCalledWith("compass_leads_v")
    expect(chain.select).toHaveBeenCalledWith("id", { head: true, count: "exact" })
    expect(chain.eq).toHaveBeenCalledWith("stage", "bd")
    expect(chain.is).toHaveBeenCalledWith("bd_paid_at", null)
    expect(result).toEqual({ count: 7, down: false })
  })

  it("count가 null이면 0으로 폴백한다", async () => {
    chain.is = vi.fn(() => Promise.resolve({ count: null, error: null }))
    const { getCompassBdOpenCount } = await import("@/lib/compass/bridge")
    const result = await getCompassBdOpenCount()
    expect(result).toEqual({ count: 0, down: false })
  })

  it("에러면 down=true, count=0으로 강등한다", async () => {
    chain.is = vi.fn(() => Promise.resolve({ count: null, error: new Error("boom") }))
    const { getCompassBdOpenCount } = await import("@/lib/compass/bridge")
    const result = await getCompassBdOpenCount()
    expect(result.down).toBe(true)
    expect(result.count).toBe(0)
    expect(result.error).toBe("boom")
  })
})
