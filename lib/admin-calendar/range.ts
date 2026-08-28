/**
 * range.ts — 캘린더 뷰별 기간 계산
 *
 * 전부 "YYYY-MM-DD" 문자열 위에서 계산한다. Date 객체를 로컬 타임존으로 다루면
 * KST(UTC+9)에서 toISOString() 이 전날로 밀리는 고전적인 버그가 나는데,
 * 캘린더는 시각이 아니라 날짜만 다루므로 문자열 축을 벗어날 이유가 없다.
 * (인스턴트 축이 필요한 곳은 lib/business-time.ts 가 따로 담당한다.)
 *
 * 내부 산술만 UTC 기준 Date 로 잠깐 올라갔다 내려온다 — UTC 는 DST 가 없어
 * "며칠 더하기"가 항상 정확히 24시간이다.
 */

export const CALENDAR_VIEWS = ["month", "week", "assignee", "timeline", "agenda"] as const
export type CalendarViewId = (typeof CALENDAR_VIEWS)[number]

export interface CalendarRange {
  /** YYYY-MM-DD, 포함 */
  from: string
  /** YYYY-MM-DD, 포함 */
  to: string
}

/** 담당자 뷰가 한 화면에 담는 일수. 1주 — 3b 디자인이 주 단위. */
export const ASSIGNEE_VIEW_DAYS = 7
/** 타임라인 뷰의 "넓게 보기" 범위가 담는 주 수. */
export const TIMELINE_VIEW_WEEKS = 8

/**
 * 타임라인 뷰가 한 화면에 담는 범위. 8주 고정이던 것을 고를 수 있게 했다(2026-08-28).
 *
 * 고정 8주가 문제였다: 격자 폭이 같은데 56칸으로 쪼개면 하루가 22px라 단일 일정 막대에
 * 글자가 한 자도 안 들어간다 — 기간 겹침을 보는 뷰가 바코드가 된다. 한 주면 175px,
 * 한 달이면 40px로 막대가 막대답게 보인다.
 *
 * week·month 는 주 뷰·월 뷰와 "같은 모양"을 쓴다. 우연이 아니라 의도다 —
 * calendar-prefetch.ts 가 모양으로 뷰를 되짚으므로, 같은 모양이면 인접 기간 예열이
 * 공짜로 따라온다.
 */
export const TIMELINE_SPANS = ["week", "month", "wide"] as const
export type TimelineSpan = (typeof TIMELINE_SPANS)[number]

export const DEFAULT_TIMELINE_SPAN: TimelineSpan = "month"

export function isTimelineSpan(value: unknown): value is TimelineSpan {
  return typeof value === "string" && (TIMELINE_SPANS as readonly string[]).includes(value)
}

/** 뷰 기간 계산에 붙는 선택 인자. 지금은 타임라인 범위 하나뿐이다. */
export interface ViewRangeOptions {
  timelineSpan?: TimelineSpan
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isCalendarViewId(value: unknown): value is CalendarViewId {
  return typeof value === "string" && (CALENDAR_VIEWS as readonly string[]).includes(value)
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false
  // 2026-02-30 처럼 형식은 맞지만 존재하지 않는 날짜를 거른다.
  return formatDate(parseDate(value)) === value
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function addDays(date: string, days: number): string {
  const next = parseDate(date)
  next.setUTCDate(next.getUTCDate() + days)
  return formatDate(next)
}

/**
 * 개월 단위 이동. 말일 보정을 한다 — 1/31 에서 한 달 뒤는 2/31(=3/3)이 아니라 2/28 이다.
 */
export function addMonths(date: string, months: number): string {
  const source = parseDate(date)
  const targetYear = source.getUTCFullYear()
  const targetMonth = source.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(source.getUTCDate(), lastDay)
  return formatDate(new Date(Date.UTC(targetYear, targetMonth, day)))
}

/** 0=일 … 6=토. 요일 헤더와 주말 표시에 쓴다. */
export function getWeekday(date: string): number {
  return parseDate(date).getUTCDay()
}

/** 그 날짜가 속한 주의 월요일. 한국 업무 주는 월요일에 시작한다. */
export function startOfWeek(date: string): string {
  return addDays(date, -((getWeekday(date) + 6) % 7))
}

export function startOfMonth(date: string): string {
  const source = parseDate(date)
  return toDateString(source.getUTCFullYear(), source.getUTCMonth() + 1, 1)
}

export function endOfMonth(date: string): string {
  const source = parseDate(date)
  const last = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0))
  return formatDate(last)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)
}

/** from~to 를 하루씩 펼친다(양끝 포함). 역전된 범위는 빈 배열. */
export function enumerateDates(from: string, to: string): string[] {
  const total = daysBetween(from, to)
  if (total < 0) return []
  return Array.from({ length: total + 1 }, (_, index) => addDays(from, index))
}

/**
 * 뷰가 화면에 담는 날짜 구간.
 *
 * 월/목록은 달 경계에 맞추고, 나머지는 주 경계(월요일)에 맞춘다 — 주 단위로 정렬돼야
 * 앞뒤로 넘겨도 열이 흔들리지 않는다.
 */
export function getViewRange(
  view: CalendarViewId,
  anchor: string,
  options: ViewRangeOptions = {}
): CalendarRange {
  switch (view) {
    case "week":
      return { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 6) }
    case "assignee":
      return { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), ASSIGNEE_VIEW_DAYS - 1) }
    case "timeline": {
      const span = options.timelineSpan ?? DEFAULT_TIMELINE_SPAN
      if (span === "week") return { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 6) }
      if (span === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) }
      return { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), TIMELINE_VIEW_WEEKS * 7 - 1) }
    }
    case "month":
    case "agenda":
    default:
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) }
  }
}

/**
 * 이전/다음 버튼의 이동 폭. 뷰가 담는 기간과 같은 폭으로 움직여야 넘길 때 빈틈이나
 * 중복이 생기지 않는다(타임라인만 8주를 담되 4주씩 움직여 절반이 겹치게 둔다 —
 * 기간 기획은 앞뒤 맥락이 함께 보여야 하기 때문).
 */
export function stepAnchor(
  view: CalendarViewId,
  anchor: string,
  direction: 1 | -1,
  options: ViewRangeOptions = {}
): string {
  switch (view) {
    case "week":
      return addDays(anchor, 7 * direction)
    case "assignee":
      return addDays(anchor, ASSIGNEE_VIEW_DAYS * direction)
    case "timeline": {
      const span = options.timelineSpan ?? DEFAULT_TIMELINE_SPAN
      if (span === "week") return addDays(anchor, 7 * direction)
      if (span === "month") return addMonths(startOfMonth(anchor), direction)
      // 넓게 보기만 절반(4주)씩 겹치며 전진한다 — 기간 기획은 앞뒤 맥락이 함께 보여야 한다.
      return addDays(anchor, (TIMELINE_VIEW_WEEKS / 2) * 7 * direction)
    }
    case "month":
    case "agenda":
    default:
      return addMonths(startOfMonth(anchor), direction)
  }
}

function formatKoreanDate(date: string, options: Intl.DateTimeFormatOptions): string {
  // UTC 로 파싱했으니 포맷도 UTC 로 읽어야 하루가 밀리지 않는다.
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("ko-KR", { timeZone: "UTC", ...options })
}

/** 툴바에 찍히는 기간 라벨. */
export function formatRangeLabel(
  view: CalendarViewId,
  anchor: string,
  options: ViewRangeOptions = {}
): string {
  const { from, to } = getViewRange(view, anchor, options)

  // 달 경계에 정확히 맞는 기간은 "2026년 8월"이 날짜 범위보다 읽기 쉽다 —
  // 타임라인의 월 범위도 같은 규칙을 탄다.
  if (view === "month" || view === "agenda" || (from === startOfMonth(from) && to === endOfMonth(from))) {
    const [year, month] = from.split("-")
    return `${year}년 ${Number(month)}월`
  }

  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const start = formatKoreanDate(from, { year: "numeric", month: "long", day: "numeric" })
  const end = formatKoreanDate(to, sameYear ? { month: "long", day: "numeric" } : { year: "numeric", month: "long", day: "numeric" })
  return `${start} – ${end}`
}

/** 이벤트(멀티데이 포함)가 기간과 겹치는가. */
export function overlapsRange(
  event: { date: string; endDate?: string },
  range: CalendarRange
): boolean {
  return event.date <= range.to && (event.endDate ?? event.date) >= range.from
}

/**
 * 범위가 걸치는 (year, month) 목록. 저장소가 월 단위로만 조회되는 소스들을
 * 임의 기간으로 확장할 때 쓴다(8주 타임라인이라도 최대 3개월).
 */
export function enumerateMonths(range: CalendarRange): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = []
  let cursor = startOfMonth(range.from)
  const last = startOfMonth(range.to)
  while (cursor <= last) {
    const [year, month] = cursor.split("-").map(Number)
    months.push({ year, month })
    cursor = addMonths(cursor, 1)
  }
  return months
}
