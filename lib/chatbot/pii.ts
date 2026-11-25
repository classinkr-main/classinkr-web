/**
 * 공개 챗봇이 저장하거나 밖으로 보내는 글·주소에서 개인정보를 덜어 내는 순수 함수. 서버와 브라우저가 함께 쓴다(server-only 아님).
 *
 * - redactPii: 이메일·사업자번호·카드번호·전화번호를 자리표시([email] 등)로 바꾼다. 서버는 질문을 저장하기 전에
 *   (lib/chatbot/service.ts 가 다시 내보낸다), 위젯은 대화를 탭 저장소에 복원용으로 남기기 전에 같은 규칙을 쓴다.
 * - sanitizeChatbotPageUrl: 챗봇 요청 context.pageUrl 과 채널톡 setPage 에 싣는 주소. 쿼리의 토큰·이메일이
 *   챗봇 서버와 상담 수신함으로 가지 않게 한다(CX-04·쿠키 점검 C4).
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
