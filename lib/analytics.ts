import {
  GOOGLE_ADS_DEMO_CONVERSION_LABEL,
  GOOGLE_ADS_ID,
  KAKAO_PIXEL_ID,
  NAVER_LEAD_CONVERSION_TYPE,
  NAVER_WCS_ID,
} from "@/lib/analytics-config"
import { currentChoice, getAnonymousId } from "@/lib/consent/consent"
import { sanitizeTrackingTarget, sanitizeTrackingUrl } from "@/lib/tracking-paths"

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
type AnalyticsParams = Record<string, AnalyticsParamValue>
type GoogleAnalyticsEventName =
  | EventNames
  | "generate_lead"
  | "file_download"
  | "select_content"
  | "video_start"
  | "conversion"

/** gtag('set') 로 고정하는 페이지 문맥 — 이후 모든 hit(자동 이벤트 포함)이 이 값을 쓴다. */
export interface GooglePageContext {
  page_location?: string
  page_referrer?: string
  page_title?: string
}

interface GtagFunction {
  (command: "event", eventName: GoogleAnalyticsEventName, params?: AnalyticsParams): void
  (command: "set", params: GooglePageContext): void
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

export const trackEvent = (
  eventName: EventNames,
  params?: AnalyticsParams,
  options?: TrackEventOptions
) => {
  if (typeof window === "undefined") return

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

  // gtag 이벤트는 GA4 권장 이벤트명으로 푸시 — 발화 여부는 Consent Mode v2 상태가 결정한다.
  if (!INTERNAL_ONLY_EVENTS.has(eventName) && window.gtag) {
    const ga4Event = getGa4Event(eventName, eventParams)
    window.gtag("event", ga4Event.name, {
      page_location: currentPageLocation(),
      ...ga4Event.params,
    })
  }

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
 * 내부 적재만 다시 보낸다(gtag·픽셀 없음). 동의를 나중에 준 방문자의 현재 페이지뷰를
 * 내부 DB 에 남기는 용도 — GA4 page_view 를 한 번 더 쏘면 같은 페이지가 두 번 집계된다.
 */
export const trackInternalEvent = (eventName: EventNames, params?: AnalyticsParams) => {
  if (typeof window === "undefined") return
  if (!currentChoice().analytics) return
  sendInternalTracking(eventName, normalizeEventParams(eventName, params))
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
  params?: AnalyticsParams
}

/**
 * 리드 접수 성공 직후 1회 — 내부 이름은 submit_demo_request(어드민 지표 호환), GA4 는
 * generate_lead + form_type. Google Ads 전환도 같은 중복 방지 안에서 보낸다.
 *
 * @returns 실제로 보냈으면 true
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

  trackEvent("submit_demo_request", params)

  const eventSlug = typeof params.event_slug === "string" ? params.event_slug : undefined
  trackDemoRequestAdsConversion({
    leadId: input.transactionId ?? undefined,
    eventId,
    eventSlug,
  })
  return true
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
 * 실제 발화 여부는 Consent Mode v2(ad_storage) 상태가 결정한다.
 */
export const trackAdsConversion = (
  label: string | null | undefined,
  params?: AnalyticsParams
) => {
  if (typeof window === "undefined" || !label || !window.gtag) return

  window.gtag("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${label}`,
    page_location: currentPageLocation(),
    ...(params ?? {}),
  })
}

/**
 * 리드 전환은 trackLeadSubmitted 를 거쳐 부른다 — 직접 부르면 stored=false·중복 방지를 건너뛴다.
 */
export const trackDemoRequestAdsConversion = (params: {
  leadId?: string | null
  eventId?: string | null
  eventSlug?: string | null
}) => {
  trackAdsConversion(GOOGLE_ADS_DEMO_CONVERSION_LABEL, {
    transaction_id: params.leadId ?? undefined,
    event_id: params.eventId ?? undefined,
    event_slug: params.eventSlug ?? undefined,
  })
}
