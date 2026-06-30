// 고객 연락처(전화번호) 표시 유틸.
// NeoCRM 동기화 값은 국제 표기(0082·+82·82)로 들어오는 경우가 많아
// 한국 로컬 표기(010-1234-5678)로 정규화해 보여준다.
// 전화번호가 아닌 값(이메일·UID·계정ID 등)은 손대지 않고 원본을 그대로 반환한다.

const NON_DIGITS = /\D+/g

/** 전화번호로 볼 수 있는 값인지 판별 — 이메일·영숫자 식별자는 제외. */
export function looksLikePhone(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes("@")) return false
  // 숫자/공백/+ - ( ) . 만으로 구성되고, 숫자가 9자리 이상일 때만 전화번호로 본다.
  if (!/^[+\d().\s-]+$/.test(trimmed)) return false
  return trimmed.replace(NON_DIGITS, "").length >= 9
}

/** 0082 / +82 / 82 국제 표기를 0 으로 치환한 한국 로컬 숫자열로 정규화. */
export function toLocalKoreanDigits(value: string): string {
  const digits = value.replace(NON_DIGITS, "")
  if (digits.startsWith("0082")) return `0${digits.slice(4)}`
  if (digits.startsWith("82")) return `0${digits.slice(2)}`
  return digits
}

/**
 * 전화번호를 한국 로컬 표기로 포맷한다.
 * - 0082 · +82 · 82 → 0 으로 치환
 * - 휴대폰(11자리): 010-1234-5678 / 구형(10자리): 011-123-4567
 * - 서울 지역번호(02): 02-1234-5678 / 02-123-4567
 * 전화번호로 보이지 않으면 원본(trim)을 그대로 반환한다.
 */
export function formatKoreanPhone(value: string | null | undefined): string {
  if (!value) return ""
  if (!looksLikePhone(value)) return value.trim()

  const digits = toLocalKoreanDigits(value)

  // 서울 지역번호(02)는 국번 자릿수가 가변이라 별도 처리.
  if (digits.startsWith("02")) {
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  }

  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`

  // 예상 밖의 자릿수는 정규화된 숫자열(없으면 원본)로 노출.
  return digits || value.trim()
}
