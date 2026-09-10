// 캠페인 허브 "광고 리드" 섹션의 순수 규칙 — 렌즈 판정·기간 필터·통계·CSV.
//
// UI(components/admin/campaigns/leads/AdLeadsPanel)와 테스트가 같은 함수를 보게 분리했다.
// 유입 채널·트래킹 축 매핑은 lib/crm/lead-attribution의 SSOT를 그대로 쓴다(재정의 금지).

import {
  getLeadAdLabel,
  getLeadCampaignLabel,
  getLeadChannelLabel,
  getLeadSourceGroup,
  getLeadSourceDetail,
  isConversionEligibleLead,
  isConvertedLead,
  isMarketingLead,
  isTestLead,
} from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

// ─── 렌즈 ─────────────────────────────────────────────────────
// "광고 리드"라고 부르지만 실제로 두 폭이 필요하다:
//  - paid: 돈을 써서 데려온 리드만. 광고비·CPL과 나란히 놓고 봐야 하는 모집단.
//  - marketing: 마케팅이 만든 유입 전체(홈페이지·자료실·뉴스레터 포함). 캠페인 성과의 넓은 폭.
// 기본은 paid — 광고 탭에서 CPL·ROI 옆에 놓이는 숫자가 "광고로 온 리드"여야 말이 된다.
export type AdLeadLens = "paid" | "marketing"

export const AD_LEAD_LENS_OPTIONS: Array<{ value: AdLeadLens; label: string; hint: string }> = [
  { value: "paid", label: "광고 유입", hint: "Meta 리드애즈 · 광고 클릭ID · 유료 매체 UTM" },
  { value: "marketing", label: "마케팅 전체", hint: "광고 + 홈페이지·자료실·뉴스레터·챗봇 등 마케팅 채널" },
]

/** 유료 매체를 뜻하는 utm_medium 값. 표기 흔들림(cpc/ppc/paid-social…)을 한 곳에서 흡수한다. */
const PAID_MEDIUMS = new Set([
  "cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social",
  "cpm", "display", "banner", "retargeting", "remarketing",
])

function normalizedMedium(lead: LeadRecord) {
  return lead.utm_medium?.trim().toLowerCase() ?? ""
}

function hasAdClickId(lead: LeadRecord) {
  return Boolean(
    lead.gclid?.trim() || lead.fbclid?.trim() || lead.msclkid?.trim() || lead.ttclid?.trim()
  )
}

/**
 * 유료 광고로 들어온 리드인가. 세 갈래 중 하나면 광고 유입으로 본다:
 *  (1) Meta 리드애즈 등 광고 채널 묶음에서 직접 들어옴
 *  (2) 광고 클릭 식별자(gclid·fbclid·msclkid·ttclid)가 붙어 있음
 *  (3) utm_medium이 유료 매체 표기
 * 클릭ID·UTM을 함께 보는 이유: 같은 광고를 눌렀어도 랜딩 폼으로 들어오면 source는 홈페이지다.
 */
export function isPaidAdLead(lead: LeadRecord): boolean {
  if (getLeadSourceGroup(lead) === "meta") return true
  if (hasAdClickId(lead)) return true
  return PAID_MEDIUMS.has(normalizedMedium(lead))
}

export function matchesAdLeadLens(lead: LeadRecord, lens: AdLeadLens): boolean {
  return lens === "paid" ? isPaidAdLead(lead) : isMarketingLead(lead)
}

// ─── 기간 ─────────────────────────────────────────────────────
export type AdLeadPeriod = "7d" | "30d" | "90d" | "all"

export const AD_LEAD_PERIOD_OPTIONS: Array<{ value: AdLeadPeriod; label: string }> = [
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "90d", label: "90일" },
  { value: "all", label: "전체" },
]

const PERIOD_DAYS: Record<Exclude<AdLeadPeriod, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 }

/**
 * 리드 기간 필터 ↔ Meta 대시보드 datePreset 대응. 실측 CPL(광고비 ÷ 리드)은 분자·분모의
 * 기간이 같을 때만 의미가 있다 — 광고비는 30일치인데 리드만 7일로 좁히면 CPL이 4배로 뛴다.
 * 대응이 없는 조합(전체·this_month 등)은 null — 호출부가 CPL을 "기간 불일치"로 표시한다.
 */
export const AD_LEAD_PERIOD_TO_META_PRESET: Record<AdLeadPeriod, string | null> = {
  "7d": "last_7d",
  "30d": "last_30d",
  "90d": "last_90d",
  all: null,
}

/** 유입일(timestamp)이 기간 안인가. 날짜가 깨진 리드는 기간 필터에서 빠진다(전체에서만 보인다). */
export function leadInPeriod(lead: LeadRecord, period: AdLeadPeriod, nowMs: number): boolean {
  if (period === "all") return true
  const ms = new Date(lead.timestamp).getTime()
  if (Number.isNaN(ms)) return false
  return ms >= nowMs - PERIOD_DAYS[period] * 24 * 3600 * 1000
}

// ─── 상태 필터 ────────────────────────────────────────────────
// 목록 위 칩. "전환 대상"은 아직 CRM으로 안 넘어간 살아있는 리드 — 단체 전환의 기본 모집단이다.
export type AdLeadStatusFilter = "all" | "convertible" | "new" | "contacted" | "converted"

export const AD_LEAD_STATUS_OPTIONS: Array<{ value: AdLeadStatusFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "convertible", label: "전환 대상" },
  { value: "new", label: "신규" },
  { value: "contacted", label: "연락중" },
  { value: "converted", label: "전환됨" },
]

/** 전환 버튼을 누를 수 있는 리드 — 판정식은 lead-attribution SSOT(isConversionEligibleLead)만 쓴다(재정의 금지). */
export const isConvertibleLead = isConversionEligibleLead

export function matchesAdLeadStatus(lead: LeadRecord, filter: AdLeadStatusFilter): boolean {
  switch (filter) {
    case "all":
      return true
    case "convertible":
      return isConvertibleLead(lead)
    default:
      return lead.status === filter
  }
}

// ─── 검색 ─────────────────────────────────────────────────────
/** 이름·학원·연락처·캠페인·광고까지 한 상자에서 찾는다. 공백으로 끊은 토큰 전부를 만족해야 한다. */
export function matchesAdLeadSearch(lead: LeadRecord, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = [
    lead.name, lead.org, lead.email, lead.phone, lead.branch,
    getLeadChannelLabel(lead), getLeadCampaignLabel(lead), getLeadAdLabel(lead),
    getLeadSourceDetail(lead), lead.lead_magnet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

// ─── 통계 ─────────────────────────────────────────────────────
export interface AdLeadStats {
  total: number
  newCount: number
  contacted: number
  converted: number
  convertible: number
  /** 검토 전(공개 채널 유입, confirmed_at 없음) */
  unconfirmed: number
  /** 캠페인 축에 값이 있는 리드 — 광고비를 리드에 붙일 수 있는 비율의 근거 */
  campaignTagged: number
  convRate: number | null
  /** 광고비를 함께 넘기면 계산되는 실측 CPL(추정 안분이 아니라 리드 건수 기준) */
  cpl: number | null
}

export function buildAdLeadStats(leads: LeadRecord[], spend?: number | null): AdLeadStats {
  let newCount = 0
  let contacted = 0
  let converted = 0
  let convertible = 0
  let unconfirmed = 0
  let campaignTagged = 0

  for (const lead of leads) {
    if (lead.status === "new") newCount += 1
    else if (lead.status === "contacted") contacted += 1
    else if (isConvertedLead(lead)) converted += 1
    if (isConvertibleLead(lead)) convertible += 1
    if (!lead.confirmed_at) unconfirmed += 1
    if (getLeadCampaignLabel(lead)) campaignTagged += 1
  }

  const total = leads.length
  return {
    total,
    newCount,
    contacted,
    converted,
    convertible,
    unconfirmed,
    campaignTagged,
    convRate: total > 0 ? converted / total : null,
    // 광고비가 없거나 리드가 0이면 CPL은 "모른다" — 0으로 적어 좋아 보이게 만들지 않는다.
    cpl: spend != null && spend > 0 && total > 0 ? spend / total : null,
  }
}

// ─── CSV 내보내기 ─────────────────────────────────────────────
// 마케팅이 시트로 가져가 광고 리포트와 대조하는 용도 — 트래킹 축을 라벨까지 풀어서 넣는다.
export const AD_LEAD_CSV_COLUMNS = [
  { key: "timestamp", label: "유입일시" },
  { key: "status", label: "상태" },
  { key: "org", label: "학원·기관" },
  { key: "name", label: "이름" },
  { key: "phone", label: "전화" },
  { key: "email", label: "이메일" },
  { key: "channel", label: "채널" },
  { key: "campaign", label: "캠페인" },
  { key: "ad", label: "광고·소재" },
  { key: "magnet", label: "리드마그넷" },
  { key: "landing", label: "랜딩" },
  { key: "sourceDetail", label: "세부 유입" },
  { key: "branch", label: "지역" },
  { key: "assignedTo", label: "담당자" },
] as const

const CSV_STATUS_LABEL: Record<string, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환됨",
  closed: "종료",
}

export function buildAdLeadCsvRows(
  leads: LeadRecord[],
  getLandingPath: (lead: LeadRecord) => string | null
): Array<Record<string, string | number | null>> {
  return leads.map((lead) => ({
    timestamp: lead.timestamp,
    status: CSV_STATUS_LABEL[lead.status] ?? lead.status,
    org: lead.org ?? "",
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    channel: getLeadChannelLabel(lead),
    campaign: getLeadCampaignLabel(lead) ?? "",
    ad: getLeadAdLabel(lead) ?? "",
    magnet: lead.lead_magnet ?? "",
    landing: getLandingPath(lead) ?? "",
    sourceDetail: getLeadSourceDetail(lead),
    branch: lead.branch ?? "",
    assignedTo: lead.assigned_to ?? "",
  }))
}

// ─── 목록 조립 ────────────────────────────────────────────────
export interface AdLeadFilterInput {
  lens: AdLeadLens
  period: AdLeadPeriod
  status: AdLeadStatusFilter
  search: string
  /** 트래킹 롤업 행을 눌렀을 때의 좁히기 키(축은 호출부가 getKey로 넘긴다) */
  trackingKey: string | null
  getTrackingKey: (lead: LeadRecord) => string | null
  nowMs: number
  /** Meta 리드애즈 폼 테스트 제출을 목록에서 뺄지 — 기본은 뺀다(운영 목록 오염 방지) */
  includeTestLeads: boolean
}

export interface AdLeadScopes {
  /** 렌즈+기간까지만 적용 — 통계 스트립·트래킹 롤업이 보는 모집단 */
  scoped: LeadRecord[]
  /** 위에 상태·검색·트래킹 키까지 적용 — 실제 목록에 그려지는 행 */
  rows: LeadRecord[]
  /** 렌즈에서 제외된 테스트 리드 수 — 숨겼다는 사실을 화면에 정직하게 남기기 위함 */
  hiddenTestCount: number
}

/**
 * 리드 전량에서 화면이 쓰는 두 집합을 한 번에 만든다.
 * scoped와 rows를 나누는 이유: 트래킹 롤업의 분모는 "상태 필터를 걸기 전"이어야
 * 축별 건수와 전환율이 필터에 따라 요동치지 않는다.
 */
export function buildAdLeadScopes(leads: LeadRecord[], input: AdLeadFilterInput): AdLeadScopes {
  let hiddenTestCount = 0
  const scoped: LeadRecord[] = []

  for (const lead of leads) {
    if (!matchesAdLeadLens(lead, input.lens)) continue
    if (!leadInPeriod(lead, input.period, input.nowMs)) continue
    if (!input.includeTestLeads && isTestLead(lead)) {
      hiddenTestCount += 1
      continue
    }
    scoped.push(lead)
  }

  const rows = scoped.filter((lead) => {
    if (!matchesAdLeadStatus(lead, input.status)) return false
    if (input.trackingKey && input.getTrackingKey(lead) !== input.trackingKey) return false
    return matchesAdLeadSearch(lead, input.search)
  })

  return { scoped, rows, hiddenTestCount }
}
