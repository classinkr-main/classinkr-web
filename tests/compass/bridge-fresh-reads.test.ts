import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 새로고침(?force=1)이 브리지 60초 메모를 뚫는지(runWithFreshCompassReads) + 링크·id 청크를 동시에 읽는지 (2026-11-23).

let fromMock: ReturnType<typeof vi.fn>

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import {
  __resetCompassBridgeMemoForTests,
  getCompassHomeLeadRefs,
  getCompassLeadsByIds,
  getCompassLeadsByPhoneKeys,
  isCompassFreshRequest,
  runWithFreshCompassReads,
} from "@/lib/compass/bridge"

beforeEach(() => {
  __resetCompassBridgeMemoForTests()
})

afterEach(() => {
  vi.clearAllMocks()
})

function phoneChain(rows: unknown[]) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {}
  c.select = vi.fn(() => c)
  c.in = vi.fn(() => Promise.resolve({ data: rows, error: null }))
  return c
}

describe("runWithFreshCompassReads", () => {
  it("fresh 범위 밖은 메모를 쓰고, 안은 끝난 메모를 건너뛰어 새로 읽는다(새 값은 다음 조회가 쓴다)", async () => {
    let stage = "new"
    fromMock = vi.fn(() => phoneChain([{ id: 1, phone_key: "01000000001", stage }]))

    const first = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(first.rows[0]).toMatchObject({ stage: "new" })

    stage = "called" // Compass 에서 단계가 바뀌었다
    const memo = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(memo.rows[0]).toMatchObject({ stage: "new" })
    expect(fromMock).toHaveBeenCalledTimes(1)

    const fresh = await runWithFreshCompassReads(true, () => getCompassLeadsByPhoneKeys(["01000000001"]))
    expect(fresh.rows[0]).toMatchObject({ stage: "called" })
    expect(fromMock).toHaveBeenCalledTimes(2)

    // 새로 읽은 값이 메모에 남아 다음 일반 조회도 새 값을 본다.
    const after = await getCompassLeadsByPhoneKeys(["01000000001"])
    expect(after.rows[0]).toMatchObject({ stage: "called" })
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it("fresh=false 면 그냥 메모를 쓴다", async () => {
    fromMock = vi.fn(() => phoneChain([{ id: 1, phone_key: "01000000001" }]))
    await getCompassLeadsByPhoneKeys(["01000000001"])
    await runWithFreshCompassReads(false, () => getCompassLeadsByPhoneKeys(["01000000001"]))
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it("진행 중인 같은 조회는 fresh 여도 공유한다(연타가 원격 조회를 늘리지 않게)", async () => {
    let resolve!: (value: unknown) => void
    const pending = new Promise((r) => {
      resolve = r
    })
    const c: Record<string, ReturnType<typeof vi.fn>> = {}
    c.select = vi.fn(() => c)
    c.in = vi.fn(() => pending)
    fromMock = vi.fn(() => c)

    const a = getCompassLeadsByPhoneKeys(["01000000001"])
    const b = runWithFreshCompassReads(true, () => getCompassLeadsByPhoneKeys(["01000000001"]))
    resolve({ data: [{ id: 1, phone_key: "01000000001" }], error: null })
    await Promise.all([a, b])
    expect(fromMock).toHaveBeenCalledTimes(1)
  })
})

describe("isCompassFreshRequest", () => {
  it("force=1 · fresh=1 · force=true 만 fresh", () => {
    expect(isCompassFreshRequest(new URL("https://x/api?owner=__me&force=1"))).toBe(true)
    expect(isCompassFreshRequest(new URL("https://x/api?fresh=1"))).toBe(true)
    expect(isCompassFreshRequest(new URL("https://x/api?force=true"))).toBe(true)
    expect(isCompassFreshRequest(new URL("https://x/api?owner=__me"))).toBe(false)
    expect(isCompassFreshRequest(new URL("https://x/api?force=0"))).toBe(false)
  })
})

describe("청크 동시 조회", () => {
  function trackingChain(state: { active: number; peak: number }, rowsFor: (values: unknown[]) => unknown[]) {
    const c: Record<string, ReturnType<typeof vi.fn>> = {}
    c.select = vi.fn(() => c)
    c.eq = vi.fn(() => c)
    c.in = vi.fn(async (_column: string, values: unknown[]) => {
      state.active += 1
      state.peak = Math.max(state.peak, state.active)
      await new Promise((r) => setTimeout(r, 5))
      state.active -= 1
      return { data: rowsFor(values), error: null }
    })
    return c
  }

  it("getCompassHomeLeadRefs — 100개 청크를 최대 4개씩 동시에 읽고 전부 모은다", async () => {
    const state = { active: 0, peak: 0 }
    fromMock = vi.fn(() =>
      trackingChain(state, (values) => (values as string[]).map((id, index) => ({ lead_id: index + 1, external_id: id }))),
    )
    const ids = Array.from({ length: 950 }, (_, index) => `lead-${String(index).padStart(4, "0")}`)
    const result = await getCompassHomeLeadRefs(ids)
    expect(result.down).toBe(false)
    expect(result.rows).toHaveLength(950)
    expect(fromMock).toHaveBeenCalledTimes(10)
    expect(state.peak).toBeGreaterThan(1)
    expect(state.peak).toBeLessThanOrEqual(4)
  })

  it("getCompassLeadsByIds — 한 청크라도 실패하면 down", async () => {
    let call = 0
    fromMock = vi.fn(() => {
      call += 1
      const failing = call === 2
      const c: Record<string, ReturnType<typeof vi.fn>> = {}
      c.select = vi.fn(() => c)
      c.in = vi.fn(() =>
        Promise.resolve(failing ? { data: null, error: { message: "boom" } } : { data: [{ id: 1 }], error: null }),
      )
      return c
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await getCompassLeadsByIds(Array.from({ length: 500 }, (_, index) => index + 1))
    expect(result.down).toBe(true)
    expect(result.error).toBe("boom")
  })
})
