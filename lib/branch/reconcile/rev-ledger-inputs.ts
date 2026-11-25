// REV 시트 ↔ 매출 장부 대조(U-2 ①, E-7)의 입력 모양과 입력 파일(--format=inputs-json) 읽고 쓰기 — 순수 모듈.
//
// 대조는 두 입력만 본다: 시트 '2. REV' 그리드 한 번(ReconcileSheetInput)과 장부 DB 한 벌(ReconcileLedgerInput).
// 라이브 읽기(read-sources.ts)와 파일 읽기(parseReconcileInputs)가 같은 모양을 만든다 — 11/30 저녁에 남긴 입력 파일로
// 12/1 에 같은 대조를 다시 돌릴 수 있다(네트워크 없이).
//
// I/O·process.env·현재 시각 금지. 타입은 타입 전용 import 만 쓴다.

import type { FormattedCell } from "@/lib/branch/google-sheets"
import type { LedgerOverlayDraft, LedgerOverlayEntry, LedgerOverlaySheetWrite } from "@/lib/branch/ledger-overlay"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

/** 시트 '2. REV' 를 한 번 읽은 그리드 — 동기화(syncRev)와 같은 범위·같은 칸 모양. */
export interface ReconcileSheetInput {
  grid: FormattedCell[][]
  /** 읽은 범위(A1) — 잘림 판정에 쓴다. */
  range: string
  /** 읽은 시각(ISO) */
  readAt: string
}

/** 장부 DB 의 REV 행 원천 — 화면과 같은 순서(액티브 임포트 → 없으면 시트 미러). */
export interface ReconcileLedgerSource {
  kind: "import" | "mirror"
  runId: string | null
  /** 임포트 run 시작 시각(미러는 null) */
  startedAt: string | null
}

/** 장부 반영 항목(활성·상쇄) — 오버레이 입력 + 통화. */
export interface ReconcileEntry extends LedgerOverlayEntry {
  currency?: string | null
}

/** 장부 초안(적용·열린 초안) — 오버레이 입력 + 통화. */
export interface ReconcileDraft extends LedgerOverlayDraft {
  currency?: string | null
}

/** 목록이 안전 상한에 닿아 일부만 읽었다 — 대조는 '불완전'이 된다(모자란 합계를 같음으로 보이지 않게). */
export interface ReconcileTruncation {
  deals?: boolean
  entries: boolean
  appliedDrafts: boolean
  openDrafts: boolean
}

export interface ReconcileLedgerInput {
  source: ReconcileLedgerSource
  /** REV 행(BranchRevDeal) — 임포트면 mapRevLineToDeal 결과, 미러면 raw 포함 행 */
  deals: BranchRevDeal[]
  /** 그 회계연도 장부 항목 — 활성과 상쇄를 함께(상쇄 항목의 초안은 안전망에서 뺀다) */
  entries: ReconcileEntry[]
  /** 적용(applied) 초안 — 항목이 없는 적용 초안만 안전망으로 얹힌다(화면·서버와 같다) */
  appliedDrafts: ReconcileDraft[]
  /** 열린 초안(draft·checked) — 합계에 안 들어간다. 잠금 전 확인 목록에만 쓴다 */
  openDrafts: ReconcileDraft[]
  /** 초안별 가장 최근 시트 쓰기 시도 */
  sheetWrites: Record<string, LedgerOverlaySheetWrite>
  /** 마지막 성공 REV 동기화 시작 시각 */
  lastRevSyncStartedAt: string | null
  truncated: ReconcileTruncation
  /** 장부 항목 표를 읽었다(false 면 장부 입력을 셀 수 없다 — 불완전) */
  entriesHealthOk: boolean
  /** 시트 쓰기 기록을 읽었다(false 면 시트가 이미 읽은 정정을 가리지 못한다 — 불완전). 없으면 true 로 본다. */
  sheetWritesReadable?: boolean
}

export const RECONCILE_INPUTS_VERSION = 1

/** --format=inputs-json 파일. 고객 이름·금액이 들어 있다 — 저장소 밖에 둔다. */
export interface ReconcileInputsFile {
  version: typeof RECONCILE_INPUTS_VERSION
  capturedAt: string
  sheet?: ReconcileSheetInput
  ledger?: ReconcileLedgerInput
}

export function serializeReconcileInputs(file: ReconcileInputsFile): string {
  return `${JSON.stringify(file)}\n`
}

const NOT_INPUTS_FILE = "입력 파일 형식이 아닙니다 — --format=inputs-json 으로 만든 파일만 읽는다"

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function fail(detail: string): never {
  throw new Error(`${NOT_INPUTS_FILE} (${detail})`)
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string") fail(`${where} 가 글자가 아님`)
  return value
}

function requireNullableString(value: unknown, where: string): string | null {
  if (value == null) return null
  return requireString(value, where)
}

function requireArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} 가 배열이 아님`)
  return value
}

function requireBoolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") fail(`${where} 가 참/거짓이 아님`)
  return value
}

function checkSheet(value: unknown): ReconcileSheetInput {
  if (!isRecord(value)) fail("sheet 가 없음")
  const grid = requireArray(value.grid, "sheet.grid")
  grid.forEach((row, index) => {
    const cells = requireArray(row, `sheet.grid[${index}]`)
    for (const cell of cells) {
      if (cell != null && !isRecord(cell)) fail(`sheet.grid[${index}] 칸 모양이 아님`)
    }
  })
  requireString(value.range, "sheet.range")
  requireString(value.readAt, "sheet.readAt")
  return value as unknown as ReconcileSheetInput
}

function checkRecords(value: unknown, where: string, required: readonly string[]): void {
  requireArray(value, where).forEach((item, index) => {
    if (!isRecord(item)) fail(`${where}[${index}] 가 객체가 아님`)
    for (const key of required) {
      if (!(key in item)) fail(`${where}[${index}].${key} 없음`)
    }
  })
}

function checkLedger(value: unknown): ReconcileLedgerInput {
  if (!isRecord(value)) fail("ledger 가 없음")
  const source = value.source
  if (!isRecord(source) || (source.kind !== "import" && source.kind !== "mirror")) fail("ledger.source.kind 는 import|mirror")
  requireNullableString(source.runId, "ledger.source.runId")
  requireNullableString(source.startedAt, "ledger.source.startedAt")
  checkRecords(value.deals, "ledger.deals", ["id", "customer_name", "monthly_payments"])
  checkRecords(value.entries, "ledger.entries", ["id", "entryType", "entryStatus", "month", "amount"])
  checkRecords(value.appliedDrafts, "ledger.appliedDrafts", ["id", "kind", "status", "month", "amount"])
  checkRecords(value.openDrafts, "ledger.openDrafts", ["id", "kind", "status", "month", "amount"])
  if (!isRecord(value.sheetWrites)) fail("ledger.sheetWrites 가 객체가 아님")
  requireNullableString(value.lastRevSyncStartedAt, "ledger.lastRevSyncStartedAt")
  const truncated = value.truncated
  if (!isRecord(truncated)) fail("ledger.truncated 가 객체가 아님")
  requireBoolean(truncated.entries, "ledger.truncated.entries")
  requireBoolean(truncated.appliedDrafts, "ledger.truncated.appliedDrafts")
  requireBoolean(truncated.openDrafts, "ledger.truncated.openDrafts")
  requireBoolean(value.entriesHealthOk, "ledger.entriesHealthOk")
  return value as unknown as ReconcileLedgerInput
}

/**
 * 입력 파일을 읽는다. need 로 고른 쪽(시트·장부)이 없거나 모양이 틀리면 한국어 메시지로 던진다.
 * 값의 뜻(금액·확도)은 검사하지 않는다 — 대조가 앱 함수 그대로 읽는다.
 */
export function parseReconcileInputs(text: string, need: { sheet: boolean; ledger: boolean }): ReconcileInputsFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail("JSON 이 아님")
  }
  if (!isRecord(parsed)) fail("최상위가 객체가 아님")
  if (parsed.version !== RECONCILE_INPUTS_VERSION) fail(`version ${String(parsed.version)} — ${RECONCILE_INPUTS_VERSION} 만 읽는다`)
  const capturedAt = requireString(parsed.capturedAt, "capturedAt")
  const file: ReconcileInputsFile = { version: RECONCILE_INPUTS_VERSION, capturedAt }
  if (need.sheet) file.sheet = checkSheet(parsed.sheet)
  else if (parsed.sheet != null) file.sheet = checkSheet(parsed.sheet)
  if (need.ledger) file.ledger = checkLedger(parsed.ledger)
  else if (parsed.ledger != null) file.ledger = checkLedger(parsed.ledger)
  return file
}
