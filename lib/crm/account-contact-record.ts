import "server-only"

import { createHash } from "node:crypto"

// 현황 "오늘 연락"(C안 ①, 2026-09-25) 행 안 결과 기록·미루기·되돌리기의 서버 경로.
// POST/DELETE /api/admin/crm/home/today-contacts/outcome 이 이 모듈만 부른다(라우트 파일은 핸들러만 export).
//
// 쓰는 곳은 Home 자기 테이블뿐이다 — crm_customer_events·crm_tasks·lead_contact_logs·leads.follow_up_at.
// Compass(crm 스키마)·외부 NeoCRM 에는 쓰지 않는다(교차 쓰기 0). 스키마 추가 없음.
//
//  멱등은 요청 키(requestId) 하나로 한다 — 재전송(응답 유실 뒤 "다시 시도")은 첫 요청이 한 일(nextTask·closedTaskIds)을
//  그대로 돌려주고, 첫 요청이 중간에 끊겼으면 남은 단계(다음 일정·할 일 닫기)를 마저 한다. 내용이 같다는 이유로 다른
//  저장(리드 보드 등)을 삼키지 않는다.
//  재전송의 내용이 먼저 저장된 기록과 다르면(실패 뒤 결과·메모·채널·다음 일정을 고쳐 다시 보냄) 고친 내용은 저장하지
//  않는다 — 그때는 요청 본문에서 나오는 쓰기(할 일 닫기·리드 팔로업)도 하지 않고, 첫 요청이 이미 한 일만 되찾아 돌려주며
//  경고로 알린다(저장된 기록은 '부재'인데 할 일 결과 문구·팔로업은 '연결됨' 요청을 따르는 어긋남을 만들지 않는다).
//  계정·전환 고객·딜(record_outcome)
//   1차 증거 = crm_customer_events(call·sms, source_id = 'today-contact:<requestId>' — getOrCreate…BySource 로 멱등).
//   결과는 결과 칼럼이 없어 제목("전화 · 부재")에만 남는다(contactEventTitle). 다음 일정 = 기록의 다음 액션 → crm_tasks.
//   담당 = 저장한 사람.
//  Compass 에 없는 Home 리드(record_outcome_lead)
//   recordLeadContact(로그 → 연락중 전환 → 미러 → 할 일) + follow_up_at. 로그 id 를 요청 키에서 정해(todayContactLeadLogId —
//   리드 id + requestId 해시, 스키마 추가 없음) 로그·미러(source_id = 로그 id)가 함께 멱등이다. 연락 시각은 저장 시각(now)을
//   명시해, 연락중 전환이 찍는 confirmed_at 과 같게 둔다(되돌리기가 "이 저장이 상태를 바꿨는가"를 가리는 근거).
//   다음 일정이 없으면 follow_up_at 은 그대로 둔다(화면 계약 "리드는 팔로업 그대로").
//  미루기(mode snooze) — 기록 없이 다음 일정만
//   리드 = follow_up_at 을 옮긴다. 그 밖 = 이 행의 오늘 할 일(closeTaskIds, 없으면 대상의 오늘 기한 할 일)을
//   **취소**(cancelCrmTask, 결과 "미룸 → 다음 MM-DD")로 닫고 이어받는 할 일 하나를 새 기한으로 만든다(없으면 '재연락').
//   - 완료(done)로 닫지 않는다: 매니저 리포트·담당별 완료 집계(status=done)가 미룰 때마다 부풀고, 오늘 연락 흔적도
//     "완료"로 보인다. 취소 + "미룸 →" 문구는 오늘 연락 큐가 task_snoozed 흔적으로 가린다(today-contact-queue.ts).
//   - snoozeCrmTask 를 쓰지 않는 이유: 원래 기한을 덮어써(due_at = snoozed_until) 되돌리기 계약(closedTaskIds·
//     nextTaskId — 원래 기한 칸 없음)으로 복원할 수 없다. 취소는 due_at 을 건드리지 않아 재개만으로 원상태가 된다.
//   - 이어받는 할 일은 원천 기록(source_event_id)을 물려받지 않는다 — 같은 기록에 할 일이 둘 생기면 기록 → 할 일
//     조회(getCrmTaskBySourceEventId, 가장 오래된 1건)가 닫힌 쪽을 돌려준다.
//  되돌리기(DELETE, 화면 8초 창) — 기록 원천 삭제·할 일 취소/재개·follow_up_at 복원. **이 요청이 만든 것만**: 요청 키에
//   묶인 1차 기록(계정 = source_id, 리드 = 결정 로그 id)이고, 되돌리는 사람이 작성자이며, 10분 안에 만든 것. 1차 기록이
//   그 조건을 못 넘으면 할 일도 건드리지 않고 409 로 거절한다(요청 키는 기록 API 응답의 sourceId 로 읽을 수 있다 —
//   남의 옛 기록을 영구 삭제하거나, 기록만 지우고 할 일은 남는 부분 되돌리기를 만들지 않는다). 할 일도 작성자·10분
//   창을 본다. 리드 상태는 이 저장이 신규 → 연락중으로 바꿨을 때만 신규로 되돌린다.
//
// 1차 증거(기록·로그) 저장 실패만 오류로 돌려준다 — 그 뒤 단계는 fail-soft 로 warnings 에만 싣는다(contact-record.ts 규약).

import {
  channelCarriesResult,
  isContactLogResult,
  isContactLogType,
} from "@/lib/crm/contact-log"
import { deleteLeadContactLogWithMirrors, hasLeadContactEvidence, recordLeadContact } from "@/lib/crm/contact-record"
import { contactEventTitle } from "@/lib/crm/lead-contact-event"
import {
  resolveTodayContactNextDueAt,
  todayContactKstDayStart,
  todayContactMonthDay,
  todayContactSnoozeOutcome,
  TODAY_CONTACT_UNDO_OUTCOME,
} from "@/lib/crm/today-contact-queue"
import type {
  TodayContactNextSchedule,
  TodayContactOutcomeRequest,
  TodayContactOutcomeResponse,
  TodayContactOutcomeTargetType,
  TodayContactOutcomeUndoRequest,
  TodayContactOutcomeUndoResponse,
} from "@/lib/crm/today-contact-types"
import {
  deleteCrmCustomerEventsBySource,
  getOrCreateCrmCustomerEventBySource,
} from "@/lib/repositories/crm-events"
import {
  cancelCrmTask,
  completeCrmTask,
  createCrmTask,
  createTasksFromEventNextActions,
  getCrmTaskById,
  getCrmTaskBySourceEventId,
  inferTaskTypeFromTitle,
  isCrmTasksNotReadyError,
  reopenCrmTask,
  type CrmTaskRecord,
} from "@/lib/repositories/crm-tasks"
import {
  findRecentTodayContactTask,
  getTodayContactLeadLog,
  invalidateCrmTodayContacts,
  listActiveTasksForTodayContactTarget,
  listRecentTodayContactSnoozedTasks,
  listTodayContactEventsBySource,
} from "@/lib/repositories/crm-today-contacts"
import { getLeadById, updateLead, type LeadRecord } from "@/lib/repositories/leads"
import type { ContactLogResult, ContactLogType } from "@/lib/supabase/database.types"

const DAY_MS = 24 * 60 * 60 * 1000

export const TODAY_CONTACT_SOURCE_ID_PREFIX = "today-contact:"
export const TODAY_CONTACT_MEMO_MAX = 500
export const TODAY_CONTACT_NEXT_TITLE_MAX = 120
export const TODAY_CONTACT_CLOSE_TASK_MAX = 10
/** 미루기 재전송 판정 창 — 같은 대상·같은 기한 열린 할 일이 이 안에 만들어졌으면 새로 만들지 않는다. */
export const TODAY_CONTACT_TASK_DEDUPE_WINDOW_MS = 2 * 60_000
/** 되돌리기가 건드릴 수 있는 쓰기의 나이 상한(화면 창은 8초 — 네트워크 지연·"다시 시도" 여유). */
export const TODAY_CONTACT_UNDO_MAX_AGE_MS = 10 * 60_000
/**
 * 재전송이 "첫 요청이 닫은 할 일"로 되찾는 허용 오차 — 첫 요청은 기록 시각(occurred_at·contacted_at)과 같은 now 로
 * 할 일을 닫는다(completed_at). 이 오차 밖에서 닫힌 할 일은 다른 저장이 닫은 것이다.
 */
const RETRY_CLOSE_MATCH_SLACK_MS = 1_000
/** 다음 일정 기한이 이보다 과거면 거절한다(시계 오차 여유). */
const NEXT_DUE_PAST_SLACK_MS = 5 * 60_000

const TARGET_TYPES: readonly TodayContactOutcomeTargetType[] = ["neo_account", "customer", "deal", "lead"]
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/
const MIGRATION_PENDING_PATTERN = /마이그레이션이 아직 적용되지 않았습니다/

export interface TodayContactActor {
  /** 표시 이름(기록 작성자·할 일 담당 스냅샷) */
  name: string
  /** 담당 키(admin_profiles 매핑) — 없으면 null(할 일 owner_key 비움) */
  ownerKey: string | null
}

export type TodayContactOutcomeResult<T> =
  | { ok: true; status: 200 | 201; body: T }
  | { ok: false; status: 400 | 404 | 409 | 503 | 500; error: string }

/**
 * 리드 결과 기록의 연락 로그 id — 리드 id + 요청 키의 SHA-256 을 UUID 모양(버전 5 비트)으로. 같은 요청의 재전송은 같은 id 라
 * 로그(기본키)·미러(source_id = 로그 id)가 한 번만 생긴다. 다른 리드에 같은 요청 키를 써도 id 가 겹치지 않는다.
 * 되돌리기는 이 id 로 "이 요청이 만든 로그"인지 확인한다.
 */
export function todayContactLeadLogId(requestId: string, leadId: string): string {
  const hex = createHash("sha256").update(`${TODAY_CONTACT_SOURCE_ID_PREFIX}${leadId}:${requestId}`).digest("hex")
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function timeMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** 두 시각이 같은 순간인가(표기 차이 무시 — DB 는 '+00:00', JS 는 'Z'). 둘 다 비었으면 같다. */
function sameInstant(a: string | null | undefined, b: string | null | undefined, slackMs = 0): boolean {
  const aMs = timeMs(a)
  const bMs = timeMs(b)
  if (aMs == null || bMs == null) return aMs == null && bMs == null
  return Math.abs(aMs - bMs) <= slackMs
}

/** 비교용 — 빈 문자열·undefined 를 null 로(저장소는 빈 메모를 null 로 남긴다). */
function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed ? trimmed : null
}

/**
 * 재전송의 내용이 먼저 저장된 기록과 달라 고친 내용을 버렸다는 경고. skipped = 이번에 하지 않은 요청 본문 쓰기.
 * 화면은 이 문구를 그대로 보여 준다(고객 360 에서 저장된 기록을 확인하게).
 */
export function todayContactContentMismatchWarning(storedTitle: string, skipped: string): string {
  return `같은 요청으로 먼저 저장된 기록('${storedTitle}')과 내용이 달라 고친 내용은 저장하지 않았습니다 — ${skipped}도 하지 않았습니다. 고객 360 에서 확인하고 필요하면 새로 기록하세요.`
}

/** 이 쓰기의 작성자가 지금 요청한 사람인가(작성자 이름 = resolveActor 의 name, 기록·로그·할 일에 같은 값이 남는다). */
function isActor(by: string | null | undefined, actor: TodayContactActor): boolean {
  const name = actor.name.trim()
  return Boolean(name) && (by ?? "").trim() === name
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseTarget(raw: unknown, requireLabel: boolean) {
  if (!isRecord(raw)) return null
  const type = raw.type
  const id = trimOrNull(raw.id)
  if (typeof type !== "string" || !(TARGET_TYPES as readonly string[]).includes(type) || !id || id.length > 200) return null
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 200) : ""
  if (requireLabel && typeof raw.label !== "string") return null
  return { type: type as TodayContactOutcomeTargetType, id, label }
}

function parseNext(raw: unknown): { ok: true; next: TodayContactNextSchedule | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, next: null }
  if (!isRecord(raw)) return { ok: false }
  if ("preset" in raw) {
    const preset = raw.preset
    if (preset === "tomorrow_9" || preset === "in3_10" || preset === "next_monday_10") return { ok: true, next: { preset } }
    return { ok: false }
  }
  if (typeof raw.dueAt === "string" && !Number.isNaN(new Date(raw.dueAt).getTime())) {
    return { ok: true, next: { dueAt: raw.dueAt } }
  }
  return { ok: false }
}

function parseIdList(raw: unknown, max: number): string[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.length > max) return null
  const ids: string[] = []
  for (const value of raw) {
    const id = trimOrNull(value)
    if (!id || id.length > 80) return null
    ids.push(id)
  }
  return [...new Set(ids)]
}

/** POST 본문 검증 — 결과는 통화 성격 채널(call·sms)이 아니면 조용히 버린다(리드 logs 라우트와 같은 규칙). */
export function parseTodayContactOutcomeRequest(
  raw: unknown,
  nowMs: number
): { ok: true; value: TodayContactOutcomeRequest & { dueAt: string | null } } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "잘못된 요청 형식입니다." }
  const requestId = trimOrNull(raw.requestId)
  if (!requestId || !REQUEST_ID_PATTERN.test(requestId)) return { ok: false, error: "requestId 가 올바르지 않습니다." }
  const mode = raw.mode
  if (mode !== "contact" && mode !== "snooze") return { ok: false, error: "mode 는 contact 또는 snooze 입니다." }
  const target = parseTarget(raw.target, false)
  if (!target) return { ok: false, error: "대상(target)이 올바르지 않습니다." }

  let channel: ContactLogType | undefined
  let result: ContactLogResult | null = null
  if (mode === "contact") {
    if (!isContactLogType(raw.channel)) return { ok: false, error: "채널(channel)이 올바르지 않습니다." }
    channel = raw.channel
    if (raw.result != null) {
      if (!isContactLogResult(raw.result)) return { ok: false, error: "결과(result)가 올바르지 않습니다." }
      result = channelCarriesResult(channel) ? raw.result : null
    }
  }

  let memo: string | undefined
  if (raw.memo != null) {
    if (typeof raw.memo !== "string") return { ok: false, error: "메모(memo)는 문자열입니다." }
    const trimmed = raw.memo.trim()
    if (Array.from(trimmed).length > TODAY_CONTACT_MEMO_MAX) {
      return { ok: false, error: `메모는 ${TODAY_CONTACT_MEMO_MAX}자까지입니다.` }
    }
    memo = trimmed || undefined
  }

  const parsedNext = parseNext(raw.next)
  if (!parsedNext.ok) return { ok: false, error: "다음 일정(next)이 올바르지 않습니다." }
  const dueAt = resolveTodayContactNextDueAt(parsedNext.next, nowMs)
  if (parsedNext.next && !dueAt) return { ok: false, error: "다음 일정 시각을 해석하지 못했습니다." }
  if (dueAt && new Date(dueAt).getTime() < nowMs - NEXT_DUE_PAST_SLACK_MS) {
    return { ok: false, error: "다음 일정은 지난 시각일 수 없습니다." }
  }
  if (mode === "snooze" && !dueAt) return { ok: false, error: "미루기에는 다음 일정이 필요합니다." }

  let nextTitle: string | undefined
  if (raw.nextTitle != null) {
    if (typeof raw.nextTitle !== "string") return { ok: false, error: "nextTitle 은 문자열입니다." }
    nextTitle = raw.nextTitle.trim().slice(0, TODAY_CONTACT_NEXT_TITLE_MAX) || undefined
  }

  const closeTaskIds = parseIdList(raw.closeTaskIds, TODAY_CONTACT_CLOSE_TASK_MAX)
  if (!closeTaskIds) return { ok: false, error: `closeTaskIds 는 ${TODAY_CONTACT_CLOSE_TASK_MAX}개 이하의 id 목록입니다.` }

  return {
    ok: true,
    value: {
      requestId,
      mode,
      target,
      channel,
      result,
      memo,
      next: parsedNext.next,
      nextTitle,
      closeTaskIds,
      dueAt,
    },
  }
}

/** DELETE 본문 검증. previousFollowUpAt 은 키가 있을 때만 복원한다(null = 비움). */
export function parseTodayContactOutcomeUndoRequest(
  raw: unknown
): { ok: true; value: TodayContactOutcomeUndoRequest & { hasPreviousFollowUpAt: boolean } } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "잘못된 요청 형식입니다." }
  const requestId = trimOrNull(raw.requestId)
  if (!requestId || !REQUEST_ID_PATTERN.test(requestId)) return { ok: false, error: "requestId 가 올바르지 않습니다." }
  const target = parseTarget(raw.target, false)
  if (!target) return { ok: false, error: "대상(target)이 올바르지 않습니다." }
  const closedTaskIds = parseIdList(raw.closedTaskIds, TODAY_CONTACT_CLOSE_TASK_MAX)
  if (!closedTaskIds) return { ok: false, error: "closedTaskIds 가 올바르지 않습니다." }
  const optionalId = (value: unknown) => (value == null ? null : trimOrNull(value))
  const hasPreviousFollowUpAt = "previousFollowUpAt" in raw
  let previousFollowUpAt: string | null = null
  if (hasPreviousFollowUpAt && raw.previousFollowUpAt != null) {
    if (typeof raw.previousFollowUpAt !== "string" || Number.isNaN(new Date(raw.previousFollowUpAt).getTime())) {
      return { ok: false, error: "previousFollowUpAt 이 올바르지 않습니다." }
    }
    previousFollowUpAt = raw.previousFollowUpAt
  }
  return {
    ok: true,
    value: {
      requestId,
      target: { type: target.type, id: target.id },
      eventId: optionalId(raw.eventId),
      contactLogId: optionalId(raw.contactLogId),
      nextTaskId: optionalId(raw.nextTaskId),
      closedTaskIds,
      previousFollowUpAt,
      hasPreviousFollowUpAt,
    },
  }
}

function errorStatus(error: unknown): 503 | 500 {
  if (isCrmTasksNotReadyError(error)) return 503
  if (error instanceof Error && MIGRATION_PENDING_PATTERN.test(error.message)) return 503
  return 500
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function taskMatchesTarget(task: CrmTaskRecord, target: { type: TodayContactOutcomeTargetType; id: string }): boolean {
  return task.targetType === target.type && (task.targetId ?? "") === target.id
}

function isWithin(iso: string | null | undefined, sinceMs: number): boolean {
  if (!iso) return false
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) && ms >= sinceMs
}

/**
 * 이 행의 할 일을 닫는다 — 대상이 같고 열린(open·snoozed) 것만. 어긋나면 건너뛰고 경고.
 * how = "complete"(연락 결과 — 완료) | "snooze"(미루기 — 취소 + "미룸 → …", 완료 집계에 넣지 않는다).
 * retryOf(재전송) — 첫 요청이 이미 닫은 할 일(같은 닫힘 상태·같은 작성자·같은 결과 문구 머리·첫 요청 시각 ±1초)도 이번
 * 결과(closedTaskIds)에 되찾아 싣는다. 되돌리기가 그 할 일을 다시 열 수 있게 — 안 그러면 기록만 지워지고 할 일은 닫힌 채 남는다.
 * retryOf.recoverOnly — 되찾기만 하고 아직 열린 할 일은 닫지 않는다(재전송 내용이 저장된 기록과 달라 요청 본문 쓰기를 멈출 때).
 */
async function closeRowTasks(
  target: { type: TodayContactOutcomeTargetType; id: string },
  ids: readonly string[],
  close: { how: "complete" | "snooze"; outcome: string },
  actor: TodayContactActor,
  now: Date,
  warnings: string[],
  retryOf?: { anchorAt: string; outcomePrefix: string; recoverOnly?: boolean }
): Promise<{ closed: CrmTaskRecord[] }> {
  const closed: CrmTaskRecord[] = []
  let mismatched = 0
  let failed = 0
  const closedStatus = close.how === "snooze" ? "canceled" : "done"
  for (const id of ids) {
    try {
      const task = await getCrmTaskById(id)
      if (!task) continue
      if (!taskMatchesTarget(task, target)) {
        mismatched += 1
        continue
      }
      if (task.status !== "open" && task.status !== "snoozed") {
        if (
          retryOf &&
          task.status === closedStatus &&
          isActor(task.completedBy, actor) &&
          sameInstant(task.completedAt, retryOf.anchorAt, RETRY_CLOSE_MATCH_SLACK_MS) &&
          (task.outcome ?? "").startsWith(retryOf.outcomePrefix)
        ) {
          closed.push(task)
        }
        continue
      }
      if (retryOf?.recoverOnly) continue
      const options = { outcome: close.outcome, completedBy: actor.name, now }
      const done = close.how === "snooze" ? await cancelCrmTask(id, options) : await completeCrmTask(id, options)
      if (done) closed.push(task)
    } catch (error) {
      console.error("[today-contact] close task", id, error)
      failed += 1
    }
  }
  if (mismatched > 0) warnings.push(`대상이 다른 할 일 ${mismatched}건은 닫지 않았습니다.`)
  if (failed > 0) warnings.push(`할 일 ${failed}건을 닫지 못했습니다.`)
  return { closed }
}

/** 미루기 — 이 행의 오늘 할 일(명시 목록, 없으면 대상의 오늘 기한 할 일)을 찾는다. */
async function resolveSnoozeTaskIds(
  target: { type: TodayContactOutcomeTargetType; id: string },
  explicit: readonly string[],
  now: Date,
  warnings: string[]
): Promise<string[]> {
  if (explicit.length > 0) return [...explicit]
  try {
    const todayEnd = todayContactKstDayStart(now.getTime()) + DAY_MS
    const tasks = await listActiveTasksForTodayContactTarget(target.type, target.id)
    return tasks
      .filter((task) => {
        const due = task.status === "snoozed" ? (task.snoozedUntil ?? task.dueAt) : task.dueAt
        const dueMs = due ? new Date(due).getTime() : Number.NaN
        if (task.status === "snoozed") {
          const until = task.snoozedUntil ? new Date(task.snoozedUntil).getTime() : Number.NaN
          if (!Number.isFinite(until) || until > now.getTime()) return false
        }
        if (Number.isFinite(dueMs)) return dueMs < todayEnd
        return task.priority === "urgent" || task.priority === "high"
      })
      .slice(0, TODAY_CONTACT_CLOSE_TASK_MAX)
      .map((task) => task.id)
  } catch (error) {
    console.error("[today-contact] resolve snooze tasks", error)
    warnings.push("이 고객의 오늘 할 일을 확인하지 못해 새 할 일만 만들었습니다.")
    return []
  }
}

async function recordAccountOutcome(
  input: TodayContactOutcomeRequest & { dueAt: string | null },
  actor: TodayContactActor,
  now: Date
): Promise<TodayContactOutcomeResult<TodayContactOutcomeResponse>> {
  const warnings: string[] = []
  const { target, dueAt } = input
  const channel = input.channel as ContactLogType
  const result = input.result ?? null
  const title = contactEventTitle(channel, result)
  const nextTitle = input.nextTitle?.trim() || "재연락"
  const sourceId = `${TODAY_CONTACT_SOURCE_ID_PREFIX}${input.requestId}`

  // 같은 요청 키의 기록이 이미 다른 종류(전화 ↔ 문자)로 있으면 그 종류로 찾는다 — getOrCreate…BySource 는 source_type +
  // source_id 로만 찾아, 재전송에서 채널을 고치면 두 번째 기록·두 번째 다음 일정이 생긴다. 조회 실패는 막지 않는다
  // (같은 채널 재전송은 getOrCreate 가 그대로 멱등으로 막는다).
  let sourceType: "call" | "sms" = channel === "call" ? "call" : "sms"
  try {
    const prior = await listTodayContactEventsBySource(sourceId, target.type, target.id)
    if (prior[0]) sourceType = prior[0].sourceType
  } catch (error) {
    console.error("[today-contact] prior event lookup", error)
  }

  let event: Awaited<ReturnType<typeof getOrCreateCrmCustomerEventBySource>>
  try {
    event = await getOrCreateCrmCustomerEventBySource({
      targetType: target.type,
      targetId: target.id,
      targetLabel: target.label || null,
      sourceType,
      sourceId,
      occurredAt: now.toISOString(),
      title,
      body: input.memo ?? null,
      ownerName: actor.name,
      createdBy: actor.name,
      sentiment: result === "meeting_set" ? "positive" : "neutral",
      nextActions: dueAt ? [{ title: nextTitle, ownerName: actor.name, dueAt, done: false }] : [],
    })
  } catch (error) {
    console.error("[today-contact] record event", error)
    return { ok: false, status: errorStatus(error), error: `연락 기록을 저장하지 못했습니다: ${errorText(error)}` }
  }

  const record = event.record
  let nextTask: TodayContactOutcomeResponse["nextTask"] = null
  let closedTaskIds: string[] = []

  if (event.created) {
    if (dueAt) {
      try {
        const [task] = await createTasksFromEventNextActions(record, { createdBy: actor.name })
        if (task?.dueAt) nextTask = { id: task.id, dueAt: task.dueAt }
        else warnings.push("연락은 저장됐지만 다음 일정을 만들지 못했습니다.")
      } catch (error) {
        console.error("[today-contact] next task", error)
        warnings.push("연락은 저장됐지만 다음 일정을 만들지 못했습니다.")
      }
    }
    if (input.closeTaskIds?.length) {
      const nextLabel = dueAt ? ` → 다음 ${todayContactMonthDay(dueAt)}` : ""
      const { closed } = await closeRowTasks(
        target,
        input.closeTaskIds,
        { how: "complete", outcome: `${title}${nextLabel}` },
        actor,
        now,
        warnings
      )
      closedTaskIds = closed.map((task) => task.id)
    }
  } else if (!isActor(record.createdBy, actor)) {
    // 같은 요청 키로 다른 사람이 남긴 기록 — 그 사람의 저장이다. 이어서 처리하지 않는다(되돌리기도 막힌다).
    warnings.push("다른 사람이 남긴 같은 요청의 기록이라 이어서 처리하지 않았습니다.")
  } else if (record.targetType !== target.type || (record.targetId ?? "") !== target.id) {
    // 같은 요청 키가 다른 대상의 기록을 가리킨다(클라이언트 오류) — 그 기록으로 이 행의 할 일을 닫지 않는다.
    warnings.push("같은 요청 키로 다른 고객의 기록이 있어 이어서 처리하지 않았습니다.")
  } else {
    // 재전송(같은 requestId) — 기록을 새로 쓰지 않는다. 첫 요청이 한 일(다음 일정 할 일·닫은 할 일)을 그대로 돌려주고,
    // 첫 요청이 중간에 끊겼으면 남은 단계를 마저 한다. 남은 단계의 내용은 **저장된 기록**(제목·다음 액션)을 따른다 —
    // 요청 본문을 따르면 기록은 '부재'인데 할 일 결과 문구는 '연결됨'인 어긋남이 생긴다.
    const storedNext = record.nextActions?.[0] ?? null
    const storedNextDueAt = storedNext?.dueAt ?? null
    const contentMatches =
      record.title === title &&
      textOrNull(record.body) === textOrNull(input.memo) &&
      sameInstant(storedNextDueAt, dueAt) &&
      (!dueAt || (storedNext?.title ?? "") === nextTitle)
    // 다음 일정 할 일은 기록의 다음 액션에서 파생된다(요청 본문이 아니다) — 내용이 달라도 기록이 약속한 할 일은 맞춘다.
    if (storedNextDueAt) {
      try {
        const existingTask = await getCrmTaskBySourceEventId(record.id)
        if (existingTask) {
          if (existingTask.dueAt) nextTask = { id: existingTask.id, dueAt: existingTask.dueAt }
        } else {
          const [task] = await createTasksFromEventNextActions(record, { createdBy: actor.name })
          if (task?.dueAt) nextTask = { id: task.id, dueAt: task.dueAt }
        }
      } catch (error) {
        console.error("[today-contact] retry next task", error)
        warnings.push("다음 일정 할 일을 확인하지 못했습니다.")
      }
    }
    if (input.closeTaskIds?.length) {
      const nextLabel = storedNextDueAt ? ` → 다음 ${todayContactMonthDay(storedNextDueAt)}` : ""
      const { closed } = await closeRowTasks(
        target,
        input.closeTaskIds,
        { how: "complete", outcome: `${record.title}${nextLabel}` },
        actor,
        now,
        warnings,
        // 내용이 다르면 첫 요청이 닫은 할 일만 되찾는다(고친 요청으로 새로 닫지 않는다).
        { anchorAt: record.occurredAt, outcomePrefix: record.title, recoverOnly: !contentMatches }
      )
      closedTaskIds = closed.map((task) => task.id)
    }
    if (!contentMatches) warnings.push(todayContactContentMismatchWarning(record.title, "이 행의 할 일 닫기"))
  }

  invalidateCrmTodayContacts("expire")
  return {
    ok: true,
    status: event.created ? 201 : 200,
    body: {
      duplicate: !event.created,
      event: { id: record.id, occurredAt: record.occurredAt },
      contactLogId: null,
      nextTask,
      followUpAt: null,
      closedTaskIds,
      warnings,
    },
  }
}

async function updateLeadFollowUp(lead: LeadRecord, value: string | null, warnings: string[]): Promise<boolean> {
  try {
    // updateLead 의 patch 타입은 문자열만 받지만 저장소는 null 을 그대로 넘겨 칸을 비운다(leads/[id] PATCH 와 같은 경로).
    const updated = await updateLead(lead.id, { follow_up_at: value } as unknown as Partial<LeadRecord>)
    if (!updated) {
      warnings.push("팔로업 일정을 바꾸지 못했습니다.")
      return false
    }
    return true
  } catch (error) {
    console.error("[today-contact] lead follow-up", error)
    warnings.push("팔로업 일정을 바꾸지 못했습니다.")
    return false
  }
}

async function recordLeadOutcome(
  input: TodayContactOutcomeRequest & { dueAt: string | null },
  actor: TodayContactActor,
  now: Date
): Promise<TodayContactOutcomeResult<TodayContactOutcomeResponse>> {
  const warnings: string[] = []
  let lead: LeadRecord | null
  try {
    lead = await getLeadById(input.target.id)
  } catch (error) {
    console.error("[today-contact] load lead", error)
    return { ok: false, status: 500, error: "리드를 불러오지 못했습니다." }
  }
  if (!lead) return { ok: false, status: 404, error: "리드를 찾을 수 없습니다." }
  const beforeFollowUpAt = lead.follow_up_at ?? null
  const { dueAt } = input
  // 이 요청이 follow_up_at 을 실제로 바꿀 때만 저장 직전 값(previousFollowUpAt)을 싣는다. 이미 그 값이면(재전송 —
  // 첫 요청이 옮겼다) 싣지 않는다 — 옮긴 뒤 값을 "저장 직전"이라 돌려주면 되돌리기가 아무것도 복원하지 못한다(화면은
  // 행 추정값으로 되돌린다: resolveLeadUndoFollowUpAt).
  const followUpUnchanged = dueAt != null && sameInstant(beforeFollowUpAt, dueAt)
  const previousFollowUp = (changed: boolean) => (changed ? { previousFollowUpAt: beforeFollowUpAt } : {})

  if (input.mode === "snooze") {
    const moved = followUpUnchanged ? true : await updateLeadFollowUp(lead, dueAt, warnings)
    // 리드 미루기의 1차 결과는 follow_up_at 이다 — 이 행의 오늘 할 일을 옮기는 단계는 fail-soft.
    let snoozed: Awaited<ReturnType<typeof moveRowTasks>> = { nextTask: null, closedTaskIds: [] }
    try {
      snoozed = await moveRowTasks(input, actor, now, warnings, { createFallback: false })
    } catch (error) {
      console.error("[today-contact] lead snooze tasks", error)
      warnings.push("오늘 할 일을 함께 옮기지 못했습니다.")
    }
    if (!moved && snoozed.closedTaskIds.length === 0 && !snoozed.nextTask) {
      return { ok: false, status: 500, error: "다음 일정을 옮기지 못했습니다." }
    }
    invalidateCrmTodayContacts("expire")
    return {
      ok: true,
      status: 200,
      body: {
        duplicate: false,
        event: null,
        contactLogId: null,
        nextTask: snoozed.nextTask,
        followUpAt: moved ? dueAt : beforeFollowUpAt,
        ...previousFollowUp(moved && !followUpUnchanged),
        closedTaskIds: snoozed.closedTaskIds,
        warnings,
      },
    }
  }

  const channel = input.channel as ContactLogType
  const result = input.result && channelCarriesResult(channel) ? input.result : null
  const title = contactEventTitle(channel, result)

  const nowIso = now.toISOString()
  let recorded: Awaited<ReturnType<typeof recordLeadContact>>
  try {
    recorded = await recordLeadContact({
      lead,
      entry: {
        // 요청 키 멱등 — 재전송은 같은 로그(기본키)·같은 미러(source_id = 로그 id)를 가리킨다.
        id: todayContactLeadLogId(input.requestId, lead.id),
        type: channel,
        result: result ?? undefined,
        notes: input.memo,
        contacted_by: actor.name,
        // 연락중 전환이 찍는 confirmed_at 과 같은 순간 — 되돌리기가 "이 저장이 상태를 바꿨는가"를 가린다.
        contacted_at: nowIso,
      },
      taskCreatedBy: actor.name,
      now,
    })
  } catch (error) {
    console.error("[today-contact] record lead contact", error)
    return { ok: false, status: errorStatus(error), error: `연락 기록을 저장하지 못했습니다: ${errorText(error)}` }
  }
  if (!recorded.ok) {
    return { ok: false, status: 400, error: "연락 시각이 올바르지 않습니다." }
  }
  // 재전송 판정 — 같은 로그 id 를 이미 찾았거나(duplicate), 동시에 들어온 재전송이 먼저 저장해 기본키 충돌 뒤 그 로그를
  // 돌려받은 경우(addContactLog 23505 — duplicate=false 로 오지만 연락 시각이 이 요청의 now 가 아니다).
  const duplicate = recorded.duplicate || !sameInstant(recorded.log.contacted_at, nowIso)
  if (duplicate && !isActor(recorded.log.contacted_by, actor)) {
    // 같은 요청 키로 다른 사람이 남긴 로그 — 이어서 처리하지 않고, 되돌리기가 지울 로그도 돌려주지 않는다.
    return {
      ok: true,
      status: 200,
      body: {
        duplicate: true,
        event: null,
        contactLogId: null,
        nextTask: null,
        followUpAt: beforeFollowUpAt,
        closedTaskIds: [],
        warnings: ["다른 사람이 남긴 같은 요청의 기록이라 이어서 처리하지 않았습니다."],
      },
    }
  }
  if (recorded.statusSync === "failed") warnings.push("연락은 저장됐지만 리드 상태를 연락중으로 맞추지 못했습니다.")
  if (recorded.mirror === "failed") warnings.push("연락은 저장됐지만 CRM 기록 타임라인에 옮기지 못했습니다.")

  // 재전송의 내용이 저장된 로그와 다르면(실패 뒤 결과·메모·채널을 고쳐 다시 보냄) 고친 내용은 저장되지 않았다 — 팔로업
  // 이동·할 일 닫기도 하지 않고(요청 본문에서 나오는 쓰기), 첫 요청이 닫은 할 일만 되찾아 경고로 알린다.
  const storedTitle = contactEventTitle(recorded.log.type, recorded.log.result ?? null)
  const contentMatches =
    !duplicate ||
    (recorded.log.type === channel &&
      (recorded.log.result ?? null) === (result ?? null) &&
      textOrNull(recorded.log.notes) === textOrNull(input.memo))

  // 다음 일정 — 재전송이어도 멱등하게 끝까지 맞춘다(이미 그 값이면 쓰지 않는다).
  let followUpAt = beforeFollowUpAt
  let followUpChanged = false
  if (dueAt && contentMatches) {
    if (followUpUnchanged) followUpAt = dueAt
    else if (await updateLeadFollowUp(lead, dueAt, warnings)) {
      followUpAt = dueAt
      followUpChanged = true
    }
  }

  let closedTaskIds: string[] = []
  if (input.closeTaskIds?.length) {
    const nextLabel = dueAt ? ` → 다음 ${todayContactMonthDay(dueAt)}` : ""
    const { closed } = await closeRowTasks(
      input.target,
      input.closeTaskIds,
      { how: "complete", outcome: `${title}${nextLabel}` },
      actor,
      now,
      warnings,
      duplicate
        ? { anchorAt: recorded.log.contacted_at, outcomePrefix: storedTitle, recoverOnly: !contentMatches }
        : undefined
    )
    closedTaskIds = closed.map((task) => task.id)
  }
  if (!contentMatches) {
    warnings.push(todayContactContentMismatchWarning(storedTitle, dueAt ? "팔로업 이동·할 일 닫기" : "할 일 닫기"))
  }

  invalidateCrmTodayContacts("expire")
  return {
    ok: true,
    status: duplicate ? 200 : 201,
    body: {
      duplicate,
      event: recorded.event ? { id: recorded.event.id, occurredAt: recorded.event.occurredAt } : null,
      contactLogId: recorded.log.id,
      nextTask: null,
      followUpAt,
      ...previousFollowUp(followUpChanged),
      closedTaskIds,
      warnings,
    },
  }
}

/**
 * 미루기 — 이 행의 오늘 할 일을 취소 + "미룸 → 다음 MM-DD"로 닫고 이어받는 할 일 하나를 새 기한으로 만든다.
 * 이어받는 할 일은 첫 할 일의 제목·종류·우선순위·담당을 잇는다(여럿이면 상세에 함께 적는다). 원천 기록은 잇지 않는다.
 * createFallback 이면 닫을 할 일이 없을 때 '재연락'(또는 nextTitle) 할 일을 만든다(계정·고객·딜). 같은 기한의 열린
 * 할 일이 2분 안에 이미 만들어졌으면(재전송) 그것을 돌려준다.
 */
async function moveRowTasks(
  input: TodayContactOutcomeRequest & { dueAt: string | null },
  actor: TodayContactActor,
  now: Date,
  warnings: string[],
  options: { createFallback: boolean }
): Promise<{ nextTask: TodayContactOutcomeResponse["nextTask"]; closedTaskIds: string[] }> {
  const dueAt = input.dueAt as string
  const target = input.target
  const since = new Date(now.getTime() - TODAY_CONTACT_TASK_DEDUPE_WINDOW_MS).toISOString()
  const existing = await findRecentTodayContactTask(target.type, target.id, dueAt, since)
  if (existing?.dueAt) {
    // 재전송 — 이어받는 할 일을 다시 만들지 않는다. 첫 요청이 같은 문구로 미룬(취소한) 이 사람의 할 일을 되찾아
    // closedTaskIds 로 돌려준다(되돌리기가 원래 할 일을 다시 열 수 있게).
    const retried = isActor(existing.createdBy, actor)
      ? await listRecentTodayContactSnoozedTasks(target.type, target.id, {
          outcome: todayContactSnoozeOutcome(dueAt),
          completedBy: actor.name,
          sinceIso: since,
        })
      : []
    return { nextTask: { id: existing.id, dueAt: existing.dueAt }, closedTaskIds: retried.map((task) => task.id) }
  }

  const ids = await resolveSnoozeTaskIds(target, input.closeTaskIds ?? [], now, warnings)
  const { closed } = ids.length
    ? await closeRowTasks(target, ids, { how: "snooze", outcome: todayContactSnoozeOutcome(dueAt) }, actor, now, warnings)
    : { closed: [] as CrmTaskRecord[] }

  if (closed.length === 0 && !options.createFallback) return { nextTask: null, closedTaskIds: [] }

  const head = closed[0] ?? null
  const title = head?.title ?? (input.nextTitle?.trim() || "재연락")
  const inferred = inferTaskTypeFromTitle(title)
  const others = closed.slice(1).map((task) => task.title)
  const detail = [head?.detail ?? null, others.length ? `함께 미룬 할 일: ${others.join(", ")}` : null]
    .filter((part): part is string => Boolean(part))
    .join("\n")
  try {
    const created = await createCrmTask({
      targetType: target.type,
      targetId: target.id,
      targetLabel: head?.targetLabel ?? (target.label || null),
      ownerKey: head ? head.ownerKey : actor.ownerKey,
      ownerNameSnapshot: head ? head.ownerNameSnapshot : actor.name,
      taskType: head?.taskType ?? (inferred === "other" ? "call" : inferred),
      title,
      detail: detail || null,
      dueAt,
      priority: head?.priority ?? "normal",
      // 원천 기록을 물려받지 않는다 — 기록 → 할 일 조회가 닫힌(취소) 쪽을 돌려주지 않게.
      sourceEventId: null,
      createdBy: actor.name,
      assignedBy: actor.name,
    })
    return {
      nextTask: created.dueAt ? { id: created.id, dueAt: created.dueAt } : null,
      closedTaskIds: closed.map((task) => task.id),
    }
  } catch (error) {
    console.error("[today-contact] create continuation task", error)
    // 닫은 할 일을 되살려 "할 일이 사라진" 상태를 남기지 않는다.
    for (const task of closed) {
      try {
        await reopenCrmTask(task.id)
      } catch (reopenError) {
        console.error("[today-contact] reopen after failure", task.id, reopenError)
      }
    }
    throw error
  }
}

async function snoozeAccountOutcome(
  input: TodayContactOutcomeRequest & { dueAt: string | null },
  actor: TodayContactActor,
  now: Date
): Promise<TodayContactOutcomeResult<TodayContactOutcomeResponse>> {
  const warnings: string[] = []
  let moved: Awaited<ReturnType<typeof moveRowTasks>>
  try {
    moved = await moveRowTasks(input, actor, now, warnings, { createFallback: true })
  } catch (error) {
    return { ok: false, status: errorStatus(error), error: `다음 일정을 만들지 못했습니다: ${errorText(error)}` }
  }
  invalidateCrmTodayContacts("expire")
  return {
    ok: true,
    status: 200,
    body: {
      duplicate: false,
      event: null,
      contactLogId: null,
      nextTask: moved.nextTask,
      followUpAt: null,
      closedTaskIds: moved.closedTaskIds,
      warnings,
    },
  }
}

/** POST — 결과 기록·미루기. */
export async function recordTodayContactOutcome(
  input: TodayContactOutcomeRequest & { dueAt: string | null },
  actor: TodayContactActor,
  now: Date = new Date()
): Promise<TodayContactOutcomeResult<TodayContactOutcomeResponse>> {
  if (input.target.type === "lead") {
    try {
      return await recordLeadOutcome(input, actor, now)
    } catch (error) {
      console.error("[today-contact] lead outcome", error)
      return { ok: false, status: errorStatus(error), error: `저장하지 못했습니다: ${errorText(error)}` }
    }
  }
  if (input.mode === "snooze") return snoozeAccountOutcome(input, actor, now)
  return recordAccountOutcome(input, actor, now)
}

/**
 * DELETE — 되돌리기. **이 요청이 만든 쓰기만** 건드린다(머리 주석 "되돌리기"):
 *  0) 1차 기록 확인 — 계정은 source_id = today-contact:<requestId> 기록, 리드는 요청 키로 정한 로그 id. 되돌리는 사람이 작성자이고
 *     10분 안에 만든 것이어야 한다. 아니면 409 로 거절하고 할 일도 건드리지 않는다(부분 되돌리기 방지).
 *  1) 이 저장이 만든 다음 일정 할 일 취소 · 2) 이 저장이 닫은 할 일 재개 — 대상·작성자·10분 창.
 *  3) 1차 기록 삭제 · 리드는 이 저장이 신규 → 연락중으로 바꿨을 때만(confirmed_at = 로그 시각) 증거가 사라지면 신규로 ·
 *     팔로업 복원.
 */
export async function undoTodayContactOutcome(
  input: TodayContactOutcomeUndoRequest & { hasPreviousFollowUpAt: boolean },
  actor: TodayContactActor,
  now: Date = new Date()
): Promise<TodayContactOutcomeResult<TodayContactOutcomeUndoResponse>> {
  const warnings: string[] = []
  const target = input.target
  const sinceMs = now.getTime() - TODAY_CONTACT_UNDO_MAX_AGE_MS
  const sourceId = `${TODAY_CONTACT_SOURCE_ID_PREFIX}${input.requestId}`
  const refuse = (error: string): TodayContactOutcomeResult<TodayContactOutcomeUndoResponse> => ({
    ok: false,
    status: 409,
    error,
  })
  const retryLater = (warning: string): TodayContactOutcomeResult<TodayContactOutcomeUndoResponse> => ({
    ok: true,
    status: 200,
    body: { ok: false, warnings: [warning] },
  })
  let hardFailure = false

  // 0) 이 요청이 만든 1차 기록인가 — 먼저 확인하고, 아니면 아무것도 건드리지 않는다.
  let leadLog: Awaited<ReturnType<typeof getTodayContactLeadLog>> = null
  let eventCount = 0
  if (target.type === "lead") {
    if (input.contactLogId) {
      if (input.contactLogId !== todayContactLeadLogId(input.requestId, target.id)) {
        return refuse("이 저장이 만든 연락 로그가 아니어서 되돌리지 않았습니다.")
      }
      try {
        leadLog = await getTodayContactLeadLog(target.id, input.contactLogId)
      } catch (error) {
        console.error("[today-contact undo] lead log lookup", error)
        return retryLater("연락 로그를 확인하지 못했습니다. 다시 시도해 주세요.")
      }
      if (!leadLog) {
        warnings.push("연락 로그를 찾지 못했습니다(이미 지워졌을 수 있습니다).")
      } else if (!isActor(leadLog.contactedBy, actor)) {
        return refuse("다른 사람이 남긴 연락 로그라 되돌리지 않았습니다.")
      } else if (!isWithin(leadLog.contactedAt, sinceMs)) {
        return refuse("되돌릴 수 있는 시간(10분)이 지나 되돌리지 않았습니다.")
      }
    }
  } else {
    let events: Awaited<ReturnType<typeof listTodayContactEventsBySource>>
    try {
      events = await listTodayContactEventsBySource(sourceId, target.type, target.id)
    } catch (error) {
      console.error("[today-contact undo] event lookup", error)
      return retryLater("연락 기록을 확인하지 못했습니다. 다시 시도해 주세요.")
    }
    if (events.some((event) => !isActor(event.createdBy, actor))) {
      return refuse("다른 사람이 남긴 연락 기록이라 되돌리지 않았습니다.")
    }
    if (events.some((event) => !isWithin(event.createdAt, sinceMs))) {
      return refuse("되돌릴 수 있는 시간(10분)이 지나 되돌리지 않았습니다.")
    }
    eventCount = events.length
  }

  // 1) 이번 저장이 만든 다음 일정 할 일 취소 — 명시 id + 기록(미러)에서 파생된 할 일.
  const cancelIds = new Set<string>()
  if (input.nextTaskId) cancelIds.add(input.nextTaskId)
  if (input.eventId) {
    try {
      const derived = await getCrmTaskBySourceEventId(input.eventId)
      if (derived) cancelIds.add(derived.id)
    } catch (error) {
      console.error("[today-contact undo] derived task lookup", error)
    }
  }
  for (const id of cancelIds) {
    try {
      const task = await getCrmTaskById(id)
      if (!task) continue
      if (!taskMatchesTarget(task, target) || !isWithin(task.createdAt, sinceMs) || !isActor(task.createdBy, actor)) {
        warnings.push("이 저장에서 만든 할 일이 아니어서 그대로 두었습니다.")
        continue
      }
      if (task.status !== "open" && task.status !== "snoozed") continue
      await cancelCrmTask(id, { outcome: TODAY_CONTACT_UNDO_OUTCOME, completedBy: actor.name, now })
    } catch (error) {
      console.error("[today-contact undo] cancel task", id, error)
      warnings.push("다음 일정 할 일을 취소하지 못했습니다.")
    }
  }

  // 2) 이번 저장이 닫은 할 일 재개.
  for (const id of input.closedTaskIds ?? []) {
    try {
      const task = await getCrmTaskById(id)
      if (!task) continue
      if (!taskMatchesTarget(task, target) || !isWithin(task.completedAt, sinceMs) || !isActor(task.completedBy, actor)) {
        warnings.push("최근에 이 저장이 닫은 할 일이 아니어서 다시 열지 않았습니다.")
        continue
      }
      if (task.status !== "done" && task.status !== "canceled") continue
      await reopenCrmTask(id)
    } catch (error) {
      console.error("[today-contact undo] reopen task", id, error)
      warnings.push("닫은 할 일을 다시 열지 못했습니다.")
    }
  }

  if (target.type === "lead") {
    // 3a) 리드 — 연락 로그(+순수 미러) 삭제 → 이 저장이 신규를 연락중으로 바꿨고 증거가 사라졌으면 신규로 → 팔로업 복원.
    if (leadLog) {
      try {
        const removed = await deleteLeadContactLogWithMirrors(target.id, leadLog.id)
        if (!removed.deleted) {
          hardFailure = true
          warnings.push("연락 로그를 지우지 못했습니다. 다시 시도해 주세요.")
        } else {
          // 연락중 전환은 confirmed_at = 저장 시각(= 로그 연락 시각)을 찍는다. 그 흔적이 없으면 이 저장 전부터 연락중이던
          // 리드다(Compass 동기화·예전 수동 전환) — 신규로 돌리면 첫 응답·24/48h SLA·보드 집계가 틀어진다.
          const current = await getLeadById(target.id)
          const changedByThisSave =
            current?.status === "contacted" &&
            sameInstant(current.confirmed_at ?? null, leadLog.contactedAt, RETRY_CLOSE_MATCH_SLACK_MS)
          if (changedByThisSave && !(await hasLeadContactEvidence(target.id))) {
            const reverted = await updateLead(target.id, { status: "new" })
            if (!reverted) warnings.push("리드 상태를 신규로 되돌리지 못했습니다.")
          }
        }
      } catch (error) {
        console.error("[today-contact undo] lead log", error)
        hardFailure = true
        warnings.push("연락 로그를 지우지 못했습니다. 다시 시도해 주세요.")
      }
    }
    if (input.hasPreviousFollowUpAt) {
      try {
        const updated = await updateLead(target.id, {
          follow_up_at: input.previousFollowUpAt ?? null,
        } as unknown as Partial<LeadRecord>)
        if (!updated) warnings.push("팔로업 일정을 되돌리지 못했습니다.")
      } catch (error) {
        console.error("[today-contact undo] follow-up", error)
        warnings.push("팔로업 일정을 되돌리지 못했습니다.")
      }
    }
  } else if (eventCount > 0) {
    // 3b) 계정·고객·딜 — 이 요청의 기록(source_id = today-contact:<requestId>, 위에서 작성자·나이 확인)만 지운다.
    try {
      await deleteCrmCustomerEventsBySource({
        sourceTypes: ["call", "sms"],
        sourceId,
        targetType: target.type,
        targetId: target.id,
      })
    } catch (error) {
      console.error("[today-contact undo] delete event", error)
      hardFailure = true
      warnings.push("연락 기록을 지우지 못했습니다. 다시 시도해 주세요.")
    }
  }

  invalidateCrmTodayContacts("expire")
  return { ok: true, status: 200, body: { ok: !hardFailure, warnings: [...new Set(warnings)] } }
}
