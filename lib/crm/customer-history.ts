import { buildMoneyTimeline, type MoneyTimelineEntry } from "./money-timeline"
import type { Customer360Money } from "@/lib/repositories/crm-customer-360"
import type { ListCrmDealsResult } from "@/lib/repositories/crm-deals"
import type { CrmCustomerEventRecord } from "@/lib/repositories/crm-events"
import type { CompassTimelineEntry } from "./compass-timeline"
import type { CrmMoneyLineItem } from "./money-line-items"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"

export type CustomerHistoryFilter = "all" | "order" | "visit" | "hardware" | "software" | "memo" | "meeting" | "cs_inflow" | "calls_etc"

export type CustomerPurchaseHistoryEntry =
  | { kind: "money"; id: string; at: string | null; entry: MoneyTimelineEntry }
  | { kind: "item"; id: string; at: string | null; item: CrmMoneyLineItem; detail: CrmMoneyLineItem["details"][number] }

/** 주문 총액·품목 수량·출고는 각 원천의 독립된 기록이다. 금액과 수량을 중복 합산하지 않는다. */
export function buildCustomerPurchaseHistory(money?: Customer360Money, deals?: ListCrmDealsResult): CustomerPurchaseHistoryEntry[] {
  if (!money) return []
  return [
    ...buildMoneyTimeline({ orders: money.orders, collections: money.collections, deals: deals?.rows }).map(entry => ({ kind: "money" as const, id: `money:${entry.id}`, at: entry.occurredAt, entry })),
    ...(money.lineItems ?? []).flatMap(item => item.details.map((detail, index) => ({
      kind: "item" as const, id: `item:${item.key}:${detail.ref}:${index}`, at: detail.at, item, detail,
    }))),
  ]
}

export function purchaseHistoryMatches(entry: CustomerPurchaseHistoryEntry, filter: CustomerHistoryFilter): boolean {
  if (filter === "all") return true
  if (filter === "order") return entry.kind === "money" ? entry.entry.kind === "order" : entry.item.source === "deal_line_items"
  if (entry.kind === "money") return entry.entry.kind === "order" && (filter === "hardware" || filter === "software") && classifySalesLedgerProductCategory({ product: entry.entry.title }) === filter
  if (filter === "software") return entry.item.category === "software"
  if (filter === "hardware") return entry.item.source === "hw_outbound" || ["board", "camera", "stand"].includes(entry.item.category)
  return false
}

const VISIT_TAG = /^(방문|쇼룸|visit|showroom)(?:$|[:_\s-])/i
const VISIT_TITLE = /방문|쇼룸|현장\s*(미팅|상담)|\b(?:visit|showroom)\b/i

/** 회의록은 모두 실제 방문으로 간주하지 않는다. 명시적으로 남긴 제목·태그만 방문 필터에 넣는다. */
export function isCustomerVisit(event: Pick<CrmCustomerEventRecord, "title" | "tags" | "meetingPurpose">): boolean {
  return VISIT_TITLE.test(event.title) || VISIT_TITLE.test(event.meetingPurpose ?? "") || event.tags.some(tag => VISIT_TAG.test(tag))
}

export function isCompassVisit(entry: CompassTimelineEntry): boolean {
  return entry.kind === "meeting" || (entry.kind === "action" && VISIT_TITLE.test(entry.body ?? ""))
}

/** 미확인 날짜는 마지막에, 동시각은 결정적인 id 순으로 둔다. */
export function compareCustomerHistory(a: { at: string | null; id: string }, b: { at: string | null; id: string }): number {
  const time = (at: string | null) => { const value = Date.parse(at ?? ""); return Number.isFinite(value) ? value : -Infinity }
  const aTime = time(a.at)
  const bTime = time(b.at)
  return aTime === bTime ? a.id.localeCompare(b.id) : aTime > bTime ? -1 : 1
}
