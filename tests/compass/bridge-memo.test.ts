import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Compass 브리지(lib/compass/bridge.ts)의 짧은 서버 메모이제이션 레이어 전용 테스트.
//
// 실제 쿼리 인자(gte/lte 경계, 컬럼명 등)는 tests/compass/upcoming-actions-boundary.test.ts가
// 이미 덮는다 — 여기서는 오직 캐시 레이어의 동작만 본다: 반복 호출을 원격 조회 1회로 접는지,
// 키가 인자 순서에 무관한지, down/에러 결과가 짧은 TTL로 빨리 복구를 반영하는지, 진짜 예외는
// 캐시하지 않는지, 진행 중 호출이 promise를 공유하는지, 캐시 원본이 호출부 mutate로부터
// 격리되는지.
//
// tests/compass/*의 다른 파일들은 브리지 모듈 자체를 vi.mock해 소비자 로직만 보는 반면, 이
// 파일은 upcoming-actions-boundary.test.ts와 같은 층위 — @/lib/supabase/admin만 목으로 세워
// 브리지의 실제 구현(=메모이제이션 포함)을 그대로 통과시킨다.

let chain: Record<string, ReturnType<typeof vi.fn>>
let fromMock: ReturnType<typeof vi.fn>

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import {
  __resetCompassBridgeMemoForTests,
  getCompassBdOpenCount,
  getCompassLeadsByPhoneKeys,
  isCompassBridgeDown,
  type CompassLeadRow,
} from "@/lib/compass/bridge"

// 구현 내부 TTL 상수(lib/compass/bridge.ts, export되지 않음)를 그대로 미러링한다 — 값이
// 바뀌면 이 테스트가 계약 문서(플레이북 프롬프트)와의 불일치를 잡아낸다.
const TTL_MS = 60_000
const TTL_DOWN_MS = 10_000
const TTL_BRIDGE_STATUS_MS = 15_000
const TTL_BRIDGE_STATUS_DOWN_MS = 10_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"))
  __resetCompassBridgeMemoForTests()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function leadsChain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {}
  c.select = vi.fn(() => c)
  c.in = vi.fn(() => Promise.resolve(result))
  return c
}

describe("getCompassLeadsByPhoneKeys — 메모이제이션", () => {
  beforeEach(() => {
    chain = leadsChain({ data: [{ id: 1, phone_key: "01000000001" }], error: null })
    fromMock = vi.fn(() => chain)
  })

  it("(a) 같은 키로 2회 호출하면 원격 조회는 1회다", async () => {
    await getCompassLeadsByPhoneKeys(["01000000001"])
    await getCompassLeadsByPhoneKeys(["01000000001"])

    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(chain.in).toHaveBeenCalledTimes(1)
  })

  it("(b) 키 순서가 달라도 같은 캐시를 탄다", async () => {
    await getCompassLeadsByPhoneKeys(["a", "b"])
    await getCompassLeadsByPhoneKeys(["b", "a"])

    expect(chain.in).toHaveBeenCalledTimes(1)
    // 정렬 후 조인한 문자열이 키다 — 실제 쿼리 인자도 정렬된 배열로 나간다.
    expect(chain.in).toHaveBeenCalledWith("phone_key", ["a", "b"])
  })

  it("(c) 다른 키 집합은 별도로 조회한다", async () => {
    await getCompassLeadsByPhoneKeys(["01000000001"])
    await getCompassLeadsByPhoneKeys(["01000000009"])

    expect(chain.in).toHaveBeenCalledTimes(2)
  })

  it("(d) down 결과는 10초 동안 캐시되고, 그 후에는 재조회한다", async () => {
    fromMock.mockImplementation(() => leadsChain({ data: null, error: new Error("relation missing") }))

    const first = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(first.down).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(TTL_DOWN_MS - 1_000)
    const second = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(second.down).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(1) // 아직 10초 안 — 캐시 재사용

    await vi.advanceTimersByTimeAsync(2_000) // 누적 TTL_DOWN_MS+1000 — 만료
    const third = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(third.down).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it("정상 결과는 60초 동안 캐시되고, 그 후에는 재조회한다", async () => {
    await getCompassLeadsByPhoneKeys(["01000000001"])
    await vi.advanceTimersByTimeAsync(TTL_MS - 1_000)
    await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(fromMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_000)
    await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it("(e) 예외(throw)는 캐시하지 않는다 — 바로 다음 호출이 새로 시도한다", async () => {
    fromMock.mockImplementationOnce(() => {
      throw new Error("client init failed")
    })

    const first = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(first.down).toBe(true) // "절대 throw 안 함" 계약은 유지 — 호출부는 down으로만 본다
    expect(fromMock).toHaveBeenCalledTimes(1)

    // 예외가 캐시됐다면 두 번째 호출도 즉시 down=true를 재사용하며 fromMock을 다시 안 불렀을
    // 것 — 실제로는 "캐시 안 함" 규칙 덕에 새로 시도해서(기본 구현으로 폴백) 정상 값을 받는다.
    const second = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(second.down).toBe(false)
    expect(second.rows).toHaveLength(1)
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it("(f) 진행 중인 호출은 promise를 공유한다 — 동시 호출은 원격 조회 1회", async () => {
    let resolveQuery!: (value: { data: unknown; error: null }) => void
    chain.in = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve
        })
    )

    const p1 = getCompassLeadsByPhoneKeys(["01000000001"])
    const p2 = getCompassLeadsByPhoneKeys(["01000000001"])

    // 둘 다 아직 아무것도 resolve하지 않았는데 원격 조회는 이미 1회만 나갔다 — 두 호출이
    // 같은 진행 중 promise를 공유한다는 뜻(두 번째 호출은 fn을 다시 부르지 않았다).
    expect(chain.in).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenCalledTimes(1)

    resolveQuery({ data: [{ id: 1, phone_key: "01000000001" }], error: null })
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1.rows).toHaveLength(1)
    expect(r2.rows).toHaveLength(1)
    expect(r1.rows).not.toBe(r2.rows) // 같은 promise를 공유해도 호출부마다 독립된 복사본
  })

  it("(g) 반환된 rows를 mutate해도 다음 호출 결과는 오염되지 않는다", async () => {
    const first = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(first.rows).toHaveLength(1)

    first.rows.push({ id: 999 } as unknown as CompassLeadRow) // 배열 mutate
    first.down = true // 최상위 필드 재할당도 오염 시도

    const second = await getCompassLeadsByPhoneKeys(["01000000001"]) // 캐시 히트
    expect(second.rows).toHaveLength(1) // push가 캐시 원본에 반영되지 않았다
    expect(second.down).toBe(false) // 필드 재할당도 반영되지 않았다
    expect(second.rows).not.toBe(first.rows)
  })
})

function countChain(result: { count?: number | null; error?: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {}
  c.select = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.is = vi.fn(() => Promise.resolve(result))
  return c
}

describe("getCompassBdOpenCount — 메모이제이션", () => {
  beforeEach(() => {
    fromMock = vi.fn(() => countChain({ count: 3, error: null }))
  })

  it("인자 없는 호출도 캐시를 타고, down 결과는 10초로 짧게 캐시된다", async () => {
    const first = await getCompassBdOpenCount()
    const second = await getCompassBdOpenCount()
    expect(first).toEqual({ count: 3, down: false })
    expect(second).toEqual({ count: 3, down: false })
    expect(fromMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(TTL_MS + 1_000) // 정상 TTL 만료
    fromMock.mockImplementation(() => countChain({ count: null, error: new Error("boom") }))
    const third = await getCompassBdOpenCount()
    expect(third.down).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(TTL_DOWN_MS - 1_000)
    const fourth = await getCompassBdOpenCount()
    expect(fourth.down).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(2) // 아직 down TTL(10초) 안 — 캐시 재사용

    await vi.advanceTimersByTimeAsync(2_000) // down TTL 만료
    fromMock.mockImplementation(() => countChain({ count: 5, error: null }))
    const fifth = await getCompassBdOpenCount()
    expect(fifth).toEqual({ count: 5, down: false })
    expect(fromMock).toHaveBeenCalledTimes(3)
  })

  it("반환 객체를 mutate해도 다음 호출 결과는 오염되지 않는다", async () => {
    const first = await getCompassBdOpenCount()
    first.count = 999
    const second = await getCompassBdOpenCount()
    expect(second.count).toBe(3)
  })
})

describe("isCompassBridgeDown — 메모이제이션", () => {
  it("정상은 15초, 끊김(true)이면 10초로 캐시된다", async () => {
    fromMock = vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ error: null })) }))

    const up1 = await isCompassBridgeDown()
    const up2 = await isCompassBridgeDown()
    expect(up1).toBe(false)
    expect(up2).toBe(false)
    expect(fromMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(TTL_BRIDGE_STATUS_MS + 1_000) // 정상 TTL(15초) 만료
    fromMock.mockImplementation(() => ({
      select: vi.fn(() => Promise.resolve({ error: new Error("down") })),
    }))
    const down1 = await isCompassBridgeDown()
    expect(down1).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(TTL_BRIDGE_STATUS_DOWN_MS - 1_000)
    const down2 = await isCompassBridgeDown()
    expect(down2).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(2) // 아직 down TTL(10초) 안 — 캐시 재사용

    await vi.advanceTimersByTimeAsync(2_000) // down TTL 만료
    const down3 = await isCompassBridgeDown()
    expect(down3).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(3)
  })

  it("쿼리가 던져도(throw) 다운으로 흡수하고, 그 예외는 캐시하지 않는다", async () => {
    fromMock = vi.fn(() => {
      throw new Error("network down")
    })
    const first = await isCompassBridgeDown()
    expect(first).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(1)

    fromMock.mockImplementation(() => ({ select: vi.fn(() => Promise.resolve({ error: null })) }))
    const second = await isCompassBridgeDown()
    expect(second).toBe(false)
    expect(fromMock).toHaveBeenCalledTimes(2)
  })
})
