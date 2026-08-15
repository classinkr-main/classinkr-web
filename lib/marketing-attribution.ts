import { currentChoice } from "@/lib/consent/consent"
import type { LeadPayload } from "@/lib/lead-types"

const ATTRIBUTION_STORAGE_KEY = "classinkr.leadAttribution.v1"

/**
 * 광고 클릭 식별자(gclid/fbclid/...)와 utm을 세션을 넘겨 단말에 보관하는 것은
 * 필수 목적이 아닌 **마케팅 목적 저장**이다. 배너에서 "선택 쿠키는 허락해 주신
 * 경우에만 켤게요"라고 고지했으므로, 마케팅 동의가 없으면 localStorage를
 * 읽지도 쓰지도 않는다. 동의 없이도 폼 제출 시점의 현재 URL·referrer는
 * 그대로 전달된다(사용자가 직접 시작한 문의를 처리하기 위한 정보).
 */
function canPersistAttribution() {
  return currentChoice().marketing
}

const ATTRIBUTION_PARAM_MAP = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_term: "utmTerm",
  utm_content: "utmContent",
  gclid: "gclid",
  fbclid: "fbclid",
  msclkid: "msclkid",
  ttclid: "ttclid",
} as const

type AttributionField = typeof ATTRIBUTION_PARAM_MAP[keyof typeof ATTRIBUTION_PARAM_MAP]
export type LeadAttribution = Partial<
  Pick<LeadPayload, AttributionField | "landingPage" | "currentPage" | "referrer">
>

function safeReadStoredAttribution(): LeadAttribution {
  if (typeof window === "undefined") return {}
  if (!canPersistAttribution()) return {}

  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LeadAttribution
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function safeStoreAttribution(value: LeadAttribution) {
  if (typeof window === "undefined") return

  try {
    if (!canPersistAttribution()) {
      // 동의 철회 시 이미 쌓여 있던 광고 식별자도 함께 정리한다.
      window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Attribution capture should never block the user experience.
  }
}

function trimAttributionValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 500) : undefined
}

export function collectLeadAttribution(): LeadAttribution {
  if (typeof window === "undefined") return {}

  const url = new URL(window.location.href)
  const stored = safeReadStoredAttribution()
  const current: LeadAttribution = {}

  for (const [param, field] of Object.entries(ATTRIBUTION_PARAM_MAP)) {
    const value = trimAttributionValue(url.searchParams.get(param))
    if (value) current[field as AttributionField] = value
  }

  const next: LeadAttribution = {
    ...stored,
    ...current,
    landingPage: stored.landingPage ?? trimAttributionValue(window.location.href),
    currentPage: trimAttributionValue(window.location.href),
    referrer: trimAttributionValue(document.referrer) ?? stored.referrer,
  }

  safeStoreAttribution(next)
  return next
}
