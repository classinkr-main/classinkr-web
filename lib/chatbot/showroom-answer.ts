import { getBusinessDateParts } from "@/lib/business-time"
import type { ChatbotQueryResponse } from "@/lib/chatbot/service"
import { getShowroomAvailability, type ShowroomAvailabilityResult } from "@/lib/showroom/availability"
import {
  addIsoDays,
  getIsoWeekday,
  isValidIsoDate,
  SHOWROOM_MAX_ADVANCE_DAYS,
  SHOWROOM_MIN_LEAD_BUSINESS_DAYS,
  type ShowroomDayBlockedReason,
} from "@/lib/showroom/slots"

const AVAILABILITY_TIMEOUT_MS = 3_000
const SHOWROOM = /쇼룸|showroom/i
const BOOKING_QUESTION = /예약|방문|시간|일정|갈\s*수|가도|갈래|갈게|열려|비어|빈\s*자리|언제/
// 이미 신청한 예약, 장애, 사람이 필요한 상담은 기존 상담 경로가 처리한다.
const SUPPORT_QUESTION = /확정|취소|변경|문자|예약\s*(?:했|한\s*건|상태|번호)|신청\s*(?:했|한\s*건|상태)|버튼|오류|에러|고장|버벅|느려|느리|같은\s*모델|안\s*(?:열|눌|보여|와|왔)|(?:직원|상담원|담당자).{0,10}(?:연결|통화)|환불|견적서/
const DATE_PATTERN = /\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b|(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일|\b\d{1,2}[/.]\d{1,2}\b(?![/.]\d)|오늘|당일|내일|모레|(?:다다음\s*주|다음\s*주|이번\s*주)?\s*[일월화수목금토]요일/g
const DATE_HINT = /오늘|당일|내일|모레|요일|(?:이번|다음|다다음)\s*(?:주|달)|\d\s*(?:월|일)|\d{4}[-./]\d/
const CLOCK_PATTERN = /(?:(오전|오후)\s*)?(?<!\d)(\d{1,2})(?::(\d{2})\b|\s*시(?!간|점|작)(?:\s*(?:(\d{1,2})\s*분|(반)))?)/g
const PERIOD_PATTERN = /오전|오후|저녁/g
const WEEKDAYS = "일월화수목금토"
const SHOWROOM_SOURCE = {
  title: "목동 쇼룸 예약",
  urlPath: "/showroom#booking",
  category: "onboarding",
  excerpt: "쇼룸 방문 날짜와 시간을 골라 신청할 수 있어요.",
  score: 100,
}
const BOOKING_LINK_TEXT = "아래 [목동 쇼룸 예약]에서 날짜와 시간을 골라 신청해 주세요. 방문이 확정되면 문자로 안내해 드려요."

type AnswerMode = "direct_answer" | "clarifying_question" | "fallback"

interface ShowroomAnswer {
  response: Pick<ChatbotQueryResponse, "answer" | "answerMode" | "confidence" | "needsHandoff" | "sources" | "suggestedQuestions" | "unresolved">
  category: "onboarding"
  intent: "sales_consulting"
  handoffIntent: "demo"
  suppressSalesFollowUp: true
  topicId: "showroom-booking" | "showroom-availability"
  warning?: string
}

type RequestedTime = { clock?: string; period?: string; relation?: "after" | "before" }

function makeShowroomAnswer(
  answer: string,
  topicId: ShowroomAnswer["topicId"],
  answerMode: AnswerMode = "direct_answer",
  warning?: string
): ShowroomAnswer {
  return {
    response: {
      answer,
      answerMode,
      confidence: answerMode === "direct_answer" ? 0.95 : 0.5,
      needsHandoff: false,
      sources: [SHOWROOM_SOURCE],
      suggestedQuestions: [],
      unresolved: answerMode !== "direct_answer",
    },
    category: "onboarding",
    intent: "sales_consulting",
    handoffIntent: "demo",
    suppressSalesFollowUp: true,
    topicId,
    warning,
  }
}

function parseExplicitDate(text: string, today: string) {
  const parts = text.match(/\d+/g) ?? []
  const [year, month, day] = parts.length === 3 ? parts : [today.slice(0, 4), ...parts]
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  if (!isValidIsoDate(value)) return null
  if (parts.length === 3 || value >= today) return value

  const nextYear = `${Number(year) + 1}${value.slice(4)}`
  return nextYear <= addIsoDays(today, SHOWROOM_MAX_ADVANCE_DAYS) && isValidIsoDate(nextYear) ? nextYear : value
}

function parseVisitDate(message: string, today: string) {
  const dates = [...message.matchAll(DATE_PATTERN)].map(([text]) => text.trim())
  const [date, label] = dates
  if (!date) return null
  if (/^\d/.test(date)) {
    const value = parseExplicitDate(date, today)
    if (dates.length === 1) return value
    // '11월 25일 수요일'처럼 날짜에 요일을 함께 쓴 경우 달력과 일치해야 한다.
    return value && dates.length === 2 && /^[일월화수목금토]요일$/.test(label) && getIsoWeekday(value) === WEEKDAYS.indexOf(label[0]) ? value : null
  }
  if (dates.length !== 1) return null
  if (date === "오늘" || date === "당일") return today
  if (date === "내일") return addIsoDays(today, 1)
  if (date === "모레") return addIsoDays(today, 2)

  const weekday = WEEKDAYS.indexOf(date.at(-3) ?? "")
  const currentWeekday = getIsoWeekday(today)
  const week = date.replace(/\s+/g, "")
  if (weekday < 0) return null
  if (!week.includes("주")) return addIsoDays(today, (weekday - currentWeekday + 7) % 7)

  // 월요일에 시작하는 KST 달력의 주를 기준으로 해석한다.
  const weekOffset = week.startsWith("다다음") ? 14 : week.startsWith("다음") ? 7 : 0
  return addIsoDays(today, weekOffset + ((weekday + 6) % 7) - ((currentWeekday + 6) % 7))
}

function parseRequestedTime(message: string): RequestedTime | null {
  const clocks = [...message.matchAll(CLOCK_PATTERN)]
  const periods = new Set(message.match(PERIOD_PATTERN))
  if (clocks.length > 1 || periods.size > 1) return null
  const [period] = periods
  const [clock] = clocks
  if (!clock) return { period }

  const [match, clockPeriod, hourText, colonMinutes, namedMinutes, half] = clock
  let hour = Number(hourText)
  const minute = Number(colonMinutes ?? namedMinutes ?? (half ? 30 : 0))
  if (hour > 23 || minute > 59 || (clockPeriod && (hour === 0 || hour > 12))) return null
  if (clockPeriod) hour = (hour % 12) + (clockPeriod === "오후" ? 12 : 0)
  // 쇼룸은 오전 10시부터 오후 시간에만 신청을 받으므로 '2시'는 오후로 읽는다.
  if (!clockPeriod && !colonMinutes && hour > 0 && hour < 8) hour += 12
  const suffix = message.slice(clock.index + match.length)
  const relation = /^\s*(?:부터|이후|이상)/.test(suffix) ? "after" : /^\s*(?:까지|이전|이하)/.test(suffix) ? "before" : undefined
  return { clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, period, relation }
}

function formatVisitDate(value: string) {
  const [, month, day] = value.split("-").map(Number)
  return `${month}월 ${day}일(${WEEKDAYS[getIsoWeekday(value)]})`
}

function matchesTime(time: string, requested: RequestedTime) {
  if (requested.period === "오전" && time >= "12:00") return false
  if (requested.period === "오후" && time < "12:00") return false
  if (requested.period === "저녁" && time < "18:00") return false
  if (!requested.clock) return true
  if (requested.relation === "after") return time >= requested.clock
  if (requested.relation === "before") return time <= requested.clock
  return time === requested.clock
}

const CLOSED_REASON: Record<ShowroomDayBlockedReason, string> = {
  weekend: "주말에는 쇼룸 방문 신청을 받지 않아요.",
  holiday: "당일은 공휴일이라 쇼룸 방문 신청을 받지 않아요.",
  too_soon: `쇼룸 방문은 최소 ${SHOWROOM_MIN_LEAD_BUSINESS_DAYS}영업일 전에 신청해 주세요.`,
  too_far: `쇼룸 달력은 오늘부터 ${SHOWROOM_MAX_ADVANCE_DAYS}일 이내의 방문 신청을 받아요.`,
  full: "현재 신청할 수 있는 시간이 없어요.",
}

function buildAvailabilityText(
  date: string,
  requested: RequestedTime,
  availability: ShowroomAvailabilityResult
) {
  const label = formatVisitDate(date)
  const day = availability.days.find((item) => item.date === date)
  if (!day) return null
  if (day.blockedReason) return `${label}에는 방문을 신청할 수 없어요. ${CLOSED_REASON[day.blockedReason]}`

  const open = day.slots.filter((slot) => slot.state === "open").map((slot) => slot.time)
  const matching = open.filter((time) => matchesTime(time, requested))
  if (matching.length) return `${label} 방문에 현재 신청할 수 있는 시간은 ${matching.join(", ")}예요.`
  if (!open.length) return `${label}에는 현재 신청할 수 있는 시간이 없어요.`
  const when = requested.clock ? `요청하신 시간(${requested.clock})` : `요청하신 ${requested.period} 시간대`
  return `${label} ${when}에는 신청할 수 있는 자리가 없어요. 같은 날 ${open.join(", ")}에 신청할 수 있어요.`
}

async function checkVisitAvailability(date: string, now: Date) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      getShowroomAvailability({ fromIso: date, toIso: date, now }),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), AVAILABILITY_TIMEOUT_MS) }),
    ])
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function resolveShowroomAnswer(message: string, now = new Date()): Promise<ShowroomAnswer | null> {
  if (!SHOWROOM.test(message) || SUPPORT_QUESTION.test(message)) return null
  const hasDate = DATE_HINT.test(message) || [...message.matchAll(DATE_PATTERN)].length > 0
  const requested = parseRequestedTime(message)
  const hasTime = !requested || Boolean(requested.period || requested.clock)

  if (!hasDate && !hasTime && !BOOKING_QUESTION.test(message)) return null
  // 쇼룸에서 봤던 제품의 가격·구성 문의를 날짜 때문에 방문 요청으로 읽지 않는다.
  if (!/예약|방문|갈\s*수|가도|비어|빈\s*자리/.test(message) && /가격|견적|요금|할인|패키지|스펙/.test(message)) return null
  // 날짜가 없는 명시적 데모·체험 요청은 기존 도입 상담 경로를 사용한다.
  if (!hasDate && !hasTime && /데모|시연|체험/.test(message) && !/예약/.test(message)) return null
  if (!hasDate && !hasTime) {
    return makeShowroomAnswer(
      `네, 서울 양천구 목동 쇼룸에서 Classin을 직접 써 보실 수 있어요. ${BOOKING_LINK_TEXT}`,
      "showroom-booking"
    )
  }

  const today = getBusinessDateParts(now).date
  const date = parseVisitDate(message, today)
  if (!date || !requested) {
    return makeShowroomAnswer(
      "어느 날짜와 시간에 목동 쇼룸을 방문하고 싶으세요? ‘쇼룸 11월 25일 오후에 갈 수 있나요?’처럼 말씀해 주시면 가능한 시간을 확인해 드릴게요.",
      "showroom-availability",
      "clarifying_question"
    )
  }
  if (date < today) {
    return makeShowroomAnswer(`${formatVisitDate(date)} 날짜는 이미 지났어요. ${BOOKING_LINK_TEXT}`, "showroom-availability")
  }
  if (date > addIsoDays(today, SHOWROOM_MAX_ADVANCE_DAYS)) {
    return makeShowroomAnswer(`${formatVisitDate(date)} 방문 일정은 아직 열리지 않았어요. ${CLOSED_REASON.too_far} ${BOOKING_LINK_TEXT}`, "showroom-availability")
  }

  const availability = await checkVisitAvailability(date, now)
  const answer = availability ? buildAvailabilityText(date, requested, availability) : null
  if (!answer) {
    return makeShowroomAnswer(
      `${formatVisitDate(date)}의 가능한 시간을 지금 불러오지 못했어요. 아래 [목동 쇼룸 예약]에서 날짜와 시간을 확인해 주세요.`,
      "showroom-availability",
      "fallback",
      "쇼룸 일정 조회를 완료하지 못했습니다."
    )
  }
  return makeShowroomAnswer(`${answer}\n\n${BOOKING_LINK_TEXT}`, "showroom-availability")
}
