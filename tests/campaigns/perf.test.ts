import { describe, expect, it } from "vitest"
import {
  resolvePerfPeriod,
  computeDeltaPct,
  computePacing,
  aggregateDailySeries,
} from "@/lib/marketing/perf"

describe("resolvePerfPeriod", () => {
  it("30d — [오늘-29, 오늘] + 직전 30일", () => {
    const p = resolvePerfPeriod("30d", "2026-08-20")
    expect(p).toEqual({
      key: "30d",
      since: "2026-07-22",
      until: "2026-08-20",
      prevSince: "2026-06-22",
      prevUntil: "2026-07-21",
    })
  })
  it("quarter — 분기 시작~오늘 + 직전 동일 길이", () => {
    const p = resolvePerfPeriod("quarter", "2026-08-20")
    expect(p.since).toBe("2026-07-01")
    expect(p.until).toBe("2026-08-20")
  })
})

describe("computeDeltaPct", () => {
  it("증감률 계산", () => {
    expect(computeDeltaPct(120, 100)).toBe(20)
    expect(computeDeltaPct(80, 100)).toBe(-20)
  })
  it("이전 0 또는 null 이면 null (0 나눗셈·미측정 정직)", () => {
    expect(computeDeltaPct(120, 0)).toBeNull()
    expect(computeDeltaPct(120, null)).toBeNull()
    expect(computeDeltaPct(null, 100)).toBeNull()
  })
})

describe("computePacing", () => {
  it("기간 경과율 — 기간 내 오늘", () => {
    const p = computePacing({
      startsAt: "2026-08-01",
      endsAt: "2026-08-31",
      today: "2026-08-16",
      spend: 58,
      budget: 100,
    })
    expect(p.elapsedPct).toBe(50) // 31일 중 15.5일 → 반올림 50
    expect(p.executionPct).toBe(58)
  })
  it("예산 없으면 executionPct null, 기간 없으면 elapsedPct null", () => {
    const p = computePacing({ startsAt: null, endsAt: null, today: "2026-08-16", spend: 58, budget: null })
    expect(p.elapsedPct).toBeNull()
    expect(p.executionPct).toBeNull()
  })
  it("기간 종료 후는 100 으로 클램프", () => {
    const p = computePacing({ startsAt: "2026-07-01", endsAt: "2026-07-31", today: "2026-08-16", spend: 0, budget: null })
    expect(p.elapsedPct).toBe(100)
  })
})

describe("aggregateDailySeries", () => {
  it("일자별 spend/leads 합산 — 캠페인 여러 개를 날짜로 접는다", () => {
    const rows = [
      { date: "2026-08-18", campaignId: "a", spend: 10, leads: 2 },
      { date: "2026-08-18", campaignId: "b", spend: 5, leads: 1 },
      { date: "2026-08-19", campaignId: "a", spend: 7, leads: 0 },
    ]
    expect(aggregateDailySeries(rows)).toEqual([
      { date: "2026-08-18", spend: 15, leads: 3 },
      { date: "2026-08-19", spend: 7, leads: 0 },
    ])
  })
})
