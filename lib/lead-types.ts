import type { NaverAdAttribution } from "@/lib/naver-ad-params"

export type LeadSource =
  | "demo_modal"
  | "contact_page"
  | "newsletter"
  | "meta_lead_ads"

export interface LeadPayload {
  source: LeadSource
  name?: string
  org?: string
  role?: string
  size?: string
  email?: string
  phone?: string
  branch?: string
  message?: string
  timestamp: string
  marketingConsent?: boolean
  eventSlug?: string
  sourceDetail?: string
  leadMagnet?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  gclid?: string
  fbclid?: string
  msclkid?: string
  ttclid?: string
  landingPage?: string
  currentPage?: string
  referrer?: string
  /** 제출 시점의 익명 식별자(cln_aid) — 사이트 활동을 이 리드에 귀속하는 결합 키. */
  anonymousId?: string
  /**
   * 네이버 검색광고 유입 파라미터(n_*) 묶음. 값이 하나도 없으면 필드 자체를 보내지 않는다 —
   * 빈 객체는 "네이버 유입인데 파라미터가 비었다"로 읽히므로 금지(lib/naver-ad-params.ts).
   */
  naverAd?: NaverAdAttribution
}
