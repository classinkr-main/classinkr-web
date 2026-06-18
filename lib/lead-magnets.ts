import leadMagnetsData from "@/data/lead-magnets.json"

export type LeadMagnetStatus = "draft" | "review" | "unlisted"
export type LeadMagnetGate = "open" | "email" | "login"
export type LeadMagnetTier = "basic" | "advanced"
export type LeadMagnetCategory = "operations" | "hardware" | "software" | "case-study" | "security"

export type LeadMagnetSourceDetail = `lead_magnet:${string}`

export interface LeadMagnetSection {
  title: string
  description: string
  items: readonly string[]
}

export interface LeadMagnetScoreBand {
  range: string
  label: string
  description: string
}

export interface LeadMagnetActionStep {
  day: string
  title: string
  tasks: readonly string[]
}

export interface LeadMagnetSourceLink {
  label: string
  href: string
  description?: string
}

export interface LeadMagnetPdfGuide {
  subtitle: string
  outcome: string
  bestUsedWhen: readonly string[]
  howToUse: readonly string[]
  discussionPrompts: readonly string[]
  relatedMagnets: readonly string[]
  consultationCtas: readonly LeadMagnetSourceLink[]
  expertNote: string
}

export interface LeadMagnetSalesPlaybook {
  intentScore: number
  intentLabel: string
  ownerNote: string
  firstResponse: string
  qualificationQuestions: readonly string[]
  followUpSequence: readonly LeadMagnetActionStep[]
  nextCtas: readonly string[]
}

export interface LeadMagnet {
  slug: string
  title: string
  audience: string
  status: LeadMagnetStatus
  gate: LeadMagnetGate
  tier: LeadMagnetTier
  category: LeadMagnetCategory
  published: boolean
  sourceDetail: LeadMagnetSourceDetail
  summary: string
  formatLabel: string
  estimatedMinutes: number
  blogTone: string
  guideTone: string
  checklistBullets: readonly string[]
  sections: readonly LeadMagnetSection[]
  scoreBands: readonly LeadMagnetScoreBand[]
  redFlags?: readonly string[]
  actionPlan: readonly LeadMagnetActionStep[]
  deliverables: readonly string[]
  consultationPrep: readonly string[]
  sourceLinks?: readonly LeadMagnetSourceLink[]
  pdfGuide?: LeadMagnetPdfGuide
  salesPlaybook?: LeadMagnetSalesPlaybook
  ctaCopy: {
    eyebrow: string
    title: string
    body: string
    buttonLabel: string
  }
  /**
   * 구독 완료 후 바로 열람할 수 있는 자료 링크(Notion·PDF 등).
   * 비어 있으면 "이메일로 보내드립니다" 안내로 대체된다.
   */
  resourceUrl?: string
  /**
   * 비공개 Supabase Storage materials 버킷 안의 파일 경로.
   * 값이 있으면 /api/materials/[slug]/download 가 단기 서명 URL을 발급한다.
   * 비어 있으면 resourceUrl 로 폴백한다.
   */
  storagePath?: string
  suggestedPlacements: readonly string[]
}

export const leadMagnets = leadMagnetsData as readonly LeadMagnet[]

export function getLeadMagnetItemCount(magnet: LeadMagnet) {
  return magnet.sections.reduce((total, section) => total + section.items.length, 0)
}

export function getLeadMagnetStatusLabel(status: LeadMagnetStatus) {
  if (status === "review") return "리뷰"
  if (status === "unlisted") return "링크 공개"
  return "초안"
}

export function getLeadMagnetGateLabel(gate: LeadMagnetGate) {
  if (gate === "login") return "로그인 게이트"
  if (gate === "email") return "이메일 게이트"
  return "공개"
}

export function getLeadMagnetPublicGateLabel(gate: LeadMagnetGate) {
  if (gate === "login") return "로그인 후 받기"
  if (gate === "email") return "이메일로 받기"
  return "바로 보기"
}

export function getLeadMagnetTierLabel(tier: LeadMagnetTier) {
  if (tier === "advanced") return "심화"
  return "기본"
}

export function getLeadMagnetCategoryLabel(category: LeadMagnetCategory) {
  const labels: Record<LeadMagnetCategory, string> = {
    operations: "운영",
    hardware: "하드웨어",
    software: "소프트웨어",
    "case-study": "사례",
    security: "보안",
  }
  return labels[category]
}

/** slug로 리드 마그넷을 찾는다. 어드민이 글에 지정한 값을 공개 페이지에서 해석할 때 사용. */
export function getLeadMagnetBySlug(slug: string | null | undefined): LeadMagnet | null {
  if (!slug) return null
  return leadMagnets.find((magnet) => magnet.slug === slug) ?? null
}

export function getLeadMagnetTitle(slug: string | null | undefined) {
  return getLeadMagnetBySlug(slug)?.title ?? ""
}

export function getLeadMagnetIntentScore(slug: string | null | undefined) {
  const magnet = getLeadMagnetBySlug(slug)
  if (!magnet) return slug ? 12 : 0
  return Math.max(0, Math.min(40, magnet.salesPlaybook?.intentScore ?? 15))
}

/** 어드민 글 편집기의 리드 마그넷 선택지 (slug + 라벨). */
export const leadMagnetOptions = leadMagnets.map((magnet) => ({
  slug: magnet.slug,
  title: magnet.title,
  status: magnet.status,
  gate: magnet.gate,
  published: magnet.published,
})) satisfies readonly {
  slug: string
  title: string
  status: LeadMagnetStatus
  gate: LeadMagnetGate
  published: boolean
}[]
