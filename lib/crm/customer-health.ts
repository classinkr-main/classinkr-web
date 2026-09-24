// 고객 건강도 — 규칙 기반 단일 점수(0~100)의 SSOT. AI/LLM 아님.
// 레퍼런스 프로토타입의 "건강도 NN · 위험"을 실데이터 신호로 재현하기 위한 명시적 산식.
// 분모·임계값을 여기 한곳에 고정해, 임의 더미 %가 아니라 재현 가능한 점수를 만든다.
//
// 입력 신호(모두 선택적 — 없으면 감점 0):
//   - riskSeverity: Customer360 리스크 등급(연체/이탈 신호 합성치)
//   - serviceLevel: NEO 서비스(계약) 위험 등급
//   - hasOutstanding: 확정된 미수(받을 돈) 보유 여부. NEO money.totalBalance는 선불 '충전 잔액'이라
//     미수의 근거가 아니다(lib/crm/service-risk.ts는 같은 값의 소진(<=0)을 위험으로 본다) —
//     같은 통화의 미수 원천이 360 페이로드에 없으므로 드로어는 null을 넘긴다(c360-04).
//   - daysToExpire: 최근접 계약 만료까지 일수(임박할수록 감점)
//   - lastContactDays: 최근 접촉 후 경과일(오래될수록 감점)
//
// 임계값(고정): 75 이상 안전 · 55 이상 주의 · 그 미만 위험. (드로어 healthMeta·문서 §1 DISCARD와 동일 기준.)

import { STATUS_TONE } from "@/lib/crm/status-tone"
import { EXPIRING_SOON_DAYS, daysSinceIso, daysUntilIso } from "@/lib/crm/customer-segment-spec"

export type CustomerHealthBand = "safe" | "watch" | "risk"

export interface CustomerHealthInput {
  riskSeverity?: "critical" | "high" | "medium" | "low" | null
  serviceLevel?: "urgent" | "soon" | "watch" | "normal" | null
  hasOutstanding?: boolean | null
  daysToExpire?: number | null
  lastContactDays?: number | null
}

export interface CustomerHealth {
  score: number
  band: CustomerHealthBand
  label: string
}

const BAND_LABEL: Record<CustomerHealthBand, string> = {
  safe: "안전",
  watch: "주의",
  risk: "위험",
}

export function healthBand(score: number): CustomerHealthBand {
  if (score >= 75) return "safe"
  if (score >= 55) return "watch"
  return "risk"
}

export function computeCustomerHealth(input: CustomerHealthInput): CustomerHealth {
  let score = 100

  switch (input.riskSeverity) {
    case "critical":
      score -= 45
      break
    case "high":
      score -= 30
      break
    case "medium":
      score -= 12
      break
    default:
      break
  }

  switch (input.serviceLevel) {
    case "urgent":
      score -= 35
      break
    case "soon":
      score -= 20
      break
    case "watch":
      score -= 8
      break
    default:
      break
  }

  if (input.hasOutstanding) score -= 12

  if (input.daysToExpire != null && Number.isFinite(input.daysToExpire)) {
    if (input.daysToExpire <= 7) score -= 25
    else if (input.daysToExpire <= EXPIRING_SOON_DAYS) score -= 12
  }

  if (input.lastContactDays != null && Number.isFinite(input.lastContactDays)) {
    if (input.lastContactDays >= 21) score -= 15
    else if (input.lastContactDays >= 14) score -= 8
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const band = healthBand(clamped)
  return { score: clamped, band, label: BAND_LABEL[band] }
}

/** 우선순위 점수 → 리스크 등급(통합 목록 severity 와 같은 임계: 85/68/42). */
export function severityFromPriorityScore(score: number): NonNullable<CustomerHealthInput["riskSeverity"]> {
  return score >= 85 ? "critical" : score >= 68 ? "high" : score >= 42 ? "medium" : "low"
}

/** 통합 목록 행에서 건강도 입력에 쓰는 필드만. */
export interface UnifiedRowHealthSignals {
  score: number
  lifecycle: string
  expireAt: string | null
  /** NEO 스냅샷 서비스 위험 등급 — 있으면 라이프사이클 근사보다 우선한다. */
  riskLevel?: "urgent" | "soon" | "watch" | "normal" | null
  /** 마지막 연락(Home 기록·Compass 활동). 기록 없음(null)은 감점하지 않는다 — 모름은 오래됨이 아니다. */
  lastContactAt?: string | null
}

/**
 * 통합 목록(neo_account) 행 → 건강도 입력(F3).
 *  - 서비스 위험은 스냅샷 riskLevel 우선, 없을 때만 라이프사이클(account_risk → soon)로 근사한다.
 *  - NEO 잔액은 선불 충전 잔액이라 미수가 아니다 — hasOutstanding 을 걸지 않는다(예전엔 잔액>0 을 미수로 −12).
 *  - 마지막 연락 경과일을 lastContactDays 로 넣는다(예전엔 늘 null).
 */
export function unifiedRowHealthInput(row: UnifiedRowHealthSignals, nowMs: number): CustomerHealthInput {
  const since = daysSinceIso(row.lastContactAt ?? null, nowMs)
  return {
    riskSeverity: severityFromPriorityScore(row.score),
    serviceLevel: row.riskLevel ?? (row.lifecycle === "account_risk" ? "soon" : "normal"),
    hasOutstanding: false,
    daysToExpire: daysUntilIso(row.expireAt, nowMs),
    lastContactDays: since == null ? null : Math.max(0, Math.floor(since)),
  }
}

// 건강도 밴드별 표기 색 — lib/crm/status-tone.ts(DESIGN.md 운영 상태 스케일) 토큰만 쓴다.
// safe→ok · watch→warning · risk→danger. 드로어/도넛 공용(인라인 style용 hex).
export const HEALTH_BAND_STYLE: Record<CustomerHealthBand, { fc: string; bg: string; bd: string }> = {
  safe: { fc: STATUS_TONE.ok.text, bg: STATUS_TONE.ok.bg, bd: STATUS_TONE.ok.border },
  watch: { fc: STATUS_TONE.warning.textStrong, bg: STATUS_TONE.warning.bg, bd: STATUS_TONE.warning.border },
  risk: { fc: STATUS_TONE.danger.text, bg: STATUS_TONE.danger.bg, bd: STATUS_TONE.danger.border },
}
