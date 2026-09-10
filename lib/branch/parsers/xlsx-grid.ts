import type ExcelJS from "exceljs"

import type { LedgerCell, LedgerGrid, LedgerWorkbook } from "@/lib/branch/parsers/hw-ledger"

// Flatten an exceljs cell value into a plain LedgerCell. Preserves Date objects
// (inbound dates are real datetimes) and joins richText / resolves formulas.
function cellToLedger(value: ExcelJS.CellValue): LedgerCell {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("")
    }
    if ("formula" in value || "sharedFormula" in value) {
      const result = (value as { result?: unknown }).result
      if (result instanceof Date) return result
      if (result == null || typeof result === "object") return null
      return result as LedgerCell
    }
    if ("text" in value) return String((value as { text: unknown }).text ?? "")
    if ("hyperlink" in value) {
      const v = value as { text?: unknown; hyperlink?: unknown }
      return String(v.text ?? v.hyperlink ?? "")
    }
    if ("error" in value) return null
    return null
  }
  return value as LedgerCell
}

/**
 * Read an uploaded .xlsx buffer into a tab-name → 0-indexed grid map that the
 * per-lot ledger parser consumes. Column A maps to grid index 0.
 *
 * `exceljs`는 번들 크기가 커서(서버 콜드 스타트 비용) 함수 내부에서 동적
 * import한다 — 이 파서가 실제로 호출될 때만 로드된다.
 */
export async function workbookToLedger(data: ArrayBuffer | Buffer): Promise<LedgerWorkbook> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  // exceljs's `load` Buffer type differs from @types/node's generic Buffer; pin to its own param type.
  await wb.xlsx.load(data as unknown as Parameters<typeof wb.xlsx.load>[0])
  const sheets: Record<string, LedgerGrid> = {}
  wb.eachSheet((ws) => {
    const maxCol = Math.max(ws.columnCount || 0, ws.actualColumnCount || 0, 1)
    const maxRow = Math.max(ws.rowCount || 0, ws.actualRowCount || 0, 0)
    const grid: LedgerGrid = []
    for (let r = 1; r <= maxRow; r++) {
      const row = ws.getRow(r)
      const cells: LedgerCell[] = []
      for (let c = 1; c <= maxCol; c++) cells.push(cellToLedger(row.getCell(c).value))
      grid.push(cells)
    }
    sheets[ws.name] = grid
  })
  return { sheets }
}
