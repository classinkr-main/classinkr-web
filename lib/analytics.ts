import {
  GOOGLE_ADS_ID,
  KAKAO_PIXEL_ID,
} from "@/lib/analytics-config"
import { currentChoice, getAnonymousId } from "@/lib/consent/consent"

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

type AnalyticsParamValue = string | number | boolean | null | undefined
type AnalyticsParams = Record<string, AnalyticsParamValue>
type GoogleAnalyticsEventName =
  | EventNames
  | "generate_lead"
  | "file_download"
  | "select_content"
  | "video_start"
  | "conversion"

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
    gtag?: (
      command: "event",
      eventName: GoogleAnalyticsEventName,
      params?: AnalyticsParams
    ) => void
    fbq?: (
      command: "track" | "trackCustom",
      eventName: string,
      params?: AnalyticsParams,
      options?: MetaPixelOptions
    ) => void
    kakaoPixel?: (pixelId: string) => KakaoPixelClient
    dataLayer?: Array<Record<string, unknown>>
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
    fetch("/api/track/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
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

function normalizeEventParams(eventName: EventNames, params?: AnalyticsParams) {
  const eventId =
    typeof params?.event_id === "string" && params.event_id.trim()
      ? params.event_id.trim()
      : createEventId(eventName)

  return {
    ...(params ?? {}),
    event_id: eventId,
  }
}

function withoutEventId(params: AnalyticsParams) {
  const rest = { ...params }
  delete rest.event_id
  return rest
}

function getGa4Event(
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
          lead_type: "demo_request",
        },
      }
    case "submit_newsletter":
      return {
        name: "generate_lead",
        params: {
          ...params,
          method: params.source ?? "newsletter",
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

export const trackEvent = (eventName: EventNames, params?: AnalyticsParams) => {
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
    window.gtag("event", ga4Event.name, ga4Event.params)
  }

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
    ...(params ?? {}),
  })
}
