import { describe, expect, it } from "vitest"

import type { CrmPriorityItem } from "@/lib/crm/priority"
import { pickTodayCalls } from "@/lib/crm/today-calls"
import { selectVisiblePriorityItems } from "@/lib/repositories/crm-priority-queue"

function item(
  id: string,
  overrides: Partial<CrmPriorityItem> = {}
): CrmPriorityItem {
  return {
    id,
    source: "lead",
    title: id,
    subtitle: id,
    ownerName: null,
    ownerKeys: [],
    statusLabel: "신규 리드",
    score: 90,
    severity: "critical",
    lane: "sales",
    laneLabel: "신규·추가 매출",
    bucket: "today",
    bucketLabel: "오늘 처리",
    action: "respond_lead",
    actionLabel: "첫 응답",
    reason: "24시간 이상 미응답",
    href: `/admin/crm/customers/leads?lead=${id}`,
    dueAt: "2026-08-26T00:00:00.000Z",
    updatedAt: null,
    sourceKey: "meta_lead_ads",
    ...overrides,
  }
}

describe("CRM priority queue customer pooling", () => {
  it("전역 상위 50건이 메타·NEO로 차도 limit 전에 직접 신규 응대 슬롯을 예약한다", () => {
    const globallySorted = [
      ...Array.from({ length: 26 }, (_, index) => item(`meta-${index}`)),
      ...Array.from({ length: 24 }, (_, index) =>
        item(`neo-${index}`, {
          source: "neo_account",
          sourceKey: null,
          action: "renew_account",
          actionLabel: "연장 제안",
          lane: "renewal",
          laneLabel: "연장",
        })
      ),
      item("direct-lead", { sourceKey: "contact_page", score: 40, severity: "low" }),
    ]

    expect(globallySorted.slice(0, 50).some((candidate) => candidate.id === "direct-lead")).toBe(false)

    const visible = selectVisiblePriorityItems(globallySorted, 50, "customer")
    expect(visible).toHaveLength(50)
    expect(visible.some((candidate) => candidate.id === "direct-lead")).toBe(true)
    expect(visible.some((candidate) => candidate.source === "neo_account")).toBe(true)
    expect(visible.some((candidate) => candidate.sourceKey === "meta_lead_ads")).toBe(true)

    const { calls } = pickTodayCalls(visible, { limit: 5 })
    expect(calls.some((call) => call.slot === "new_response" && call.item.id === "direct-lead")).toBe(true)
    expect(calls.some((call) => call.slot === "money")).toBe(true)
  })

  it("작은 customer limit도 신규 응대와 기존 고객을 한쪽 소스로만 채우지 않는다", () => {
    const globallySorted = [
      ...Array.from({ length: 10 }, (_, index) => item(`meta-${index}`)),
      item("direct-lead", { sourceKey: "contact_page" }),
      item("neo", {
        source: "neo_account",
        sourceKey: null,
        action: "renew_account",
        actionLabel: "연장 제안",
      }),
    ]

    const visible = selectVisiblePriorityItems(globallySorted, 2, "customer")
    expect(visible.map((candidate) => candidate.id)).toEqual(["direct-lead", "neo"])
  })

  it("customer 이외 소스는 기존 전역 우선순위 slice 계약을 유지한다", () => {
    const globallySorted = [item("first"), item("second"), item("third")]
    expect(selectVisiblePriorityItems(globallySorted, 2, "all").map((candidate) => candidate.id)).toEqual([
      "first",
      "second",
    ])
  })
})
