// '2. REV' 실측 구조(2026-10-21)를 본뜬 테스트 그리드 — 실제 시트 호출 없음.
//
// 2행 머리: A Account … M Sum, N부터 월 블록 12개(월 합계 칸 + 주차 칸 w1~w5, 7월 다섯째는 "5w", 2월은 w1~w4).
// 84열(A~CF) + 맨 오른쪽 CG(0-based 84) "Row ID". 데이터는 3행(grid index 2)부터.

import type { DraftForWrite, LiveCell, LiveGrid } from "@/lib/branch/sheet-writeback/plan"
import { colToA1 } from "@/lib/branch/sheet-writeback/layout"
import type { WeekColor } from "@/lib/branch/sheet-writeback/colors"

export const REF_FY = 2026
export const TODAY = "2026-10-23" // 이번 주차 시작일 = 10-22(w4)

const META_HEADERS = [
  "Account", "Branch", "Location", "Scale", "Importance", "Team", "Manager", "Status", "Type", "Product",
  "First Payment", "Remark", "Sum",
]
const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]

export interface BlockSpec { ym: string; totalCol: number; weekCols: number[] }

export function buildHeader(opts: { rowId?: boolean } = {}): Array<string | number | null> {
  const header: Array<string | number | null> = [...META_HEADERS]
  for (const month of MONTHS) {
    header.push(String(month))
    const weeks = month === 2 ? 4 : 5
    for (let week = 1; week <= weeks; week += 1) header.push(month === 7 && week === 5 ? "5w" : `w${week}`)
  }
  if (opts.rowId !== false) header.push("Row ID")
  return header
}

export function blocks(): BlockSpec[] {
  const out: BlockSpec[] = []
  let col = 13
  for (const month of MONTHS) {
    const weeks = month === 2 ? 4 : 5
    const year = month >= 4 ? REF_FY : REF_FY + 1
    out.push({ ym: `${year}-${String(month).padStart(2, "0")}`, totalCol: col, weekCols: Array.from({ length: weeks }, (_, i) => col + 1 + i) })
    col += 1 + weeks
  }
  return out
}

export function block(ym: string): BlockSpec {
  const found = blocks().find((candidate) => candidate.ym === ym)
  if (!found) throw new Error(`no block ${ym}`)
  return found
}

export const ROW_ID_COL = 84

export const RED = { red: 1 }
export const BLUE = { blue: 1 }
export const BROWN = { red: 0.71, green: 0.37, blue: 0.02 }

export type WeekSpec = { v?: number | null; fg?: LiveCell["fg"]; formula?: string; text?: string }

export interface RowSpec {
  rowId?: string | null
  customer: string
  months?: Record<string, WeekSpec[]>
  /** 월 합계 칸 수식 덮어쓰기(ym → 수식 또는 null=상수). 기본은 그 달 주차 칸 + 체인. */
  totalFormula?: Record<string, string | null>
}

export const EMPTY: LiveCell = { value: null, formula: null, fg: null, text: null }

function cell(partial: Partial<LiveCell>): LiveCell {
  return { ...EMPTY, ...partial }
}

export function buildRow(spec: RowSpec, rowIndex: number): LiveCell[] {
  const row1 = rowIndex + 1
  const row: LiveCell[] = Array.from({ length: ROW_ID_COL + 1 }, () => cell({}))
  row[0] = cell({ text: spec.customer, fg: BROWN })
  for (const monthBlock of blocks()) {
    const weeks = spec.months?.[monthBlock.ym] ?? []
    let sum = 0
    for (const [index, col] of monthBlock.weekCols.entries()) {
      const week = weeks[index]
      if (!week) continue
      const value = week.v ?? null
      if (value != null) sum += value
      row[col] = cell({
        value,
        fg: week.fg ?? null,
        formula: week.formula ?? null,
        text: week.text ?? (value != null ? `¥${value.toLocaleString("en-US")}` : null),
      })
    }
    const override = spec.totalFormula?.[monthBlock.ym]
    const formula = override === undefined
      ? `=${monthBlock.weekCols.map((col) => `${colToA1(col)}${row1}`).join("+")}`
      : override
    row[monthBlock.totalCol] = cell({ value: sum, formula, text: `¥${sum}` })
  }
  if (spec.rowId) row[ROW_ID_COL] = cell({ text: spec.rowId })
  return row
}

export function buildGrid(rows: RowSpec[], opts: { rowIdHeader?: boolean; title?: string; sheetId?: number } = {}): LiveGrid {
  const header = buildHeader({ rowId: opts.rowIdHeader !== false })
  const headerRow = header.map((value) => cell({ text: value == null ? null : String(value) }))
  const totalRow = header.map(() => cell({}))
  return {
    title: opts.title ?? "2. REV",
    sheetId: opts.sheetId ?? 957802439,
    header,
    rows: [totalRow, headerRow, ...rows.map((spec, index) => buildRow(spec, index + 2))],
  }
}

export function cloneGrid(grid: LiveGrid): LiveGrid {
  return JSON.parse(JSON.stringify(grid)) as LiveGrid
}

export const ROW_A = "r_0123456789ab"
export const ROW_B = "r_abcdefghjkmn"
export const ROW_C = "r_pqrstvwxyz01"

export function baselineFor(
  rowId: string | null,
  customer: string,
  month: string,
  weeks: Array<{ value: number; color: WeekColor }>,
) {
  return { v: 1, rowId, sheetRow: 3, customer, month, weeks, capturedAt: "2026-10-23T01:00:00.000Z" }
}

export function editDraft(partial: Partial<DraftForWrite> & { baseline?: unknown }): DraftForWrite {
  const { baseline, ...rest } = partial
  return {
    id: "draft-1",
    kind: "edit-row",
    month: "2026-10",
    amount: 100,
    currency: "CNY",
    customer: "가나학원",
    sourceSnapshot: baseline === undefined ? {} : { sheetBaseline: baseline },
    metadata: { confidence: "expected", weekly: null, weeklyConfidence: null, confidenceTouched: false },
    ...rest,
  }
}
