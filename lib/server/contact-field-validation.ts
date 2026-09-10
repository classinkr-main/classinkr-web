/**
 * contact-field-validation — 공개 폼이 공유하는 입력 정규화·검증 원시 함수.
 *
 * 같은 사람이 같은 연락처를 남기는데 폼마다 통과 기준이 다르면 안 된다.
 * 도입 신청(`lib/checkout-requests.ts`)과 쇼룸 예약(`lib/showroom/bookings.ts`)이
 * 이 모듈 하나를 공유한다. 새 공개 폼을 만들 때도 여기서 가져다 쓴다.
 *
 * 전부 순수 함수다 — I/O 도 시계 접근도 없다.
 */

/** 공개 폼 공통 입력 길이 상한. */
export const MAX_ORG_LENGTH = 200
export const MAX_NAME_LENGTH = 200
export const MAX_PHONE_LENGTH = 40
export const MAX_EMAIL_LENGTH = 254
export const MAX_MEMO_LENGTH = 2000
export const MAX_SOURCE_PAGE_LENGTH = 500

/** TLD 2자 이상 강제 — `lib/server/lead-capture.ts` 와 같은 기준(가짜 이메일 차단). */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 연속 공백을 하나로 눕히고 자른다. 한 줄 입력용. */
export function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

/** 줄바꿈을 보존해야 하는 자유 입력(메모)용. */
export function normalizeMultilineText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

/** 한국형 번호를 관대하게 판정 — +82/공백/하이픈 허용, 숫자 9~11자리면 통과. */
export function normalizeKoreanPhoneDigits(value: string) {
  let digits = value.replace(/\D/g, "")
  if (digits.startsWith("0082")) digits = digits.slice(4)
  if (digits.startsWith("82")) digits = `0${digits.slice(2)}`
  return digits
}

export function isPlausibleKoreanPhone(value: string) {
  const digits = normalizeKoreanPhoneDigits(value)
  return digits.length >= 9 && digits.length <= 11
}

/** 'YYYY-MM-DD' 가 실제로 존재하는 날짜인가. 2026-02-30 을 걸러낸다. */
export function isRealCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

/** 'YYYY-MM-DD' + N일. UTC 자정 기준으로만 계산해 서버 TZ 에 흔들리지 않는다. */
export function shiftIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return [
    shifted.getUTCFullYear().toString().padStart(4, "0"),
    (shifted.getUTCMonth() + 1).toString().padStart(2, "0"),
    shifted.getUTCDate().toString().padStart(2, "0"),
  ].join("-")
}
