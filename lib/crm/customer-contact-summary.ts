// 고객 360 헤더 "마지막 연락 · 다음 연락" 읽기 모델 — 순수 함수(I/O·"server-only" 없음). CT9.
//
// 마지막 연락의 정의는 통합 고객 목록의 "마지막 연락" 열(CT8)과 **같은 모듈** lib/crm/last-contact.ts 를
// 그대로 쓴다 — 두 화면의 일수·원천·채널 표기가 어긋나지 않게 여기서 정의를 다시 만들지 않는다.
//  - Home 사람 연락 = crm_customer_events 중 HOME_CONTACT_EVENT_SOURCE_TYPES(crm-events.ts
//    RESPONSE_SOURCE_TYPES 와 같은 목록 — tests/crm/last-contact.test.ts·customer-contact-summary.test.ts 가 고정)
//    + 리드 연락 로그 원본(lead_contact_logs — 미러가 fail-soft 로 빠진 로그도 연락이다).
//  - Compass 사람 연락 = COMPASS_CONTACT_KINDS 중 자동 작성자(COMPASS_CONTACT_EXCLUDED_ACTORS) 제외.
//  - 일수는 두 축이다. daysAgo = lastContactDays(경과 24시간 단위 내림) — 건강도 입력·신호색(14·21일)이 쓴다.
//    표기 "오늘·어제·N일 전" = lastContactCalendarDays(KST 달력일, basisAt 기준) — 목록 셀(describeLastContact)과
//    같은 문구. 어제 23:30 연락을 오늘 08:00 에 보면 경과는 0일이지만 표기는 "어제"다.
//  - 같은 시각이면 last-contact.ts 의 원천 순위(로그 > Compass > 기록)를 따른다.
//
// 360 에만 있는 것
//  - "리드 시절" = NEO 계정 360 에서 확정 연결(crm_source_links lead→external_account confirmed)된 과거
//    리드의 기록·연락 로그. 계정 360 에서 target_type 이 lead 인 행과 연결 리드의 로그가 그것이다.
//  - 다음 연락 = 팔로업(진행 중 리드 follow_up_at) · 열린 할 일 기한(미룸이면 미룬 날) · Compass 다음 액션
//    (next_action_at — 본문은 싣지 않는다, overlay.ts 계약) 중 가장 이른 것. 기한 지난 것도 후보다.
//    예정일은 KST 달력일로 센다(오늘 0, 내일 1, 지난 날 음수) — 한국은 DST 가 없어 +9h 고정 오프셋.

import {
  COMPASS_CONTACT_EXCLUDED_ACTORS,
  COMPASS_CONTACT_KINDS,
  HOME_CONTACT_EVENT_SOURCE_TYPES,
  lastContactCalendarDays,
  lastContactChannelLabel,
  lastContactDays,
  laterContact,
  relativeDaysLabel,
  type LastContactFact,
  type LastContactSource,
} from "@/lib/crm/last-contact"
import type { StatusTone } from "@/lib/crm/status-tone"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Home 사람 연락 종류 — last-contact.ts(CT8)와 같은 목록을 그대로 다시 내보낸다(서버 probe 가 쓴다). */
export const HUMAN_CONTACT_EVENT_SOURCE_TYPES = HOME_CONTACT_EVENT_SOURCE_TYPES

const HUMAN_SOURCE_SET: ReadonlySet<string> = new Set(HUMAN_CONTACT_EVENT_SOURCE_TYPES)
const COMPASS_KIND_SET: ReadonlySet<string> = new Set(COMPASS_CONTACT_KINDS)

/** 마지막 연락이 이만큼 오래되면 경고·위험 톤 — lib/crm/customer-health.ts 감점 기준(14·21일)과 같다. */
export const LAST_CONTACT_WARNING_DAYS = 14
export const LAST_CONTACT_DANGER_DAYS = 21

/** 확정 연결된 과거 리드 기록의 원천 표기 — 헤더·드로어 타임라인 머리말·상세 원천 칩이 같은 문구를 쓴다. */
export const LEAD_ERA_LABEL = "리드 시절"

export const CONTACT_SUMMARY_COMPASS_DOWN_CAPTION = "Compass 연결 끊김 — Home 기록만"
export const CONTACT_SUMMARY_LEAD_HISTORY_DOWN_CAPTION = "연락 로그·리드 시절 기록 일부 누락 — 마지막 연락이 더 최근일 수 있음"

export function isHumanContactEventSource(sourceType: string | null | undefined): boolean {
  return Boolean(sourceType && HUMAN_SOURCE_SET.has(sourceType))
}

/** Compass 활동이 사람 연락인지 — last-contact.ts 의 종류 + 자동 작성자 제외. 작성자 없음은 사람 기록으로 둔다. */
export function isCompassContactActivity(kind: string | null | undefined, actor: string | null | undefined): boolean {
  const key = kind?.trim()
  if (!key || !COMPASS_KIND_SET.has(key)) return false
  const who = actor?.trim()
  return !(who && COMPASS_CONTACT_EXCLUDED_ACTORS.has(who))
}

/**
 * NEO 계정 360 에서 target_type 이 lead 인 기록 = 확정 연결된 과거 리드의 기록("리드 시절").
 * 리드 360 의 자기 기록(target_type lead)은 리드 시절이 아니라 그 고객 자신의 기록이다.
 */
export function isLeadEraRow(customerSource: string | null | undefined, rowTargetType: string | null | undefined): boolean {
  return customerSource === "neo_account" && rowTargetType === "lead"
}

export type ContactOrigin = "home" | "lead_era" | "compass"

/** crm_customer_events 행에서 읽는 최소 필드(CrmCustomerEventRecord 를 그대로 넘겨도 된다). */
export interface ContactEventLike {
  targetType: string
  sourceType: string
  occurredAt: string
  ownerName: string | null
  createdBy: string | null
}

/** lead_contact_logs 원본에서 읽는 최소 필드. */
export interface ContactLogLike {
  type: string | null
  contactedAt: string
  contactedBy: string | null
}

/** Compass 타임라인 엔트리에서 읽는 최소 필드(CompassTimelineEntry 를 그대로 넘겨도 된다). */
export interface ContactCompassEntryLike {
  kind: string
  occurredAt: string
  actor: string | null
}

/** last-contact.ts 의 연락 한 건 + 360 원천(리드 시절 구분). */
export type ContactFact = LastContactFact & { origin: ContactOrigin }

function toMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Home 기록 → 연락 사실. 사람 연락 종류가 아니면 null. 작성자는 last-contact.ts 와 같이 created_by 우선. */
export function eventToContactFact(event: ContactEventLike, customerSource: string | null | undefined): ContactFact | null {
  if (!isHumanContactEventSource(event.sourceType) || toMs(event.occurredAt) == null) return null
  return {
    at: event.occurredAt,
    source: "home_event",
    channel: event.sourceType,
    actor: trimOrNull(event.createdBy) ?? trimOrNull(event.ownerName),
    origin: isLeadEraRow(customerSource, event.targetType) ? "lead_era" : "home",
  }
}

/** 연락 로그 원본 → 연락 사실. 로그는 늘 리드 대상이라 NEO 계정 360 이면 리드 시절이다. */
export function contactLogToContactFact(log: ContactLogLike, customerSource: string | null | undefined): ContactFact | null {
  if (toMs(log.contactedAt) == null) return null
  return {
    at: log.contactedAt,
    source: "home_log",
    channel: trimOrNull(log.type),
    actor: trimOrNull(log.contactedBy),
    origin: isLeadEraRow(customerSource, "lead") ? "lead_era" : "home",
  }
}

/** Compass 활동 → 연락 사실. 연락 종류가 아니거나 자동 작성자면 null. */
export function compassEntryToContactFact(entry: ContactCompassEntryLike): ContactFact | null {
  if (!isCompassContactActivity(entry.kind, entry.actor) || toMs(entry.occurredAt) == null) return null
  return {
    at: entry.occurredAt,
    source: "compass",
    channel: entry.kind,
    actor: trimOrNull(entry.actor),
    origin: "compass",
  }
}

/** 가장 최근 연락 — last-contact.ts laterContact(같은 시각 원천 순위 포함)로 고른다. */
export function pickLatestContactFact(facts: readonly ContactFact[]): ContactFact | null {
  // laterContact 는 두 입력 중 하나를 그대로 돌려준다 — origin 이 붙은 원래 객체가 유지된다.
  return facts.reduce<ContactFact | null>((latest, fact) => laterContact(latest, fact) as ContactFact | null, null)
}

function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
}

export type NextContactKind = "follow_up" | "task" | "compass_next_action"

export const NEXT_CONTACT_KIND_LABEL: Record<NextContactKind, string> = {
  follow_up: "팔로업",
  task: "할 일",
  compass_next_action: "Compass 다음 액션",
}

const NEXT_KIND_RANK: Record<NextContactKind, number> = { follow_up: 0, task: 1, compass_next_action: 2 }

export interface NextContactCandidate {
  at: string
  kind: NextContactKind
  /** 할 일 제목만 싣는다 — Compass 다음 액션 본문은 어드민에 복제하지 않는다(overlay.ts 계약). */
  title: string | null
}

/** 열린 할 일에서 읽는 최소 필드(CrmTaskRecord 를 그대로 넘겨도 된다). */
export interface ContactTaskLike {
  title: string
  status: string
  dueAt: string | null
  snoozedUntil: string | null
}

/** 할 일의 연락 예정 시각 — 열린(open)·미룸(snoozed)만, 미룸이면 미룬 날(없으면 기한). 완료·취소는 null. */
export function taskNextContactAt(task: ContactTaskLike): string | null {
  if (task.status === "snoozed") return trimOrNull(task.snoozedUntil) ?? trimOrNull(task.dueAt)
  if (task.status === "open") return trimOrNull(task.dueAt)
  return null
}

/** 가장 이른 다음 연락(기한 지난 것 포함). 동시각이면 팔로업 → 할 일 → Compass 순. */
export function pickNextContact(candidates: readonly NextContactCandidate[]): NextContactCandidate | null {
  let best: NextContactCandidate | null = null
  let bestMs = Infinity
  for (const candidate of candidates) {
    const ms = toMs(candidate.at)
    if (ms == null) continue
    if (ms < bestMs || (ms === bestMs && best && NEXT_KIND_RANK[candidate.kind] < NEXT_KIND_RANK[best.kind])) {
      best = candidate
      bestMs = ms
    }
  }
  return best
}

export interface CustomerContactSummaryLast {
  at: string
  origin: ContactOrigin
  /** last-contact.ts 원천·채널 코드 — 표기는 lastContactChannelLabel 로 만든다. */
  source: LastContactSource
  channel: string | null
  /** lastContactChannelLabel(source, channel) — 통합 목록 셀과 같은 표기("Compass 콜" · "콜" · "미팅 기록"). */
  channelLabel: string
  actor: string | null
  /**
   * 기준 시각(basisAt)까지 **경과** 일수 — last-contact.ts lastContactDays(24시간 단위 내림). 건강도 입력·신호색용.
   * 표시 문구("어제" 등)는 이 값이 아니라 KST 달력일(lastContactCalendarDaysAgo)로 만든다.
   */
  daysAgo: number
}

export interface CustomerContactSummaryNext extends NextContactCandidate {
  /** 기준 시각부터 KST 달력일 — 오늘 0, 내일 1, 지난 날은 음수. */
  daysUntil: number
  /** 기준일(KST) 이전 날짜 — 오늘 안의 이른 시각은 지남으로 치지 않는다. */
  overdue: boolean
}

export interface CustomerContactSummary {
  /** 계산 기준 시각(서버 조립 시각) — 일수 표기의 기준. */
  basisAt: string
  last: CustomerContactSummaryLast | null
  next: CustomerContactSummaryNext | null
  /** Compass 브리지가 끊겨 Compass 활동·다음 액션을 확인하지 못했다(0건과 다르다). */
  compassDown: boolean
  /** 연락 로그·연결 리드 기록 조회가 실패해 일부가 빠졌을 수 있다. */
  leadHistoryDown: boolean
}

export interface BuildCustomerContactSummaryInput {
  now: Date
  /** 360 대상 종류 — "neo_account" 면 target_type lead 행·연락 로그를 리드 시절로 본다. */
  customerSource: string
  /** Home 기록(자기 + 리드 시절 + 창 밖 probe). 사람 연락이 아닌 행은 여기서 걸러진다. */
  events: readonly ContactEventLike[]
  /** 연락 로그 원본(리드 360 은 자기, NEO 360 은 연결 리드). 미러 기록과 겹쳐도 같은 시각이라 결과는 같다. */
  contactLogs?: readonly ContactLogLike[]
  compassEntries: readonly ContactCompassEntryLike[]
  compassDown: boolean
  leadHistoryDown?: boolean
  /** 리드 팔로업(진행 중인 리드만 넘긴다). */
  followUpAt?: string | null
  tasks: readonly ContactTaskLike[]
  compassNextActionAts?: readonly string[]
}

export function buildCustomerContactSummary(input: BuildCustomerContactSummaryInput): CustomerContactSummary {
  const nowMs = input.now.getTime()

  const facts: ContactFact[] = []
  for (const event of input.events) {
    const fact = eventToContactFact(event, input.customerSource)
    if (fact) facts.push(fact)
  }
  for (const log of input.contactLogs ?? []) {
    const fact = contactLogToContactFact(log, input.customerSource)
    if (fact) facts.push(fact)
  }
  for (const entry of input.compassEntries) {
    const fact = compassEntryToContactFact(entry)
    if (fact) facts.push(fact)
  }
  const latest = pickLatestContactFact(facts)
  const daysAgo = latest ? lastContactDays(latest.at, nowMs) : null

  const candidates: NextContactCandidate[] = []
  const followUpAt = trimOrNull(input.followUpAt)
  if (followUpAt) candidates.push({ at: followUpAt, kind: "follow_up", title: null })
  for (const task of input.tasks) {
    const at = taskNextContactAt(task)
    if (at) candidates.push({ at, kind: "task", title: trimOrNull(task.title) })
  }
  for (const at of input.compassNextActionAts ?? []) {
    const trimmed = trimOrNull(at)
    if (trimmed) candidates.push({ at: trimmed, kind: "compass_next_action", title: null })
  }
  const nextCandidate = pickNextContact(candidates)
  const nextMs = nextCandidate ? toMs(nextCandidate.at) : null
  const daysUntil = nextMs == null ? null : kstDayIndex(nextMs) - kstDayIndex(nowMs)

  return {
    basisAt: input.now.toISOString(),
    last:
      latest && daysAgo != null
        ? {
            at: latest.at,
            origin: latest.origin,
            source: latest.source,
            channel: latest.channel,
            channelLabel: lastContactChannelLabel(latest.source, latest.channel),
            actor: latest.actor,
            daysAgo,
          }
        : null,
    next: nextCandidate && daysUntil != null ? { ...nextCandidate, daysUntil, overdue: daysUntil < 0 } : null,
    compassDown: input.compassDown,
    leadHistoryDown: Boolean(input.leadHistoryDown),
  }
}

// ── 표기 ───────────────────────────────────────────────────────────────

/** KST 월/일 — "9/26". */
export function formatKstMonthDay(iso: string): string {
  const ms = toMs(iso)
  if (ms == null) return "—"
  const kst = new Date(ms + KST_OFFSET_MS)
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
}

/** 0 → 오늘, 1 → 내일, 그 밖 → "9/26". */
export function formatNextContactDate(next: Pick<CustomerContactSummaryNext, "at" | "daysUntil">): string {
  if (next.daysUntil === 0) return "오늘"
  if (next.daysUntil === 1) return "내일"
  return formatKstMonthDay(next.at)
}

/**
 * 표시용 "며칠 전" — 기준 시각(basisAt)과 마지막 연락 시각의 KST 달력일 차이(오늘 0, 어제 1). 목록 셀과 같은 축.
 * 시각을 해석할 수 없으면(옛 페이로드 등) 경과 일수(daysAgo)로 물러선다.
 */
export function lastContactCalendarDaysAgo(summary: Pick<CustomerContactSummary, "basisAt" | "last"> | null | undefined): number | null {
  if (!summary?.last) return null
  const last = summary.last
  const basisMs = toMs(summary.basisAt)
  const calendar = basisMs == null ? null : lastContactCalendarDays(last.at, basisMs)
  return calendar ?? last.daysAgo
}

/**
 * "마지막 연락 3일 전 · Compass 콜 · 진소망" — 통합 목록 셀(last-contact.ts describeLastContact)과 같은 문구다
 * (일수는 KST 달력일). 리드 시절이면 채널 앞에 "리드 시절"을 붙인다. 기록이 없으면 "마지막 연락 기록 없음".
 */
export function formatLastContactText(summary: CustomerContactSummary | null | undefined): string {
  const last = summary?.last
  if (!last) return "마지막 연락 기록 없음"
  const channel = last.origin === "lead_era" ? `${LEAD_ERA_LABEL} ${last.channelLabel}` : last.channelLabel
  const parts = [`마지막 연락 ${relativeDaysLabel(lastContactCalendarDaysAgo(summary) ?? last.daysAgo)}`, channel]
  if (last.actor) parts.push(last.actor)
  return parts.join(" · ")
}

/** "다음 연락 9/26 · 할 일 · 견적 회신" / 일정이 없으면 "다음 연락 일정 없음". */
export function formatNextContactText(summary: CustomerContactSummary | null | undefined): string {
  const next = summary?.next
  if (!next) return "다음 연락 일정 없음"
  const parts = [`다음 연락 ${formatNextContactDate(next)}`, NEXT_CONTACT_KIND_LABEL[next.kind]]
  if (next.title) parts.push(next.title)
  if (next.overdue) parts.push("기한 지남")
  return parts.join(" · ")
}

/**
 * 마지막 연락 신호색 — 14일+ 경고, 21일+ 위험. 최근이거나 기록이 없으면 신호 없음(null).
 * 건강도 감점과 같은 축(경과 일수 daysAgo)이다 — 표기(달력일)가 "14일 전"이어도 경과가 14일 미만이면 신호 없음.
 */
export function lastContactTone(summary: CustomerContactSummary | null | undefined): StatusTone | null {
  const days = summary?.last?.daysAgo
  if (days == null) return null
  if (days >= LAST_CONTACT_DANGER_DAYS) return "danger"
  if (days >= LAST_CONTACT_WARNING_DAYS) return "warning"
  return null
}

/** 다음 연락 신호색 — 기한 지남만 위험. */
export function nextContactTone(summary: CustomerContactSummary | null | undefined): StatusTone | null {
  return summary?.next?.overdue ? "danger" : null
}

/** 화면 아래 캡션 — 연결 끊김·일부 누락은 "연락 없음"과 다른 사실이라 따로 말한다. */
export function contactSummaryCaptions(summary: CustomerContactSummary | null | undefined): string[] {
  if (!summary) return []
  const captions: string[] = []
  if (summary.compassDown) captions.push(CONTACT_SUMMARY_COMPASS_DOWN_CAPTION)
  if (summary.leadHistoryDown) captions.push(CONTACT_SUMMARY_LEAD_HISTORY_DOWN_CAPTION)
  return captions
}

/**
 * 건강도(lib/crm/customer-health.ts) lastContactDays 입력 = 헤더 "마지막 연락"의 경과 일수(daysAgo) 그대로 — 표시
 * 문구의 KST 달력일이 아니다(판정 의미 유지).
 * 기록이 없으면 null(모름 — 감점하지 않는다). 통합 목록(customer-health.ts unifiedRowHealthInput)과
 * 같게 Compass 가 끊겨도 Home 기록으로 계산한 값을 쓴다(화면은 캡션으로 끊김을 말한다).
 */
export function lastContactDaysForHealth(summary: CustomerContactSummary | null | undefined): number | null {
  return summary?.last?.daysAgo ?? null
}
