import "server-only"
import { sheets } from "@/lib/google"

const RETRY_DELAYS_MS = [200, 800, 2000]

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    try { return await fn() } catch (e) { lastErr = e }
  }
  throw new Error(`[branch/sheets] ${label} failed after retries: ${String(lastErr)}`)
}

export async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  return withRetry(async () => {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId, range,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    })
    return (res.data.values ?? []) as string[][]
  }, range)
}

export interface CellFormat { red?: number; green?: number; blue?: number }
export interface FormattedCell { value: string | number | null; bg: CellFormat | null }

export async function readRangeWithFormat(spreadsheetId: string, range: string): Promise<FormattedCell[][]> {
  return withRetry(async () => {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [range],
      includeGridData: true,
      fields: "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,userEnteredValue)",
    })
    const data = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
    return data.map((row) =>
      (row.values ?? []).map((cell): FormattedCell => ({
        value:
          (cell.userEnteredValue?.numberValue as number | undefined) ??
          cell.userEnteredValue?.stringValue ??
          (cell.formattedValue ? cell.formattedValue : null),
        bg: (cell.effectiveFormat?.backgroundColor as CellFormat | null | undefined) ?? null,
      }))
    )
  }, range)
}

export function isRedBg(bg: CellFormat | null): boolean {
  if (!bg) return false
  return (bg.red ?? 0) >= 0.85 && (bg.green ?? 0) < 0.5 && (bg.blue ?? 0) < 0.5
}

export function envSheetId(kind: "dashboard" | "hardware"): string {
  const id = kind === "dashboard"
    ? process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID
    : process.env.GOOGLE_BRANCH_HARDWARE_SHEET_ID
  if (!id) throw new Error(`Missing env: GOOGLE_BRANCH_${kind === "dashboard" ? "DASHBOARD" : "HARDWARE"}_SHEET_ID`)
  return id
}
