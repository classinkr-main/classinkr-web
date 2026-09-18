/**
 * 고객 360 "주문 타임라인" 순수 조립기 (기획안 §11.1 M3).
 *
 * NEO 오더($) · NEO 수금(¥) · 자체 딜(₩) 세 원천을 한 축에 놓고 occurredAt 내림차순으로 정렬한다.
 * 각 항목은 자기 통화를 끝까지 들고 다니며, 이 모듈은 통화가 다른 amount 를 절대 더하지 않는다
 * (₩/$/¥ 합산 금지 — CRM 돈흐름 정책). 합계가 필요하면 소비처가 통화별로 따로 센다.
 *
 * 클라이언트 컴포넌트에서 import 하므로 server-only 의존성을 두지 않는다(타입 import 만).
 */

import type { NeoCrmCustomerMoneyItem } from "@/lib/admin-crm-customers-neo"
import type { CrmDealRecord } from "@/lib/repositories/crm-deals"
import type { CrmCurrency } from "@/lib/crm/money-format"
import type { StatusTone } from "@/lib/crm/status-tone"

export type MoneyTimelineKind = "order" | "collection" | "deal"

export interface MoneyTimelineEntry {
  id: string
  kind: MoneyTimelineKind
  currency: CrmCurrency
  title: string
  amount: number | null
  occurredAt: string | null
  status: string | null
  ownerName?: string
  /** 출처 칩 문구("NEO 오더" · "NEO 수금" · "딜(₩)"). */
  sourceLabel: string
  /** 상태 칩 톤. 의미가 확실할 때만(완료→ok, 실패·취소→danger) 신호색을 쓰고 나머지는 null(중립). */
  statusTone: StatusTone | null
}

/** 딜은 CrmDealRecord 전체가 아니라 타임라인에 필요한 필드만 받는다(테스트·소비처 부담 최소화). */
export type MoneyTimelineDealInput = Pick<
  CrmDealRecord,
  "id" | "title" | "expectedAmount" | "expectedCloseAt" | "closedAt" | "createdAt" | "status" | "ownerNameSnapshot"
>

export interface BuildMoneyTimelineInput {
  orders?: NeoCrmCustomerMoneyItem[] | null
  collections?: NeoCrmCustomerMoneyItem[] | null
  deals?: MoneyTimelineDealInput[] | null
}

/** kind 별 텍스트 라벨·출처 칩·통화 SSOT. 아이콘만으로 구분하지 않도록 라벨을 항상 함께 그린다. */
export const MONEY_TIMELINE_KIND_META: Record<
  MoneyTimelineKind,
  { label: string; sourceLabel: string; currency: CrmCurrency }
> = {
  order: { label: "오더", sourceLabel: "NEO 오더", currency: "USD" },
  collection: { label: "수금", sourceLabel: "NEO 수금", currency: "CNY" },
  deal: { label: "딜", sourceLabel: "딜(₩)", currency: "KRW" },
}

/** 자체 딜 상태(open/won/lost) 한글 라벨. */
export const MONEY_TIMELINE_DEAL_STATUS_LABEL: Record<string, string> = {
  open: "진행",
  won: "완료",
  lost: "실패",
}

/**
 * 상태 문자열 → 톤. 딜은 enum 이라 정확히 매핑하고, NEO 상태는 자유 문자열이라
 * 완료·실패가 분명한 어휘만 잡고 나머지는 중립(null)으로 둔다(신호색은 의미가 있을 때만).
 */
export function resolveMoneyStatusTone(kind: MoneyTimelineKind, status: string | null | undefined): StatusTone | null {
  const raw = (status ?? "").trim()
  if (!raw) return null
  if (kind === "deal") {
    if (raw === "won") return "ok"
    if (raw === "lost") return "danger"
    return null
  }
  if (/취소|실패|cancel|lost|失败|作废|无效/i.test(raw)) return "danger"
  if (/완료|closed\s*won|paid|done|完成|已收|已付|已成交/i.test(raw)) return "ok"
  return null
}

/** 표시용 상태 라벨. 딜은 한글 매핑, NEO 는 원문 그대로. */
export function moneyTimelineStatusLabel(entry: Pick<MoneyTimelineEntry, "kind" | "status">): string | null {
  if (!entry.status) return null
  if (entry.kind === "deal") return MONEY_TIMELINE_DEAL_STATUS_LABEL[entry.status] ?? entry.status
  return entry.status
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function fromNeoItem(kind: "order" | "collection", item: NeoCrmCustomerMoneyItem): MoneyTimelineEntry {
  const meta = MONEY_TIMELINE_KIND_META[kind]
  const ownerName = item.ownerName?.trim()
  return {
    id: `${kind}:${item.id}`,
    kind,
    currency: meta.currency,
    title: item.title?.trim() || "제목 없음",
    amount: item.amount != null && Number.isFinite(item.amount) ? item.amount : null,
    occurredAt: item.occurredAt ?? null,
    status: item.status ?? null,
    ownerName: ownerName ? ownerName : undefined,
    sourceLabel: meta.sourceLabel,
    statusTone: resolveMoneyStatusTone(kind, item.status),
  }
}

/** 딜의 기준 시각: 종료됐으면 종료일, 아니면 예상 마감일, 그것도 없으면 생성일. */
export function dealOccurredAt(deal: MoneyTimelineDealInput): string | null {
  return deal.closedAt ?? deal.expectedCloseAt ?? deal.createdAt ?? null
}

function fromDeal(deal: MoneyTimelineDealInput): MoneyTimelineEntry {
  const meta = MONEY_TIMELINE_KIND_META.deal
  const ownerName = deal.ownerNameSnapshot?.trim()
  return {
    id: `deal:${deal.id}`,
    kind: "deal",
    currency: meta.currency,
    title: deal.title?.trim() || "제목 없음",
    amount: deal.expectedAmount != null && Number.isFinite(deal.expectedAmount) ? deal.expectedAmount : null,
    occurredAt: dealOccurredAt(deal),
    status: deal.status ?? null,
    ownerName: ownerName ? ownerName : undefined,
    sourceLabel: meta.sourceLabel,
    statusTone: resolveMoneyStatusTone("deal", deal.status),
  }
}

/**
 * 세 원천을 병합해 occurredAt 내림차순(최신 먼저)으로 돌려준다.
 * 날짜가 없거나 파싱에 실패한 항목은 맨 뒤로 보내되 입력 순서를 유지한다(안정 정렬).
 */
export function buildMoneyTimeline(input: BuildMoneyTimelineInput): MoneyTimelineEntry[] {
  const entries: MoneyTimelineEntry[] = [
    ...(input.orders ?? []).map((item) => fromNeoItem("order", item)),
    ...(input.collections ?? []).map((item) => fromNeoItem("collection", item)),
    ...(input.deals ?? []).map(fromDeal),
  ]
  const keyed = entries.map((entry, index) => ({ entry, index, time: parseTime(entry.occurredAt) }))
  keyed.sort((a, b) => {
    if (a.time == null && b.time == null) return a.index - b.index
    if (a.time == null) return 1
    if (b.time == null) return -1
    if (b.time !== a.time) return b.time - a.time
    return a.index - b.index
  })
  return keyed.map((row) => row.entry)
}

export interface MoneyTimelineMonthGroup {
  /** "2026-09" 또는 날짜 미확인 그룹의 "unknown". */
  key: string
  /** "2026년 9월" · 날짜 미확인은 "날짜 미확인". */
  label: string
  entries: MoneyTimelineEntry[]
}

export const MONEY_TIMELINE_UNKNOWN_MONTH_KEY = "unknown"

/**
 * 정렬된 타임라인을 월 단위로 묶는다(입력 순서 보존). 날짜 미확인 항목은 마지막 그룹 하나로 모은다.
 * 월 경계는 브라우저 로컬 시간 기준 — formatDay 와 같은 기준이라 행 날짜와 헤더가 어긋나지 않는다.
 */
export function groupMoneyTimelineByMonth(entries: MoneyTimelineEntry[]): MoneyTimelineMonthGroup[] {
  const groups: MoneyTimelineMonthGroup[] = []
  const byKey = new Map<string, MoneyTimelineMonthGroup>()
  let unknown: MoneyTimelineMonthGroup | null = null
  for (const entry of entries) {
    const time = parseTime(entry.occurredAt)
    if (time == null) {
      if (!unknown) unknown = { key: MONEY_TIMELINE_UNKNOWN_MONTH_KEY, label: "날짜 미확인", entries: [] }
      unknown.entries.push(entry)
      continue
    }
    const date = new Date(time)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, "0")}`
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: `${year}년 ${month}월`, entries: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  if (unknown) groups.push(unknown)
  return groups
}
