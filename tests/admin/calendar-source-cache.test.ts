/**
 * 캘린더 외부 소스 공용 SWR 캐시 — 신선/스테일/콜드 세 경로와 중복 왕복 방지.
 *
 * 이 캐시가 화면 속도의 전부다: 스테일이 즉시 나가야 TTL 만료가 화면 지연으로 새지 않고,
 * 콜드 마감이 있어야 한 소스가 캘린더 8소스를 통째로 잡아두지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nextCache = vi.hoisted(() => ({
  impl: null as null | ((fetcher: unknown, keys: string[], opts: unknown) => unknown),
}))

vi.mock("next/cache", () => ({
  unstable_cache: (fetcher: unknown, keys: string[], opts: unknown) =>
    nextCache.impl ? nextCache.impl(fetcher, keys, opts) : fetcher,
}))

import {
  readSourceCacheStats,
  resetSourceCache,
  sourceIdentityFingerprint,
  swrSource,
  withPersistentSourceCache,
} from "@/lib/admin-calendar/source-cache"

const TTL = 5 * 60_000
const STALE = 6 * 60 * 60_000
const TIMEOUT = 3_500

function options<T>(overrides: {
  key: string
  fallback: T
  fetcher: () => Promise<T>
  label?: string
  ttlMs?: number
  staleMs?: number
  timeoutMs?: number
  registerBackground?: (promise: Promise<unknown>) => void
}) {
  return {
    ttlMs: TTL,
    staleMs: STALE,
    timeoutMs: TIMEOUT,
    ...overrides,
  }
}

/** ms 뒤에 값을 주는 원천 — 가짜 타이머로 마감/지연을 실제처럼 재현한다 */
function slow<T>(value: T, delayMs: number) {
  return () =>
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(value), delayMs)
    })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  resetSourceCache()
  nextCache.impl = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe("swrSource — 신선", () => {
  it("TTL 안에서는 원천을 다시 부르지 않는다", async () => {
    const fetcher = vi.fn(async () => ["a"])

    const first = await swrSource(options({ key: "s:1", fallback: [] as string[], fetcher }))
    await vi.advanceTimersByTimeAsync(TTL - 1)
    const second = await swrSource(options({ key: "s:1", fallback: [] as string[], fetcher }))

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(first.data).toEqual(["a"])
    expect(first.ageMs).toBe(0)
    expect(second.data).toEqual(["a"])
    expect(second.ageMs).toBe(TTL - 1)
    expect(second.degraded).toBe(false)
  })
})

describe("swrSource — 스테일", () => {
  it("TTL이 지나면 기다리지 않고 스테일을 주고, 갱신은 뒤에서 한 번 돈다", async () => {
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockImplementationOnce(async () => ["old"])
      .mockImplementationOnce(slow(["new"], 2_000))

    await swrSource(options({ key: "s:2", fallback: [] as string[], fetcher }))
    await vi.advanceTimersByTimeAsync(TTL + 1)

    // 갱신이 2초 걸려도 이 호출은 기다리지 않는다
    const stale = await swrSource(options({ key: "s:2", fallback: [] as string[], fetcher }))
    expect(stale.data).toEqual(["old"])
    expect(stale.ageMs).toBe(TTL + 1)
    expect(fetcher).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2_000)
    const refreshed = await swrSource(options({ key: "s:2", fallback: [] as string[], fetcher }))
    expect(refreshed.data).toEqual(["new"])
    expect(refreshed.ageMs).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("백그라운드 갱신이 실패해도 스테일은 살아남고 degraded만 올라간다", async () => {
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockImplementationOnce(async () => ["old"])
      .mockImplementation(async () => {
        throw new Error("원천 장애")
      })

    await swrSource(options({ key: "s:3", label: "s3", fallback: [] as string[], fetcher }))
    await vi.advanceTimersByTimeAsync(TTL + 1)
    await swrSource(options({ key: "s:3", label: "s3", fallback: [] as string[], fetcher }))
    await vi.advanceTimersByTimeAsync(0)

    const afterFailure = await swrSource(
      options({ key: "s:3", label: "s3", fallback: [] as string[], fetcher })
    )
    expect(afterFailure.data).toEqual(["old"])
    expect(afterFailure.degraded).toBe(true)
    expect(readSourceCacheStats("s3")?.degraded).toBe(true)
  })

  it("스테일 창(staleMs)을 넘기면 콜드로 취급한다", async () => {
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockImplementationOnce(async () => ["old"])
      .mockImplementation(async () => {
        throw new Error("원천 장애")
      })

    await swrSource(options({ key: "s:4", fallback: [] as string[], fetcher }))
    await vi.advanceTimersByTimeAsync(STALE + 1)

    const result = await swrSource(options({ key: "s:4", fallback: [] as string[], fetcher }))
    expect(result.data).toEqual([])
    expect(result.degraded).toBe(true)
  })
})

describe("swrSource — 콜드", () => {
  it("마감을 넘기면 빈 값 + degraded로 접고, 늦게 끝난 원천은 다음 요청이 받는다", async () => {
    const fetcher = vi.fn(slow(["late"], 5_000))

    const pending = swrSource(
      options({ key: "s:5", label: "s5", fallback: [] as string[], fetcher })
    )
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    const timedOut = await pending

    expect(timedOut.data).toEqual([])
    expect(timedOut.degraded).toBe(true)
    expect(readSourceCacheStats("s5")?.degraded).toBe(true)

    // 원천은 취소하지 않는다 — 늦게 끝나면 캐시에 앉는다
    await vi.advanceTimersByTimeAsync(1_500)
    const next = await swrSource(
      options({ key: "s:5", label: "s5", fallback: [] as string[], fetcher })
    )
    expect(next.data).toEqual(["late"])
    expect(next.degraded).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("동시에 들어온 콜드 호출은 원천을 한 번만 부른다", async () => {
    const fetcher = vi.fn(slow(["once"], 1_000))

    const both = Promise.all([
      swrSource(options({ key: "s:6", fallback: [] as string[], fetcher })),
      swrSource(options({ key: "s:6", fallback: [] as string[], fetcher })),
    ])
    await vi.advanceTimersByTimeAsync(1_000)
    const [a, b] = await both

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a.data).toEqual(["once"])
    expect(b.data).toEqual(["once"])
  })

  it("실패를 캐시에 굳히지 않는다 — 다음 요청이 다시 시도한다", async () => {
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockImplementationOnce(async () => {
        throw new Error("일시 장애")
      })
      .mockImplementationOnce(async () => ["recovered"])

    const failed = await swrSource(options({ key: "s:7", fallback: [] as string[], fetcher }))
    expect(failed.data).toEqual([])
    expect(failed.degraded).toBe(true)

    const recovered = await swrSource(options({ key: "s:7", fallback: [] as string[], fetcher }))
    expect(recovered.data).toEqual(["recovered"])
    expect(recovered.degraded).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

// 서버리스에서는 응답을 보내는 순간 인스턴스가 얼어붙을 수 있다. "레이스에서 진 원천을
// 취소하지 않는다"는 규약이 참이 되려면, 그 약속을 런타임(after())에 한 번 맡겨야 한다.
// 맡기지 않으면 늦은 승자도 백그라운드 갱신도 완료되지 못해 다음 요청이 계속 콜드 미스가 된다.
describe("swrSource — 백그라운드 완주 등록", () => {
  it("콜드 레이스에서 진 원천을 백그라운드 작업으로 넘긴다", async () => {
    const registered: Promise<unknown>[] = []
    const registerBackground = (promise: Promise<unknown>) => {
      registered.push(promise)
    }
    const fetcher = vi.fn(slow(["late"], 5_000))

    const pending = swrSource(
      options({ key: "bg:1", fallback: [] as string[], fetcher, registerBackground })
    )
    await vi.advanceTimersByTimeAsync(TIMEOUT)
    const timedOut = await pending

    expect(timedOut.data).toEqual([])
    expect(timedOut.degraded).toBe(true)
    // 응답은 마감에서 접혔지만 원천은 런타임에 위탁돼 계속 달린다
    expect(registered).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1_500)
    await expect(registered[0]).resolves.toEqual(["late"])

    const next = await swrSource(
      options({ key: "bg:1", fallback: [] as string[], fetcher, registerBackground })
    )
    expect(next.data).toEqual(["late"])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("스테일 백그라운드 갱신도 같은 통로로 넘긴다", async () => {
    const registered: Promise<unknown>[] = []
    const registerBackground = (promise: Promise<unknown>) => {
      registered.push(promise)
    }
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockImplementationOnce(async () => ["old"])
      .mockImplementationOnce(slow(["new"], 2_000))

    await swrSource(options({ key: "bg:2", fallback: [] as string[], fetcher, registerBackground }))
    expect(registered).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(TTL + 1)
    await swrSource(options({ key: "bg:2", fallback: [] as string[], fetcher, registerBackground }))

    expect(registered).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(registered[1]).resolves.toEqual(["new"])
  })

  it("등록 실패(요청 컨텍스트 밖 등)가 갱신 자체를 막지 않는다", async () => {
    const registerBackground = () => {
      throw new Error("after() was called outside a request scope")
    }
    const fetcher = vi.fn(async () => ["ok"])

    const result = await swrSource(
      options({ key: "bg:3", fallback: [] as string[], fetcher, registerBackground })
    )
    expect(result.data).toEqual(["ok"])
  })
})

// MAX_ENTRIES=200은 "만료 항목을 걷어낸다"만으로는 상한이 되지 못한다 — 스테일 창(6시간) 안에
// 201개 키를 만들면 만료로 지울 게 하나도 없어서 그대로 계속 자란다.
describe("swrSource — 엔트리 상한", () => {
  it("스테일 창 안이라 만료로 못 걷어내도 오래된 것부터 강제 축출한다", async () => {
    const calls = new Map<string, number>()
    const fetcherFor = (key: string) => async () => {
      calls.set(key, (calls.get(key) ?? 0) + 1)
      return [key]
    }

    // 6시간 스테일 창 안에서 260개 키 — 만료 기준으로는 단 하나도 지울 수 없다
    for (let i = 0; i < 260; i++) {
      const key = `lru:${i}`
      await swrSource(options({ key, fallback: [] as string[], fetcher: fetcherFor(key) }))
      await vi.advanceTimersByTimeAsync(1)
    }

    // 가장 오래된 키는 밀려났다 — 다시 부르면 원천을 새로 탄다
    await swrSource(options({ key: "lru:0", fallback: [] as string[], fetcher: fetcherFor("lru:0") }))
    expect(calls.get("lru:0")).toBe(2)

    // 최근 키는 그대로 살아 있다(무차별 비우기가 아니라 오래된 순 축출)
    await swrSource(
      options({ key: "lru:259", fallback: [] as string[], fetcher: fetcherFor("lru:259") })
    )
    expect(calls.get("lru:259")).toBe(1)
  })
})

describe("sourceIdentityFingerprint", () => {
  it("원천이 다르면 키가 다르다 — DB·ICS를 바꾸면 옛 캐시를 재사용하지 않는다", () => {
    expect(sourceIdentityFingerprint("db-a")).not.toBe(sourceIdentityFingerprint("db-b"))
    expect(sourceIdentityFingerprint("db-a")).toBe(sourceIdentityFingerprint("db-a"))
  })

  it("비밀 원문을 키에 싣지 않는다 — 지문만 남는다", () => {
    const secret = "https://calendar.google.com/ical/private-abcdef123456/basic.ics"
    const fingerprint = sourceIdentityFingerprint(secret)
    expect(fingerprint).toHaveLength(12)
    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/)
    expect(secret).not.toContain(fingerprint)
  })

  it("미설정은 unset 하나로 눕힌다", () => {
    expect(sourceIdentityFingerprint(undefined)).toBe("unset")
    expect(sourceIdentityFingerprint("   ")).toBe("unset")
  })
})

describe("withPersistentSourceCache", () => {
  it("Next 런타임 밖(incrementalCache 부재)에서는 원본 함수로 물러난다", async () => {
    nextCache.impl = () => async () => {
      throw new Error(
        "Invariant: incrementalCache missing in unstable_cache async () => { return [] }"
      )
    }
    const raw = vi.fn(async (year: number) => [`y${year}`])
    const cached = withPersistentSourceCache(raw, ["test-key"], 300)

    await expect(cached(2026)).resolves.toEqual(["y2026"])
    expect(raw).toHaveBeenCalledWith(2026)
  })

  it("그 밖의 오류는 삼키지 않는다", async () => {
    nextCache.impl = () => async () => {
      throw new Error("원천 장애")
    }
    const raw = vi.fn(async () => ["never"])
    const cached = withPersistentSourceCache(raw, ["test-key"], 300)

    await expect(cached()).rejects.toThrow("원천 장애")
    expect(raw).not.toHaveBeenCalled()
  })
})
