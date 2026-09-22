import { describe, expect, it } from "vitest"

import {
  buildAutoTagMatcher,
  computeAutoTagHealthBand,
  isDormant,
  isExpiringWithinDays,
  isHealthRisk,
} from "@/lib/crm/auto-tag-rules"

// T5(§11.3) — 자동 태그 규칙 3종의 순수 판정. 경계값과 null 입력을 고정한다.

const DAY_MS = 86_400_000
const NOW = new Date("2026-09-22T00:00:00.000Z").getTime()

describe("isExpiringWithinDays", () => {
  it("expireAt이 null이면 false", () => {
    expect(isExpiringWithinDays(null, 30, NOW)).toBe(false)
  })

  it("정확히 days일 뒤(경계, 포함)면 true", () => {
    const expireAt = new Date(NOW + 30 * DAY_MS).toISOString()
    expect(isExpiringWithinDays(expireAt, 30, NOW)).toBe(true)
  })

  it("days+1일 뒤(경계 밖)면 false", () => {
    const expireAt = new Date(NOW + 31 * DAY_MS).toISOString()
    expect(isExpiringWithinDays(expireAt, 30, NOW)).toBe(false)
  })

  it("정확히 지금(0일, 경계)이면 true", () => {
    expect(isExpiringWithinDays(new Date(NOW).toISOString(), 30, NOW)).toBe(true)
  })

  it("이미 지난 만료(음수 잔여일)면 false", () => {
    const expireAt = new Date(NOW - DAY_MS).toISOString()
    expect(isExpiringWithinDays(expireAt, 30, NOW)).toBe(false)
  })

  it("파싱 불가 문자열이면 false", () => {
    expect(isExpiringWithinDays("not-a-date", 30, NOW)).toBe(false)
  })
})

describe("isHealthRisk / computeAutoTagHealthBand", () => {
  // 산식은 lib/crm/customer-health.ts(SSOT)를 그대로 쓴다: score<42면 riskSeverity가 "low"라
  // 감점이 없고(100점 만점, safe), score>=85(critical)만으로는 -45점(55점, watch 경계)이라
  // 아직 risk가 아니다 — 다른 신호(계약 위험 lifecycle 등)가 겹쳐야 risk로 넘어간다.
  it("낮은 점수 + 정상 lifecycle이면 감점이 없어 safe다(risk 아님)", () => {
    const row = { score: 10, lifecycle: "active", balance: null, expireAt: null }
    expect(computeAutoTagHealthBand(row, NOW)).toBe("safe")
    expect(isHealthRisk(row, NOW)).toBe(false)
  })

  it("점수 85(critical 경계) 단독으로는 watch까지만 내려가고 risk는 아니다", () => {
    const row = { score: 85, lifecycle: "active", balance: null, expireAt: null }
    expect(computeAutoTagHealthBand(row, NOW)).toBe("watch")
    expect(isHealthRisk(row, NOW)).toBe(false)
  })

  it("critical 점수 + account_risk lifecycle이 겹치면 risk 밴드가 된다", () => {
    const row = { score: 90, lifecycle: "account_risk", balance: null, expireAt: null }
    expect(computeAutoTagHealthBand(row, NOW)).toBe("risk")
    expect(isHealthRisk(row, NOW)).toBe(true)
  })

  it("balance가 없거나(null) 0이면 hasOutstanding=false로 취급한다(예외 없이 동작)", () => {
    const row = { score: 70, lifecycle: "active", balance: 0, expireAt: null }
    expect(() => computeAutoTagHealthBand(row, NOW)).not.toThrow()
  })
})

describe("isDormant", () => {
  it("lastContactAt이 없으면(null) true", () => {
    expect(isDormant(null, 60, NOW)).toBe(true)
  })

  it("lastContactAt이 없으면(undefined) true", () => {
    expect(isDormant(undefined, 60, NOW)).toBe(true)
  })

  it("정확히 days일 전(경계, 포함)이면 true", () => {
    const lastContactAt = new Date(NOW - 60 * DAY_MS).toISOString()
    expect(isDormant(lastContactAt, 60, NOW)).toBe(true)
  })

  it("days-1일 전(경계 밖, 아직 휴면 아님)이면 false", () => {
    const lastContactAt = new Date(NOW - 59 * DAY_MS).toISOString()
    expect(isDormant(lastContactAt, 60, NOW)).toBe(false)
  })

  it("파싱 불가 문자열이면 true(안전 쪽으로 휴면 취급)", () => {
    expect(isDormant("not-a-date", 60, NOW)).toBe(true)
  })
})

describe("buildAutoTagMatcher", () => {
  it("expiring_within_days: params.days 기본값 30을 쓴다", () => {
    const matcher = buildAutoTagMatcher("expiring_within_days", {}, NOW)
    const row = {
      key: "neo_account:1",
      score: 50,
      lifecycle: "active",
      balance: null,
      expireAt: new Date(NOW + 29 * DAY_MS).toISOString(),
    }
    expect(matcher(row)).toBe(true)
  })

  it("expiring_within_days: params.days를 명시하면 그 값을 쓴다", () => {
    const matcher = buildAutoTagMatcher("expiring_within_days", { days: 7 }, NOW)
    const row = {
      key: "neo_account:1",
      score: 50,
      lifecycle: "active",
      balance: null,
      expireAt: new Date(NOW + 10 * DAY_MS).toISOString(),
    }
    expect(matcher(row)).toBe(false)
  })

  it("health_risk: isHealthRisk와 같은 결과", () => {
    const matcher = buildAutoTagMatcher("health_risk", {}, NOW)
    const riskyRow = { key: "neo_account:1", score: 90, lifecycle: "account_risk", balance: null, expireAt: null }
    const safeRow = { key: "neo_account:2", score: 10, lifecycle: "active", balance: null, expireAt: null }
    expect(matcher(riskyRow)).toBe(true)
    expect(matcher(safeRow)).toBe(false)
  })

  it("dormant_days: params.days 기본값 60을 쓴다", () => {
    const matcher = buildAutoTagMatcher("dormant_days", {}, NOW)
    const row = {
      key: "lead:1",
      score: 50,
      lifecycle: "active",
      balance: null,
      expireAt: null,
      lastContactAt: new Date(NOW - 61 * DAY_MS).toISOString(),
    }
    expect(matcher(row)).toBe(true)
  })
})
