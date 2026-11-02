// sheets-client — googleapis 는 목(@/lib/google). 실제 시트 호출 없음.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
const batchUpdate = vi.fn()

vi.mock("@/lib/google", () => ({
  sheets: { spreadsheets: { get: (...args: unknown[]) => get(...args), batchUpdate: (...args: unknown[]) => batchUpdate(...args) } },
  drive: {},
}))

import { isRevLayoutError, resolveRevLayout, type RevLayout } from "@/lib/branch/sheet-writeback/layout"
import { buildUpdateCellsRequests } from "@/lib/branch/sheet-writeback/requests"
import {
  batchUpdateAndReadBack,
  classifyGoogleError,
  readLiveGrid,
  toLiveGrid,
} from "@/lib/branch/sheet-writeback/sheets-client"

import { block, buildHeader, REF_FY, ROW_A } from "./fixtures"

const TARGET = "1vBYyKc_pd5Kb2xyhDWG8lWMAd7fGsRcBoF_wK1wUc7Q"
const SHEET_ID = 957802439

function layout(): RevLayout {
  const resolved = resolveRevLayout(buildHeader(), REF_FY)
  if (isRevLayoutError(resolved)) throw new Error(resolved.detail)
  return resolved
}

function apiSpreadsheet() {
  const header = buildHeader().map((value) => ({ formattedValue: String(value) }))
  const dataRow = header.map(() => ({}))
  dataRow[0] = { formattedValue: "가나학원", effectiveValue: { stringValue: "가나학원" } } as never
  const oct = block("2026-10")
  dataRow[oct.weekCols[3]] = {
    formattedValue: "¥300",
    effectiveValue: { numberValue: 300 },
    userEnteredValue: { numberValue: 300 },
    effectiveFormat: { textFormat: { foregroundColor: { red: 1 } } },
  } as never
  dataRow[oct.totalCol] = {
    formattedValue: "¥300",
    effectiveValue: { numberValue: 300 },
    userEnteredValue: { formulaValue: "=AY3+AZ3+BA3+BB3+BC3" },
  } as never
  dataRow[84] = { formattedValue: ROW_A, userEnteredValue: { stringValue: ROW_A } } as never
  return {
    sheets: [
      { properties: { sheetId: 1, title: "1. DSH" } },
      { properties: { sheetId: SHEET_ID, title: "2. REV" }, data: [{ rowData: [{ values: [] }, { values: header }, { values: dataRow }] }] },
    ],
  }
}

function requests() {
  const oct = block("2026-10")
  return buildUpdateCellsRequests(
    [{
      draftId: "d",
      action: "write",
      rowIndex: 2,
      rowId: ROW_A,
      cells: [{ a1: "BB3", row: 2, col: oct.weekCols[3], before: { value: 300, color: "r" }, after: { value: 500, color: "r" }, writeValue: true, writeColor: false }],
    }],
    SHEET_ID,
  )
}

beforeEach(() => {
  get.mockReset()
  batchUpdate.mockReset()
  vi.stubEnv("GOOGLE_BRANCH_DASHBOARD_SHEET_ID", TARGET)
})
afterEach(() => vi.unstubAllEnvs())

describe("readLiveGrid", () => {
  it("좁은 fields·마감 signal·재시도 없음으로 한 번 읽고 LiveGrid 로 바꾼다", async () => {
    get.mockResolvedValue({ data: apiSpreadsheet() })
    const grid = await readLiveGrid(TARGET)
    expect(get).toHaveBeenCalledTimes(1)
    const [params, options] = get.mock.calls[0]
    expect(params).toEqual({
      spreadsheetId: TARGET,
      ranges: ["'2. REV'!A1:CZ1000"],
      includeGridData: true,
      fields:
        "sheets(properties(sheetId,title),data(rowData(values(effectiveValue,userEnteredValue,formattedValue,effectiveFormat(textFormat(foregroundColor))))))",
    })
    expect(options).toMatchObject({ retry: false, timeout: 8000 })
    expect(options.signal).toBeInstanceOf(AbortSignal)

    expect(grid.title).toBe("2. REV")
    expect(grid.sheetId).toBe(SHEET_ID)
    expect(grid.header[0]).toBe("Account")
    expect(grid.header[84]).toBe("Row ID")
    const oct = block("2026-10")
    expect(grid.rows[2][oct.weekCols[3]]).toEqual({ value: 300, formula: null, fg: { red: 1, green: undefined, blue: undefined }, text: "¥300" })
    expect(grid.rows[2][oct.totalCol].formula).toBe("=AY3+AZ3+BA3+BB3+BC3")
    expect(grid.rows[2][84].text).toBe(ROW_A)
  })

  it("데이터가 든 탭이 없으면 첫 탭 속성으로(→ 계획이 not_allowed 로 거절)", () => {
    const grid = toLiveGrid({ sheets: [{ properties: { sheetId: 1, title: "1. DSH" } }] })
    expect(grid).toMatchObject({ title: "1. DSH", sheetId: 1, rows: [] })
    expect(() => toLiveGrid({ sheets: [] })).toThrow("readback_missing")
  })
})

describe("batchUpdateAndReadBack", () => {
  it("허용된 요청을 한 번 보내고 되읽은 그리드를 돌려준다", async () => {
    batchUpdate.mockResolvedValue({ data: { updatedSpreadsheet: apiSpreadsheet() } })
    const grid = await batchUpdateAndReadBack(TARGET, requests(), layout())
    expect(batchUpdate).toHaveBeenCalledTimes(1)
    const [params, options] = batchUpdate.mock.calls[0]
    expect(params.spreadsheetId).toBe(TARGET)
    expect(params.requestBody).toEqual({
      requests: requests(),
      includeSpreadsheetInResponse: true,
      responseRanges: ["'2. REV'!A1:CZ1000"],
      responseIncludeGridData: true,
    })
    expect(options).toMatchObject({ retry: false, timeout: 8000 })
    expect(grid.sheetId).toBe(SHEET_ID)
  })

  it("대상 spreadsheetId 가 상수와 다르면 보내지 않는다", async () => {
    await expect(batchUpdateAndReadBack("other-sheet", requests(), layout())).rejects.toThrow("not_allowed")
    expect(batchUpdate).not.toHaveBeenCalled()
  })

  it("env GOOGLE_BRANCH_DASHBOARD_SHEET_ID 가 다르거나 없으면 보내지 않는다", async () => {
    vi.stubEnv("GOOGLE_BRANCH_DASHBOARD_SHEET_ID", "copy-of-sheet")
    await expect(batchUpdateAndReadBack(TARGET, requests(), layout())).rejects.toThrow("not_allowed")
    vi.stubEnv("GOOGLE_BRANCH_DASHBOARD_SHEET_ID", "")
    await expect(batchUpdateAndReadBack(TARGET, requests(), layout())).rejects.toThrow("not_allowed")
    expect(batchUpdate).not.toHaveBeenCalled()
  })

  it("허용 목록 밖 요청·빈 요청은 보내지 않는다", async () => {
    const bad = [{ updateCells: { ...(requests()[0] as { updateCells: object }).updateCells, fields: "*" } }]
    await expect(batchUpdateAndReadBack(TARGET, bad, layout())).rejects.toThrow("not_allowed")
    await expect(batchUpdateAndReadBack(TARGET, [], layout())).rejects.toThrow("not_allowed")
    expect(batchUpdate).not.toHaveBeenCalled()
  })

  it("200 인데 되읽기가 없으면 readback_missing(결과 모름)", async () => {
    batchUpdate.mockResolvedValue({ data: {} })
    const error = await batchUpdateAndReadBack(TARGET, requests(), layout()).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(classifyGoogleError(error)).toBe("outcome_unknown")
  })
})

describe("classifyGoogleError", () => {
  it.each([
    [{ status: 401 }, "sheet_permission"],
    [{ status: 403 }, "sheet_permission"],
    [{ response: { status: 403 } }, "sheet_permission"],
    [{ code: 403 }, "sheet_permission"],
    [{ code: "403" }, "sheet_permission"],
    [{ status: 400 }, "sheet_error"],
    [{ status: 404 }, "sheet_error"],
    [{ status: 429 }, "sheet_error"],
    [{ status: 408 }, "outcome_unknown"],
    [{ status: 500 }, "outcome_unknown"],
    [{ status: 503 }, "outcome_unknown"],
    [{ code: "ECONNRESET" }, "outcome_unknown"],
    [Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), "outcome_unknown"],
    [new Error("socket hang up"), "outcome_unknown"],
    ["boom", "outcome_unknown"],
    [null, "outcome_unknown"],
  ])("%j → %s", (error, expected) => {
    expect(classifyGoogleError(error)).toBe(expected)
  })
})
