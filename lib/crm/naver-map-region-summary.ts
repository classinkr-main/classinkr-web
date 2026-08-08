import type { NaverMapMatchStatus } from "@/lib/crm/naver-map-source"

export interface NaverMapRegionSummaryRow {
  label: string
  count: number
  linked: number
  prelinked: number
  review: number
  unmatched: number
}

export interface NaverMapCountSummary {
  total: number
  active: number
  stale: number
  linked: number
  prelinked: number
  review: number
  unmatched: number
  regions: NaverMapRegionSummaryRow[]
}

interface NaverMapSummaryInput {
  regionLabel: string
  isStale: boolean
  matchStatus: NaverMapMatchStatus
}

function emptyRegion(label: string): NaverMapRegionSummaryRow {
  return { label, count: 0, linked: 0, prelinked: 0, review: 0, unmatched: 0 }
}

/**
 * 지도 원천 목록의 활성 스냅샷만 지역별로 접는다.
 * CRM 지도 탭과 KR Team 히트맵이 같은 상태 카운트를 소비하도록 단일 계산 경로를 둔다.
 */
export function summarizeNaverMapRows(rows: readonly NaverMapSummaryInput[]): NaverMapCountSummary {
  const activeRows = rows.filter((row) => !row.isStale)
  const regions = new Map<string, NaverMapRegionSummaryRow>()

  for (const row of activeRows) {
    const current = regions.get(row.regionLabel) ?? emptyRegion(row.regionLabel)
    current.count += 1
    current[row.matchStatus] += 1
    regions.set(row.regionLabel, current)
  }

  const countStatus = (status: NaverMapMatchStatus) =>
    activeRows.filter((row) => row.matchStatus === status).length

  return {
    total: rows.length,
    active: activeRows.length,
    stale: rows.length - activeRows.length,
    linked: countStatus("linked"),
    prelinked: countStatus("prelinked"),
    review: countStatus("review"),
    unmatched: countStatus("unmatched"),
    regions: Array.from(regions.values()).sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko")
    ),
  }
}
