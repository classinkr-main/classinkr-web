// REV 시트 쓰기(ADR-011, 장부 반영 → '2. REV') 화면 쪽 순수 헬퍼 — 렌더 없이 테스트한다.
//
// 서버(app/api/admin/branch/ledger-drafts)가 내려 주는 sheetWrite·sheetWrites·항목별 sheet 를 받아
//  - 이중 집계 제외(isSheetWriteAbsorbed — 시트에 쓴 정정을 미러가 이미 읽었으면 오버레이에서 뺀다),
//  - 초안 baseline(초안을 만들 때 본 시트 칸 — 반영 직전에 서버가 시트와 다시 맞춘다),
//  - 칸 아래 힌트(서버와 같은 planWeekWrites 로 "어느 주차에 쓰는지/왜 막히는지"),
//  - 결과 줄·큐 배지 문구(코드 → messages.ts 고정 문구)
// 를 만든다. 판정 규칙의 정본은 lib/branch/sheet-writeback/* 이고 여기서는 그 함수를 부르기만 한다
// (클라이언트 겸용 모듈만 import — server-only 금지).

import { sheetWrittenReverseLockedMessage, type RevSheetLockView } from "@/lib/branch/rev-sheet-lock"
import { buildSheetBaseline, type SheetBaselineV1 } from "@/lib/branch/sheet-writeback/baseline"
import type { DraftConfidenceLike, WeekColor } from "@/lib/branch/sheet-writeback/colors"
import { REV_WRITE_MAX_DRAFTS, type SheetWriteMode } from "@/lib/branch/sheet-writeback/config"
import {
  absorptionCutoff,
  isSheetWriteAbsorbed,
  oldestSyncedAt,
  SHEET_WRITE_ATTEMPT_STATUSES,
  sheetWriteBlocksReverse,
  type SheetWriteAttemptStatus,
} from "@/lib/branch/sheet-writeback/ledger-rules"
import {
  isSheetWriteCode,
  SHEET_WRITE_HISTORY_DELETE_MESSAGE,
  SHEET_WRITE_MESSAGES,
  SHEET_WRITTEN_REVERSE_MESSAGE,
  type SheetWriteCode,
} from "@/lib/branch/sheet-writeback/messages"
import { isValidRowId } from "@/lib/branch/sheet-writeback/row-id"
import { sheetWriteHint } from "@/lib/branch/sheet-writeback/target"

export type { SheetWriteMode } from "@/lib/branch/sheet-writeback/config"

/** 일괄 반영 한 요청의 건수 — 켜짐이면 서버가 50건 넘는 몫을 400 으로 돌려준다(config REV_WRITE_MAX_DRAFTS). */
export const LEDGER_DRAFT_APPLY_LIMIT = REV_WRITE_MAX_DRAFTS

/**
 * 반영 요청의 클라이언트 마감. 서버 라우트 maxDuration(60s — 시트 읽기 8s + 쓰기 8s + 되돌리기 8s + DB)보다
 * 길게 둔다 — 기본 45s 로 먼저 끊으면 서버는 시트에 쓰고 있는데 화면은 실패로 센다.
 */
export const LEDGER_APPLY_CLIENT_TIMEOUT_MS = 65_000

export type SheetWriteStatus = SheetWriteAttemptStatus

const SHEET_WRITE_STATUSES: readonly SheetWriteStatus[] = SHEET_WRITE_ATTEMPT_STATUSES

/** GET /api/admin/branch/ledger-drafts 의 sheetWrites[draftId] — 그 초안의 가장 최근 시트 쓰기 시도. */
export interface SheetWriteView {
  status: SheetWriteStatus
  code: string
  message: string
  writtenAt: string | null
  rowId: string | null
}

/** GET 의 sheetWrite — 스위치(mode)와 마지막으로 성공한 REV 동기화 시작 시각. */
export interface SheetWriteState {
  mode: SheetWriteMode
  lastRevSyncStartedAt: string | null
  /** 감사 표·동기화 시각 조회 실패 안내(서버 문구). 없으면 null. */
  healthMessage: string | null
  /**
   * 시트 고정(lib/branch/rev-sheet-lock.ts, env BRANCH_REV_SHEET_LOCKED_AT) — 예정·적용 중일 때만 서버가 싣는다.
   * 없거나 모양이 틀리면 null(= 고정 없음, 지금과 같은 화면).
   */
  lock: RevSheetLockView | null
}

export const SHEET_WRITE_STATE_OFF: SheetWriteState = { mode: "off", lastRevSyncStartedAt: null, healthMessage: null, lock: null }

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/** sheetWrite.lock — lockedAt 이 YYYY-MM-DD 이고 active 가 불리언일 때만 받는다. 그 밖(없음·모양 틀림)은 null. */
export function parseSheetWriteLock(raw: unknown): RevSheetLockView | null {
  if (!isRecord(raw)) return null
  const lockedAt = typeof raw.lockedAt === "string" ? raw.lockedAt.trim() : ""
  if (!YMD_RE.test(lockedAt) || typeof raw.active !== "boolean") return null
  return { lockedAt, active: raw.active }
}

/** 시트 고정이 적용 중인가(고정 날짜 당일·이후). 예정·없음은 false. */
export function isSheetLockActive(state: Pick<SheetWriteState, "lock"> | null | undefined): boolean {
  return state?.lock?.active === true
}

/**
 * 신뢰 경계를 넘어온 sheetWrite — 모양이 틀리면 꺼짐으로 본다(꺼짐 = 지금과 같은 화면).
 * 시트 고정이 적용 중이면 서버도 mode 를 늘 off 로 보내지만(config.ts), 화면은 한 번 더 off 로 둔다 — 고정 뒤에
 * "시트·장부에 반영" 문구가 남지 않게.
 */
export function parseSheetWriteState(raw: unknown): SheetWriteState {
  if (!isRecord(raw)) return SHEET_WRITE_STATE_OFF
  const health = isRecord(raw.health) ? raw.health : null
  const lock = parseSheetWriteLock(raw.lock)
  return {
    mode: raw.mode === "on" && lock?.active !== true ? "on" : "off",
    lastRevSyncStartedAt: optionalText(raw.lastRevSyncStartedAt),
    healthMessage: health && health.ok === false ? optionalText(health.message) : null,
    lock,
  }
}

/** 신뢰 경계를 넘어온 sheetWrites — 모양이 틀린 항목은 버린다. */
export function parseSheetWrites(raw: unknown): Record<string, SheetWriteView> {
  const out: Record<string, SheetWriteView> = {}
  if (!isRecord(raw)) return out
  for (const [draftId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue
    const status = value.status
    if (typeof status !== "string" || !(SHEET_WRITE_STATUSES as readonly string[]).includes(status)) continue
    if (typeof value.code !== "string") continue
    const code = value.code
    out[draftId] = {
      status: status as SheetWriteStatus,
      code,
      message: optionalText(value.message) ?? (isSheetWriteCode(code) ? SHEET_WRITE_MESSAGES[code] : code),
      writtenAt: optionalText(value.writtenAt),
      rowId: optionalText(value.rowId),
    }
  }
  return out
}

/**
 * 시트에 쓴 정정을 미러가 이미 읽었는가 — 그 초안을 오버레이에 또 얹으면 같은 금액이 시트 행 값과 적용 초안
 * 양쪽에서 읽힌다. 정본은 lib/branch/sheet-writeback/ledger-rules.ts(서버 미반영 배너와 같은 함수)다.
 * 기준 시각은 absorptionCutoff(서버의 마지막 성공 동기화 ↔ 화면이 가진 시트 행의 데이터 시각 중 이른 쪽)다.
 */
export { absorptionCutoff, isSheetWriteAbsorbed, oldestSyncedAt }

/**
 * 오버레이에서 뺄 초안 id·적용 초안 오버레이에서 미러가 이미 읽은 시트 쓰기 초안 빼기 — 정본은 lib/branch/ledger-overlay.ts
 * (화면·서버 오버레이가 같은 함수를 쓴다). cutoff 는 absorptionCutoff(lastRevSyncStartedAt, 화면 시트 행의 oldestSyncedAt).
 */
export { excludeSheetAbsorbedRows, sheetAbsorbedDraftIds } from "@/lib/branch/ledger-overlay"

/** baseline 을 만들 수 있는 시트 행(BranchPipelineRow 의 부분집합). */
export interface SheetRowLike {
  customer: string
  sheetRow?: number | null
  rowId?: string | null
  rowIdIssue?: string | null
  firstPayment?: string | null
  weeklyPayments?: Record<string, number[]>
  weeklyColors?: Record<string, string>
}

/**
 * 초안에 싣는 baseline(sourceSnapshot.sheetBaseline). 행이 없으면 null. 칸이 4개인 달(2월)을 시트 칸 수로
 * 자르는 일은 buildSheetBaseline(core) 이 한다 — 여기서 따로 자르지 않는다(사본 금지).
 */
export function sheetBaselineForRow(
  row: SheetRowLike | null | undefined,
  month: string,
  capturedAt: string,
): SheetBaselineV1 | null {
  if (!row) return null
  return buildSheetBaseline(
    {
      rowId: row.rowId ?? null,
      sheetRow: row.sheetRow ?? null,
      customer: row.customer,
      weeklyPayments: row.weeklyPayments,
      weeklyColors: row.weeklyColors,
    },
    month,
    capturedAt,
  )
}

/** baseline 에 그 달 칸이 없을 때(값 없는 달) 힌트가 쓰는 칸 수 — 서버는 live 머리로 정한다. 2월만 4칸. */
function assumedWeekCount(month: string): number {
  return month.endsWith("-02") ? 4 : 5
}

export interface SheetHint {
  tone: "info" | "block"
  text: string
}

export interface CellSheetHintInput {
  kind: "new-row" | "edit-row"
  /** edit-row 가 가리키는 시트 행(미러). 못 찾으면 null. */
  sheetRow: SheetRowLike | null | undefined
  month: string
  /** 입력칸 금액(원 단위). 아직 숫자가 없으면 null — 힌트를 보이지 않는다. */
  amount: number | null
  confidence: DraftConfidenceLike
  confidenceTouched: boolean
  /** KST YYYY-MM-DD */
  today: string
  capturedAt?: string
  /**
   * 주차 칸 커밋(F-35) — 그 달 주차 5칸(metadata.weekly, mergeWeekCellCommit). 있으면 amount 는 주차 합이고 서버 반영과 같이
   * 주차 단위로 판정한다(지난 주차 · 칸 수). 없으면 월 칸 입력.
   */
  weekly?: number[] | null
  /** 주차별 확도(metadata.weeklyConfidence). */
  weeklyConfidence?: Array<DraftConfidenceLike | null> | null
  /** 주차별 확도 직접 선택 표시(metadata.weeklyConfidenceTouched). */
  weeklyConfidenceTouched?: boolean[] | null
  /** 고친 주차(0~4, metadata.week). */
  week?: number | null
}

/**
 * 월 칸(주차 없음) 입력의 칸 아래 한 줄. 주차 칸 커밋이면(weekly) 그 주차 5칸으로 판정한다(F-35). 서버 plan.ts 와 같은 판정(planWeekWrites)을 미러 값으로 미리 돌린다 —
 * block 이면 화면이 저장을 막는다(그 초안은 켜짐 상태에서 반영할 수 없다). 시트가 그 사이 바뀌었는지는
 * 반영 직전에 서버가 다시 읽어 판정한다(conflict). 시트 쓰기가 꺼져 있으면 호출부가 부르지 않는다.
 */
export function cellSheetWriteHint(input: CellSheetHintInput): SheetHint | null {
  if (input.amount == null) return null
  if (input.kind === "new-row") return { tone: "info", text: SHEET_WRITE_MESSAGES.new_row_app_only }
  const row = input.sheetRow
  if (!row) return { tone: "block", text: SHEET_WRITE_MESSAGES.row_not_found }
  if (row.rowIdIssue === "duplicate") return { tone: "block", text: SHEET_WRITE_MESSAGES.row_id_duplicate }
  if (!isValidRowId(row.rowId)) return { tone: "block", text: SHEET_WRITE_MESSAGES.no_row_id }
  const baseline = sheetBaselineForRow(row, input.month, input.capturedAt ?? new Date().toISOString())
  if (!baseline) return { tone: "block", text: SHEET_WRITE_MESSAGES.no_baseline }
  const baselineWeeks: Array<{ value: number; color: WeekColor }> = baseline.weeks.length > 0
    ? baseline.weeks
    : Array.from({ length: assumedWeekCount(input.month) }, () => ({ value: 0, color: "k" as WeekColor }))
  const firstPayment = typeof row.firstPayment === "string" && YMD_RE.test(row.firstPayment.trim()) ? row.firstPayment.trim() : null
  return sheetWriteHint({
    month: input.month,
    baselineWeeks,
    draftAmount: input.amount,
    draftWeekly: input.weekly ?? null,
    draftConfidence: input.confidence,
    draftWeeklyConfidence: input.weekly ? input.weeklyConfidence ?? null : null,
    confidenceTouched: input.confidenceTouched,
    ...(input.weekly ? { draftWeeklyConfidenceTouched: input.weeklyConfidenceTouched ?? null, draftWeek: input.week ?? null } : {}),
    firstPayment,
    today: input.today,
  })
}

// ── 반영 결과 ────────────────────────────────────────────────────────────────

/** 반영 응답 항목 하나(배치 results[i] 또는 단건 응답)를 화면용으로 줄인 것. */
export interface ApplySheetOutcome {
  id: string
  ok: boolean
  status: number
  /** 시트 쓰기 결과 코드. 응답을 못 받았거나(네트워크·마감) 서버가 sheet 를 싣지 않았으면 null. */
  code: SheetWriteCode | null
  message: string | null
  error: string | null
}

/** 응답의 sheet: { code, message } — 모르는 코드는 버린다(닫힌 목록). */
export function readApplySheet(raw: unknown): { code: SheetWriteCode; message: string } | null {
  if (!isRecord(raw) || !isSheetWriteCode(raw.code)) return null
  return { code: raw.code, message: optionalText(raw.message) ?? SHEET_WRITE_MESSAGES[raw.code] }
}

/**
 * 응답을 받지 못한 반영(네트워크 끊김·마감 초과·게이트웨이 504) — 서버가 장부에 썼는지 모른다. 실패로 단정하지 않고 목록을
 * 다시 읽어 확인하게 한다(F-33). 훅은 이 문구를 보이기 전에 목록을 다시 읽어, 그사이 적용완료가 된 초안은 성공으로 센다
 * (settleNoResponseOutcomes).
 */
export const APPLY_NO_RESPONSE_MESSAGE = "응답을 받지 못했습니다 — 새로고침해 결과를 확인한 뒤 다시 시도하세요"

/** 보내려던 초안이 전부 이미 다른 곳(결재 바·큐 일괄·줄 적용)에서 반영 중이라 보내지 않았을 때의 결과 줄(F-20). */
export const APPLY_SKIPPED_IN_FLIGHT_MESSAGE = "이미 반영 중인 초안이라 다시 보내지 않았습니다"

// ── 서버 오류 문구 → 화면 문구 ────────────────────────────────────────────────
// 라우트(app/api/admin/branch/ledger-drafts/**)·인증·브라우저가 던지는 영어 문구를 그대로 보이지 않는다(F-33).
// 한국어 문구(서버가 이미 번역한 것)는 그대로 둔다.

const SERVER_ERROR_TEXT: Readonly<Record<string, string>> = {
  "Failed to create sales ledger draft": "서버가 초안을 저장하지 못했습니다",
  "Failed to update sales ledger draft": "서버가 초안을 저장하지 못했습니다",
  "Failed to delete sales ledger draft": "서버가 초안을 지우지 못했습니다",
  "Failed to load sales ledger drafts": "서버가 초안 목록을 읽지 못했습니다",
  "Failed to process sales ledger draft batch": "서버가 일괄 요청을 처리하지 못했습니다",
  "Draft not found": "서버에서 이 초안을 찾을 수 없습니다",
  "Use action=apply to apply a checked draft": "적용은 적용 버튼으로만 할 수 있습니다",
  Forbidden: "이 작업을 할 권한이 없습니다",
  Unauthorized: "로그인이 풀렸습니다 — 다시 로그인하세요",
}
// 요청 모양이 틀렸다는 라우트 검증 문구 — 화면이 오래됐을 때 난다.
const REQUEST_SHAPE_ERROR_RE =
  /^(Invalid JSON body|input must be an object|Invalid batch item|ids must be non-empty strings|id must be a non-empty string|expectedUpdatedAt must be a non-empty string|reason must be a string|Unsupported action:.*|action must be .*)$/
// 브라우저 fetch 의 네트워크 실패 문구(브라우저마다 다르다).
const NETWORK_ERROR_RE = /^(failed to fetch|fetch failed|load failed|network ?error.*|the network connection was lost\.?|the internet connection appears to be offline\.?)$/i
const HANGUL_RE = /[가-힣]/

/** 요청 실패 → 화면에 보일 한국어 한 마디. 알 수 없는 영어 문구는 원문 대신 일반 문구로 바꾼다. */
export function koreanRequestError(error: unknown): string {
  const raw = (error instanceof Error ? error.message : typeof error === "string" ? error : "").trim()
  if (!raw) return "알 수 없는 오류가 났습니다"
  const mapped = SERVER_ERROR_TEXT[raw]
  if (mapped) return mapped
  if (REQUEST_SHAPE_ERROR_RE.test(raw)) return "요청 모양이 맞지 않습니다 — 새로고침한 뒤 다시 시도하세요"
  if (NETWORK_ERROR_RE.test(raw)) return "서버에 연결하지 못했습니다"
  if (HANGUL_RE.test(raw)) return raw
  if (error instanceof Error && error.name === "AbortError") return "요청이 중단됐습니다"
  const status = /^(\d{3})\b/.exec(raw)
  if (status) return `서버 오류(${status[1]})`
  return "서버 오류가 났습니다"
}

/**
 * 반영 응답 항목 → 화면 결과(ApprovalBar 결과 줄·큐 배너). 배치는 results[i](ok·status 가 실려 온다), 단건은
 * 응답 바디 + HTTP 상태(httpStatus). 성공은 draft 가 있고 ok 일 때만 — 202(시트 반영 여부 모름)는 2xx 지만
 * 반영 실패이고, 409(시트 거절·충돌)·502(시트 호출 실패) 등도 sheet 코드와 함께 실패로 센다(부분 성공을
 * 성공으로 숨기지 않는다). result 가 없으면(서버가 그 id 를 빠뜨림) 응답 없음으로 본다. 서버 오류 문구는 한국어로.
 */
export function toApplyOutcome(
  id: string,
  result: { ok?: boolean; status?: number; draft?: unknown; error?: string; sheet?: unknown } | null | undefined,
  httpStatus?: number,
): ApplySheetOutcome {
  const sheet = readApplySheet(result?.sheet)
  const status = typeof result?.status === "number" ? result.status : httpStatus ?? 0
  const okFlag = typeof result?.ok === "boolean"
    ? result.ok
    : httpStatus != null && httpStatus >= 200 && httpStatus < 300 && httpStatus !== 202
  const ok = Boolean(result?.draft) && okFlag
  const serverError = optionalText(result?.error)
  const failureReason = serverError ? koreanRequestError(serverError) : (sheet?.message ?? APPLY_NO_RESPONSE_MESSAGE)
  return {
    id,
    ok,
    status,
    code: sheet?.code ?? null,
    message: sheet?.message ?? null,
    error: ok ? null : failureReason,
  }
}

/**
 * 응답을 받지 못한 반영인가 — 시트 코드 없이 상태 0(네트워크·마감) 또는 504(게이트웨이 마감). 서버가 장부에 썼는지
 * 모르므로 "실패"가 아니라 "확인 필요"로 말한다.
 */
export function isNoResponseOutcome(outcome: Pick<ApplySheetOutcome, "ok" | "code" | "status">): boolean {
  return !outcome.ok && outcome.code == null && (outcome.status === 0 || outcome.status === 504)
}

/**
 * 응답을 못 받은 반영을 다시 읽은 목록과 맞춘다 — 그사이 적용완료(applied)가 된 초안은 성공으로 센다(서버가 반영을
 * 마쳤다). 목록을 못 읽었으면(null) 그대로 둔다.
 */
export function settleNoResponseOutcomes(
  outcomes: readonly ApplySheetOutcome[],
  drafts: ReadonlyArray<{ id: string; status: string }> | null | undefined,
): ApplySheetOutcome[] {
  if (!drafts) return [...outcomes]
  const applied = new Set(drafts.filter((draft) => draft.status === "applied").map((draft) => draft.id))
  return outcomes.map((outcome) => (isNoResponseOutcome(outcome) && applied.has(outcome.id) ? { ...outcome, ok: true, error: null } : outcome))
}

// ── 화면 전체 문제(시트 잠김·권한) ─────────────────────────────────────────────
// sheet_permission·sheet_locked 는 행마다 다시 눌러도 같다 — 관리자가 시트 쓰기를 끄거나(또는 고정 날짜를 넣거나) 권한을
// 고쳐야 풀린다. 그래서 행별 "다시 적용하세요" 대신 화면 한 곳(배너)에서 한 번만 말한다(F-07).

export type PageLevelSheetCode = Extract<SheetWriteCode, "sheet_permission" | "sheet_locked">

export function isPageLevelSheetCode(code: string | null | undefined): code is PageLevelSheetCode {
  return code === "sheet_permission" || code === "sheet_locked"
}

/** 화면 한 줄 문구 — 잠김은 messages.ts 문구 그대로, 권한은 누가 무엇을 해야 하는지까지. */
export function sheetWritePageMessage(code: PageLevelSheetCode): string {
  const base = SHEET_WRITE_MESSAGES[code]
  if (code === "sheet_locked" || base.includes("관리자")) return base
  return `${base} — 관리자에게 시트 쓰기 끄기나 시트 권한 확인을 요청하세요`
}

export interface SheetWritePageProblem {
  code: PageLevelSheetCode
  message: string
  /** 그 코드로 막힌 체크완료 초안 수(두 코드 합). */
  count: number
}

/**
 * 화면 배너용 — 체크완료(아직 반영 안 됨) 초안 중 마지막 시트 쓰기 시도가 잠김·권한으로 막힌 것이 있으면 한 건으로 묶어
 * 돌려준다(잠김이 하나라도 있으면 잠김 문구). 시트 쓰기가 꺼졌거나 시트 고정이 적용 중이면 null — 다시 반영하면 장부에만
 * 기록되므로 더는 막힌 상태가 아니다(행 배지는 기록으로 남는다).
 */
export function sheetWritePageProblem(
  sheetWrites: Readonly<Record<string, Pick<SheetWriteView, "code">>>,
  drafts: ReadonlyArray<{ id: string; status: string }>,
  state?: Pick<SheetWriteState, "mode" | "lock"> | null,
): SheetWritePageProblem | null {
  if (state && (state.mode !== "on" || state.lock?.active === true)) return null
  let locked = 0
  let permission = 0
  for (const draft of drafts) {
    if (draft.status !== "checked") continue
    const code = sheetWrites[draft.id]?.code
    if (code === "sheet_locked") locked += 1
    else if (code === "sheet_permission") permission += 1
  }
  if (locked + permission === 0) return null
  const code: PageLevelSheetCode = locked > 0 ? "sheet_locked" : "sheet_permission"
  return { code, message: sheetWritePageMessage(code), count: locked + permission }
}

/**
 * 실패 중에 행마다 사유를 봐야 하는 것이 있는가 — 응답 없음(새로고침 안내)·화면 전체 문제(관리자 안내)는 문구가 이미 할
 * 일을 말하므로 "모두 보기에서 사유 확인"을 붙이지 않는다.
 */
export function applyFailuresNeedDetail(outcomes: readonly ApplySheetOutcome[]): boolean {
  return outcomes.some((outcome) => !outcome.ok && !isNoResponseOutcome(outcome) && !isPageLevelSheetCode(outcome.code))
}

/**
 * 반영 실패를 큐 배너 한 줄로(훅의 queueError). 성공만이면 null.
 *  - 응답 없음 → 새로고침해 확인(실패로 단정하지 않는다).
 *  - 잠김·권한 → 화면 문제 한 줄(행마다 다시 하라고 하지 않는다).
 *  - 그 밖 → 시트 고정 전엔 지금 문구, 고정 뒤엔 "시트·DB" 없이 체크 큐에서 사유 확인.
 * single 은 단건 적용(건수 없이 그 초안 사유).
 */
export function applyQueueNotice(
  outcomes: readonly ApplySheetOutcome[],
  options: { locked?: boolean; single?: boolean } = {},
): string | null {
  const failed = outcomes.filter((outcome) => !outcome.ok)
  if (failed.length === 0) return null
  if (options.single) {
    const outcome = failed[0]
    if (isNoResponseOutcome(outcome)) return APPLY_NO_RESPONSE_MESSAGE
    if (isPageLevelSheetCode(outcome.code)) return sheetWritePageMessage(outcome.code)
    const reason = outcome.error ?? (outcome.code ? SHEET_WRITE_MESSAGES[outcome.code] : null)
    const head = options.locked ? "장부 반영에 실패했습니다" : "DB 장부 반영에 실패했습니다"
    return reason ? `${head} — ${reason}` : head
  }
  const noResponse = failed.filter(isNoResponseOutcome).length
  const page = failed.filter((outcome) => isPageLevelSheetCode(outcome.code))
  const rest = failed.length - noResponse - page.length
  const parts: string[] = []
  if (page.length > 0) {
    const code: PageLevelSheetCode = page.some((outcome) => outcome.code === "sheet_locked") ? "sheet_locked" : "sheet_permission"
    parts.push(`${page.length}건 ${sheetWritePageMessage(code)}`)
  }
  if (noResponse > 0) parts.push(`${noResponse}건 ${APPLY_NO_RESPONSE_MESSAGE}`)
  if (rest > 0) {
    parts.push(
      options.locked
        ? `${rest}건이 장부에 반영되지 않았습니다 — 체크 큐에서 사유를 확인하세요`
        : `일괄 적용 중 ${rest}건이 DB 장부에 반영되지 않았습니다 — 해당 행에서 다시 적용하세요.`,
    )
  }
  return parts.join(" · ")
}

const SUCCESS_LABELS: Partial<Record<SheetWriteCode, string>> = {
  written: "시트에 반영",
  already_written: "장부만 기록(시트에 이미 같은 값)",
  no_change: "장부만 기록(시트에서 바뀌는 칸 없음)",
  new_row_app_only: "장부에만(새 행)",
  disabled: "장부에만",
}

/**
 * 실패 묶음 이름 — 응답 없음은 새로고침 안내, 코드가 있으면 messages.ts 문구(충돌만 짧게), 코드 없이 서버가 사유를
 * 보냈으면 그 사유(한국어로 바꾼 것).
 */
function failureLabel(outcome: ApplySheetOutcome): string {
  if (isNoResponseOutcome(outcome)) return APPLY_NO_RESPONSE_MESSAGE
  if (outcome.code == null) return outcome.error ?? APPLY_NO_RESPONSE_MESSAGE
  if (outcome.code === "conflict") return "충돌 — 시트가 바뀌었습니다"
  return SHEET_WRITE_MESSAGES[outcome.code]
}

/**
 * 결과 줄 — 코드별 건수("3건 시트에 반영 · 1건 충돌 — 시트가 바뀌었습니다 · 1건 장부에만(새 행)").
 * 시트 쓰기가 꺼져 있었고(전부 disabled 이거나 sheet 없음) 실패도 없으면 null — 호출부가 기존 문구를 쓴다. 꺼져 있어도
 * 실패가 있으면 사유별로 센다(응답 없음을 "실패"로 뭉뚱그리지 않는다).
 */
export function summarizeApplyOutcomes(outcomes: readonly ApplySheetOutcome[]): { text: string; failed: boolean } | null {
  if (outcomes.length === 0) return null
  const sheetAware = outcomes.some((outcome) => outcome.code != null && outcome.code !== "disabled")
  const anyFailed = outcomes.some((outcome) => !outcome.ok)
  if (!sheetAware && !anyFailed) return null
  const order: string[] = []
  const counts = new Map<string, number>()
  let failed = false
  const bump = (label: string) => {
    if (!counts.has(label)) order.push(label)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  // 성공 묶음을 앞에, 실패 묶음을 뒤에 — 같은 코드는 한 덩어리로 센다. 시트를 건드리지 않은 반영(꺼짐)은 "반영됨".
  for (const outcome of outcomes) {
    const label = outcome.code && (sheetAware || outcome.code !== "disabled") ? SUCCESS_LABELS[outcome.code] : undefined
    if (outcome.ok && label) bump(label)
    else if (outcome.ok) bump("반영됨")
  }
  for (const outcome of outcomes) {
    if (outcome.ok) continue
    failed = true
    bump(failureLabel(outcome))
  }
  return { text: order.map((label) => `${counts.get(label)}건 ${label}`).join(" · "), failed }
}

// ── 큐 행 배지 ───────────────────────────────────────────────────────────────

export type SheetWriteBadgeTone = "success" | "warning" | "danger" | "neutral"

export interface SheetWriteBadge {
  label: string
  tone: SheetWriteBadgeTone
  /** 자세한 문구(messages.ts) — title·스크린리더용, 실패면 행 아래 한 줄로도 보인다. */
  message: string
}

/** 큐 행 배지: 시트 반영됨 · 충돌 · 확인 중 · 실패 · 장부에만. */
export function sheetWriteBadge(view: SheetWriteView): SheetWriteBadge {
  const code = isSheetWriteCode(view.code) ? view.code : null
  const message = view.message
  if (code === "new_row_app_only" || code === "disabled") return { label: "장부에만", tone: "neutral", message }
  if (view.status === "sending" || view.status === "unknown" || code === "outcome_unknown") {
    return { label: "확인 중", tone: "warning", message }
  }
  if (code === "conflict") return { label: "충돌", tone: "danger", message }
  // 시트가 쓰기를 거부했다(보호·뷰어) — 행 문제가 아니라 화면 전체 문제다(sheetWritePageProblem). 관리자 조치 대기라 경고 톤.
  if (code === "sheet_locked") return { label: "시트 잠김", tone: "warning", message }
  // 같은 시트 행·월에 활성 정정이 이미 있어 서버가 반영을 거절했다(F-04) — 기존 정정을 되돌리면 풀린다.
  if (code === "row_corrected") return { label: "정정 겹침", tone: "warning", message }
  // 시트에서 바뀌는 칸이 없었다 — 시트에 쓴 것이 없으니 "시트 반영됨"이라고 말하지 않는다.
  if (view.status === "written" && code === "no_change") return { label: "장부에만", tone: "neutral", message }
  // written 이어도 장부 기록이 안 된 갈래(db_apply_failed·draft_changed)는 실패로 보인다.
  if (view.status === "written" && code !== "db_apply_failed" && code !== "draft_changed") {
    return { label: "시트 반영됨", tone: "success", message }
  }
  return { label: "실패", tone: "danger", message }
}

/**
 * 시트에 쓴 정정은 장부에서만 상쇄하지 않는다 — 서버(PATCH action=reverse)가 409 로 막는 조건과 같은 함수
 * (ledger-rules.ts sheetWriteBlocksReverse — 바뀌는 칸이 없던 no_change 는 막지 않는다). 큐의 되돌리기 버튼을 미리
 * 끄고 이유를 title 로 보인다.
 */
export function blocksLedgerReverse(view: Pick<SheetWriteView, "status" | "code"> | null | undefined): boolean {
  return sheetWriteBlocksReverse(view?.status, view?.code)
}

/**
 * 시트 쓰기 시도 기록이 있는 초안은 하드 삭제할 수 없다(감사 기록 FK — DELETE 라우트가 409). 큐는 삭제 버튼 대신
 * 취소로 정리하게 한다. 기록이 하나라도 있으면(거절·실패 포함) true.
 */
export function blocksLedgerDelete(view: SheetWriteView | null | undefined): boolean {
  return view != null
}

/** 서버 되돌리기 가드 문구 — 라우트와 같은 상수(messages.ts). 삭제 가드 문구도 같다. */
export { SHEET_WRITE_HISTORY_DELETE_MESSAGE, SHEET_WRITTEN_REVERSE_MESSAGE }

/**
 * 되돌리기가 막힌 이유(큐 버튼 title) — 라우트 409 와 같은 문구. 시트 고정이 적용 중이면 "시트에서 직접 되돌리기"를 더 할 수
 * 없으므로 장부에서 원래 값으로 다시 입력하라는 고정 뒤 문구(F-22, rev-sheet-lock.ts)를 쓴다.
 */
export function sheetWrittenReverseMessage(lock: RevSheetLockView | null | undefined): string {
  return lock?.active ? sheetWrittenReverseLockedMessage(lock.lockedAt) : SHEET_WRITTEN_REVERSE_MESSAGE
}

/** 장부 상단 한 줄 — 켜짐일 때만. */
export const SHEET_WRITE_ON_NOTICE = "반영하면 '2. REV' 시트에도 씁니다 · 지난 주차 금액은 시트에서 직접(이번 달 지난 주는 확도만)"
