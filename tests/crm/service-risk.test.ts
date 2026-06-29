import { describe, expect, it } from "vitest"

import { deriveServiceRisk, type ServiceRiskInput } from "@/lib/crm/service-risk"

const NOW = new Date("2026-06-27T00:00:00.000Z")

function input(overrides: Partial<ServiceRiskInput> = {}): ServiceRiskInput {
  return {
    hasNeoData: true,
    expireAt: null,
    balance: null,
    lastClassAt: null,
    syncedAt: "2026-06-27T00:00:00.000Z", // fresh
    now: NOW,
    ...overrides,
  }
}

function days(n: number) {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString()
}

function hoursAgo(n: number) {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000).toISOString()
}

const codes = (r: ReturnType<typeof deriveServiceRisk>) => r.reasons.map((x) => x.code)

describe("deriveServiceRisk — subscription", () => {
  it("flags expired subscriptions as urgent", () => {
    const r = deriveServiceRisk(input({ expireAt: days(-5) }))
    expect(r.level).toBe("urgent")
    expect(codes(r)).toContain("subscription_expired")
    expect(r.expireInDays).toBe(-5)
  })

  it("flags D-7 or sooner as urgent and D-30 as soon", () => {
    expect(deriveServiceRisk(input({ expireAt: days(5) })).level).toBe("urgent")
    expect(deriveServiceRisk(input({ expireAt: days(20) })).level).toBe("soon")
    expect(deriveServiceRisk(input({ expireAt: days(50) })).level).toBe("watch")
    expect(deriveServiceRisk(input({ expireAt: days(120) })).level).toBe("normal")
  })
})

describe("deriveServiceRisk — balance & inactivity", () => {
  it("treats depleted balance as soon but does NOT invent a ratio for positive balance", () => {
    const depleted = deriveServiceRisk(input({ balance: 0 }))
    expect(depleted.level).toBe("soon")
    expect(codes(depleted)).toContain("depleted_balance")

    const positive = deriveServiceRisk(input({ balance: 1000 }))
    expect(codes(positive)).not.toContain("depleted_balance")
    expect(positive.level).toBe("normal")
  })

  it("flags long inactivity with remaining balance as watch", () => {
    const r = deriveServiceRisk(input({ balance: 500, lastClassAt: days(-45) }))
    expect(r.level).toBe("watch")
    expect(codes(r)).toContain("inactive")
  })
})

describe("deriveServiceRisk — provenance & confidence (§10)", () => {
  it("returns neo_missing with low confidence and no invented values", () => {
    const r = deriveServiceRisk(input({ hasNeoData: false, balance: 100 }))
    expect(codes(r)).toEqual(["neo_missing"])
    expect(r.confidence).toBe("low")
    expect(r.level).toBe("normal")
    expect(r.freshnessLabel).toBeNull()
  })

  it("lowers confidence and flags stale snapshots", () => {
    expect(deriveServiceRisk(input({ syncedAt: hoursAgo(2) })).confidence).toBe("high")
    expect(deriveServiceRisk(input({ syncedAt: hoursAgo(30) })).confidence).toBe("medium")
    const stale = deriveServiceRisk(input({ syncedAt: hoursAgo(100) }))
    expect(stale.confidence).toBe("low")
    expect(codes(stale)).toContain("stale_snapshot")
  })

  it("formats freshness labels", () => {
    expect(deriveServiceRisk(input({ syncedAt: hoursAgo(2) })).freshnessLabel).toBe("NEO 2시간 전")
    expect(deriveServiceRisk(input({ syncedAt: hoursAgo(48) })).freshnessLabel).toBe("NEO 2일 전")
  })

  it("escalates to the most severe signal across subscription + balance", () => {
    const r = deriveServiceRisk(input({ expireAt: days(-3), balance: 0, lastClassAt: days(-60) }))
    expect(r.level).toBe("urgent")
    expect(codes(r)).toEqual(expect.arrayContaining(["subscription_expired", "depleted_balance"]))
  })
})
