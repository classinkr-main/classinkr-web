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

// ─── 전환 판정 ─────────────────────────────────────────────────
// 광고 리드 섹션(lib/campaigns/ad-leads → AdLeadsPanel)과 perf 대시보드가 공유하는 단일 정의.
// bulk-convert(app/api/admin/leads/bulk-convert)가 전환 성공 시 status 를 "converted" 로
// 바꾸므로, "전환됨" 판정은 그 상태값 하나로 끝난다 — 여기서만 정의하고 재정의하지 않는다.

/** 광고 리드 전환 판정 — status 가 converted 인 리드. */
export function isConvertedLead(lead: Pick<LeadRecord, "status">): boolean {
  return lead.status === "converted"
}

/**
 * 컨택 단계 통과 판정 — 신규("new")를 벗어난 리드. 누적 단계 해석이라 전환·종료도
 * "컨택을 거쳤다"로 센다(퍼널 불변식: contacted ≥ converted 를 구조적으로 보장).
 */
export function isContactedLead(lead: Pick<LeadRecord, "status">): boolean {
  return lead.status !== "new"
}

/** 전환 대상(아직 CRM 으로 안 넘어간 살아있는 리드) — converted·closed 만 제외한다. */
export function isConversionEligibleLead(lead: Pick<LeadRecord, "status">): boolean {
  return lead.status !== "converted" && lead.status !== "closed"
}

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

// ─── 테스트 리드 식별 ──────────────────────────────────────────
// Meta 리드애즈 폼 테스트 도구는 제출할 때마다 `<test lead: dummy data ...>` 리드를
// 실제 웹훅으로 쏜다. 우리 쪽 E2E 검증도 비슷한 흔적을 남긴다. 이것들이 운영 목록
// 상단에 섞이면(2026-08-05 기준 우선순위 상위 12건에 3건이 잡혔다) 아침에 볼 목록이
// 오염된다.
//
// 지우는 대신 식별한다 — 폼을 테스트할 때마다 또 들어오므로 1회성 삭제로는 안 끝나고,
// 웹훅이 정상 동작한다는 증거이기도 해서 기록 자체는 남겨 두는 편이 낫다.
//
// 오검출이 실제 리드를 숨기므로 판정은 좁게 잡는다 — 상호에 "테스트"가 들어가는
// 진짜 학원(예: "테스트베드 아카데미")을 걸러내면 안 된다.
const TEST_LEAD_EMAILS = new Set(["test@meta.com"])

export function isTestLead(lead: LeadRecord): boolean {
  const email = lead.email?.trim().toLowerCase() ?? ""
  if (TEST_LEAD_EMAILS.has(email)) return true
  // 우리 E2E 가 쓰는 플러스 주소(test+...@) — 실제 사용자가 쓸 일은 없다.
  if (/^test\+/.test(email)) return true

  // Meta 테스트 도구의 고정 문구. 접두 일치로만 본다.
  const name = lead.name?.trim().toLowerCase() ?? ""
  const org = lead.org?.trim().toLowerCase() ?? ""
  if (name.startsWith("<test lead") || org.startsWith("<test lead")) return true

  return false
}

// ─── Meta 광고 감도(구매 의도) ─────────────────────────────────
// Meta 리드는 우리 리드의 대다수인데(2026-08-05 기준 114건 중 108건) 우선순위에서는
// 전부 같은 유입 의도 점수를 받았다. 그래서 "감도 높은 곳을 위로"가 Meta 안에서는
// 아무것도 가르지 못했다 — 전자칠판 업그레이드를 찾아 들어온 사람과 기능 소개 광고를
// 눌러본 사람이 동점이었다.
//
// 광고 단위 전환 실적이 아직 없어서(리드가 전부 status=new) 성과 기반 학습은 불가능하다.
// 대신 캠페인·광고세트·광고명 텍스트의 키워드로 가른다 — 광고 이름은 마케팅이 직접
// 붙이는 값이라 의도가 그대로 드러난다. 캠페인이 새로 생기면 이 표만 손보면 된다.
const META_INTENT_RULES: Array<{ label: string; lift: number; keywords: string[] }> = [
  // 장비를 사겠다고 들어온 사람 — 이 묶음이 매출에 가장 가깝다.
  { label: "장비 구매", lift: 12, keywords: ["하드웨어", "hw", "전자칠판", "칠판", "업그레이드", "설치", "구매"] },
  // 얼굴을 볼 기회가 잡힌 사람 — 설명회·세미나는 대면 전환율이 높다.
  { label: "설명회", lift: 9, keywords: ["설명회", "세미나", "bd_", "방문", "체험"] },
  // 기능을 보러 온 사람 — 관심은 있지만 아직 구매 대화는 아니다.
  { label: "기능 관심", lift: 4, keywords: ["녹화", "기능", "수업", "온라인", "sw", "소프트웨어"] },
]

export interface MetaIntent {
  label: string
  lift: number
}

/**
 * Meta 광고 리드의 구매 의도 가산점. Meta 가 아니거나 어느 규칙에도 안 걸리면 null.
 * 캠페인 → 광고세트 → 광고명 순으로 훑고 가장 높은 규칙 하나만 적용한다.
 */
export function getMetaIntent(lead: LeadRecord): MetaIntent | null {
  const info = getMetaAdInfo(lead)
  if (!info) return null

  const haystack = [info.campaign, info.adset, info.ad]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  if (!haystack) return null

  for (const rule of META_INTENT_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return { label: rule.label, lift: rule.lift }
    }
  }
  return null
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
