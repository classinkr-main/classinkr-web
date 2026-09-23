// lib/marketing/source-fold.ts
// 소스 그룹 접기 — 한눈에 층(히어로 리드 타일의 분해 바·추이 스택)이 공유하는 순수 규칙.
//
// 소스 그룹은 7개(lib/crm/lead-attribution SOURCE_GROUP_ORDER)인데 한 차트에 7색을 세우면
// 인접 색이 구분되지 않는다(dataviz 팔레트 검증: 7색 세트는 인접 ΔE 미달). 기간 합계가 큰
// 상위 N개만 자기 색을 갖고, 나머지는 "그 외" 하나로 접는다. 접힌 그룹의 이름은 범례에
// 병기해 무엇이 합쳐졌는지 밝힌다(합계는 덧셈이라 정직 규칙 위반 없음).
//
// "그 외" 색은 SOURCE_GROUP_DOT 의 수기·기타(#888780)를 쓰지 않는다 — 자료실 앰버와 인접
// ΔE 12.2 로 구분이 안 된다. 밝은 웜 그레이 #B5B1AA(ΔE 18.4)를 쓰고, 목록의 색점은 그대로 둔다.

import {
  SOURCE_GROUP_DOT,
  SOURCE_GROUP_LABEL,
  SOURCE_GROUP_ORDER,
  type LeadSourceGroup,
} from "@/lib/crm/lead-attribution"
import type { LeadDailyBySourcePoint } from "@/lib/marketing/perf"

export const SOURCE_FOLD_OTHER_KEY = "other" as const
export const SOURCE_FOLD_OTHER_COLOR = "#B5B1AA"
export const SOURCE_FOLD_KEEP = 4

export interface FoldedSourceSeries {
  /** 그룹 키 또는 "other". */
  key: LeadSourceGroup | typeof SOURCE_FOLD_OTHER_KEY
  label: string
  color: string
  total: number
  /** other 일 때만 — 접힌 원 그룹들(표시 순서 = SOURCE_GROUP_ORDER). */
  members: LeadSourceGroup[]
}

export interface FoldedSources {
  /** 표시 순서 = 기간 합계 내림차순, "그 외"는 항상 마지막. 합계 0 인 그룹은 뺀다. */
  series: FoldedSourceSeries[]
  total: number
  /** 원 그룹 → 표시 시리즈 키. 접힌 그룹은 "other". */
  keyOf: Record<LeadSourceGroup, LeadSourceGroup | typeof SOURCE_FOLD_OTHER_KEY>
}

/** 기간 행 전체에서 그룹별 합계를 세고 상위 keep 개만 남긴다. */
export function foldSourceGroups(
  rows: readonly LeadDailyBySourcePoint[],
  keep: number = SOURCE_FOLD_KEEP
): FoldedSources {
  const totals = new Map<LeadSourceGroup, number>()
  for (const group of SOURCE_GROUP_ORDER) totals.set(group, 0)
  for (const row of rows) {
    for (const group of SOURCE_GROUP_ORDER) {
      const value = row[group]
      if (typeof value === "number" && value > 0) totals.set(group, (totals.get(group) ?? 0) + value)
    }
  }

  const present = SOURCE_GROUP_ORDER.filter((group) => (totals.get(group) ?? 0) > 0)
  // 합계 내림차순, 동률이면 선언 순서 유지(안정 정렬).
  const ranked = [...present].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
  // 접어서 "그 외 1개"가 되는 것은 접지 않는 것보다 나쁘다 — 남는 게 하나뿐이면 그냥 둔다.
  const kept = ranked.length > keep + 1 ? ranked.slice(0, keep) : ranked
  const folded = ranked.filter((group) => !kept.includes(group))

  const keyOf = Object.fromEntries(
    SOURCE_GROUP_ORDER.map((group) => [group, folded.includes(group) ? SOURCE_FOLD_OTHER_KEY : group])
  ) as FoldedSources["keyOf"]

  const series: FoldedSourceSeries[] = kept.map((group) => ({
    key: group,
    label: SOURCE_GROUP_LABEL[group],
    color: SOURCE_GROUP_DOT[group],
    total: totals.get(group) ?? 0,
    members: [],
  }))
  if (folded.length > 0) {
    const members = SOURCE_GROUP_ORDER.filter((group) => folded.includes(group))
    series.push({
      key: SOURCE_FOLD_OTHER_KEY,
      label: "그 외",
      color: SOURCE_FOLD_OTHER_COLOR,
      total: members.reduce((sum, group) => sum + (totals.get(group) ?? 0), 0),
      members,
    })
  }

  return {
    series,
    total: series.reduce((sum, item) => sum + item.total, 0),
    keyOf,
  }
}

/** 한 날짜 행을 접힌 시리즈 키로 다시 합친다 — 차트 데이터 행(Recharts) 생성용. */
export function foldSourceRow(
  row: LeadDailyBySourcePoint | undefined,
  fold: FoldedSources
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of fold.series) out[item.key] = 0
  if (!row) return out
  for (const group of SOURCE_GROUP_ORDER) {
    const value = row[group]
    if (typeof value !== "number" || value <= 0) continue
    const key = fold.keyOf[group]
    out[key] = (out[key] ?? 0) + value
  }
  return out
}
