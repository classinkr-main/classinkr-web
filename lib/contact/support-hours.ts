/**
 * contact/support-hours — 공개된 상담 운영시간의 정본.
 *
 * 챗봇 상담 연결 카드(components/ui/chatbot/ConsultationBridge.tsx)와 문의 완료 화면(app/contact/page.tsx)이 쓴다(챗봇 점검 CX-07).
 * 예전에는 문의 화면 직접 연락 블록(components/contact/ContactDirectChannels.tsx)에만 적혀 있어, 챗봇 카드는 시간을 말하지 않고
 * '바로'·'실시간'을 약속했다.
 *
 * 직접 연락 블록의 표기는 글자 그대로 둔다 — 답 색인(data/answer-index)이 그 페이지 줄(줄 번호·글)을 운영시간 답의 근거로
 * 인용하고 있어, 상수로 바꾸면 근거가 사라진다. 대신 tests/contact/support-hours.test.ts 가 두 표기가 같은지 지킨다.
 *
 * - 응답 목표 시간(영업일 기준 N시간)은 정해지기 전이라 넣지 않는다(사람 결정 3).
 * - 공휴일 달력은 없다. 평일(월~금)과 시각만 보고, KST(Asia/Seoul) 기준으로 센다.
 */

export const SUPPORT_HOURS_TIME_ZONE = "Asia/Seoul"

/** 화면 표기 — 이미 공개된 문구 그대로. */
export const SUPPORT_HOURS_LABEL = "평일 09:00~18:00"
export const SUPPORT_LUNCH_LABEL = "점심시간 12:00~13:00"
export const SUPPORT_HOURS_FULL_LABEL = `${SUPPORT_HOURS_LABEL} (${SUPPORT_LUNCH_LABEL})`

const OPEN_MINUTE = 9 * 60
const CLOSE_MINUTE = 18 * 60
const LUNCH_START_MINUTE = 12 * 60
const LUNCH_END_MINUTE = 13 * 60
const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])

/** open: 운영시간 안 · lunch: 평일 점심시간 · closed: 그 밖(평일 운영 전후·주말). */
export type SupportHoursState = "open" | "lunch" | "closed"

let formatter: Intl.DateTimeFormat | null = null

function kstParts(now: Date) {
    formatter ??= new Intl.DateTimeFormat("en-US", {
        timeZone: SUPPORT_HOURS_TIME_ZONE,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    })
    const parts = formatter.formatToParts(now)
    const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
    // 일부 엔진은 자정을 "24"로 낸다 — 0 으로 맞춘다.
    const hour = Number(read("hour")) % 24
    const minute = Number(read("minute"))
    return { weekday: read("weekday"), minuteOfDay: hour * 60 + minute }
}

export function getSupportHoursState(now: Date = new Date()): SupportHoursState {
    if (Number.isNaN(now.getTime())) return "closed"
    const { weekday, minuteOfDay } = kstParts(now)
    if (!WEEKDAYS.has(weekday)) return "closed"
    if (minuteOfDay < OPEN_MINUTE || minuteOfDay >= CLOSE_MINUTE) return "closed"
    if (minuteOfDay >= LUNCH_START_MINUTE && minuteOfDay < LUNCH_END_MINUTE) return "lunch"
    return "open"
}

/**
 * 운영시간 밖이면(점심 포함) 언제 확인하는지 한 줄. 운영시간 안이면 null — 운영시간 표기만 보인다.
 * 챗봇 상담 카드(남기기 전)와 문의 완료 화면(남긴 뒤)이 같은 글을 쓴다. 휴대폰 카드에서 두 줄 안에 들도록 짧게 둔다.
 * '바로'·'실시간'을 쓰지 않는다. 응답 시간 숫자도 약속하지 않는다.
 */
export function describeSupportHoursWait(state: SupportHoursState): string | null {
    if (state === "lunch") return "지금은 점심시간(12:00~13:00)이라 13:00부터 순서대로 확인해요."
    if (state === "closed") return `지금은 운영시간(${SUPPORT_HOURS_LABEL})이 아니라 다음 운영시간에 순서대로 확인해요.`
    return null
}
