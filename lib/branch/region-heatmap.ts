import { KOREA_PROVINCE_BY_LABEL } from "@/lib/branch/korea-province-map"
import { normalizeRegionLabel } from "@/lib/regions/korea-regions"

// KR 지역 히트맵의 화면 로직(순서·지도 밖 판정·목표 유무·선택 지역 거르기).
// 합산·확정/추정 계산은 건드리지 않는다 — 입력 행의 값을 그대로 읽기만 한다.

export type RegionMetric = "revenue" | "progress"

/** 지도에 도형이 있는 지역이면 표준 라벨, 아니면 null(온라인·해외 등). */
export function mapLabelOf(region: string | null | undefined): string | null {
  const canonical = normalizeRegionLabel(region)
  return canonical && KOREA_PROVINCE_BY_LABEL.has(canonical) ? canonical : null
}

export function isOffMapRegion(region: string | null | undefined): boolean {
  return mapLabelOf(region) === null
}

/**
 * 선택·거르기에 쓰는 키. 지도 지역은 표준 라벨(경기 ← 수원), 지도 밖 지역은 원문.
 * 비어 있는 지역은 null.
 */
export function regionSelectionKey(region: string | null | undefined): string | null {
  const trimmed = region?.trim()
  if (!trimmed) return null
  return mapLabelOf(trimmed) ?? trimmed
}

export function matchesRegionSelection(region: string | null | undefined, key: string | null): boolean {
  if (key === null) return true
  return regionSelectionKey(region) === key
}

/** 선택 지역으로 행을 거른다. key가 null이면 전체를 그대로 돌려준다(같은 배열). */
export function filterRowsByRegion<T extends { region: string | null }>(rows: T[], key: string | null): T[] {
  if (key === null) return rows
  return rows.filter((row) => matchesRegionSelection(row.region, key))
}

interface RankableRow { region: string; expected: number; progress: number }

/** 지표에 따른 순위. 지도 밖 지역도 같은 목록에 둔다(원본 배열은 바꾸지 않는다). */
export function rankRegions<T extends RankableRow>(rows: T[], metric: RegionMetric): T[] {
  const list = [...rows]
  return metric === "revenue"
    ? list.sort((a, b) => b.expected - a.expected || b.progress - a.progress)
    : list.sort((a, b) => b.progress - a.progress || b.expected - a.expected)
}

export interface RegionGoalCoverage {
  withGoal: number
  total: number
  /** 달성률 보기를 켤 수 있는지. 목표가 있는 지역이 절반 미만이면 꺼 둔다. */
  progressViewUsable: boolean
}

/** 지역 목표(계약가 합)가 있는 행 수와 달성률 보기 사용 가능 여부. */
export function regionGoalCoverage(rows: Array<{ target: number }>): RegionGoalCoverage {
  const total = rows.length
  const withGoal = rows.filter((row) => Number.isFinite(row.target) && row.target > 0).length
  return { withGoal, total, progressViewUsable: total > 0 && withGoal * 2 >= total }
}
