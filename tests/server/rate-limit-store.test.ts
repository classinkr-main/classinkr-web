/**
 * 요청 제한 메모리 저장소(lib/server/rate-limit.ts) — 만료 키 쓸기, 키 수 상한, Upstash 시간 제한.
 * 동작(한도 값·키 꼴·응답)은 그대로이고 저장소가 끝없이 자라지 않는지를 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RATE_LIMIT_MAX_KEYS, checkRateLimit, checkRateLimitDistributed, rateLimitStoreSizeForTest, resetRateLimitStoreForTest } from "@/lib/server/rate-limit"

const opts = { windowMs: 60_000, max: 5 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-25T00:00:00Z"))
  resetRateLimitStoreForTest()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("메모리 저장소 크기", () => {
  it("키 20만 개를 넣어도 상한을 넘지 않고, 창이 지나 다음 호출이 오면 만료 키가 쓸려 나간다", () => {
    for (let i = 0; i < 200_000; i++) checkRateLimit(`ip-${i}`, "flood", opts)
    expect(rateLimitStoreSizeForTest()).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS)

    vi.setSystemTime(new Date("2026-11-25T00:02:00Z")) // 창(60초) 지남
    checkRateLimit("fresh", "flood", opts)
    expect(rateLimitStoreSizeForTest()).toBe(1)
  })

  it("한도 동작은 그대로다 — 허용·차단·창 지난 뒤 다시 허용", () => {
    for (let i = 0; i < 5; i++) expect(checkRateLimit("1.2.3.4", "k", opts)).toMatchObject({ allowed: true, remaining: 4 - i })
    expect(checkRateLimit("1.2.3.4", "k", opts)).toMatchObject({ allowed: false, remaining: 0 })
    vi.setSystemTime(new Date("2026-11-25T00:01:01Z"))
    expect(checkRateLimit("1.2.3.4", "k", opts)).toMatchObject({ allowed: true, remaining: 4 })
  })

  it("쓸기는 10초에 한 번만 전체를 훑고, 살아 있는 키는 지우지 않는다", () => {
    checkRateLimit("a", "k", { windowMs: 5_000, max: 1 })
    checkRateLimit("b", "k", { windowMs: 120_000, max: 1 })
    vi.setSystemTime(new Date("2026-11-25T00:00:30Z"))
    checkRateLimit("c", "k", opts)
    expect(rateLimitStoreSizeForTest()).toBe(2) // a 만료로 사라지고 b·c 만 남는다
    expect(checkRateLimit("b", "k", { windowMs: 120_000, max: 1 }).allowed).toBe(false)
  })
})

describe("분산 저장소 시간 제한", () => {
  it("Upstash 가 0.5초 안에 답하지 않으면 중단하고 메모리로 폴백한다(전에는 1.5초)", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t")
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))))
    )
    const pending = checkRateLimitDistributed("9.9.9.9", "dist", opts)
    await vi.advanceTimersByTimeAsync(499)
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    await expect(pending).resolves.toMatchObject({ allowed: true, remaining: 4 })
  })
})
