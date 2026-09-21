// lib/marketing/verdict.ts
// 한눈에 층 판정 밴드의 상태 점 규칙 — 순수 함수(테스트 대상).
//
// 기획(docs/active/marketing-tab-dashboard-restructure-2026-09-14.md §6-7):
//   이상 신호 0 = 정상 / 1건 이상 = 주의 / "리드→컨택 0" 또는 CPL 급등 = 경고.
// 임계값은 lib/marketing/anomaly.ts 의 감지 결과(kind·severity)를 그대로 쓴다 — 여기서
// 숫자를 다시 판정하지 않는다(같은 이상을 두 곳에서 다르게 세지 않기 위함).
//
// 정직 규칙: 측정이 안 된 화면(스냅샷 미적재·리드 조회 실패)은 "정상"이 아니라 "미측정"이다.
// 데이터가 없다는 사실을 초록 점으로 포장하지 않는다.

export type VerdictStatus = "ok" | "caution" | "warning" | "unmeasured"

export interface VerdictInput {
  anomalies: ReadonlyArray<{ kind: string; severity?: "warn" | "high" }>
  /** perf.funnel — 광고 리드가 있는데 컨택이 0이면 후속 손길이 전혀 없다는 뜻. */
  funnel: { adLeads: number; contacted: number }
  /** 광고비(스냅샷)와 리드 축 중 하나라도 실측됐는가. 둘 다 아니면 판단 자체가 불가하다. */
  measured: boolean
}

export const VERDICT_STATUS_LABEL: Record<VerdictStatus, string> = {
  ok: "정상",
  caution: "주의",
  warning: "경고",
  unmeasured: "미측정",
}

export function resolveVerdictStatus({ anomalies, funnel, measured }: VerdictInput): VerdictStatus {
  if (!measured) return "unmeasured"
  const noContactYet = funnel.adLeads > 0 && funnel.contacted === 0
  const severe = anomalies.some((flag) => flag.kind === "cpl_spike" || flag.severity === "high")
  if (noContactYet || severe) return "warning"
  if (anomalies.length > 0) return "caution"
  return "ok"
}

/** 상태 점 옆 한 줄 — "주의 · 이상 신호 2건" 처럼 왜 그 색인지 숫자로 말한다. */
export function describeVerdictStatus(status: VerdictStatus, anomalyCount: number, noContactYet: boolean): string {
  if (status === "unmeasured") return "미측정 · 소스 연결 확인"
  if (status === "ok") return "정상 · 이상 신호 없음"
  const parts: string[] = []
  if (anomalyCount > 0) parts.push(`이상 신호 ${anomalyCount}건`)
  if (noContactYet) parts.push("광고 리드 전원 미컨택")
  return `${VERDICT_STATUS_LABEL[status]} · ${parts.join(" · ")}`
}
