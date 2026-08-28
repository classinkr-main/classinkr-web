// 서비스 위험 derivation (culture-fit §6 만료/충전, §10 출처·freshness·confidence).
// 공식 원천은 NEO/HQ. 분모가 불명확한 잔액 비율은 억지로 만들지 않고, 만료일·절대 잔액·
// freshness 중심으로만 위험을 판단한다. 데이터가 없으면 추정값을 확정값처럼 보이지 않는다.

import { billingModeUsesBalance, type EeoBillingMode } from "@/lib/crm/eeo-account-fields"

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const STALE_AFTER_HOURS = 24
const VERY_STALE_AFTER_HOURS = 72
const EXPIRING_SOON_DAYS = 30
const WATCH_DAYS = 60
const INACTIVE_DAYS = 30
/** 소진 예상일이 이 안이면 재충전을 권할 시점으로 본다. */
const RECHARGE_DUE_DAYS = 30

export type ServiceRiskLevel = "urgent" | "soon" | "watch" | "normal"
export type ServiceRiskReasonCode =
  | "subscription_expired"
  | "subscription_expiring"
  | "depleted_balance"
  | "recharge_due"
  | "inactive"
  | "neo_missing"
  | "stale_snapshot"
export type ServiceRiskConfidence = "high" | "medium" | "low"

export interface ServiceRiskReason {
  code: ServiceRiskReasonCode
  label: string
}

export interface ServiceRiskInput {
  hasNeoData: boolean
  expireAt: string | null
  balance: number | null
  lastClassAt: string | null
  syncedAt: string | null
  /**
   * 매출시트 J열에서 온 과금 유형. 잔액 소진 판정은 충전제에만 의미가 있다.
   * 생략하면 "모름"으로 보고 신호를 버리지 않는다.
   */
  billingMode?: EeoBillingMode
  /**
   * 소진 예상일(잔액 ÷ 일평균 차감). 표본이 부족하면 null 이며, 그때는 이 신호를 내지 않는다.
   * 잔액이 0이 되기 *전에* 재충전을 권하기 위한 유일한 선행 신호다.
   */
  depletionInDays?: number | null
  now?: Date
}

export interface ServiceRisk {
  level: ServiceRiskLevel
  reasons: ServiceRiskReason[]
  expireInDays: number | null
  balance: number | null
  confidence: ServiceRiskConfidence
  freshnessLabel: string | null
  source: "neo"
}

const LEVEL_RANK: Record<ServiceRiskLevel, number> = { normal: 0, watch: 1, soon: 2, urgent: 3 }

function parseTime(value: string | null) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function freshness(syncedAt: string | null, nowMs: number): { label: string | null; hours: number | null } {
  const time = parseTime(syncedAt)
  if (time == null) return { label: null, hours: null }
  const hours = Math.max(0, (nowMs - time) / HOUR_MS)
  if (hours < 1) return { label: "NEO 방금", hours }
  if (hours < 24) return { label: `NEO ${Math.round(hours)}시간 전`, hours }
  return { label: `NEO ${Math.round(hours / 24)}일 전`, hours }
}

export function deriveServiceRisk(input: ServiceRiskInput): ServiceRisk {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const reasons: ServiceRiskReason[] = []
  let level: ServiceRiskLevel = "normal"

  const escalate = (next: ServiceRiskLevel) => {
    if (LEVEL_RANK[next] > LEVEL_RANK[level]) level = next
  }

  const fresh = freshness(input.syncedAt, nowMs)

  if (!input.hasNeoData) {
    return {
      level: "normal",
      reasons: [{ code: "neo_missing", label: "NEO 정보 없음" }],
      expireInDays: null,
      balance: input.balance,
      confidence: "low",
      freshnessLabel: null,
      source: "neo",
    }
  }

  // 구독 만료
  const expireTime = parseTime(input.expireAt)
  let expireInDays: number | null = null
  if (expireTime != null) {
    expireInDays = Math.floor((expireTime - nowMs) / DAY_MS)
    if (expireInDays < 0) {
      escalate("urgent")
      reasons.push({ code: "subscription_expired", label: `${Math.abs(expireInDays)}일 전 만료` })
    } else if (expireInDays <= 7) {
      escalate("urgent")
      reasons.push({ code: "subscription_expiring", label: `구독 만료 D-${expireInDays}` })
    } else if (expireInDays <= EXPIRING_SOON_DAYS) {
      escalate("soon")
      reasons.push({ code: "subscription_expiring", label: `구독 만료 D-${expireInDays}` })
    } else if (expireInDays <= WATCH_DAYS) {
      escalate("watch")
      reasons.push({ code: "subscription_expiring", label: `구독 만료 D-${expireInDays}` })
    }
  }

  // 충전 잔액: 분모(원충전액)가 불명확하므로 비율을 만들지 않는다. 소진(<=0)만 위험으로 본다.
  //
  // 단 이 신호는 충전제에만 의미가 있다. 구독제는 잔액이 아니라 계약 기간으로 서비스가
  // 유지되므로 잔액 0이 정상이고, 하드웨어 계정은 애초에 소진이라는 개념이 없다.
  // 과금 유형을 모르는 계정(매출시트에 연결되지 않은 다수)까지 막으면 진짜 소진이
  // 조용해지므로, 확실히 아닌 것만 제외한다.
  const billingMode = input.billingMode ?? "unknown"
  const balanceMatters = billingMode === "unknown" || billingModeUsesBalance(billingMode)
  if (balanceMatters && input.balance != null && input.balance <= 0) {
    escalate("soon")
    reasons.push({ code: "depleted_balance", label: "충전 잔액 소진" })
  }

  // 재충전 임박: 잔액이 0이 되기 전에 잡는 유일한 선행 신호.
  // 소진(<=0)은 이미 늦은 상태이므로, 아직 잔액이 있는 동안에만 의미가 있다.
  const depletionInDays = input.depletionInDays ?? null
  if (
    balanceMatters &&
    depletionInDays != null &&
    input.balance != null &&
    input.balance > 0 &&
    depletionInDays <= RECHARGE_DUE_DAYS
  ) {
    escalate(depletionInDays <= 7 ? "urgent" : "soon")
    reasons.push({ code: "recharge_due", label: `재충전 임박 D-${depletionInDays}` })
  }

  // 휴면: 잔액이 남아있는데 오래 수업이 없음
  const lastClassTime = parseTime(input.lastClassAt)
  if (lastClassTime != null && (input.balance == null || input.balance > 0)) {
    const inactiveDays = Math.floor((nowMs - lastClassTime) / DAY_MS)
    if (inactiveDays >= INACTIVE_DAYS) {
      escalate("watch")
      reasons.push({ code: "inactive", label: `${inactiveDays}일 수업 없음` })
    }
  }

  // freshness: 오래된 스냅샷은 confidence를 낮추고 별도 신호로 표시
  let confidence: ServiceRiskConfidence = "high"
  if (fresh.hours == null) {
    confidence = "low"
  } else if (fresh.hours >= VERY_STALE_AFTER_HOURS) {
    confidence = "low"
    reasons.push({ code: "stale_snapshot", label: "NEO 최신 확인 필요" })
  } else if (fresh.hours >= STALE_AFTER_HOURS) {
    confidence = "medium"
  }

  return {
    level,
    reasons,
    expireInDays,
    balance: input.balance,
    confidence,
    freshnessLabel: fresh.label,
    source: "neo",
  }
}
