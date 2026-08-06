import type { CrmTaskType } from "@/lib/repositories/crm-tasks"
import type { ServiceRisk, ServiceRiskReasonCode } from "@/lib/crm/service-risk"

export interface CustomerNextActionRecommendation {
  title: string
  reason: string
  taskType: CrmTaskType
}

interface BuildCustomerNextActionRecommendationInput {
  nextActionLabel: string | null | undefined
  priorityReason: string | null | undefined
  serviceRisk: ServiceRisk | null | undefined
  riskReasons: string[]
}

const SUBSCRIPTION_REASON_CODES = new Set<ServiceRiskReasonCode>([
  "subscription_expired",
  "subscription_expiring",
])

function hasReason(risk: ServiceRisk, code: ServiceRiskReasonCode) {
  return risk.reasons.some((reason) => reason.code === code)
}

function serviceAction(risk: ServiceRisk): { title: string; taskType: CrmTaskType } | null {
  if (hasReason(risk, "subscription_expired")) {
    return { title: "만료 고객 회복 확인", taskType: "renewal" }
  }
  if (hasReason(risk, "subscription_expiring")) {
    return { title: "재계약·갱신 확인", taskType: "renewal" }
  }
  if (hasReason(risk, "depleted_balance")) {
    return { title: "충전 안내", taskType: "renewal" }
  }
  if (hasReason(risk, "inactive")) {
    return { title: "재활성 확인", taskType: "cs_checkin" }
  }
  return null
}

function pushUnique(target: string[], value: string | null | undefined) {
  const normalized = value?.trim()
  if (normalized && !target.includes(normalized)) target.push(normalized)
}

/**
 * 고객 360의 추천 카드는 ClassIn 작업 데이터와 NEO 서비스 위험을 한 문장으로 합성한다.
 * NEO 신뢰도가 낮으면 고객 연락보다 원천 최신화 확인을 먼저 할 일로 만든다.
 */
export function buildCustomerNextActionRecommendation(
  input: BuildCustomerNextActionRecommendationInput
): CustomerNextActionRecommendation | null {
  const serviceRisk = input.serviceRisk ?? null
  // 기존 고객 360 카드 범위(D-30/소진 = urgent·soon)를 유지한다. watch 신호는 상세 리스크에만 둔다.
  const derivedServiceAction =
    serviceRisk && (serviceRisk.level === "urgent" || serviceRisk.level === "soon")
      ? serviceAction(serviceRisk)
      : null

  let title = input.nextActionLabel?.trim() || derivedServiceAction?.title || null
  if (!title && input.priorityReason?.trim()) title = "후속 연락"
  if (!title) return null

  let taskType: CrmTaskType = derivedServiceAction?.taskType ?? "call"
  const needsNeoRefresh = Boolean(derivedServiceAction && serviceRisk?.confidence === "low")
  if (needsNeoRefresh) {
    title = `NEO 최신 확인 후 ${title}`
    taskType = "data_fix"
  }

  const reasons: string[] = []
  pushUnique(reasons, input.priorityReason)

  if (serviceRisk) {
    const staleReason = serviceRisk.reasons.find((reason) => reason.code === "stale_snapshot")
    const currentReasons = serviceRisk.reasons.filter((reason) => reason.code !== "stale_snapshot")
    if (staleReason) {
      // 낮은 신뢰도에서는 핵심 위험 1개보다 원천 시각과 확인 경고가 먼저 보여야 한다.
      pushUnique(reasons, currentReasons[0]?.label)
    } else {
      for (const reason of currentReasons) pushUnique(reasons, reason.label)
    }
    pushUnique(
      reasons,
      serviceRisk.freshnessLabel ?? (needsNeoRefresh ? "NEO 갱신 시각 미확인" : null)
    )
    pushUnique(reasons, staleReason?.label)
    if (staleReason) {
      for (const reason of currentReasons.slice(1)) pushUnique(reasons, reason.label)
    }
  }

  const hasSubscriptionReason = Boolean(
    serviceRisk?.reasons.some((reason) => SUBSCRIPTION_REASON_CODES.has(reason.code))
  )
  for (const reason of input.riskReasons) {
    // Customer360Risk와 ServiceRisk가 같은 만료일을 다른 문구로 다시 설명하지 않게 한다.
    if (hasSubscriptionReason && reason.includes("만료")) continue
    pushUnique(reasons, reason)
  }

  return {
    title,
    reason: reasons.slice(0, 3).join(" · ") || "우선순위 신호 기준 추천",
    taskType,
  }
}
