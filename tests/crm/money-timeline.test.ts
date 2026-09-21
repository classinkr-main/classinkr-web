/**
 * M3 — 주문 타임라인 조립기(lib/crm/money-timeline.ts).
 * 병합·내림차순 정렬·통화 보존·날짜 파싱 실패 후순위·월 그룹핑·상태 톤을 고정한다.
 */
import { describe, expect, it } from "vitest"

import type { NeoCrmCustomerMoneyItem } from "@/lib/admin-crm-customers-neo"
import {
  buildMoneyTimeline,
  dealOccurredAt,
  groupMoneyTimelineByMonth,
  MONEY_TIMELINE_KIND_META,
  MONEY_TIMELINE_UNKNOWN_MONTH_KEY,
  moneyTimelineStatusLabel,
  resolveMoneyStatusTone,
  type MoneyTimelineDealInput,
} from "@/lib/crm/money-timeline"

function neo(overrides: Partial<NeoCrmCustomerMoneyItem> & { id: string }): NeoCrmCustomerMoneyItem {
  return {
    title: `항목 ${overrides.id}`,
    amount: 100,
    occurredAt: "2026-09-10T00:00:00.000Z",
    ownerName: "담당자",
    status: null,
    ...overrides,
  }
}

function deal(overrides: Partial<MoneyTimelineDealInput> & { id: string }): MoneyTimelineDealInput {
  return {
    title: `딜 ${overrides.id}`,
    expectedAmount: 5_000_000,
    expectedCloseAt: null,
    closedAt: null,
    createdAt: "2026-08-15T00:00:00.000Z",
    status: "open",
    ownerNameSnapshot: "김담당",
    ...overrides,
  }
}

describe("buildMoneyTimeline", () => {
  it("세 원천을 병합하고 occurredAt 내림차순으로 정렬한다", () => {
    const timeline = buildMoneyTimeline({
      orders: [neo({ id: "o1", occurredAt: "2026-09-01T00:00:00.000Z" })],
      collections: [neo({ id: "c1", occurredAt: "2026-09-15T00:00:00.000Z" })],
      deals: [deal({ id: "d1", closedAt: "2026-09-10T00:00:00.000Z", status: "won" })],
    })
    expect(timeline.map((entry) => entry.id)).toEqual(["collection:c1", "deal:d1", "order:o1"])
    expect(timeline.map((entry) => entry.kind)).toEqual(["collection", "deal", "order"])
  })

  it("각 항목이 자기 통화를 유지하고 금액을 서로 더하지 않는다", () => {
    const timeline = buildMoneyTimeline({
      orders: [neo({ id: "o1", amount: 1500 })],
      collections: [neo({ id: "c1", amount: 20_000 })],
      deals: [deal({ id: "d1", expectedAmount: 7_000_000 })],
    })
    const byKind = Object.fromEntries(timeline.map((entry) => [entry.kind, entry]))
    expect(byKind.order.currency).toBe("USD")
    expect(byKind.collection.currency).toBe("CNY")
    expect(byKind.deal.currency).toBe("KRW")
    expect(byKind.order.amount).toBe(1500)
    expect(byKind.collection.amount).toBe(20_000)
    expect(byKind.deal.amount).toBe(7_000_000)
    // 통화별 금액은 그대로 보존되고, 어떤 항목에도 합산된 값(1500+20000+7000000)이 없다.
    expect(timeline.some((entry) => entry.amount === 1500 + 20_000 + 7_000_000)).toBe(false)
    expect(byKind.order.sourceLabel).toBe(MONEY_TIMELINE_KIND_META.order.sourceLabel)
    expect(byKind.collection.sourceLabel).toBe("NEO 수금")
    expect(byKind.deal.sourceLabel).toBe("딜(₩)")
  })

  it("날짜가 없거나 파싱에 실패한 항목은 맨 뒤로 가고 입력 순서를 유지한다", () => {
    const timeline = buildMoneyTimeline({
      orders: [neo({ id: "bad", occurredAt: "not-a-date" }), neo({ id: "ok", occurredAt: "2026-09-02T00:00:00.000Z" })],
      collections: [neo({ id: "none", occurredAt: null })],
      deals: [deal({ id: "d1", createdAt: "2026-09-05T00:00:00.000Z" })],
    })
    expect(timeline.map((entry) => entry.id)).toEqual(["deal:d1", "order:ok", "order:bad", "collection:none"])
  })

  it("빈 입력·null 입력은 빈 배열", () => {
    expect(buildMoneyTimeline({})).toEqual([])
    expect(buildMoneyTimeline({ orders: null, collections: null, deals: null })).toEqual([])
  })

  it("제목 공백·비정상 금액·담당 공백을 정규화한다", () => {
    const [entry] = buildMoneyTimeline({
      orders: [neo({ id: "o1", title: "   ", amount: Number.NaN, ownerName: "  " })],
    })
    expect(entry.title).toBe("제목 없음")
    expect(entry.amount).toBeNull()
    expect(entry.ownerName).toBeUndefined()
  })
})

describe("dealOccurredAt", () => {
  it("종료일 > 예상 마감일 > 생성일 순으로 고른다", () => {
    expect(dealOccurredAt(deal({ id: "a", closedAt: "2026-09-20T00:00:00.000Z", expectedCloseAt: "2026-09-01T00:00:00.000Z" }))).toBe(
      "2026-09-20T00:00:00.000Z"
    )
    expect(dealOccurredAt(deal({ id: "b", expectedCloseAt: "2026-09-01T00:00:00.000Z" }))).toBe("2026-09-01T00:00:00.000Z")
    expect(dealOccurredAt(deal({ id: "c" }))).toBe("2026-08-15T00:00:00.000Z")
  })
})

describe("groupMoneyTimelineByMonth", () => {
  it("YYYY년 M월 헤더로 묶고 날짜 미확인 그룹은 마지막", () => {
    const timeline = buildMoneyTimeline({
      orders: [
        neo({ id: "sep-a", occurredAt: "2026-09-15T12:00:00.000Z" }),
        neo({ id: "sep-b", occurredAt: "2026-09-10T12:00:00.000Z" }),
        neo({ id: "aug", occurredAt: "2026-08-12T12:00:00.000Z" }),
        neo({ id: "bad", occurredAt: "???" }),
      ],
    })
    const groups = groupMoneyTimelineByMonth(timeline)
    expect(groups.map((group) => group.label)).toEqual(["2026년 9월", "2026년 8월", "날짜 미확인"])
    expect(groups[0].key).toBe("2026-09")
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(["order:sep-a", "order:sep-b"])
    expect(groups[2].key).toBe(MONEY_TIMELINE_UNKNOWN_MONTH_KEY)
    expect(groups[2].entries).toHaveLength(1)
  })

  it("빈 타임라인은 빈 그룹", () => {
    expect(groupMoneyTimelineByMonth([])).toEqual([])
  })
})

describe("상태 톤·라벨", () => {
  it("딜: won→ok, lost→danger, open→중립(null)", () => {
    expect(resolveMoneyStatusTone("deal", "won")).toBe("ok")
    expect(resolveMoneyStatusTone("deal", "lost")).toBe("danger")
    expect(resolveMoneyStatusTone("deal", "open")).toBeNull()
    expect(moneyTimelineStatusLabel({ kind: "deal", status: "won" })).toBe("완료")
    expect(moneyTimelineStatusLabel({ kind: "deal", status: "open" })).toBe("진행")
  })

  it("NEO 자유 문자열: 완료·취소 어휘만 신호색, 나머지는 중립", () => {
    expect(resolveMoneyStatusTone("order", "완료")).toBe("ok")
    expect(resolveMoneyStatusTone("collection", "已收")).toBe("ok")
    expect(resolveMoneyStatusTone("order", "취소")).toBe("danger")
    expect(resolveMoneyStatusTone("order", "Canceled")).toBe("danger")
    expect(resolveMoneyStatusTone("order", "진행중")).toBeNull()
    expect(resolveMoneyStatusTone("order", null)).toBeNull()
    expect(moneyTimelineStatusLabel({ kind: "order", status: "진행중" })).toBe("진행중")
    expect(moneyTimelineStatusLabel({ kind: "order", status: null })).toBeNull()
  })
})
