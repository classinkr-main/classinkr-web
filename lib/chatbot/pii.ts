/**
 * 공개 챗봇이 저장하거나 밖으로 보내는 글·주소에서 개인정보를 덜어 내는 순수 함수. 서버와 브라우저가 함께 쓴다(server-only 아님).
 *
 * - redactPii: 이메일·사업자번호·카드번호·전화번호를 자리표시([email] 등)로 바꾼다. 서버는 질문을 저장하기 전에
 *   (lib/chatbot/service.ts 가 다시 내보낸다), 위젯은 대화를 탭 저장소에 복원용으로 남기기 전에 같은 규칙을 쓴다.
 * - sanitizeChatbotPageUrl: 챗봇 요청 context.pageUrl 과 채널톡 setPage 에 싣는 주소. 쿼리의 토큰·이메일이
 *   챗봇 서버와 상담 수신함으로 가지 않게 한다(CX-04·쿠키 점검 C4).
 * - chatbotRequestReferrer: 위젯의 챗봇 fetch 에 주는 referrer. 같은 출처 요청은 기본 정책이면 Referer 헤더에
 *   주소 전체(쿼리 포함)가 실리고, 서버는 그 헤더를 chat_sessions.referrer 로 저장한다.
 * - sanitizeChatbotUtm·sanitizeChatSessionAttribution: 요청 context.utm 과 chat_sessions 의 referrer·utm.
 *   위젯이 한 번, 서버가 저장 직전에 한 번 더 같은 규칙으로 거른다(옛 위젯·직접 호출 대비).
 */
import { isTrackingExcludedPath, sanitizeTrackingUrl } from "@/lib/tracking-paths"

export function redactPii(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g, "[business_number]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[payment_number]")
    .replace(/\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[phone]")
}

/**
 * 외부 추적과 같은 정화(sanitizeTrackingUrl: origin + path + 광고 귀속 쿼리만)를 거친다. 추적 제외 경로(/unsubscribe·/share·
 * /account 등)는 경로 자체가 민감한 화면이라 광고 쿼리도 남기지 않고 origin + path 만 보낸다. 해석할 수 없으면 undefined.
 */
export function sanitizeChatbotPageUrl(href: string | null | undefined, base?: string): string | undefined {
  const cleaned = sanitizeTrackingUrl(href, base)
  if (!cleaned) return undefined
  const url = new URL(cleaned)
  return isTrackingExcludedPath(url.pathname) ? `${url.origin}${url.pathname}` : cleaned
}

/**
 * 위젯의 챗봇 fetch(query/stream·feedback·recommended-questions)에 `referrer` 로 넘긴다. context.pageUrl 과 같은 정화를 거친
 * 같은 출처 주소라 Referer 헤더에도 그 주소만 실린다. 해석할 수 없으면 "" — Referer 를 보내지 않는다.
 * (lib/analytics.ts 의 /api/track/event 요청과 같은 방식이다.)
 */
export function chatbotRequestReferrer(
  href: string | null | undefined = typeof window === "undefined" ? undefined : window.location.href
): string {
  return sanitizeChatbotPageUrl(href) ?? ""
}

const CHATBOT_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const
const CHATBOT_UTM_VALUE_MAX_LENGTH = 200

function readParam(source: unknown, key: string): unknown {
  if (source instanceof URLSearchParams) return source.get(key)
  if (source && typeof source === "object" && !Array.isArray(source)) return (source as Record<string, unknown>)[key]
  return undefined
}

/**
 * 챗봇 요청 context.utm 과 chat_sessions.utm 에 싣는 광고 귀속 값. utm 다섯 키의 문자열만 남긴다.
 * 개인정보처럼 보이는 값(redactPii 가 바꾸는 이메일·전화·사업자·카드 번호 — 메일 캠페인이 utm_term 에 수신자를 박는 사고)은
 * 버리고, 추적 제외 경로(/unsubscribe·/share·/account 등)에서는 아무것도 남기지 않는다(sanitizeChatbotPageUrl 과 같은 경계).
 * source 는 주소 쿼리(URLSearchParams)나 요청 본문의 객체다.
 */
export function sanitizeChatbotUtm(source: unknown, pathname?: string | null): Record<string, string> {
  if (isTrackingExcludedPath(pathname)) return {}
  const utm: Record<string, string> = {}
  for (const key of CHATBOT_UTM_KEYS) {
    const raw = readParam(source, key)
    if (typeof raw !== "string") continue
    const value = raw.trim().slice(0, CHATBOT_UTM_VALUE_MAX_LENGTH)
    if (!value || redactPii(value) !== value) continue
    utm[key] = value
  }
  return utm
}

function pathnameOf(value: unknown): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (!raw) return null
  if (raw.startsWith("/")) return raw.split(/[?#]/, 1)[0] || "/"
  try {
    return new URL(raw).pathname
  } catch {
    return null
  }
}

/**
 * 서버가 chat_sessions 에 저장하기 직전에 거르는 referrer·utm(CX-04·C4). Referer 헤더는 위젯이 보낸 정화 주소여야 하지만
 * 옛 위젯·직접 호출은 주소 전체를 싣는다 — pageUrl 과 같은 규칙으로 다시 정화한다. utm 은 요청 경로(context.path)·pageUrl·
 * 리퍼러 가운데 하나라도 추적 제외 경로면 버린다.
 */
export function sanitizeChatSessionAttribution(input: {
  referrer?: string | null
  utm?: unknown
  path?: unknown
  pageUrl?: unknown
}): { referrer: string | null; utm: Record<string, string> } {
  const referrer = sanitizeChatbotPageUrl(input.referrer) ?? null
  const excluded = [input.path, input.pageUrl, input.referrer].some((value) => isTrackingExcludedPath(pathnameOf(value)))
  return { referrer, utm: excluded ? {} : sanitizeChatbotUtm(input.utm) }
}
