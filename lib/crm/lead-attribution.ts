// 리드 귀속(유입 채널 · 광고 · 트래킹) 파생 규칙 — 순수 모듈(서버 의존 없음).
//
// 리드 보드(모아보기 렌즈·유입 칩·트래킹 롤업)와 서버 집계가 같은 매핑 하나만 보도록
// components/admin/crm/leads/shared.tsx 에 있던 표를 여기로 옮겼다. shared.tsx 는
// 이 모듈을 그대로 re-export 하므로 기존 import 경로는 그대로 동작한다.

import type { LeadRecord } from "@/lib/repositories/leads"

export const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청", contact_page: "문의", newsletter: "뉴스레터", meta_lead_ads: "Meta 리드",
  channel_talk: "채널톡",
}

export const RESPONSE_TARGET_SOURCES = new Set(["demo_modal", "contact_page", "meta_lead_ads"])

// ─── 유입 그룹 ──────────────────────────────────────────────────
// 실제 source 값은 16종+로 잘게 흩어져 있어, 리드 보드 상단 유입 칩 필터는 이 7묶음으로 접는다.
// 여기가 source→그룹 매핑의 단일 진실원 — 새 유입 채널이 생기면 이 표에만 추가한다.
export type LeadSourceGroup =
  | "meta" | "homepage" | "resources" | "newsletter" | "channel_talk" | "chatbot" | "manual_etc"

export const SOURCE_GROUP_ORDER: LeadSourceGroup[] = [
  "meta", "homepage", "resources", "newsletter", "channel_talk", "chatbot", "manual_etc",
]

export const SOURCE_GROUP_LABEL: Record<LeadSourceGroup, string> = {
  meta: "메타", homepage: "홈페이지", resources: "자료실", newsletter: "뉴스레터",
  channel_talk: "채널톡", chatbot: "챗봇", manual_etc: "수기·기타",
}

// 웨이파인딩용 색점 — 라이트/다크 공통으로 보이는 중간 톤(넓은 채움 아님, 점만).
export const SOURCE_GROUP_DOT: Record<LeadSourceGroup, string> = {
  meta: "#378ADD", homepage: "#1D9E75", resources: "#BA7517", newsletter: "#7F77DD",
  channel_talk: "#D85A30", chatbot: "#D4537E", manual_etc: "#888780",
}

const SOURCE_GROUP_BY_SOURCE: Record<string, LeadSourceGroup> = {
  meta_lead_ads: "meta",
  demo_modal: "homepage", contact_page: "homepage", home_lead_magnet: "homepage",
  home_final_cta: "homepage", website: "homepage", teaser: "homepage",
  resource_pdf_download: "resources", resource_pdf_cta: "resources", resources_hub: "resources",
  resource_detail: "resources", resource_reference: "resources", resource_related: "resources",
  lead_magnet: "resources", blog_lead_magnet: "resources", materials_direct: "resources",
  newsletter: "newsletter",
  channel_talk: "channel_talk", channel_talk_mining: "channel_talk",
  chatbot: "chatbot",
  admin_manual: "manual_etc", manual: "manual_etc",
  seminar: "manual_etc", event: "manual_etc", team_event: "manual_etc", showroom: "manual_etc",
}

// 매핑에 없는 source는 전부 '수기·기타'로 흡수 — 칩에서 리드가 새지 않게 한다.
export function getLeadSourceGroup(lead: LeadRecord): LeadSourceGroup {
  return SOURCE_GROUP_BY_SOURCE[lead.source] ?? "manual_etc"
}

// ─── Meta 광고 식별 ────────────────────────────────────────────
// Meta 리드애즈 웹훅은 광고 정보를 두 곳에 남긴다:
//  - 신규(웹훅 개편 후): source_detail=광고명, utm_campaign/utm_term/utm_content 구조화 필드
//  - 구버전: utm_campaign만 구조화, 광고·세트명은 message 텍스트의 "ad="/"adset=" 줄에만 존재
// 이 파서가 두 세대를 하나의 형태로 통일한다 — 백필 없이 기존 리드도 광고 단위로 식별된다.
export interface MetaAdInfo {
  campaign?: string
  adset?: string
  ad?: string
}

export function getMetaAdInfo(lead: LeadRecord): MetaAdInfo | null {
  if (lead.source !== "meta_lead_ads") return null
  const info: MetaAdInfo = {
    campaign: lead.utm_campaign?.trim() || undefined,
    adset: lead.utm_term?.trim() || undefined,
    ad: lead.utm_content?.trim() || undefined,
  }
  if (!info.campaign || !info.adset || !info.ad) {
    for (const line of (lead.message ?? "").split("\n")) {
      const idx = line.indexOf("=")
      if (idx <= 0) continue
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (!value || value === "-") continue
      if (key === "campaign" && !info.campaign) info.campaign = value
      else if (key === "adset" && !info.adset) info.adset = value
      else if (key === "ad" && !info.ad) info.ad = value
    }
  }
  return info.campaign || info.adset || info.ad ? info : null
}

export function getLeadSourceDetail(lead: LeadRecord) {
  const explicit = lead.source_detail?.trim()
  if (explicit) return explicit
  // Meta 리드는 광고명이 실질적 세부 유입 — 세부유입 드롭다운·필터·목록 표시가 광고 단위로 작동한다.
  return getMetaAdInfo(lead)?.ad || ""
}

// ─── 마케팅 렌즈 ───────────────────────────────────────────────
// "마케팅 리드 모아보기"의 판정 기준. 두 갈래 중 하나만 맞아도 마케팅 리드로 본다:
//  (1) 마케팅이 운영하는 채널 묶음에서 들어왔다 — 메타/홈페이지/자료실/뉴스레터/챗봇
//  (2) 채널과 무관하게 트래킹 흔적(UTM·클릭ID·리드마그넷·랜딩)이 남아 있다
// (2)를 넣는 이유: 채널톡·수기 등록이어도 UTM이 붙어 들어온 리드는 캠페인 성과에 귀속돼야 한다.
export const MARKETING_SOURCE_GROUPS = new Set<LeadSourceGroup>([
  "meta", "homepage", "resources", "newsletter", "chatbot",
])

export function hasTrackingSignal(lead: LeadRecord): boolean {
  return Boolean(
    lead.utm_source?.trim() ||
      lead.utm_medium?.trim() ||
      lead.utm_campaign?.trim() ||
      lead.utm_term?.trim() ||
      lead.utm_content?.trim() ||
      lead.gclid?.trim() ||
      lead.fbclid?.trim() ||
      lead.msclkid?.trim() ||
      lead.ttclid?.trim() ||
      lead.lead_magnet?.trim() ||
      lead.landing_page?.trim()
  )
}

export function isMarketingLead(lead: LeadRecord): boolean {
  return MARKETING_SOURCE_GROUPS.has(getLeadSourceGroup(lead)) || hasTrackingSignal(lead)
}

// ─── 트래킹 롤업 차원 ──────────────────────────────────────────
// 마케팅 렌즈에서 "무엇이 리드를 만들었나"를 보는 축. 각 축은 리드 1건 → 키 1개로 접힌다.
export type TrackingDimension = "channel" | "campaign" | "ad" | "magnet" | "landing"

export const TRACKING_DIMENSIONS: Array<{ key: TrackingDimension; label: string; hint: string }> = [
  { key: "channel", label: "채널", hint: "utm_source / medium (없으면 유입 묶음)" },
  { key: "campaign", label: "캠페인", hint: "utm_campaign · Meta 캠페인명" },
  { key: "ad", label: "광고·소재", hint: "Meta 광고명 · utm_content" },
  { key: "magnet", label: "리드마그넷", hint: "다운로드 게이트 자료" },
  { key: "landing", label: "랜딩", hint: "첫 진입 경로" },
]

function cleanText(value: string | undefined | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** 랜딩/현재 페이지 URL에서 경로만 남긴다(쿼리·호스트 제거) — 같은 페이지가 쿼리별로 쪼개지지 않게. */
export function getLeadLandingPath(lead: LeadRecord): string | null {
  const raw = cleanText(lead.landing_page) ?? cleanText(lead.current_page)
  if (!raw) return null
  const withoutProtocol = raw.replace(/^https?:\/\/[^/]+/i, "")
  const path = withoutProtocol.split(/[?#]/)[0] || "/"
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path
}

/** utm_source(/medium) 기준 채널 라벨. UTM이 없으면 유입 묶음 라벨로 떨어진다. */
export function getLeadChannelLabel(lead: LeadRecord): string {
  const source = cleanText(lead.utm_source)
  const medium = cleanText(lead.utm_medium)
  if (source && medium) return `${source} / ${medium}`
  if (source) return source
  if (medium) return medium
  if (cleanText(lead.gclid)) return "google / cpc"
  if (cleanText(lead.fbclid)) return "meta / paid"
  return SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)]
}

export function getLeadCampaignLabel(lead: LeadRecord): string | null {
  return cleanText(lead.utm_campaign) ?? cleanText(getMetaAdInfo(lead)?.campaign)
}

export function getLeadAdLabel(lead: LeadRecord): string | null {
  const meta = getMetaAdInfo(lead)
  return cleanText(meta?.ad) ?? cleanText(lead.utm_content) ?? cleanText(meta?.adset)
}

/**
 * 리드를 트래킹 축 하나의 키로 접는다. 값이 없으면 null — 롤업에서 제외되고
 * "미기록" 건수로만 집계된다(없는 값을 '기타' 한 덩어리로 부풀리지 않기 위함).
 */
export function getLeadTrackingKey(lead: LeadRecord, dimension: TrackingDimension): string | null {
  switch (dimension) {
    case "channel":
      return getLeadChannelLabel(lead)
    case "campaign":
      return getLeadCampaignLabel(lead)
    case "ad":
      return getLeadAdLabel(lead)
    case "magnet":
      return cleanText(lead.lead_magnet)
    case "landing":
      return getLeadLandingPath(lead)
  }
}
