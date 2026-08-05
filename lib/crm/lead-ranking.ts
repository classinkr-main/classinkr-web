/**
 * 리드 우선순위 · 정렬 · 검색 — 순수 모듈(서버 의존 없음, 단위 테스트 대상).
 *
 * 리드 보드의 기본 순서는 "최근 등록순"이었다. 그래서 3개월 전에 데모를 신청하고
 * 지금도 매주 자료를 받아가는 300명 규모 학원이, 오늘 들어온 뉴스레터 구독 1건보다
 * 아래에 깔렸다. 이 모듈은 그 순서를 다섯 축의 합성 점수로 바꾼다:
 *
 *   주요(value)      — 매출 근접도: 진행 단계(컨택) · 유입 의도(데모·문의) · 규모 · 도달 가능성
 *   반응(response)   — 상대가 우리 쪽으로 움직였는가: 연락 후 재방문 · 자료 수령 · 로그인 신원
 *   최근(recency)    — 마지막 접점(유입/활동/연락) 이후 경과. 14일 반감기 지수감쇠
 *   자주(frequency)  — 사이트 활동·자료 다운로드·우리 쪽 연락 횟수
 *   긴급(urgency)    — 응대 SLA(미응답)와 지연된 팔로업
 *
 * value 는 원(₩) 추정이 아니다. 리드 테이블에는 금액이 없고 단가 상수도 저장소에
 * 없어서, 임의의 환산은 근거 없는 숫자를 만든다. 대신 "예상 매출에 얼마나 가까운가"를
 * 0~100 상대 점수로만 표현하고, 근거(원생 수·데모 신청 등)를 reasons 로 같이 돌려준다.
 *
 * ─── 긴급(urgency)을 봉우리형으로 바꾼 이유 ───────────────────────
 * 이전 버전은 미응답·지연 팔로업이 **오래될수록 점수가 계속 올라갔다**(지연일수 × 5).
 * 그래서 40일 밀린 죽은 리드가 어제 데모를 신청한 300명 학원을 이겼다. 방치는 급한
 * 일의 신호이긴 하지만 오래된 방치는 급한 게 아니라 **식은 것**이다. 지금은 놓치기
 * 직전 구간에서 봉우리를 찍고 그 뒤로는 반감기로 식는다. SLA 는 목록에 남되 상단을
 * 독점하지 않는다.
 */

import { getLeadMagnetIntentScore } from "@/lib/lead-magnets"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"

import { RESPONSE_TARGET_SOURCES, getLeadSourceDetail } from "@/lib/crm/lead-attribution"

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/** 최근 점수 반감기 — 14일 지나면 절반, 28일이면 1/4. */
const RECENCY_HALF_LIFE_DAYS = 14
/** 자주 점수가 만점에 닿는 가중 접점 수. 로그 스케일이라 1~5회 구간이 가장 가파르다. */
const FREQUENCY_SATURATION = 40

// ─── 참여 신호 ─────────────────────────────────────────────────
// 리드 1건에 붙는 행동 신호 묶음. 서버(getLeadsActivitySummary)가 채워 보내고,
// 보드는 리드 id → LeadEngagement 맵으로 받는다. 신호가 없으면 EMPTY 를 쓴다.
export interface LeadEngagement {
  /** 공개 사이트 로그인(구글/네이버/카카오) 신원이 붙었는지 */
  authenticated: boolean
  providers: string[]
  /** 게이트 자료 다운로드 건수 */
  downloadCount: number
  /** client_events 적재 건수(페이지뷰·CTA 등) */
  eventCount: number
  /** 우리 쪽 연락 기록(전화·문자·카카오·이메일) 건수 */
  contactLogCount: number
  /** 사이트 활동(이벤트·다운로드) 마지막 시각 */
  lastActivityAt: string | null
  /** 우리가 마지막으로 연락한 시각 */
  lastContactAt: string | null
}

export const EMPTY_LEAD_ENGAGEMENT: LeadEngagement = {
  authenticated: false,
  providers: [],
  downloadCount: 0,
  eventCount: 0,
  contactLogCount: 0,
  lastActivityAt: null,
  lastContactAt: null,
}

export type LeadEngagementMap = Record<string, LeadEngagement>

export function getEngagement(map: LeadEngagementMap | undefined, leadId: string): LeadEngagement {
  return map?.[leadId] ?? EMPTY_LEAD_ENGAGEMENT
}

// ─── 유입 의도(매출 근접도의 입력) ─────────────────────────────
// "이 경로로 들어온 사람이 구매 대화에 얼마나 가까운가"의 사전값. 데모 신청이 최상단,
// 뉴스레터 구독이 최하단. 표에 없는 source 는 DEFAULT.
const SOURCE_INTENT: Record<string, number> = {
  demo_modal: 30,
  contact_page: 22,
  meta_lead_ads: 14,
  seminar: 14,
  showroom: 14,
  event: 12,
  team_event: 12,
  channel_talk: 11,
  channel_talk_mining: 8,
  chatbot: 10,
  home_final_cta: 10,
  admin_manual: 10,
  manual: 10,
  home_lead_magnet: 8,
  lead_magnet: 7,
  blog_lead_magnet: 7,
  resource_pdf_download: 6,
  resource_pdf_cta: 6,
  newsletter: 3,
}
const SOURCE_INTENT_DEFAULT = 5

function clamp100(value: number) {
  return Math.max(0, Math.min(100, value))
}

function parseTimeMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** "300명" · "300~500" · "약 120" 같은 자유입력에서 첫 숫자만 뽑는다. 없으면 0. */
export function parseLeadSize(value: string | undefined | null): number {
  if (!value) return 0
  const match = value.replace(/,/g, "").match(/\d+/)
  if (!match) return 0
  const parsed = Number.parseInt(match[0], 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function isActiveLeadStatus(status: LeadStatus) {
  return status !== "converted" && status !== "closed"
}

function isUnrespondedLead(lead: LeadRecord) {
  return lead.status === "new" && RESPONSE_TARGET_SOURCES.has(lead.source)
}

/**
 * 마지막 접점 — 유입 시각 / 사이트 활동 / 우리 연락 중 가장 최근.
 * "최근"의 정의를 등록일 하나로 두면 오래된 리드의 재방문·재다운로드가 묻힌다.
 */
export function getLeadLastTouchMs(lead: LeadRecord, engagement: LeadEngagement): number {
  const candidates = [
    parseTimeMs(lead.timestamp),
    parseTimeMs(engagement.lastActivityAt),
    parseTimeMs(engagement.lastContactAt),
  ].filter((value): value is number => value != null)
  return candidates.length ? Math.max(...candidates) : 0
}

/** 가중 접점 수 — 손이 더 많이 간 신호일수록 크게 센다. */
export function getWeightedTouchCount(engagement: LeadEngagement): number {
  return (
    engagement.eventCount +
    engagement.downloadCount * 3 +
    engagement.contactLogCount * 4 +
    (engagement.authenticated ? 6 : 0)
  )
}

export function scoreRecency(lastTouchMs: number, nowMs: number): number {
  if (!lastTouchMs) return 0
  const days = Math.max(0, (nowMs - lastTouchMs) / DAY_MS)
  return clamp100(Math.round(100 * Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS)))
}

export function scoreFrequency(engagement: LeadEngagement): number {
  const weighted = getWeightedTouchCount(engagement)
  if (weighted <= 0) return 0
  return clamp100(Math.round((100 * Math.log1p(weighted)) / Math.log1p(FREQUENCY_SATURATION)))
}

/**
 * 매출 근접도 — 규모 + 유입 의도 + 진행 단계 + 도달 가능성.
 * 계약 금액이 없는 리드 단계에서 "이 사람이 매출에 가까운가"를 세우는 대리 지표.
 */
export function scoreValue(lead: LeadRecord, engagement?: LeadEngagement): number {
  let score = 0

  // 규모: 원생 수는 계약 규모의 1차 프록시(HW 대수·SW 좌석 모두 여기에 비례).
  const size = parseLeadSize(lead.size)
  if (size >= 500) score += 34
  else if (size >= 300) score += 30
  else if (size >= 150) score += 24
  else if (size >= 100) score += 19
  else if (size >= 50) score += 13
  else if (size > 0) score += 8

  // 의도: 어떤 경로로 들어왔나.
  score += SOURCE_INTENT[lead.source] ?? SOURCE_INTENT_DEFAULT
  if (lead.lead_magnet) score += Math.round(getLeadMagnetIntentScore(lead.lead_magnet) / 2)

  // 진행: 대화가 시작됐고 다음 약속이 잡혀 있나.
  // 컨택은 이 축에서 가장 무거운 단일 신호다 — 아직 말도 못 붙인 리드 100건보다
  // 이미 대화가 열린 1건이 매출에 가깝다.
  //
  // status 하나에만 기대지 않는다. 실측(2026-08-05)상 리드 114건이 전부 status=new 였다 —
  // 실제로 연락을 안 한 게 아니라 목록에서 상태를 안 바꾼 것에 가깝다. 연락 기록이
  // 남아 있으면 상태 표기와 무관하게 컨택으로 친다.
  const contacted = lead.status === "contacted" || (engagement?.contactLogCount ?? 0) > 0
  if (contacted) score += 22
  if (lead.follow_up_at) score += 12

  // 도달 가능성: 지금 당장 연결할 수단이 있나.
  if (lead.phone) score += 12
  else if (lead.email) score += 5
  if (lead.org) score += 8
  if (lead.assigned_to?.trim()) score += 4

  return clamp100(score)
}

/**
 * 봉우리 이후 감쇠 — 신호가 가장 뜨거운 구간에서 최고점을 찍고 반감기로 식는다.
 * "오래 방치됨 = 더 급함"이라는 단조 증가를 끊는 장치.
 */
function decayAfterPeak(peakScore: number, daysPastPeak: number, halfLifeDays: number, floor = 0) {
  if (daysPastPeak <= 0) return peakScore
  return Math.max(floor, peakScore * Math.pow(0.5, daysPastPeak / halfLifeDays))
}

/** 미응답이 봉우리를 찍는 지점 — 이 시각을 넘기면 놓친 것에 가깝다. */
const UNRESPONDED_PEAK_HOURS = 48
const UNRESPONDED_HALF_LIFE_DAYS = 3
/** 팔로업 지연이 봉우리를 유지하는 기간. 이후 감쇠. */
const FOLLOW_UP_PEAK_DAYS = 3
const FOLLOW_UP_HALF_LIFE_DAYS = 4

/**
 * 응대 SLA·팔로업 지연. 비활성(전환/종료) 리드는 0.
 *
 * 곡선: 미응답은 24~48h 에서 88 로 봉우리를 찍고 3일 반감기로 식는다(2주 방치 ≈ 12).
 * 지연 팔로업은 1~3일 지연에서 86, 이후 4일 반감기(2주 지연 ≈ 15). 둘 다 바닥이 있어
 * 목록에서 사라지지는 않되, 살아 있는 거래를 밀어내지 못한다.
 */
export function scoreUrgency(lead: LeadRecord, nowMs: number, todayKey: string): number {
  if (!isActiveLeadStatus(lead.status)) return 0
  let score = 0

  if (isUnrespondedLead(lead)) {
    const hours = Math.max(0, (nowMs - (parseTimeMs(lead.timestamp) ?? nowMs)) / HOUR_MS)
    if (hours >= UNRESPONDED_PEAK_HOURS) {
      const daysPast = (hours - UNRESPONDED_PEAK_HOURS) / 24
      score = Math.max(score, decayAfterPeak(88, daysPast, UNRESPONDED_HALF_LIFE_DAYS, 10))
    } else if (hours >= 24) score = Math.max(score, 88)
    else if (hours >= 6) score = Math.max(score, 70)
    else score = Math.max(score, 52)
  }

  if (lead.follow_up_at) {
    const followUpKey = toLocalDateKey(lead.follow_up_at)
    if (followUpKey < todayKey) {
      const overdueDays = Math.max(
        1,
        Math.floor((nowMs - (parseTimeMs(lead.follow_up_at) ?? nowMs)) / DAY_MS)
      )
      score = Math.max(
        score,
        decayAfterPeak(86, overdueDays - FOLLOW_UP_PEAK_DAYS, FOLLOW_UP_HALF_LIFE_DAYS, 10)
      )
    } else if (followUpKey === todayKey) {
      score = Math.max(score, 72)
    }
  }

  return clamp100(Math.round(score))
}

/**
 * 반응 — 상대가 우리 쪽으로 움직였는가. value(우리가 본 잠재력)와 달리 이 축은
 * 리드 본인의 행동만 센다. 우리가 다섯 번 전화한 건 frequency 가 세지 반응이 아니다.
 *
 * 가장 무거운 신호는 "우리 연락 이후의 재방문" — 회신 여부를 직접 저장하는 컬럼이
 * 없으므로, 연락 시각 뒤에 사이트 활동이 찍혔는지로 대신한다. 이 반응도 시간이
 * 지나면 식으므로 21일 반감기를 건다.
 */
export function scoreResponse(engagement: LeadEngagement, nowMs: number): number {
  let score = 0

  const contactMs = parseTimeMs(engagement.lastContactAt)
  const activityMs = parseTimeMs(engagement.lastActivityAt)
  if (contactMs != null && activityMs != null && activityMs > contactMs) {
    const daysSince = Math.max(0, (nowMs - activityMs) / DAY_MS)
    score += 46 * Math.pow(0.5, daysSince / 21)
  }

  // 자료를 직접 받아갔다 — 노출이 아니라 능동 행동.
  if (engagement.downloadCount > 0) score += Math.min(24, 12 + (engagement.downloadCount - 1) * 6)

  // 소셜 로그인으로 신원을 내줬다 — 익명 트래픽과 갈리는 지점.
  if (engagement.authenticated) score += 18

  // 재방문 — 한 번 보고 만 게 아니다.
  if (engagement.eventCount >= 8) score += 16
  else if (engagement.eventCount >= 3) score += 9

  return clamp100(Math.round(score))
}

// 축별 가중치 — 운영 요청 순서(컨택·데모·감도 = value, 반응 = response)를 주축으로 두고,
// 응대 SLA(긴급)는 목록에서 사라지지 않을 만큼만 남긴다. 합은 1.
//
// value + response 가 0.52 로 과반이라, "대화가 열렸고 상대가 반응하는 거래"가
// "아무 반응 없이 오래 방치된 리드"를 항상 이긴다. urgency 는 0.18 → 0.10 으로 강등.
const WEIGHT = { value: 0.32, response: 0.2, recency: 0.22, frequency: 0.16, urgency: 0.1 }
/** 전환·종료 리드는 목록에서 지우지 않되 상단은 비워준다. */
const INACTIVE_MULTIPLIER = 0.35

export interface LeadPriority {
  total: number
  recency: number
  frequency: number
  value: number
  response: number
  urgency: number
  /** 왜 위로 올라왔는지 — 행에 칩으로 그대로 노출한다(최대 3개). */
  reasons: string[]
}

export function calcLeadPriority(
  lead: LeadRecord,
  engagement: LeadEngagement,
  nowMs: number
): LeadPriority {
  const todayKey = toLocalDateKey(new Date(nowMs))
  const lastTouchMs = getLeadLastTouchMs(lead, engagement)
  const recency = scoreRecency(lastTouchMs, nowMs)
  const frequency = scoreFrequency(engagement)
  const value = scoreValue(lead, engagement)
  const response = scoreResponse(engagement, nowMs)
  const urgency = scoreUrgency(lead, nowMs, todayKey)

  const blended =
    WEIGHT.value * value +
    WEIGHT.response * response +
    WEIGHT.recency * recency +
    WEIGHT.frequency * frequency +
    WEIGHT.urgency * urgency
  const total = clamp100(
    Math.round(isActiveLeadStatus(lead.status) ? blended : blended * INACTIVE_MULTIPLIER)
  )

  return {
    total,
    recency,
    frequency,
    value,
    response,
    urgency,
    reasons: buildPriorityReasons(lead, engagement, nowMs, todayKey, lastTouchMs),
  }
}

function buildPriorityReasons(
  lead: LeadRecord,
  engagement: LeadEngagement,
  nowMs: number,
  todayKey: string,
  lastTouchMs: number
): string[] {
  // 순서 = 우선순위를 실제로 끌어올린 순서. 방치 신호(미응답·지연)는 맨 뒤로 보낸다 —
  // 칩 3개 안에서 먼저 보여야 할 건 "왜 지금 이 고객인가"지 "왜 늦었나"가 아니다.
  const reasons: string[] = []
  const active = isActiveLeadStatus(lead.status)

  if (active && lead.follow_up_at && toLocalDateKey(lead.follow_up_at) === todayKey) {
    reasons.push("오늘 팔로업")
  }

  // 반응 — 우리가 연락한 뒤에 상대가 다시 움직인 흔적.
  const contactMs = parseTimeMs(engagement.lastContactAt)
  const activityMs = parseTimeMs(engagement.lastActivityAt)
  if (contactMs != null && activityMs != null && activityMs > contactMs) {
    const days = Math.floor((nowMs - activityMs) / DAY_MS)
    reasons.push(days <= 0 ? "연락 후 재방문" : `연락 후 재방문 ${days}일 전`)
  }

  if (active && (lead.status === "contacted" || engagement.contactLogCount > 0)) {
    reasons.push("연락 진행 중")
  }
  if (lead.source === "demo_modal") reasons.push("데모 신청")

  const size = parseLeadSize(lead.size)
  if (size >= 100) reasons.push(`원생 ${size.toLocaleString("ko-KR")}명`)

  const touches = engagement.eventCount + engagement.downloadCount + engagement.contactLogCount
  if (touches >= 3) {
    if (engagement.downloadCount > 0) reasons.push(`자료 ${engagement.downloadCount}건 · 활동 ${touches}회`)
    else reasons.push(`활동 ${touches}회`)
  } else if (engagement.downloadCount > 0) {
    reasons.push(`자료 ${engagement.downloadCount}건`)
  }

  // 유입 자체가 최근 접점이면 "N일 전 활동"은 시간 컬럼과 같은 말이라 생략한다.
  if (activityMs && activityMs === lastTouchMs && activityMs > (parseTimeMs(lead.timestamp) ?? 0)) {
    const days = Math.floor((nowMs - activityMs) / DAY_MS)
    reasons.push(days <= 0 ? "오늘 사이트 활동" : `${days}일 전 사이트 활동`)
  }

  // ─ 방치 신호: 여기서부터는 "늦었다"는 말이라 뒤에 붙인다.
  if (active) {
    if (lead.follow_up_at) {
      const followUpKey = toLocalDateKey(lead.follow_up_at)
      if (followUpKey < todayKey) {
        const overdueDays = Math.max(
          1,
          Math.floor((nowMs - (parseTimeMs(lead.follow_up_at) ?? nowMs)) / DAY_MS)
        )
        // 봉우리를 지난 지연은 급한 게 아니라 식은 것 — 점수 강등과 라벨을 일치시킨다.
        const cooled = overdueDays > FOLLOW_UP_PEAK_DAYS + FOLLOW_UP_HALF_LIFE_DAYS
        reasons.push(`팔로업 ${overdueDays}일 지연${cooled ? " · 식음" : ""}`)
      }
    }
    if (isUnrespondedLead(lead)) {
      const hours = Math.max(0, Math.floor((nowMs - (parseTimeMs(lead.timestamp) ?? nowMs)) / HOUR_MS))
      const cooled = hours > UNRESPONDED_PEAK_HOURS + UNRESPONDED_HALF_LIFE_DAYS * 24
      reasons.push(`미응답 ${formatDuration(hours)}${cooled ? " · 식음" : ""}`)
    }
  }

  return reasons.slice(0, 3)
}

function formatDuration(hours: number) {
  if (hours < 24) return `${hours}시간`
  const days = Math.floor(hours / 24)
  return `${days}일`
}

export function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

// ─── 정렬 ──────────────────────────────────────────────────────
export type LeadSortKey =
  | "priority"
  | "recent_touch"
  | "frequent"
  | "value"
  | "newest"
  | "oldest"
  | "followup"
  | "name"
  | "org"

export const LEAD_SORT_OPTIONS: Array<{ key: LeadSortKey; label: string; hint: string }> = [
  { key: "priority", label: "우선순위", hint: "컨택 · 데모 · 감도 · 반응 합성(기본)" },
  { key: "recent_touch", label: "최근 접점", hint: "유입·활동·연락 중 최신순" },
  { key: "frequent", label: "활동 많은 순", hint: "이벤트·자료·연락 횟수" },
  { key: "value", label: "매출 근접", hint: "규모·의도·진행 단계" },
  { key: "newest", label: "최근 유입", hint: "등록 시각 최신순" },
  { key: "oldest", label: "오래된 유입", hint: "등록 시각 오래된순" },
  { key: "followup", label: "팔로업 임박", hint: "지연·오늘 예정 먼저" },
  { key: "name", label: "이름", hint: "가나다순" },
  { key: "org", label: "기관", hint: "가나다순" },
]

export const LEAD_SORT_KEYS = LEAD_SORT_OPTIONS.map((option) => option.key)

export function isLeadSortKey(value: string | null | undefined): value is LeadSortKey {
  return Boolean(value) && (LEAD_SORT_KEYS as string[]).includes(value as string)
}

function compareKo(a: string, b: string) {
  return a.localeCompare(b, "ko")
}

/** 정렬 키가 못 가리는 구간(동점·값 없음)은 항상 최신 유입순으로 떨어진다. */
function fallbackNewest(a: LeadRecord, b: LeadRecord) {
  return (parseTimeMs(b.timestamp) ?? 0) - (parseTimeMs(a.timestamp) ?? 0)
}

export interface SortLeadsContext {
  engagements?: LeadEngagementMap
  priorities?: Map<string, LeadPriority>
  nowMs: number
}

export function sortLeads(
  leads: LeadRecord[],
  sortKey: LeadSortKey,
  context: SortLeadsContext
): LeadRecord[] {
  const { engagements, nowMs } = context
  const priorityOf = (lead: LeadRecord) =>
    context.priorities?.get(lead.id) ??
    calcLeadPriority(lead, getEngagement(engagements, lead.id), nowMs)
  const sorted = [...leads]

  switch (sortKey) {
    case "priority":
      return sorted.sort(
        (a, b) => priorityOf(b).total - priorityOf(a).total || fallbackNewest(a, b)
      )
    case "recent_touch":
      return sorted.sort(
        (a, b) =>
          getLeadLastTouchMs(b, getEngagement(engagements, b.id)) -
            getLeadLastTouchMs(a, getEngagement(engagements, a.id)) || fallbackNewest(a, b)
      )
    case "frequent":
      return sorted.sort(
        (a, b) =>
          getWeightedTouchCount(getEngagement(engagements, b.id)) -
            getWeightedTouchCount(getEngagement(engagements, a.id)) || fallbackNewest(a, b)
      )
    case "value":
      return sorted.sort(
        (a, b) =>
          scoreValue(b, getEngagement(engagements, b.id)) -
            scoreValue(a, getEngagement(engagements, a.id)) || fallbackNewest(a, b)
      )
    case "newest":
      return sorted.sort(fallbackNewest)
    case "oldest":
      return sorted.sort((a, b) => (parseTimeMs(a.timestamp) ?? 0) - (parseTimeMs(b.timestamp) ?? 0))
    case "followup":
      // 예정일이 있는 리드가 먼저(빠른 날짜순), 없는 리드는 뒤로 밀고 최신 유입순.
      return sorted.sort((a, b) => {
        const aTime = parseTimeMs(a.follow_up_at)
        const bTime = parseTimeMs(b.follow_up_at)
        if (aTime == null && bTime == null) return fallbackNewest(a, b)
        if (aTime == null) return 1
        if (bTime == null) return -1
        return aTime - bTime || fallbackNewest(a, b)
      })
    case "name":
      return sorted.sort(
        (a, b) =>
          compareKo(a.name?.trim() || a.org?.trim() || "", b.name?.trim() || b.org?.trim() || "") ||
          fallbackNewest(a, b)
      )
    case "org":
      return sorted.sort(
        (a, b) =>
          compareKo(a.org?.trim() || a.name?.trim() || "", b.org?.trim() || b.name?.trim() || "") ||
          fallbackNewest(a, b)
      )
  }
}

// ─── 검색 ──────────────────────────────────────────────────────
// 토큰 AND 검색 — "강남 300" 처럼 두 조건을 이어 붙이면 둘 다 만족하는 리드만 남는다.
// 큰따옴표로 묶으면 공백 포함 구문 하나로 취급한다.
export function tokenizeLeadSearch(query: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(query)) !== null) {
    const token = (match[1] ?? match[2] ?? "").trim().toLowerCase()
    if (token) tokens.push(token)
  }
  return tokens
}

/** 검색 대상 필드 — 연락처·귀속·메모·담당자까지 한 줄로 접어 토큰마다 대조한다. */
export function buildLeadSearchHaystack(lead: LeadRecord): string {
  return [
    lead.name,
    lead.org,
    lead.role,
    lead.size,
    lead.email,
    lead.phone,
    // 전화번호는 하이픈 유무가 갈려서 숫자만 남긴 형태도 같이 넣는다.
    lead.phone?.replace(/\D/g, ""),
    lead.message,
    lead.notes,
    lead.branch,
    lead.assigned_to,
    lead.source,
    getLeadSourceDetail(lead),
    lead.lead_magnet,
    lead.utm_source,
    lead.utm_medium,
    lead.utm_campaign,
    lead.utm_term,
    lead.utm_content,
    lead.landing_page,
    lead.referrer,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function matchesLeadSearch(lead: LeadRecord, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const haystack = buildLeadSearchHaystack(lead)
  return tokens.every((token) => haystack.includes(token))
}

// ─── 트래킹 롤업 ───────────────────────────────────────────────
export interface TrackingRollupRow {
  key: string
  label: string
  total: number
  newCount: number
  contacted: number
  converted: number
  unresponded: number
  /** 전환율 = converted / total (0~1) */
  convRate: number
  lastAt: string | null
}

export interface TrackingRollup {
  rows: TrackingRollupRow[]
  /** 이 축의 값이 비어 있는 리드 수 — 커버리지 갭을 숨기지 않는다. */
  untrackedCount: number
  total: number
}

export function buildTrackingRollup(
  leads: LeadRecord[],
  getKey: (lead: LeadRecord) => string | null
): TrackingRollup {
  const map = new Map<string, TrackingRollupRow>()
  let untrackedCount = 0

  for (const lead of leads) {
    const key = getKey(lead)
    if (!key) {
      untrackedCount += 1
      continue
    }
    const row =
      map.get(key) ??
      {
        key,
        label: key,
        total: 0,
        newCount: 0,
        contacted: 0,
        converted: 0,
        unresponded: 0,
        convRate: 0,
        lastAt: null,
      }
    row.total += 1
    if (lead.status === "new") row.newCount += 1
    if (lead.status === "contacted") row.contacted += 1
    if (lead.status === "converted") row.converted += 1
    if (isUnrespondedLead(lead)) row.unresponded += 1
    if (!row.lastAt || lead.timestamp > row.lastAt) row.lastAt = lead.timestamp
    map.set(key, row)
  }

  const rows = Array.from(map.values())
    .map((row) => ({ ...row, convRate: row.total > 0 ? row.converted / row.total : 0 }))
    // 전환 성과가 같으면 건수 많은 쪽, 그것도 같으면 최근 유입이 있는 쪽.
    .sort(
      (a, b) =>
        b.converted - a.converted ||
        b.total - a.total ||
        (b.lastAt ?? "").localeCompare(a.lastAt ?? "")
    )

  return { rows, untrackedCount, total: leads.length }
}
