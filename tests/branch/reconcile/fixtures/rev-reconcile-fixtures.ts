// REV 시트 ↔ 장부 대조 테스트 픽스처 — 가명(고객 예시학원N, 담당 예시A~D)만 쓴다.
// 그리드는 실제 FY26-27 '2. REV' 머리 모양이다: 메타 13열(Account … Sum) → 월 블록 4..12,1..3(7월 다섯째 주는 '5w',
// 2월은 주차 넷) → 숨김 "Row ID". 1행은 시트처럼 금액 열마다 =SUM(숫자 칸만, 고객명 빈 행 포함).
//
// 이 파일을 쓰는 테스트는 next/cache 를 가짜로 둔다(임포트 저장소 모듈이 모듈 범위에서 unstable_cache 를 만든다).

import type { FormattedCell } from "@/lib/branch/google-sheets"
import type { DraftConfidence } from "@/lib/branch/ledger-draft-metadata"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { parseRev, REV_RANGE } from "@/lib/branch/parsers/rev"
import type { ReconcileDraft, ReconcileEntry, ReconcileLedgerInput, ReconcileSheetInput } from "@/lib/branch/reconcile/rev-ledger-inputs"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { mapRevLineToDeal, type RevLineDbRow, type RevPeriodEntryDbRow } from "@/lib/repositories/sales-ledger-imports"
import { revImportEntriesForDeal } from "@/lib/repositories/sales-ledger-rev-import"

export const FY = 2026
export const RED = { red: 1, green: 0, blue: 0 }
export const BLUE = { red: 0, green: 0, blue: 1 }

const META = ["Account", "Branch", "Manager", "Location", "Scale", "Importance", "Team", "Status", "Type", "Product", "First Payment", "Remark", "Sum"]
const MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
const COL = { customer: 0, manager: 2, team: 6, status: 7, dealType: 8, product: 9, sum: 12 }

function weekHeaders(month: number): string[] {
  if (month === 2) return ["w1", "w2", "w3", "w4"]
  if (month === 7) return ["w1", "w2", "w3", "w4", "5w"]
  return ["w1", "w2", "w3", "w4", "w5"]
}

export const HEADER_TEXT = [...META, ...MONTH_NUMBERS.flatMap((month) => [String(month), ...weekHeaders(month)]), "Row ID"]
const ROW_ID_COL = HEADER_TEXT.length - 1

function ymOf(month: number, fy = FY): string {
  return `${month >= 4 ? fy : fy + 1}-${String(month).padStart(2, "0")}`
}

/** 그 달 월 칸 열(0-based). */
export function monthCol(ym: string): number {
  const month = Number(ym.slice(5, 7))
  return HEADER_TEXT.indexOf(String(month), META.length)
}

/** 그 달 w(1~5) 칸 열(0-based). */
export function weekCol(ym: string, week: number): number {
  return monthCol(ym) + week
}

export function rowIdOf(n: number): string {
  return `r_${String(n).padStart(12, "0")}`
}

export type Color = "red" | "blue"
export type WeekSpec = number | null | { amount?: number; text?: string; color?: Color }

export interface FixtureMonth {
  /** 월 칸 숫자. undefined 면 주 칸 합을 적는다(시트의 월 칸처럼). null 이면 빈 칸. */
  total?: number | null
  /** 월 칸을 숫자가 아닌 글자로 적는다(예: '(1,234)'). */
  totalText?: string
  /** 주 칸 없이 월 칸만 칠한 행 */
  totalColor?: Color
  weeks?: WeekSpec[]
}

export interface FixtureRow {
  customer: string | null
  manager?: string
  team?: string
  status?: string
  dealType?: string
  product?: string
  rowId?: string | null
  months?: Record<string, FixtureMonth>
}

const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })

function amountCell(amount: number, color?: Color): FormattedCell {
  const fg = color === "red" ? RED : color === "blue" ? BLUE : null
  return { value: amount < 0 ? `(${Math.abs(amount)})` : String(amount), bg: null, fg, numberValue: amount }
}

function weekCell(spec: WeekSpec): FormattedCell | null {
  if (spec == null) return null
  if (typeof spec === "number") return amountCell(spec)
  if (spec.text != null) return { value: spec.text, bg: null, fg: spec.color === "red" ? RED : spec.color === "blue" ? BLUE : null }
  return spec.amount == null ? null : amountCell(spec.amount, spec.color)
}

function weekAmount(spec: WeekSpec): number {
  if (spec == null) return 0
  if (typeof spec === "number") return spec
  return spec.text != null ? 0 : spec.amount ?? 0
}

function fixtureRowCells(row: FixtureRow, fy: number): FormattedCell[] {
  const cells = HEADER_TEXT.map(() => plain(null))
  cells[COL.customer] = plain(row.customer)
  cells[COL.manager] = plain(row.manager ?? null)
  cells[COL.team] = plain(row.team ?? "BD")
  cells[COL.status] = plain(row.status ?? "New")
  cells[COL.dealType] = plain(row.dealType ?? "Direct")
  cells[COL.product] = plain(row.product ?? "SW")
  if (row.rowId) cells[ROW_ID_COL] = plain(row.rowId)
  for (const [ym, spec] of Object.entries(row.months ?? {})) {
    if (Number(ym.slice(0, 4)) !== (Number(ym.slice(5, 7)) >= 4 ? fy : fy + 1)) throw new Error(`fixture month ${ym} is outside FY${fy}`)
    const total = monthCol(ym)
    const weeks = spec.weeks ?? []
    weeks.forEach((week, index) => {
      const cell = weekCell(week)
      if (cell) cells[total + 1 + index] = cell
    })
    if (spec.totalText != null) cells[total] = { value: spec.totalText, bg: null, fg: null }
    else if (spec.total === null) cells[total] = plain(null)
    else {
      const amount = spec.total ?? weeks.reduce<number>((sum, week) => sum + weekAmount(week), 0)
      cells[total] = amountCell(amount, spec.totalColor)
    }
  }
  return cells
}

function numericOf(cell: FormattedCell | undefined): number {
  return typeof cell?.numberValue === "number" ? cell.numberValue : 0
}

/**
 * 실제 머리 모양 그리드. 1행 = 금액 열마다 시트 =SUM(숫자 칸만 — 글자 칸·빈 칸은 더하지 않는다), Sum 열 = 월 열 SUM 의 합.
 * sumOverrides 로 1행 칸을 바꿔 "설명 안 되는 차이"를 만든다.
 */
export function revGrid(rows: FixtureRow[], opts: { fy?: number; sumOverrides?: Record<number, number | null> } = {}): FormattedCell[][] {
  const fy = opts.fy ?? FY
  const header = HEADER_TEXT.map((text) => plain(text))
  const body = rows.map((row) => fixtureRowCells(row, fy))
  const sumRow = HEADER_TEXT.map(() => plain(null))
  sumRow[0] = plain("REV")
  let monthsTotal = 0
  for (let col = META.length; col < ROW_ID_COL; col++) {
    const sum = body.reduce((acc, cells) => acc + numericOf(cells[col]), 0)
    sumRow[col] = amountCell(sum)
    if (MONTH_NUMBERS.some((month) => monthCol(ymOf(month, fy)) === col)) monthsTotal += sum
  }
  sumRow[COL.sum] = amountCell(monthsTotal)
  for (const [col, value] of Object.entries(opts.sumOverrides ?? {})) {
    sumRow[Number(col)] = value == null ? plain(null) : amountCell(value)
  }
  return [sumRow, header, ...body]
}

export function sheetInput(grid: FormattedCell[][], readAt = "2026-11-30T13:00:00Z"): ReconcileSheetInput {
  return { grid, range: REV_RANGE, readAt }
}

/** 동기화(syncRev)가 미러에 넣는 행 그대로 — 시트를 today 로 파싱, 담당은 읽을 때 정규화(branch-deals normalizeDealRow). */
export function mirrorDeals(grid: FormattedCell[][], opts: { today: string; syncedAt: string; fy?: number; idPrefix?: string }): BranchRevDeal[] {
  return parseRev(grid, { refFy: opts.fy ?? FY, today: opts.today }).map((parsed) => ({
    id: `${opts.idPrefix ?? "m-"}${parsed.sheet_row}`,
    sheet_row: parsed.sheet_row,
    customer_name: parsed.customer_name,
    branch_contact: parsed.branch_contact,
    team: parsed.team,
    manager: normalizeBranchMemberName(parsed.manager),
    deal_type: parsed.deal_type,
    status: parsed.status,
    first_payment: parsed.first_payment,
    product_version: parsed.product_version,
    region: parsed.region,
    importance: parsed.importance,
    note: parsed.note,
    contract_target: parsed.contract_target,
    monthly_payments: parsed.monthly_payments,
    monthly_red: parsed.monthly_red,
    monthly_confirmed: parsed.monthly_confirmed,
    monthly_high_conf: parsed.monthly_high_conf,
    raw: JSON.parse(JSON.stringify(parsed.raw)) as Record<string, unknown>,
    synced_at: opts.syncedAt,
  }))
}

/** 액티브 임포트(v3 캡처)의 줄 + 월 엔트리를 실제 리더(mapRevLineToDeal)로 되읽은 모양. */
export function importDeals(grid: FormattedCell[][], opts: { today: string; createdAt: string; fy?: number }): BranchRevDeal[] {
  return mirrorDeals(grid, { today: opts.today, syncedAt: opts.createdAt, fy: opts.fy, idPrefix: "line-" }).map((deal) => {
    const line: RevLineDbRow = {
      id: deal.id,
      source_row: deal.sheet_row,
      source_record_key: `sheet:${deal.sheet_row}`,
      account_name: deal.customer_name,
      branch_contact: deal.branch_contact,
      location: deal.region,
      scale: null,
      importance: deal.importance,
      team: deal.team,
      manager: deal.manager,
      status: deal.status,
      deal_type: deal.deal_type,
      product: deal.product_version,
      first_payment: deal.first_payment,
      remark: deal.note,
      total_amount: deal.contract_target,
      raw: deal.raw,
      created_at: opts.createdAt,
    }
    const entries: RevPeriodEntryDbRow[] = revImportEntriesForDeal(deal).map((entry) => ({
      rev_line_id: deal.id,
      period_month: entry.period_month,
      amount: entry.amount,
      confidence: entry.confidence,
      source_week: null,
    }))
    return mapRevLineToDeal(line, entries)
  })
}

export interface EntryInput {
  id: string
  draftId?: string
  type?: "manual-new" | "manual-edit"
  status?: "active" | "reversed"
  customer: string
  manager: string
  team?: string
  month: string
  amount: number
  confidence?: DraftConfidence
  appliedAt?: string
  sourceSheetRow?: number | null
  sourceDealId?: string
  rowId?: string | null
  currency?: string
  /** 정정을 만들 때 본 그 달 주차 칸(시트 쓰기 baseline v1) — drift 판정용 */
  baselineWeeks?: number[]
}

function snapshotOf(input: { rowId?: string | null; baselineWeeks?: number[]; customer: string; month: string; sourceSheetRow?: number | null }) {
  if (input.baselineWeeks) {
    return {
      sheetBaseline: {
        v: 1,
        rowId: input.rowId ?? null,
        sheetRow: input.sourceSheetRow ?? null,
        customer: input.customer,
        month: input.month,
        weeks: input.baselineWeeks.map((value) => ({ value, color: "k" })),
        capturedAt: "2026-11-27T01:00:00Z",
      },
    }
  }
  return input.rowId ? { sheetBaseline: { rowId: input.rowId } } : {}
}

export function entry(input: EntryInput): ReconcileEntry {
  return {
    id: input.id,
    draftId: input.draftId ?? `d-${input.id}`,
    entryType: input.type ?? "manual-new",
    entryStatus: input.status ?? "active",
    sourceDealId: input.sourceDealId,
    sourceSheetRow: input.sourceSheetRow ?? null,
    sourceSnapshot: snapshotOf(input),
    customer: input.customer,
    manager: input.manager,
    team: input.team ?? "BD",
    month: input.month,
    amount: input.amount,
    note: "",
    appliedAt: input.appliedAt ?? "2026-11-28T03:00:00Z",
    metadata: { confidence: input.confidence ?? "confirmed" },
    currency: input.currency ?? "CNY",
  }
}

export interface DraftInput {
  id: string
  kind?: "new-row" | "edit-row"
  status?: string
  customer: string
  manager: string
  team?: string
  month: string
  amount: number
  confidence?: DraftConfidence
  appliedAt?: string | null
  sourceSheetRow?: number | null
  rowId?: string | null
  currency?: string
}

export function draft(input: DraftInput): ReconcileDraft {
  return {
    id: input.id,
    kind: input.kind ?? "new-row",
    status: input.status ?? "applied",
    sourceSheetRow: input.sourceSheetRow ?? null,
    sourceSnapshot: input.rowId ? { sheetBaseline: { rowId: input.rowId } } : {},
    customer: input.customer,
    manager: input.manager,
    team: input.team ?? "BD",
    month: input.month,
    amount: input.amount,
    note: "",
    metadata: { confidence: input.confidence ?? "confirmed" },
    appliedAt: input.appliedAt ?? (input.status && input.status !== "applied" ? null : "2026-11-28T03:00:00Z"),
    updatedAt: "2026-11-28T03:00:00Z",
    currency: input.currency ?? "CNY",
  }
}

export function ledgerInput(deals: BranchRevDeal[], overrides: Partial<ReconcileLedgerInput> = {}): ReconcileLedgerInput {
  return {
    source: { kind: "mirror", runId: null, startedAt: null },
    deals,
    entries: [],
    appliedDrafts: [],
    openDrafts: [],
    sheetWrites: {},
    lastRevSyncStartedAt: "2026-11-30T12:39:00Z",
    truncated: { entries: false, appliedDrafts: false, openDrafts: false },
    entriesHealthOk: true,
    sheetWritesReadable: true,
    ...overrides,
  }
}

/** 기본 시트 — 담당 둘(예시A·예시B), Row ID 있음. 11월 확정·예정, 12월 빨간 w1·파란 w2·검정 w3. */
export const BASE_ROWS: FixtureRow[] = [
  {
    customer: "예시학원1",
    manager: "예시A",
    rowId: rowIdOf(1),
    months: {
      "2026-11": { weeks: [{ amount: 300, color: "red" }, 200] },
      "2026-12": { weeks: [{ amount: 100, color: "red" }, { amount: 50, color: "blue" }, 70] },
    },
  },
  {
    customer: "예시학원2",
    manager: "예시B",
    rowId: rowIdOf(2),
    months: {
      "2026-10": { weeks: [400] },
      "2026-11": { weeks: [500] },
    },
  },
  {
    customer: "예시학원3",
    manager: "예시A",
    rowId: rowIdOf(3),
    months: { "2026-12": { weeks: [400] } },
  },
]

export const SYNC_AT = "2026-11-30T12:40:00Z" // 21:40 KST
export const AS_OF = "2026-11-30"
export const NOW = "2026-11-30T13:05:00Z"
