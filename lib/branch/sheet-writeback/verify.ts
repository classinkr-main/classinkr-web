// 쓴 뒤 되읽은 시트로 확인하고, 행이 움직였으면 되돌릴 요청을 만든다 — 순수 모듈.
//
// 읽기와 쓰기 사이에 누가 시트를 정렬하거나 행을 끼우면 같은 행 번호에 다른 고객이 와 있다.
// 그래서 쓴 행의 Row ID 를 다시 보고(row_shifted), 대상 칸 값·색과 그 달 합계(= 주차 합)를 본다
// (verify_mismatch). 행이 움직였으면 그 자리에 지금 있는 행의 쓰기 전 값·색을 되써서 덮은 것을 되돌린다.

import { weekColorOf } from "./colors"
import { REV_ROW_ID_HEADER } from "./config"
import { monthBlockOfCol, type RevLayout } from "./layout"
import { liveCell, liveRowId, type LiveGrid, type WriteDraftPlan } from "./plan"
import { buildCellUpdateRequest } from "./requests"

export type VerifyResult =
  | { draftId: string; ok: true }
  | { draftId: string; ok: false; code: "row_shifted" | "verify_mismatch" }

const SUM_TOLERANCE = 1e-6

export function verifyWrites(after: LiveGrid, plans: WriteDraftPlan[], layout: RevLayout): VerifyResult[] {
  return plans.map((plan): VerifyResult => {
    if (layout.rowIdCol == null || liveRowId(after, plan.rowIndex, layout.rowIdCol) !== plan.rowId) {
      return { draftId: plan.draftId, ok: false, code: "row_shifted" }
    }

    for (const cell of plan.cells) {
      const live = liveCell(after, cell.row, cell.col)
      if (cell.writeValue && live.value !== cell.after.value) return { draftId: plan.draftId, ok: false, code: "verify_mismatch" }
      if (cell.writeColor && weekColorOf(live.fg) !== cell.after.color) {
        return { draftId: plan.draftId, ok: false, code: "verify_mismatch" }
      }
    }

    const blocks = new Set(plan.cells.map((cell) => monthBlockOfCol(layout, cell.col)))
    for (const block of blocks) {
      if (!block) return { draftId: plan.draftId, ok: false, code: "verify_mismatch" }
      const total = liveCell(after, plan.rowIndex, block.totalCol).value
      const weekSum = block.weekCols.reduce((sum, col) => sum + (liveCell(after, plan.rowIndex, col).value ?? 0), 0)
      if (total == null || Math.abs(total - weekSum) > SUM_TOLERANCE) {
        return { draftId: plan.draftId, ok: false, code: "verify_mismatch" }
      }
    }

    return { draftId: plan.draftId, ok: true }
  })
}

/**
 * row_shifted 인 계획의 칸마다: 그 인덱스에 지금 있는 행(after 의 Row ID 로 식별)을 쓰기 전 그리드에서 찾아
 * 그 칸의 쓰기 전 값·색을 되쓴다. 찾지 못한 행(ID 없음·0개·2개 이상)은 건너뛴다 — 사람 복구(감사 행에 남김).
 * 쓰기 전 칸이 비어 있었으면 칸 비우기 요청이 나온다(assertRequestsAllowed 의 allowClear 로만 통과).
 */
export function restoreRequestsForShift(
  before: LiveGrid,
  after: LiveGrid,
  shifted: WriteDraftPlan[],
  sheetId: number,
  layout?: RevLayout,
): unknown[] {
  const rowIdCol = layout?.rowIdCol ?? findRowIdCol(after) ?? findRowIdCol(before)
  if (rowIdCol == null) return []

  const beforeIndex = new Map<string, number[]>()
  for (let rowIndex = 2; rowIndex < before.rows.length; rowIndex += 1) {
    const id = liveRowId(before, rowIndex, rowIdCol)
    if (!id) continue
    beforeIndex.set(id, [...(beforeIndex.get(id) ?? []), rowIndex])
  }

  const requests: unknown[] = []
  for (const plan of shifted) {
    const occupant = liveRowId(after, plan.rowIndex, rowIdCol)
    if (!occupant) continue
    const origin = beforeIndex.get(occupant) ?? []
    if (origin.length !== 1) continue
    const originals = plan.cells.map((cell) => liveCell(before, origin[0], cell.col))
    // 수식·글자가 있던 칸은 숫자로 되쓸 수 없다 — 그 행은 사람 복구로 남긴다.
    if (originals.some((original) => original.formula || (original.value == null && (original.text ?? "").trim()))) continue
    for (const [index, cell] of plan.cells.entries()) {
      const original = originals[index]
      requests.push(
        buildCellUpdateRequest(
          {
            row: plan.rowIndex,
            col: cell.col,
            value: original.value,
            color: weekColorOf(original.fg),
            writeValue: cell.writeValue,
            writeColor: cell.writeColor,
          },
          sheetId,
        ),
      )
    }
  }
  return requests
}

function findRowIdCol(grid: LiveGrid): number | null {
  const header = REV_ROW_ID_HEADER.toLowerCase()
  const index = grid.header.findIndex((value) => String(value ?? "").trim().toLowerCase() === header)
  return index >= 0 ? index : null
}
