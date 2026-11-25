import "server-only"
import { sheets, drive } from "@/lib/google"
import { isRetryableGoogleError } from "./google-retry"

const RETRY_DELAYS_MS = [200, 800, 2000]

// 403(공유 끊김)·404 같은 오류는 재시도해도 같으므로 즉시 던진다 — 백오프 3초가 매 요청에
// 붙어 summary·data-quality가 4~5초 걸리던 원인(2026-09-14 실측). 문구는 호출부 호환을 위해 유지.
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    try { return await fn() } catch (e) {
      lastErr = e
      if (!isRetryableGoogleError(e)) break
    }
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
export interface FormattedCell {
  /** 표시 글자(formattedValue) — 머리·텍스트·날짜는 이 값을 읽는다. */
  value: string | number | null
  bg: CellFormat | null
  fg?: CellFormat | null
  /**
   * 칸의 실제 숫자(effectiveValue.numberValue). 숫자 칸일 때만 있다. 금액은 이 값을 먼저 읽는다(F-28) —
   * 표시 형식이 '(1,750)'·'¥(1,750)'·'−1,750' 이어도 시트 =Sum() 이 더하는 값과 같다(lib/branch/sheet-number.ts).
   * 날짜 칸도 일련번호가 들어오므로 날짜·텍스트 열은 value 를 읽어야 한다.
   */
  numberValue?: number
}

export const FORMATTED_CELL_FIELDS =
  "sheets.data.rowData.values(formattedValue,effectiveValue,effectiveFormat.backgroundColor,effectiveFormat.textFormat.foregroundColor,userEnteredValue)"

interface SheetsApiCell {
  formattedValue?: string | null
  effectiveValue?: { numberValue?: number | null } | null
  userEnteredValue?: { stringValue?: string | null; numberValue?: number | null } | null
  effectiveFormat?: {
    backgroundColor?: unknown
    textFormat?: { foregroundColor?: unknown } | null
  } | null
}

/** Sheets API 칸 → FormattedCell. 숫자 칸만 numberValue 키를 싣는다(그리드가 커도 빈 키를 늘리지 않는다). */
export function toFormattedCell(cell: SheetsApiCell): FormattedCell {
  const out: FormattedCell = {
    value:
      cell.formattedValue != null && cell.formattedValue !== ""
        ? cell.formattedValue
        : cell.userEnteredValue?.stringValue ??
          cell.userEnteredValue?.numberValue ??
          null,
    bg: (cell.effectiveFormat?.backgroundColor as CellFormat | null | undefined) ?? null,
    fg: (cell.effectiveFormat?.textFormat?.foregroundColor as CellFormat | null | undefined) ?? null,
  }
  const numeric = cell.effectiveValue?.numberValue
  if (typeof numeric === "number" && Number.isFinite(numeric)) out.numberValue = numeric
  return out
}

export async function readRangeWithFormat(spreadsheetId: string, range: string): Promise<FormattedCell[][]> {
  return withRetry(async () => {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [range],
      includeGridData: true,
      fields: FORMATTED_CELL_FIELDS,
    })
    const data = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
    return data.map((row) => (row.values ?? []).map((cell) => toFormattedCell(cell as SheetsApiCell)))
  }, range)
}

export function isRedBg(bg: CellFormat | null): boolean {
  if (!bg) return false
  return (bg.red ?? 0) >= 0.85 && (bg.green ?? 0) < 0.5 && (bg.blue ?? 0) < 0.5
}

// REV 시트 운영 규칙: 금액의 글자색 빨강 = 확정 매출(실측 #FF0000·#EB4336 계열, 고객명 칸 갈색 #B45F06 제외),
// 파랑 = 클로징 임박(90%+, #0000FF·#1155CC·#4A86E8 계열). 판정식의 정본은 클라이언트 겸용 순수 모듈
// lib/branch/sheet-writeback/colors.ts 다 — 시트 쓰기(장부 반영)가 같은 임계로 색을 읽고 쓰도록 사본 없이 재수출한다.
export { isBlueText, isRedText } from "@/lib/branch/sheet-writeback/colors"

// Drive API gives us the sheet's last-edited timestamp without re-reading any
// values. We surface this in the dashboard so the user can tell whether the
// DB they're looking at lags behind the spreadsheet.
//
// 품질 감사 2026-09-10 — #2(data_trust 핵심): 예전엔 permission/network 실패를 여기서
// 전부 null로 삼켰다 — "정상인데 값이 없음"과 "확인 자체가 실패함"이 구분되지 않아,
// lib/branch/sheet-freshness.ts의 isSheetAheadOfSync가 null 입력에 무조건 false를 반환해
// "시트가 더 새로움" 앰버 배지가 조용히 꺼졌다(REV 동기화가 30일 멈췄던 사고와 같은 실패 모드).
// 이제 재시도(withRetry, 이 파일의 다른 Sheets 호출과 동일 정책)까지 실패하면 예외를 던진다 —
// 호출부(lib/branch/summary-payload.ts의 readSheetFreshness)가 Promise.allSettled로 받아
// "값 없음"과 "조회 실패"를 명시적으로 구분해 sheetFreshnessError 플래그로 승격한다.
export async function getSheetModifiedTime(spreadsheetId: string): Promise<string | null> {
  return withRetry(async () => {
    // 공유 드라이브 파일은 이 옵션이 없으면 Sheets 읽기 권한이 있어도 Drive가 404를 반환한다.
    const res = await drive.files.get({ fileId: spreadsheetId, fields: "modifiedTime", supportsAllDrives: true })
    return res.data.modifiedTime ?? null
  }, `drive.files.get(${spreadsheetId})`)
}

export function envSheetId(kind: "dashboard" | "hardware"): string {
  const id = kind === "dashboard"
    ? process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID
    : process.env.GOOGLE_BRANCH_HARDWARE_SHEET_ID
  if (!id) throw new Error(`Missing env: GOOGLE_BRANCH_${kind === "dashboard" ? "DASHBOARD" : "HARDWARE"}_SHEET_ID`)
  return id
}
