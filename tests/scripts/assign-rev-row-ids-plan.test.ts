import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { sheets_v4 } from "googleapis"
import { describe, expect, it } from "vitest"

import { REV_ROW_ID_HEADER, REV_WRITE_TARGET } from "@/lib/branch/sheet-writeback/config"
import { isValidRowId } from "@/lib/branch/sheet-writeback/row-id"

import {
  allowContextFor,
  assertApplyTarget,
  assertRowIdRequestsAllowed,
  describeRowIdRequests,
  filterSpecsOf,
  gridReadRange,
  planRowIdAssignment,
  rowIdRequestsSummaryJson,
  snapshotFromResponses,
  stableJson,
  verifyRowIdAssignment,
  type RowIdPlan,
  type RowIdSheetSnapshot,
  type SheetsRequest,
} from "../../scripts/lib/assign-rev-row-ids-plan"

// '2. REV' 실측 구조(2026-10-21)를 본뜬 스냅샷 — 실제 시트 호출 없음.
// 2행 머리: A Account … M Sum, N부터 월 블록 12개(2월만 w1~w4, 7월 다섯째는 "5w") = 84열(A~CF).

const SHEET_ID = REV_WRITE_TARGET.sheetId
const SPREADSHEET_ID = REV_WRITE_TARGET.spreadsheetId
const REF_FY = 2026
const ROW_ID_COL = 84 // CG
const AX = 49 // 10월 월 합계 열 — 실측 기본 필터가 '¥ 0' 을 숨기는 열

const META_HEADERS = [
  "Account", "Branch", "Location", "Scale", "Importance", "Team", "Manager", "Status", "Type", "Product",
  "First Payment", "Remark", "Sum",
]

function header(rowId: boolean): string[] {
  const out = [...META_HEADERS]
  for (const month of [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]) {
    out.push(String(month))
    const weeks = month === 2 ? 4 : 5
    for (let week = 1; week <= weeks; week += 1) out.push(month === 7 && week === 5 ? "5w" : `w${week}`)
  }
  if (rowId) out.push(REV_ROW_ID_HEADER)
  return out
}

const FILTER_SPECS: sheets_v4.Schema$FilterSpec[] = [
  { columnIndex: AX, filterCriteria: { hiddenValues: ["¥ 0"] } },
  { columnIndex: 5, filterCriteria: { condition: { type: "TEXT_NOT_EQ", values: [{ userEnteredValue: "CSM" }] } } },
]

function range(endColumnIndex: number, endRowIndex = 450): sheets_v4.Schema$GridRange {
  return { sheetId: SHEET_ID, startRowIndex: 1, endRowIndex, startColumnIndex: 0, endColumnIndex }
}

/** 결정적인 난수 — 테스트마다 같은 ID 가 나온다. */
function seededRand(seed = 7) {
  let state = seed
  return (n: number) => {
    const bytes = new Uint8Array(n)
    for (let i = 0; i < n; i += 1) {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      bytes[i] = state & 0xff
    }
    return bytes
  }
}

const ID_A = "r_0123456789ab"
const ID_B = "r_cdefghjkmnpq"
const ID_C = "r_rstvwxyz0123"

interface SnapshotSpec {
  rowIdHeader?: boolean
  /** 3행부터 고객 이름(null = 고객 없는 행) */
  customers?: Array<string | null>
  /** 시트 행 번호 → Row ID 칸 글자 */
  ids?: Record<number, string>
  columnCount?: number
  rowCount?: number
  hiddenColumns?: number[]
  basicFilter?: sheets_v4.Schema$BasicFilter | null
  filterViews?: sheets_v4.Schema$FilterView[]
  spreadsheetId?: string
  sheetId?: number
  title?: string
  headerOverride?: string[]
}

const DEFAULT_CUSTOMERS = ["가나학원", "다라학원", null, "마바학원", "사아학원", "자차학원"] // 3·4·(5 빈 행)·6·7·8행

function makeSnapshot(spec: SnapshotSpec = {}): RowIdSheetSnapshot {
  const withRowId = spec.rowIdHeader ?? false
  const columnCount = spec.columnCount ?? (withRowId ? 85 : 84)
  const customers = spec.customers ?? DEFAULT_CUSTOMERS
  const rows: Array<Array<string | null>> = [
    ["합계", null, null, null, null, null, null, null, null, null, null, null, "¥ 12,000"],
    spec.headerOverride ?? header(withRowId),
  ]
  customers.forEach((customer, index) => {
    const sheetRow = index + 3
    const row: Array<string | null> = Array.from({ length: columnCount }, () => null)
    row[0] = customer
    row[5] = customer ? "BD" : null
    row[14] = customer ? "¥ 1,000" : null
    const id = spec.ids?.[sheetRow]
    if (id != null) row[ROW_ID_COL] = id
    rows.push(row)
  })
  return {
    spreadsheetId: spec.spreadsheetId ?? SPREADSHEET_ID,
    spreadsheetTitle: "FY26-27 Sales Ledger",
    sheetId: spec.sheetId ?? SHEET_ID,
    title: spec.title ?? REV_WRITE_TARGET.tabTitle,
    rowCount: spec.rowCount ?? rows.length,
    columnCount,
    basicFilter:
      spec.basicFilter === undefined
        ? { range: range(withRowId ? 85 : 84, rows.length), filterSpecs: FILTER_SPECS, criteria: { [String(AX)]: { hiddenValues: ["¥ 0"] } } }
        : spec.basicFilter,
    filterViews: spec.filterViews ?? [
      { filterViewId: 4242, title: "희성", range: range(84, rows.length), filterSpecs: [FILTER_SPECS[0]], sortSpecs: [{ dimensionIndex: 6, sortOrder: "ASCENDING" }] },
    ],
    hiddenColumns: spec.hiddenColumns ?? [1, ...(withRowId ? [ROW_ID_COL] : [])],
    rows,
  }
}

function plan(snapshot: RowIdSheetSnapshot, opts: { env?: string | null; keepSort?: boolean } = {}): RowIdPlan {
  return planRowIdAssignment(snapshot, {
    refFy: REF_FY,
    envSpreadsheetId: opts.env === undefined ? SPREADSHEET_ID : opts.env,
    keepSort: opts.keepSort,
    rand: seededRand(),
  })
}

function kinds(requests: SheetsRequest[]) {
  return requests.map((request) => Object.keys(request)[0])
}

function idWrites(requests: SheetsRequest[]): Map<number, string> {
  const out = new Map<number, string>()
  for (const request of requests) {
    const update = request.updateCells
    if (!update) continue
    update.rows?.forEach((row, offset) => {
      out.set((update.start?.rowIndex ?? 0) + offset + 1, row.values?.[0]?.userEnteredValue?.stringValue ?? "")
    })
  }
  return out
}

/** 요청을 스냅샷에 적용해 본다(시트 흉내) — 사후 검증을 실제 흐름으로 시험한다. */
function simulate(snapshot: RowIdSheetSnapshot, requests: SheetsRequest[]): RowIdSheetSnapshot {
  const next: RowIdSheetSnapshot = JSON.parse(JSON.stringify(snapshot))
  for (const request of requests) {
    if (request.appendDimension) next.columnCount += request.appendDimension.length ?? 0
    if (request.updateCells) {
      const start = request.updateCells.start!
      request.updateCells.rows?.forEach((row, offset) => {
        const rowIndex = (start.rowIndex ?? 0) + offset
        next.rows[rowIndex] ??= []
        next.rows[rowIndex][start.columnIndex ?? 0] = row.values?.[0]?.userEnteredValue?.stringValue ?? null
      })
    }
    if (request.updateDimensionProperties) next.hiddenColumns.push(request.updateDimensionProperties.range!.startIndex!)
    if (request.setBasicFilter) next.basicFilter = JSON.parse(JSON.stringify(request.setBasicFilter.filter))
    if (request.updateFilterView) {
      const view = next.filterViews.find((candidate) => candidate.filterViewId === request.updateFilterView!.filter!.filterViewId)
      if (view) view.range = JSON.parse(JSON.stringify(request.updateFilterView.filter!.range))
    }
  }
  return next
}

describe("행 ID 계획 — 열 84개면 맨 끝에 붙인다", () => {
  const snapshot = makeSnapshot()
  const result = plan(snapshot)

  it("막는 이유 없이 열 붙이기 → 머리 → 숨김 → 행 ID → 기본 필터 → 필터 뷰 순서", () => {
    expect(result.blockers).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.appendColumn).toBe(true)
    expect(result.rowIdCol).toBe(ROW_ID_COL)
    expect(kinds(result.requests)).toEqual([
      "appendDimension",
      "updateCells",
      "updateDimensionProperties",
      "updateCells",
      "updateCells",
      "setBasicFilter",
      "updateFilterView",
    ])
    expect(result.requests[0]).toEqual({ appendDimension: { sheetId: SHEET_ID, dimension: "COLUMNS", length: 1 } })
    expect(result.requests[1]).toEqual({
      updateCells: {
        start: { sheetId: SHEET_ID, rowIndex: 1, columnIndex: ROW_ID_COL },
        rows: [{ values: [{ userEnteredValue: { stringValue: "Row ID" } }] }],
        fields: "userEnteredValue",
      },
    })
    expect(result.requests[2]).toEqual({
      updateDimensionProperties: {
        range: { sheetId: SHEET_ID, dimension: "COLUMNS", startIndex: ROW_ID_COL, endIndex: ROW_ID_COL + 1 },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    })
  })

  it("고객 행(3·4·6·7·8행)에만 형식 맞는 고유 ID — 고객 없는 5행은 건너뛰고 이어진 칸끼리 묶는다", () => {
    const writes = idWrites(result.requests)
    writes.delete(2) // 머리
    expect([...writes.keys()]).toEqual([3, 4, 6, 7, 8])
    expect([...writes.values()].every((id) => isValidRowId(id))).toBe(true)
    expect(new Set(writes.values()).size).toBe(5)
    expect(result.assignments.map((a) => a.sheetRow)).toEqual([3, 4, 6, 7, 8])
    expect(result.counts).toEqual({ dataRows: 5, withId: 0, missing: 5, invalid: 0, duplicate: 0, orphan: 0 })
    expect(result.requests[3].updateCells?.start).toEqual({ sheetId: SHEET_ID, rowIndex: 2, columnIndex: ROW_ID_COL })
    expect(result.requests[3].updateCells?.rows).toHaveLength(2)
    expect(result.requests[4].updateCells?.start).toEqual({ sheetId: SHEET_ID, rowIndex: 5, columnIndex: ROW_ID_COL })
    expect(result.requests[4].updateCells?.rows).toHaveLength(3)
  })

  it("기본 필터는 A2:CF → A2:CG 로 범위만 넓히고 필터 뷰는 fields 'range' 만", () => {
    expect(result.requests[5]).toEqual({
      setBasicFilter: { filter: { range: range(85, snapshot.rows.length), filterSpecs: FILTER_SPECS } },
    })
    expect(result.requests[6]).toEqual({
      updateFilterView: { filter: { filterViewId: 4242, range: range(85, snapshot.rows.length) }, fields: "range" },
    })
  })

  it("허용 목록 검사를 통과하고, 적용한 결과는 사후 검증 문제 0", () => {
    expect(() => assertRowIdRequestsAllowed(result.requests, allowContextFor(snapshot, result))).not.toThrow()
    const after = simulate(snapshot, result.requests)
    expect(verifyRowIdAssignment(snapshot, after, result, REF_FY)).toEqual([])
  })

  it("미리보기 요약은 사람이 읽는 줄과 ID 를 줄인 JSON", () => {
    expect(describeRowIdRequests(result.requests)).toEqual([
      "appendDimension COLUMNS +1",
      'updateCells CG2 = "Row ID"',
      "updateDimensionProperties CG 열 숨김(hiddenByUser)",
      "updateCells CG3:CG4 — 새 행 ID 2칸",
      "updateCells CG6:CG8 — 새 행 ID 3칸",
      "setBasicFilter A2:CG8 — filterSpecs 2개 · sortSpecs 0개 그대로",
      "updateFilterView #4242 → A2:CG8 (fields range)",
    ])
    const json = JSON.stringify(rowIdRequestsSummaryJson(result.requests))
    expect(json).toMatch(/"rows":"3칸 stringValue\(r_[0-9a-z]{12} … r_[0-9a-z]{12}\)"/)
    expect(json).toContain('"stringValue":"Row ID"')
  })
})

describe("행 ID 계획 — 이미 있으면 재사용(멱등)", () => {
  it("Row ID 열·숨김·필터가 갖춰져 있으면 빈 칸에만 부여하고 열·머리·필터 요청이 없다", () => {
    const snapshot = makeSnapshot({
      rowIdHeader: true,
      ids: { 3: ID_A, 6: ID_B },
      filterViews: [{ filterViewId: 4242, title: "희성", range: range(85, 8) }],
    })
    const result = plan(snapshot)
    expect(result.ok).toBe(true)
    expect(result.appendColumn).toBe(false)
    expect(result.hideColumn).toBe(false)
    expect(result.rowIdCol).toBe(ROW_ID_COL)
    expect(kinds(result.requests)).toEqual(["updateCells", "updateCells"])
    expect([...idWrites(result.requests).keys()]).toEqual([4, 7, 8])
    expect(result.counts).toMatchObject({ dataRows: 5, withId: 2, missing: 3 })
    // 새 ID 는 이미 있는 ID 와 겹치지 않는다
    for (const id of idWrites(result.requests).values()) expect([ID_A, ID_B]).not.toContain(id)
    expect(() => assertRowIdRequestsAllowed(result.requests, allowContextFor(snapshot, result))).not.toThrow()
    expect(verifyRowIdAssignment(snapshot, simulate(snapshot, result.requests), result, REF_FY)).toEqual([])
  })

  it("전부 채워져 있으면 보낼 요청 0", () => {
    const snapshot = makeSnapshot({
      rowIdHeader: true,
      ids: { 3: ID_A, 4: ID_B, 6: ID_C, 7: "r_aaaaaaaaaaaa", 8: "r_bbbbbbbbbbbb" },
      filterViews: [],
    })
    const result = plan(snapshot)
    expect(result.ok).toBe(true)
    expect(result.requests).toEqual([])
    expect(verifyRowIdAssignment(snapshot, snapshot, result, REF_FY)).toEqual([])
  })

  it("열은 있는데 숨김이 풀렸거나 기본 필터가 CF 에서 끝나면 그것만 고친다", () => {
    const snapshot = makeSnapshot({
      rowIdHeader: true,
      ids: { 3: ID_A, 4: ID_B, 6: ID_C, 7: "r_aaaaaaaaaaaa", 8: "r_bbbbbbbbbbbb" },
      hiddenColumns: [1],
      basicFilter: { range: range(84, 8), filterSpecs: FILTER_SPECS },
      filterViews: [],
    })
    const result = plan(snapshot)
    expect(kinds(result.requests)).toEqual(["updateDimensionProperties", "setBasicFilter"])
    expect(() => assertRowIdRequestsAllowed(result.requests, allowContextFor(snapshot, result))).not.toThrow()
  })
})

describe("행 ID 계획 — 기존 필터 조건은 읽은 그대로 복사", () => {
  it("filterSpecs 를 깊은 비교로 같게 싣고, 요청을 고쳐도 읽은 스냅샷은 그대로다", () => {
    const snapshot = makeSnapshot()
    const result = plan(snapshot)
    const filter = result.requests.find((request) => request.setBasicFilter)?.setBasicFilter?.filter
    expect(stableJson(filter?.filterSpecs)).toBe(stableJson(FILTER_SPECS))
    expect(filter?.filterSpecs?.[0]).toEqual({ columnIndex: AX, filterCriteria: { hiddenValues: ["¥ 0"] } })
    expect(filter).not.toHaveProperty("criteria")
    filter!.filterSpecs![0].filterCriteria!.hiddenValues!.push("¥ 1")
    expect(snapshot.basicFilter?.filterSpecs?.[0].filterCriteria?.hiddenValues).toEqual(["¥ 0"])
  })

  it("응답에 옛 criteria 지도만 있으면 같은 조건을 filterSpecs 로 옮겨 싣는다", () => {
    const snapshot = makeSnapshot({ basicFilter: { range: range(84, 8), criteria: { [String(AX)]: { hiddenValues: ["¥ 0"] } } } })
    const result = plan(snapshot)
    const filter = result.requests.find((request) => request.setBasicFilter)?.setBasicFilter?.filter
    expect(filter?.filterSpecs).toEqual([{ columnIndex: AX, filterCriteria: { hiddenValues: ["¥ 0"] } }])
  })

  it("기본 필터에 정렬이 있으면 멈추고, --keep-sort 면 sortSpecs 까지 그대로 복사한다", () => {
    const sortSpecs = [{ dimensionIndex: 5, sortOrder: "ASCENDING" }]
    const snapshot = makeSnapshot({ basicFilter: { range: range(84, 8), filterSpecs: FILTER_SPECS, sortSpecs } })
    const stopped = plan(snapshot)
    expect(stopped.ok).toBe(false)
    expect(stopped.blockers.join("\n")).toMatch(/sortSpecs 1개/)
    const kept = plan(snapshot, { keepSort: true })
    expect(kept.ok).toBe(true)
    const filter = kept.requests.find((request) => request.setBasicFilter)?.setBasicFilter?.filter
    expect(filter?.sortSpecs).toEqual(sortSpecs)
    expect(() => assertRowIdRequestsAllowed(kept.requests, allowContextFor(snapshot, kept))).not.toThrow()
  })

  it("기본 필터가 Row ID 열 바로 앞에서 끝나지 않으면(사이 열이 끼면) 넓히지 않고 멈춘다", () => {
    const result = plan(makeSnapshot({ basicFilter: { range: range(80, 8), filterSpecs: FILTER_SPECS } }))
    expect(result.ok).toBe(false)
    expect(result.blockers.join("\n")).toMatch(/기본 필터 A2:CB8 가 Row ID 열\(CG\) 바로 앞\(CF\)에서 끝나지 않습니다/)
    expect(result.requests.some((request) => request.setBasicFilter)).toBe(false)
  })

  it("기본 필터가 없으면 새로 만들지 않는다", () => {
    const result = plan(makeSnapshot({ basicFilter: null }))
    expect(result.ok).toBe(true)
    expect(result.requests.some((request) => request.setBasicFilter)).toBe(false)
  })
})

describe("행 ID 계획 — 형식 오류·중복은 보고하고 막는다", () => {
  const snapshot = makeSnapshot({
    rowIdHeader: true,
    customers: ["가나학원", "다라학원", "마바학원", null, "사아학원", "자차학원"], // 3·4·5·(6 빈 행)·7·8행
    ids: { 3: "R_ABC", 4: ID_A, 5: ID_B, 6: ID_A, 7: ID_B },
  })
  const result = plan(snapshot)

  it("형식 오류 행·중복 ID 와 행 번호를 싣고 ok=false", () => {
    expect(result.ok).toBe(false)
    expect(result.invalidRows).toEqual([{ sheetRow: 3, value: "R_ABC" }])
    expect(result.duplicateIds).toEqual([
      { rowId: ID_A, sheetRows: [4, 6] },
      { rowId: ID_B, sheetRows: [5, 7] },
    ])
    expect(result.counts).toEqual({ dataRows: 5, withId: 0, missing: 1, invalid: 1, duplicate: 3, orphan: 1 })
    expect(result.orphanRows).toEqual([6])
    const blockers = result.blockers.join("\n")
    expect(blockers).toMatch(/Row ID 형식 오류 1행\(3\)/)
    expect(blockers).toMatch(/r_0123456789ab\(4·6행\)/)
    expect(blockers).toMatch(/r_cdefghjkmnpq\(5·7행\)/)
    expect(result.warnings.join("\n")).toMatch(/고객\(A\)이 빈 행에 Row ID 가 1칸/)
  })

  it("고치지 않는다 — 형식 오류·중복 칸에는 요청이 없고 빈 칸(8행)만 계획한다", () => {
    expect([...idWrites(result.requests).keys()]).toEqual([8])
    expect(() => assertRowIdRequestsAllowed(result.requests, allowContextFor(snapshot, result))).not.toThrow()
  })
})

describe("행 ID 계획 — 대상·구조가 다르면 멈춘다", () => {
  it("스프레드시트 id 가 허용 목록과 다르면 막는다", () => {
    const result = plan(makeSnapshot({ spreadsheetId: "1someOtherSheet" }))
    expect(result.ok).toBe(false)
    expect(result.blockers.join("\n")).toMatch(/허용 목록\(REV_WRITE_TARGET\)과 다릅니다/)
  })

  it("env GOOGLE_BRANCH_DASHBOARD_SHEET_ID 가 비거나 다르면 막는다", () => {
    expect(plan(makeSnapshot(), { env: null }).blockers.join("\n")).toMatch(/비어 있습니다/)
    expect(plan(makeSnapshot(), { env: " 1someOther " }).blockers.join("\n")).toMatch(/허용 목록 id 와 다릅니다/)
    expect(plan(makeSnapshot(), { env: ` ${SPREADSHEET_ID} ` }).ok).toBe(true)
  })

  it("탭 gid 가 다르거나 탭이 없으면 요청 0", () => {
    const wrongGid = plan(makeSnapshot({ sheetId: 1 }))
    expect(wrongGid.ok).toBe(false)
    expect(wrongGid.requests).toEqual([])
    const missing = plan({ ...makeSnapshot(), sheetId: null, title: null })
    expect(missing.blockers.join("\n")).toMatch(/탭을 찾지 못했습니다/)
    expect(missing.requests).toEqual([])
  })

  it("Row ID 머리 없이 열이 84개가 아니면 붙이지 않는다", () => {
    const result = plan(makeSnapshot({ columnCount: 85 }))
    expect(result.ok).toBe(false)
    expect(result.blockers.join("\n")).toMatch(/열이 85개입니다\(84개일 때만/)
    expect(result.requests).toEqual([])
  })

  it("머리 구조가 바뀌었으면(layout_changed) 요청 0", () => {
    const broken = header(false)
    broken[13] = "5" // 4월 머리 자리에 5월
    const result = plan(makeSnapshot({ headerOverride: broken }))
    expect(result.ok).toBe(false)
    expect(result.blockers.join("\n")).toMatch(/layout_changed/)
    expect(result.requests).toEqual([])
  })

  it("행이 읽기 범위(1000행)를 넘으면 막는다", () => {
    expect(plan(makeSnapshot({ rowCount: 1001 })).blockers.join("\n")).toMatch(/1000행/)
  })

  it("assertApplyTarget — 허용 목록 id 와 env 둘 다 같아야 통과", () => {
    expect(() => assertApplyTarget(SPREADSHEET_ID, SPREADSHEET_ID)).not.toThrow()
    expect(() => assertApplyTarget(SPREADSHEET_ID, undefined)).toThrow(/^not_allowed/)
    expect(() => assertApplyTarget(SPREADSHEET_ID, "1someOther")).toThrow(/^not_allowed/)
    expect(() => assertApplyTarget("1someOther", "1someOther")).toThrow(/^not_allowed/)
  })
})

describe("허용 목록 밖 요청은 거부한다", () => {
  const snapshot = makeSnapshot({
    rowIdHeader: true,
    ids: { 3: ID_A },
    basicFilter: { range: range(84, 8), filterSpecs: FILTER_SPECS },
    filterViews: [
      { filterViewId: 4242, title: "희성", range: range(84, 8), filterSpecs: [FILTER_SPECS[0]] },
      { filterViewId: 777, title: "앞쪽만", range: range(80, 8) },
    ],
    hiddenColumns: [1],
  })
  const base = plan(snapshot)
  const ctx = () => allowContextFor(snapshot, base)
  const clone = (): SheetsRequest[] => JSON.parse(JSON.stringify(base.requests))
  const idCell = (rowIndex: number, columnIndex: number, userEnteredValue: Record<string, unknown>, fields = "userEnteredValue"): SheetsRequest => ({
    updateCells: { start: { sheetId: SHEET_ID, rowIndex, columnIndex }, rows: [{ values: [{ userEnteredValue }] }], fields },
  })

  it("기준 계획은 통과한다(숨김·ID·기본 필터·필터 뷰) — CF 앞에서 끝나는 필터 뷰는 건드리지 않고 경고만", () => {
    expect(kinds(base.requests)).toEqual(["updateDimensionProperties", "updateCells", "updateCells", "setBasicFilter", "updateFilterView"])
    expect(base.ok).toBe(true)
    expect(base.warnings.join("\n")).toMatch(/필터 뷰 '앞쪽만'.*그대로 둡니다/)
    expect(() => assertRowIdRequestsAllowed(base.requests, ctx())).not.toThrow()
  })

  const cases: Array<[string, () => unknown[]]> = [
    ["요청 0개", () => []],
    ["모르는 요청 종류(deleteDimension)", () => [...clone(), { deleteDimension: { range: { sheetId: SHEET_ID, dimension: "ROWS", startIndex: 2, endIndex: 3 } } }]],
    ["열이 있는데 appendDimension", () => [{ appendDimension: { sheetId: SHEET_ID, dimension: "COLUMNS", length: 1 } }, ...clone()]],
    ["주차 칸(CF)에 쓰기", () => [idCell(3, 83, { stringValue: "r_aaaaaaaaaaaa" })]],
    ["수식 쓰기", () => [idCell(3, ROW_ID_COL, { formulaValue: "=1" })]],
    ["숫자 쓰기", () => [idCell(3, ROW_ID_COL, { numberValue: 1 })]],
    ["글자에 수식을 같이 싣기", () => [idCell(3, ROW_ID_COL, { stringValue: "r_aaaaaaaaaaaa", formulaValue: "=1" })]],
    [
      "칸에 서식까지 싣기",
      () => [
        {
          updateCells: {
            start: { sheetId: SHEET_ID, rowIndex: 3, columnIndex: ROW_ID_COL },
            rows: [{ values: [{ userEnteredValue: { stringValue: "r_aaaaaaaaaaaa" }, userEnteredFormat: { textFormat: { bold: true } } }] }],
            fields: "userEnteredValue",
          },
        },
      ],
    ],
    ["형식이 틀린 ID", () => [idCell(3, ROW_ID_COL, { stringValue: "r_ABC" })]],
    ["fields '*' (서식까지 덮기)", () => [idCell(3, ROW_ID_COL, { stringValue: "r_aaaaaaaaaaaa" }, "*")]],
    ["이미 ID 가 있는 3행 덮기", () => [idCell(2, ROW_ID_COL, { stringValue: "r_aaaaaaaaaaaa" })]],
    ["고객 없는 5행에 쓰기", () => [idCell(4, ROW_ID_COL, { stringValue: "r_aaaaaaaaaaaa" })]],
    ["열이 있는데 머리 다시 쓰기", () => [idCell(1, ROW_ID_COL, { stringValue: REV_ROW_ID_HEADER })]],
    ["다른 탭 sheetId", () => [{ updateCells: { start: { sheetId: 0, rowIndex: 3, columnIndex: ROW_ID_COL }, rows: [{ values: [{ userEnteredValue: { stringValue: "r_aaaaaaaaaaaa" } }] }], fields: "userEnteredValue" } }]],
    ["range 로 넓게 쓰기", () => [{ updateCells: { range: { sheetId: SHEET_ID }, rows: [], fields: "userEnteredValue" } }]],
    ["같은 칸 두 번", () => [idCell(3, ROW_ID_COL, { stringValue: "r_aaaaaaaaaaaa" }), idCell(3, ROW_ID_COL, { stringValue: "r_bbbbbbbbbbbb" })]],
    ["두 칸 폭", () => [{ updateCells: { start: { sheetId: SHEET_ID, rowIndex: 3, columnIndex: ROW_ID_COL }, rows: [{ values: [{ userEnteredValue: { stringValue: "r_aaaaaaaaaaaa" } }, { userEnteredValue: { stringValue: "r_bbbbbbbbbbbb" } }] }], fields: "userEnteredValue" } }]],
    ["다른 열 숨김", () => [{ updateDimensionProperties: { range: { sheetId: SHEET_ID, dimension: "COLUMNS", startIndex: 83, endIndex: 84 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } }]],
    ["열 너비까지 바꾸기(fields)", () => [{ updateDimensionProperties: { range: { sheetId: SHEET_ID, dimension: "COLUMNS", startIndex: ROW_ID_COL, endIndex: ROW_ID_COL + 1 }, properties: { hiddenByUser: true, pixelSize: 10 }, fields: "hiddenByUser,pixelSize" } }]],
    ["열 너비까지 바꾸기(properties)", () => [{ updateDimensionProperties: { range: { sheetId: SHEET_ID, dimension: "COLUMNS", startIndex: ROW_ID_COL, endIndex: ROW_ID_COL + 1 }, properties: { hiddenByUser: true, pixelSize: 10 }, fields: "hiddenByUser" } }]],
    ["숨김 풀기", () => [{ updateDimensionProperties: { range: { sheetId: SHEET_ID, dimension: "COLUMNS", startIndex: ROW_ID_COL, endIndex: ROW_ID_COL + 1 }, properties: { hiddenByUser: false }, fields: "hiddenByUser" } }]],
    [
      "기본 필터 조건을 빼고 다시 걸기",
      () => clone().map((request) => (request.setBasicFilter ? { setBasicFilter: { filter: { range: request.setBasicFilter.filter?.range } } } : request)),
    ],
    [
      "기본 필터 조건 값 바꾸기",
      () =>
        clone().map((request) => {
          if (request.setBasicFilter) request.setBasicFilter.filter!.filterSpecs![0].filterCriteria = { hiddenValues: [] }
          return request
        }),
    ],
    [
      "기본 필터에 정렬 끼워 넣기",
      () =>
        clone().map((request) => {
          if (request.setBasicFilter) request.setBasicFilter.filter!.sortSpecs = [{ dimensionIndex: 0, sortOrder: "DESCENDING" }]
          return request
        }),
    ],
    [
      "기본 필터 시작 행 바꾸기",
      () =>
        clone().map((request) => {
          if (request.setBasicFilter) request.setBasicFilter.filter!.range!.startRowIndex = 0
          return request
        }),
    ],
    [
      "기본 필터를 Row ID 열 너머까지",
      () =>
        clone().map((request) => {
          if (request.setBasicFilter) request.setBasicFilter.filter!.range!.endColumnIndex = ROW_ID_COL + 2
          return request
        }),
    ],
    [
      "필터 뷰 조건까지 바꾸기(fields)",
      () =>
        clone().map((request) => {
          if (request.updateFilterView) request.updateFilterView.fields = "range,filterSpecs"
          return request
        }),
    ],
    [
      "CF 앞에서 끝나는 필터 뷰를 Row ID 열까지 넓히기(사이 열이 끼어 든다)",
      () => [{ updateFilterView: { filter: { filterViewId: 777, range: range(85, 8) }, fields: "range" } }],
    ],
    [
      "모르는 필터 뷰",
      () =>
        clone().map((request) => {
          if (request.updateFilterView) request.updateFilterView.filter!.filterViewId = 999
          return request
        }),
    ],
  ]

  for (const [label, build] of cases) {
    it(label, () => {
      expect(() => assertRowIdRequestsAllowed(build(), ctx())).toThrow(/^not_allowed/)
    })
  }
})

describe("사후 검증 — 다시 읽은 시트가 기대와 다르면 문제를 낸다", () => {
  const snapshot = makeSnapshot()
  const result = plan(snapshot)
  const good = () => simulate(snapshot, result.requests)

  it("ID 가 빠지거나 겹치면", () => {
    const after = good()
    after.rows[3][ROW_ID_COL] = null // 4행
    after.rows[6][ROW_ID_COL] = after.rows[5][ROW_ID_COL] // 7행 = 6행
    const problems = verifyRowIdAssignment(snapshot, after, result, REF_FY).join("\n")
    expect(problems).toMatch(/형식 맞는 ID 가 없는 고객 행 1개\(4행\)/)
    expect(problems).toMatch(/같은 ID 가 여러 행에/)
  })

  it("행이 움직여 새 ID 가 다른 고객 행에 붙으면", () => {
    const after = good()
    const [r3, r4] = [after.rows[2], after.rows[3]]
    after.rows[2] = [...r4.slice(0, ROW_ID_COL), r3[ROW_ID_COL]]
    after.rows[3] = [...r3.slice(0, ROW_ID_COL), r4[ROW_ID_COL]]
    expect(verifyRowIdAssignment(snapshot, after, result, REF_FY).join("\n")).toMatch(/다른 고객 행/)
  })

  it("필터 조건·정렬·범위가 바뀌었거나 열이 숨겨지지 않았으면", () => {
    const after = good()
    after.basicFilter!.filterSpecs = [FILTER_SPECS[1]]
    after.filterViews[0].sortSpecs = []
    after.hiddenColumns = [1]
    const problems = verifyRowIdAssignment(snapshot, after, result, REF_FY).join("\n")
    expect(problems).toMatch(/기본 필터 조건\(filterSpecs\)이 바뀌었습니다/)
    expect(problems).toMatch(/필터 뷰 '희성' 정렬이 바뀌었습니다/)
    expect(problems).toMatch(/CG 열이 숨겨지지 않았습니다/)

    const notExtended = good()
    notExtended.basicFilter!.range = range(84, snapshot.rows.length)
    expect(verifyRowIdAssignment(snapshot, notExtended, result, REF_FY).join("\n")).toMatch(/기본 필터 범위가 A2:CF8 입니다\(기대 A2:CG8\)/)
  })

  it("필터 뷰 범위가 넓어지지 않았으면", () => {
    const after = good()
    after.filterViews[0].range = range(84, snapshot.rows.length)
    expect(verifyRowIdAssignment(snapshot, after, result, REF_FY).join("\n")).toMatch(/필터 뷰 '희성' 범위가 A2:CF8 입니다\(기대 A2:CG8\)/)
  })

  it("응답이 0 인 시작 칸을 생략해도 같은 범위로 본다(거짓 경보 없음)", () => {
    const open = { sheetId: SHEET_ID, startRowIndex: 1, endRowIndex: 8, endColumnIndex: 84 }
    const omitted = makeSnapshot({
      basicFilter: { range: open, filterSpecs: FILTER_SPECS },
      filterViews: [{ filterViewId: 4242, title: "희성", range: { ...open } }],
    })
    const omittedPlan = plan(omitted)
    expect(() => assertRowIdRequestsAllowed(omittedPlan.requests, allowContextFor(omitted, omittedPlan))).not.toThrow()
    const after = simulate(omitted, omittedPlan.requests)
    after.basicFilter!.range = { ...after.basicFilter!.range, startColumnIndex: 0 }
    after.filterViews[0].range = { ...after.filterViews[0].range, startColumnIndex: 0 }
    expect(verifyRowIdAssignment(omitted, after, omittedPlan, REF_FY)).toEqual([])
  })

  it("머리가 없거나 고객 행 수가 바뀌었으면", () => {
    const after = good()
    after.rows[1] = header(false)
    after.rows.push(Array.from({ length: 85 }, (_, col) => (col === 0 ? "새학원" : null)))
    after.rowCount += 1
    const problems = verifyRowIdAssignment(snapshot, after, result, REF_FY).join("\n")
    expect(problems).toMatch(/Row ID 머리가 없습니다/)
    expect(problems).toMatch(/고객 행 수가 5 → 6/)
  })

  it("원래 있던 ID 가 사라지면(재사용 열)", () => {
    const reuse = makeSnapshot({ rowIdHeader: true, ids: { 3: ID_A }, filterViews: [] })
    const reusePlan = plan(reuse)
    const after = simulate(reuse, reusePlan.requests)
    after.rows[2][ROW_ID_COL] = "r_zzzzzzzzzzzz"
    expect(verifyRowIdAssignment(reuse, after, reusePlan, REF_FY).join("\n")).toMatch(/원래 있던 ID r_0123456789ab\(3행\)가 사라졌습니다/)
  })
})

describe("응답 → 스냅샷·읽기 범위", () => {
  it("메타·그리드 응답에서 '2. REV' 만 골라 칸 글자·숨김 열·필터를 싣는다", () => {
    const meta: sheets_v4.Schema$Spreadsheet = {
      properties: { title: "FY26-27 Sales Ledger" },
      sheets: [
        { properties: { sheetId: 1, title: "1. DSH", gridProperties: { rowCount: 40, columnCount: 20 } } },
        {
          properties: { sheetId: SHEET_ID, title: "2. REV", gridProperties: { rowCount: 450, columnCount: 84 } },
          basicFilter: { range: range(84), filterSpecs: FILTER_SPECS },
          filterViews: [{ filterViewId: 4242, title: "희성", range: range(84) }],
        },
      ],
    }
    const grid: sheets_v4.Schema$Spreadsheet = {
      sheets: [
        {
          properties: { sheetId: SHEET_ID, title: "2. REV" },
          data: [
            {
              rowData: [
                { values: [{ formattedValue: "합계" }] },
                { values: [{ formattedValue: "Account" }] },
                { values: [{ formattedValue: "가나학원" }, { userEnteredValue: { stringValue: "BD" } }, { userEnteredValue: { numberValue: 3 } }, {}] },
              ],
              columnMetadata: [{ hiddenByUser: false }, { hiddenByUser: true }, {}],
            },
          ],
        },
      ],
    }
    const snapshot = snapshotFromResponses(SPREADSHEET_ID, meta, grid)
    expect(snapshot).toMatchObject({
      spreadsheetId: SPREADSHEET_ID,
      spreadsheetTitle: "FY26-27 Sales Ledger",
      sheetId: SHEET_ID,
      title: "2. REV",
      rowCount: 450,
      columnCount: 84,
      hiddenColumns: [1],
    })
    expect(snapshot.rows[2]).toEqual(["가나학원", "BD", "3", null])
    expect(filterSpecsOf(snapshot.basicFilter)).toEqual(FILTER_SPECS)
    expect(snapshot.filterViews).toHaveLength(1)
  })

  it("탭이 없으면 sheetId·title 이 null 이고 계획은 막힌다", () => {
    const snapshot = snapshotFromResponses(SPREADSHEET_ID, { sheets: [{ properties: { sheetId: 1, title: "1. DSH" } }] }, null)
    expect(snapshot.sheetId).toBeNull()
    expect(plan(snapshot).ok).toBe(false)
  })

  it("읽기 범위는 그리드 크기 그대로, 상한은 CZ·1000행", () => {
    expect(gridReadRange(450, 84)).toBe("'2. REV'!A1:CF450")
    expect(gridReadRange(450, 85)).toBe("'2. REV'!A1:CG450")
    expect(gridReadRange(5000, 300)).toBe("'2. REV'!A1:CZ1000")
  })
})

describe("스크립트 진입점 — 기본은 미리보기, 쓰기는 검사 뒤 한 번", () => {
  const source = readFileSync(join(process.cwd(), "scripts/assign-rev-row-ids.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")

  /** 정규식이 가리킨 if 문의 중괄호 본문(짝 맞춤). 못 찾으면 null. */
  function ifBlock(re: RegExp): { at: number; body: string } | null {
    const match = re.exec(source)
    if (!match) return null
    const open = source.indexOf("{", match.index + match[0].length - 1)
    let depth = 0
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1
      if (source[i] === "}") depth -= 1
      if (depth === 0) return { at: match.index, body: source.slice(open + 1, i) }
    }
    return null
  }

  it("batchUpdate 호출은 하나이고, 미리보기·막음 return 과 대상 확인·허용 목록 검사 뒤에만 있다", () => {
    const writes = [...source.matchAll(/\bspreadsheets\s*\.\s*batchUpdate\s*\(/g)]
    expect(writes).toHaveLength(1)
    const writeAt = writes[0].index ?? -1
    const preview = ifBlock(/\bif\s*\(\s*!apply\s*\)\s*\{/)
    const blocked = ifBlock(/\bif\s*\(\s*!plan\.ok\s*\)\s*\{/)
    for (const block of [preview, blocked]) {
      expect(block).not.toBeNull()
      expect(block!.body).toMatch(/\breturn\b/)
      expect(block!.at).toBeLessThan(writeAt)
    }
    const targetCheck = source.search(/\bassertApplyTarget\s*\(\s*spreadsheetId\s*,\s*envSpreadsheetId\s*\)/)
    const allowCheck = source.search(/\bassertRowIdRequestsAllowed\s*\(\s*plan\.requests\s*,\s*allowContextFor\s*\(\s*before\s*,\s*plan\s*\)\s*\)/)
    for (const at of [targetCheck, allowCheck]) {
      expect(at).toBeGreaterThan(-1)
      expect(at).toBeLessThan(writeAt)
    }
  })

  it("--apply 는 인자 글자 그대로만 켜고, 대상은 허용 목록 상수, 쓰기는 재시도 없음", () => {
    expect(source).toMatch(/\bconst apply = args\.has\("--apply"\)/)
    expect(source).toMatch(/\bconst spreadsheetId = REV_WRITE_TARGET\.spreadsheetId\b/)
    const writeAt = source.search(/\bspreadsheets\s*\.\s*batchUpdate\s*\(/)
    const open = source.indexOf("(", writeAt)
    let depth = 0
    let close = -1
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1
      if (source[i] === ")") depth -= 1
      if (depth === 0) {
        close = i
        break
      }
    }
    const call = source.slice(open, close + 1)
    expect(call).toMatch(/\bretry: false\b/)
    expect(call).toMatch(/\brequests: plan\.requests\b/)
  })
})
