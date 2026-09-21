import type { LeadPayload } from "@/lib/lead-types"

const ATTRIBUTION_STORAGE_KEY = "classinkr.leadAttribution.v1"

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
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Attribution capture should never block the user experience.
  }
}

function trimAttributionValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 500) : undefined
}

/** 서버가 받는 귀속 필드 전부 — 클라이언트가 보낸 값을 좁혀 읽을 때 쓴다. */
const ATTRIBUTION_FIELDS = [
  ...Object.values(ATTRIBUTION_PARAM_MAP),
  "landingPage",
  "currentPage",
  "referrer",
] as const

/**
 * 신뢰할 수 없는 body 에서 귀속 필드만 골라 다듬는다.
 *
 * 쇼룸 예약·도입 신청은 `lib/submitLead.ts` 를 거치지 않고 각자의 API 로 직접
 * POST 한다. 그래서 `collectLeadAttribution()` 이 붙지 않아, 두 화면의 리드는
 * 광고 귀속이 구조적으로 불가능했다 — 퍼널 뒤쪽 두 단계가 성과 측정에서 통째로
 * 빠져 있었다. 각 API 가 이 함수로 같은 필드를 받아 리드 미러에 실어 보낸다.
 */
export function pickLeadAttribution(raw: unknown): LeadAttribution {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}

  const source = raw as Record<string, unknown>
  const picked: LeadAttribution = {}

  for (const field of ATTRIBUTION_FIELDS) {
    const value = source[field]
    const trimmed = typeof value === "string" ? trimAttributionValue(value) : undefined
    if (trimmed) picked[field] = trimmed
  }

  return picked
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
