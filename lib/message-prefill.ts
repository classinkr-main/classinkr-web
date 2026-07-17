// 캠페인 메시지 수신자 프리필 딥링크 (message_to / message_name)
//
// 고객 360 드로어(components/admin/crm/Customer360Drawer.tsx)가
//   /admin/campaigns?message_to=<encoded phone>&message_name=<encoded name>
// 으로 연결한다. 캠페인 페이지는 이 파라미터를 마운트 시 1회만 소모(one-shot)하고
// router.replace로 URL에서 제거해, 새로고침·링크 공유 시 재적용되지 않게 한다.

export interface MessagePrefill {
  /** 발송 API에 그대로 넣을 수 있는 숫자만 남긴 국내 표기 번호 (예: 01012345678) */
  phone: string
  /** 딥링크에 담겨 온 원본 표기(하이픈 등 유지) — 라벨 표시용 */
  rawPhone: string
  name: string | null
}

/**
 * 하이픈·공백·+82 국가번호 표기를 solapi가 받는 국내 표기(0 시작, 숫자만)로 정규화한다.
 * 전화번호로 볼 수 없는 값(자릿수 미달/초과)은 null — 프리필하지 않는다.
 */
export function normalizePrefillPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("82") && digits.length >= 10) {
    digits = `0${digits.slice(2)}`
  }
  // 유선(지역번호 포함 최소 8자리) ~ 휴대폰(11자리) 범위 밖이면 거른다.
  if (digits.length < 8 || digits.length > 12) return null
  return digits
}

/** 캠페인 페이지 URL 쿼리스트링에서 수신자 프리필을 파싱한다. 없거나 무효하면 null. */
export function parseMessagePrefill(search: string): MessagePrefill | null {
  const params = new URLSearchParams(search)
  const rawPhone = params.get("message_to")?.trim() ?? ""
  if (!rawPhone) return null
  const phone = normalizePrefillPhone(rawPhone)
  if (!phone) return null
  const name = params.get("message_name")?.trim() || null
  return { phone, rawPhone, name }
}

/** message_to/message_name만 제거한 쿼리스트링을 돌려준다(다른 파라미터는 보존). */
export function stripMessagePrefillParams(search: string): string {
  const params = new URLSearchParams(search)
  params.delete("message_to")
  params.delete("message_name")
  return params.toString()
}
