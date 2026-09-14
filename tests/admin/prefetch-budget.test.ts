import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ADMIN_PREFETCH_BUDGET_MS,
  openPrefetchLane,
  settleWithinBudget,
} from "@/lib/admin/prefetch-budget"

/**
 * 프리페치 예산 계약 — 지금까지 이 파일(lib/admin/prefetch-budget.ts)에는 테스트가 없었다
 * (Overview·CRM 홈·장부·하드웨어 4개 page.tsx가 전부 이 함수 하나에 기대는데도). 횡단 인프라
 * 감사에서 이 계약을 손대므로, 기존 동작(settleWithinBudget)을 고정하고 신규 계약
 * (openPrefetchLane)의 "TTFB를 기다리지 않는다"는 핵심 속성을 함께 검증한다.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("settleWithinBudget — 기존 계약(하위호환) 고정", () => {
  it("예산 안에 settle되면 그 값을 그대로 돌려준다", async () => {
    const promise = settleWithinBudget(() => Promise.resolve("fast"), 1_000)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe("fast")
  })

  it("예산을 넘기면 null로 떨어진다 — run()이 나중에 resolve돼도 이미 null이 확정된 뒤다", async () => {
    let resolveSlow: (value: string) => void = () => {}
    const slow = new Promise<string>((resolve) => {
      resolveSlow = resolve
    })

    const promise = settleWithinBudget(() => slow, 1_000)

    await vi.advanceTimersByTimeAsync(1_000)
    await expect(promise).resolves.toBeNull()

    // 예산을 넘긴 뒤에도 run()은 계속 돈다(주석의 "캐시를 데운다") — 여기서 resolve해도
    // 이미 반환된 promise 값에는 영향이 없다는 것만 확인한다(unhandled rejection 방지 겸).
    resolveSlow("late")
  })

  it("run()이 reject해도 null로 떨어진다 — 프리페치 실패가 페이지를 500으로 만들지 않는다", async () => {
    const promise = settleWithinBudget(() => Promise.reject(new Error("boom")), 1_000)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBeNull()
  })

  it("기본 예산은 ADMIN_PREFETCH_BUDGET_MS(1.2초) — 하드웨어·장부·Overview·CRM 홈이 공유하는 값", () => {
    expect(ADMIN_PREFETCH_BUDGET_MS).toBe(1_200)
  })

  it("settle 후 타이머를 정리한다 — 예산 타이머가 이벤트 루프에 남지 않는다", async () => {
    const promise = settleWithinBudget(() => Promise.resolve("v"), 1_000)
    await vi.advanceTimersByTimeAsync(0)
    await promise
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("openPrefetchLane — 신규 스트리밍 계약", () => {
  it("호출 즉시 promise/generatedAt을 돌려준다 — run()이 settle되기를 기다리지 않는다", () => {
    let started = false
    const result = openPrefetchLane(() => {
      started = true
      return new Promise<string>(() => {}) // 절대 resolve되지 않는 run()
    })

    // openPrefetchLane 호출 자체는 동기다 — await 없이 이 지점에서 이미 값이 있어야 한다.
    expect(started).toBe(true)
    expect(typeof result.generatedAt).toBe("number")
    expect(result.promise).toBeInstanceOf(Promise)
  })

  it("run()이 늦게 끝나도(1.2초=구 예산을 한참 넘겨도) 실제 값을 그대로 전달한다", async () => {
    let resolveSlow: (value: string) => void = () => {}
    const slow = new Promise<string>((resolve) => {
      resolveSlow = resolve
    })

    const { promise } = openPrefetchLane(() => slow, 30_000)

    // 구 settleWithinBudget 기본 예산(1.2초)을 넘겨도 아직 안 죽는다 — 상한이 다르다는 것을 고정.
    await vi.advanceTimersByTimeAsync(ADMIN_PREFETCH_BUDGET_MS + 1)
    resolveSlow("late-but-real")
    await vi.advanceTimersByTimeAsync(0)

    await expect(promise).resolves.toBe("late-but-real")
  })

  it("ceilingMs를 넘기면 null로 떨어진다 — 정말 멈춘 쿼리에 대한 안전판", async () => {
    const never = new Promise<string>(() => {})
    const { promise } = openPrefetchLane(() => never, 5_000)

    await vi.advanceTimersByTimeAsync(5_000)
    await expect(promise).resolves.toBeNull()
  })

  it("run()이 reject하면 에러를 로그하고 null로 떨어진다(페이지를 500으로 만들지 않는다)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { promise } = openPrefetchLane(() => Promise.reject(new Error("boom")))

    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith("[admin prefetch lane] source failed", expect.any(Error))
  })

  it("기본 ceiling(15초)보다 짧은 지연은 그대로 값을 전달한다", async () => {
    let resolveIt: (value: number) => void = () => {}
    const eventuallyFast = new Promise<number>((resolve) => {
      resolveIt = resolve
    })
    const { promise } = openPrefetchLane(() => eventuallyFast)

    await vi.advanceTimersByTimeAsync(10_000)
    resolveIt(42)
    await vi.advanceTimersByTimeAsync(0)

    await expect(promise).resolves.toBe(42)
  })

  it("settle 후 ceiling 타이머를 정리한다", async () => {
    const { promise } = openPrefetchLane(() => Promise.resolve("v"), 5_000)
    await vi.advanceTimersByTimeAsync(0)
    await promise
    expect(vi.getTimerCount()).toBe(0)
  })
})
