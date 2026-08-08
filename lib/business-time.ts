/**
 * business-time.ts — 사내 운영 시간대(Asia/Seoul) 시각 계약의 단일 진실원.
 *
 * 배경: 어드민 입력 폼(datetime-local)은 오프셋 없는 'YYYY-MM-DDTHH:mm' 을 보낸다.
 * 이 값을 그대로 Postgres timestamptz 에 넣으면 UTC 로 해석돼 KST 입력이 9시간
 * 뒤로 밀린다(2026-07-27 파트너 워크스페이스 결함 P1). 저장은 오프셋을 명시하고,
 * 표시·필터는 저장된 인스턴트를 다시 KST 벽시계로 환산해야 왕복이 맞는다.
 *
 * 파트너 워크스페이스(lib/partners-data.ts)와 어드민 캘린더(lib/calendar-data.ts)가
 * 같은 규칙을 공유하므로 여기 한 곳에만 둔다 — 한쪽만 고치면 월 경계에서 조용히 어긋난다.
 * server-only 를 붙이지 않는다(순수 함수, 테스트에서 직접 검증).
 */

export const BUSINESS_TIME_ZONE = "Asia/Seoul"
// Asia/Seoul 은 DST 가 없어 고정 오프셋으로 다룰 수 있다.
export const BUSINESS_UTC_OFFSET = "+09:00"
const BUSINESS_UTC_OFFSET_MS = 9 * 60 * 60 * 1000

// 'Z' 또는 '±hh(:)mm' 로 끝나는, 이미 절대 시각인 값
const EXPLICIT_OFFSET_REGEX = /(?:Z|[+-]\d{2}:?\d{2})$/i
const NAIVE_DATE_TIME_REGEX = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/

/** 오프셋(Z/±hh:mm)이 붙어 이미 절대 시각인 값인지 */
export function hasExplicitUtcOffset(value: string) {
  return EXPLICIT_OFFSET_REGEX.test(value.replace(" ", "T"))
}

function toZonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    // h23: 자정을 '24' 가 아니라 '00' 으로 받는다
    hourCycle: "h23",
  }).formatToParts(date)

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00"

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  }
}

/**
 * timestamptz 에 넣을 값으로 정규화한다.
 * 오프셋 없는 KST 벽시계 입력에는 +09:00 을 명시하고, 이미 절대 시각인 값은
 * 이중 보정하지 않고 그대로 통과시킨다. 날짜만 있는 값도 원문 유지.
 */
export function toBusinessStorageDateTime(value: string) {
  const normalized = value.replace(" ", "T")
  if (EXPLICIT_OFFSET_REGEX.test(normalized)) return normalized

  const match = normalized.match(NAIVE_DATE_TIME_REGEX)
  if (match) return `${match[1]}T${match[2]}${BUSINESS_UTC_OFFSET}`

  return normalized
}

/**
 * KST 벽시계 'YYYY-MM-DDTHH:mm' 로 환산한다(날짜·시각 파싱용).
 * 오프셋 없는 값은 이미 벽시계로 보고 'T' 구분자만 정규화해 돌려준다.
 */
export function toBusinessClockDateTime(value: string) {
  const normalized = value.replace(" ", "T")
  if (!EXPLICIT_OFFSET_REGEX.test(normalized)) return normalized

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return normalized

  const { date, time } = toZonedParts(parsed)
  return `${date}T${time}`
}

/** 화면 표시용 KST 라벨 'YYYY-MM-DD HH:mm'. 파싱 불가한 값은 원문 유지. */
export function formatBusinessDateTimeLabel(value: string) {
  const normalized = value.replace(" ", "T")

  if (EXPLICIT_OFFSET_REGEX.test(normalized)) {
    const parsed = new Date(normalized)
    if (!Number.isNaN(parsed.getTime())) {
      const { date, time } = toZonedParts(parsed)
      return `${date} ${time}`
    }
  }

  const match = normalized.match(NAIVE_DATE_TIME_REGEX)
  if (match) return `${match[1]} ${match[2]}`

  return value
}

/**
 * KST 자정 기준 월 경계 인스턴트(ISO). 저장된 timestamptz 를 같은 기준으로 걸러야
 * KST 1일 00:30 일정이 전월로 새지 않는다.
 */
export function getBusinessMonthRangeIso(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - BUSINESS_UTC_OFFSET_MS)
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0) - BUSINESS_UTC_OFFSET_MS)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

/** KST 기준 '오늘'과 '이번 달' — 서버 TZ 와 무관하게 영업일 판정에 쓴다. */
export function getBusinessDateParts(date = new Date()) {
  const { date: businessDate } = toZonedParts(date)

  return {
    date: businessDate,
    month: businessDate.slice(0, 7),
  }
}
