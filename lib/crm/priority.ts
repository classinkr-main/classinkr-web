import type { LeadRecord } from "@/lib/repositories/leads"
import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"

export type CrmPrioritySource = "lead" | "neo_account"
export type CrmPrioritySeverity = "critical" | "high" | "medium" | "low"
export type CrmPriorityBucket = "today" | "renewal" | "stale_recovery" | "watch"
export type CrmPriorityAction =
  | "respond_lead"
  | "follow_up_lead"
  | "recover_expired"
  | "renew_account"
  | "reengage_account"
  | "watch_account"

export interface CrmPriorityItem {
  id: string
  source: CrmPrioritySource
  title: string
  subtitle: string | null
  ownerName: string | null
  ownerKeys: string[]
  statusLabel: string
  score: number
  severity: CrmPrioritySeverity
  bucket: CrmPriorityBucket
  bucketLabel: string
  action: CrmPriorityAction
  actionLabel: string
  reason: string
  href: string
  dueAt: string | null
  updatedAt: string | null
}

const RESPONSE_TARGET_SOURCES = new Set(["demo_modal", "contact_page", "meta_lead_ads"])
const DAY_MS = 24 * 60 * 60 * 1000
const STALE_RECOVERY_EXPIRED_DAYS = 60

export const CRM_PRIORITY_BUCKET_LABELS: Record<CrmPriorityBucket, string> = {
  today: "오늘 처리",
  renewal: "연장 관리",
  stale_recovery: "장기 회복",
  watch: "관찰",
}

const BUCKET_SORT_RANK: Record<CrmPriorityBucket, number> = {
  today: 0,
  renewal: 1,
  watch: 2,
  stale_recovery: 3,
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function severityFromScore(score: number): CrmPrioritySeverity {
  if (score >= 85) return "critical"
  if (score >= 68) return "high"
  if (score >= 42) return "medium"
  return "low"
}

function parseTime(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function daysFromNow(value: string | null | undefined, nowMs: number) {
  const time = parseTime(value)
  if (time == null) return null
  return Math.floor((time - nowMs) / DAY_MS)
}

function hoursSince(value: string | null | undefined, nowMs: number) {
  const time = parseTime(value)
  if (time == null) return null
  return Math.max(0, (nowMs - time) / (60 * 60 * 1000))
}

function displayLeadName(lead: LeadRecord) {
  return lead.org || lead.name || lead.email || lead.phone || "이름 없는 리드"
}

function uniqueOwnerKeys(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value)))]
}

function isResponseTargetLead(lead: LeadRecord) {
  return lead.status === "new" && RESPONSE_TARGET_SOURCES.has(lead.source)
}

export function buildLeadPriorityItem(lead: LeadRecord, now = new Date()): CrmPriorityItem | null {
  if (lead.status === "converted" || lead.status === "closed") return null

  const nowMs = now.getTime()
  const ageHours = hoursSince(lead.timestamp, nowMs) ?? 0
  const followUpDays = daysFromNow(lead.follow_up_at, nowMs)
  let action: CrmPriorityAction = "follow_up_lead"
  let actionLabel = "팔로업"
  let reason = "진행 중인 리드"
  let score = lead.status === "new" ? 46 : 32
  let dueAt = lead.follow_up_at ?? null
  let bucket: CrmPriorityBucket = "watch"

  if (isResponseTargetLead(lead)) {
    action = "respond_lead"
    actionLabel = "첫 응답"
    bucket = "today"
    score = 55
    if (ageHours >= 48) {
      score += 35
      reason = "48시간 이상 미응답"
    } else if (ageHours >= 24) {
      score += 24
      reason = "24시간 이상 미응답"
    } else {
      score += 12
      reason = "신규 문의 응답 필요"
    }
    dueAt = lead.timestamp
  }

  if (followUpDays != null) {
    if (followUpDays < 0) {
      score += 34
      reason = `${Math.abs(followUpDays)}일 지연된 팔로업`
      bucket = "today"
    } else if (followUpDays === 0) {
      score += 22
      reason = "오늘 예정된 팔로업"
      bucket = "today"
    } else if (followUpDays <= 2) {
      score += 10
      reason = `${followUpDays}일 뒤 팔로업 예정`
    }
  }

  if (lead.source === "meta_lead_ads") score += 8
  if (lead.phone) score += 4

  const finalScore = clampScore(score)
  return {
    id: `lead:${lead.id}`,
    source: "lead",
    title: displayLeadName(lead),
    subtitle: lead.name && lead.org ? lead.name : lead.email ?? lead.phone ?? lead.source,
    ownerName: lead.assigned_to ?? null,
    ownerKeys: uniqueOwnerKeys([lead.assigned_to]),
    statusLabel: lead.status === "new" ? "신규 리드" : "접촉 중",
    score: finalScore,
    severity: severityFromScore(finalScore),
    bucket,
    bucketLabel: CRM_PRIORITY_BUCKET_LABELS[bucket],
    action,
    actionLabel,
    reason,
    href: `/admin/crm/customers/leads?lead=${encodeURIComponent(lead.id)}`,
    dueAt,
    updatedAt: lead.follow_up_at ?? lead.timestamp,
  }
}

export function buildNeoAccountPriorityItem(
  account: NeoCrmCustomerRow,
  now = new Date()
): CrmPriorityItem | null {
  const nowMs = now.getTime()
  const expiryDays = daysFromNow(account.expireAt, nowMs)
  const inactiveDays = account.lastClassAt ? Math.floor((nowMs - (parseTime(account.lastClassAt) ?? nowMs)) / DAY_MS) : null

  let action: CrmPriorityAction | null = null
  let actionLabel = ""
  let reason = ""
  let score = 0
  let dueAt: string | null = null
  let bucket: CrmPriorityBucket = "watch"

  if (expiryDays != null && expiryDays < 0) {
    action = "recover_expired"
    const expiredDays = Math.abs(expiryDays)
    bucket = expiredDays > STALE_RECOVERY_EXPIRED_DAYS ? "stale_recovery" : "today"
    actionLabel = bucket === "stale_recovery" ? "장기 회복" : "만료 회복"
    reason =
      bucket === "stale_recovery" ? `${expiredDays}일 전 만료 · 장기 회복` : `${expiredDays}일 전 만료`
    score =
      bucket === "stale_recovery"
        ? 44 + Math.min(16, Math.floor((expiredDays - STALE_RECOVERY_EXPIRED_DAYS) / 14))
        : 82 + Math.min(10, expiredDays)
    dueAt = account.expireAt
  } else if (expiryDays != null && expiryDays <= 30) {
    action = "renew_account"
    actionLabel = "연장 제안"
    bucket = expiryDays <= 7 ? "today" : "renewal"
    reason = expiryDays === 0 ? "오늘 만료" : `${expiryDays}일 내 만료`
    score = 72 + Math.max(0, 30 - expiryDays)
    dueAt = account.expireAt
  } else if (inactiveDays != null && inactiveDays >= 30 && Number(account.balance ?? 0) > 0) {
    action = "reengage_account"
    actionLabel = "재활성"
    bucket = "watch"
    reason = `${inactiveDays}일 수업 없음 · 잔액 보유`
    score = 60 + Math.min(24, Math.floor((inactiveDays - 30) / 3))
    dueAt = account.lastClassAt
  } else if (Number(account.balance ?? 0) > 0 && expiryDays != null && expiryDays <= 60) {
    action = "watch_account"
    actionLabel = "만료 점검"
    bucket = "watch"
    reason = `${expiryDays}일 내 만료 예정`
    score = 48
    dueAt = account.expireAt
  }

  if (!action) return null

  if (Number(account.orderAmount) > 0) score += 4
  if (Number(account.balance ?? 0) > 0) score += 3

  const finalScore = clampScore(score)
  return {
    id: `neo:${account.accountId}`,
    source: "neo_account",
    title: account.name,
    subtitle: account.phone ?? account.uid ?? account.accountId,
    ownerName: account.ownerName,
    ownerKeys: uniqueOwnerKeys([account.ownerName, account.ownerId]),
    statusLabel: "기존 고객",
    score: finalScore,
    severity: severityFromScore(finalScore),
    bucket,
    bucketLabel: CRM_PRIORITY_BUCKET_LABELS[bucket],
    action,
    actionLabel,
    reason,
    href: `/admin/crm/customers/accounts?account=${encodeURIComponent(account.accountId)}`,
    dueAt,
    updatedAt: account.updatedAt ?? account.lastClassAt ?? account.expireAt,
  }
}

export function sortPriorityItems(items: CrmPriorityItem[]) {
  return [...items].sort((a, b) => {
    const bucketDelta = BUCKET_SORT_RANK[a.bucket] - BUCKET_SORT_RANK[b.bucket]
    if (bucketDelta !== 0) return bucketDelta
    if (b.score !== a.score) return b.score - a.score
    const bTime = parseTime(b.dueAt ?? b.updatedAt) ?? 0
    const aTime = parseTime(a.dueAt ?? a.updatedAt) ?? 0
    return aTime - bTime
  })
}
