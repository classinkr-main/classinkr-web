import type { LeadRecord } from "@/lib/repositories/leads"
import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"
import type { CrmTaskPriority, CrmTaskRecord, CrmTaskType } from "@/lib/repositories/crm-tasks"
import { parseLeadSize, type LeadEngagement } from "@/lib/crm/lead-ranking"
import { getMetaIntent, isTestLead } from "@/lib/crm/lead-attribution"
import {
  demoSignalLabel,
  demoSignalLift,
  findDemoSignal,
  type DemoSignalIndex,
} from "@/lib/crm/demo-signal"
import { formatCNY, formatUSD } from "@/lib/crm/money-format"
import { deriveLeadLabels } from "@/lib/crm/lead-labels"

export type CrmPrioritySource = "lead" | "neo_account" | "task"
export type CrmPrioritySeverity = "critical" | "high" | "medium" | "low"
export type CrmPriorityBucket = "today" | "renewal" | "stale_recovery" | "watch"
export type CrmPriorityLane = "sales" | "renewal" | "customer_care"
// 티어 — 화면과 정렬의 1축. 연속 점수(0~100)는 실효성이 없어 내부 타이브레이커로 강등하고,
// "오늘 안 하면 잃는가"를 신뢰 신호(결제·만료·자체 기록)만으로 4단계로 판정한다.
export type CrmPriorityTier = "p0" | "p1" | "p2" | "p3"
// 머니 밴드 — 티어 안에서의 정렬 축. "같은 급이면 큰 돈부터".
export type CrmMoneyBand = "high" | "mid" | "low" | "unknown"
export type CrmPriorityAction =
  | "respond_lead"
  | "follow_up_lead"
  | "recover_expired"
  | "renew_account"
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
  /** 티어 — 정렬 1축. p0 오늘 필수 / p1 이번 주 / p2 기회 / p3 관찰. */
  tier: CrmPriorityTier
  tierLabel: string
  /** 같은 티어 안의 정렬 축 — 큰 돈부터. */
  moneyBand: CrmMoneyBand
  /** 화면용 금액 표기(예: "잔액 ¥1.2만 · 오더 $3,069", "원생 300명+"). 없으면 null. */
  moneyLabel: string | null
  /** reason의 근거 신뢰. low = NEO 로그성 날짜(마지막 수업 등) 파생 — 화면에 구분 표시. */
  trust: "high" | "low"
  /** 표시용 라벨(지역·과목·유형 등, lib/crm/lead-labels 파생). 없는 소스는 생략. */
  labels?: string[]
}

const RESPONSE_TARGET_SOURCES = new Set(["demo_modal", "contact_page", "meta_lead_ads"])
/** 데모 색인이 없을 때 쓰는 빈 색인 — 호출부마다 null 분기를 두지 않기 위해. */
const EMPTY_DEMO_INDEX: DemoSignalIndex = { byName: new Map(), unmatched: [], total: 0 }
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

export const CRM_PRIORITY_TIER_LABELS: Record<CrmPriorityTier, string> = {
  p0: "오늘 필수",
  p1: "이번 주",
  p2: "기회",
  p3: "관찰",
}

export const TIER_SORT_RANK: Record<CrmPriorityTier, number> = { p0: 0, p1: 1, p2: 2, p3: 3 }
const MONEY_SORT_RANK: Record<CrmMoneyBand, number> = { high: 0, mid: 1, low: 2, unknown: 3 }

// 티어는 "더 급한 쪽"만 이긴다 — 신호 여러 개가 겹치면 가장 높은 티어가 남는다.
function raiseTier(current: CrmPriorityTier, candidate: CrmPriorityTier): CrmPriorityTier {
  return TIER_SORT_RANK[candidate] < TIER_SORT_RANK[current] ? candidate : current
}

// 티어가 정렬·표시의 1축이므로 severity(색·긴급 카운트)도 티어에서 파생한다.
const TIER_SEVERITY: Record<CrmPriorityTier, CrmPrioritySeverity> = {
  p0: "critical",
  p1: "high",
  p2: "medium",
  p3: "low",
}

// 머니 밴드 임계값 — NEO 통화 규약(잔액 CNY·오더 USD, lib/crm/money-format.ts) 기준.
// 사업 감각으로 조정 가능한 상수. 잔액은 남은 서비스(지킬 매출), 오더는 과거 지불 규모.
const MONEY_HIGH_ORDER_USD = 3_000
const MONEY_MID_ORDER_USD = 500
const MONEY_HIGH_BALANCE_CNY = 10_000
const MONEY_MID_BALANCE_CNY = 1_000

// (버킷 정렬 랭크·score 기반 severity는 티어 체계로 대체 — 정렬은 sortPriorityItems,
//  severity는 TIER_SEVERITY가 담당한다.)

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
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
  /** 쇼룸 캘린더에서 온 데모 일정 색인. 없으면 데모 신호를 건너뛴다. */
  demoIndex?: DemoSignalIndex | null
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
  // 티어 — 리드는 유입 시각·팔로업·데모·재방문 전부 자체 타임스탬프라 신뢰 高.
  let tier: CrmPriorityTier = "p3"
  let cooledLead = false

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
        cooledLead = daysPast > UNRESPONDED_COOLED_DAYS
        reason = cooledLead ? `${days}일 미응답 · 식음` : "48시간 이상 미응답"
        // 닷새 넘게 답 못 한 문의는 오늘의 할 일이 아니라 관찰 대상이다.
        if (cooledLead) bucket = "watch"
        // 48h를 넘긴 미응답은 "오늘 필수"가 아니라 "이번 주" — SLA는 이미 깨졌고,
        // 오늘 자리는 아직 살릴 수 있는 신선한 문의가 가져간다.
        tier = raiseTier(tier, cooledLead ? "p3" : "p1")
      } else if (ageHours >= 24) {
        score += 26
        reason = "24시간 이상 미응답"
        tier = raiseTier(tier, "p0")
      } else {
        // 24h 미만 +18 — 갓 들어온 문의가 규모·감도 보정 몇 점에 밀려 하루 늦은
        // 문의(+26) 아래로 뒤집히는 반전을 완화한다(SLA 위반이 여전히 위이되 격차 축소).
        score += 18
        reason = "신규 문의 응답 필요"
        tier = raiseTier(tier, "p0")
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
      // 오래 지연된 약속은 "오늘 필수" 자격을 잃는다 — 일주일 넘게 안 지킨 약속은 이번 주 감.
      tier = raiseTier(tier, overdue > 7 ? "p1" : "p0")
    } else if (followUpDays === 0) {
      score += 26
      reason = "오늘 예정된 팔로업"
      bucket = "today"
      tier = raiseTier(tier, "p0")
    } else if (followUpDays <= 2) {
      // 임박 예정 건은 소폭만 얹는다 — "오늘 처리"로 승격하지 않는다(예정은 예정일에).
      score += 12
      reason = followUpDays === 1 ? "내일 팔로업 예정" : `D-${followUpDays} 팔로업 예정`
      tier = raiseTier(tier, "p1")
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
      // 재방문은 자체 행동 로그(서버 타임스탬프) — 죽은 듯하던 리드도 이번 주로 되살린다.
      tier = raiseTier(tier, "p1")
    }
    if (engagement.downloadCount > 0) score += 8
    if (engagement.authenticated) score += 6
  }

  // ─ 데모 — 퍼널에서 매출에 가장 가까운 상태. 예정·당일은 무엇보다 우선한다.
  const demo = findDemoSignal(options?.demoIndex ?? EMPTY_DEMO_INDEX, lead.org ?? lead.name)
  if (demo) {
    score += demoSignalLift(demo)
    reason = demoSignalLabel(demo)
    action = "follow_up_lead"
    actionLabel = demo.phase === "recent" ? "데모 후속" : "데모"
    bucket = "today"
    dueAt = demo.date
    // 데모 당일·내일은 오늘 필수, 이번 주 예정은 p1, 끝난 데모 후속은 기회.
    const demoDays = daysFromNow(demo.date, nowMs)
    tier = raiseTier(
      tier,
      demo.phase === "recent" ? "p2" : demoDays != null && demoDays <= 1 ? "p0" : "p1"
    )
  }

  if (lead.phone) score += 4

  // 신호가 하나도 없어도 살아 있는(식지 않은) 리드는 "기회"다 — 관찰은 식은 건만.
  if (tier === "p3" && !cooledLead) tier = "p2"

  // ─ 라벨(지역·과목·유형) — 상호명·폼 응답에서 파생. 교육 외(카페·스파 등) 추정 리드는
  // 신규 응대 P0 자리를 차지하지 않게 기회로 상한을 건다(실측: 비교육 자영업 유입 존재).
  const leadLabels = deriveLeadLabels(lead)
  if (leadLabels.category === "non_education" && TIER_SORT_RANK[tier] < TIER_SORT_RANK.p2) {
    tier = "p2"
    reason = `${reason} · 교육 외 추정`
  }

  // ─ 머니 밴드 — 규모(원생 수)와 광고 의도로 추정. 리드는 금액 원천이 없어 보수적으로.
  let moneyBand: CrmMoneyBand = "unknown"
  let moneyLabel: string | null = null
  if (size >= 300) {
    moneyBand = "high"
    moneyLabel = `원생 ${size.toLocaleString("ko-KR")}명+`
  } else if (size >= 100) {
    moneyBand = "mid"
    moneyLabel = `원생 ${size.toLocaleString("ko-KR")}명+`
  } else if (size > 0) {
    moneyBand = "low"
    moneyLabel = `원생 ${size.toLocaleString("ko-KR")}명`
  } else if (lead.source === "meta_lead_ads" && getMetaIntent(lead)?.label === "장비 구매") {
    moneyBand = "mid"
    moneyLabel = "장비 구매 의도"
  }

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
    severity: TIER_SEVERITY[tier],
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
    tier,
    tierLabel: CRM_PRIORITY_TIER_LABELS[tier],
    moneyBand,
    moneyLabel,
    // 리드의 근거는 전부 자체 데이터(유입 시각·팔로업·자체 캘린더·자체 행동 로그).
    trust: "high",
    labels: [leadLabels.region, leadLabels.subjectLabel, leadLabels.categoryLabel].filter(
      (label): label is string => Boolean(label)
    ),
  }
}

/**
 * 계정의 자체 CRM 신호 — 외부 NEO 로그 대신 신뢰할 수 있는 우리 팀 기록.
 * 원천: crm_customer_events(마지막 자체 컨택), crm_tasks(계정 예정 작업).
 * 순수 모듈 규약상 저장소 호출은 못 하므로 소비처(홈 큐·통합 목록)가 주입한다.
 */
export interface AccountOwnSignals {
  /** 마지막 자체 컨택 시각(메모·콜·문자·회의록·리드로그 미러). */
  lastContactAt?: string | null
  /** 열린(open/snoozed) 계정 할 일 중 가장 이른 due_at. */
  openTaskDueAt?: string | null
}

export function buildNeoAccountPriorityItem(
  account: NeoCrmCustomerRow,
  now = new Date(),
  options?: { demoIndex?: DemoSignalIndex | null; ownSignals?: AccountOwnSignals | null }
): CrmPriorityItem | null {
  const nowMs = now.getTime()
  const expiryDays = daysFromNow(account.expireAt, nowMs)
  const inactiveDays = account.lastClassAt ? Math.floor((nowMs - (parseTime(account.lastClassAt) ?? nowMs)) / DAY_MS) : null
  const riskReasonCodes = new Set(account.riskReasons?.map((reason) => reason.code).filter(Boolean))
  const own = options?.ownSignals ?? null
  const ownContactMs = parseTime(own?.lastContactAt ?? null)
  const ownContactDays = ownContactMs != null ? Math.floor((nowMs - ownContactMs) / DAY_MS) : null
  const openTaskDueDays = daysFromNow(own?.openTaskDueAt ?? null, nowMs)

  let action: CrmPriorityAction | null = null
  let actionLabel = ""
  let reason = ""
  let score = 0
  let dueAt: string | null = null
  let bucket: CrmPriorityBucket = "watch"
  let lane: CrmPriorityLane = "customer_care"
  let tier: CrmPriorityTier = "p3"
  // 신뢰 — 만료·잔액·주문(결제 시스템 데이터)과 자체 기록은 高, NEO 수업 날짜 파생은 低.
  let trust: "high" | "low" = "high"

  if (expiryDays != null && expiryDays < 0) {
    lane = "renewal"
    action = "recover_expired"
    const expiredDays = Math.abs(expiryDays)
    bucket = expiredDays > STALE_RECOVERY_EXPIRED_DAYS ? "stale_recovery" : "today"
    actionLabel = bucket === "stale_recovery" ? "장기 회복" : "만료 회복"
    if (bucket === "stale_recovery") {
      reason = `${expiredDays}일 전 만료 · 장기 회복`
      score = 44 + Math.min(16, Math.floor((expiredDays - STALE_RECOVERY_EXPIRED_DAYS) / 14))
      tier = "p3"
    } else {
      // 회복 골든타임(2주)에서 봉우리를 찍고 장기 회복 진입선까지 감쇠한다.
      const pastGolden = Math.max(0, expiredDays - EXPIRED_GOLDEN_DAYS)
      score = Math.max(48, 88 * Math.pow(0.5, pastGolden / EXPIRED_HALF_LIFE_DAYS))
      reason =
        pastGolden > EXPIRED_HALF_LIFE_DAYS / 2
          ? `${expiredDays}일 전 만료 · 식음`
          : `${expiredDays}일 전 만료`
      // 골든타임(만료 후 2주) 안은 이번 주에 살려야 한다. 지나면 기회로 강등.
      tier = expiredDays <= EXPIRED_GOLDEN_DAYS ? "p1" : "p2"
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
    // 만료일은 결제 시스템 데이터 — 놓치면 손실이 확정되는 유일한 시계다.
    tier = expiryDays <= 3 ? "p0" : expiryDays <= 14 ? "p1" : "p2"
  } else if (inactiveDays != null && inactiveDays >= 30 && Number(account.balance ?? 0) > 0) {
    action = "reengage_account"
    actionLabel = "재활성"
    bucket = "watch"
    // NEO 수업 날짜 단독 근거 — 본사 보고용 기록이라 미기입·지연이 흔해 신뢰가 낮다.
    // 티어를 올리지 않고(기회 고정) 화면에 저신뢰 표시를 남긴다. 점수 상한도 만료 점검 수준.
    reason = `${inactiveDays}일 수업 없음 · 잔액 보유`
    score = 48 + Math.min(7, Math.floor((inactiveDays - 30) / 10))
    dueAt = account.expireAt
    tier = "p2"
    trust = "low"
  } else if (Number(account.balance ?? 0) > 0 && expiryDays != null && expiryDays <= 60) {
    action = "watch_account"
    actionLabel = "만료 점검"
    bucket = "watch"
    reason = `${expiryDays}일 내 만료 예정`
    score = 48
    dueAt = account.expireAt
    tier = "p2"
  } else if (
    riskReasonCodes.has("depleted_balance") ||
    (account.balance != null && Number(account.balance) <= 0)
  ) {
    // 잔액 소진이 곧 충전 수요는 아니다. "지금도 살아 있는 고객인가"의 근거를
    // 신뢰 순서로 본다: ① 자체 컨택 45일 내(신뢰 高) ② NEO 수업 45일 내(신뢰 低)
    // ③ 둘 다 없으면 휴면 관찰. NEO 결측은 "수업 없음"과 다르므로 문구를 가른다.
    const ownAlive = ownContactDays != null && ownContactDays <= 45
    const neoAlive = inactiveDays != null && inactiveDays <= 45
    if (ownAlive) {
      action = "renew_account"
      actionLabel = "충전 안내"
      bucket = "today"
      reason = `충전 잔액 소진 · ${ownContactDays === 0 ? "오늘" : `${ownContactDays}일 전`} 컨택`
      score = account.riskLevel === "urgent" ? 82 : 70
      tier = "p1"
    } else if (neoAlive) {
      action = "renew_account"
      actionLabel = "충전 안내"
      bucket = "today"
      reason = "충전 잔액 소진 · NEO 수업 기록 기준"
      score = 62
      tier = "p2"
      trust = "low"
    } else {
      action = "watch_account"
      actionLabel = "휴면 점검"
      bucket = "watch"
      reason =
        inactiveDays == null
          ? "잔액 소진 · 수업 기록 없음(NEO 미기입 가능)"
          : "잔액 소진 · 최근 수업 없음"
      score = 38
      tier = "p3"
      trust = "low"
    }
    // 동기화 시계(updatedAt)는 정렬을 흔들 뿐 업무 시각이 아니다 — 만료일만 쓴다.
    dueAt = account.expireAt ?? null
  }

  // 데모가 잡힌 고객은 만료·잔액과 무관하게 지금 챙겨야 한다 — 다른 사유가 없어도
  // 데모 하나만으로 작업대에 올린다.
  const demo = findDemoSignal(options?.demoIndex ?? EMPTY_DEMO_INDEX, account.name)
  if (demo) {
    // 기존 고객의 데모는 단순 운영 신호가 아니라 추가 매출 기회로 본다.
    lane = "sales"
    action = action ?? "watch_account"
    actionLabel = demo.phase === "recent" ? "데모 후속" : "데모"
    reason = demoSignalLabel(demo)
    bucket = "today"
    score += demoSignalLift(demo)
    dueAt = demo.date
    const demoDays = daysFromNow(demo.date, nowMs)
    tier = raiseTier(
      tier,
      demo.phase === "recent" ? "p2" : demoDays != null && demoDays <= 1 ? "p0" : "p1"
    )
    trust = "high"
  }

  // ─ 자체 예정 작업(crm_tasks) — 리드의 follow_up_at 과 대칭 규칙.
  // 오늘·지연 due 는 오늘 필수로 올리고, 미래 due 는 "이미 잡아둔 건"이라 강등한다.
  if (openTaskDueDays != null && action) {
    if (openTaskDueDays <= 0) {
      tier = raiseTier(tier, "p0")
      reason = `${reason} · ${openTaskDueDays < 0 ? "지연된 예정 작업" : "오늘 예정 작업"}`
      trust = "high"
    } else if (expiryDays == null || expiryDays > 3) {
      // 만료 임박(D-3)은 예정 작업이 있어도 강등하지 않는다 — 돈 손실이 확정되는 시계라서.
      if (TIER_SORT_RANK[tier] < TIER_SORT_RANK.p2) tier = "p2"
      reason = `${reason} · D-${openTaskDueDays} 예정 작업 있음`
    }
  }

  // ─ 중복 전화 방지 — 최근 3일 내 자체 컨택했으면 오늘 필수에서 한 단계 내린다
  // (만료 D-3 이내는 예외 — 컨택했더라도 마감은 마감이다).
  if (
    tier === "p0" &&
    ownContactDays != null &&
    ownContactDays <= 3 &&
    (expiryDays == null || expiryDays > 3)
  ) {
    tier = "p1"
    reason = `${reason} · ${ownContactDays === 0 ? "오늘" : `${ownContactDays}일 전`} 컨택함`
  }

  if (!action) return null

  if (Number(account.orderAmount) > 0) score += 4
  if (Number(account.balance ?? 0) > 0) score += 3

  // ─ 머니 밴드 — 잔액(CNY, 지킬 매출)과 오더(USD, 지불 규모) 중 큰 쪽.
  const orderUsd = Number(account.orderAmount) || 0
  const balanceCny = account.balance != null ? Number(account.balance) || 0 : null
  let moneyBand: CrmMoneyBand
  if (orderUsd >= MONEY_HIGH_ORDER_USD || (balanceCny ?? 0) >= MONEY_HIGH_BALANCE_CNY) moneyBand = "high"
  else if (orderUsd >= MONEY_MID_ORDER_USD || (balanceCny ?? 0) >= MONEY_MID_BALANCE_CNY) moneyBand = "mid"
  else if (orderUsd > 0 || (balanceCny != null && balanceCny > 0)) moneyBand = "low"
  else if (balanceCny == null && orderUsd <= 0) moneyBand = "unknown"
  else moneyBand = "low"
  const moneyParts: string[] = []
  if (balanceCny != null && balanceCny > 0) moneyParts.push(`잔액 ${formatCNY(balanceCny)}`)
  if (orderUsd > 0) moneyParts.push(`오더 ${formatUSD(orderUsd)}`)
  const moneyLabel = moneyParts.length > 0 ? moneyParts.join(" · ") : null

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
    severity: TIER_SEVERITY[tier],
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
    tier,
    tierLabel: CRM_PRIORITY_TIER_LABELS[tier],
    moneyBand,
    moneyLabel,
    trust,
    labels: account.regionLabel ? [account.regionLabel] : [],
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
  // 할 일은 전부 자체 기록(서버 타임스탬프) — 마감 기준으로 티어를 정한다.
  let tier: CrmPriorityTier = "p2"

  const dueDays = daysFromNow(effectiveDue, nowMs)
  if (dueDays != null) {
    if (dueDays < 0) {
      bucket = "today"
      score += Math.min(14, Math.abs(dueDays) * 2 + 6)
      reason = `${Math.abs(dueDays)}일 지연된 할 일`
      tier = Math.abs(dueDays) > 7 ? "p1" : "p0"
    } else if (dueDays === 0) {
      bucket = "today"
      score += 8
      reason = "오늘 마감"
      tier = "p0"
    } else if (dueDays <= 2) {
      score += 3
      reason = `${dueDays}일 뒤 예정`
      tier = "p1"
    } else {
      reason = `${dueDays}일 뒤 예정`
      tier = "p2"
    }
  } else if (task.priority === "urgent" || task.priority === "high") {
    bucket = "today"
    reason = "마감일 없는 중요 할 일"
    tier = "p1"
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
    severity: TIER_SEVERITY[tier],
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
    tier,
    tierLabel: CRM_PRIORITY_TIER_LABELS[tier],
    moneyBand: "unknown",
    moneyLabel: null,
    trust: "high",
  }
}

// 정렬 캐논 — 티어(오늘 필수→관찰) → 돈(큰 돈부터) → 마감(빠른 순) → 점수(내부 타이브레이커).
// 연속 점수는 더 이상 1축이 아니다: 같은 티어·같은 돈 급에서만 미세 순서를 정한다.
export function sortPriorityItems(items: CrmPriorityItem[]) {
  return [...items].sort((a, b) => {
    const tierDelta = TIER_SORT_RANK[a.tier] - TIER_SORT_RANK[b.tier]
    if (tierDelta !== 0) return tierDelta
    const moneyDelta = MONEY_SORT_RANK[a.moneyBand] - MONEY_SORT_RANK[b.moneyBand]
    if (moneyDelta !== 0) return moneyDelta
    const aTime = parseTime(a.dueAt) ?? Number.MAX_SAFE_INTEGER
    const bTime = parseTime(b.dueAt) ?? Number.MAX_SAFE_INTEGER
    if (aTime !== bTime) return aTime - bTime
    if (b.score !== a.score) return b.score - a.score
    return (parseTime(a.updatedAt) ?? 0) - (parseTime(b.updatedAt) ?? 0)
  })
}
