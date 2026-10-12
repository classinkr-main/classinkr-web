// 마지막 연락 읽기 모델(CT8) — 고객별 max(리드 연락 로그, 사람 기록 이벤트, Compass 활동).
//
// 순수 모듈이다(서버·클라이언트·테스트 공용). 원격 조회는 하지 않는다 — Home 원천 두 테이블은
// 통합 저장소(lib/repositories/crm-unified-customers.ts)가, Compass 활동은 브리지
// (lib/compass/bridge.ts getCompassLatestActivityByPhoneKeys)가 읽어 이 모듈의 인덱스 함수에 넘긴다.
//
// 원천별 규칙
//  - home_log   : lead_contact_logs(리드 드로어·홈 큐 연락 결과). 연락 기록의 1차 증거. 채널 = type.
//  - home_event : crm_customer_events 중 실제 접촉 종류(HOME_CONTACT_EVENT_SOURCE_TYPES)만.
//                 내부 메모(manual_note)·동기화 소스는 연락이 아니다. 작성자 = created_by ?? owner_name.
//  - compass    : Compass 사람 활동(COMPASS_CONTACT_KINDS) 중 자동 작성자(COMPASS_CONTACT_EXCLUDED_ACTORS)
//                 제외. 조인 키는 전화 정규화 키 하나(contactPhoneKey) — 이름 추측 없음.
//  - home       : 세부(원천·채널·작성자)를 못 읽었을 때 lib/repositories/crm-events 의 시각만 아는 폴백.
//
// Compass 가 끊기면 Home 원천만으로 계산하고, 호출부가 응답 메타(compass: "down")로 화면에 알린다 —
// "기록 없음"과 "Compass 연결 끊김"을 섞지 않는다.

import { COMPASS_AUTOMATED_ACTORS, COMPASS_HUMAN_ACTIVITY_KINDS } from "@/lib/compass/lead-contact-sync"
import { normalizePhoneKey } from "@/lib/compass/normalize"

export type LastContactSource = "home_log" | "home_event" | "compass" | "home"

export interface LastContactFact {
  /** 연락 시각(ISO) */
  at: string
  source: LastContactSource
  /** 원천 채널 코드(로그 type · 이벤트 source_type · Compass kind). 모르면 null. */
  channel: string | null
  /** 연락한 사람(표시 이름). 모르면 null. */
  actor: string | null
}

/**
 * 연락으로 치는 CRM 기록 종류 — lib/repositories/crm-events.ts 의 RESPONSE_SOURCE_TYPES 와 같아야 한다
 * (그 파일이 값을 export 하지 않아 사본을 두고 tests/crm/last-contact.test.ts 가 소스를 읽어 동등성을 고정한다).
 */
export const HOME_CONTACT_EVENT_SOURCE_TYPES = ["call", "sms", "meeting_minutes", "recording", "lead_contact_log"] as const

/** 사람이 남긴 Compass 활동 kind — 리드 상태 자동 반영(lead-contact-sync)과 같은 목록을 재사용한다. */
export const COMPASS_CONTACT_KINDS: readonly string[] = COMPASS_HUMAN_ACTIVITY_KINDS
/** 사람이 아닌 Compass 작성자 — kind 가 note 여도 연락이 아니다(lead-contact-sync 와 같은 목록). */
export const COMPASS_CONTACT_EXCLUDED_ACTORS: ReadonlySet<string> = COMPASS_AUTOMATED_ACTORS

/** 전화 조인 키로 쓰는 최소 길이 — 지역번호 포함 9자리 미만은 잘못 붙는다(lead-contact-sync 와 같음). */
const MIN_PHONE_KEY_LENGTH = 9

const LOG_CHANNEL_LABELS: Record<string, string> = {
  call: "콜",
  sms: "문자",
  kakao: "카톡",
  email: "이메일",
}
const EVENT_CHANNEL_LABELS: Record<string, string> = {
  call: "콜 기록",
  sms: "문자 기록",
  meeting_minutes: "미팅 기록",
  recording: "녹음 기록",
  lead_contact_log: "연락 기록",
}
const COMPASS_KIND_LABELS: Record<string, string> = {
  call: "콜",
  sms: "문자",
  meeting: "미팅",
  note: "메모",
  memo: "메모",
  stage_change: "단계 변경",
}

/** 같은 시각이면 세부가 많은 원천을 남긴다(로그 > Compass > 기록 > 시각만). */
const SOURCE_TIE_RANK: Record<LastContactSource, number> = { home_log: 3, compass: 2, home_event: 1, home: 0 }

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  return Number.isNaN(time) ? null : time
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** 두 연락 중 더 최근 것(시각을 해석할 수 없는 쪽은 버린다). */
export function laterContact(
  left: LastContactFact | null | undefined,
  right: LastContactFact | null | undefined
): LastContactFact | null {
  const leftTime = timeOf(left?.at)
  const rightTime = timeOf(right?.at)
  if (leftTime == null) return rightTime == null ? null : (right ?? null)
  if (rightTime == null) return left ?? null
  if (rightTime > leftTime) return right ?? null
  if (rightTime < leftTime) return left ?? null
  return SOURCE_TIE_RANK[right!.source] > SOURCE_TIE_RANK[left!.source] ? (right ?? null) : (left ?? null)
}

/** 여러 후보 중 가장 최근 연락. 없으면 null. */
export function pickLatestContact(...facts: Array<LastContactFact | null | undefined>): LastContactFact | null {
  return facts.reduce<LastContactFact | null>((latest, fact) => laterContact(latest, fact), null)
}

/** crm-events 의 crmContactTargetKey 와 같은 키 형식(`${targetType}:${id}`). */
export function contactTargetKey(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`
}

/** 우리 쪽 원문 전화 → Compass 조인 키. 9자리 미만이면 null. */
export function contactPhoneKey(phone: string | null | undefined): string | null {
  const key = normalizePhoneKey(phone)
  return key && key.length >= MIN_PHONE_KEY_LENGTH ? key : null
}

export interface HomeContactLogRow {
  lead_id: string
  type: string | null
  contacted_at: string
  contacted_by: string | null
}

export interface HomeContactEventRow {
  target_type: string
  target_id: string | null
  source_type: string
  occurred_at: string
  created_by: string | null
  owner_name: string | null
}

const HOME_EVENT_TYPES: ReadonlySet<string> = new Set(HOME_CONTACT_EVENT_SOURCE_TYPES)

/** Home 원천(로그 + 사람 기록 이벤트) → 대상 키(`lead:<id>` · `neo_account:<id>` · `customer:<id>`)별 최신 연락. */
export function buildHomeContactIndex(
  logs: readonly HomeContactLogRow[],
  events: readonly HomeContactEventRow[]
): Map<string, LastContactFact> {
  const index = new Map<string, LastContactFact>()
  const put = (key: string, fact: LastContactFact) => {
    const next = laterContact(index.get(key), fact)
    if (next) index.set(key, next)
  }
  for (const log of logs) {
    if (!log.lead_id || timeOf(log.contacted_at) == null) continue
    put(contactTargetKey("lead", String(log.lead_id)), {
      at: log.contacted_at,
      source: "home_log",
      channel: trimOrNull(log.type),
      actor: trimOrNull(log.contacted_by),
    })
  }
  for (const event of events) {
    if (!event.target_id || !HOME_EVENT_TYPES.has(event.source_type) || timeOf(event.occurred_at) == null) continue
    put(contactTargetKey(event.target_type, String(event.target_id)), {
      at: event.occurred_at,
      source: "home_event",
      channel: event.source_type,
      actor: trimOrNull(event.created_by) ?? trimOrNull(event.owner_name),
    })
  }
  return index
}

export interface CompassLatestActivityLike {
  phone_key: string
  occurred_at: string
  kind: string | null
  actor: string | null
}

/** Compass 키별 최신 활동 → 전화 키별 연락. 자동 작성자는 한 번 더 거른다(브리지가 이미 걸러도 안전). */
export function buildCompassContactIndex(rows: readonly CompassLatestActivityLike[]): Map<string, LastContactFact> {
  const index = new Map<string, LastContactFact>()
  for (const row of rows) {
    const actor = trimOrNull(row.actor)
    if (actor && COMPASS_CONTACT_EXCLUDED_ACTORS.has(actor)) continue
    if (!row.phone_key || timeOf(row.occurred_at) == null) continue
    const next = laterContact(index.get(row.phone_key), {
      at: row.occurred_at,
      source: "compass",
      channel: trimOrNull(row.kind),
      actor,
    })
    if (next) index.set(row.phone_key, next)
  }
  return index
}

const DAY_MS = 86_400_000
/** 한국은 DST 가 없어 +9h 고정 오프셋으로 KST 달력일을 센다(customer-contact-summary 다음 연락과 같은 규약). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 마지막 연락 후 **경과 일수**(24시간 단위 내림). 없으면 null — "기록 없음"은 0 이 아니다.
 * 건강도 감점 입력(lib/crm/customer-health.ts lastContactDays)·360 신호색·CSV "마지막 연락(일)"·"무연락 N일+"
 * 판정(customer-segment-spec isNoContactForDays)이 이 축(경과 시간)을 쓴다 — 의미를 바꾸지 않는다.
 * 화면의 "오늘·어제·N일 전" 문구는 이것이 아니라 lastContactCalendarDays(KST 달력일)로 만든다.
 */
export function lastContactDays(at: string | null | undefined, nowMs: number): number | null {
  const time = timeOf(at)
  if (time == null) return null
  return Math.max(0, Math.floor((nowMs - time) / DAY_MS))
}

function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
}

/**
 * 마지막 연락이 며칠 전인지 **KST 달력일**로(오늘 0, 어제 1). 없으면 null. 미래 시각(시계 오차)은 0.
 * 24시간 내림으로 표기하면 어제 23:30 연락을 오늘 08:00 에 볼 때 "오늘"로 나왔다(2026-09-25 리뷰) — 표시 문구
 * (describeLastContact·360 헤더 formatLastContactText)만 이 값을 쓴다.
 */
export function lastContactCalendarDays(at: string | null | undefined, nowMs: number): number | null {
  const time = timeOf(at)
  if (time == null) return null
  return Math.max(0, kstDayIndex(nowMs) - kstDayIndex(time))
}

/** 원천 + 채널 → 표시 이름("Compass 콜" · "콜" · "미팅 기록" · "Home 기록"). */
export function lastContactChannelLabel(source: LastContactSource | null | undefined, channel: string | null | undefined): string {
  if (source === "compass") {
    const kind = channel ? COMPASS_KIND_LABELS[channel] ?? channel : null
    return kind ? `Compass ${kind}` : "Compass 활동"
  }
  if (source === "home_log") return (channel && LOG_CHANNEL_LABELS[channel]) || "연락 로그"
  if (source === "home_event") return (channel && EVENT_CHANNEL_LABELS[channel]) || "CRM 기록"
  return "Home 기록"
}

/** "오늘" · "어제" · "N일 전" — days 는 KST 달력일 차이(lastContactCalendarDays)를 넘긴다. */
export function relativeDaysLabel(days: number): string {
  if (days <= 0) return "오늘"
  if (days === 1) return "어제"
  return `${days.toLocaleString("ko-KR")}일 전`
}

export interface LastContactDisplayInput {
  lastContactAt?: string | null
  lastContactSource?: LastContactSource | null
  lastContactChannel?: string | null
  lastContactActor?: string | null
}

/**
 * 목록 셀 문구 — "3일 전 · Compass 콜 · 김담당". 기록이 없으면 "기록 없음".
 * when/detail 을 나눠 주어 화면이 두 줄로도 그릴 수 있다. "오늘·어제·N일 전"은 KST 달력일 기준이다.
 */
export function describeLastContact(
  input: LastContactDisplayInput,
  nowMs: number
): { hasRecord: boolean; when: string; detail: string | null; text: string } {
  const days = lastContactCalendarDays(input.lastContactAt, nowMs)
  if (days == null) return { hasRecord: false, when: "기록 없음", detail: null, text: "기록 없음" }
  const when = relativeDaysLabel(days)
  const detailParts = [
    lastContactChannelLabel(input.lastContactSource ?? null, input.lastContactChannel ?? null),
    trimOrNull(input.lastContactActor),
  ].filter((part): part is string => Boolean(part))
  const detail = detailParts.length ? detailParts.join(" · ") : null
  return { hasRecord: true, when, detail, text: detail ? `${when} · ${detail}` : when }
}
