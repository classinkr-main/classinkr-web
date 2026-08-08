// billing validate 엔드포인트(promo-code/validate, quote-code/validate)와 checkout
// prepare/confirm/fail 라우트가 전부 의존하는 IP 기준 rate limit 창 동작 회귀.
// checkRateLimitDistributed 는 Upstash 미설정 시 이 동기 in-memory 구현으로 폴백하므로,
// 테스트 환경(env 미설정)에서 실제로 적용되는 것은 이 창 로직 자체다.
import { afterEach, describe, expect, it, vi } from "vitest"

import { checkRateLimit } from "@/lib/server/rate-limit"

describe("checkRateLimit (in-memory IP window limiter)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows up to `max` requests within the window and blocks the next one", () => {
    const key = "billing-test-window-basic"
    const ip = "203.0.113.10"

    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit(ip, key, { windowMs: 60_000, max: 5 }).allowed).toBe(true)
    }

    const blocked = checkRateLimit(ip, key, { windowMs: 60_000, max: 5 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it("tracks separate buckets per IP for the same rate-limit key", () => {
    const key = "billing-test-window-per-ip"

    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit("198.51.100.1", key, { windowMs: 60_000, max: 3 }).allowed).toBe(true)
    }
    expect(checkRateLimit("198.51.100.1", key, { windowMs: 60_000, max: 3 }).allowed).toBe(false)

    // 다른 IP는 별도 버킷이라 앞선 IP의 소진에 영향받지 않는다.
    expect(checkRateLimit("198.51.100.2", key, { windowMs: 60_000, max: 3 }).allowed).toBe(true)
  })

  it("tracks separate buckets per rate-limit key for the same IP", () => {
    const ip = "203.0.113.99"

    for (let i = 0; i < 2; i += 1) {
      expect(
        checkRateLimit(ip, "billing-test-window-key-a", { windowMs: 60_000, max: 2 }).allowed
      ).toBe(true)
    }
    expect(
      checkRateLimit(ip, "billing-test-window-key-a", { windowMs: 60_000, max: 2 }).allowed
    ).toBe(false)

    // 같은 IP라도 다른 key(예: 코드값 기준 제한)는 독립적으로 소진된다.
    expect(
      checkRateLimit(ip, "billing-test-window-key-b", { windowMs: 60_000, max: 2 }).allowed
    ).toBe(true)
  })

  it("resets the window after it elapses", () => {
    const key = "billing-test-window-reset"
    const ip = "203.0.113.20"

    vi.useFakeTimers()
    const start = new Date("2026-01-01T00:00:00.000Z")
    vi.setSystemTime(start)

    expect(checkRateLimit(ip, key, { windowMs: 1_000, max: 1 }).allowed).toBe(true)
    expect(checkRateLimit(ip, key, { windowMs: 1_000, max: 1 }).allowed).toBe(false)

    vi.setSystemTime(new Date(start.getTime() + 1_001))
    expect(checkRateLimit(ip, key, { windowMs: 1_000, max: 1 }).allowed).toBe(true)
  })

  it("decrements `remaining` on each allowed request", () => {
    const key = "billing-test-window-remaining"
    const ip = "203.0.113.30"

    const first = checkRateLimit(ip, key, { windowMs: 60_000, max: 3 })
    const second = checkRateLimit(ip, key, { windowMs: 60_000, max: 3 })
    const third = checkRateLimit(ip, key, { windowMs: 60_000, max: 3 })

    expect(first.remaining).toBe(2)
    expect(second.remaining).toBe(1)
    expect(third.remaining).toBe(0)
  })
})
