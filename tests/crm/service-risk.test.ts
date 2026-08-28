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

describe("deriveServiceRisk — 과금 유형 게이트", () => {
  it("구독제 계정의 잔액 0 은 소진이 아니다", () => {
    // 구독제는 잔액이 아니라 계약 기간으로 서비스가 유지된다.
    // 여기에 '충전 잔액 소진'을 붙이면 연장 큐가 오염된다.
    const r = deriveServiceRisk(input({ balance: 0, billingMode: "subscription" }))
    expect(codes(r)).not.toContain("depleted_balance")
    expect(r.level).toBe("normal")
  })

  it("하드웨어 계정도 잔액 소진 대상이 아니다", () => {
    const r = deriveServiceRisk(input({ balance: 0, billingMode: "hardware" }))
    expect(codes(r)).not.toContain("depleted_balance")
  })

  it("충전제 계정은 종전대로 소진을 잡는다", () => {
    const r = deriveServiceRisk(input({ balance: 0, billingMode: "consumption" }))
    expect(codes(r)).toContain("depleted_balance")
    expect(r.level).toBe("soon")
  })

  it("과금 유형을 모르면 신호를 버리지 않는다", () => {
    // 매출시트에 연결되지 않은 계정이 다수라, unknown 을 통째로 막으면
    // 진짜 소진까지 조용해진다. 확실히 아닌 것(구독제·HW)만 제외한다.
    expect(codes(deriveServiceRisk(input({ balance: 0, billingMode: "unknown" })))).toContain("depleted_balance")
    expect(codes(deriveServiceRisk(input({ balance: 0 })))).toContain("depleted_balance")
  })

  it("구독제라도 만료 임박은 그대로 잡는다", () => {
    const r = deriveServiceRisk(input({ balance: 0, billingMode: "subscription", expireAt: days(5) }))
    expect(codes(r)).toContain("subscription_expiring")
    expect(r.level).toBe("urgent")
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

describe("deriveServiceRisk — 재충전 임박", () => {
  it("잔액이 남아있어도 소진 예상일이 가까우면 미리 잡는다", () => {
    const r = deriveServiceRisk(input({ balance: 300, billingMode: "consumption", depletionInDays: 20 }))
    expect(codes(r)).toContain("recharge_due")
    expect(r.level).toBe("soon")
    expect(r.reasons.find((x) => x.code === "recharge_due")?.label).toBe("재충전 임박 D-20")
  })

  it("일주일 안이면 urgent 로 올린다", () => {
    expect(deriveServiceRisk(input({ balance: 300, billingMode: "consumption", depletionInDays: 5 })).level).toBe("urgent")
  })

  it("여유가 있으면 조용하다", () => {
    expect(
      codes(deriveServiceRisk(input({ balance: 3000, billingMode: "consumption", depletionInDays: 120 })))
    ).not.toContain("recharge_due")
  })

  it("구독제에는 붙지 않는다", () => {
    expect(
      codes(deriveServiceRisk(input({ balance: 300, billingMode: "subscription", depletionInDays: 10 })))
    ).not.toContain("recharge_due")
  })

  it("이미 소진된 계정은 '임박'이 아니라 '소진'으로 잡는다", () => {
    const r = deriveServiceRisk(input({ balance: 0, billingMode: "consumption", depletionInDays: 0 }))
    expect(codes(r)).toContain("depleted_balance")
    expect(codes(r)).not.toContain("recharge_due")
  })

  it("표본 부족으로 예상일이 없으면 신호를 만들지 않는다", () => {
    expect(
      codes(deriveServiceRisk(input({ balance: 300, billingMode: "consumption", depletionInDays: null })))
    ).not.toContain("recharge_due")
  })
})
