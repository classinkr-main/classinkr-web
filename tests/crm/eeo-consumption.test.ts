import { describe, expect, it } from "vitest"

import { deriveConsumptionForecast, type ConsumptionEvent } from "@/lib/crm/eeo-consumption"

const NOW = new Date("2026-08-28T00:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000

function daysAgo(n: number) {
  return NOW.getTime() - n * DAY
}

/** 균등하게 흩어진 차감 이벤트 n건. */
function spread(count: number, each: number, spanDays = 80): ConsumptionEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    occurredAt: daysAgo(Math.round((spanDays * i) / Math.max(1, count - 1))),
    amount: -each,
  }))
}

describe("deriveConsumptionForecast", () => {
  it("반복 소비에서 일평균과 소진 예상일을 낸다", () => {
    // 90일 창에 900元 차감(6건×150) → 일평균 10元, 잔액 300元이면 30일 남음.
    const r = deriveConsumptionForecast({ balance: 300, events: spread(6, 150), now: NOW })
    expect(r.dailyBurn).toBeCloseTo(10)
    expect(r.daysLeft).toBe(30)
    expect(r.confidence).toBe("high")
    expect(r.eventCount).toBe(6)
  })

  it("표본이 1건이면 예상일을 만들지 않는다", () => {
    // 프로덕션 실측 함정: 정율사관 튜터링은 90일 차감이 ¥29,703 단 1건(개통 결제)인데
    // 이를 일평균으로 펴면 잔액 148元이 "내일 소진"으로 뜬다.
    const r = deriveConsumptionForecast({
      balance: 148,
      events: [{ occurredAt: daysAgo(20), amount: -29703 }],
      now: NOW,
    })
    expect(r.daysLeft).toBeNull()
    expect(r.dailyBurn).toBeNull()
    expect(r.confidence).toBe("none")
    expect(r.eventCount).toBe(1)
  })

  it("3~5건은 medium 으로 낮춰 잡는다", () => {
    const r = deriveConsumptionForecast({ balance: 300, events: spread(3, 300), now: NOW })
    expect(r.confidence).toBe("medium")
    expect(r.daysLeft).toBe(30)
  })

  it("창 밖 이벤트와 미래 이벤트는 세지 않는다", () => {
    const r = deriveConsumptionForecast({
      balance: 300,
      events: [
        ...spread(3, 300),
        { occurredAt: daysAgo(200), amount: -99999 },
        { occurredAt: NOW.getTime() + 5 * DAY, amount: -99999 },
      ],
      now: NOW,
    })
    expect(r.eventCount).toBe(3)
    expect(r.daysLeft).toBe(30)
  })

  it("충전(양수)은 차감으로 세지 않는다", () => {
    const r = deriveConsumptionForecast({
      balance: 300,
      events: [...spread(6, 150), { occurredAt: daysAgo(10), amount: 50000 }],
      now: NOW,
    })
    expect(r.eventCount).toBe(6)
    expect(r.dailyBurn).toBeCloseTo(10)
  })

  it("이미 소진된 계정은 임박이 아니다 — 별도 신호가 잡는다", () => {
    const zero = deriveConsumptionForecast({ balance: 0, events: spread(6, 150), now: NOW })
    expect(zero.daysLeft).toBeNull()
    expect(zero.dailyBurn).toBeCloseTo(10)

    const negative = deriveConsumptionForecast({ balance: -107.29, events: spread(6, 150), now: NOW })
    expect(negative.daysLeft).toBeNull()
  })

  it("잔액을 모르면 예상일을 지어내지 않는다", () => {
    const r = deriveConsumptionForecast({ balance: null, events: spread(6, 150), now: NOW })
    expect(r.daysLeft).toBeNull()
    expect(r.confidence).toBe("none")
  })

  it("이벤트가 없거나 전부 0이면 조용히 none", () => {
    expect(deriveConsumptionForecast({ balance: 500, events: [], now: NOW }).confidence).toBe("none")
    expect(
      deriveConsumptionForecast({
        balance: 500,
        events: [
          { occurredAt: daysAgo(1), amount: 0 },
          { occurredAt: daysAgo(2), amount: 0 },
          { occurredAt: daysAgo(3), amount: 0 },
        ],
        now: NOW,
      }).daysLeft
    ).toBeNull()
  })

  it("깨진 날짜·금액은 건너뛴다", () => {
    const r = deriveConsumptionForecast({
      balance: 300,
      events: [
        ...spread(3, 300),
        { occurredAt: "not-a-date", amount: -1000 },
        { occurredAt: daysAgo(5), amount: null },
      ],
      now: NOW,
    })
    expect(r.eventCount).toBe(3)
  })

  it("창 길이를 바꾸면 일평균도 그에 맞게 바뀐다", () => {
    const r = deriveConsumptionForecast({ balance: 300, events: spread(6, 150, 25), windowDays: 30, now: NOW })
    expect(r.dailyBurn).toBeCloseTo(30)
    expect(r.daysLeft).toBe(10)
  })
})
