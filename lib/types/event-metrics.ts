// lib/types/event-metrics.ts
// 행사(캠페인) 성과 트래킹 — DB 마이그레이션 전 임시 JSON 저장소용

export type AdChannel = "google" | "meta" | "naver" | "kakao" | "youtube" | "offline" | "other"

export interface AdSpendEntry {
  channel: AdChannel
  amount: number       // KRW
  note?: string
}

export interface RelatedLink {
  label: string
  url: string
}

export interface EventMetrics {
  eventId: string
  // 목표
  targetLeads: number | null
  targetRevenue: number | null
  // 퍼널 단계 (수동 입력)
  impressionsCount: number | null
  applicationsCount: number | null    // 신청자
  qualifiedLeadsCount: number | null  // 유효 리드
  attendeesCount: number | null       // 참석자
  dealsCount: number | null
  dealsRevenue: number | null         // KRW
  closedCustomerCount: number | null  // 실제 딜 성사 고객 수
  dealCustomers: string | null        // 성사 고객/기관 메모
  // 광고비
  adSpendEntries: AdSpendEntry[]
  // 관련 자료 (블로그·보도자료 등 외부 링크, 수동 입력)
  relatedLinks: RelatedLink[]
  // 회고 / 메모
  notes: string | null
  retrospective: string | null
  shareMemo: string | null
  updatedAt: string
}

export const DEFAULT_EVENT_METRICS: Omit<EventMetrics, "eventId" | "updatedAt"> = {
  targetLeads: null,
  targetRevenue: null,
  impressionsCount: null,
  applicationsCount: null,
  qualifiedLeadsCount: null,
  attendeesCount: null,
  dealsCount: null,
  dealsRevenue: null,
  closedCustomerCount: null,
  dealCustomers: null,
  adSpendEntries: [],
  relatedLinks: [],
  notes: null,
  retrospective: null,
  shareMemo: null,
}

export const AD_CHANNEL_LABEL: Record<AdChannel, string> = {
  google: "Google Ads",
  meta: "Meta",
  naver: "네이버",
  kakao: "카카오",
  youtube: "YouTube",
  offline: "오프라인",
  other: "기타",
}

export const AD_CHANNEL_COLOR: Record<AdChannel, string> = {
  google: "#4285F4",
  meta: "#0866FF",
  naver: "#03C75A",
  kakao: "#FEE500",
  youtube: "#FF0000",
  offline: "#84827a",
  other: "#1a1a1a",
}

export interface EventFunnel {
  impressions: number
  leads: number          // 자동 집계 (LeadRecord)
  applications: number   // 수동
  qualifiedLeads: number // 수동
  attendees: number      // 수동
  deals: number          // 수동
}

export interface EventEconomics {
  adSpendTotal: number
  revenue: number
  cpl: number | null     // cost per lead
  cpa: number | null     // cost per attendee
  cpd: number | null     // cost per deal
  roi: number | null     // (revenue - spend) / spend * 100
  leadConversionRate: number | null   // qualifiedLeads / leads
  attendanceRate: number | null       // attendees / applications
  dealConversionRate: number | null   // deals / qualifiedLeads
}

// ─── Lead ↔ Event attribution token ──────────────────────────────────────────
// 리드의 notes 첫 줄에 `[event:<id_or_slug>]` 토큰을 둠
//   ex)  "[event:abc-123]\n실제 메모 내용..."

const EVENT_TOKEN_RE = /^\s*\[event:([^\]\s]+)\]\s*\n?/

export function parseEventToken(text: string | null | undefined): {
  token: string | null
  body: string
} {
  if (!text) return { token: null, body: "" }
  const match = text.match(EVENT_TOKEN_RE)
  if (!match) return { token: null, body: text }
  return { token: match[1], body: text.slice(match[0].length) }
}

export function setEventToken(body: string, token: string | null): string {
  // 기존 토큰 제거 후 새 토큰 prepend
  const stripped = body.replace(EVENT_TOKEN_RE, "")
  if (!token) return stripped
  if (!stripped.trim()) return `[event:${token}]`
  return `[event:${token}]\n${stripped}`
}

export function computeEconomics(funnel: EventFunnel, metrics: EventMetrics): EventEconomics {
  const adSpendTotal = metrics.adSpendEntries.reduce((sum, e) => sum + e.amount, 0)
  const revenue = metrics.dealsRevenue ?? 0
  const cpl = funnel.leads > 0 ? Math.round(adSpendTotal / funnel.leads) : null
  const cpa = funnel.attendees > 0 ? Math.round(adSpendTotal / funnel.attendees) : null
  const cpd = funnel.deals > 0 ? Math.round(adSpendTotal / funnel.deals) : null
  // 매출 미입력(dealsRevenue=null)이면 손익을 판단할 수 없으므로 null.
  // dealsRevenue=0으로 명시 입력한 경우에만 실제 손실(-100%)로 계산해 거짓 적자 알람을 막는다.
  const roi =
    adSpendTotal > 0 && metrics.dealsRevenue != null
      ? Math.round(((revenue - adSpendTotal) / adSpendTotal) * 100)
      : null
  // 전환율: 분모(상위 단계)>0 이고 하위 단계가 "측정된" 경우에만 계산.
  //   측정값이 0이면 실제 0% 전환으로 표시(퍼널 붕괴 신호), 미측정(null)이면 "—".
  const leadConversionRate =
    funnel.leads > 0 && metrics.qualifiedLeadsCount != null
      ? Math.round((funnel.qualifiedLeads / funnel.leads) * 100)
      : null
  const attendanceRate =
    funnel.applications > 0 && metrics.attendeesCount != null
      ? Math.round((funnel.attendees / funnel.applications) * 100)
      : null
  const dealConversionRate =
    funnel.qualifiedLeads > 0 && metrics.dealsCount != null
      ? Math.round((funnel.deals / funnel.qualifiedLeads) * 100)
      : null
  return {
    adSpendTotal,
    revenue,
    cpl,
    cpa,
    cpd,
    roi,
    leadConversionRate,
    attendanceRate,
    dealConversionRate,
  }
}
