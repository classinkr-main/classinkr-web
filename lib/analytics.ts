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

type AnalyticsParamValue = string | number | boolean | null | undefined
type AnalyticsParams = Record<string, AnalyticsParamValue>

interface KakaoPixelClient {
  pageView: () => void
  completeRegistration: () => void
  participate: (params: { tag: EventNames }) => void
}

declare global {
  interface Window {
    gtag?: (
      command: "event",
      eventName: EventNames | "conversion",
      params?: AnalyticsParams
    ) => void
    fbq?: (
      command: "track" | "trackCustom",
      eventName: string,
      params?: AnalyticsParams
    ) => void
    kakaoPixel?: (pixelId: string) => KakaoPixelClient
    dataLayer?: Array<Record<string, unknown>>
  }
}

const INTERNAL_TRACKING_ENABLED =
  process.env.NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED !== "false"

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

export const trackEvent = (eventName: EventNames, params?: AnalyticsParams) => {
  if (typeof window === "undefined") return

  const consent = currentChoice()

  try {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      event: eventName,
      ...(params ?? {}),
    })
  } catch {
    // Some embedded/webview contexts lock the Window object; continue with other transports.
  }

  // 내부 분석 적재는 분석 동의가 있을 때만 (옵트인)
  if (consent.analytics) {
    sendInternalTracking(eventName, params)
  }

  // gtag 이벤트는 항상 푸시 — 발화 여부는 Consent Mode v2 상태가 결정한다.
  if (window.gtag) {
    window.gtag("event", eventName, params)
  }

  // 마케팅 픽셀(Meta·Kakao)은 마케팅 동의가 있을 때만 발화
  if (consent.marketing && window.fbq) {
    if (eventName === "submit_demo_request") {
      window.fbq("track", "Lead", params)
    } else if (eventName === "submit_newsletter") {
      window.fbq("track", "CompleteRegistration", params)
    } else if (eventName === "purchase") {
      window.fbq("track", "Purchase", params)
    } else if (eventName !== "page_view" && eventName !== "view_resource_card") {
      window.fbq("trackCustom", eventName, params)
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
