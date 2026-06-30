import { describe, expect, it } from "vitest"

import { projectMonthEnd, kstMonthProgressRatio } from "@/lib/crm/forecast"

describe("projectMonthEnd", () => {
  it("월 진행률 50%에서 실적을 두 배로 외삽", () => {
    const p = projectMonthEnd(500_000, 1_000_000, 0.5)
    expect(p.projected).toBe(1_000_000)
    expect(p.attainmentPct).toBe(50)
    expect(p.projectedPct).toBe(100)
  })

  it("목표가 없으면 달성률·추정달성률은 null(추정 실적은 계산)", () => {
    const p = projectMonthEnd(500_000, null, 0.5)
    expect(p.projected).toBe(1_000_000)
    expect(p.attainmentPct).toBeNull()
    expect(p.projectedPct).toBeNull()
  })

  it("목표 0도 null 취급(0 나눗셈 방지)", () => {
    const p = projectMonthEnd(100, 0, 0.5)
    expect(p.attainmentPct).toBeNull()
    expect(p.projectedPct).toBeNull()
  })

  it("진행률 하한 클램프(0.05) — 월초 과대 외삽 방지", () => {
    const p = projectMonthEnd(100, 1_000, 0.01)
    expect(p.projected).toBe(2_000) // 100 / 0.05
    expect(p.attainmentPct).toBe(10)
    expect(p.projectedPct).toBe(200)
  })

  it("진행률 상한 클램프(1) — 월말엔 추정=실적", () => {
    const p = projectMonthEnd(800, 1_000, 1.5)
    expect(p.projected).toBe(800)
    expect(p.attainmentPct).toBe(80)
    expect(p.projectedPct).toBe(80)
  })

  it("실적 0이면 추정·달성률 0", () => {
    const p = projectMonthEnd(0, 1_000, 0.5)
    expect(p.projected).toBe(0)
    expect(p.attainmentPct).toBe(0)
    expect(p.projectedPct).toBe(0)
  })
})

describe("kstMonthProgressRatio", () => {
  it("월 중순(KST 15일/30일) ≈ 0.5", () => {
    const ratio = kstMonthProgressRatio(new Date(Date.UTC(2026, 5, 15, 3, 0, 0)))
    expect(ratio).toBeCloseTo(15 / 30, 5)
  })

  it("KST 보정으로 월이 넘어가면 다음 달 1일로 계산", () => {
    // 2026-06-30 20:00 UTC + 9h = 2026-07-01 05:00 KST → 7월 1일 / 31일
    const ratio = kstMonthProgressRatio(new Date(Date.UTC(2026, 5, 30, 20, 0, 0)))
    expect(ratio).toBeCloseTo(1 / 31, 5)
  })

  it("항상 (0,1] 범위", () => {
    const ratio = kstMonthProgressRatio(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))
    expect(ratio).toBeGreaterThan(0)
    expect(ratio).toBeLessThanOrEqual(1)
  })
})
