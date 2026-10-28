/**
 * 추적 경계의 정본 — 어떤 경로에서 공개 크롬과 분석·광고 스크립트를 띄우지 않는지, 그리고
 * 외부(GA4·Google Ads·픽셀)로 나가는 URL 에서 무엇을 지우는지.
 *
 * 왜 따로 두나: gtag 는 page_location 을 지정하지 않으면 `location.href` 를 그대로 보낸다.
 * 그래서 `/contact?prefill=<챗봇 대화 요약>`, `/unsubscribe?email=`, `/checkout/success?
 * checkoutToken=&paymentKey=`, `/share/quote/<token>` 같은 주소가 쿼리째 구글로 나갔다
 * (10-26 점검 P0-5). 컴포넌트마다 제외 조건을 따로 적으면 다시 갈라지므로 여기 한 곳에 둔다.
 */

/**
 * 추적 스크립트를 아예 띄우지 않는 경로. 고객 키·토큰·계정 화면이 URL 에 실리는 곳이다.
 *
 * `/checkout` 은 일부러 빠져 있다 — 결제 전환(purchase)을 Google Ads/GA4 로 보내야 해서
 * gtag 로더는 유지하고, 대신 아래 정화로 토큰 쿼리가 나가지 않게 한다. GTM·페이지뷰·Meta·네이버·
 * 카카오의 `/checkout` 제외는 아래 `isAnalyticsTagExcludedPath` 가 맡는다.
 */
const SEGMENT_EXCLUDED_PREFIXES = [
  "/share",
  "/unsubscribe",
  "/account",
  "/auth",
  "/login",
  "/signup",
  "/forgot-password",
  "/receipt",
] as const

/** 기존 가드가 `startsWith("/admin")` 이었다 — 경계 없이 그대로 맞춰 상위 집합을 유지한다. */
const LOOSE_EXCLUDED_PREFIXES = ["/admin"] as const

export function isTrackingExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (LOOSE_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  // 새 접두는 경로 경계로만 맞춘다 — `/auth` 가 `/authors` 같은 공개 경로까지 꺼 버리면
  // 분석이 조용히 끊긴다.
  return SEGMENT_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/* ── 경로별 크롬·태그 범위 ─────────────────────────────────────────────────
 * 크롬과 태그는 범위가 다르다. 한때 AppChrome·GTM·Meta·네이버·카카오가 경로 목록을 각자
 * 복사해 들고 있어(`startsWith("/checkout")` 등) 한쪽 판정이 바뀌면 다른 쪽만 조용히 어긋났다.
 * 판정은 여기 세 함수뿐이고, 새 계측 스크립트도 이 중 하나를 쓴다.
 *
 *   경로                      | 공개 크롬 | gtag(Ads·GA4) | GTM·페이지뷰·연락처 링크·픽셀(Meta·네이버·카카오)
 *   공개 화면                 | O         | O             | O (픽셀은 마케팅 동의 후에만 마운트)
 *   /checkout                 | X         | O (URL 정화)  | X
 *   isTrackingExcludedPath    | 경로별    | X             | X
 *
 * `/checkout` 은 두 결정이 겹친다. round2 D11(2026-09-22)은 GTM·페이지뷰·픽셀·동의 배너까지
 * 되살렸고, 추적 경계 정리(2026-10-28)는 gtag 만 남기고 URL 을 정화하며 나머지의 기존 제외를
 * 유지했다. 통합 병합에서 10-28 쪽을 따른다 — 결제 전환(begin_checkout·purchase)은 gtag 와
 * 서버 전환(app/api/billing/checkout/prepare·confirm 의 MP·CAPI)으로 나간다
 * (docs/active/contact-showroom-checkout-develop-round2-2026-09-20.md §8 D11).
 */

/**
 * 헤더·푸터·챗봇·플로팅 CTA·채널톡·동의 배너를 걷어내는 경로 — 결제·신청 터널과 내부 화면.
 * 예전 AppChrome 가드(`startsWith`)와 같은 느슨한 접두 매칭을 유지한다.
 */
const CHROME_HIDDEN_PREFIXES = ["/admin", "/checkout", "/receipt"] as const

export function hidesPublicChrome(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return CHROME_HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/**
 * GTM·PageViewTracker·ContactLinkTracker·동의 게이트 픽셀(Meta·네이버·카카오)을 띄우지 않는 경로.
 * 공개 크롬이 없는 화면(`/checkout` 포함) 전부 + 추적 제외 경로. gtag 만 `/checkout` 에서 남는다.
 * AppChrome 의 `showAnalytics`(= showPublicChrome && !trackingExcluded)와 같은 집합이다.
 */
export function isAnalyticsTagExcludedPath(pathname: string | null | undefined): boolean {
  return hidesPublicChrome(pathname) || isTrackingExcludedPath(pathname)
}

/** 광고 귀속에 필요한 쿼리만 남긴다. 나머지(prefill·email·token·검색어 등)는 모두 버린다. */
const PASSTHROUGH_PARAM_KEYS = new Set(["gclid", "gbraid", "wbraid", "fbclid", "msclkid"])
const PASSTHROUGH_PARAM_PREFIXES = ["utm_", "n_"] as const
// 허용 키라도 값에 이메일이 들어 있으면 버린다(메일 캠페인이 utm_term 에 수신자를 박는 사고).
const EMAIL_VALUE_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

export function isPassthroughTrackingParam(key: string): boolean {
  const normalized = key.trim().toLowerCase()
  if (!normalized) return false
  return (
    PASSTHROUGH_PARAM_KEYS.has(normalized) ||
    PASSTHROUGH_PARAM_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  )
}

function filterSearch(search: string): string {
  const kept = new URLSearchParams()
  new URLSearchParams(search).forEach((value, key) => {
    if (!isPassthroughTrackingParam(key)) return
    if (EMAIL_VALUE_PATTERN.test(value)) return
    kept.append(key, value)
  })
  return kept.toString()
}

/**
 * 외부로 보낼 절대 URL — origin + pathname + 허용 파라미터. 해시·계정정보는 버린다.
 * http(s) 가 아니거나 해석할 수 없으면 빈 문자열(= 보내지 않음)을 돌려준다.
 */
export function sanitizeTrackingUrl(href: string | null | undefined, base?: string): string {
  const raw = href?.trim()
  if (!raw) return ""
  const resolvedBase =
    base ?? (typeof window !== "undefined" ? window.location?.origin : undefined)
  let url: URL
  try {
    url = new URL(raw, resolvedBase)
  } catch {
    return ""
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return ""
  const query = filterSearch(url.search)
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`
}

/**
 * 내부 경로 문자열(`/path?query#hash`)을 pathname + 허용 파라미터로 줄인다.
 * pathname 은 받은 그대로 둔다 — URL 로 다시 파싱하면 한글 경로가 인코딩 형태로 바뀌어
 * 같은 페이지가 집계에서 둘로 갈라진다.
 */
export function sanitizeTrackingPath(pathAndQuery: string | null | undefined): string {
  const raw = pathAndQuery?.trim()
  if (!raw) return "/"
  const withoutHash = raw.split("#", 1)[0] ?? ""
  const queryIndex = withoutHash.indexOf("?")
  const pathname = (queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash) || "/"
  const query = queryIndex >= 0 ? filterSearch(withoutHash.slice(queryIndex + 1)) : ""
  return `${pathname}${query ? `?${query}` : ""}`
}

/**
 * 이벤트 파라미터에 실리는 링크 대상(destination 등)을 정화한다.
 * `mailto:`·`tel:` 은 스킴만 남긴다 — 주소·번호 자체는 외부로 보내지 않는다.
 */
export function sanitizeTrackingTarget(value: string): string {
  const trimmed = value.trim()
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase()
  if (scheme === "http" || scheme === "https") return sanitizeTrackingUrl(trimmed)
  if (scheme) return `${scheme}:`
  if (trimmed.startsWith("/")) return sanitizeTrackingPath(trimmed)
  return trimmed
}

/* ── 문의 폼 미리채움 전달 ─────────────────────────────────────────────────
 * 챗봇 대화 요약을 `/contact?prefill=` 쿼리로 넘기면 그 문장이 주소창·리퍼러·분석 URL 로
 * 새어 나간다. 같은 탭 안에서 sessionStorage 로 건네고, 문의 페이지가 읽자마자 지운다.
 */
const CONTACT_PREFILL_KEY = "classinkr.contactPrefill"
const CONTACT_PREFILL_TTL_MS = 30 * 60 * 1000
const CONTACT_PREFILL_MAX_LENGTH = 4000

export function stashContactPrefill(message: string): void {
  const text = message.trim().slice(0, CONTACT_PREFILL_MAX_LENGTH)
  if (!text || typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      CONTACT_PREFILL_KEY,
      JSON.stringify({ message: text, at: Date.now() })
    )
  } catch {
    // 저장소가 막힌 환경(프라이빗 창 등)에서는 미리채움 없이 이동한다.
  }
}

/** 한 번 읽으면 지운다. 오래된 값(TTL 초과)은 버린다. */
export function takeContactPrefill(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(CONTACT_PREFILL_KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(CONTACT_PREFILL_KEY)
    const parsed = JSON.parse(raw) as { message?: unknown; at?: unknown }
    if (typeof parsed?.message !== "string") return null
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > CONTACT_PREFILL_TTL_MS) {
      return null
    }
    return parsed.message.trim() || null
  } catch {
    return null
  }
}
