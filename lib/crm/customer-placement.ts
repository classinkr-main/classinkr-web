import { daysUntil, type CrmUnifiedCustomerRow } from "@/lib/crm/unified-view-rules"

const HOUR_MS = 60 * 60 * 1000
const STALE_RECOVERY_DAYS = 60

export type CrmCustomerPlacementBand =
  | "response_overdue"
  | "immediate"
  | "response_due"
  | "priority"
  | "follow_up"
  | "routine"

export interface CrmCustomerPlacement {
  band: CrmCustomerPlacementBand
  rank: number
  label: string
}

function parseTime(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function hoursSince(value: string | null | undefined, nowMs: number) {
  const time = parseTime(value)
  if (time == null) return null
  return Math.max(0, (nowMs - time) / HOUR_MS)
}

/**
 * 고객 DB 기본 상단 배치 규칙.
 * 사람이 바로 행동해야 하는 순서를 명시하고, 이미 첫 응답을 기록한 리드는 미응답 큐에서 제외한다.
 */
export function getDefaultCustomerPlacement(
  row: CrmUnifiedCustomerRow,
  nowMs: number
): CrmCustomerPlacement {
  const expiryDays = daysUntil(row.expireAt, nowMs)
  const unansweredLead =
    row.source === "lead" &&
    row.slaTarget &&
    !row.firstResponseAt &&
    row.lifecycle !== "closed"
  const responseAgeHours = unansweredLead ? hoursSince(row.createdAt, nowMs) : null

  if (unansweredLead && responseAgeHours != null && responseAgeHours >= 24) {
    return { band: "response_overdue", rank: 0, label: "즉시 응대" }
  }

  // 60일을 넘긴 장기 만료는 긴급 위험 신호로 취급하지 않고 별도 회복 후보로 둔다.
  if (expiryDays != null && expiryDays < -STALE_RECOVERY_DAYS) {
    return { band: "follow_up", rank: 4, label: "회복 후보" }
  }

  const contractNeedsImmediateAttention =
    expiryDays != null && expiryDays >= -STALE_RECOVERY_DAYS && expiryDays <= 7
  const depletedBalance = row.nextActionLabel === "충전 안내"
  if (contractNeedsImmediateAttention || depletedBalance || row.score >= 85) {
    return { band: "immediate", rank: 1, label: "즉시 확인" }
  }

  if (unansweredLead) {
    return { band: "response_due", rank: 2, label: "오늘 응대" }
  }

  if (
    row.lifecycle === "account_risk" ||
    row.score >= 68 ||
    (expiryDays != null && expiryDays <= 30)
  ) {
    return { band: "priority", rank: 3, label: "우선 확인" }
  }

  if (row.lifecycle === "new_lead" || row.lifecycle === "active_lead" || row.score >= 42) {
    return { band: "follow_up", rank: 4, label: "후속 진행" }
  }

  return { band: "routine", rank: 5, label: "일반 관리" }
}

function placementTime(row: CrmUnifiedCustomerRow, band: CrmCustomerPlacementBand) {
  if (band === "response_overdue" || band === "response_due") {
    return parseTime(row.createdAt) ?? Number.MAX_SAFE_INTEGER
  }
  if (row.expireAt) return parseTime(row.expireAt) ?? Number.MAX_SAFE_INTEGER
  return parseTime(row.updatedAt) ?? Number.MAX_SAFE_INTEGER
}

export function compareDefaultCustomerPlacement(
  left: CrmUnifiedCustomerRow,
  right: CrmUnifiedCustomerRow,
  nowMs: number
) {
  const leftPlacement = getDefaultCustomerPlacement(left, nowMs)
  const rightPlacement = getDefaultCustomerPlacement(right, nowMs)
  if (leftPlacement.rank !== rightPlacement.rank) return leftPlacement.rank - rightPlacement.rank
  if (left.score !== right.score) return right.score - left.score

  const timeDelta = placementTime(left, leftPlacement.band) - placementTime(right, rightPlacement.band)
  if (timeDelta !== 0) return timeDelta

  const nameDelta = left.name.localeCompare(right.name, "ko")
  return nameDelta !== 0 ? nameDelta : left.key.localeCompare(right.key)
}
