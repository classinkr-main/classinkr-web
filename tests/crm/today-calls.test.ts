import { describe, expect, it } from "vitest"

import type { CrmPriorityItem } from "@/lib/crm/priority"
import { classifyTodayCallSlot, pickTodayCalls } from "@/lib/crm/today-calls"

function makeItem(overrides: Partial<CrmPriorityItem> & { id: string }): CrmPriorityItem {
  return {
    source: "lead",
    title: overrides.id,
    subtitle: null,
    ownerName: null,
    ownerKeys: [],
    statusLabel: "신규 리드",
    score: 50,
    severity: "medium",
    lane: "sales",
    laneLabel: "신규·추가 매출",
    bucket: "today",
    bucketLabel: "오늘 처리",
    action: "respond_lead",
    actionLabel: "첫 응답",
    reason: "24시간 이상 미응답",
    href: "/admin/crm/customers/leads",
    dueAt: null,
    updatedAt: null,
    sourceKey: overrides.source === "neo_account" || overrides.source === "task" ? null : "demo_modal",
    ...overrides,
  }
}

describe("classifyTodayCallSlot", () => {
  it("첫 응답 리드는 신규 응대, 계정은 돈 임박, 재방문·데모·팔로업은 다시 움직임", () => {
    expect(classifyTodayCallSlot(makeItem({ id: "l1" }))).toBe("new_response")
    expect(
      classifyTodayCallSlot(
        makeItem({ id: "a1", source: "neo_account", action: "renew_account", actionLabel: "연장 제안" })
      )
    ).toBe("money")
    expect(
      classifyTodayCallSlot(
        makeItem({ id: "a2", source: "neo_account", action: "reengage_account", actionLabel: "재활성" })
      )
    ).toBe("reengage")
    expect(classifyTodayCallSlot(makeItem({ id: "l2", reason: "연락 후 재방문" }))).toBe("reengage")
    expect(classifyTodayCallSlot(makeItem({ id: "l3", action: "follow_up_lead", actionLabel: "팔로업" }))).toBe(
      "reengage"
    )
  })
})

describe("pickTodayCalls", () => {
  it("쿼터 믹스 — 신규 리드가 아무리 많아도 돈 임박·다시 움직임 자리를 지킨다", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, index) =>
        makeItem({ id: `lead${index}`, score: 90 - index, subtitle: `기관${index}` })
      ),
      makeItem({
        id: "acct-renewal",
        source: "neo_account",
        action: "renew_account",
        actionLabel: "연장 제안",
        score: 80,
        lane: "renewal",
        bucket: "today",
      }),
      makeItem({
        id: "acct-refill",
        source: "neo_account",
        action: "watch_account",
        actionLabel: "충전 안내",
        score: 70,
        lane: "customer_care",
        bucket: "today",
      }),
      makeItem({
        id: "lead-revisit",
        score: 60,
        reason: "연락 후 재방문",
        subtitle: "재방문기관",
      }),
    ]
    const { calls } = pickTodayCalls(items, { limit: 5 })
    expect(calls).toHaveLength(5)
    expect(calls.filter((call) => call.slot === "new_response")).toHaveLength(2)
    expect(calls.filter((call) => call.slot === "money").map((call) => call.item.id)).toEqual([
      "acct-renewal",
      "acct-refill",
    ])
    expect(calls.filter((call) => call.slot === "reengage").map((call) => call.item.id)).toEqual(["lead-revisit"])
  })

  it("같은 기관의 중복 리드는 접고 groupedCount로 알린다", () => {
    const items = [
      makeItem({ id: "dup1", score: 90, subtitle: "강남학원" }),
      makeItem({ id: "dup2", score: 85, subtitle: "강남 학원" }),
      makeItem({ id: "dup3", score: 80, subtitle: "강남학원" }),
      makeItem({ id: "other", score: 70, subtitle: "다른학원" }),
    ]
    const { calls } = pickTodayCalls(items, { limit: 5 })
    const ids = calls.map((call) => call.item.id)
    expect(ids).toContain("dup1")
    expect(ids).not.toContain("dup2")
    expect(ids).not.toContain("dup3")
    expect(calls.find((call) => call.item.id === "dup1")?.groupedCount).toBe(2)
  })

  it("슬롯이 비면 남은 후보로 백필해 총량을 채운다", () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      makeItem({ id: `lead${index}`, score: 90 - index, subtitle: `기관${index}` })
    )
    const { calls } = pickTodayCalls(items, { limit: 5 })
    expect(calls).toHaveLength(5)
    // 돈 임박·다시 움직임 후보가 없으므로 전부 신규 응대로 채워진다.
    expect(calls.every((call) => call.slot === "new_response")).toBe(true)
  })

  it("오늘 버킷이 관찰 버킷보다 먼저 선다", () => {
    const items = [
      makeItem({ id: "watch-high", score: 95, bucket: "watch", subtitle: "관찰기관" }),
      makeItem({ id: "today-low", score: 58, bucket: "today", subtitle: "오늘기관" }),
    ]
    const { calls } = pickTodayCalls(items, { limit: 2 })
    expect(calls[0]?.item.id).toBe("today-low")
  })

  it("overflow는 선별 밖 후보를 분류 유지한 채 돌려준다", () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      makeItem({ id: `lead${index}`, score: 90 - index, subtitle: `기관${index}` })
    )
    const { calls, overflow } = pickTodayCalls(items, { limit: 5 })
    expect(calls).toHaveLength(5)
    expect(overflow.map((call) => call.item.id)).toEqual(["lead5", "lead6", "lead7"])
  })

  it("메타 광고 리드는 카드·overflow에서 완전히 분리되고 meta 밴드로만 나온다", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, index) =>
        makeItem({ id: `meta${index}`, score: 95 - index, sourceKey: "meta_lead_ads", subtitle: `메타기관${index}` })
      ),
      makeItem({ id: "direct1", score: 60, sourceKey: "demo_modal", subtitle: "직접기관" }),
      makeItem({
        id: "acct1",
        source: "neo_account",
        action: "renew_account",
        actionLabel: "연장 제안",
        score: 72,
        sourceKey: null,
      }),
    ]
    const { calls, overflow, meta } = pickTodayCalls(items, { limit: 5 })
    const allIds = [...calls, ...overflow].map((call) => call.item.id)
    expect(allIds.some((id) => id.startsWith("meta"))).toBe(false)
    expect(allIds).toContain("direct1")
    expect(allIds).toContain("acct1")
    expect(meta.total).toBe(6)
    expect(meta.today).toBe(6)
    expect(meta.top.map((item) => item.id)).toEqual(["meta0", "meta1", "meta2", "meta3"])
  })
})
