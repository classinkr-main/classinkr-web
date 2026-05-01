import { KAKAO_PIXEL_ID } from "@/lib/analytics-config"

export type EventNames =
  | "page_view"
  | "click_cta"
  | "submit_demo_request"
  | "submit_newsletter"
  | "download_materials"
  | "view_demo_video"
  | "begin_checkout"

type AnalyticsParamValue = string | number | boolean | null | undefined
type AnalyticsParams = Record<string, AnalyticsParamValue>

interface KakaoPixelClient {
  completeRegistration: () => void
  participate: (params: { tag: EventNames }) => void
}

declare global {
  interface Window {
    gtag?: (command: "event", eventName: EventNames, params?: AnalyticsParams) => void
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

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: eventName,
    ...(params ?? {}),
  })

  sendInternalTracking(eventName, params)

  if (window.gtag) {
    window.gtag("event", eventName, params)
  }

  if (window.fbq) {
    if (eventName === "submit_demo_request") {
      window.fbq("track", "Lead", params)
    } else {
      window.fbq("trackCustom", eventName, params)
    }
  }

  if (!window.kakaoPixel || !KAKAO_PIXEL_ID) return

  const kakaoPixel = window.kakaoPixel(KAKAO_PIXEL_ID)

  switch (eventName) {
    case "submit_demo_request":
    case "submit_newsletter":
      kakaoPixel.completeRegistration()
      break
    case "click_cta":
    case "download_materials":
    case "view_demo_video":
    case "begin_checkout":
      kakaoPixel.participate({ tag: eventName })
      break
    default:
      break
  }
}
