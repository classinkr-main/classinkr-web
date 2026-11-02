import "server-only"

// '2. REV' 쓰기 전용 Sheets 호출 — 저장소에서 이 시트에 쓰는 유일한 런타임 경로.
//
// 인증은 lib/google.ts 의 공용 서비스계정 클라이언트(sheets 지연 프록시)를 그대로 쓴다(새 인증 없음).
// 호출마다 REV_WRITE_TIMEOUT_MS 마감이 걸리고 재시도하지 않는다 — googleapis 는 기본으로 재시도를 켜므로
// retry:false 를 명시한다. 쓰기는 보내기 직전에 대상(spreadsheetId·env·sheetId)과 요청 허용 목록을
// 다시 검사하고, 통과하지 못하면 Error("not_allowed") 로 던진다(아무것도 보내지 않음).

import type { sheets_v4 } from "googleapis"

import { envSheetId } from "@/lib/branch/google-sheets"
import { sheets } from "@/lib/google"

import { REV_WRITE_READ_RANGE, REV_WRITE_TARGET, REV_WRITE_TIMEOUT_MS } from "./config"
import type { RevLayout } from "./layout"
import type { LiveCell, LiveGrid } from "./plan"
import { assertRequestsAllowed } from "./requests"

const GRID_FIELDS =
  "properties(sheetId,title),data(rowData(values(effectiveValue,userEnteredValue,formattedValue,effectiveFormat(textFormat(foregroundColor)))))"
const READ_FIELDS = `sheets(${GRID_FIELDS})`
const WRITE_RESPONSE_FIELDS = `updatedSpreadsheet(sheets(${GRID_FIELDS}))`

function callOptions(signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(REV_WRITE_TIMEOUT_MS)
  return {
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    timeout: REV_WRITE_TIMEOUT_MS,
    retry: false,
  }
}

function notAllowed(): never {
  throw new Error("not_allowed")
}

/** 쓰는 대상이 상수와 env(GOOGLE_BRANCH_DASHBOARD_SHEET_ID) 둘 다와 같아야 한다. */
export function assertWriteTarget(spreadsheetId: string): void {
  if (spreadsheetId !== REV_WRITE_TARGET.spreadsheetId) notAllowed()
  let envId: string
  try {
    envId = envSheetId("dashboard")
  } catch {
    notAllowed()
  }
  if (envId !== REV_WRITE_TARGET.spreadsheetId) notAllowed()
}

function toLiveCell(cell: sheets_v4.Schema$CellData | undefined): LiveCell {
  const numberValue = cell?.effectiveValue?.numberValue
  const formula = cell?.userEnteredValue?.formulaValue
  const fg = cell?.effectiveFormat?.textFormat?.foregroundColor
  const text = cell?.formattedValue ?? cell?.userEnteredValue?.stringValue ?? null
  return {
    value: typeof numberValue === "number" && Number.isFinite(numberValue) ? numberValue : null,
    formula: typeof formula === "string" && formula ? formula : null,
    fg: fg ? { red: fg.red ?? undefined, green: fg.green ?? undefined, blue: fg.blue ?? undefined } : null,
    text: typeof text === "string" ? text : null,
  }
}

export function toLiveGrid(spreadsheet: sheets_v4.Schema$Spreadsheet | null | undefined): LiveGrid {
  const candidates = spreadsheet?.sheets ?? []
  const withData = candidates.filter((sheet) => (sheet.data?.[0]?.rowData?.length ?? 0) > 0)
  const sheet =
    withData.find((candidate) => candidate.properties?.sheetId === REV_WRITE_TARGET.sheetId) ??
    withData[0] ??
    candidates[0]
  if (!sheet) throw new Error("readback_missing")
  const rowData = sheet.data?.[0]?.rowData ?? []
  const rows = rowData.map((row) => (row.values ?? []).map((cell) => toLiveCell(cell)))
  const header = (rows[1] ?? []).map((cell) => cell.text ?? cell.value ?? null)
  return {
    title: sheet.properties?.title ?? "",
    sheetId: typeof sheet.properties?.sheetId === "number" ? sheet.properties.sheetId : -1,
    header,
    rows,
  }
}

export async function readLiveGrid(spreadsheetId: string, signal?: AbortSignal): Promise<LiveGrid> {
  const response = await sheets.spreadsheets.get(
    { spreadsheetId, ranges: [REV_WRITE_READ_RANGE], includeGridData: true, fields: READ_FIELDS },
    callOptions(signal),
  )
  return toLiveGrid(response.data)
}

export async function batchUpdateAndReadBack(
  spreadsheetId: string,
  requests: unknown[],
  layout: RevLayout,
  signal?: AbortSignal,
  opts: { allowClear?: boolean } = {},
): Promise<LiveGrid> {
  assertWriteTarget(spreadsheetId)
  if (!Array.isArray(requests) || requests.length === 0) notAllowed()
  assertRequestsAllowed(requests, layout, REV_WRITE_TARGET.sheetId, opts)

  const response = await sheets.spreadsheets.batchUpdate(
    {
      spreadsheetId,
      fields: WRITE_RESPONSE_FIELDS,
      requestBody: {
        requests: requests as sheets_v4.Schema$Request[],
        includeSpreadsheetInResponse: true,
        responseRanges: [REV_WRITE_READ_RANGE],
        responseIncludeGridData: true,
      },
    },
    callOptions(signal),
  )
  // 200 인데 되읽은 그리드가 없으면 쓴 결과를 확인할 수 없다 — "결과 모름"으로 다룬다.
  if (!response.data.updatedSpreadsheet) throw new Error("readback_missing")
  return toLiveGrid(response.data.updatedSpreadsheet)
}

function errorStatus(e: unknown): number | null {
  if (!e || typeof e !== "object") return null
  const candidate = e as { status?: unknown; code?: unknown; response?: { status?: unknown } }
  for (const value of [candidate.status, candidate.response?.status, candidate.code]) {
    if (typeof value === "number" && Number.isInteger(value)) return value
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value)
  }
  return null
}

/**
 * 401·403 → 권한, 그 밖 4xx(408 제외) → 구글이 거절해 쓰지 않은 것이 확실, 5xx·네트워크·마감·모름 → 결과 모름.
 * 결과 모름은 다시 보내지 않는다(같은 요청을 두 번 보내 덮지 않는다).
 */
export function classifyGoogleError(e: unknown): "sheet_permission" | "outcome_unknown" | "sheet_error" {
  const status = errorStatus(e)
  if (status === 401 || status === 403) return "sheet_permission"
  if (status != null && status >= 400 && status < 500 && status !== 408) return "sheet_error"
  return "outcome_unknown"
}
