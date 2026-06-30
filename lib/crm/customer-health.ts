// 고객 건강도 — 규칙 기반 단일 점수(0~100)의 SSOT. AI/LLM 아님.
// 레퍼런스 프로토타입의 "건강도 NN · 위험"을 실데이터 신호로 재현하기 위한 명시적 산식.
// 분모·임계값을 여기 한곳에 고정해, 임의 더미 %가 아니라 재현 가능한 점수를 만든다.
//
// 입력 신호(모두 선택적 — 없으면 감점 0):
//   - riskSeverity: Customer360 리스크 등급(연체/이탈 신호 합성치)
//   - serviceLevel: NEO 서비스(계약) 위험 등급
//   - hasOutstanding: 미수/잔액 보유 여부(CNY 잔액 > 0)
//   - daysToExpire: 최근접 계약 만료까지 일수(임박할수록 감점)
//   - lastContactDays: 최근 접촉 후 경과일(오래될수록 감점)
//
// 임계값(고정): 75 이상 안전 · 55 이상 주의 · 그 미만 위험. (드로어 healthMeta·문서 §1 DISCARD와 동일 기준.)

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
    else if (input.daysToExpire <= 30) score -= 12
  }

  if (input.lastContactDays != null && Number.isFinite(input.lastContactDays)) {
    if (input.lastContactDays >= 21) score -= 15
    else if (input.lastContactDays >= 14) score -= 8
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const band = healthBand(clamped)
  return { score: clamped, band, label: BAND_LABEL[band] }
}

// 건강도 밴드별 표기 색(DESIGN 팔레트). 드로어/도넛 공용.
export const HEALTH_BAND_STYLE: Record<CustomerHealthBand, { fc: string; bg: string; bd: string }> = {
  safe: { fc: "#084734", bg: "#ECFDF5", bd: "#D7EBDD" },
  watch: { fc: "#7A520F", bg: "#FBF1E0", bd: "#ECD29C" },
  risk: { fc: "#B85C33", bg: "#FEF3EE", bd: "#F6D5C5" },
}
