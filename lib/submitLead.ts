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
type LeadAttribution = Partial<
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
    // Attribution capture should never block lead submission.
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

// website는 스팸 봇 감지용 honeypot 필드 — 서버에서 채워진 제출을 무시한다
export async function submitLead(data: Omit<LeadPayload, "timestamp"> & { website?: string }) {
  const res = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      ...collectLeadAttribution(),
    }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || "제출에 실패했습니다. 다시 시도해주세요.")
  }

  return payload
}
