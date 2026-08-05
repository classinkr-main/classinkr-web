/**
 * 리드 우선순위 · 정렬 · 검색 — 순수 모듈(서버 의존 없음, 단위 테스트 대상).
 *
 * 리드 보드의 기본 순서는 "최근 등록순"이었다. 그래서 3개월 전에 데모를 신청하고
 * 지금도 매주 자료를 받아가는 300명 규모 학원이, 오늘 들어온 뉴스레터 구독 1건보다
 * 아래에 깔렸다. 이 모듈은 그 순서를 네 축의 합성 점수로 바꾼다:
 *
 *   자주(frequency) — 사이트 활동·자료 다운로드·우리 쪽 연락 횟수
 *   최근(recency)   — 마지막 접점(유입/활동/연락) 이후 경과. 14일 반감기 지수감쇠
 *   주요(value)     — 매출 근접도: 규모(원생 수) · 유입 의도 · 진행 단계 · 도달 가능성
 *   긴급(urgency)   — 응대 SLA(미응답 24/48h)와 지연된 팔로업
 *
 * value 는 원(₩) 추정이 아니다. 리드 테이블에는 금액이 없고 단가 상수도 저장소에
 * 없어서, 임의의 환산은 근거 없는 숫자를 만든다. 대신 "예상 매출에 얼마나 가까운가"를
 * 0~100 상대 점수로만 표현하고, 근거(원생 수·데모 신청 등)를 reasons 로 같이 돌려준다.
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
  demo_modal: 24,
  contact_page: 18,
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
export function scoreValue(lead: LeadRecord): number {
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
  if (lead.status === "contacted") score += 14
  if (lead.follow_up_at) score += 8

  // 도달 가능성: 지금 당장 연결할 수단이 있나.
  if (lead.phone) score += 12
  else if (lead.email) score += 5
  if (lead.org) score += 8
  if (lead.assigned_to?.trim()) score += 4

  return clamp100(score)
}

/** 응대 SLA·팔로업 지연. 비활성(전환/종료) 리드는 0. */
export function scoreUrgency(lead: LeadRecord, nowMs: number, todayKey: string): number {
  if (!isActiveLeadStatus(lead.status)) return 0
  let score = 0

  if (isUnrespondedLead(lead)) {
    const hours = Math.max(0, (nowMs - (parseTimeMs(lead.timestamp) ?? nowMs)) / HOUR_MS)
    if (hours >= 48) score = Math.max(score, 100)
    else if (hours >= 24) score = Math.max(score, 78)
    else score = Math.max(score, 55)
  }

  if (lead.follow_up_at) {
    const followUpKey = toLocalDateKey(lead.follow_up_at)
    if (followUpKey < todayKey) {
      const overdueDays = Math.max(
        1,
        Math.floor((nowMs - (parseTimeMs(lead.follow_up_at) ?? nowMs)) / DAY_MS)
      )
      score = Math.max(score, Math.min(95, 60 + overdueDays * 5))
    } else if (followUpKey === todayKey) {
      score = Math.max(score, 62)
    }
  }

  return clamp100(score)
}

// 축별 가중치 — 사용자 요청 순서(자주·최근·주요)를 주축으로 두고, 이미 운영 중인
// 응대 SLA(긴급)를 무너뜨리지 않을 만큼만 섞는다. 합은 1.
const WEIGHT = { recency: 0.28, frequency: 0.24, value: 0.3, urgency: 0.18 }
/** 전환·종료 리드는 목록에서 지우지 않되 상단은 비워준다. */
const INACTIVE_MULTIPLIER = 0.35

export interface LeadPriority {
  total: number
  recency: number
  frequency: number
  value: number
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
  const value = scoreValue(lead)
  const urgency = scoreUrgency(lead, nowMs, todayKey)

  const blended =
    WEIGHT.recency * recency +
    WEIGHT.frequency * frequency +
    WEIGHT.value * value +
    WEIGHT.urgency * urgency
  const total = clamp100(
    Math.round(isActiveLeadStatus(lead.status) ? blended : blended * INACTIVE_MULTIPLIER)
  )

  return {
    total,
    recency,
    frequency,
    value,
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
  const reasons: string[] = []

  if (isActiveLeadStatus(lead.status)) {
    if (isUnrespondedLead(lead)) {
      const hours = Math.max(0, Math.floor((nowMs - (parseTimeMs(lead.timestamp) ?? nowMs)) / HOUR_MS))
      reasons.push(`미응답 ${formatDuration(hours)}`)
    }
    if (lead.follow_up_at) {
      const followUpKey = toLocalDateKey(lead.follow_up_at)
      if (followUpKey < todayKey) {
        const overdueDays = Math.max(
          1,
          Math.floor((nowMs - (parseTimeMs(lead.follow_up_at) ?? nowMs)) / DAY_MS)
        )
        reasons.push(`팔로업 ${overdueDays}일 지연`)
      } else if (followUpKey === todayKey) {
        reasons.push("오늘 팔로업")
      }
    }
  }

  const touches = engagement.eventCount + engagement.downloadCount + engagement.contactLogCount
  if (touches >= 3) {
    if (engagement.downloadCount > 0) reasons.push(`자료 ${engagement.downloadCount}건 · 활동 ${touches}회`)
    else reasons.push(`활동 ${touches}회`)
  } else if (engagement.downloadCount > 0) {
    reasons.push(`자료 ${engagement.downloadCount}건`)
  }

  // 유입 자체가 최근 접점이면 "N일 전 활동"은 시간 컬럼과 같은 말이라 생략한다.
  const activityMs = parseTimeMs(engagement.lastActivityAt)
  if (activityMs && activityMs === lastTouchMs && activityMs > (parseTimeMs(lead.timestamp) ?? 0)) {
    const days = Math.floor((nowMs - activityMs) / DAY_MS)
    reasons.push(days <= 0 ? "오늘 사이트 활동" : `${days}일 전 사이트 활동`)
  }

  const size = parseLeadSize(lead.size)
  if (size >= 100) reasons.push(`원생 ${size.toLocaleString("ko-KR")}명`)
  if (lead.source === "demo_modal") reasons.push("데모 신청")

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
  { key: "priority", label: "우선순위", hint: "자주 · 최근 · 주요 합성(기본)" },
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
      return sorted.sort((a, b) => scoreValue(b) - scoreValue(a) || fallbackNewest(a, b))
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
