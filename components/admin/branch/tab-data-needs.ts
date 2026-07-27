export type BranchTab = "overview" | "pipeline" | "heatmap" | "ai"

export interface BranchTabDataNeeds {
  kpi: boolean
}

const DATA_NEEDS: Record<BranchTab, BranchTabDataNeeds> = {
  overview: { kpi: true },
  pipeline: { kpi: true },
  heatmap: { kpi: false },
  ai: { kpi: false },
}

/**
 * KR Team 탭별 데이터 수요의 단일 기준.
 *
 * summary는 상단 SyncStatusBar가 모든 탭에서 소비하므로 공통으로 유지한다.
 * KPI는 개요·파이프라인에서만 쓰므로 히트맵·AI 진입 시 요청하지 않는다.
 */
export function getBranchTabDataNeeds(tab: BranchTab): BranchTabDataNeeds {
  return DATA_NEEDS[tab]
}
