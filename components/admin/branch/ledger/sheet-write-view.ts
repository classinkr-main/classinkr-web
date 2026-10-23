// REV 시트 쓰기(ADR-011, 장부 반영 → '2. REV') 화면 쪽 순수 헬퍼 — 렌더 없이 테스트한다.
//
// 서버(app/api/admin/branch/ledger-drafts)가 내려 주는 sheetWrite·sheetWrites·항목별 sheet 를 받아
//  - 이중 집계 제외(isSheetWriteAbsorbed — 시트에 쓴 정정을 미러가 이미 읽었으면 오버레이에서 뺀다),
//  - 초안 baseline(초안을 만들 때 본 시트 칸 — 반영 직전에 서버가 시트와 다시 맞춘다),
//  - 칸 아래 힌트(서버와 같은 planWeekWrites 로 "어느 주차에 쓰는지/왜 막히는지"),
//  - 결과 줄·큐 배지 문구(코드 → messages.ts 고정 문구)
// 를 만든다. 판정 규칙의 정본은 lib/branch/sheet-writeback/* 이고 여기서는 그 함수를 부르기만 한다
// (클라이언트 겸용 모듈만 import — server-only 금지).

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
}

export const SHEET_WRITE_STATE_OFF: SheetWriteState = { mode: "off", lastRevSyncStartedAt: null, healthMessage: null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/** 신뢰 경계를 넘어온 sheetWrite — 모양이 틀리면 꺼짐으로 본다(꺼짐 = 지금과 같은 화면). */
export function parseSheetWriteState(raw: unknown): SheetWriteState {
  if (!isRecord(raw)) return SHEET_WRITE_STATE_OFF
  const health = isRecord(raw.health) ? raw.health : null
  return {
    mode: raw.mode === "on" ? "on" : "off",
    lastRevSyncStartedAt: optionalText(raw.lastRevSyncStartedAt),
    healthMessage: health && health.ok === false ? optionalText(health.message) : null,
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
 * 오버레이에서 뺄 초안 id. cutoff 는 absorptionCutoff(lastRevSyncStartedAt, 화면 시트 행의 oldestSyncedAt) —
 * 서버 동기화 시각만 쓰면 화면이 그 동기화 전 행을 들고 있을 때(다른 화면이 동기화·동기화 직후 SWR·재캡처 실패) 정정이
 * 화면에서 사라진다.
 */
export function sheetAbsorbedDraftIds(
  sheetWrites: Readonly<Record<string, SheetWriteView>>,
  cutoff: string | null,
): Set<string> {
  const ids = new Set<string>()
  if (!cutoff) return ids
  for (const [draftId, sw] of Object.entries(sheetWrites)) {
    if (isSheetWriteAbsorbed(sw, cutoff)) ids.add(draftId)
  }
  return ids
}

/** 적용 초안 오버레이에서 미러가 이미 읽은 시트 쓰기 초안을 뺀다(draftId 없는 행은 그대로). */
export function excludeSheetAbsorbedRows<T extends { draftId?: string }>(rows: T[], absorbed: ReadonlySet<string>): T[] {
  if (absorbed.size === 0) return rows
  return rows.filter((row) => !row.draftId || !absorbed.has(row.draftId))
}

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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

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
}

/**
 * 월 칸(주차 없음) 입력의 칸 아래 한 줄. 서버 plan.ts 와 같은 판정(planWeekWrites)을 미러 값으로 미리 돌린다 —
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
    draftWeekly: null,
    draftConfidence: input.confidence,
    draftWeeklyConfidence: null,
    confidenceTouched: input.confidenceTouched,
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

/** 응답을 받지 못한 항목(청크 요청 자체 실패) — 서버가 썼는지 모르므로 새로고침 뒤 다시 반영을 권한다. */
export const APPLY_NO_RESPONSE_MESSAGE = "응답을 받지 못했습니다 — 새로고침해 결과를 확인한 뒤 다시 반영해 주세요"

/**
 * 반영 응답 항목 → 화면 결과(ApprovalBar 결과 줄·큐 배너). 배치는 results[i](ok·status 가 실려 온다), 단건은
 * 응답 바디 + HTTP 상태(httpStatus). 성공은 draft 가 있고 ok 일 때만 — 202(시트 반영 여부 모름)는 2xx 지만
 * 반영 실패이고, 409(시트 거절·충돌)·502(시트 호출 실패) 등도 sheet 코드와 함께 실패로 센다(부분 성공을
 * 성공으로 숨기지 않는다). result 가 없으면(서버가 그 id 를 빠뜨림) 응답 없음으로 본다.
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
  return {
    id,
    ok,
    status,
    code: sheet?.code ?? null,
    message: sheet?.message ?? null,
    error: ok ? null : (optionalText(result?.error) ?? sheet?.message ?? APPLY_NO_RESPONSE_MESSAGE),
  }
}

const SUCCESS_LABELS: Partial<Record<SheetWriteCode, string>> = {
  written: "시트에 반영",
  already_written: "장부만 기록(시트에 이미 같은 값)",
  no_change: "장부만 기록(시트에서 바뀌는 칸 없음)",
  new_row_app_only: "장부에만(새 행)",
  disabled: "장부에만",
}

/** 실패 코드는 messages.ts 문구 그대로 — 충돌만 앞에 "충돌"을 붙여 짧게 읽히게 한다. */
function failureLabel(code: SheetWriteCode | null): string {
  if (code == null) return APPLY_NO_RESPONSE_MESSAGE
  if (code === "conflict") return "충돌 — 시트가 바뀌었습니다"
  return SHEET_WRITE_MESSAGES[code]
}

/**
 * 결과 줄 — 코드별 건수("3건 시트에 반영 · 1건 충돌 — 시트가 바뀌었습니다 · 1건 장부에만(새 행)").
 * 시트 쓰기가 꺼져 있었으면(전부 disabled 이거나 sheet 없음 + 성공) null — 호출부가 기존 문구를 쓴다.
 */
export function summarizeApplyOutcomes(outcomes: readonly ApplySheetOutcome[]): { text: string; failed: boolean } | null {
  if (outcomes.length === 0) return null
  const sheetAware = outcomes.some((outcome) => outcome.code != null && outcome.code !== "disabled")
  if (!sheetAware) return null
  const order: string[] = []
  const counts = new Map<string, number>()
  let failed = false
  const bump = (label: string) => {
    if (!counts.has(label)) order.push(label)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  // 성공 묶음을 앞에, 실패 묶음을 뒤에 — 같은 코드는 한 덩어리로 센다.
  for (const outcome of outcomes) {
    if (outcome.ok && outcome.code && SUCCESS_LABELS[outcome.code]) bump(SUCCESS_LABELS[outcome.code] as string)
    else if (outcome.ok) bump("반영됨")
  }
  for (const outcome of outcomes) {
    if (outcome.ok) continue
    failed = true
    bump(failureLabel(outcome.code))
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

/** 장부 상단 한 줄 — 켜짐일 때만. */
export const SHEET_WRITE_ON_NOTICE = "반영하면 '2. REV' 시트에도 씁니다 · 지난 주차는 시트에서 직접"
