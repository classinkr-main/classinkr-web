// 자동 태그 규칙(§11.3 T5)의 순수 판정 함수. lib/repositories/crm-tag-rules.ts(server-only)가
// getCrmUnifiedCustomers 로 모은 행에 그대로 적용한다. DB·Date.now()를 직접 읽지 않고 nowMs를
// 인자로 받아 테스트가 결정론적이다.
//
// health_risk 판정은 lib/repositories/crm-unified-customers.ts의 rowHealthBand(비공개 함수)와
// 반드시 같은 결과를 내야 한다. 그 함수는 export되지 않으므로(소유권 밖 파일이라 고칠 수 없음)
// 여기서 같은 입력 조립(severityFromScore 임계값 85/68/42, serviceLevel은
// lifecycle === "account_risk" ? "soon" : "normal")을 그대로 복제해 lib/crm/customer-health.ts의
// computeCustomerHealth(SSOT)에 넣는다. rowHealthBand가 나중에 export되면 이 복제는 지운다.

import { daysUntil } from "@/lib/crm/unified-view-rules"
import { computeCustomerHealth, type CustomerHealthBand } from "@/lib/crm/customer-health"

export type AutoTagRuleType = "expiring_within_days" | "health_risk" | "dormant_days"

export const AUTO_TAG_RULE_TYPES: readonly AutoTagRuleType[] = [
  "expiring_within_days",
  "health_risk",
  "dormant_days",
]

export function isAutoTagRuleType(value: unknown): value is AutoTagRuleType {
  return typeof value === "string" && (AUTO_TAG_RULE_TYPES as readonly string[]).includes(value)
}

/** applyAutoTagRules가 대상 판정에 필요로 하는 최소 입력 — CrmUnifiedCustomerRow의 부분집합. */
export interface AutoTagTargetRow {
  key: string
  score: number
  lifecycle: string
  balance: number | null
  expireAt: string | null
  lastContactAt?: string | null
}

/** expireAt이 [now, now+days] 구간(양끝 포함) 안이면 true. expireAt 없거나 이미 지났으면 false. */
export function isExpiringWithinDays(expireAt: string | null, days: number, nowMs: number): boolean {
  const remaining = daysUntil(expireAt, nowMs)
  if (remaining == null) return false
  return remaining >= 0 && remaining <= days
}

// crm-unified-customers.ts severityFromScore(비공개)와 동일 임계값.
function severityFromScore(score: number): "critical" | "high" | "medium" | "low" {
  return score >= 85 ? "critical" : score >= 68 ? "high" : score >= 42 ? "medium" : "low"
}

/** crm-unified-customers.ts의 rowHealthBand와 동일 입력 조립(그 함수는 비공개라 여기서 복제). */
export function computeAutoTagHealthBand(
  row: Pick<AutoTagTargetRow, "score" | "lifecycle" | "balance" | "expireAt">,
  nowMs: number
): CustomerHealthBand {
  return computeCustomerHealth({
    riskSeverity: severityFromScore(row.score),
    serviceLevel: row.lifecycle === "account_risk" ? "soon" : "normal",
    hasOutstanding: (row.balance ?? 0) > 0,
    daysToExpire: daysUntil(row.expireAt, nowMs),
    lastContactDays: null,
  }).band
}

export function isHealthRisk(
  row: Pick<AutoTagTargetRow, "score" | "lifecycle" | "balance" | "expireAt">,
  nowMs: number
): boolean {
  return computeAutoTagHealthBand(row, nowMs) === "risk"
}

/** lastContactAt이 days일 이전이거나 아예 없으면 true("휴면"). */
export function isDormant(lastContactAt: string | null | undefined, days: number, nowMs: number): boolean {
  if (!lastContactAt) return true
  const contactMs = new Date(lastContactAt).getTime()
  if (Number.isNaN(contactMs)) return true
  return (nowMs - contactMs) / 86_400_000 >= days
}

export interface AutoTagRuleParams {
  days?: number
}

const DEFAULT_EXPIRING_DAYS = 30
const DEFAULT_DORMANT_DAYS = 60

/** rule_type + params로부터 대상 행이 규칙을 충족하는지 판정하는 함수를 만든다. */
export function buildAutoTagMatcher(
  ruleType: AutoTagRuleType,
  params: AutoTagRuleParams | null | undefined,
  nowMs: number
): (row: AutoTagTargetRow) => boolean {
  const safeParams = params ?? {}
  switch (ruleType) {
    case "expiring_within_days": {
      const days = Number.isFinite(safeParams.days) ? Number(safeParams.days) : DEFAULT_EXPIRING_DAYS
      return (row) => isExpiringWithinDays(row.expireAt, days, nowMs)
    }
    case "health_risk":
      return (row) => isHealthRisk(row, nowMs)
    case "dormant_days": {
      const days = Number.isFinite(safeParams.days) ? Number(safeParams.days) : DEFAULT_DORMANT_DAYS
      return (row) => isDormant(row.lastContactAt, days, nowMs)
    }
    default:
      return () => false
  }
}
