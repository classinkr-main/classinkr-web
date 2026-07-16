// 운영 데스크(CS 코파일럿 · 운영 도구 탭)의 순수 로직.
// 스탯 스트립 집계와 회귀 판정 메타를 UI에서 분리해 노드 환경 테스트로 계약을 고정한다.

export interface DocsGapsDeskSummary {
  chatbot: number
  internalCs: number
  internalCsFallback: number
  internalCsReview: number
  zeroResult: number
  capped: boolean
}

interface DocsGapsBacklogLike {
  gapClusters?: Array<{ metadata?: { source?: string } | null } | null> | null
  zeroResultSearches?: unknown[] | null
}

// GET /api/admin/docs/gaps 는 최대 30개 클러스터를 돌려준다 — 그 이상은 "30+"로 표기한다.
const DOCS_GAPS_FETCH_CAP = 30

export function summarizeDocsGaps(backlog: DocsGapsBacklogLike): DocsGapsDeskSummary {
  const clusters = Array.isArray(backlog.gapClusters) ? backlog.gapClusters : []
  let internalCsFallback = 0
  let internalCsReview = 0

  for (const cluster of clusters) {
    const source = cluster?.metadata?.source
    if (source === "internal_cs_fallback") internalCsFallback += 1
    else if (source === "internal_cs_review") internalCsReview += 1
  }

  const internalCs = internalCsFallback + internalCsReview
  return {
    // source 미기록(레거시) 클러스터는 공개 챗봇 유입으로 집계한다.
    chatbot: clusters.length - internalCs,
    internalCs,
    internalCsFallback,
    internalCsReview,
    zeroResult: Array.isArray(backlog.zeroResultSearches) ? backlog.zeroResultSearches.length : 0,
    capped: clusters.length >= DOCS_GAPS_FETCH_CAP,
  }
}

export type RegressionJudgeValue = "pass" | "needs_fix" | "promoted" | "excluded"

// DESIGN.md — 행 내 빠른 액션은 기본 중립, hover에서만 의도색을 드러낸다.
export const REGRESSION_JUDGE_ACTIONS: Array<{
  value: RegressionJudgeValue
  label: string
  hoverClassName: string
}> = [
  { value: "pass", label: "통과", hoverClassName: "hover:bg-[#ECFDF5] hover:text-[#084734]" },
  { value: "needs_fix", label: "수정 필요", hoverClassName: "hover:bg-[#FBF1E0] hover:text-[#7A520F]" },
  { value: "promoted", label: "반영됨", hoverClassName: "hover:bg-[#084734] hover:text-white" },
  { value: "excluded", label: "제외", hoverClassName: "hover:bg-[#F6F5F4] hover:text-[#615D59]" },
]

// 판정 완료 행의 결과 칩 — 미판정(not_evaluated)은 칩 대신 판정 세그먼트를 보여준다.
const REGRESSION_OUTCOME_CHIPS: Record<RegressionJudgeValue, { label: string; className: string }> = {
  pass: { label: "통과", className: "bg-[#ECFDF5] text-[#084734]" },
  needs_fix: { label: "수정 필요", className: "bg-[#FBF1E0] text-[#7A520F]" },
  promoted: { label: "반영됨", className: "bg-[#ECFDF5] text-[#084734]" },
  excluded: { label: "제외", className: "bg-[#F6F5F4] text-[#615D59]" },
}

export function regressionOutcomeChip(outcome: string) {
  if (outcome === "pass" || outcome === "needs_fix" || outcome === "promoted" || outcome === "excluded") {
    return REGRESSION_OUTCOME_CHIPS[outcome]
  }
  return null
}
