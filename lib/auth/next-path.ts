/**
 * 인증 화면의 `next` 파라미터 처리 유틸.
 * 외부 리다이렉트를 막기 위해 앱 내부 경로만 허용한다.
 */

const RETURN_LABELS: Record<string, string> = {
  "/account": "내 계정",
  "/resources": "자료실",
  "/premium": "프리미엄 콘텐츠",
}

/** `//host` 같은 프로토콜-상대 URL과 빈 값은 기본 경로로 떨어뜨린다. */
export function sanitizeNextPath(
  value: string | string[] | undefined,
  fallback = "/account"
): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}

/** `next` 경로를 사용자에게 보여줄 한국어 라벨로 변환한다(없으면 undefined). */
export function resolveReturnLabel(next: string): string | undefined {
  if (RETURN_LABELS[next]) return RETURN_LABELS[next]
  if (next.startsWith("/resources/")) return "자료 상세"
  if (next.startsWith("/premium/")) return "프리미엄 콘텐츠"
  if (next.startsWith("/account")) return "내 계정"
  return undefined
}
