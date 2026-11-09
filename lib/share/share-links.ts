/**
 * 공유 버튼(components/share/ShareActions.tsx)의 순수 함수 — 플랫폼 판별, 문자(SMS) 링크, 클립보드 복사.
 * 브라우저 전역을 직접 읽지 않고 인자로 받아 테스트할 수 있게 둔다(copyText 만 예외).
 */

export type ShareChannel = "copy" | "kakao" | "instagram" | "sms" | "native"

export interface SharePlatform {
  /** 휴대폰·태블릿(문자 앱·공유 시트가 있는 기기) */
  isMobile: boolean
  isIOS: boolean
  isAndroid: boolean
}

/**
 * UA 로 기기를 가른다. iPadOS 13+ 사파리는 데스크톱 맥 UA 를 쓰므로 터치 포인트 수로 보정한다.
 */
export function detectSharePlatform(userAgent: string, maxTouchPoints = 0): SharePlatform {
  const ua = userAgent || ""
  const isIPadDesktopUa = /Macintosh/.test(ua) && maxTouchPoints > 1
  const isIOS = /iPhone|iPad|iPod/.test(ua) || isIPadDesktopUa
  const isAndroid = /Android/i.test(ua)
  const isMobile = isIOS || isAndroid || /Mobile|IEMobile|Opera Mini/i.test(ua)
  return { isMobile, isIOS, isAndroid }
}

/** 문자·메신저 본문 — 제목 한 줄 + 주소 한 줄 */
export function buildShareText(title: string, url: string): string {
  const cleanTitle = title.trim()
  return cleanTitle ? `${cleanTitle}\n${url}` : url
}

/**
 * 기본 문자 앱을 여는 sms: 링크. 받는 사람은 비워 두고 본문만 채운다.
 * iOS 는 `sms:&body=`, 안드로이드는 `sms:?body=` 가 표준 동작이다.
 */
export function buildSmsHref(body: string, platform: Pick<SharePlatform, "isIOS">): string {
  const encoded = encodeURIComponent(body)
  return platform.isIOS ? `sms:&body=${encoded}` : `sms:?body=${encoded}`
}

/** 인스타그램은 웹 공유 주소가 없다. 데스크톱에서는 링크를 복사한 뒤 DM 함을 연다. */
export const INSTAGRAM_DIRECT_INBOX_URL = "https://www.instagram.com/direct/inbox/"

/**
 * 클립보드 복사. 보안 연결의 Clipboard API 를 먼저 쓰고, 없거나 거부되면 숨긴 textarea + execCommand 로 한 번 더 시도한다.
 * 성공 여부만 돌려준다(던지지 않는다).
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 권한 거부·비보안 연결 — 아래 대체 경로로
    }
  }
  if (typeof document === "undefined") return false

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "0"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

/** navigator.share 가 사용자가 시트를 닫아 끝난 경우(AbortError) */
export function isShareAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}
