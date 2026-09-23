/**
 * 기록 화면 우측 "이번 주 요약" 집계(2026-09-17 우선순위 A5) — 순수 함수, I/O 없음.
 *
 * 입력은 CrmActivityClient 가 이미 들고 있는 /api/admin/crm/events 행(CrmEventRecord)의
 * 부분 구조다. lib → components 의존을 만들지 않으려고 필요한 필드만 구조적으로 받는다.
 *
 * 규칙:
 *  - 이번 주 = 월요일 00:00 KST 부터 다음 월요일 00:00 KST 직전까지(`weekStartsOn` 로 요일 변경 가능).
 *    한국은 DST 가 없으므로 +9h 고정 오프셋으로 계산한다(Intl 없이 SSR·테스트에서 결정적).
 *  - 위험 신호 = sentiment === "risk"(계약의 부정 감정 값 하나뿐). 없으면 0.
 *  - 미연결 = targetType === "unknown" 이거나 targetId 가 비어 있는 기록.
 *  - 금액은 합산하지 않는다(어드민 운영 결정: 통화 혼합 금액 합산 금지).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 집계에 필요한 최소 필드 — CrmEventRecord 가 그대로 할당된다. */
export interface ActivityWeekItem {
  occurredAt: string
  sourceType: string
  sentiment: string
  targetType: string
  targetId: string | null
}

/** activity-contract 의 SourceType(all 제외)과 같은 키. 새 종류는 여기와 계약 양쪽에 더한다. */
export const ACTIVITY_WEEK_KINDS = [
  "manual_note",
  "call",
  "sms",
  "meeting_minutes",
  "recording",
  "calendar_event",
  "lead_contact_log",
  "external_crm",
  "sheet",
  "site_inflow",
] as const

export type ActivityWeekKind = (typeof ACTIVITY_WEEK_KINDS)[number]

export interface ActivityWeekSummary {
  /** "M/D–M/D" (KST, 주 시작일–주 마지막일) */
  weekLabel: string
  /** 주 시작(포함) ms epoch */
  weekStartMs: number
  /** 주 끝(제외) ms epoch — 다음 주 시작 */
  weekEndMs: number
  total: number
  byKind: Record<ActivityWeekKind, number>
  /** 콜(call) 건수 — byKind.call 의 별칭 */
  calls: number
  /** 회의(meeting_minutes) 건수 — byKind.meeting_minutes 의 별칭 */
  meetings: number
  /** 위험 신호(sentiment === "risk") 건수 */
  negativeSentiment: number
  /** 고객 미연결 건수 */
  unlinked: number
}

export interface SummarizeActivityWeekOptions {
  nowMs: number
  /** 0=일요일 … 6=토요일. 기본 1(월요일). */
  weekStartsOn?: number
}

/** KST 달력일 기준 요일·날짜 계산용 — nowMs 를 +9h 밀어 UTC getter 로 읽는다. */
function kstParts(ms: number) {
  const shifted = new Date(ms + KST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
  }
}

/** 이번 주 범위(KST). start 포함, end 제외. */
export function activityWeekRange(nowMs: number, weekStartsOn = 1): { startMs: number; endMs: number } {
  const normalizedStart = ((Math.trunc(weekStartsOn) % 7) + 7) % 7
  const { year, month, date, day } = kstParts(nowMs)
  const daysSinceStart = (day - normalizedStart + 7) % 7
  const startMs = Date.UTC(year, month, date - daysSinceStart) - KST_OFFSET_MS
  return { startMs, endMs: startMs + 7 * DAY_MS }
}

/** "M/D" (KST). */
export function formatKstMonthDay(ms: number): string {
  const { month, date } = kstParts(ms)
  return `${month + 1}/${date}`
}

/** 이번 주 마지막 순간(일요일 23:59:59.999 KST 등)의 ISO — 할 일 dueBefore 파라미터용. */
export function activityWeekEndIso(nowMs: number, weekStartsOn = 1): string {
  const { endMs } = activityWeekRange(nowMs, weekStartsOn)
  return new Date(endMs - 1).toISOString()
}

/** KST 달력일 차이(due − now). 지난 날은 음수, 오늘은 0. 파싱 실패는 null. */
export function kstDayDiff(targetIso: string | null | undefined, nowMs: number): number | null {
  if (!targetIso) return null
  const targetMs = Date.parse(targetIso)
  if (!Number.isFinite(targetMs)) return null
  return Math.floor((targetMs + KST_OFFSET_MS) / DAY_MS) - Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS)
}

function emptyByKind(): Record<ActivityWeekKind, number> {
  const out = {} as Record<ActivityWeekKind, number>
  for (const kind of ACTIVITY_WEEK_KINDS) out[kind] = 0
  return out
}

function isKind(value: string): value is ActivityWeekKind {
  return (ACTIVITY_WEEK_KINDS as readonly string[]).includes(value)
}

export function isUnlinkedActivity(item: Pick<ActivityWeekItem, "targetType" | "targetId">): boolean {
  return item.targetType === "unknown" || !item.targetId?.trim()
}

export function summarizeActivityWeek(
  items: readonly ActivityWeekItem[],
  options: SummarizeActivityWeekOptions
): ActivityWeekSummary {
  const weekStartsOn = options.weekStartsOn ?? 1
  const { startMs, endMs } = activityWeekRange(options.nowMs, weekStartsOn)
  const byKind = emptyByKind()
  let total = 0
  let negativeSentiment = 0
  let unlinked = 0

  for (const item of items) {
    const occurredMs = Date.parse(item.occurredAt)
    if (!Number.isFinite(occurredMs) || occurredMs < startMs || occurredMs >= endMs) continue
    total += 1
    if (isKind(item.sourceType)) byKind[item.sourceType] += 1
    if (item.sentiment === "risk") negativeSentiment += 1
    if (isUnlinkedActivity(item)) unlinked += 1
  }

  return {
    weekLabel: `${formatKstMonthDay(startMs)}–${formatKstMonthDay(endMs - 1)}`,
    weekStartMs: startMs,
    weekEndMs: endMs,
    total,
    byKind,
    calls: byKind.call,
    meetings: byKind.meeting_minutes,
    negativeSentiment,
    unlinked,
  }
}

/**
 * 불러온 목록이 이번 주를 다 덮지 못했는지(페이지가 더 있고, 가장 오래된 행이 아직 이번 주 안).
 * 참이면 집계는 하한값이라 화면이 "불러온 N건 기준"으로 표기해야 한다.
 * 목록은 occurredAt 내림차순이라는 API 계약을 전제한다.
 */
export function isActivityWeekSummaryPartial(
  items: readonly Pick<ActivityWeekItem, "occurredAt">[],
  summary: Pick<ActivityWeekSummary, "weekStartMs">,
  hasMore: boolean
): boolean {
  if (!hasMore || items.length === 0) return false
  let oldest = Number.POSITIVE_INFINITY
  for (const item of items) {
    const ms = Date.parse(item.occurredAt)
    if (Number.isFinite(ms) && ms < oldest) oldest = ms
  }
  return Number.isFinite(oldest) && oldest >= summary.weekStartMs
}
