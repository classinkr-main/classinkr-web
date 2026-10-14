import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { buildCustomerPurchaseHistory, compareCustomerHistory, isCustomerVisit, isCompassVisit, purchaseHistoryMatches } from "@/lib/crm/customer-history"
import { buildCrmMoneyLineItems } from "@/lib/crm/money-line-items"
import Customer360PurchaseSummary from "@/components/admin/crm/Customer360PurchaseSummary"
import type { Customer360, Customer360Money } from "@/lib/repositories/crm-customer-360"

const money = {
  orders: [
    { id: "hw", title: '[HW] 86" IFP', amount: 2970, occurredAt: "2026-02-23", ownerName: "담당", status: null },
    { id: "sw", title: "ClassIn 연간 구독", amount: 99, occurredAt: "2026-03-13", ownerName: "담당", status: null },
  ],
  collections: [{ id: "paid", title: "수금", amount: 2970, occurredAt: "2026-02-27", ownerName: "담당", status: null }],
  lineItems: buildCrmMoneyLineItems({ accountId: "account", accountName: "테스트 학원" }, {
    dealLineItems: [],
    hwOutbound: [{ id: "out", ref: "H6", product: '86" IFP', quantity: 1, revenue: 2970, destination: "테스트 학원", serials: ["SERIAL-1"], outboundDate: "2026-02-19", isPlanned: false, confirmedAccountId: null, outboundType: "Sales" }],
  }).lineItems,
} as unknown as Customer360Money

describe("고객 이력 큐", () => {
  it("주문·수금·출고를 서로 다른 기록으로 유지하고 통화를 보존한다", () => {
    const history = buildCustomerPurchaseHistory(money).sort(compareCustomerHistory)
    expect(history.map(row => row.id)).toEqual(["money:order:sw", "money:collection:paid", "money:order:hw", expect.stringContaining("item:")])
    const paid = history.find(row => row.id === "money:collection:paid")
    expect(paid?.kind === "money" && paid.entry.currency).toBe("CNY")
    const order = history.find(row => row.id === "money:order:hw")
    expect(order?.kind === "money" && order.entry.currency).toBe("USD")
  })
  it("오더·하드웨어·소프트웨어 필터는 맞는 원천만 선택한다", () => {
    const rows = buildCustomerPurchaseHistory(money)
    expect(rows.filter(row => purchaseHistoryMatches(row, "order"))).toHaveLength(2)
    expect(rows.filter(row => purchaseHistoryMatches(row, "hardware"))).toHaveLength(2)
    expect(rows.filter(row => purchaseHistoryMatches(row, "software"))).toHaveLength(1)
    expect(rows.filter(row => purchaseHistoryMatches(row, "visit"))).toHaveLength(0)
  })
  it("날짜 미확인은 맨 뒤로, 동시각은 id 순으로 정렬한다", () => {
    const rows = [{ id: "z", at: null }, { id: "b", at: "2026-01-01" }, { id: "a", at: "2026-01-01" }, { id: "bad", at: "invalid" }]
    expect(rows.sort(compareCustomerHistory).map(row => row.id)).toEqual(["a", "b", "bad", "z"])
  })
  it("회의록 전체를 방문으로 부르지 않고 명시적 방문과 Compass 미팅을 선택한다", () => {
    expect(isCustomerVisit({ title: "화상 회의", meetingPurpose: null, tags: [] })).toBe(false)
    expect(isCustomerVisit({ title: "목동 쇼룸 방문", meetingPurpose: null, tags: [] })).toBe(true)
    expect(isCustomerVisit({ title: "상담", meetingPurpose: null, tags: ["visit:showroom"] })).toBe(true)
    expect(isCompassVisit({ kind: "meeting" } as Parameters<typeof isCompassVisit>[0])).toBe(true)
    expect(isCompassVisit({ kind: "memo", body: "방문할 계획은 없다" } as Parameters<typeof isCompassVisit>[0])).toBe(false)
  })
  it("판매 출고 수량과 소프트웨어 원장 금액을 상단에 표시하며 통화를 바꾸지 않는다", () => {
    const data = { productSummary: { matched: true, hwQuantity: 2, hwBoardCount: 1, hwProducts: [{ product: "T1", quantity: 1 }, { product: '86" IFP', quantity: 1 }], hwCumulativeCNY: 0, swCumulativeCNY: 8537 }, money: { ...money, lineItemsMeta: { sources: [], truncated: false } } } as unknown as Customer360
    const html = renderToStaticMarkup(<Customer360PurchaseSummary data={data} />)
    expect(html).toContain("누적 하드웨어 구매량")
    expect(html).toContain("2")
    expect(html).toContain("¥8,537")
    expect(html).toContain("샘플·프로모션·A/S·예정 제외")
  })
  it("미매칭 고객은 구매량 0으로 가장하지 않는다", () => {
    const data = { productSummary: { matched: false, hwQuantity: null, hwBoardCount: null, hwCumulativeCNY: null, swCumulativeCNY: null }, money: { lineItems: [], lineItemsMeta: { sources: [], truncated: false } } } as unknown as Customer360
    const html = renderToStaticMarkup(<Customer360PurchaseSummary data={data} />)
    expect(html).toContain("수량 미확인")
    expect(html).not.toContain("¥0")
  })
})
