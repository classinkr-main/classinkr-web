import { KAKAO_PIXEL_ID } from "@/lib/analytics-config"

export type EventNames =
  | "page_view"
  | "click_cta"
  | "submit_demo_request"
  | "download_materials"
  | "view_demo_video"

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

export const trackEvent = (eventName: EventNames, params?: AnalyticsParams) => {
  if (typeof window === "undefined") return

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: eventName,
    ...(params ?? {}),
  })

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
      kakaoPixel.completeRegistration()
      break
    case "click_cta":
    case "download_materials":
    case "view_demo_video":
      kakaoPixel.participate({ tag: eventName })
      break
    default:
      break
  }
}
