export type CoverageTone = "ok" | "warn" | "risk"

// 스파인 커버리지% → 신호 톤. 임계는 NeoCrmKpis의 attainment 임계(0.7)와 정렬.
export function coverageTone(pct: number): CoverageTone {
  if (pct >= 70) return "ok"
  if (pct >= 40) return "warn"
  return "risk"
}

// 우리 팔레트 리터럴만 사용: green / amber-700 / terracotta. 신규 hue 없음.
export const COVERAGE_TONE_CLASS: Record<CoverageTone, string> = {
  ok: "text-[#084734]",
  warn: "text-[#8D6C1F]",
  risk: "text-[#B85C33]",
}
