// lib/marketing/anomaly.ts
// 이상 감지는 순수 규칙(테스트 대상) — LLM 은 이 결과에 해설·우선순위만 붙인다(감지 아님).
//
// ── 정직 규칙 ─────────────────────────────────────────────────
// 모든 규칙은 "비교 가능한 두 값이 실제로 있을 때만" 발화한다. 미측정(null)·분모 0 은
// 이상 없음이 아니라 "판단 불가"이므로 플래그를 만들지 않는다 — 없는 신호를 지어내지 않는다.
// 통화 혼합 비교도 하지 않는다(CPL 은 같은 축의 7일 vs 30일 자기 비교만).

export type AnomalyKind = "cpl_spike" | "ctr_drop" | "pacing_over" | "leads_drop"

export interface AnomalyFlag {
  kind: AnomalyKind
  campaignId: string | null
  campaignName: string | null
  severity: "warn" | "high"
  detail: string
  metric: { current: number; baseline: number }
}

export const ANOMALY_THRESHOLDS = {
  cplSpikeRatio: 1.5, // 7일 CPL > 30일 CPL × 1.5
  cplMinLeads7d: 5, // CPL 급등 최소 표본(7일 리드)
  ctrDropRatio: 0.6, // 7일 CTR < 30일 CTR × 0.6
  pacingOverGapPp: 10, // 집행률 − 경과율 > 10%p
  leadsDropRatio: 0.6, // 최근 7일 리드 < 직전 7일 × 0.6
} as const

/** 배지·브리핑 공용 한글 라벨 — 표시 레이어가 kind 를 문자열로 재매핑하지 않게 하는 단일 정의. */
export const ANOMALY_KIND_LABEL: Record<AnomalyKind, string> = {
  cpl_spike: "CPL 급등",
  ctr_drop: "CTR 급락",
  pacing_over: "페이싱 초과",
  leads_drop: "리드 급감",
}

export interface AnomalyCampaignInput {
  id: string | null
  name: string
  cpl7d: number | null
  cpl30d: number | null
  leads7d: number
  leadsPrev7d: number
  ctr7d: number | null
  ctr30d: number | null
  executionPct: number | null
  elapsedPct: number | null
}

export function detectAnomalies(input: { campaigns: AnomalyCampaignInput[] }): AnomalyFlag[] {
  const flags: AnomalyFlag[] = []
  const T = ANOMALY_THRESHOLDS

  for (const c of input.campaigns) {
    if (
      c.cpl7d != null &&
      c.cpl30d != null &&
      c.cpl30d > 0 &&
      c.leads7d >= T.cplMinLeads7d &&
      c.cpl7d > c.cpl30d * T.cplSpikeRatio
    ) {
      flags.push({
        kind: "cpl_spike",
        campaignId: c.id,
        campaignName: c.name,
        severity: c.cpl7d > c.cpl30d * 2 ? "high" : "warn",
        detail: `7일 CPL이 30일 평균의 ${Math.round((c.cpl7d / c.cpl30d) * 10) / 10}배`,
        metric: { current: c.cpl7d, baseline: c.cpl30d },
      })
    }
    if (c.ctr7d != null && c.ctr30d != null && c.ctr30d > 0 && c.ctr7d < c.ctr30d * T.ctrDropRatio) {
      flags.push({
        kind: "ctr_drop",
        campaignId: c.id,
        campaignName: c.name,
        severity: "warn",
        detail: `7일 CTR이 30일 평균의 ${Math.round((c.ctr7d / c.ctr30d) * 100)}%`,
        metric: { current: c.ctr7d, baseline: c.ctr30d },
      })
    }
    if (
      c.executionPct != null &&
      c.elapsedPct != null &&
      c.executionPct - c.elapsedPct > T.pacingOverGapPp
    ) {
      flags.push({
        kind: "pacing_over",
        campaignId: c.id,
        campaignName: c.name,
        severity: c.executionPct - c.elapsedPct > T.pacingOverGapPp * 2 ? "high" : "warn",
        detail: `집행 ${c.executionPct}% vs 기간 경과 ${c.elapsedPct}%`,
        metric: { current: c.executionPct, baseline: c.elapsedPct },
      })
    }
    if (c.leadsPrev7d > 0 && c.leads7d < c.leadsPrev7d * T.leadsDropRatio) {
      flags.push({
        kind: "leads_drop",
        campaignId: c.id,
        campaignName: c.name,
        severity: "warn",
        detail: `최근 7일 리드 ${c.leads7d}건 (직전 7일 ${c.leadsPrev7d}건)`,
        metric: { current: c.leads7d, baseline: c.leadsPrev7d },
      })
    }
  }
  return flags
}
