import type { LeadRecord } from "@/lib/repositories/leads"
import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"
import type { CrmTaskPriority, CrmTaskRecord, CrmTaskType } from "@/lib/repositories/crm-tasks"
import { parseLeadSize, type LeadEngagement } from "@/lib/crm/lead-ranking"
import { getMetaIntent, isTestLead } from "@/lib/crm/lead-attribution"
import {
  EMPTY_COMPASS_DEMO_INDEX,
  compassDemoLabel,
  compassDemoLift,
  findCompassDemoSignal,
  type CompassDemoIndex,
} from "@/lib/crm/compass-demo-signal"

export type CrmPrioritySource = "lead" | "neo_account" | "task"
export type CrmPrioritySeverity = "critical" | "high" | "medium" | "low"
export type CrmPriorityBucket = "today" | "renewal" | "stale_recovery" | "watch"
export type CrmPriorityLane = "sales" | "renewal" | "customer_care"
export type CrmPriorityAction =
  | "respond_lead"
  | "follow_up_lead"
  | "recover_expired"
  | "renew_account"
  | "recharge_account"
  | "reengage_account"
  | "watch_account"
  | "do_task"

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
  lane: CrmPriorityLane
  laneLabel: string
  bucket: CrmPriorityBucket
  bucketLabel: string
  action: CrmPriorityAction
  actionLabel: string
  reason: string
  href: string
  dueAt: string | null
  updatedAt: string | null
  /** 리드의 유입 소스 원문(예: meta_lead_ads) — 채널별 분리 표시용. 계정·할 일은 null. */
  sourceKey: string | null
}

const RESPONSE_TARGET_SOURCES = new Set(["demo_modal", "contact_page", "meta_lead_ads"])
/** 데모 색인이 없을 때 쓰는 빈 색인 — 호출부마다 null 분기를 두지 않기 위해. */
const EMPTY_DEMO_INDEX: CompassDemoIndex = EMPTY_COMPASS_DEMO_INDEX
const DAY_MS = 24 * 60 * 60 * 1000
const STALE_RECOVERY_EXPIRED_DAYS = 60
/** 미응답이 "오늘 처리"에서 "관찰"로 내려가는 선(48h 봉우리 이후 경과일). */
const UNRESPONDED_COOLED_DAYS = 3
/** 만료 직후 회복 골든타임 — 이 안에서는 봉우리 점수를 유지한다. */
const EXPIRED_GOLDEN_DAYS = 14
/** 골든타임 이후 감쇠 반감기. 60일(장기 회복 진입선)에서 44~48 근처로 착지하도록 잡았다. */
const EXPIRED_HALF_LIFE_DAYS = 50

export const CRM_PRIORITY_BUCKET_LABELS: Record<CrmPriorityBucket, string> = {
  today: "오늘 처리",
  renewal: "연장 관리",
  stale_recovery: "장기 회복",
  watch: "관찰",
}

export const CRM_PRIORITY_LANE_LABELS: Record<CrmPriorityLane, string> = {
  sales: "신규·추가 매출",
  renewal: "연장",
  customer_care: "고객관리",
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

/**
 * 달력 날짜 차이(로컬 자정 경계 기준). 24시간 단위 나눗셈(floor)은 오후에 잡은
 * "내일 09:00 팔로업"을 0(오늘)으로 접어 스누즈가 점수를 되올리는 결함을 만들었다 —
 * 만료 D-N 같은 다른 호출처도 의미상 달력일이 맞다. (테스트를 위해 export)
 */
export function daysFromNow(value: string | null | undefined, nowMs: number) {
  const time = parseTime(value)
  if (time == null) return null
  const target = new Date(time)
  const base = new Date(nowMs)
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const baseMidnight = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()
  // DST 등으로 자정 간격이 정확히 24h가 아닐 수 있어 round 로 흡수한다.
  return Math.round((targetMidnight - baseMidnight) / DAY_MS)
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

export interface BuildLeadPriorityOptions {
  /** 참여 신호(연락 후 재방문·자료 수령·로그인). 없으면 반응 축을 건너뛴다. */
  engagement?: LeadEngagement | null
  /** Compass 실측 데모 색인(전화 정규화 키 기준). 없으면 데모 신호를 건너뛴다. */
  demoIndex?: CompassDemoIndex | null
}

export function buildLeadPriorityItem(
  lead: LeadRecord,
  now = new Date(),
  options?: BuildLeadPriorityOptions
): CrmPriorityItem | null {
  if (lead.status === "converted" || lead.status === "closed") return null
  // 폼 테스트가 남긴 리드는 아침에 처리할 일이 아니다 — 작업대에서 제외한다.
  // (목록에서 지우지는 않는다. 리드 보드에서는 칩으로 표시만 한다.)
  if (isTestLead(lead)) return null
  // 공개 채널에서 막 들어와 아직 검토(확인)되지 않은 저의도 리드(뉴스레터 등)는 작업대 노이즈라 제외.
  // 응대 SLA가 걸린 소스(문의/데모/Meta 리드애즈)는 미확인이어도 "첫 응답" 큐로 즉시 노출한다.
  if (!lead.confirmed_at && !isResponseTargetLead(lead)) return null

  const nowMs = now.getTime()
  const ageHours = hoursSince(lead.timestamp, nowMs) ?? 0
  const followUpDays = daysFromNow(lead.follow_up_at, nowMs)
  const engagement = options?.engagement ?? null
  let action: CrmPriorityAction = "follow_up_lead"
  let actionLabel = "팔로업"
  let reason = "진행 중인 리드"
  // 대화가 열린 리드(contacted)가 아직 말도 못 붙인 신규보다 높게 출발한다.
  // status 표기가 안 바뀌었어도 연락 기록이 있으면 컨택으로 친다(lead-ranking 과 동일 규칙).
  const hasContacted = lead.status === "contacted" || (engagement?.contactLogCount ?? 0) > 0
  let score = hasContacted ? 52 : 40
  let dueAt = lead.follow_up_at ?? null
  let bucket: CrmPriorityBucket = "watch"

  // 미래 팔로업(달력일 기준 내일 이후)이 잡힌 리드는 "예정" 상태 — 담당자가 이미
  // 날짜를 정한 건이므로 SLA 축이 "오늘 처리"로 되끌어올리면 안 된다.
  const hasScheduledFollowUp = followUpDays != null && followUpDays >= 1

  if (isResponseTargetLead(lead)) {
    action = "respond_lead"
    actionLabel = "첫 응답"
    score = 44
    if (hasScheduledFollowUp) {
      // "내일로" 스누즈가 미응답 가산 위에 팔로업 가산까지 얹어 점수를 되올리던
      // 결함(94→100 복귀)의 두 번째 축 — 예정 건은 미응답 가산·오늘 강제를 걷어내고
      // 자리는 아래 팔로업 축(d ≥ 1)이 정한다.
    } else {
      bucket = "today"
      // 봉우리형 — 24~48h 가 최고점이고 그 뒤로는 식는다. 오래 방치됐다는 이유만으로
      // 살아 있는 거래를 밀어내던 이전 곡선(48h → +35 고정, 총 90점)을 대체한다.
      if (ageHours >= 48) {
        const daysPast = (ageHours - 48) / 24
        score += Math.max(4, Math.round(26 * Math.pow(0.5, daysPast / 3)))
        const days = Math.floor(ageHours / 24)
        const cooled = daysPast > UNRESPONDED_COOLED_DAYS
        reason = cooled ? `${days}일 미응답 · 식음` : "48시간 이상 미응답"
        // 버킷 정렬이 점수보다 우선하므로(sortPriorityItems), 식은 건을 계속 "오늘 처리"에
        // 두면 점수를 아무리 낮춰도 살아 있는 거래 위에 그대로 남는다. 라벨과 자리를 맞춘다 —
        // 닷새 넘게 답 못 한 문의는 오늘의 할 일이 아니라 관찰 대상이다.
        if (cooled) bucket = "watch"
      } else if (ageHours >= 24) {
        score += 26
        reason = "24시간 이상 미응답"
      } else {
        // 24h 미만 +18 — 갓 들어온 문의가 규모·감도 보정 몇 점에 밀려 하루 늦은
        // 문의(+26) 아래로 뒤집히는 반전을 완화한다(SLA 위반이 여전히 위이되 격차 축소).
        score += 18
        reason = "신규 문의 응답 필요"
      }
      dueAt = lead.timestamp
    }
  }

  if (followUpDays != null) {
    if (followUpDays < 0) {
      const overdue = Math.abs(followUpDays)
      // 지연 팔로업도 같은 원리 — 1~3일이 봉우리, 이후 감쇠.
      score += Math.max(4, Math.round(28 * Math.pow(0.5, Math.max(0, overdue - 3) / 4)))
      reason = overdue > 7 ? `${overdue}일 지연된 팔로업 · 식음` : `${overdue}일 지연된 팔로업`
      bucket = "today"
    } else if (followUpDays === 0) {
      score += 26
      reason = "오늘 예정된 팔로업"
      bucket = "today"
    } else if (followUpDays <= 2) {
      // 임박 예정 건은 소폭만 얹는다 — "오늘 처리"로 승격하지 않는다(예정은 예정일에).
      score += 12
      reason = followUpDays === 1 ? "내일 팔로업 예정" : `D-${followUpDays} 팔로업 예정`
    }
  }

  // ─ 감도(유입 의도)·규모 — "지금 사줄 것 같은 곳"을 위로 올리는 축.
  if (lead.source === "demo_modal") score += 12
  else if (lead.source === "contact_page") score += 6
  if (lead.source === "meta_lead_ads") {
    score += 8
    // Meta 안에서도 광고 문구가 드러내는 의도로 한 번 더 가른다 — 리드 대다수가
    // 여기라, 이게 없으면 "감도 높은 곳 우선"이 Meta 안에서 아무것도 못 가른다.
    const metaIntent = getMetaIntent(lead)
    if (metaIntent) {
      score += metaIntent.lift
      if (bucket === "watch") reason = `광고 · ${metaIntent.label}`
    }
  }

  const size = parseLeadSize(lead.size)
  if (size >= 300) score += 12
  else if (size >= 100) score += 7

  // ─ 반응 — 상대가 우리 쪽으로 움직였는가. 참여 데이터가 없으면 조용히 0.
  if (engagement) {
    const contactMs = parseTime(engagement.lastContactAt)
    const activityMs = parseTime(engagement.lastActivityAt)
    if (contactMs != null && activityMs != null && activityMs > contactMs) {
      score += 16
      reason = "연락 후 재방문"
      if (bucket === "watch") bucket = "today"
    }
    if (engagement.downloadCount > 0) score += 8
    if (engagement.authenticated) score += 6
  }

  // ─ 데모 — 퍼널에서 매출에 가장 가까운 상태. 예정·당일은 무엇보다 우선한다.
  // 매칭 키는 전화(정규화)다 — 이름 추측이 아니라 Compass 실측 데모와의 동등 비교.
  const demo = findCompassDemoSignal(options?.demoIndex ?? EMPTY_DEMO_INDEX, lead.phone)
  if (demo) {
    score += compassDemoLift(demo)
    reason = compassDemoLabel(demo)
    action = "follow_up_lead"
    actionLabel = demo.phase === "recent" ? "데모 후속" : "데모"
    bucket = "today"
    dueAt = demo.date
  }

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
    lane: "sales",
    laneLabel: CRM_PRIORITY_LANE_LABELS.sales,
    bucket,
    bucketLabel: CRM_PRIORITY_BUCKET_LABELS[bucket],
    action,
    actionLabel,
    reason,
    href: `/admin/crm/customers/leads?lead=${encodeURIComponent(lead.id)}`,
    dueAt,
    updatedAt: lead.follow_up_at ?? lead.timestamp,
    sourceKey: lead.source ?? null,
  }
}

export function buildNeoAccountPriorityItem(
  account: NeoCrmCustomerRow,
  now = new Date(),
  options?: { demoIndex?: CompassDemoIndex | null }
): CrmPriorityItem | null {
  const nowMs = now.getTime()
  const expiryDays = daysFromNow(account.expireAt, nowMs)
  const inactiveDays = account.lastClassAt ? Math.floor((nowMs - (parseTime(account.lastClassAt) ?? nowMs)) / DAY_MS) : null
  const riskReasonCodes = new Set(account.riskReasons?.map((reason) => reason.code).filter(Boolean))

  let action: CrmPriorityAction | null = null
  let actionLabel = ""
  let reason = ""
  let score = 0
  let dueAt: string | null = null
  let bucket: CrmPriorityBucket = "watch"
  let lane: CrmPriorityLane = "customer_care"

  if (expiryDays != null && expiryDays < 0) {
    lane = "renewal"
    action = "recover_expired"
    const expiredDays = Math.abs(expiryDays)
    bucket = expiredDays > STALE_RECOVERY_EXPIRED_DAYS ? "stale_recovery" : "today"
    actionLabel = bucket === "stale_recovery" ? "장기 회복" : "만료 회복"
    if (bucket === "stale_recovery") {
      reason = `${expiredDays}일 전 만료 · 장기 회복`
      score = 44 + Math.min(16, Math.floor((expiredDays - STALE_RECOVERY_EXPIRED_DAYS) / 14))
    } else {
      // 리드의 미응답과 같은 원리 — 이전에는 `82 + min(10, 경과일)` 이라 오래 만료될수록
      // 점수가 올라, 두 달 전에 죽은 계정이 사흘 뒤 만료되는(아직 살릴 수 있는) 계정과
      // 동점이 됐다. 회복 골든타임(2주)에서 봉우리를 찍고 장기 회복 진입선까지 감쇠한다.
      const pastGolden = Math.max(0, expiredDays - EXPIRED_GOLDEN_DAYS)
      score = Math.max(48, 88 * Math.pow(0.5, pastGolden / EXPIRED_HALF_LIFE_DAYS))
      reason =
        pastGolden > EXPIRED_HALF_LIFE_DAYS / 2
          ? `${expiredDays}일 전 만료 · 식음`
          : `${expiredDays}일 전 만료`
    }
    dueAt = account.expireAt
  } else if (expiryDays != null && expiryDays <= 30) {
    lane = "renewal"
    action = "renew_account"
    actionLabel = "연장 제안"
    bucket = expiryDays <= 7 ? "today" : "renewal"
    reason = expiryDays === 0 ? "오늘 만료" : `${expiryDays}일 내 만료`
    score = 72 + Math.max(0, 30 - expiryDays)
    dueAt = account.expireAt
  } else if (
    // 재충전 임박: 잔액이 아직 남아 있을 때 잡는 유일한 선행 신호.
    // 만료보다는 뒤, 휴면보다는 앞 — 아직 돈을 쓰고 있는 고객이라 회복 가능성이 가장 높다.
    riskReasonCodes.has("recharge_due") &&
    account.depletionInDays != null &&
    Number(account.balance ?? 0) > 0
  ) {
    const daysLeft = account.depletionInDays
    lane = "renewal"
    action = "recharge_account"
    actionLabel = "재충전 안내"
    bucket = daysLeft <= 7 ? "today" : "renewal"
    reason = `잔액 소진 D-${daysLeft}`
    score = 70 + Math.max(0, 30 - daysLeft)
    dueAt = account.lastClassAt ?? account.updatedAt ?? null
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
  } else if (
    riskReasonCodes.has("depleted_balance") ||
    (account.balance != null && Number(account.balance) <= 0)
  ) {
    // 잔액 소진이 곧 충전 수요는 아니다 — 수강권을 다 쓰고 떠난 휴면 고객까지
    // 일괄 70점으로 올리면 큐가 인플레이션된다. 최근에도 수업을 돌리던(45일 내)
    // 계정만 진짜 충전 후보로 올리고, 수업 신호가 없거나 끊긴 계정은 관찰로 내린다.
    const hasRecentClass = inactiveDays != null && inactiveDays <= 45
    if (hasRecentClass) {
      action = "renew_account"
      actionLabel = "충전 안내"
      bucket = "today"
      reason = "충전 잔액 소진"
      score = account.riskLevel === "urgent" ? 82 : 70
    } else {
      action = "watch_account"
      actionLabel = "휴면 점검"
      bucket = "watch"
      reason = "잔액 소진 · 최근 수업 없음"
      score = 38
    }
    dueAt = account.updatedAt ?? account.lastClassAt ?? null
  }

  // 데모가 잡힌 고객은 만료·잔액과 무관하게 지금 챙겨야 한다 — 다른 사유가 없어도
  // 데모 하나만으로 작업대에 올린다.
  const demo = findCompassDemoSignal(options?.demoIndex ?? EMPTY_DEMO_INDEX, account.phone)
  if (demo) {
    // 기존 고객의 데모는 단순 운영 신호가 아니라 추가 매출 기회로 본다.
    lane = "sales"
    action = action ?? "watch_account"
    actionLabel = demo.phase === "recent" ? "데모 후속" : "데모"
    reason = compassDemoLabel(demo)
    bucket = "today"
    score += compassDemoLift(demo)
    dueAt = demo.date
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
    lane,
    laneLabel: CRM_PRIORITY_LANE_LABELS[lane],
    bucket,
    bucketLabel: CRM_PRIORITY_BUCKET_LABELS[bucket],
    action,
    actionLabel,
    reason,
    href: `/admin/crm/customers/accounts?account=${encodeURIComponent(account.accountId)}`,
    dueAt,
    updatedAt: account.updatedAt ?? account.lastClassAt ?? account.expireAt,
    sourceKey: null,
  }
}

const TASK_TYPE_ACTION_LABELS: Record<CrmTaskType, string> = {
  call: "전화",
  kakao: "카카오",
  email: "이메일",
  meeting: "미팅",
  quote: "견적",
  demo: "데모",
  install: "설치",
  renewal: "갱신",
  cs_checkin: "CS 점검",
  data_fix: "데이터 정리",
  other: "할 일",
}

const TASK_PRIORITY_BASE_SCORE: Record<CrmTaskPriority, number> = {
  urgent: 86,
  high: 74,
  normal: 58,
  low: 44,
}

function taskHref(task: CrmTaskRecord) {
  if (task.targetType === "lead" && task.targetId) {
    return `/admin/crm/customers/leads?lead=${encodeURIComponent(task.targetId)}`
  }
  if (task.targetType === "neo_account" && task.targetId) {
    return `/admin/crm/customers/accounts?account=${encodeURIComponent(task.targetId)}`
  }
  if (task.targetType === "deal" && task.targetId) {
    return `/admin/crm/deals/orders?deal=${encodeURIComponent(task.targetId)}`
  }
  return "/admin/crm/activity"
}

function taskLane(taskType: CrmTaskType): CrmPriorityLane {
  if (taskType === "renewal") return "renewal"
  if (taskType === "install" || taskType === "cs_checkin" || taskType === "data_fix") {
    return "customer_care"
  }
  return "sales"
}

export function buildTaskPriorityItem(task: CrmTaskRecord, now = new Date()): CrmPriorityItem | null {
  if (task.status === "done" || task.status === "canceled") return null

  const nowMs = now.getTime()
  // 미룬 할 일은 재부상 시각이 지나야 큐에 다시 뜬다.
  // 재부상 시각이 없거나(데이터 무결성) 미래면 숨긴다.
  if (task.status === "snoozed") {
    const until = parseTime(task.snoozedUntil)
    if (until == null || until > nowMs) return null
  }

  const effectiveDue = task.status === "snoozed" ? task.snoozedUntil ?? task.dueAt : task.dueAt
  let score = TASK_PRIORITY_BASE_SCORE[task.priority]
  let bucket: CrmPriorityBucket = "watch"
  let reason = "예정된 할 일"

  const dueDays = daysFromNow(effectiveDue, nowMs)
  if (dueDays != null) {
    if (dueDays < 0) {
      bucket = "today"
      score += Math.min(14, Math.abs(dueDays) * 2 + 6)
      reason = `${Math.abs(dueDays)}일 지연된 할 일`
    } else if (dueDays === 0) {
      bucket = "today"
      score += 8
      reason = "오늘 마감"
    } else if (dueDays <= 2) {
      score += 3
      reason = `${dueDays}일 뒤 예정`
    } else {
      reason = `${dueDays}일 뒤 예정`
    }
  } else if (task.priority === "urgent" || task.priority === "high") {
    bucket = "today"
    reason = "마감일 없는 중요 할 일"
  }

  const taskLabel = TASK_TYPE_ACTION_LABELS[task.taskType]
  const lane = taskLane(task.taskType)
  const finalScore = clampScore(score)
  return {
    id: `task:${task.id}`,
    source: "task",
    title: task.targetLabel ?? task.title,
    subtitle: task.targetLabel ? task.title : taskLabel,
    ownerName: task.ownerNameSnapshot,
    ownerKeys: uniqueOwnerKeys([task.ownerKey, task.ownerNameSnapshot]),
    statusLabel: task.status === "snoozed" ? "미룬 할 일" : "할 일",
    score: finalScore,
    severity: severityFromScore(finalScore),
    lane,
    laneLabel: CRM_PRIORITY_LANE_LABELS[lane],
    bucket,
    bucketLabel: CRM_PRIORITY_BUCKET_LABELS[bucket],
    action: "do_task",
    actionLabel: taskLabel,
    reason,
    href: taskHref(task),
    dueAt: effectiveDue,
    updatedAt: task.updatedAt,
    sourceKey: null,
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
