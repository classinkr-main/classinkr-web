"use client"

// 현황 "오늘 연락"(C안 ①) 행 안 연락 결과 폼 — 옛 CrmPriorityQueuePanel(1124-1256)의 리드 전용 폼을
// 추출·일반화했다. 채널 → 결과(콜·문자만) → 다음 일정(내일 09:00 · 3일 뒤 10:00 · 다음 주 월 10:00 · 날짜) →
// 메모 순서이고, 저장은 POST /api/admin/crm/home/today-contacts/outcome 한 번이다(계약: lib/crm/today-contact-types.ts).
//
// 누가 이 폼을 쓰나(A안 원칙):
//  - record_outcome: NEO 계정·전환 고객·딜 — Home 기록(crm_customer_events) + 다음 일정 할 일(crm_tasks).
//  - record_outcome_lead: Compass 에 매칭되지 않은 Home 리드 — 서버가 리드 연락 로그 + follow_up_at.
//  - Compass 에 매칭된 리드·Compass 전용 행은 이 폼을 열지 않는다("Compass에서 열기"만 — 교차 쓰기 0).
//
// 폼은 완전 제어형이다 — 초안 상태·버리기 확인·저장 흐름은 패널(CrmTodayContactsPanel)이 쥔다.
// 아래 순수 헬퍼는 테스트(tests/crm/today-contact-outcome-form.test.tsx)가 고정한다.

import type { ContactLogResult, ContactLogType } from "@/lib/supabase/database.types"
import type {
  TodayContactNextSchedule,
  TodayContactOutcomeRequest,
  TodayContactOutcomeTargetType,
  TodayContactRow,
} from "@/lib/crm/today-contact-types"
import { STATUS_TONE_CLASS, STATUS_TONE_TEXT_STRONG_CLASS } from "@/lib/crm/status-tone"
import { INTERACTIVE_TEXT_CLASS, SECONDARY_TEXT_CLASS } from "./shared"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
/** 서버 contact-log 규약과 같은 메모 상한(계약: memo ≤500자). */
export const OUTCOME_MEMO_MAX = 500
/** 한 번에 함께 닫을 수 있는 할 일 상한(계약: closeTaskIds ≤10). */
export const OUTCOME_CLOSE_TASK_LIMIT = 10

// ─── 어휘(기존 enum 그대로 — 결정 기본값) ─────────────────────────────────

export const TODAY_CONTACT_CHANNELS: readonly ContactLogType[] = ["call", "sms", "kakao", "email"]
export const TODAY_CONTACT_CHANNEL_LABEL: Record<ContactLogType, string> = {
  call: "콜",
  sms: "문자",
  kakao: "카톡",
  email: "이메일",
}

export const TODAY_CONTACT_RESULTS: readonly ContactLogResult[] = ["answered", "no_answer", "callback", "meeting_set"]
export const TODAY_CONTACT_RESULT_LABEL: Record<ContactLogResult, string> = {
  answered: "연결됨",
  no_answer: "부재",
  callback: "콜백 요청",
  meeting_set: "미팅 확정",
}

/** 결과는 콜·문자만 갖는다(lib/crm/contact-log.ts CONTACT_LOG_RESULT_CHANNELS 와 같은 표 — 클라이언트 번들에 서버 타입만 끌지 않도록 값으로 둔다). */
export function outcomeChannelCarriesResult(channel: ContactLogType): boolean {
  return channel === "call" || channel === "sms"
}

export type OutcomeNextChoice = "tomorrow_9" | "in3_10" | "next_monday_10" | "date" | "none"

export const OUTCOME_NEXT_CHOICES: ReadonlyArray<{ key: OutcomeNextChoice; label: string }> = [
  { key: "tomorrow_9", label: "내일 09:00" },
  { key: "in3_10", label: "3일 뒤 10:00" },
  { key: "next_monday_10", label: "다음 주 월 10:00" },
  { key: "date", label: "날짜" },
  { key: "none", label: "없음" },
]

export interface TodayContactOutcomeDraft {
  rowKey: string
  channel: ContactLogType
  /** 콜·문자에서만 의미가 있다 — 고르기 전(null)에는 저장을 막는다(기본값 "연결됨"으로 통계가 부풀지 않게). */
  result: ContactLogResult | null
  memo: string
  next: OutcomeNextChoice
  /** next === "date" 일 때 KST YYYY-MM-DD */
  nextDate: string
  /** 사용자가 다음 일정을 직접 골랐는가 — 고르기 전에는 결과에 맞춰 추천값을 따라간다 */
  nextTouched: boolean
  /** 이 행의 열린 할 일을 함께 완료할지(열린 할 일이 있을 때만 의미) */
  closeTasks: boolean
}

export function createOutcomeDraft(rowKey: string): TodayContactOutcomeDraft {
  return {
    rowKey,
    channel: "call",
    result: null,
    memo: "",
    next: "tomorrow_9",
    nextDate: "",
    nextTouched: false,
    closeTasks: true,
  }
}

/** 작성 중 입력이 있는가 — 기본값에서 하나라도 바뀌었으면 닫기 전에 묻는다(UX 규약 1). */
export function isOutcomeDraftDirty(draft: TodayContactOutcomeDraft | null): boolean {
  if (!draft) return false
  const base = createOutcomeDraft(draft.rowKey)
  return (
    draft.memo.trim() !== "" ||
    draft.channel !== base.channel ||
    draft.result !== base.result ||
    draft.next !== base.next ||
    draft.nextDate !== base.nextDate ||
    draft.closeTasks !== base.closeTasks
  )
}

/** 결과별 다음 일정 추천(목업 SUGGEST 의 기존 enum 판) — 사용자가 다음 일정을 직접 고르면 따라가지 않는다. */
export function suggestNextForResult(result: ContactLogResult | null): OutcomeNextChoice | null {
  if (result === "no_answer" || result === "callback") return "tomorrow_9"
  if (result === "answered") return "in3_10"
  if (result === "meeting_set") return "none"
  return null
}

/** 결과를 바꾼다 — 다음 일정을 아직 건드리지 않았으면 추천값으로 따라간다. */
export function applyOutcomeResult(draft: TodayContactOutcomeDraft, result: ContactLogResult): TodayContactOutcomeDraft {
  const suggested = draft.nextTouched ? null : suggestNextForResult(result)
  return { ...draft, result, ...(suggested ? { next: suggested } : {}) }
}

/** 채널을 바꾼다 — 결과가 없는 채널(카톡·이메일)로 가면 결과를 비운다. */
export function applyOutcomeChannel(draft: TodayContactOutcomeDraft, channel: ContactLogType): TodayContactOutcomeDraft {
  return { ...draft, channel, result: outcomeChannelCarriesResult(channel) ? draft.result : null }
}

// ─── KST 날짜 계산(표시·"날짜" 선택 → dueAt) ──────────────────────────────

interface KstParts {
  year: number
  month: number
  date: number
  weekday: number
}

function kstParts(ms: number): KstParts {
  const shifted = new Date(ms + KST_OFFSET_MS)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), date: shifted.getUTCDate(), weekday: shifted.getUTCDay() }
}

function kstInstantIso(base: KstParts, dayOffset: number, hour: number): string {
  return new Date(Date.UTC(base.year, base.month, base.date + dayOffset, hour, 0, 0) - KST_OFFSET_MS).toISOString()
}

/** KST 오늘 날짜 키(YYYY-MM-DD) — 날짜 입력의 min. */
export function kstDateKey(ms: number): string {
  const shifted = new Date(ms + KST_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const d = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * 프리셋 → 실제 시각(ISO). 서버(outcome 라우트)가 같은 규칙으로 다시 계산한다 — 여기 값은 화면 표기와
 * 낙관 반영("→ 다음 09/28")에만 쓴다. 영업일 보정 없음(결정 기본값).
 *  - tomorrow_9: 내일 09:00 KST · in3_10: +3일 10:00 KST · next_monday_10: 다음 주 월 10:00 KST(오늘이 월요일이면 +7일)
 */
export function resolveNextPresetAt(preset: "tomorrow_9" | "in3_10" | "next_monday_10", nowMs: number): string {
  const today = kstParts(nowMs)
  if (preset === "tomorrow_9") return kstInstantIso(today, 1, 9)
  if (preset === "in3_10") return kstInstantIso(today, 3, 10)
  const daysUntilMonday = (1 - today.weekday + 7) % 7 || 7
  return kstInstantIso(today, daysUntilMonday, 10)
}

/** "YYYY-MM-DD"(KST) → 그날 10:00 KST ISO. 형식이 틀리면 null. */
export function kstDateKeyToDueAt(dateKey: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const date = Number(match[3])
  const ms = Date.UTC(year, month, date, 10, 0, 0) - KST_OFFSET_MS
  const check = new Date(ms + KST_OFFSET_MS)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== date) return null
  return new Date(ms).toISOString()
}

/** 초안의 다음 일정 → 요청 계약 값(null = 다음 일정 만들지 않음 · 리드는 팔로업 그대로). */
export function outcomeNextSchedule(draft: Pick<TodayContactOutcomeDraft, "next" | "nextDate">): TodayContactNextSchedule | null {
  if (draft.next === "none") return null
  if (draft.next === "date") {
    const dueAt = kstDateKeyToDueAt(draft.nextDate)
    return dueAt ? { dueAt } : null
  }
  return { preset: draft.next }
}

/** 다음 일정의 실제 시각(표기용). */
export function outcomeNextAt(draft: Pick<TodayContactOutcomeDraft, "next" | "nextDate">, nowMs: number): string | null {
  const schedule = outcomeNextSchedule(draft)
  if (!schedule) return null
  return "preset" in schedule ? resolveNextPresetAt(schedule.preset, nowMs) : schedule.dueAt
}

/**
 * "날짜" 다음 일정에 고를 수 있는 가장 이른 날(KST YYYY-MM-DD) — 날짜 입력의 min.
 * "날짜"는 그날 10:00 KST 로 저장되므로, 오늘 10:00 이 이미 지났으면 내일부터다(서버는 지난 시각을 400 으로 거절).
 */
export function earliestOutcomeDateKey(nowMs: number): string {
  const todayKey = kstDateKey(nowMs)
  const todayDue = kstDateKeyToDueAt(todayKey)
  if (todayDue && Date.parse(todayDue) > nowMs) return todayKey
  return kstDateKey(nowMs + 24 * 60 * 60 * 1000)
}

/** "날짜" 다음 일정의 문제 — 고르지 않음(missing) · 이미 지난 시각(past) · 없음(null). "날짜"가 아니면 null. */
export function outcomeDateProblem(
  draft: Pick<TodayContactOutcomeDraft, "next" | "nextDate">,
  nowMs: number
): "missing" | "past" | null {
  if (draft.next !== "date") return null
  const dueAt = kstDateKeyToDueAt(draft.nextDate)
  if (!dueAt) return "missing"
  // 서버(outcome 라우트)는 지난 시각을 거절한다 — 오늘을 골랐어도 10:00 이 지났으면 저장을 막는다.
  if (Date.parse(dueAt) <= nowMs) return "past"
  return null
}

/** 저장 가능한가 — 콜·문자는 결과 필수, "날짜"는 지금 이후 시각(그날 10:00 KST)이 되는 날짜 필수. */
export function isOutcomeDraftReady(draft: TodayContactOutcomeDraft, nowMs: number): boolean {
  if (outcomeChannelCarriesResult(draft.channel) && !draft.result) return false
  if (outcomeDateProblem(draft, nowMs)) return false
  return true
}

/** "09/28 (월) 10:00" — KST 고정. */
export function formatKstMonthDayTime(iso: string | null | undefined): string {
  if (!iso) return "-"
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return "-"
  const parts = kstParts(ms)
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parts.weekday]
  const shifted = new Date(ms + KST_OFFSET_MS)
  const hh = String(shifted.getUTCHours()).padStart(2, "0")
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0")
  return `${String(parts.month + 1).padStart(2, "0")}/${String(parts.date).padStart(2, "0")} (${weekday}) ${hh}:${mm}`
}

/** "09/28" — KST 고정. */
export function formatKstMonthDay(iso: string | null | undefined): string {
  if (!iso) return "-"
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return "-"
  const parts = kstParts(ms)
  return `${String(parts.month + 1).padStart(2, "0")}/${String(parts.date).padStart(2, "0")}`
}

// ─── 요청 조립 ─────────────────────────────────────────────────────────

type OutcomeRowLike = Pick<TodayContactRow, "key" | "entityType" | "entityId" | "title" | "primaryAction" | "reasons" | "openTaskIds">

/** 행 → 결과 기록 대상. 결과를 Home 에 쓸 수 없는 행(Compass 행·대상 없는 할 일)은 null. */
export function outcomeTargetFor(row: OutcomeRowLike): { type: TodayContactOutcomeTargetType; id: string; label: string } | null {
  if (row.primaryAction === "record_outcome_lead") {
    return row.entityType === "lead" ? { type: "lead", id: row.entityId, label: row.title } : null
  }
  if (row.primaryAction !== "record_outcome") return null
  if (row.entityType === "neo_account" || row.entityType === "customer" || row.entityType === "deal") {
    return { type: row.entityType, id: row.entityId, label: row.title }
  }
  return null
}

/**
 * NEO 계정 행 다음 일정 기본 제목(결정 기본값 — 사유 기반):
 * 만료 사유가 이미 지난 만료(회복)면 "만료 회복 연락", 다가오는 만료면 "연장 제안 후속",
 * 잔액·충전 사유면 "재충전 안내 후속", 그 밖은 "재연락".
 */
export function defaultOutcomeNextTitle(row: Pick<TodayContactRow, "reasons">, nowMs: number): string {
  const expiry = row.reasons.find((reason) => reason.kind === "account_expiry")
  if (expiry) {
    const dueMs = expiry.dueAt ? Date.parse(expiry.dueAt) : Number.NaN
    const recovering = expiry.label.includes("회복") || (Number.isFinite(dueMs) && dueMs < nowMs)
    return recovering ? "만료 회복 연락" : "연장 제안 후속"
  }
  if (row.reasons.some((reason) => reason.kind === "account_balance")) return "재충전 안내 후속"
  return "재연락"
}

export function buildTodayContactOutcomeRequest(input: {
  row: OutcomeRowLike
  draft: TodayContactOutcomeDraft
  requestId: string
  nowMs: number
}): TodayContactOutcomeRequest | null {
  const target = outcomeTargetFor(input.row)
  if (!target) return null
  const { draft } = input
  const memo = draft.memo.trim().slice(0, OUTCOME_MEMO_MAX)
  const next = outcomeNextSchedule(draft)
  const request: TodayContactOutcomeRequest = {
    requestId: input.requestId,
    mode: "contact",
    target,
    channel: draft.channel,
    result: outcomeChannelCarriesResult(draft.channel) ? draft.result : null,
    next,
  }
  if (memo) request.memo = memo
  if (next && target.type !== "lead") request.nextTitle = defaultOutcomeNextTitle(input.row, input.nowMs)
  if (draft.closeTasks && input.row.openTaskIds.length > 0) {
    request.closeTaskIds = input.row.openTaskIds.slice(0, OUTCOME_CLOSE_TASK_LIMIT)
  }
  return request
}

/** "미루기" — 연락 기록 없이 다음 일정만 내일 09:00 로(리드는 follow_up_at, 그 밖은 할 일). */
export function buildTodayContactSnoozeRequest(input: {
  row: OutcomeRowLike
  requestId: string
  nowMs: number
}): TodayContactOutcomeRequest | null {
  const target = outcomeTargetFor(input.row)
  if (!target) return null
  const request: TodayContactOutcomeRequest = {
    requestId: input.requestId,
    mode: "snooze",
    target,
    next: { preset: "tomorrow_9" },
  }
  if (target.type !== "lead") request.nextTitle = defaultOutcomeNextTitle(input.row, input.nowMs)
  return request
}

/** 처리된 행 접힘 문구 — "콜 · 부재 → 다음 09/28". */
export function formatOutcomeSummary(
  draft: Pick<TodayContactOutcomeDraft, "channel" | "result">,
  nextAt: string | null,
  options: { lead?: boolean } = {}
): string {
  const head = [TODAY_CONTACT_CHANNEL_LABEL[draft.channel], draft.result ? TODAY_CONTACT_RESULT_LABEL[draft.result] : null]
    .filter(Boolean)
    .join(" · ")
  if (nextAt) return `${head} → 다음 ${formatKstMonthDay(nextAt)}`
  return `${head} · ${options.lead ? "팔로업 그대로" : "다음 일정 없음"}`
}

// ─── 화면 ─────────────────────────────────────────────────────────────

function choiceClass(selected: boolean) {
  // 밀집 화면의 선택 상태는 선·글자색으로(DESIGN.md 어드민 라벨 단순화) — 채움은 쓰지 않는다.
  return selected
    ? "border-[#084734] text-[#084734] font-semibold"
    : `border-[#E5E5E0] ${INTERACTIVE_TEXT_CLASS} hover:border-[#A39E98]`
}

const CHIP_BASE =
  "inline-flex min-h-9 items-center gap-1 rounded-md border bg-white px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"

export interface TodayContactOutcomeFormProps {
  row: Pick<TodayContactRow, "key" | "title" | "primaryAction" | "openTaskIds">
  draft: TodayContactOutcomeDraft
  onChange: (next: TodayContactOutcomeDraft) => void
  onSubmit: () => void
  onCancel: () => void
  pending: boolean
  /** 프리셋 날짜 표기 기준 시각(응답 generatedAt) — 렌더 중 Date.now() 를 부르지 않는다. */
  basisMs: number
  formId: string
  /** 작성 중 초안을 버리기 전 확인(패널의 guardDraft 가 연다) */
  discardPrompt?: { onKeep: () => void; onDiscard: () => void } | null
}

export default function TodayContactOutcomeForm({
  row,
  draft,
  onChange,
  onSubmit,
  onCancel,
  pending,
  basisMs,
  formId,
  discardPrompt = null,
}: TodayContactOutcomeFormProps) {
  const isLead = row.primaryAction === "record_outcome_lead"
  const carriesResult = outcomeChannelCarriesResult(draft.channel)
  const ready = isOutcomeDraftReady(draft, basisMs)
  const dateProblem = outcomeDateProblem(draft, basisMs)
  const suggested = draft.nextTouched ? null : suggestNextForResult(draft.result)
  const openTaskCount = row.openTaskIds.length
  const memoId = `${formId}-memo`
  const dateId = `${formId}-date`

  return (
    <form
      id={formId}
      aria-label={`${row.title} 연락 결과 입력`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (ready && !pending) onSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          onCancel()
        }
      }}
      className="grid gap-2.5 border-l-2 border-[#084734] bg-white px-3 py-3"
      data-today-contact-form={row.key}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={`w-16 shrink-0 text-[12px] font-semibold ${SECONDARY_TEXT_CLASS} max-sm:w-full`}>채널</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="연락 채널">
          {TODAY_CONTACT_CHANNELS.map((channel) => (
            <button
              key={channel}
              type="button"
              aria-pressed={draft.channel === channel}
              onClick={() => onChange(applyOutcomeChannel(draft, channel))}
              className={`${CHIP_BASE} ${choiceClass(draft.channel === channel)}`}
            >
              {TODAY_CONTACT_CHANNEL_LABEL[channel]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={`w-16 shrink-0 text-[12px] font-semibold ${SECONDARY_TEXT_CLASS} max-sm:w-full`}>결과</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="연락 결과">
          {TODAY_CONTACT_RESULTS.map((result) => (
            <button
              key={result}
              type="button"
              aria-pressed={draft.result === result}
              disabled={!carriesResult}
              onClick={() => onChange(applyOutcomeResult(draft, result))}
              className={`${CHIP_BASE} ${choiceClass(draft.result === result)}`}
            >
              {TODAY_CONTACT_RESULT_LABEL[result]}
            </button>
          ))}
        </div>
        {!carriesResult ? (
          <span className={`text-[11px] ${SECONDARY_TEXT_CLASS}`}>카톡·이메일은 결과 없이 기록만 남습니다</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={`w-16 shrink-0 text-[12px] font-semibold ${SECONDARY_TEXT_CLASS} max-sm:w-full`}>다음 일정</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="다음 일정">
          {OUTCOME_NEXT_CHOICES.map((choice) => {
            const at =
              choice.key === "tomorrow_9" || choice.key === "in3_10" || choice.key === "next_monday_10"
                ? resolveNextPresetAt(choice.key, basisMs)
                : null
            const label = choice.key === "none" && isLead ? "팔로업 그대로" : choice.label
            return (
              <button
                key={choice.key}
                type="button"
                aria-pressed={draft.next === choice.key}
                onClick={() => onChange({ ...draft, next: choice.key, nextTouched: true })}
                className={`${CHIP_BASE} ${choiceClass(draft.next === choice.key)}`}
              >
                {label}
                {at ? <span className={`text-[11px] font-normal tabular-nums ${SECONDARY_TEXT_CLASS}`}>{formatKstMonthDay(at)}</span> : null}
                {suggested === choice.key ? <span className="text-[10px] font-bold text-[#084734]">추천</span> : null}
              </button>
            )
          })}
        </div>
        {draft.next === "date" ? (
          <label htmlFor={dateId} className={`inline-flex items-center gap-1.5 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            <span className="sr-only">다음 일정 날짜</span>
            <input
              id={dateId}
              type="date"
              value={draft.nextDate}
              min={earliestOutcomeDateKey(basisMs)}
              aria-invalid={dateProblem === "past" || undefined}
              onChange={(event) => onChange({ ...draft, nextDate: event.target.value, nextTouched: true })}
              className="h-9 rounded-md border border-[#E5E5E0] bg-white px-2 text-[12px] text-[#111110] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
            />
            <span>10:00</span>
          </label>
        ) : null}
        {dateProblem === "past" ? (
          <span className={`text-[11px] font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS.warning}`}>
            그날 10:00 이 이미 지났습니다 — 내일 이후 날짜를 고르세요
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <label htmlFor={memoId} className={`w-16 shrink-0 text-[12px] font-semibold ${SECONDARY_TEXT_CLASS} max-sm:w-full`}>
          메모
        </label>
        <input
          id={memoId}
          value={draft.memo}
          maxLength={OUTCOME_MEMO_MAX}
          onChange={(event) => onChange({ ...draft, memo: event.target.value })}
          placeholder="선택 · 확인한 사실만"
          autoComplete="off"
          className="h-9 min-w-0 flex-1 basis-[220px] rounded-md border border-[#E5E5E0] bg-white px-3 text-[12px] text-[#111110] outline-none placeholder:text-[#A39E98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
        />
      </div>

      {openTaskCount > 0 ? (
        <label className={`inline-flex items-center gap-2 text-[12px] ${INTERACTIVE_TEXT_CLASS}`}>
          <input
            type="checkbox"
            checked={draft.closeTasks}
            onChange={(event) => onChange({ ...draft, closeTasks: event.target.checked })}
            className="h-4 w-4 accent-[#084734]"
          />
          이 고객의 열린 할 일 {Math.min(openTaskCount, OUTCOME_CLOSE_TASK_LIMIT).toLocaleString("ko-KR")}건 함께 완료
        </label>
      ) : null}

      <p className={`text-[11px] leading-relaxed ${SECONDARY_TEXT_CLASS}`}>
        {isLead
          ? "리드 연락 기록으로 남고 팔로업 일정이 바뀝니다 · Compass 에는 쓰지 않습니다."
          : "Home 기록과 다음 일정 할 일로 남습니다 · 외부 NeoCRM·Compass 에는 쓰지 않습니다."}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!ready || pending}
          aria-busy={pending || undefined}
          className="inline-flex min-h-9 items-center justify-center rounded-md bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45 max-sm:flex-1"
        >
          {pending ? "저장 중" : "저장하고 접기"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={`inline-flex min-h-9 items-center justify-center rounded-md border border-[#E5E5E0] bg-white px-3 text-[13px] font-semibold transition-colors hover:border-[#A39E98] disabled:opacity-45 max-sm:flex-1 ${INTERACTIVE_TEXT_CLASS}`}
        >
          취소
        </button>
        {!ready && carriesResult && !draft.result ? (
          <span className={`text-[11px] ${SECONDARY_TEXT_CLASS}`}>결과를 고르면 저장할 수 있습니다</span>
        ) : null}
      </div>

      {discardPrompt ? (
        <div
          role="alertdialog"
          aria-label="작성 중인 연락 결과"
          className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-[12px] ${STATUS_TONE_CLASS.warning}`}
        >
          <span className="min-w-0 flex-1">&lsquo;{row.title}&rsquo; 에 작성 중인 연락 결과가 있습니다. 버리고 닫을까요?</span>
          <button
            type="button"
            autoFocus
            onClick={discardPrompt.onKeep}
            className={`inline-flex min-h-9 items-center rounded-md border bg-white px-2.5 font-semibold ${STATUS_TONE_CLASS.warning}`}
          >
            계속 작성
          </button>
          <button
            type="button"
            onClick={discardPrompt.onDiscard}
            className={`inline-flex min-h-9 items-center rounded-md px-2.5 font-semibold underline underline-offset-2 ${STATUS_TONE_TEXT_STRONG_CLASS.warning}`}
          >
            버리고 닫기
          </button>
        </div>
      ) : null}
    </form>
  )
}
