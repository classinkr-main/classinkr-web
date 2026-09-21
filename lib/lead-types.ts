import type { NaverAdAttribution } from "@/lib/naver-ad-params"

export type LeadSource =
  | "demo_modal"
  | "contact_page"
  /** 쇼룸 방문 예약 접수(app/api/showroom). */
  | "showroom_booking"
  /** 결제 없는 도입 신청 접수(app/api/checkout/request). */
  | "checkout_request"
  | "newsletter"
  | "meta_lead_ads"

/**
 * 사람이 공개 화면에서 직접 남긴 리드 — 응답 SLA·다이제스트·아침 공지의 대상.
 *
 * 이 집합은 `lead-digest-alerts` · `lead-morning-brief` · `crm/priority` ·
 * `crm/lead-attribution` · `crm-unified-customers` 다섯 곳에 **같은 값이 따로 적혀
 * 있었다.** 쇼룸 예약·도입 신청이 `contact_page` 를 빌려 쓰던 동안에는 그 복제가
 * 드러나지 않았지만, 전용 source 로 분리하는 순간 다섯 곳을 모두 고치지 않으면
 * 가장 의도가 높은 리드가 아침 공지와 SLA 추적에서 조용히 빠진다.
 *
 * 뉴스레터는 대상이 아니다 — 구독이지 상담 요청이 아니라 응답 SLA 가 없다.
 */
export const DIRECT_INBOUND_LEAD_SOURCES: ReadonlySet<string> = new Set<LeadSource>([
  "demo_modal",
  "contact_page",
  "showroom_booking",
  "checkout_request",
  "meta_lead_ads",
])

/**
 * 공개 사이트의 폼에서 직접 온 리드 — 광고 리드폼(meta_lead_ads)은 빠진다.
 * 아침 공지의 "홈페이지" 묶음과 Meta 귀속 판정이 이 집합을 본다.
 */
export const WEBSITE_FORM_LEAD_SOURCES: ReadonlySet<string> = new Set<LeadSource>([
  "demo_modal",
  "contact_page",
  "showroom_booking",
  "checkout_request",
])

/**
 * 접수 — 방문 또는 주문을 실제로 잡은 리드. 문의보다 한 단계 더 간 상태라
 * 공지·랭킹에서 따로 센다.
 */
export const INTAKE_LEAD_SOURCES: ReadonlySet<string> = new Set<LeadSource>([
  "showroom_booking",
  "checkout_request",
])

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
