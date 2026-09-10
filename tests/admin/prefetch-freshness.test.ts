import { describe, expect, it } from "vitest"

import { ADMIN_PREFETCH_FRESH_MS, isPrefetchFresh } from "@/lib/admin/prefetch-freshness"

// isPrefetchFresh는 재사용된 RSC 프리페치(initialData)가 아직 "마운트 페치를 건너뛰어도
// 될 만큼" 신선한지 판정하는 단일 진실원이다(T3). staleTimes.dynamic(180초, next.config.ts)과
// 헷갈리지 않도록 경계값을 여기서 고정한다 — 180초는 라우터 캐시가 payload를 얼마나 오래
// 들고 있는가고, ADMIN_PREFETCH_FRESH_MS(10초)는 그 payload를 신선하다고 믿는 상한이다.
describe("isPrefetchFresh", () => {
  const NOW = 1_800_000_000_000

  it("경계값(정확히 ADMIN_PREFETCH_FRESH_MS 전)은 신선하다로 판정한다", () => {
    expect(isPrefetchFresh(NOW - ADMIN_PREFETCH_FRESH_MS, NOW)).toBe(true)
  })

  it("경계값을 1ms 넘기면 신선하지 않다", () => {
    expect(isPrefetchFresh(NOW - ADMIN_PREFETCH_FRESH_MS - 1, NOW)).toBe(false)
  })

  it("방금 생성된 값(now와 동일)은 신선하다", () => {
    expect(isPrefetchFresh(NOW, NOW)).toBe(true)
  })

  it("한참 오래된 값(180초 전 — staleTimes.dynamic 상한)은 신선하지 않다", () => {
    expect(isPrefetchFresh(NOW - 180_000, NOW)).toBe(false)
  })

  it("generatedAt이 없으면(undefined/null) 항상 신선하지 않다 — EMPTY 폴백과 동일 취급", () => {
    expect(isPrefetchFresh(undefined, NOW)).toBe(false)
    expect(isPrefetchFresh(null, NOW)).toBe(false)
  })

  it("generatedAt이 0(EMPTY_INITIAL_DATA의 폴백 값)이면 신선하지 않다", () => {
    expect(isPrefetchFresh(0, NOW)).toBe(false)
  })

  it("generatedAt이 유한수가 아니면(NaN/Infinity) 신선하지 않다", () => {
    expect(isPrefetchFresh(Number.NaN, NOW)).toBe(false)
    expect(isPrefetchFresh(Number.POSITIVE_INFINITY, NOW)).toBe(false)
  })

  it("미래 시각(시계 오차 등)도 신선하다로 판정한다 — now - generatedAt이 음수라 상한 이하", () => {
    expect(isPrefetchFresh(NOW + 5_000, NOW)).toBe(true)
  })

  it("now를 생략하면 실제 Date.now() 기준으로 판정한다", () => {
    expect(isPrefetchFresh(Date.now())).toBe(true)
    expect(isPrefetchFresh(Date.now() - 60_000)).toBe(false)
  })
})
