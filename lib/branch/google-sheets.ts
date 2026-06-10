import "server-only"
import { sheets, drive } from "@/lib/google"

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
export interface FormattedCell { value: string | number | null; bg: CellFormat | null; fg?: CellFormat | null }

export async function readRangeWithFormat(spreadsheetId: string, range: string): Promise<FormattedCell[][]> {
  return withRetry(async () => {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [range],
      includeGridData: true,
      fields:
        "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,effectiveFormat.textFormat.foregroundColor,userEnteredValue)",
    })
    const data = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
    return data.map((row) =>
      (row.values ?? []).map((cell): FormattedCell => ({
        value:
          cell.formattedValue != null && cell.formattedValue !== ""
            ? cell.formattedValue
            : cell.userEnteredValue?.stringValue ??
              cell.userEnteredValue?.numberValue ??
              null,
        bg: (cell.effectiveFormat?.backgroundColor as CellFormat | null | undefined) ?? null,
        fg: (cell.effectiveFormat?.textFormat?.foregroundColor as CellFormat | null | undefined) ?? null,
      }))
    )
  }, range)
}

export function isRedBg(bg: CellFormat | null): boolean {
  if (!bg) return false
  return (bg.red ?? 0) >= 0.85 && (bg.green ?? 0) < 0.5 && (bg.blue ?? 0) < 0.5
}

// REV 시트 운영 규칙: 금액의 글자색 빨강 = 확정 매출.
// 실측 색상은 #FF0000, #EB4336 계열. 고객명 칸의 갈색(#B45F06, r0.71/g0.37)은 제외해야 하므로
// green 상한을 0.3으로 둔다.
export function isRedText(fg: CellFormat | null | undefined): boolean {
  if (!fg) return false
  return (fg.red ?? 0) >= 0.75 && (fg.green ?? 0) <= 0.3 && (fg.blue ?? 0) <= 0.3
}

// 글자색 파랑 = 클로징 임박(90%+ 확정 예상). 기본 파랑(#0000FF)과
// 구글 기본 블루(#1155CC, #4A86E8) 계열을 잡고 검정·빨강·초록은 제외한다.
export function isBlueText(fg: CellFormat | null | undefined): boolean {
  if (!fg) return false
  const red = fg.red ?? 0
  const green = fg.green ?? 0
  const blue = fg.blue ?? 0
  return blue >= 0.5 && blue - red >= 0.25 && blue - green >= 0.15
}

// Drive API gives us the sheet's last-edited timestamp without re-reading any
// values. We surface this in the dashboard so the user can tell whether the
// DB they're looking at lags behind the spreadsheet.
export async function getSheetModifiedTime(spreadsheetId: string): Promise<string | null> {
  try {
    const res = await drive.files.get({ fileId: spreadsheetId, fields: "modifiedTime" })
    return res.data.modifiedTime ?? null
  } catch {
    // Drive permission or network failure — caller treats null as "unknown"
    // and falls back to lastSync alone, so the dashboard never breaks because
    // of this freshness check.
    return null
  }
}

export function envSheetId(kind: "dashboard" | "hardware"): string {
  const id = kind === "dashboard"
    ? process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID
    : process.env.GOOGLE_BRANCH_HARDWARE_SHEET_ID
  if (!id) throw new Error(`Missing env: GOOGLE_BRANCH_${kind === "dashboard" ? "DASHBOARD" : "HARDWARE"}_SHEET_ID`)
  return id
}
