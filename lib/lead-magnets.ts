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

/** 자료에 사람 목소리를 입히는 바이라인 코멘트(파일럿: showroom/calculator). */
export interface LeadMagnetExpertVoice {
  /** 화자. 예: "목동 쇼룸 상담팀". */
  speaker: string
  /** 화자 맥락/소속. 예: "ClassIn Korea". */
  role?: string
  /** 1인칭 코멘트. */
  comment: string
}

export interface LeadMagnetWorksheetRow {
  label: string
  hint?: string
  /** 합계/결과 행 강조. */
  highlight?: boolean
}

/** 원장이 직접 채우는 계산 표(파일럿: calculator). 금액은 비워 상담에서 환산한다. */
export interface LeadMagnetWorksheet {
  title: string
  intro?: string
  /** 입력 칸 헤더(항목 라벨 열 제외). */
  columns: readonly string[]
  rows: readonly LeadMagnetWorksheetRow[]
  /** 계산식 안내 문장. */
  formula?: string
  note?: string
}

/** 익명 실사례 미니카드(파일럿: case-match-brief). 정량 성과수치는 넣지 않는다. */
export interface LeadMagnetCaseCard {
  /** 익명 식별자. 예: "청주 이**국어". */
  label: string
  /** 과목·유형. */
  profile: string
  /** 도입 전 병목. */
  challenge: string
  /** 도입 후 운영 변화(정성). */
  change: string
  /** 현장 인용(선택). */
  quote?: string
}

/** 복붙용 메시지 예시 — 권장/피해야 할 멘트 쌍(파일럿: parent-replay). */
export interface LeadMagnetScriptSample {
  /** 상황. 예: "결석 학생 안내". */
  scenario: string
  /** 권장 멘트(복사해서 사용). */
  good: string
  /** 피해야 할 멘트(선택). */
  avoid?: string
  /** 왜 이렇게 쓰는지(선택). */
  why?: string
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
  /** 바이라인 코멘트(사람 목소리). 파일럿 자료에만 존재. */
  expertVoice?: LeadMagnetExpertVoice
  /** 직접 채우는 계산 워크시트. 파일럿 자료에만 존재. */
  worksheet?: LeadMagnetWorksheet
  /** 익명 실사례 카드. 파일럿 자료에만 존재. */
  caseCards?: readonly LeadMagnetCaseCard[]
  /** 복붙용 메시지 예시. 파일럿 자료에만 존재. */
  scriptSamples?: readonly LeadMagnetScriptSample[]
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
