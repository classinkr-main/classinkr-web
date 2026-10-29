import { sanitizeLeadAttribution } from "@/lib/lead-attribution-payload"

const ATTRIBUTION_KEYS = [
  "utmSource", "utm_source", "utmMedium", "utm_medium", "utmCampaign", "utm_campaign",
  "utmTerm", "utm_term", "utmContent", "utm_content", "gclid", "fbclid", "msclkid", "ttclid",
  "landingPage", "landing_page", "currentPage", "current_page", "referrer", "naverAd", "naver_ad", "attribution",
] as const

/** 공개 신청 본문을 서버 동의 상태에 따라 제한한다. 본문에서 주장한 동의는 신뢰하지 않는다. */
export function filterPublicAttribution(
  input: unknown,
  options: { analytics: boolean; marketing: boolean; anonymousId: string | null; origin: string },
): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  const source = input as Record<string, unknown>
  const filtered = { ...source }
  for (const key of ATTRIBUTION_KEYS) delete filtered[key]
  if (options.marketing) Object.assign(filtered, sanitizeLeadAttribution(source))
  delete filtered.anonymousId
  delete filtered.anonymous_id
  if (options.analytics && options.anonymousId) filtered.anonymousId = options.anonymousId

  // 예약·신청의 경로 레이블은 보존하되 동의가 없는 경우 쿼리와 전체 URL을 보관하지 않는다.
  if (!options.marketing && typeof source.sourcePage === "string") {
    try {
      const url = new URL(source.sourcePage, options.origin)
      filtered.sourcePage = url.origin === options.origin ? url.pathname : null
    } catch {
      filtered.sourcePage = null
    }
  }
  return filtered
}
