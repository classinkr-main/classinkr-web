// lib/lead-attribution-payload.ts
// 요청 본문 → 리드 귀속 필드. 순수 모듈(서버 의존 없음).
//
// ── 왜 따로 있나 ─────────────────────────────────────────────
// 공개 폼은 /api/lead 로 직접 가서 buildLeadPayload 가 귀속을 정규화하지만,
// **도입신청·쇼룸 예약처럼 자기 API 를 거쳐 리드를 미러링하는 경로**는 그 함수를 타지 않는다.
// 그 경로들이 각자 귀속을 조립하다 보니 실제로는 아무것도 안 넘기고 있었다 —
// 광고를 타고 들어와 도입신청한 리드가 통째로 "출처 미상"으로 남았다(2026-09-14 실측).
//
// 그래서 미러링 경로가 공유할 정규화기를 한 곳에 둔다. 새 미러링 경로가 생기면
// 이 함수만 부르면 되고, 채널이 늘 때 고칠 곳도 여기 하나다.

import { parseNaverAd, type NaverAdAttribution } from "@/lib/naver-ad-params"

/** LeadPayload 중 귀속에 해당하는 조각. 전부 선택값 — 없으면 키 자체를 만들지 않는다. */
export interface LeadAttributionPayload {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  gclid?: string
  fbclid?: string
  msclkid?: string
  ttclid?: string
  landingPage?: string
  currentPage?: string
  referrer?: string
  naverAd?: NaverAdAttribution
}

/** 문자열 귀속 키 — camelCase(클라이언트)와 snake_case(외부 연동) 양쪽을 받는다. */
const STRING_KEYS = [
  ["utmSource", "utm_source"],
  ["utmMedium", "utm_medium"],
  ["utmCampaign", "utm_campaign"],
  ["utmTerm", "utm_term"],
  ["utmContent", "utm_content"],
  ["gclid", "gclid"],
  ["fbclid", "fbclid"],
  ["msclkid", "msclkid"],
  ["ttclid", "ttclid"],
  ["landingPage", "landing_page"],
  ["currentPage", "current_page"],
  ["referrer", "referrer"],
] as const satisfies ReadonlyArray<readonly [keyof LeadAttributionPayload, string]>

/** 한 값의 상한 — 클라이언트 수집기(lib/marketing-attribution.ts)와 같은 500자 규약. */
const MAX_LENGTH = 500

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_LENGTH) : undefined
}

/**
 * 요청 본문에서 귀속을 뽑는다.
 *
 * `raw` 는 두 형태를 다 받는다:
 *  - `{ attribution: {...} }` — 클라이언트가 collectLeadAttribution() 을 통째로 보낸 경우
 *  - `{ utmSource: ..., gclid: ... }` — 필드를 평평하게 보낸 경우(정적 랜딩 규약)
 * 둘이 겹치면 **평평한 쪽이 이긴다** — 그쪽이 그 요청에 대해 더 구체적인 값이다.
 *
 * 값이 하나도 없으면 빈 객체 — 호출부가 그대로 펼쳐도 리드 필드를 undefined 로 덮지 않는다.
 */
export function sanitizeLeadAttribution(raw: unknown): LeadAttributionPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const body = raw as Record<string, unknown>
  const nested =
    body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)
      ? (body.attribution as Record<string, unknown>)
      : {}

  const out: LeadAttributionPayload = {}
  for (const [camel, snake] of STRING_KEYS) {
    const value =
      text(body[camel]) ?? text(body[snake]) ?? text(nested[camel]) ?? text(nested[snake])
    if (value !== undefined) out[camel] = value
  }

  // 네이버는 객체라 위 문자열 경로를 못 탄다. 목록 밖 키 제거는 parseNaverAd 가 한다.
  const naverAd =
    parseNaverAd(body.naverAd ?? body.naver_ad) ??
    parseNaverAd(nested.naverAd ?? nested.naver_ad)
  if (naverAd) out.naverAd = naverAd

  return out
}

/** 귀속 신호가 하나라도 있는가 — 로그·진단용(저장 여부 판단에는 쓰지 않는다). */
export function hasAnyAttribution(attribution: LeadAttributionPayload): boolean {
  return Object.keys(attribution).length > 0
}
