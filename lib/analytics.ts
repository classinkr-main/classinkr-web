import {
  GOOGLE_ADS_DEMO_CONVERSION_LABEL,
  GOOGLE_ADS_ID,
  GOOGLE_ADS_SHOWROOM_CONVERSION_LABEL,
  KAKAO_PIXEL_ID,
  NAVER_LEAD_CONVERSION_TYPE,
  NAVER_WCS_ID,
} from "@/lib/analytics-config"
import { currentChoice, getAnonymousId } from "@/lib/consent/consent"
import { isAcademySize } from "@/lib/contact/academy-size"
import { isSalesContactTopic } from "@/lib/contact/topics"
import {
  getContentGroup,
  isTrackingExcludedPath,
  sanitizeTrackingTarget,
  sanitizeTrackingUrl,
} from "@/lib/tracking-paths"

/**
 * 새 이벤트를 더하면 `app/api/track/event/route.ts` 의 ALLOWED_EVENTS·ALLOWED_PARAM_KEYS 와
 * 아래 GA4_PARAM_KEYS 를 함께 갱신한다(플레이북 공통 철칙).
 *
 * 내부 이름은 어드민 지표(lib/repositories/lead-magnet-metrics.ts 등)가 그대로 읽는다 —
 * GA4 이름은 getGa4Event 가 바꿔 보내므로 내부 이름을 GA4 에 맞춰 고치지 않는다.
 */
export type EventNames =
  | "page_view"
  | "click_cta"
  | "submit_demo_request"
  | "submit_newsletter"
  | "download_materials"
  | "view_resource_card"
  | "view_resource"
  | "view_demo_video"
  | "begin_checkout"
  | "purchase"
  | "page_exit"
  | "chatbot_teaser_shown"
  | "chatbot_teaser_clicked"
  | "chatbot_teaser_dismissed"
  | "chatbot_opened"
  | "chatbot_first_question"
  // 퍼널 보조 이벤트 — GA4 에도 같은 이름으로 간다.
  | "contact_start"
  | "showroom_start"
  | "click_to_call"
  | "click_email"
  | "pricing_view"

/** generate_lead(submit_demo_request) 의 form_type. GA4 맞춤 측정기준으로 등록해 쓴다. */
export type LeadFormType = "contact" | "demo" | "event" | "showroom" | "checkout_request"
/** submit_newsletter 의 form_type. */
export type NewsletterFormType = "newsletter" | "resource" | "event_alert" | "lead_magnet"

type AnalyticsParamValue = string | number | boolean | null | undefined
export type AnalyticsParams = Record<string, AnalyticsParamValue>
type GoogleAnalyticsEventName =
  | EventNames
  | "generate_lead"
  | "file_download"
  | "select_content"
  | "video_start"
  | "conversion"
  | "lead_magnet_signup"

/** gtag('set') 로 고정하는 페이지 문맥 — 이후 모든 hit(자동 이벤트 포함)이 이 값을 쓴다. */
export interface GooglePageContext {
  page_location?: string
  page_referrer?: string
  page_title?: string
  /** GA4 콘텐츠 그룹(lib/tracking-paths.ts getContentGroup). */
  content_group?: string
  /** 직원 브라우저 표시 — GA4 "내부 트래픽" 데이터 필터가 이 값으로 거른다. */
  traffic_type?: "internal"
}

/** Google Ads 향상된 전환에 싣는 해시 연락처(SHA-256 hex). 원문은 절대 넣지 않는다. */
export interface AdsUserData {
  sha256_email_address?: string
  sha256_phone_number?: string
}

interface GtagFunction {
  (command: "event", eventName: GoogleAnalyticsEventName, params?: AnalyticsParams): void
  (command: "set", params: GooglePageContext): void
  (command: "set", target: "user_data", params: AdsUserData): void
}

type MetaPixelOptions = {
  eventID?: string
}

interface KakaoPixelClient {
  pageView: () => void
  completeRegistration: () => void
  participate: (params: { tag: EventNames }) => void
}

declare global {
  interface Window {
    gtag?: GtagFunction
    fbq?: (
      command: "track" | "trackCustom",
      eventName: string,
      params?: AnalyticsParams,
      options?: MetaPixelOptions
    ) => void
    kakaoPixel?: (pixelId: string) => KakaoPixelClient
    dataLayer?: Array<Record<string, unknown>>
    /** 네이버 프리미엄 로그분석(wcslog.js). trans 는 신 스크립트의 전환 발화다. */
    wcs?: {
      inflow: (domain?: string) => void
      trans?: (payload: Record<string, string>) => void
    }
    wcs_do?: (payload?: Record<string, string>) => void
    wcs_add?: Record<string, string>
  }
}

const INTERNAL_TRACKING_ENABLED =
  process.env.NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED !== "false"
const INTERNAL_ONLY_EVENTS = new Set<EventNames>(["page_exit"])

const sendInternalTracking = (eventName: EventNames, params?: AnalyticsParams) => {
  if (!INTERNAL_TRACKING_ENABLED) return
  try {
    const payload = JSON.stringify({
      event: eventName,
      page: window.location.pathname,
      anonymousId: getAnonymousId(),
      params: params ?? {},
    })
    // 서버는 Referer 헤더를 client_events.referrer 로 적재한다. 기본 정책이면 같은 출처라
    // 쿼리째(`?prefill=`, `?checkoutToken=&paymentKey=`) 실리므로 정화한 주소로 바꿔 보낸다.
    const referrer = sanitizeTrackingUrl(window.location.href)
    fetch("/api/track/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      referrer,
    }).catch(() => {})
  } catch {
    // 추적 실패는 무시
  }
}

function createEventId(eventName: EventNames) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return `${eventName}:${randomId}`
}

/**
 * submit_newsletter 호출부 중 form_type 을 직접 넘기지 않는 곳(뉴스레터 구독 블록·모달,
 * 행사 알림 신청)은 source 로 갈래를 정한다. 명시값이 있으면 그것이 이긴다.
 */
function inferNewsletterFormType(source: AnalyticsParamValue): NewsletterFormType {
  const value = typeof source === "string" ? source : ""
  if (value.startsWith("event_alert")) return "event_alert"
  if (value.startsWith("resource_pdf_download")) return "resource"
  if (value.startsWith("blog_lead_magnet")) return "lead_magnet"
  return "newsletter"
}

function normalizeEventParams(eventName: EventNames, params?: AnalyticsParams) {
  const eventId =
    typeof params?.event_id === "string" && params.event_id.trim()
      ? params.event_id.trim()
      : createEventId(eventName)

  const normalized: AnalyticsParams = {
    ...(params ?? {}),
    event_id: eventId,
  }

  if (eventName === "submit_newsletter" && !normalized.form_type) {
    normalized.form_type = inferNewsletterFormType(normalized.source)
  }

  return normalized
}

function withoutEventId(params: AnalyticsParams) {
  const rest = { ...params }
  delete rest.event_id
  return rest
}

/**
 * GA4 로 보내는 파라미터 allowlist. 예전에는 내부 파라미터를 전부 스프레드해 lead_id·stored
 * 같은 내부 식별자까지 구글로 갔다. 여기 없는 키는 dataLayer·내부 적재에만 남는다.
 *
 * 일부러 뺀 키: lead_id·stored(내부 식별·상태), quote_code(고객 견적 식별자),
 * title·referrer(page_title·page_referrer 로 대체 — referrer 는 외부 URL 원문이었다),
 * duration_ms·exit_type·next_path(page_exit 는 내부 전용).
 */
const GA4_PARAM_KEYS = new Set([
  // 공통·페이지 문맥
  "event_id",
  "page_location",
  "page_referrer",
  "page_title",
  "page_path",
  "path",
  // GA4 권장 이벤트 매핑이 채우는 키
  "content_type",
  "item_id",
  "file_name",
  "video_title",
  "method",
  "lead_type",
  "form_type",
  "lead_source",
  "transaction_id",
  "value",
  "currency",
  // 기존 이벤트 도메인 키(click_cta·view_resource·begin_checkout·submit_* 호출부 전수)
  "button",
  "page",
  "destination",
  "source",
  "model",
  "slug",
  "event_slug",
  "lead_magnet",
  "post_slug",
  "gate",
  "tier",
  "category",
  "asset_id",
  "seminar",
  "product_family",
  "plan_id",
  "billing_cycle",
  "account_count",
  "mode",
  "promo_code",
  "item_count",
  "request_kind",
  "visit_date",
  "visit_time",
  "visitor_count",
  "interest_count",
  "academy_size",
  "platform",
  "variant",
  "version",
  "segment",
  "surface",
  // 보조 이벤트
  "link_location",
  "pricing_surface",
])

/** 링크·페이지 값이 실리는 키 — 쿼리·메일 주소·전화번호가 구글로 가지 않게 정화한다. */
const GA4_TARGET_KEYS = new Set(["destination", "page", "page_path", "path"])

function pickGa4Params(params: AnalyticsParams): AnalyticsParams {
  const picked: AnalyticsParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (!GA4_PARAM_KEYS.has(key) || value === undefined || value === null) continue
    picked[key] =
      typeof value === "string" && GA4_TARGET_KEYS.has(key) ? sanitizeTrackingTarget(value) : value
  }
  return picked
}

function getGa4Event(
  eventName: EventNames,
  params: AnalyticsParams
): { name: GoogleAnalyticsEventName; params: AnalyticsParams } {
  const mapped = mapGa4Event(eventName, params)
  return { name: mapped.name, params: pickGa4Params(mapped.params) }
}

function mapGa4Event(
  eventName: EventNames,
  params: AnalyticsParams
): { name: GoogleAnalyticsEventName; params: AnalyticsParams } {
  switch (eventName) {
    case "submit_demo_request":
      return {
        name: "generate_lead",
        params: {
          ...params,
          method: params.source ?? "demo_request",
          lead_source: params.source ?? "demo_request",
          lead_type: "demo_request",
        },
      }
    case "submit_newsletter":
      return {
        name: "generate_lead",
        params: {
          ...params,
          method: params.source ?? "newsletter",
          lead_source: params.source ?? "newsletter",
          lead_type: "newsletter",
        },
      }
    case "download_materials":
      return {
        name: "file_download",
        params: {
          ...params,
          file_name: params.asset_id ?? params.lead_magnet,
          content_type: "lead_magnet",
        },
      }
    case "click_cta":
      return {
        name: "select_content",
        params: {
          ...params,
          content_type: "cta",
          item_id: params.button,
        },
      }
    case "view_resource":
    case "view_resource_card":
      return {
        name: "select_content",
        params: {
          ...params,
          content_type: "resource",
          item_id: params.lead_magnet ?? params.source,
        },
      }
    case "view_demo_video":
      return {
        name: "video_start",
        params: {
          ...params,
          video_title: params.button ?? "demo_video",
        },
      }
    default:
      return { name: eventName, params }
  }
}

function getMetaEvent(eventName: EventNames) {
  switch (eventName) {
    case "submit_demo_request":
      return { name: "Lead", standard: true }
    case "submit_newsletter":
      return { name: "CompleteRegistration", standard: true }
    case "begin_checkout":
      return { name: "InitiateCheckout", standard: true }
    case "purchase":
      return { name: "Purchase", standard: true }
    case "download_materials":
      return { name: "Lead", standard: true }
    default:
      return eventName === "page_view" ||
        eventName === "page_exit" ||
        eventName === "view_resource_card"
        ? null
        : { name: eventName, standard: false }
  }
}

/** 현재 페이지의 정화된 page_location. 이벤트 단위로 붙여 gtag 의 `location.href` 기본값을 덮는다. */
function currentPageLocation(): string | undefined {
  return sanitizeTrackingUrl(window.location.href) || undefined
}

/**
 * gtag 전역 페이지 문맥을 고정한다(`gtag('set', …)`). 이후 hit — 향상된 측정의 자동 이벤트와
 * user_engagement 까지 — 가 이 page_location 을 쓴다. 값은 이미 정화된 것을 넘긴다.
 */
export const setGooglePageContext = (context: GooglePageContext) => {
  if (typeof window === "undefined" || !window.gtag) return
  const payload: GooglePageContext = {}
  if (context.page_location) payload.page_location = context.page_location
  if (context.page_referrer !== undefined) payload.page_referrer = context.page_referrer
  if (context.page_title) payload.page_title = context.page_title
  if (context.content_group) payload.content_group = context.content_group
  if (context.traffic_type) payload.traffic_type = context.traffic_type
  window.gtag("set", payload)
}

export interface TrackEventOptions {
  /**
   * true 면 Meta·네이버·카카오 픽셀로 보내지 않는다(dataLayer·GA4·내부 적재만).
   * 자료 다운로드처럼 픽셀 쪽 매핑(download_materials → Meta Lead)이 전환을 부풀리는
   * 새 발화 지점에 쓴다 — 같은 사람의 자료 신청이 이미 CompleteRegistration 으로 잡힌다.
   */
  skipMarketingPixels?: boolean
}

// gtag 이벤트는 GA4 권장 이벤트명으로 푸시 — 분석 동의 확인은 호출부가 한다. window.gtag 는 layout
// 부트스트랩이 늘 정의하므로, 동의 전에 부르면 큐에 쌓였다가 태그가 로드될 때 그대로 재생된다.
// content_group 도 page_location 처럼 이벤트마다 싣는다: /checkout 은 PageViewTracker 가
// 없어 소프트 내비게이션으로 들어오면 gtag('set') 문맥이 직전 페이지 그룹에 머문다.
function sendGa4Event(eventName: EventNames, eventParams: AnalyticsParams) {
  if (INTERNAL_ONLY_EVENTS.has(eventName) || !window.gtag) return
  const ga4Event = getGa4Event(eventName, eventParams)
  const ga4Params = {
    page_location: currentPageLocation(),
    content_group: getContentGroup(window.location?.pathname),
    ...ga4Event.params,
  }
  window.gtag("event", ga4Event.name, ga4Params)
  // 이메일을 받고 내준 자료(gate=email)는 "자료 신청"으로 한 번 더 센다 — GA4 주요 이벤트
  // lead_magnet_signup 이고, Google Ads 리드 캠페인(C2) 맞춤 목표가 이것을 입찰에 쓴다.
  // 제품 소개서처럼 이메일 없이 받는 다운로드(gate 없음)는 file_download 로만 남는다.
  if (eventName === "download_materials" && eventParams.gate === "email") {
    window.gtag("event", "lead_magnet_signup", ga4Params)
  }
}

export const trackEvent = (
  eventName: EventNames,
  params?: AnalyticsParams,
  options?: TrackEventOptions
) => {
  if (typeof window === "undefined") return
  // 고객 키·토큰·계정 화면에서는 어떤 이벤트도 내보내지 않는다(내부 적재 포함).
  // `/checkout` 은 결제 전환 때문에 여기서 막지 않고 page_location 정화로 다룬다.
  if (isTrackingExcludedPath(window.location?.pathname)) return

  const consent = currentChoice()
  const eventParams = normalizeEventParams(eventName, params)
  const eventId =
    typeof eventParams.event_id === "string" ? eventParams.event_id : undefined

  try {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      event: eventName,
      ...eventParams,
    })
  } catch {
    // Some embedded/webview contexts lock the Window object; continue with other transports.
  }

  // 내부 분석 적재는 분석 동의가 있을 때만 (옵트인)
  if (consent.analytics) {
    sendInternalTracking(eventName, eventParams)
  }

  // gtag(GA4) 이벤트는 분석 동의가 있을 때만 부른다. 동의 전 page_view 는 PageViewTracker 가
  // 동의 순간 replayPageViewAfterConsent 로 한 번 채운다.
  if (consent.analytics) sendGa4Event(eventName, eventParams)

  if (options?.skipMarketingPixels) return

  // 마케팅 픽셀(Meta·Kakao)은 마케팅 동의가 있을 때만 발화
  if (consent.marketing && window.fbq) {
    const metaEvent = getMetaEvent(eventName)
    if (metaEvent) {
      const metaParams = withoutEventId(eventParams)
      const metaOptions = eventId ? { eventID: eventId } : undefined
      if (metaEvent.standard) {
        window.fbq("track", metaEvent.name, metaParams, metaOptions)
      } else {
        window.fbq("trackCustom", metaEvent.name, metaParams, metaOptions)
      }
    }
  }

  // 네이버 전환(wcs.trans) — 마케팅 동의가 있을 때만. 리드 제출만 전환으로 본다:
  // CTA 클릭·자료 조회까지 보내면 네이버 쪽 전환이 부풀어 입찰 최적화가 망가진다.
  if (consent.marketing && (eventName === "submit_demo_request" || eventName === "submit_newsletter")) {
    trackNaverConversion()
  }

  if (!consent.marketing || !window.kakaoPixel || !KAKAO_PIXEL_ID) return

  const kakaoPixel = window.kakaoPixel(KAKAO_PIXEL_ID)

  switch (eventName) {
    case "submit_demo_request":
    case "submit_newsletter":
      kakaoPixel.completeRegistration()
      break
    case "click_cta":
    case "download_materials":
    case "view_resource":
    case "view_demo_video":
    case "begin_checkout":
      kakaoPixel.participate({ tag: eventName })
      break
    default:
      break
  }
}

/**
 * 동의를 나중에 준 방문자의 현재 페이지뷰를 한 번 채운다 — 내부 적재 + GA4 page_view.
 * 첫 발화 때는 분석 동의가 없어 trackEvent 가 둘 다 건너뛰었으므로 두 번 집계되지 않는다.
 * dataLayer 푸시는 첫 발화 때 이미 나갔고 page_view 는 픽셀 매핑이 없어 여기서 다시 보내지 않는다.
 * gtag.js 가 아직 로드 전이면 layout 부트스트랩 큐에 쌓였다가 GA4 config 뒤 재생된다.
 */
export const replayPageViewAfterConsent = (params: AnalyticsParams) => {
  if (typeof window === "undefined") return
  if (!currentChoice().analytics) return
  const eventParams = normalizeEventParams("page_view", params)
  sendInternalTracking("page_view", eventParams)
  sendGa4Event("page_view", eventParams)
}

/* ── 리드 접수 ──────────────────────────────────────────────────────────── */

const LEAD_TRACKED_KEY_PREFIX = "classinkr.leadTracked."
const FORM_STARTED_KEY_PREFIX = "classinkr.formStarted."
// sessionStorage 가 막힌 환경에서도 같은 페이지 안의 재호출은 막는다.
const memoryOnceKeys = new Set<string>()

/** 세션(탭) 단위로 key 를 처음 보면 true 를 돌려주고 표시한다. */
function claimSessionOnce(key: string): boolean {
  if (memoryOnceKeys.has(key)) return false
  try {
    if (window.sessionStorage.getItem(key)) {
      memoryOnceKeys.add(key)
      return false
    }
    window.sessionStorage.setItem(key, "1")
  } catch {
    // 저장소 접근 불가 — 메모리 표시만으로 진행한다.
  }
  memoryOnceKeys.add(key)
  return true
}

export interface LeadSubmittedInput {
  formType: LeadFormType
  /** 내부 source 값(contact_page·demo_modal·showroom_booking·checkout_request …). */
  source: string
  /**
   * 서버 응답의 stored. `false` 면 허니팟·60초 중복 등으로 저장되지 않은 제출이라 아무것도
   * 보내지 않는다. 응답에 stored 가 없는 접수(쇼룸·도입 신청)는 생략한다.
   */
  stored?: boolean | null
  /**
   * 같은 접수를 두 번 세지 않기 위한 키(conversionEventId·leadId·bookingId·requestId).
   * sessionStorage `classinkr.leadTracked.<key>` 로 탭 안에서 1회만 보낸다.
   */
  dedupeKey?: string | null
  /** 서버 conversionEventId — event_id 로 실려 서버 전환(MP·CAPI)과 짝을 맞춘다. */
  eventId?: string | null
  /** Google Ads 전환의 transaction_id(리드 id 또는 접수번호). */
  transactionId?: string | null
  /** /contact 문의 유형. 영업 유형('도입 상담')일 때만 Google Ads 전환을 보낸다. */
  contactTopic?: string | null
  /**
   * 폼에 입력한 연락처 원문 — Google Ads 향상된 전환용. params 와 섞지 않는다: 마케팅 동의가
   * 있을 때만 브라우저에서 정규화·SHA-256 한 값이 gtag user_data 로 가고, 원문은 dataLayer·
   * GA4·내부 적재·콘솔 어디에도 남지 않는다.
   */
  userData?: { email?: string | null; phone?: string | null }
  /**
   * 폼의 '맞춤형 광고 활용 동의 (선택)' 두 칸을 모두 골랐는지(lib/consent/ad-consent.ts isAdConsentGiven).
   * true 가 아니면 userData 가 있어도 해시를 만들지 않는다 — 쿠키 '마케팅' 동의만으로는 보내지 않는다.
   */
  adConsent?: boolean
  params?: AnalyticsParams
}

/**
 * 폼 → Google Ads 전환 라벨. 입찰은 쇼룸·도입 상담만 학습한다.
 * 행사 신청·HW 주문 신청·지원 문의는 null(보내지 않음) — 보조 전환이 필요해지면 라벨을 더한다.
 */
function adsConversionLabel(input: LeadSubmittedInput): string | null {
  switch (input.formType) {
    case "showroom":
      return GOOGLE_ADS_SHOWROOM_CONVERSION_LABEL
    case "demo":
      return GOOGLE_ADS_DEMO_CONVERSION_LABEL
    case "contact":
      return isSalesContactTopic(input.contactTopic) ? GOOGLE_ADS_DEMO_CONVERSION_LABEL : null
    default:
      return null
  }
}

/**
 * 리드 접수 성공 직후 1회 — 내부 이름은 submit_demo_request(어드민 지표 호환), GA4 는
 * generate_lead + form_type. Google Ads 전환도 같은 중복 방지 안에서 보낸다.
 *
 * @returns 보냈으면 true. 해시 연락처를 싣는 경우 Ads 전환만 해시가 끝난 뒤(수 ms) 나간다.
 */
export const trackLeadSubmitted = (input: LeadSubmittedInput): boolean => {
  if (typeof window === "undefined") return false
  if (input.stored === false) return false

  const dedupeKey = input.dedupeKey?.trim()
  if (dedupeKey && !claimSessionOnce(`${LEAD_TRACKED_KEY_PREFIX}${dedupeKey}`)) return false

  const eventId = input.eventId?.trim() || undefined
  const params: AnalyticsParams = {
    ...(input.params ?? {}),
    source: input.source,
    form_type: input.formType,
  }
  if (eventId) params.event_id = eventId
  // 학원 규모는 선택지 값만 내보낸다 — 자유 입력·변조 값이 GA4·픽셀로 새지 않게.
  if (!isAcademySize(params.academy_size)) delete params.academy_size

  trackEvent("submit_demo_request", params)

  const label = adsConversionLabel(input)
  const conversion: AnalyticsParams = {
    transaction_id: input.transactionId ?? undefined,
    event_id: eventId,
    event_slug: typeof params.event_slug === "string" ? params.event_slug : undefined,
  }

  // 향상된 전환 — 폼의 맞춤형 광고 활용 동의(두 칸)와 쿠키 '마케팅' 동의가 모두 있고 보낼 전환(라벨)이
  // 있을 때만 해시 연락처를 붙인다. 전환은 해시 뒤에 한 번만 보내고, 해시가 실패하면 user_data 없이 보낸다.
  if (label && input.userData && input.adConsent === true && currentChoice().marketing && window.gtag) {
    void hashAdsUserData(input.userData)
      .catch(() => null)
      .then((userData) => {
        if (userData) window.gtag?.("set", "user_data", userData)
        trackAdsConversion(label, conversion)
      })
  } else {
    trackAdsConversion(label, conversion)
  }
  return true
}

/* ── Google Ads 향상된 전환 — 연락처 정규화·해시 ──────────────────────────
 * 정규화 규칙은 Google Ads 도움말 "Google 태그로 향상된 전환 설정"을 따른다: 앞뒤 공백 제거,
 * 소문자, gmail.com·googlemail.com 은 @ 앞 마침표 제거, 전화는 E.164, 해시는 SHA-256 hex.
 */

export function normalizeEmailForAds(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? ""
  const at = value.lastIndexOf("@")
  if (at <= 0 || at === value.length - 1) return null
  const domain = value.slice(at + 1)
  return domain === "gmail.com" || domain === "googlemail.com"
    ? `${value.slice(0, at).replace(/\./g, "")}@${domain}`
    : value
}

/**
 * 국내 번호(0…)와 +82 표기만 E.164(+82…)로 바꾼다. "+82 010-…" 처럼 0 을 남긴 입력도 받는다.
 * 형식을 모르는 번호는 null — 지어낸 번호의 해시는 매칭을 흐린다.
 */
export function normalizePhoneForAds(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "") ?? ""
  const national = digits.startsWith("82")
    ? digits.slice(2).replace(/^0/, "")
    : digits.startsWith("0")
      ? digits.slice(1)
      : ""
  return /^[1-9]\d{7,9}$/.test(national) ? `+82${national}` : null
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** 정규화 → SHA-256. 쓸 값이 하나도 없으면 null. crypto.subtle 이 없으면(비보안 문맥) reject. */
export async function hashAdsUserData(
  input: NonNullable<LeadSubmittedInput["userData"]>
): Promise<AdsUserData | null> {
  const email = normalizeEmailForAds(input.email)
  const phone = normalizePhoneForAds(input.phone)
  if (!email && !phone) return null
  const userData: AdsUserData = {}
  if (email) userData.sha256_email_address = await sha256Hex(email)
  if (phone) userData.sha256_phone_number = await sha256Hex(phone)
  return userData
}

/**
 * 폼 첫 상호작용(contact_start·showroom_start). 탭 세션당 form_type 별 1회만 보낸다 —
 * 같은 사람이 폼을 몇 번 다시 열어도 퍼널 분모가 부풀지 않는다.
 */
export const trackFormStart = (
  eventName: "contact_start" | "showroom_start",
  formType: LeadFormType
) => {
  if (typeof window === "undefined") return
  if (!claimSessionOnce(`${FORM_STARTED_KEY_PREFIX}${eventName}.${formType}`)) return
  trackEvent(eventName, {
    form_type: formType,
    page_path: window.location.pathname,
  })
}

/**
 * 네이버 광고 전환 발화 — **신 스크립트(wcs.trans) 전용**.
 *
 * 구 스크립트(wcs.cnv)를 같이 쓰면 같은 전환 유형의 구 전환이 네이버 쪽에서 영구 필터링된다.
 * 이 저장소에 cnv 호출이 생기면 회귀다.
 *
 * 값(value)은 보내지 않는다 — 리드는 금액이 없고, 0 을 보내면 네이버 리포트에서
 * "매출 0원 전환"으로 집계된다.
 */
export const trackNaverConversion = (type: string | null = NAVER_LEAD_CONVERSION_TYPE) => {
  if (typeof window === "undefined") return
  // 유형이 없으면 보내지 않는다 — 지어낸 유형은 네이버 쪽 집계를 오염시킨다.
  if (!type || !NAVER_WCS_ID) return
  const trans = window.wcs?.trans
  if (typeof trans !== "function") return
  trans({ type })
}

/**
 * Google Ads 전환 이벤트 발화. `label`은 Google Ads 전환 액션의 전환 라벨이며,
 * send_to = `${GOOGLE_ADS_ID}/${label}` 형태로 전송된다. 라벨이 없으면 아무 것도 하지 않는다.
 * 마케팅 동의가 없으면 부르지 않는다(동의 전 호출은 gtag 큐에 쌓였다가 태그 로드 때 재생된다).
 */
export const trackAdsConversion = (
  label: string | null | undefined,
  params?: AnalyticsParams
) => {
  if (typeof window === "undefined" || !label || !window.gtag) return
  if (!currentChoice().marketing) return

  window.gtag("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${label}`,
    page_location: currentPageLocation(),
    ...(params ?? {}),
  })
}
