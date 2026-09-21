import type { LeadPayload } from "@/lib/lead-types"
import { collectNaverAdParams, type NaverAdAttribution } from "@/lib/naver-ad-params"

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
  Pick<LeadPayload, AttributionField | "landingPage" | "currentPage" | "referrer" | "naverAd">
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

/**
 * 브라우저에서 귀속을 모은다(URL 파라미터 + localStorage 의 이전 방문 값).
 *
 * 서버 쪽 짝은 `lib/lead-attribution-payload.ts` 의 `sanitizeLeadAttribution` 하나다 —
 * `/api/lead` 를 거치지 않는 미러링 경로(도입신청·쇼룸 예약)는 폼이 이 결과를 본문에
 * 평평하게 한 번 펼쳐 보내고, 서버가 그 함수로 다시 좁혀 읽는다. 여기에 필드를 더하면
 * 그쪽 STRING_KEYS 도 같이 늘려야 한다(tests/crm/lead-attribution-payload.test.ts 가 왕복을 잠근다).
 */
export function collectLeadAttribution(): LeadAttribution {
  if (typeof window === "undefined") return {}

  const url = new URL(window.location.href)
  const stored = safeReadStoredAttribution()
  const current: LeadAttribution = {}

  for (const [param, field] of Object.entries(ATTRIBUTION_PARAM_MAP)) {
    const value = trimAttributionValue(url.searchParams.get(param))
    if (value) current[field as AttributionField] = value
  }

  // 네이버는 클릭ID 한 값이 아니라 n_* 묶음으로 온다 — 목록·정규화 규칙은
  // lib/naver-ad-params.ts 하나가 정본이다. 이번 방문에 없으면 이전 방문 값을 유지한다
  // (utm·gclid 와 같은 last-touch-wins 규약).
  const naverAd: NaverAdAttribution | null =
    collectNaverAdParams((key) => url.searchParams.get(key)) ?? stored.naverAd ?? null

  const next: LeadAttribution = {
    ...stored,
    ...current,
    ...(naverAd ? { naverAd } : {}),
    landingPage: stored.landingPage ?? trimAttributionValue(window.location.href),
    currentPage: trimAttributionValue(window.location.href),
    referrer: trimAttributionValue(document.referrer) ?? stored.referrer,
  }

  safeStoreAttribution(next)
  return next
}
