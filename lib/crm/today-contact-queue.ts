// 현황 "오늘 연락"(C안 ①, 2026-09-25) — 판단 코어. 순수 모듈이다(I/O·"server-only"·"use client" 없음).
// 원천 조립은 lib/repositories/crm-today-contacts.ts, 계약 타입은 lib/crm/today-contact-types.ts 가 맡는다.
//
// 여섯 원천을 엔티티 키(lead:·neo:·customer:·deal:·compass:·task: — 고객 360 드로어와 같은 접두어)로 합쳐 한 행으로 만든다.
//   first_response  리드 첫 응답(응대 대상 소스·신규·식기 전·미래 팔로업 없음)
//   follow_up       리드 팔로업이 오늘 끝 이전(지난 것 포함)
//   task            활성 할 일 기한 도래(지난 것 포함) 또는 기한 없는 긴급·높음
//   compass_next_action  Compass 다음 액션이 [오늘-14일, 오늘 끝] — 더 오래된 건 건수만
//   account_expiry / account_balance  NEO 계정 — 우선순위 엔진 bucket=today 만(통합 결정)
//   demo · revisit · reinflow  데모 전후·연락 후 재방문·재문의(재유입 후 미접촉)
//
// 원칙
//  - A안: Compass 에 매칭된 리드·Compass 전용 행의 주 행동은 "Compass에서 열기"뿐이다. 계정·전환 고객·딜은 Home 에서
//    결과 → 다음 일정을 기록한다. Compass 에 없는 Home 리드만 행 안 입력(record_outcome_lead)을 허용한다.
//  - 한 Compass 다음 액션은 정확히 한 엔티티에 붙는다(진행 중 Home 리드 → NEO 계정 → 이미 선 Compass 기록 리드 행(할 일이
//    있는 종료 리드 등) → Compass 단독 순). 리드↔NEO 교차 병합은 하지 않는다.
//    Compass 단독 행도 전화 키당 한 행이다(같은 번호로 쌓인 Compass 리드 여럿 = 한 행, 대표는 overlay.ts 규칙).
//  - 기록 위치(주 행동)는 360·리드 보드와 같은 공용 판정(write-surface.ts)에 리드 상태까지 넘겨 정한다 — 전환 리드는 Home.
//  - 엔진 추천(첫 응답·계정 만료/소진)뿐인 행은 미래 다음 일정(팔로업·할 일·Compass 다음 액션)이 있으면 오늘 목록에서 뺀다 —
//    "연락 후 매일 재등장"을 막는다. 할 일·Compass 기한 도래·재문의·데모는 강한 사유라 남긴다.
//  - 진행률은 추정이다(아침 목록을 저장하지 않는다) — 처리 흔적(오늘 Home 연락·Compass 사람 활동·오늘 닫은/미룬 할 일·
//    다음 일정 이동 — 리드 "내일로"의 팔로업 이동 포함)으로 재구성하고 approximate: true 로 밝힌다. 분모는 연락할 대상
//    수라 같은 기관으로 접은 리드도 센다(처리 전후 분모가 같다). 원천별 건수(counts.bySource)는 행 수다(원천 칩 = 보이는 행).
//    Compass 에서 기록하는 행(open_compass)에 할 일 말고 다른 대기 사유가 남아 있으면 Home 할 일 흔적은 처리로 세지 않는다
//    (Home 연락·Compass 활동만 — F 단계).
//  - 날짜 경계는 KST 달력일(+9h 고정). "지남(overdue)"은 오늘 00:00 KST 이전 기한이다 — 오늘 안의 이른 시각은 지남이 아니다.

import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"
import type { CompassLeadIndexRow, CompassNextActionRow } from "@/lib/compass/bridge"
import {
  compassOwnerKeys,
  compassResponsibleName,
  isBeyondCompassLookback,
  isOpenCompassAction,
  matchCompassOwner,
  truncateCompassNextActionText,
  COMPASS_NEXT_ACTION_LOOKBACK_DAYS,
} from "@/lib/compass/next-actions"
import { compassLeadUrl } from "@/lib/compass/normalize"
import { compassStageLabel, pickRepresentativeCompassRow } from "@/lib/compass/overlay"
import {
  compassDemoLabel,
  findCompassDemoSignal,
  type CompassDemoIndex,
  type CompassDemoSignal,
} from "@/lib/crm/compass-demo-signal"
import { pickNextContact, taskNextContactAt, type NextContactCandidate } from "@/lib/crm/customer-contact-summary"
import {
  contactPhoneKey,
  contactTargetKey,
  lastContactChannelLabel,
  pickLatestContact,
  type LastContactFact,
} from "@/lib/crm/last-contact"
import { isTestLead } from "@/lib/crm/lead-attribution"
import { hasInflowStamp, leadInflowInWindow } from "@/lib/crm/lead-reinflow"
import {
  buildLeadPriorityItem,
  buildNeoAccountPriorityItem,
  buildTaskPriorityItem,
  type CrmPriorityItem,
  type CrmPrioritySeverity,
} from "@/lib/crm/priority"
import { TODAY_CALL_SLOTS, type TodayCallSlotKey } from "@/lib/crm/today-calls"
import { resolveCrmWriteSurface } from "@/lib/crm/write-surface"
import type {
  CrmTodayContacts,
  TodayContactCompassRef,
  TodayContactEntityType,
  TodayContactHandled,
  TodayContactHandledKind,
  TodayContactNextSchedule,
  TodayContactPrimaryAction,
  TodayContactReason,
  TodayContactReasonKind,
  TodayContactRow,
} from "@/lib/crm/today-contact-types"
import { DIRECT_INBOUND_LEAD_SOURCES } from "@/lib/lead-types"
import type { CrmTaskRecord, CrmTaskType } from "@/lib/repositories/crm-tasks"
import type { LeadActivityBadge } from "@/lib/repositories/lead-activity"
import type { LeadRecord } from "@/lib/repositories/leads"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const KST_OFFSET_MS = 9 * HOUR_MS

/** 첫 응답 사유를 올리는 최대 경과 시간 — 우선순위 엔진의 "식음"(48h 봉우리 + 3일)과 같은 선. */
export const TODAY_CONTACT_FIRST_RESPONSE_WINDOW_HOURS = 48 + 3 * 24
/** 재문의(재유입 후 미접촉) 사유 창. */
export const TODAY_CONTACT_REINFLOW_LOOKBACK_DAYS = 14
/** 연락 후 재방문 사유 — 사이트 활동이 이 안이어야 오늘 사유다(매일 재등장 방지). */
export const TODAY_CONTACT_REVISIT_WINDOW_DAYS = 7
/** 메타 밴드 상위 건수. */
export const TODAY_CONTACT_META_TOP = 4

export const TODAY_CONTACT_REASON_LABELS: Record<TodayContactReasonKind, string> = {
  first_response: "첫 응답",
  follow_up: "팔로업",
  task: "할 일",
  compass_next_action: "Compass 다음 액션",
  account_expiry: "만료",
  account_balance: "충전",
  demo: "데모",
  revisit: "재방문",
  reinflow: "재문의",
}

export const TODAY_CONTACT_REASON_KINDS = Object.keys(TODAY_CONTACT_REASON_LABELS) as TodayContactReasonKind[]

/** 엔진 추천(약한 사유) — 미래 다음 일정이 있으면 오늘 목록에서 뺀다. */
const WEAK_REASON_KINDS: ReadonlySet<TodayContactReasonKind> = new Set(["first_response", "account_expiry", "account_balance"])
/** 기한(dueAt)이 약속·시각의 의미를 갖는 사유 — 행 안·레인 안 정렬의 시각 축. 나머지는 점수로 줄 세운다. */
const TIMED_REASON_KINDS: ReadonlySet<TodayContactReasonKind> = new Set([
  "task",
  "follow_up",
  "compass_next_action",
  "first_response",
  "reinflow",
  "demo",
])
/** 같은 조건이면 이 순서로 대표 사유를 고른다(약속 → 응대 → 추천). */
const REASON_KIND_ORDER: Record<TodayContactReasonKind, number> = {
  task: 0,
  follow_up: 1,
  compass_next_action: 2,
  first_response: 3,
  reinflow: 4,
  demo: 5,
  revisit: 6,
  account_expiry: 7,
  account_balance: 8,
}
const MONEY_REASON_KINDS: ReadonlySet<TodayContactReasonKind> = new Set(["account_expiry", "account_balance"])
const REENGAGE_REASON_KINDS: ReadonlySet<TodayContactReasonKind> = new Set([
  "demo",
  "revisit",
  "reinflow",
  "follow_up",
  "task",
])
/** Compass 초기 단계 — 이 밖(데모·미팅·BD·결제 뒤 케어)의 다음 액션은 "다시 움직임" 레인이다. */
const COMPASS_EARLY_STAGES: ReadonlySet<string> = new Set(["new", "contact", "consult"])
const MONEY_TASK_TYPES: ReadonlySet<CrmTaskType> = new Set(["renewal", "quote"])

const LANE_LABEL: Record<TodayCallSlotKey, string> = {
  new_response: "신규 응대",
  money: "돈 임박",
  reengage: "다시 움직임",
}
/** 빈 레인을 대체하는 순서(통합 결정: money → reengage → new). */
const LANE_FALLBACK_ORDER: TodayCallSlotKey[] = ["money", "reengage", "new_response"]

// ── KST 날짜 도우미 ────────────────────────────────────────────────────────────

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** 그 시각이 속한 KST 날의 00:00(UTC ms). */
export function todayContactKstDayStart(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS
}

/** KST "YYYY-MM-DD". */
export function todayContactDateKey(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`
}

/** KST "MM-DD". */
export function todayContactMonthDay(iso: string | null | undefined): string | null {
  const ms = timeOf(iso)
  if (ms == null) return null
  return todayContactDateKey(ms).slice(5)
}

function kstTime(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS)
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`
}

function kstDayDelta(ms: number, nowMs: number): number {
  return Math.round((todayContactKstDayStart(ms) - todayContactKstDayStart(nowMs)) / DAY_MS)
}

/** "2일 지남" · "오늘 14:00" · "오늘" · "내일" · "MM-DD" — 사유 칩 꼬리말. */
function dueSuffix(ms: number, nowMs: number): string {
  const delta = kstDayDelta(ms, nowMs)
  if (delta < 0) return `${Math.abs(delta)}일 지남`
  const time = kstTime(ms)
  if (delta === 0) return time === "00:00" ? "오늘" : `오늘 ${time}`
  if (delta === 1) return "내일"
  return todayContactDateKey(ms).slice(5)
}

// ── 다음 일정(결과 기록 폼·서버 공용) ─────────────────────────────────────────

function kstInstantIso(nowMs: number, dayOffset: number, hour: number): string {
  const kst = new Date(nowMs + KST_OFFSET_MS)
  const ms = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + dayOffset, hour, 0, 0) - KST_OFFSET_MS
  return new Date(ms).toISOString()
}

/**
 * 다음 일정 → 기한 ISO. 프리셋은 KST 벽시계 고정(영업일 보정 없음 — 통합 결정):
 * 내일 09:00 · 3일 뒤 10:00 · 다음 주 월 10:00(오늘이 월요일이면 +7일). dueAt 은 그대로 정규화한다.
 * 해석할 수 없으면 null.
 */
export function resolveTodayContactNextDueAt(next: TodayContactNextSchedule | null | undefined, nowMs: number): string | null {
  if (!next) return null
  if ("preset" in next) {
    if (next.preset === "tomorrow_9") return kstInstantIso(nowMs, 1, 9)
    if (next.preset === "in3_10") return kstInstantIso(nowMs, 3, 10)
    if (next.preset === "next_monday_10") {
      const weekday = new Date(nowMs + KST_OFFSET_MS).getUTCDay()
      const daysUntilMonday = (1 - weekday + 7) % 7 || 7
      return kstInstantIso(nowMs, daysUntilMonday, 10)
    }
    return null
  }
  const ms = timeOf(next.dueAt)
  return ms == null ? null : new Date(ms).toISOString()
}

/**
 * 오늘 연락 미루기가 닫은 할 일의 결과 문구 머리. 미루기는 할 일을 "완료"가 아니라 "취소 + '미룸 → 다음 MM-DD'"로
 * 닫는다(완료 집계를 부풀리지 않게 — lib/crm/account-contact-record.ts). 처리 흔적은 이 머리로 '미룸'을 가린다.
 */
export const TODAY_CONTACT_SNOOZE_OUTCOME_PREFIX = "미룸 →"
/** 되돌리기(DELETE)가 취소한 할 일의 결과 문구 — 처리 흔적이 아니다. */
export const TODAY_CONTACT_UNDO_OUTCOME = "되돌리기"

/** 미루기가 닫은 할 일의 결과 문구("미룸 → 다음 09-26"). */
export function todayContactSnoozeOutcome(dueAt: string): string {
  return `${TODAY_CONTACT_SNOOZE_OUTCOME_PREFIX} 다음 ${todayContactMonthDay(dueAt) ?? "일정"}`
}

/** 오늘 연락 미루기가 닫은 할 일인가(결과 문구 머리로 판정). */
export function isTodayContactSnoozeOutcome(outcome: string | null | undefined): boolean {
  return trimOrNull(outcome)?.startsWith(TODAY_CONTACT_SNOOZE_OUTCOME_PREFIX) ?? false
}

/**
 * 다음 일정 할 일의 기본 제목 — 사유 기반(통합 결정): 연장 → "연장 제안 후속", 재충전·소진 → "재충전 안내 후속",
 * 만료 회복 → "만료 회복 연락", 그 밖 "재연락".
 */
export function defaultTodayContactNextTitle(reasons: readonly Pick<TodayContactReason, "kind" | "label">[]): string {
  for (const reason of reasons) {
    if (reason.kind === "account_expiry") {
      return reason.label.includes("회복") || reason.label.includes("지남") || reason.label.includes("전 만료")
        ? "만료 회복 연락"
        : "연장 제안 후속"
    }
    if (reason.kind === "account_balance") return "재충전 안내 후속"
  }
  return "재연락"
}

// ── 입력 ───────────────────────────────────────────────────────────────────────

export interface TodayContactQueueCompassInput {
  /**
   * 다음 액션 기간 조회 — 목록 창 [오늘 00:00 KST − 14일, 오늘 끝]. null = 연결 끊김 — Compass 사유 없이 Home 원천만으로
   * 선다. 창 밖(14일 넘게 지난) 행이 섞여 와도 목록에 올리지 않고 건수로만 센다.
   */
  dueActions: readonly CompassNextActionRow[] | null
  dueTruncated?: boolean
  /**
   * 14일 넘게 지난 다음 액션(건수 전용 조회 — 목록 조회와 따로 읽어 목록이 옛 행에 밀려 잘리지 않게 한다).
   * null = 그 조회만 실패(건수를 모름 — 0 과 구분해 partial). 생략하면 dueActions 안의 창 밖 행만 센다.
   */
  beyondLookback?: readonly CompassNextActionRow[] | null
  /** 건수 전용 조회가 상한에서 잘렸다 — 건수는 하한이다(partial). */
  beyondLookbackTruncated?: boolean
  /** 우리 전화 키를 가진 Compass 리드(대표 선택 전). null = 연결 끊김 — 리드 행은 Compass 매칭을 판정하지 못한다. */
  leadIndex: readonly CompassLeadIndexRow[] | null
  leadIndexTruncated?: boolean
  /** 전화 키 → 최신 Compass 사람 활동. null = 연결 끊김. */
  latestContacts: ReadonlyMap<string, LastContactFact> | null
  latestTruncated?: boolean
}

export interface TodayContactQueueInput {
  now: Date
  leads: readonly LeadRecord[]
  neoRows: readonly NeoCrmCustomerRow[]
  /** 활성(open·snoozed) 할 일 */
  tasks: readonly CrmTaskRecord[]
  /** 오늘(KST 00:00 이후) 닫힌(완료·취소) 할 일 — 진행률 재구성용 */
  closedTasksToday: readonly CrmTaskRecord[]
  engagements?: Record<string, LeadActivityBadge> | null
  demoIndex?: CompassDemoIndex | null
  /** Home 연락 인덱스(대상 키 lead:·neo_account:·customer:·deal: → 최신 사람 연락). null = 못 읽음. */
  homeContacts: ReadonlyMap<string, LastContactFact> | null
  compass: TodayContactQueueCompassInput
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    tasksOk: boolean
    closedTasksOk: boolean
  }
  neoSync: { latestSyncedAt: string | null; stale: boolean }
  warnings?: readonly string[]
  /** 담당 필터 키(소문자 비교). 비면 담당 전체. */
  ownerKeys?: readonly string[] | null
  limit: number
  /** 처리된 행도 목록에 싣는가(기본 true). 진행률은 이 값과 무관하게 처리 행을 센다. */
  includeHandled?: boolean
  /**
   * NEO 계정 등록이 확정된 리드 id(crm_source_links lead→external_account confirmed). 이 리드는 Compass 매칭이
   * 있어도 Home 이 정본이다 — 고객 360·리드 보드와 같은 판정(lib/crm/write-surface.ts). null/미지정 = 모름(Compass 우선).
   */
  neoRegisteredLeadIds?: ReadonlySet<string> | null
}

// ── 누적기 ─────────────────────────────────────────────────────────────────────

type HandledTrace = TodayContactHandled & { reason: TodayContactReason }

interface RowAcc {
  key: string
  entityType: TodayContactEntityType
  entityId: string
  title: string
  subtitle: string | null
  ownerName: string | null
  ownerKeys: Set<string>
  reasons: TodayContactReason[]
  traces: HandledTrace[]
  score: number
  severity: CrmPrioritySeverity
  isMetaLead: boolean
  lead: LeadRecord | null
  phoneKey: string | null
  homeContactKey: string | null
  compass: TodayContactCompassRef | null
  compassStages: Set<string>
  taskTypes: Set<CrmTaskType>
  openTaskIds: string[]
  href: string
  neoAsOf: string | null
  /**
   * 오늘 연락 "내일로"(리드 미루기 — follow_up_at 만 옮긴다)로 추정한 흔적. Home 입력 행(record_outcome_lead)에서만
   * 처리 흔적으로 쓴다 — 그 버튼은 그 행에만 있다(Compass 매칭 리드는 Compass 에서 미룬다).
   */
  homeSnoozeTrace: HandledTrace | null
}

const SEVERITY_RANK: Record<CrmPrioritySeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 }

function lowerKeys(values: Array<string | null | undefined>): string[] {
  return values.map((value) => trimOrNull(value)?.toLowerCase() ?? null).filter((value): value is string => Boolean(value))
}

function bumpScore(row: RowAcc, score: number, severity: CrmPrioritySeverity) {
  if (score > row.score) row.score = score
  if (SEVERITY_RANK[severity] > SEVERITY_RANK[row.severity]) row.severity = severity
}

/**
 * 연락처 가림 표기 — 오늘 연락 응답(GET·SSR 프리페치·브라우저 캐시로 퍼진다)에는 전화·이메일 원문을 싣지 않는다.
 * 전화 = 앞 3 + **** + 끝 4("010-****-2222"), 이메일 = 앞 1~2글자 + ***@도메인. 알아볼 수 없으면 null.
 */
export function maskTodayContactHandle(value: string | null | undefined): string | null {
  const text = trimOrNull(value)
  if (!text) return null
  const at = text.indexOf("@")
  if (at >= 0) {
    const local = Array.from(text.slice(0, at))
    const domain = text.slice(at + 1).trim()
    if (local.length === 0 || !domain) return null
    return `${local.slice(0, local.length <= 2 ? 1 : 2).join("")}***@${domain}`
  }
  const digits = text.replace(/\D/g, "")
  if (digits.length < 8) return null
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`
}

/** 리드 행 제목 — 기관 → 이름 → (가린 연락처로) "이름 없는 리드". 연락처 원문은 쓰지 않는다. */
function displayLeadName(lead: LeadRecord): string {
  const named = trimOrNull(lead.org) ?? trimOrNull(lead.name)
  if (named) return named
  const handle = maskTodayContactHandle(lead.phone) ?? maskTodayContactHandle(lead.email)
  return handle ? `이름 없는 리드 (${handle})` : "이름 없는 리드"
}

/** 리드 행 보조 줄 — 기관이 제목일 때의 담당자 이름만. 연락처 원문은 싣지 않는다. */
function leadSubtitle(lead: LeadRecord): string | null {
  const org = trimOrNull(lead.org)
  const name = trimOrNull(lead.name)
  return org && name ? name : null
}

/** NEO 계정 행 보조 줄 — 지역 · UID. 엔진 항목 subtitle(전화 원문일 수 있다)은 쓰지 않는다. */
function neoSubtitle(account: NeoCrmCustomerRow): string | null {
  const uid = trimOrNull(account.uid)
  const parts = [trimOrNull(account.regionLabel), uid ? `UID ${uid}` : null].filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(" · ") : null
}

function leadHref(id: string) {
  return `/admin/crm/customers/leads?lead=${encodeURIComponent(id)}`
}

function accountHref(id: string) {
  return `/admin/crm/customers/accounts?account=${encodeURIComponent(id)}`
}

function dealHref(id: string) {
  return `/admin/crm/deals/orders?deal=${encodeURIComponent(id)}`
}

/**
 * 전환 고객(customer:) 대상 링크 — 360 은 lead·neo 키만 받아 열 수 없고, 맨 /admin/crm/customers 는 필터 없는 통합 목록으로
 * 가 어떤 고객인지 잃는다. 통합 고객 DB 를 원천 고객 + 이름 검색으로 연다(lib/crm/rev-sync-health.ts revLinkedTargetHref 와
 * 같은 "검색 착지" 기본형). 이름을 모르면 원천 고객 필터만.
 */
export function todayContactCustomerHref(label: string | null | undefined): string {
  const params = new URLSearchParams({ source: "customer" })
  const q = trimOrNull(label)
  if (q) params.set("q", q)
  return `/admin/crm/customers/unified?${params.toString()}`
}

function isDemoToday(signal: CompassDemoSignal): boolean {
  // 데모 당일·내일(확인 연락)·끝난 지 3일 안(후속)만 오늘 사유다. 엔진은 예정 전체·14일 후속까지 today 로 올리지만,
  // 오늘 연락은 강한 사유라 미래 일정이 있어도 남기므로 창을 좁혀 매일 재등장을 막는다.
  if (signal.phase === "today") return true
  if (signal.phase === "upcoming") return signal.daysFromNow <= 1
  return signal.daysFromNow >= -3
}

function compassRefFromIndexRow(row: CompassLeadIndexRow | CompassNextActionRow): TodayContactCompassRef {
  return {
    leadId: row.id,
    url: compassLeadUrl(row.id),
    stageLabel: compassStageLabel(row.stage),
    owner: compassResponsibleName(row),
    nextActionAt: row.next_action_at ?? null,
  }
}

function compareReasons(a: TodayContactReason, b: TodayContactReason): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
  const aTime = TIMED_REASON_KINDS.has(a.kind) ? (timeOf(a.dueAt) ?? Infinity) : Infinity
  const bTime = TIMED_REASON_KINDS.has(b.kind) ? (timeOf(b.dueAt) ?? Infinity) : Infinity
  if (aTime !== bTime) return aTime - bTime
  return REASON_KIND_ORDER[a.kind] - REASON_KIND_ORDER[b.kind]
}

/** 같은 종류 사유가 여럿이면(할 일 2건·Compass 리드 2건) 대표 하나로 접고 칩에 건수를 붙인다. */
function collapseReasons(reasons: TodayContactReason[]): TodayContactReason[] {
  const sorted = [...reasons].sort(compareReasons)
  const byKind = new Map<TodayContactReasonKind, TodayContactReason[]>()
  for (const reason of sorted) {
    const list = byKind.get(reason.kind)
    if (list) list.push(reason)
    else byKind.set(reason.kind, [reason])
  }
  const collapsed: TodayContactReason[] = []
  for (const [kind, list] of byKind) {
    const head = list[0]
    if (list.length === 1) {
      collapsed.push(head)
      continue
    }
    const more = list.length - 1
    collapsed.push({
      ...head,
      label: `${TODAY_CONTACT_REASON_LABELS[kind]} ${list.length} · ${head.label.split(" · ").slice(1).join(" · ") || "여럿"}`,
      detail: head.detail ? `${head.detail} 외 ${more}건` : `외 ${more}건`,
      overdue: list.some((reason) => reason.overdue),
    })
  }
  return collapsed.sort(compareReasons)
}

function reasonRankTime(reason: TodayContactReason | undefined): number {
  if (!reason || !TIMED_REASON_KINDS.has(reason.kind)) return Infinity
  return timeOf(reason.dueAt) ?? Infinity
}

// ── 사유 만들기 ────────────────────────────────────────────────────────────────

function firstResponseLabel(ageHours: number): string {
  if (ageHours < 1) return "첫 응답 · 방금 유입"
  if (ageHours < 24) return `첫 응답 · ${Math.floor(ageHours)}시간째`
  return `첫 응답 · ${Math.floor(ageHours / 24)}일째`
}

function taskReason(task: CrmTaskRecord, dueAt: string | null, nowMs: number, todayStart: number, suffixOverride?: string): TodayContactReason {
  const dueMs = timeOf(dueAt)
  const suffix = suffixOverride ?? (dueMs != null ? dueSuffix(dueMs, nowMs) : "기한 없음 · 중요")
  return {
    kind: "task",
    label: `할 일 · ${suffix}`,
    detail: trimOrNull(task.title),
    dueAt: dueAt ?? null,
    overdue: suffixOverride ? false : dueMs != null && dueMs < todayStart,
    sourceRef: `task:${task.id}`,
  }
}

function taskTargetKey(task: CrmTaskRecord): string {
  const targetId = trimOrNull(task.targetId)
  if (targetId) {
    if (task.targetType === "lead") return `lead:${targetId}`
    if (task.targetType === "neo_account") return `neo:${targetId}`
    if (task.targetType === "customer") return `customer:${targetId}`
    if (task.targetType === "deal") return `deal:${targetId}`
  }
  return `task:${task.id}`
}

/** 행 키 → Home 연락 인덱스 키(lib/crm/last-contact.ts contactTargetKey 형식). */
function homeContactKeyFor(key: string): string | null {
  const [prefix, ...rest] = key.split(":")
  const id = rest.join(":")
  if (!id) return null
  if (prefix === "lead") return contactTargetKey("lead", id)
  if (prefix === "neo") return contactTargetKey("neo_account", id)
  if (prefix === "customer") return contactTargetKey("customer", id)
  if (prefix === "deal") return contactTargetKey("deal", id)
  return null
}

function taskQualifiesToday(task: CrmTaskRecord, dueAt: string | null, todayEnd: number): boolean {
  const dueMs = timeOf(dueAt)
  if (dueMs != null) return dueMs < todayEnd
  return task.priority === "urgent" || task.priority === "high"
}

/**
 * Compass 리드 인덱스·최신 사람 활동 조회에 넘길 전화 키 — 오늘 연락 행이 **될 수 있는** 모든 엔티티의 키.
 *  - 진행 중(new·contacted) 리드 · NEO 계정 · Compass 다음 액션 행
 *  - 할 일(활성·오늘 닫힘) 대상 리드는 **상태와 무관하게** — 종료·전환 리드도 할 일로 행이 된다. 키가 빠지면 그 행은
 *    Compass 매칭을 몰라 360·리드 보드·통합 목록(단계 무관 Compass 판정)과 다른 기록 위치로 갈리고, Compass 에서 한
 *    연락도 "처리됨"으로 반영되지 않는다.
 * 진행 상태 필터는 Compass 다음 액션을 붙일 Home 리드를 고르는 곳(openLeadByPhone)에만 남긴다.
 * 전화 키는 서버 안 조인에만 쓴다(응답에 싣지 않는다).
 */
export function collectTodayContactPhoneKeys(input: {
  leads: readonly Pick<LeadRecord, "id" | "status" | "phone">[]
  neoRows: readonly Pick<NeoCrmCustomerRow, "phone">[]
  tasks: readonly Pick<CrmTaskRecord, "targetType" | "targetId">[]
  closedTasksToday?: readonly Pick<CrmTaskRecord, "targetType" | "targetId">[]
  dueRows?: readonly Pick<CompassNextActionRow, "phone_key">[] | null
}): string[] {
  const keys = new Set<string>()
  const add = (value: string | null | undefined) => {
    const key = contactPhoneKey(value)
    if (key) keys.add(key)
  }
  const leadById = new Map<string, Pick<LeadRecord, "id" | "status" | "phone">>()
  for (const lead of input.leads) {
    leadById.set(lead.id, lead)
    if (lead.status === "new" || lead.status === "contacted") add(lead.phone)
  }
  for (const task of [...input.tasks, ...(input.closedTasksToday ?? [])]) {
    const targetId = trimOrNull(task.targetId)
    if (task.targetType !== "lead" || !targetId) continue
    add(leadById.get(targetId)?.phone)
  }
  for (const account of input.neoRows) add(account.phone)
  for (const row of input.dueRows ?? []) add(row.phone_key)
  return [...keys]
}

/**
 * 쿼터(신규 2 · 돈 2 · 재활성 1)를 끼워 넣기 패턴으로 — 쿼터가 작은 레인은 뒤 바퀴에만 들어간다:
 * [신규, 돈, 신규, 돈, 재활성]. 쿼터는 개수 상한이 아니라 정렬 규칙이다(패턴을 반복한다).
 */
export function todayContactLanePattern(slots = TODAY_CALL_SLOTS): TodayCallSlotKey[] {
  const maxQuota = Math.max(0, ...slots.map((slot) => slot.quota))
  const pattern: TodayCallSlotKey[] = []
  for (let round = 0; round < maxQuota; round += 1) {
    for (const slot of slots) {
      if (round >= maxQuota - slot.quota) pattern.push(slot.key)
    }
  }
  return pattern
}

// ── 본체 ───────────────────────────────────────────────────────────────────────

export function buildTodayContacts(input: TodayContactQueueInput): CrmTodayContacts {
  const now = input.now
  const nowMs = now.getTime()
  const todayStart = todayContactKstDayStart(nowMs)
  const todayEnd = todayStart + DAY_MS
  const includeHandled = input.includeHandled !== false
  const limit = Math.max(1, Math.floor(input.limit))
  const homeContacts = input.homeContacts
  const compass = input.compass
  const demoIndex = input.demoIndex ?? null
  const neoAsOf = input.neoSync.latestSyncedAt
  const ownerFilter = new Set(lowerKeys([...(input.ownerKeys ?? [])]))

  const rows = new Map<string, RowAcc>()
  const futureByKey = new Map<string, NextContactCandidate[]>()
  /** 오늘 만든 미래 할 일 흔적 — 모든 원천으로 행을 만든 뒤(Compass 포함) 이미 있는 행에만 붙인다. */
  const rescheduledTraces: Array<{ key: string; trace: HandledTrace }> = []
  let compassHandledToday = 0

  const addFuture = (key: string, candidate: NextContactCandidate) => {
    const list = futureByKey.get(key)
    if (list) list.push(candidate)
    else futureByKey.set(key, [candidate])
  }

  // Compass 대표 행(전화 키 → 1건) — 칩·자동 상태 반영과 같은 대표 규칙(overlay.ts).
  const compassRepByPhone = new Map<string, CompassLeadIndexRow>()
  if (compass.leadIndex) {
    const grouped = new Map<string, CompassLeadIndexRow[]>()
    for (const row of compass.leadIndex) {
      const key = trimOrNull(row.phone_key)
      if (!key) continue
      const list = grouped.get(key)
      if (list) list.push(row)
      else grouped.set(key, [row])
    }
    for (const [key, list] of grouped) {
      const rep = pickRepresentativeCompassRow(list)
      if (rep) compassRepByPhone.set(key, rep)
    }
  }

  const leadById = new Map<string, LeadRecord>()
  // Compass 다음 액션을 붙일 Home 리드(진행 중 · 전화 키 기준 최근 유입 1건).
  const openLeadByPhone = new Map<string, LeadRecord>()
  const inflowMs = (lead: LeadRecord) => Math.max(timeOf(lead.last_inflow_at) ?? 0, timeOf(lead.timestamp) ?? 0)
  for (const lead of input.leads) {
    leadById.set(lead.id, lead)
    if (lead.status !== "new" && lead.status !== "contacted") continue
    if (isTestLead(lead)) continue
    const key = contactPhoneKey(lead.phone)
    if (!key) continue
    const current = openLeadByPhone.get(key)
    if (!current || inflowMs(lead) > inflowMs(current) || (inflowMs(lead) === inflowMs(current) && lead.id > current.id)) {
      openLeadByPhone.set(key, lead)
    }
  }
  const neoById = new Map<string, NeoCrmCustomerRow>()
  const neoByPhone = new Map<string, NeoCrmCustomerRow>()
  for (const account of input.neoRows) {
    neoById.set(account.accountId, account)
    const key = contactPhoneKey(account.phone)
    if (key && !neoByPhone.has(key)) neoByPhone.set(key, account)
  }

  const lastContactFor = (homeKey: string | null, phoneKey: string | null): LastContactFact | null =>
    pickLatestContact(
      homeKey ? homeContacts?.get(homeKey) : null,
      phoneKey ? compass.latestContacts?.get(phoneKey) : null
    )

  // ── 엔티티 행 팩토리 ──
  const makeLeadRow = (lead: LeadRecord, item: CrmPriorityItem | null): RowAcc => {
    const phoneKey = contactPhoneKey(lead.phone)
    const rep = phoneKey ? compassRepByPhone.get(phoneKey) : undefined
    const ownerKeys = new Set(lowerKeys([lead.assigned_to]))
    if (rep) for (const key of compassOwnerKeys(rep)) ownerKeys.add(key)
    return {
      key: `lead:${lead.id}`,
      entityType: "lead",
      entityId: lead.id,
      title: displayLeadName(lead),
      subtitle: leadSubtitle(lead),
      ownerName: trimOrNull(lead.assigned_to) ?? (rep ? compassResponsibleName(rep) : null),
      ownerKeys,
      reasons: [],
      traces: [],
      score: item?.score ?? 0,
      severity: item?.severity ?? "low",
      isMetaLead: lead.source === "meta_lead_ads",
      lead,
      phoneKey,
      homeContactKey: contactTargetKey("lead", lead.id),
      compass: rep ? compassRefFromIndexRow(rep) : null,
      compassStages: new Set(),
      taskTypes: new Set(),
      openTaskIds: [],
      href: leadHref(lead.id),
      neoAsOf: null,
      homeSnoozeTrace: null,
    }
  }

  const makeNeoRow = (account: NeoCrmCustomerRow, item: CrmPriorityItem | null): RowAcc => {
    const phoneKey = contactPhoneKey(account.phone)
    const rep = phoneKey ? compassRepByPhone.get(phoneKey) : undefined
    return {
      key: `neo:${account.accountId}`,
      entityType: "neo_account",
      entityId: account.accountId,
      title: account.name,
      subtitle: neoSubtitle(account),
      ownerName: trimOrNull(account.ownerName),
      ownerKeys: new Set(lowerKeys([account.ownerName, account.ownerId])),
      reasons: [],
      traces: [],
      score: item?.score ?? 0,
      severity: item?.severity ?? "low",
      isMetaLead: false,
      lead: null,
      phoneKey,
      homeContactKey: contactTargetKey("neo_account", account.accountId),
      // 계정 행의 주 행동은 Home 기록이다 — 같은 전화의 Compass 리드는 보조 링크("Compass 기록 ↗")로만 싣는다.
      compass: rep ? compassRefFromIndexRow(rep) : null,
      compassStages: new Set(),
      taskTypes: new Set(),
      openTaskIds: [],
      href: accountHref(account.accountId),
      neoAsOf,
      homeSnoozeTrace: null,
    }
  }

  const makeTaskTargetRow = (key: string, task: CrmTaskRecord): RowAcc => {
    const [prefix, ...rest] = key.split(":")
    const id = rest.join(":")
    if (prefix === "lead") {
      const lead = leadById.get(id)
      if (lead) return makeLeadRow(lead, null)
    }
    if (prefix === "neo") {
      const account = neoById.get(id)
      if (account) return makeNeoRow(account, null)
    }
    const entityType: TodayContactEntityType =
      prefix === "lead"
        ? "lead"
        : prefix === "neo"
          ? "neo_account"
          : prefix === "customer"
            ? "customer"
            : prefix === "deal"
              ? "deal"
              : "task"
    const href =
      entityType === "lead"
        ? leadHref(id)
        : entityType === "neo_account"
          ? accountHref(id)
          : entityType === "deal"
            ? dealHref(id)
            : entityType === "customer"
              ? todayContactCustomerHref(task.targetLabel)
              : "/admin/crm/activity"
    return {
      key,
      entityType,
      entityId: entityType === "task" ? task.id : id,
      title: entityType === "task" ? task.title : (trimOrNull(task.targetLabel) ?? task.title),
      subtitle: entityType === "task" ? trimOrNull(task.targetLabel) : null,
      ownerName: trimOrNull(task.ownerNameSnapshot),
      ownerKeys: new Set(),
      reasons: [],
      traces: [],
      score: 0,
      severity: "low",
      isMetaLead: false,
      lead: null,
      phoneKey: null,
      homeContactKey: homeContactKeyFor(key),
      compass: null,
      compassStages: new Set(),
      taskTypes: new Set(),
      openTaskIds: [],
      href,
      neoAsOf: entityType === "neo_account" ? neoAsOf : null,
      homeSnoozeTrace: null,
    }
  }

  /**
   * 리드 행의 기록 위치가 Compass 인가 — 360·리드 보드와 같은 공용 판정(lib/crm/write-surface.ts). 전환(converted) 리드와
   * NEO 등록 확정 리드는 Compass 매칭이 있어도 Home 기록(규칙 3)이다. 리드 상태를 넘기지 않으면 전환 리드가 Compass 행이 된다.
   * compassHref = 이 행에 붙을(또는 붙은) Compass 리드 링크.
   */
  const leadRowWritesToCompass = (acc: RowAcc, compassHref: string | null): boolean =>
    resolveCrmWriteSurface({
      source: "lead",
      found: true,
      compassHref,
      leadStatus: acc.lead?.status ?? null,
      crmRegistered: input.neoRegisteredLeadIds?.has(acc.entityId) === true,
    }).surface === "compass"

  const ensure = (key: string, factory: () => RowAcc): RowAcc => {
    const existing = rows.get(key)
    if (existing) return existing
    const created = factory()
    rows.set(key, created)
    return created
  }

  // ── A. 리드 ──
  const leadItems = new Map<string, CrmPriorityItem | null>()
  for (const lead of input.leads) {
    if (lead.status !== "new" && lead.status !== "contacted") continue
    const engagement = input.engagements?.[lead.id] ?? null
    const item = buildLeadPriorityItem(lead, now, { engagement, demoIndex })
    leadItems.set(lead.id, item)
    // 엔진이 제외한 리드(테스트·미확인 저의도)는 오늘 연락에도 올리지 않는다.
    if (!item) continue

    const reasons: TodayContactReason[] = []
    const phoneKey = contactPhoneKey(lead.phone)
    const createdMs = timeOf(lead.timestamp)
    const followMs = timeOf(lead.follow_up_at)
    const scheduledFuture = followMs != null && followMs >= todayEnd
    if (followMs != null && followMs >= todayEnd) {
      addFuture(`lead:${lead.id}`, { at: lead.follow_up_at as string, kind: "follow_up", title: null })
    }

    // 첫 응답 — 응대 대상 소스의 신규 리드, 식기 전(엔진 봉우리+3일), 미래 팔로업이 없을 때.
    if (lead.status === "new" && DIRECT_INBOUND_LEAD_SOURCES.has(lead.source) && !scheduledFuture && createdMs != null) {
      const ageHours = Math.max(0, (nowMs - createdMs) / HOUR_MS)
      if (ageHours <= TODAY_CONTACT_FIRST_RESPONSE_WINDOW_HOURS) {
        reasons.push({
          kind: "first_response",
          label: firstResponseLabel(ageHours),
          detail: null,
          dueAt: lead.timestamp,
          overdue: createdMs < todayStart,
          sourceRef: `lead:${lead.id}`,
        })
      }
    }

    // 팔로업 — 오늘 끝 이전(지난 것 포함).
    if (followMs != null && followMs < todayEnd) {
      reasons.push({
        kind: "follow_up",
        label: `팔로업 · ${dueSuffix(followMs, nowMs)}`,
        detail: null,
        dueAt: lead.follow_up_at ?? null,
        overdue: followMs < todayStart,
        sourceRef: `lead:${lead.id}`,
      })
    }

    // 데모 — 당일·내일·끝난 지 3일.
    const demo = demoIndex ? findCompassDemoSignal(demoIndex, lead.phone) : null
    if (demo && isDemoToday(demo)) {
      reasons.push({
        kind: "demo",
        label: compassDemoLabel(demo),
        detail: null,
        dueAt: demo.date,
        overdue: false,
        sourceRef: `compass:${demo.compassLeadId}`,
      })
    }

    const lastContact = lastContactFor(`lead:${lead.id}`, phoneKey)

    // 연락 후 재방문 — 우리 마지막 연락(Home+Compass) 뒤 사이트 활동이 최근 7일 안.
    const activityMs = timeOf(engagement?.lastActivityAt)
    const contactMs = Math.max(timeOf(lastContact?.at) ?? -Infinity, timeOf(engagement?.lastContactAt) ?? -Infinity)
    if (
      activityMs != null &&
      Number.isFinite(contactMs) &&
      activityMs > contactMs &&
      activityMs >= nowMs - TODAY_CONTACT_REVISIT_WINDOW_DAYS * DAY_MS
    ) {
      reasons.push({
        kind: "revisit",
        label: "연락 후 재방문",
        detail: null,
        dueAt: engagement?.lastActivityAt ?? null,
        overdue: false,
        sourceRef: `lead:${lead.id}`,
      })
    }

    // 재문의 — 최근 14일 재유입(스탬프 게이트 포함) 뒤 연락 없음. 연락 원천을 모르면(Home 못 읽음 · 전화가 있는데
    // Compass 끊김) 미접촉으로 치지 않는다 — "모름"을 "안 함"으로 만들지 않는다.
    const inflow = leadInflowInWindow(lead, nowMs - TODAY_CONTACT_REINFLOW_LOOKBACK_DAYS * DAY_MS, nowMs, {
      inclusiveEnd: true,
    })
    const contactKnown = homeContacts != null && (phoneKey == null || compass.latestContacts != null)
    if (inflow?.kind === "reinflow" && contactKnown) {
      const lastMs = timeOf(lastContact?.at)
      if (lastMs == null || lastMs < inflow.atMs) {
        const delta = kstDayDelta(inflow.atMs, nowMs)
        reasons.push({
          kind: "reinflow",
          label: `재문의 · ${delta === 0 ? "오늘" : `${Math.abs(delta)}일 전`} · 연락 전`,
          detail: null,
          dueAt: inflow.at,
          overdue: inflow.atMs < todayStart,
          sourceRef: `lead:${lead.id}`,
        })
      }
    }

    if (reasons.length === 0) continue
    const row = ensure(`lead:${lead.id}`, () => makeLeadRow(lead, item))
    row.reasons.push(...reasons)
    bumpScore(row, item.score, item.severity)
  }

  // ── B. NEO 계정(엔진 bucket=today 만) ──
  for (const account of input.neoRows) {
    const base = buildNeoAccountPriorityItem(account, now)
    const full = demoIndex ? buildNeoAccountPriorityItem(account, now, { demoIndex }) : base
    const reasons: TodayContactReason[] = []
    if (base && base.bucket === "today") {
      const isExpiry =
        base.action === "recover_expired" || (base.action === "renew_account" && base.actionLabel === "연장 제안")
      reasons.push({
        kind: isExpiry ? "account_expiry" : "account_balance",
        label: `${base.actionLabel} · ${base.reason}`,
        detail: null,
        dueAt: isExpiry ? account.expireAt : null,
        overdue: false,
        sourceRef: `neo:${account.accountId}`,
      })
    }
    const demo = demoIndex ? findCompassDemoSignal(demoIndex, account.phone) : null
    if (demo && isDemoToday(demo)) {
      reasons.push({
        kind: "demo",
        label: compassDemoLabel(demo),
        detail: null,
        dueAt: demo.date,
        overdue: false,
        sourceRef: `compass:${demo.compassLeadId}`,
      })
    }
    if (reasons.length === 0) continue
    const item = full ?? base
    const row = ensure(`neo:${account.accountId}`, () => makeNeoRow(account, item))
    row.reasons.push(...reasons)
    if (item) bumpScore(row, item.score, item.severity)
  }

  // ── C. 할 일(활성) ──
  for (const task of input.tasks) {
    if (task.status !== "open" && task.status !== "snoozed") continue
    const key = taskTargetKey(task)
    const snoozedUntilMs = task.status === "snoozed" ? timeOf(task.snoozedUntil) : null
    const snoozedFuture = task.status === "snoozed" && (snoozedUntilMs == null || snoozedUntilMs > nowMs)
    const nextAt = taskNextContactAt(task)
    const nextMs = timeOf(nextAt)

    if (snoozedFuture) {
      if (nextAt && nextMs != null && nextMs >= todayEnd) addFuture(key, { at: nextAt, kind: "task", title: task.title })
      // 오늘 미룬 할 일 — 원래 기한이 덮어써져 추정이다(snoozeCrmTask 가 due_at 을 미룬 날로 바꾼다).
      const updatedMs = timeOf(task.updatedAt)
      if (updatedMs != null && updatedMs >= todayStart) {
        const row = ensure(key, () => makeTaskTargetRow(key, task))
        row.traces.push({
          kind: "task_snoozed",
          at: task.updatedAt,
          by: trimOrNull(task.assignedBy),
          source: "home",
          nextAt: nextAt ?? null,
          approximate: true,
          reason: taskReason(task, nextAt, nowMs, todayStart, "미룸"),
        })
        for (const ownerKey of lowerKeys([task.ownerKey, task.ownerNameSnapshot])) row.ownerKeys.add(ownerKey)
      }
      continue
    }

    const effectiveDue = task.status === "snoozed" ? (task.snoozedUntil ?? task.dueAt) : task.dueAt
    if (!taskQualifiesToday(task, effectiveDue, todayEnd)) {
      if (nextAt && nextMs != null && nextMs >= todayEnd) addFuture(key, { at: nextAt, kind: "task", title: task.title })
      // 오늘 만든 미래 할 일(기록에서 파생되지 않은 것) — "다음 일정으로 옮김" 흔적. 이미 목록에 있는 행에만 붙인다
      // (다음 주 할 일을 오늘 만들었다는 이유로 새 행을 만들면 진행률이 부풀어 오른다).
      const createdMs = timeOf(task.createdAt)
      if (createdMs != null && createdMs >= todayStart && !task.sourceEventId && nextMs != null && nextMs >= todayEnd) {
        rescheduledTraces.push({
          key,
          trace: {
            kind: "rescheduled",
            at: task.createdAt,
            by: trimOrNull(task.createdBy),
            source: "home",
            nextAt,
            approximate: true,
            reason: taskReason(task, nextAt, nowMs, todayStart),
          },
        })
      }
      continue
    }

    const taskItem = buildTaskPriorityItem(task, now)
    const row = ensure(key, () => makeTaskTargetRow(key, task))
    row.reasons.push(taskReason(task, effectiveDue, nowMs, todayStart))
    row.openTaskIds.push(task.id)
    row.taskTypes.add(task.taskType)
    for (const ownerKey of lowerKeys([task.ownerKey, task.ownerNameSnapshot])) row.ownerKeys.add(ownerKey)
    if (!row.ownerName) row.ownerName = trimOrNull(task.ownerNameSnapshot)
    if (taskItem) bumpScore(row, taskItem.score, taskItem.severity)
  }

  // 오늘 닫은 할 일 — 기한이 오늘 끝 이전이던(또는 기한 없는 중요) 할 일만 처리 흔적으로 센다(완료 시각이 남아 결정적).
  //  - 완료(done) → task_done.
  //  - 오늘 연락 미루기가 닫은 할 일(결과 문구 "미룸 → 다음 MM-DD" — 취소로 닫는다) → task_snoozed.
  //  - 그 밖의 취소는 처리가 아니다: 되돌리기가 취소한 파생 할 일("되돌리기")을 세면 다시 열린 할 일이 남은 행이
  //    "처리됨"으로 넘어가고, 손으로 한 취소는 연락한 것이 아니다. 계약에 취소 종류가 없어 흔적에서 뺀다.
  for (const task of input.closedTasksToday) {
    if (task.status !== "done" && task.status !== "canceled") continue
    const snoozed = isTodayContactSnoozeOutcome(task.outcome)
    if (task.status === "canceled" && !snoozed) continue
    const completedMs = timeOf(task.completedAt)
    if (completedMs == null || completedMs < todayStart) continue
    if (!taskQualifiesToday(task, task.dueAt, todayEnd)) continue
    const key = taskTargetKey(task)
    const row = ensure(key, () => makeTaskTargetRow(key, task))
    row.traces.push({
      kind: snoozed ? "task_snoozed" : "task_done",
      at: task.completedAt as string,
      by: trimOrNull(task.completedBy),
      source: "home",
      // 미룬 곳(이어받는 할 일)은 미래 할 일로 따로 잡혀 다음 연락(next)으로 채워진다.
      nextAt: null,
      approximate: false,
      reason: taskReason(task, task.dueAt, nowMs, todayStart, snoozed ? "미룸" : "완료"),
    })
    row.taskTypes.add(task.taskType)
    for (const ownerKey of lowerKeys([task.ownerKey, task.ownerNameSnapshot])) row.ownerKeys.add(ownerKey)
    if (!row.ownerName) row.ownerName = trimOrNull(task.ownerNameSnapshot)
  }

  // ── D. Compass 다음 액션 ──
  const compassFuture = (phoneKey: string | null): NextContactCandidate | null => {
    if (!phoneKey) return null
    const rep = compassRepByPhone.get(phoneKey)
    const ms = timeOf(rep?.next_action_at)
    if (!rep || ms == null || ms < todayEnd || !isOpenCompassAction(rep)) return null
    return { at: rep.next_action_at as string, kind: "compass_next_action", title: null }
  }

  // 14일 넘게 지난 열린 다음 액션 — 목록에 올리지 않고 담당 필터를 건 건수만(Compass 에서 정리). 목록 조회와 건수 전용
  // 조회 양쪽에 같은 행이 올 수 있어 id 로 한 번만 센다.
  const beyondIds = new Set<number>()
  const countBeyond = (row: CompassNextActionRow): boolean => {
    if (!isBeyondCompassLookback(row.next_action_at, nowMs, COMPASS_NEXT_ACTION_LOOKBACK_DAYS)) return false
    if (isOpenCompassAction(row) && matchCompassOwner(row, ownerFilter)) beyondIds.add(row.id)
    return true
  }
  for (const row of compass.beyondLookback ?? []) countBeyond(row)

  if (compass.dueActions) {
    // 목록에 올릴 다음 액션(열린 · 오늘 끝 전 · 14일 창 안)만 먼저 추린다 — 건수 전용 행(14일 넘음)은 여기서 센다.
    const listedDue: Array<{ due: CompassNextActionRow; dueMs: number; phoneKey: string | null }> = []
    for (const due of compass.dueActions) {
      if (!isOpenCompassAction(due)) continue
      const dueMs = timeOf(due.next_action_at)
      if (dueMs == null || dueMs >= todayEnd) continue
      if (countBeyond(due)) continue
      listedDue.push({ due, dueMs, phoneKey: contactPhoneKey(due.phone_key) })
    }

    // 할 일 등 다른 원천으로 이미 선 리드 행(종료 리드 등 — 진행 중 리드는 openLeadByPhone 이 맡는다) 중 기록 위치가
    // Compass 인 행 — 같은 전화의 다음 액션은 그 행에 붙인다. 따로 Compass 단독 행을 세우면 같은 Compass 리드를 여는 행이
    // 둘이 되고, Compass 통화 한 번이 두 행을 처리로 세어 진행률이 2 로 부푼다. 전환·NEO 등록 확정 리드(Home 기록 행)는
    // 붙이지 않는다(주 행동이 Home 기록이라 Compass 다음 액션을 대신 열 수 없다 — Compass 단독 행으로 따로 선다).
    // 같은 번호 리드 행이 여럿이면 최근 유입 1건(openLeadByPhone 과 같은 규칙).
    const dueHrefByPhone = new Map<string, string>()
    for (const { due, phoneKey } of listedDue) {
      if (phoneKey && !dueHrefByPhone.has(phoneKey)) dueHrefByPhone.set(phoneKey, compassLeadUrl(due.id))
    }
    const compassLeadRowByPhone = new Map<string, RowAcc>()
    for (const acc of rows.values()) {
      const phoneKey = acc.phoneKey
      if (acc.entityType !== "lead" || !acc.lead || !phoneKey) continue
      if (openLeadByPhone.has(phoneKey) || neoByPhone.has(phoneKey)) continue
      const href = acc.compass?.url ?? dueHrefByPhone.get(phoneKey) ?? null
      if (!href || !leadRowWritesToCompass(acc, href)) continue
      const current = compassLeadRowByPhone.get(phoneKey)
      const candidateLead = acc.lead
      const currentLead = current?.lead
      if (
        !current ||
        !currentLead ||
        inflowMs(candidateLead) > inflowMs(currentLead) ||
        (inflowMs(candidateLead) === inflowMs(currentLead) && candidateLead.id > currentLead.id)
      ) {
        compassLeadRowByPhone.set(phoneKey, acc)
      }
    }

    // Compass 단독 행(같은 전화의 Home 리드·NEO 계정 없음)은 **전화 키당 한 행**이다 — 한 학원이 같은 번호로 다시 문의해
    // Compass 리드가 여럿 쌓여도 두 행·진행률 2건으로 세지 않는다(리드·NEO 행과 같은 규칙). 대표는 360·리드 보드 칩이
    // 여는 행과 같게: 전화 키 대표(overlay.ts pickRepresentativeCompassRow)가 열린 액션이면 그 행, 아니면 이 창의 다음
    // 액션 행들 중 대표. 행 키는 `compass:<대표 id>` 형식을 유지한다(전화 키는 응답에 싣지 않는다).
    const compassOnlyDueByPhone = new Map<string, CompassNextActionRow[]>()
    for (const { due, phoneKey } of listedDue) {
      if (!phoneKey || openLeadByPhone.has(phoneKey) || neoByPhone.has(phoneKey) || compassLeadRowByPhone.has(phoneKey)) continue
      const list = compassOnlyDueByPhone.get(phoneKey)
      if (list) list.push(due)
      else compassOnlyDueByPhone.set(phoneKey, [due])
    }
    const compassOnlyKeyByPhone = new Map<string, string>()
    const makeCompassOnlyRow = (
      key: string,
      display: CompassNextActionRow,
      ref: CompassLeadIndexRow | CompassNextActionRow,
      phoneKey: string | null
    ): RowAcc => ({
      key,
      entityType: "compass_lead",
      entityId: String(ref.id),
      title: trimOrNull(display.academy) ?? trimOrNull(display.name) ?? "이름 없음",
      subtitle: trimOrNull(display.academy) && trimOrNull(display.name) ? trimOrNull(display.name) : null,
      ownerName: compassResponsibleName(ref) ?? compassResponsibleName(display),
      ownerKeys: new Set([...compassOwnerKeys(ref), ...compassOwnerKeys(display)]),
      reasons: [],
      traces: [],
      score: 0,
      severity: "low",
      isMetaLead: false,
      lead: null,
      phoneKey,
      homeContactKey: null,
      compass: compassRefFromIndexRow(ref),
      compassStages: new Set(),
      taskTypes: new Set(),
      openTaskIds: [],
      href: compassLeadUrl(ref.id),
      neoAsOf: null,
      homeSnoozeTrace: null,
    })
    const compassOnlyRow = (due: CompassNextActionRow, phoneKey: string | null): RowAcc => {
      if (!phoneKey) return ensure(`compass:${due.id}`, () => makeCompassOnlyRow(`compass:${due.id}`, due, due, null))
      const known = compassOnlyKeyByPhone.get(phoneKey)
      if (known) return rows.get(known) as RowAcc
      const group = compassOnlyDueByPhone.get(phoneKey) ?? [due]
      const dueRep = pickRepresentativeCompassRow(group) ?? due
      const indexRep = compassRepByPhone.get(phoneKey)
      const ref: CompassLeadIndexRow | CompassNextActionRow = indexRep && isOpenCompassAction(indexRep) ? indexRep : dueRep
      const display = group.find((row) => row.id === ref.id) ?? dueRep
      const key = `compass:${ref.id}`
      compassOnlyKeyByPhone.set(phoneKey, key)
      return ensure(key, () => makeCompassOnlyRow(key, display, ref, phoneKey))
    }

    for (const { due, dueMs, phoneKey } of listedDue) {
      const homeLead = phoneKey ? openLeadByPhone.get(phoneKey) : undefined
      const account = !homeLead && phoneKey ? neoByPhone.get(phoneKey) : undefined
      const leadRow = !homeLead && !account && phoneKey ? compassLeadRowByPhone.get(phoneKey) : undefined
      let row: RowAcc
      if (homeLead) {
        row = ensure(`lead:${homeLead.id}`, () => makeLeadRow(homeLead, leadItems.get(homeLead.id) ?? null))
      } else if (account) {
        row = ensure(`neo:${account.accountId}`, () => makeNeoRow(account, null))
      } else if (leadRow) {
        row = leadRow
      } else {
        row = compassOnlyRow(due, phoneKey)
      }
      const overdue = dueMs < todayStart
      row.reasons.push({
        kind: "compass_next_action",
        label: `Compass 다음 액션 · ${dueSuffix(dueMs, nowMs)}`,
        detail: truncateCompassNextActionText(due.next_action),
        dueAt: due.next_action_at,
        overdue,
        sourceRef: `compass:${due.id}`,
      })
      const stage = trimOrNull(due.stage)
      if (stage) row.compassStages.add(stage)
      for (const key of compassOwnerKeys(due)) row.ownerKeys.add(key)
      if (!row.ownerName) row.ownerName = compassResponsibleName(due)
      if (!row.compass) row.compass = compassRefFromIndexRow(due)
      const overdueDays = overdue ? Math.max(0, -kstDayDelta(dueMs, nowMs)) : 0
      const compassScore = overdue ? 70 + Math.min(10, overdueDays) : 62
      bumpScore(row, compassScore, overdue ? "high" : "medium")
    }
  }

  for (const { key, trace } of rescheduledTraces) rows.get(key)?.traces.push(trace)

  // ── E. 처리 흔적만 남은 리드(오늘 연락해 사유가 사라진 리드) — 추정 ──
  // 오늘 연락 "내일로"(리드 미루기)는 follow_up_at 만 내일 09:00 으로 옮기고 다른 흔적을 남기지 않는다. 계정 행의
  // 미루기('미룸'·'다음 일정 이동' 흔적)와 같은 의미로 세려면 여기서 재구성해야 한다 — 안 그러면 미룬 행이 다음 계산에서
  // 사유를 잃고 사라져 진행률(분모·처리)이 뒤로 간다. 다른 편집(담당 배정 등)으로 updated_at 만 바뀐 리드를 "처리"로
  // 세지 않게 **그 버튼이 쓰는 값과 정확히 같은 팔로업**(오늘 기준 내일 09:00 KST)일 때만, 추정(approximate)으로 싣는다.
  const snoozeFollowUpMs = timeOf(resolveTodayContactNextDueAt({ preset: "tomorrow_9" }, nowMs))
  const leadSnoozeTrace = (lead: LeadRecord): HandledTrace => ({
    kind: "rescheduled",
    at: lead.updated_at as string,
    by: null,
    source: "home",
    nextAt: lead.follow_up_at ?? null,
    approximate: true,
    reason: {
      kind: "follow_up",
      label: `팔로업 · 다음 ${todayContactMonthDay(lead.follow_up_at) ?? ""}`.trim(),
      detail: null,
      dueAt: lead.follow_up_at ?? null,
      overdue: false,
      sourceRef: `lead:${lead.id}`,
    },
  })
  for (const lead of input.leads) {
    if (lead.status !== "new" && lead.status !== "contacted") continue
    if (leadItems.get(lead.id) === null) continue // 엔진이 제외한 리드(테스트 등)
    const key = `lead:${lead.id}`
    const followMs = timeOf(lead.follow_up_at)
    const updatedMs = timeOf(lead.updated_at)
    const followMoved = followMs != null && followMs >= todayEnd && updatedMs != null && updatedMs >= todayStart
    const snoozedToday = followMoved && followMs === snoozeFollowUpMs
    const existing = rows.get(key)
    if (existing) {
      // 다른 사유(재문의·할 일 등)로 이미 선 행 — 계정 행의 '다음 일정 이동' 흔적처럼 붙인다(F 에서 Home 입력 행만 쓴다).
      if (snoozedToday) existing.homeSnoozeTrace = leadSnoozeTrace(lead)
      continue
    }
    const phoneKey = contactPhoneKey(lead.phone)
    const contact = lastContactFor(key, phoneKey)
    const contactMs = timeOf(contact?.at)
    if (!contact || contactMs == null || contactMs < todayStart) {
      if (snoozedToday) ensure(key, () => makeLeadRow(lead, null)).homeSnoozeTrace = leadSnoozeTrace(lead)
      continue
    }
    const clockMs = inflowMs(lead)
    const recentResponse =
      DIRECT_INBOUND_LEAD_SOURCES.has(lead.source) && clockMs > 0 && nowMs - clockMs <= TODAY_CONTACT_FIRST_RESPONSE_WINDOW_HOURS * HOUR_MS
    if (!recentResponse && !followMoved) continue
    if (lead.source === "meta_lead_ads" && !followMoved) {
      // 메타 리드의 첫 응답은 목록이 아니라 밴드로 간다 — Compass 에서 처리된 건 기한 재구성이 안 돼 분모에서 빼고 따로 센다.
      const owned = ownerFilter.size === 0 || lowerKeys([lead.assigned_to]).some((k) => ownerFilter.has(k))
      if (contact.source === "compass" && owned) compassHandledToday += 1
      continue
    }
    const row = ensure(key, () => makeLeadRow(lead, null))
    const reinflowed = hasInflowStamp(lead) && timeOf(lead.last_inflow_at) === clockMs
    const reason: TodayContactReason = followMoved
      ? {
          kind: "follow_up",
          label: `팔로업 · 다음 ${todayContactMonthDay(lead.follow_up_at) ?? ""}`.trim(),
          detail: null,
          dueAt: lead.follow_up_at ?? null,
          overdue: false,
          sourceRef: key,
        }
      : {
          kind: reinflowed ? "reinflow" : "first_response",
          label: reinflowed ? "재문의" : "첫 응답",
          detail: null,
          dueAt: reinflowed ? (lead.last_inflow_at ?? null) : lead.timestamp,
          overdue: false,
          sourceRef: key,
        }
    row.traces.push({
      kind: contact.source === "compass" ? "compass_activity" : "contact_logged",
      at: contact.at,
      by: contact.actor,
      source: contact.source === "compass" ? "compass" : "home",
      nextAt: null,
      approximate: true,
      reason,
    })
  }

  // ── F. 행 마감: 처리 판정·다음 연락·제외·레인 ──
  interface Finished {
    row: TodayContactRow
    pending: boolean
    meta: boolean
    orgKey: string | null
  }
  const finished: Finished[] = []
  const bySourceAll: Record<TodayContactReasonKind, number> = Object.fromEntries(
    TODAY_CONTACT_REASON_KINDS.map((kind) => [kind, 0])
  ) as Record<TodayContactReasonKind, number>

  for (const acc of rows.values()) {
    const homeFact = acc.homeContactKey ? homeContacts?.get(acc.homeContactKey) : null
    const compassFact = acc.phoneKey ? compass.latestContacts?.get(acc.phoneKey) : null
    const lastContact = pickLatestContact(homeFact, compassFact)

    // 다음 연락(오늘 끝 이후만) — 팔로업·할 일·Compass 다음 액션 중 가장 이른 것.
    const nextCandidates: NextContactCandidate[] = [...(futureByKey.get(acc.key) ?? [])]
    const compassNext = compassFuture(acc.phoneKey)
    if (compassNext) nextCandidates.push(compassNext)
    const next = pickNextContact(nextCandidates)

    // 주 행동 — 처리 흔적 판정(리드 미루기 흔적은 Home 입력 행에서만)에 먼저 쓴다.
    let primaryAction: TodayContactPrimaryAction
    if (acc.entityType === "compass_lead") primaryAction = "open_compass"
    else if (acc.entityType === "lead") {
      // 전환·NEO 등록 확정 리드는 Compass 매칭이 있어도 Home 기록(record_outcome_lead, 규칙 3 — leadRowWritesToCompass).
      // 행의 compass 참조는 그대로 두어 화면이 보조 링크로 쓸 수 있다.
      primaryAction = leadRowWritesToCompass(acc, acc.compass?.url ?? null) ? "open_compass" : "record_outcome_lead"
    }
    else if (acc.entityType === "task") primaryAction = "complete_task"
    else primaryAction = "record_outcome"

    // 리드 "내일로" 흔적은 그 버튼이 있는 Home 입력 행에서만 처리로 센다(Compass 매칭 리드는 Compass 에서 미룬다).
    const traces =
      acc.homeSnoozeTrace && primaryAction === "record_outcome_lead" ? [...acc.traces, acc.homeSnoozeTrace] : acc.traces

    // Compass 에서 기록하는 행(open_compass)에 할 일 말고 다른 대기 사유(Compass 다음 액션·첫 응답·팔로업·재문의 등)가
    // 남아 있으면, Home 할 일 흔적(완료·미룸·다음 일정 이동)만으로 처리됨이 되지 않는다 — 그 사유는 Compass 에서 연락해야
    // 풀린다. 세그먼트 할 일을 Home 에서 미뤘다고 오늘 Compass 다음 액션이 "처리됨"으로 넘어가면 진행률이 부풀고 할 일이
    // 목록에서 사라진다. 이런 행은 Home 연락 기록(homeFact)·Compass 사람 활동(compassFact)만 처리로 센다.
    // 사유가 할 일뿐인 행(종료 리드의 할 일 등)은 전처럼 할 일 흔적으로 처리됨이 될 수 있다.
    const compassOwnsPending =
      primaryAction === "open_compass" && acc.reasons.some((reason) => reason.kind !== "task")
    const handledTraces = compassOwnsPending
      ? traces.filter((trace) => trace.kind === "contact_logged" || trace.kind === "compass_activity")
      : traces
    // 같은 이유로 그런 행에서는 Home 할 일 일정(미룬 할 일·이어받은 내일 할 일 등)이 약한 사유(첫 응답) 제외에도 쓰이지
    // 않는다 — 처리로 세지 않은 Home 할 일을 미뤘다는 이유만으로, Compass 에서 아무도 연락하지 않은 첫 응답이 목록과
    // 진행률 분모에서 빠지면 안 된다. Compass 다음 액션·팔로업 일정은 그대로 제외 근거가 된다. 화면의 다음 연락(next)은
    // 할 일을 포함한 그대로 보여 준다.
    const exclusionNext = compassOwnsPending
      ? pickNextContact(nextCandidates.filter((candidate) => candidate.kind !== "task"))
      : next

    // 처리 판정(오늘 KST) — Home 연락 > Compass 사람 활동 > 오늘 닫은/미룬 할 일 > 다음 일정 이동.
    let handled: TodayContactHandled | null = null
    const homeMs = timeOf(homeFact?.at)
    const compassMs = timeOf(compassFact?.at)
    if (homeFact && homeMs != null && homeMs >= todayStart) {
      handled = {
        kind: "contact_logged",
        at: homeFact.at,
        by: homeFact.actor,
        source: "home",
        nextAt: next?.at ?? null,
        approximate: false,
      }
    } else if (compassFact && compassMs != null && compassMs >= todayStart) {
      handled = {
        kind: "compass_activity",
        at: compassFact.at,
        by: compassFact.actor,
        source: "compass",
        nextAt: next?.at ?? null,
        approximate: false,
      }
    } else if (handledTraces.length > 0) {
      const precedence: Record<TodayContactHandledKind, number> = {
        contact_logged: 0,
        compass_activity: 1,
        task_done: 2,
        task_snoozed: 3,
        rescheduled: 4,
      }
      const trace = [...handledTraces].sort(
        (a, b) => precedence[a.kind] - precedence[b.kind] || (timeOf(b.at) ?? 0) - (timeOf(a.at) ?? 0)
      )[0]
      handled = {
        kind: trace.kind,
        at: trace.at,
        by: trace.by,
        source: trace.source,
        nextAt: trace.nextAt ?? next?.at ?? null,
        approximate: trace.approximate,
      }
    }

    const pendingReasons = acc.reasons
    const hasPending = pendingReasons.length > 0
    // 처리 흔적만 있는 행은 흔적의 사유로 선다.
    const baseReasons = hasPending ? pendingReasons : traces.map((trace) => trace.reason)
    if (baseReasons.length === 0) continue
    // 처리 흔적만 있는데 오늘 처리로 판정되지 않으면(흔적 없음) 행을 만들지 않는다.
    if (!hasPending && !handled) continue

    // 미래 다음 일정이 있는 엔진 추천(약한 사유)뿐인 행은 뺀다 — 단 오늘 처리한 행은 진행률에 남긴다.
    // Compass 가 맡은 사유가 남은 행은 Home 할 일 일정을 뺀 다음 일정(exclusionNext)으로만 판단한다.
    if (!handled && exclusionNext && pendingReasons.every((reason) => WEAK_REASON_KINDS.has(reason.kind))) continue

    const reasons = collapseReasons(baseReasons)
    const kinds = new Set(reasons.map((reason) => reason.kind))

    // 레인 — 돈(계정 사유·계정/고객/딜 대상·연장/견적 할 일) → 다시 움직임(약속·재방문·데모·재문의·팔로업·할 일·
    // Compass 진행 단계) → 신규 응대.
    let lane: TodayCallSlotKey = "new_response"
    const isMoneyEntity = acc.entityType === "neo_account" || acc.entityType === "customer" || acc.entityType === "deal"
    if ([...kinds].some((kind) => MONEY_REASON_KINDS.has(kind)) || isMoneyEntity || [...acc.taskTypes].some((type) => MONEY_TASK_TYPES.has(type))) {
      lane = "money"
    } else if (
      [...kinds].some((kind) => REENGAGE_REASON_KINDS.has(kind)) ||
      [...acc.compassStages].some((stage) => !COMPASS_EARLY_STAGES.has(stage))
    ) {
      lane = "reengage"
    }

    const head = reasons[0]
    const row: TodayContactRow = {
      key: acc.key,
      entityType: acc.entityType,
      entityId: acc.entityId,
      title: acc.title,
      subtitle: acc.subtitle,
      ownerName: acc.ownerName,
      ownerKeys: [...acc.ownerKeys].sort(),
      lane,
      laneLabel: LANE_LABEL[lane],
      severity: acc.severity,
      score: acc.score,
      reasons,
      dueAt: head?.dueAt ?? null,
      overdue: hasPending ? reasons.some((reason) => reason.overdue) : false,
      groupedCount: 1,
      isMetaLead: acc.isMetaLead,
      lastContact: lastContact
        ? {
            at: lastContact.at,
            source: lastContact.source,
            channelLabel: lastContactChannelLabel(lastContact.source, lastContact.channel),
            actor: lastContact.actor,
          }
        : null,
      nextContact: next ? { at: next.at, kind: next.kind } : null,
      compass: acc.compass,
      primaryAction,
      openTaskIds: [...new Set(acc.openTaskIds)],
      handled,
      href: acc.href,
      neoAsOf: acc.neoAsOf,
    }

    const meta = hasPending && acc.isMetaLead && pendingReasons.every((reason) => reason.kind === "first_response")
    if (meta && handled) {
      // 처리된 메타 첫 응답 — 밴드에도 목록에도 두지 않는다(기한 재구성 불가). Compass 처리는 따로 센다.
      const owned = ownerFilter.size === 0 || row.ownerKeys.some((key) => ownerFilter.has(key))
      if (handled.source === "compass" && owned) compassHandledToday += 1
      continue
    }
    const orgKey =
      lane === "new_response" && acc.entityType === "lead" && pendingReasons.every((reason) => reason.kind === "first_response")
        ? (trimOrNull(acc.lead?.org)?.toLowerCase().replace(/\s+/g, "") ?? null)
        : null
    finished.push({ row, pending: !handled, meta, orgKey: orgKey && orgKey.length > 1 ? orgKey : null })
  }

  // ── G. 담당 목록(필터 전) · 담당 필터 ──
  const ownerCounts = new Map<string, number>()
  for (const entry of finished) {
    const name = trimOrNull(entry.row.ownerName)
    if (!name || entry.meta) continue
    ownerCounts.set(name, (ownerCounts.get(name) ?? 0) + 1)
  }
  const owners = [...ownerCounts.entries()]
    .map(([ownerName, count]) => ({ ownerName, count }))
    .sort((a, b) => b.count - a.count || a.ownerName.localeCompare(b.ownerName, "ko"))

  const scoped = ownerFilter.size === 0
    ? finished
    : finished.filter((entry) => entry.row.ownerKeys.some((key) => ownerFilter.has(key)))

  // ── H. 메타 밴드 ──
  const metaEntries = scoped
    .filter((entry) => entry.meta)
    .sort((a, b) => b.row.score - a.row.score || (timeOf(a.row.dueAt) ?? 0) - (timeOf(b.row.dueAt) ?? 0))
  const meta: CrmTodayContacts["meta"] = {
    total: metaEntries.length,
    today: metaEntries.filter((entry) => (timeOf(entry.row.dueAt) ?? 0) >= todayStart).length,
    top: metaEntries.slice(0, TODAY_CONTACT_META_TOP).map(({ row }) => ({
      key: row.key,
      title: row.title,
      dueAt: row.dueAt,
      href: row.href,
      compass: row.compass,
    })),
  }

  // ── I. 같은 기관 접기(신규 응대 · 첫 응답뿐인 리드) ──
  const listed = scoped.filter((entry) => !entry.meta)
  const compareInLane = (a: TodayContactRow, b: TodayContactRow) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    const aTime = reasonRankTime(a.reasons[0])
    const bTime = reasonRankTime(b.reasons[0])
    if (aTime !== bTime) return aTime - bTime
    if (a.score !== b.score) return b.score - a.score
    return a.title.localeCompare(b.title, "ko") || a.key.localeCompare(b.key)
  }
  const pendingByLane: Record<TodayCallSlotKey, TodayContactRow[]> = { new_response: [], money: [], reengage: [] }
  const handledRows: TodayContactRow[] = []
  const orgSeen = new Map<string, TodayContactRow>()
  const sortedPending = listed.filter((entry) => entry.pending).sort((a, b) => compareInLane(a.row, b.row))
  for (const entry of sortedPending) {
    if (entry.orgKey) {
      const head = orgSeen.get(entry.orgKey)
      if (head) {
        head.groupedCount += 1
        continue
      }
      orgSeen.set(entry.orgKey, entry.row)
    }
    pendingByLane[entry.row.lane].push(entry.row)
  }
  for (const entry of listed) if (!entry.pending) handledRows.push(entry.row)
  handledRows.sort((a, b) => (timeOf(b.handled?.at) ?? 0) - (timeOf(a.handled?.at) ?? 0) || a.key.localeCompare(b.key))

  // ── J. 끼워 넣기 순서(2·2·1 쿼터 = 정렬 패턴, 상한 아님) ──
  const pattern = todayContactLanePattern()
  const queues: Record<TodayCallSlotKey, TodayContactRow[]> = {
    new_response: [...pendingByLane.new_response],
    money: [...pendingByLane.money],
    reengage: [...pendingByLane.reengage],
  }
  const ordered: TodayContactRow[] = []
  const remainingCount = () => queues.new_response.length + queues.money.length + queues.reengage.length
  while (remainingCount() > 0) {
    for (const lane of pattern) {
      if (remainingCount() === 0) break
      const source = queues[lane].length > 0 ? lane : LANE_FALLBACK_ORDER.find((fallback) => queues[fallback].length > 0)
      if (!source) break
      ordered.push(queues[source].shift() as TodayContactRow)
    }
  }

  // ── K. 진행률·집계 ──
  // 진행률 분모는 **연락할 대상 수**다 — 같은 기관으로 접은 리드(groupedCount)도 센다. 행 수로 세면 대표를 처리할 때마다
  // 다음 리드가 새 대표로 올라와 분모가 늘고 남은 수는 줄지 않는다(처리 전후 분모가 달라진다).
  // counts.bySource 는 **행 수**다(가중 없음) — 화면 원천 칩이 "칩을 누르면 보이는 행 수"로 쓰므로(잘렸을 때도 자르기 전
  // 행 수), 접힌 리드까지 세면 칩 수가 눌러 보이는 행보다 커진다. 접힌 리드 수는 행의 groupedCount 로 따로 보인다.
  const pendingRows = ordered
  const byLane: CrmTodayContacts["progress"]["byLane"] = {
    new_response: { total: 0, handled: 0 },
    money: { total: 0, handled: 0 },
    reengage: { total: 0, handled: 0 },
  }
  const pendingWeight = (row: TodayContactRow) => Math.max(1, row.groupedCount)
  for (const row of pendingRows) byLane[row.lane].total += pendingWeight(row)
  for (const row of handledRows) {
    byLane[row.lane].total += 1
    byLane[row.lane].handled += 1
  }
  for (const row of [...pendingRows, ...handledRows]) {
    for (const kind of new Set(row.reasons.map((reason) => reason.kind))) bySourceAll[kind] += 1
  }
  const remaining = pendingRows.reduce((sum, row) => sum + pendingWeight(row), 0)
  const total = remaining + handledRows.length

  const allRows = includeHandled ? [...pendingRows, ...handledRows] : pendingRows
  const truncatedRows = allRows.length > limit

  // 건수 전용 조회만 실패했거나 잘렸으면 "14일 넘음" 건수를 모르거나 하한이다 — 0 과 구분해 partial 로 알린다.
  const beyondUnknown = compass.dueActions != null && compass.beyondLookback === null
  const beyondPartial = compass.dueActions != null && compass.beyondLookbackTruncated === true
  const listPartial =
    compass.leadIndex == null ||
    compass.latestContacts == null ||
    compass.dueTruncated === true ||
    compass.leadIndexTruncated === true ||
    compass.latestTruncated === true
  const compassStatus: CrmTodayContacts["sources"]["compass"] =
    compass.dueActions == null ? "down" : listPartial || beyondUnknown || beyondPartial ? "partial" : "ok"

  const warnings = [...(input.warnings ?? [])]
  if (homeContacts == null) warnings.push("Home 연락 기록을 읽지 못해 오늘 처리 여부가 일부 빠졌습니다.")
  if (!input.sources.closedTasksOk) warnings.push("오늘 닫은 할 일을 읽지 못해 진행률이 낮게 보일 수 있습니다.")
  if (compassStatus === "down") {
    warnings.push("Compass 연결 끊김 — Compass 다음 액션이 빠졌습니다(0건이 아닙니다).")
  } else {
    if (compass.leadIndex == null) warnings.push("Compass 리드 매칭을 확인하지 못해 리드 행이 Home 입력으로 보입니다.")
    else if (listPartial) warnings.push("Compass 원천 일부만 반영했습니다.")
    if (beyondUnknown) warnings.push("14일 넘게 지난 Compass 다음 액션 건수를 세지 못했습니다(0건이 아닙니다).")
    else if (beyondPartial) warnings.push("14일 넘게 지난 Compass 다음 액션이 많아 일부만 셌습니다.")
  }
  if (input.neoSync.stale) warnings.push("NEO 동기화가 멈춰 계정 만료·잔액 값이 오래됐을 수 있습니다.")

  return {
    generatedAt: now.toISOString(),
    dateKey: todayContactDateKey(nowMs),
    progress: {
      total,
      handled: handledRows.length,
      remaining,
      overdue: pendingRows.filter((row) => row.overdue).length,
      byLane,
      compassHandledToday,
      approximate: true,
    },
    counts: {
      bySource: bySourceAll,
      compassOverdueBeyondLookback: beyondIds.size,
    },
    rows: truncatedRows ? allRows.slice(0, limit) : allRows,
    meta,
    owners,
    sources: {
      leadsOk: input.sources.leadsOk,
      neoAccountsOk: input.sources.neoAccountsOk,
      tasksOk: input.sources.tasksOk,
      homeContactsOk: homeContacts != null,
      compass: compassStatus,
      neoSync: { latestSyncedAt: input.neoSync.latestSyncedAt, stale: input.neoSync.stale },
      warnings: [...new Set(warnings)],
    },
    truncated: { rows: truncatedRows, limit, totalRows: allRows.length },
  }
}
