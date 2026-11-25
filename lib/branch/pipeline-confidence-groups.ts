// KR Team 파이프라인 확도 묶음 — 칸반 열과 '이번에 닫을 것 / 확도를 올릴 것' 목록이 같은 분류·합산을
// 쓰도록 한 곳에 둔다. 분류는 월별 납부액을 rev-confirmed 캐논(revenue-core.ledgerMonthSplit)으로
// 확정/고확도/예정 3분해한 뒤 가장 큰 버킷을 고른다. 색 데이터가 전혀 없는 딜은 "미분류"로 남긴다 —
// 존재하지 않는 확률·단계를 만들지 않는다. 계산 캐논은 소비만 하고 바꾸지 않는다.
import type { ConfidenceKey } from "./confidence-tokens"
import { ledgerMonthSplit, type LedgerConfidenceSource } from "./computations/revenue-core"

export type PipelineConfidenceGroupKey = ConfidenceKey | "unclassified"

export const PIPELINE_CONFIDENCE_GROUP_ORDER: readonly PipelineConfidenceGroupKey[] = [
  "confirmed",
  "high-confidence",
  "expected",
  "unclassified",
]

export interface PipelineGroupableRow extends LedgerConfidenceSource {
  customer: string
  revenue: number
  monthlyPayments?: Record<string, number>
}

export type MergedPipelineRow<T extends PipelineGroupableRow> = T & {
  /** 같은 열 안에서 이 고객으로 합친 딜 수. */
  count: number
}

export type PipelineSortValue = "revenue-desc" | "revenue-asc" | "customer-asc" | "customer-desc"

/** 딜 하나를 가장 큰 확도 버킷으로 분류한다. 월별 데이터가 없거나 3분해가 모두 0이면 미분류. */
export function pipelineConfidenceGroup(row: PipelineGroupableRow): PipelineConfidenceGroupKey {
  const entries = Object.entries(row.monthlyPayments ?? {})
  if (entries.length === 0) return "unclassified"
  let confirmed = 0
  let highConfidence = 0
  let expected = 0
  for (const [ym, raw] of entries) {
    const total = Number(raw)
    if (total === 0) continue
    const split = ledgerMonthSplit(row, ym, total)
    confirmed += split.confirmed
    highConfidence += split.highConfidence
    expected += split.expected
  }
  if (confirmed === 0 && highConfidence === 0 && expected === 0) return "unclassified"
  if (confirmed >= highConfidence && confirmed >= expected) return "confirmed"
  if (highConfidence >= expected) return "high-confidence"
  return "expected"
}

/**
 * 행을 확도 열로 나누고, 열 안에서 같은 고객(대소문자·앞뒤 공백 무시)을 한 카드로 합친 뒤 정렬한다.
 * 열 합계는 합친 카드의 매출 합 = 원래 행 매출 합이다. 동률은 고객명으로 끊는다.
 */
export function groupPipelineByConfidence<T extends PipelineGroupableRow>(
  rows: readonly T[],
  sort: PipelineSortValue = "revenue-desc",
): Record<PipelineConfidenceGroupKey, MergedPipelineRow<T>[]> {
  const byGroup: Record<PipelineConfidenceGroupKey, T[]> = {
    confirmed: [],
    "high-confidence": [],
    expected: [],
    unclassified: [],
  }
  for (const row of rows) byGroup[pipelineConfidenceGroup(row)].push(row)

  const [field, dir] = sort.split("-") as ["revenue" | "customer", "asc" | "desc"]
  const out = {} as Record<PipelineConfidenceGroupKey, MergedPipelineRow<T>[]>
  for (const key of PIPELINE_CONFIDENCE_GROUP_ORDER) {
    const merged = new Map<string, MergedPipelineRow<T>>()
    for (const row of byGroup[key]) {
      const mergeKey = row.customer.trim().toLowerCase()
      const existing = merged.get(mergeKey)
      if (existing) {
        existing.revenue += row.revenue
        existing.count += 1
      } else {
        merged.set(mergeKey, { ...row, count: 1 })
      }
    }
    out[key] = Array.from(merged.values()).sort((a, b) => {
      const primary = field === "revenue"
        ? (dir === "desc" ? b.revenue - a.revenue : a.revenue - b.revenue)
        : (dir === "desc" ? b.customer.localeCompare(a.customer, "ko") : a.customer.localeCompare(b.customer, "ko"))
      return primary !== 0 ? primary : a.customer.localeCompare(b.customer, "ko")
    })
  }
  return out
}

/** 열별 매출 합. 미분류는 금액이 없을 수 있지만 원값을 그대로 더한다(0으로 덮지 않음). */
export function pipelineGroupTotals<T extends PipelineGroupableRow>(
  groups: Record<PipelineConfidenceGroupKey, MergedPipelineRow<T>[]>,
): Record<PipelineConfidenceGroupKey, number> {
  const totals = { confirmed: 0, "high-confidence": 0, expected: 0, unclassified: 0 } as Record<PipelineConfidenceGroupKey, number>
  for (const key of PIPELINE_CONFIDENCE_GROUP_ORDER) totals[key] = groups[key].reduce((sum, row) => sum + row.revenue, 0)
  return totals
}
