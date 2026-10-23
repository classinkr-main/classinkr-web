import { describe, expect, it } from "vitest"

import { isRevLayoutError, resolveRevLayout, type RevLayout } from "@/lib/branch/sheet-writeback/layout"
import { planDraftWrites, type WriteDraftPlan } from "@/lib/branch/sheet-writeback/plan"
import {
  assertRequestsAllowed,
  buildUpdateCellsRequests,
  FIELDS_COLOR_ONLY,
  FIELDS_VALUE_AND_COLOR,
  FIELDS_VALUE_ONLY,
} from "@/lib/branch/sheet-writeback/requests"
import { restoreRequestsForShift, verifyWrites } from "@/lib/branch/sheet-writeback/verify"

import {
  baselineFor,
  block,
  BLUE,
  buildGrid,
  buildHeader,
  buildRow,
  cloneGrid,
  editDraft,
  RED,
  REF_FY,
  ROW_A,
  ROW_B,
  TODAY,
  type RowSpec,
} from "./fixtures"

const SHEET_ID = 957802439
const oct = block("2026-10")

function layout(): RevLayout {
  const resolved = resolveRevLayout(buildHeader(), REF_FY)
  if (isRevLayoutError(resolved)) throw new Error(resolved.detail)
  return resolved
}

const rowA: RowSpec = { rowId: ROW_A, customer: "가나학원", months: { "2026-10": [{}, {}, {}, { v: 300, fg: RED }, { v: 0 }] } }
const rowB: RowSpec = { rowId: ROW_B, customer: "다라학원", months: { "2026-10": [{}, {}, {}, { v: 900, fg: BLUE }, {}] } }

function writePlans(rows: RowSpec[] = [rowA, rowB]): WriteDraftPlan[] {
  const baseline = baselineFor(ROW_A, "가나학원", "2026-10", [
    { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 300, color: "r" }, { value: 0, color: "k" },
  ])
  const value = editDraft({ id: "value", amount: 500, baseline })
  const { plans } = planDraftWrites(buildGrid(rows), [value], { today: TODAY, refFy: REF_FY })
  return plans.filter((plan): plan is WriteDraftPlan => plan.action === "write")
}

describe("buildUpdateCellsRequests", () => {
  it("칸 하나 = updateCells 하나, 값+색 / 값만 / 색만 fields", () => {
    const plan: WriteDraftPlan = {
      draftId: "d",
      action: "write",
      rowIndex: 4,
      rowId: ROW_A,
      cells: [
        { a1: "BB5", row: 4, col: oct.weekCols[3], before: { value: null, color: "r" }, after: { value: 10, color: "k" }, writeValue: true, writeColor: true },
        { a1: "BA5", row: 4, col: oct.weekCols[2], before: { value: 5, color: "b" }, after: { value: 7, color: "b" }, writeValue: true, writeColor: false },
        { a1: "BC5", row: 4, col: oct.weekCols[4], before: { value: 5, color: "b" }, after: { value: 5, color: "r" }, writeValue: false, writeColor: true },
      ],
    }
    const requests = buildUpdateCellsRequests([plan], SHEET_ID) as Array<{ updateCells: Record<string, unknown> }>
    expect(requests).toHaveLength(3)
    expect(requests[0]).toEqual({
      updateCells: {
        range: { sheetId: SHEET_ID, startRowIndex: 4, endRowIndex: 5, startColumnIndex: oct.weekCols[3], endColumnIndex: oct.weekCols[3] + 1 },
        rows: [{ values: [{
          userEnteredValue: { numberValue: 10 },
          userEnteredFormat: { textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, foregroundColorStyle: { rgbColor: { red: 0, green: 0, blue: 0 } } } },
        }] }],
        fields: FIELDS_VALUE_AND_COLOR,
      },
    })
    expect(requests[1].updateCells.fields).toBe(FIELDS_VALUE_ONLY)
    expect(requests[1].updateCells.rows).toEqual([{ values: [{ userEnteredValue: { numberValue: 7 } }] }])
    expect(requests[2].updateCells.fields).toBe(FIELDS_COLOR_ONLY)
    expect(requests[2].updateCells.rows).toEqual([{ values: [{ userEnteredFormat: { textFormat: { foregroundColor: { red: 1, green: 0, blue: 0 }, foregroundColorStyle: { rgbColor: { red: 1, green: 0, blue: 0 } } } } }] }])
    expect(() => assertRequestsAllowed(requests, layout(), SHEET_ID)).not.toThrow()
  })
})

describe("assertRequestsAllowed — 허용 목록 위반은 throw not_allowed", () => {
  const good = () => buildUpdateCellsRequests(writePlans(), SHEET_ID) as Array<Record<string, Record<string, unknown>>>
  const mutate = (fn: (request: Record<string, Record<string, unknown>>) => void) => {
    const requests = good()
    fn(requests[0])
    return requests
  }

  it.each([
    ["updateCells 아닌 요청", () => [{ appendDimension: { sheetId: SHEET_ID, dimension: "COLUMNS", length: 1 } }]],
    ["updateCells 와 다른 키 함께", () => mutate((r) => { (r as Record<string, unknown>).repeatCell = {} })],
    ["다른 sheetId", () => mutate((r) => { (r.updateCells.range as Record<string, unknown>).sheetId = 0 })],
    ["1행(합계)", () => mutate((r) => { Object.assign(r.updateCells.range as object, { startRowIndex: 0, endRowIndex: 1 }) })],
    ["2행(머리)", () => mutate((r) => { Object.assign(r.updateCells.range as object, { startRowIndex: 1, endRowIndex: 2 }) })],
    ["여러 행", () => mutate((r) => { Object.assign(r.updateCells.range as object, { endRowIndex: 10 }) })],
    ["월 합계 칸(AX)", () => mutate((r) => { Object.assign(r.updateCells.range as object, { startColumnIndex: oct.totalCol, endColumnIndex: oct.totalCol + 1 }) })],
    ["속성 칸(A)", () => mutate((r) => { Object.assign(r.updateCells.range as object, { startColumnIndex: 0, endColumnIndex: 1 }) })],
    ["M Sum", () => mutate((r) => { Object.assign(r.updateCells.range as object, { startColumnIndex: 12, endColumnIndex: 13 }) })],
    ["Row ID 열", () => mutate((r) => { Object.assign(r.updateCells.range as object, { startColumnIndex: 84, endColumnIndex: 85 }) })],
    ["여러 열", () => mutate((r) => { Object.assign(r.updateCells.range as object, { endColumnIndex: (r.updateCells.range as { startColumnIndex: number }).startColumnIndex + 2 }) })],
    ["start(좌표) 사용", () => mutate((r) => { r.updateCells.start = { sheetId: SHEET_ID, rowIndex: 2, columnIndex: oct.weekCols[3] } })],
    ["fields *", () => mutate((r) => { r.updateCells.fields = "*" })],
    ["fields 배경색", () => mutate((r) => { r.updateCells.fields = "userEnteredFormat.backgroundColor" })],
    ["fields * + 빈 칸 데이터(값·서식 통째 지우기)", () => mutate((r) => { r.updateCells.fields = "*"; r.updateCells.rows = [{ values: [{}] }] })],
    ["fields 넓은 마스크 + 빈 칸 데이터", () => mutate((r) => { r.updateCells.fields = "userEnteredValue,userEnteredFormat"; r.updateCells.rows = [{ values: [{}] }] })],
    ["수식 값", () => mutate((r) => { r.updateCells.rows = [{ values: [{ userEnteredValue: { formulaValue: "=1" } }] }] })],
    ["글자 값", () => mutate((r) => { r.updateCells.rows = [{ values: [{ userEnteredValue: { stringValue: "x" } }] }] })],
    ["음수", () => mutate((r) => { r.updateCells.rows = [{ values: [{ userEnteredValue: { numberValue: -1 } }] }] })],
    ["값 없이 값 칸 비우기", () => mutate((r) => { r.updateCells.rows = [{ values: [{}] }] })],
    ["fields 에 없는 서식", () => mutate((r) => { r.updateCells.rows = [{ values: [{ userEnteredValue: { numberValue: 1 }, userEnteredFormat: { textFormat: { bold: true } } }] }] })],
    ["행 두 개", () => mutate((r) => { r.updateCells.rows = [{ values: [{ userEnteredValue: { numberValue: 1 } }] }, { values: [] }] })],
  ])("%s", (_label, build) => {
    expect(() => assertRequestsAllowed(build() as unknown[], layout(), SHEET_ID)).toThrow("not_allowed")
  })

  it("칸 비우기는 allowClear(되돌리기 전용)일 때만 통과", () => {
    const requests = mutate((r) => { r.updateCells.fields = FIELDS_VALUE_ONLY; r.updateCells.rows = [{ values: [{}] }] })
    expect(() => assertRequestsAllowed(requests, layout(), SHEET_ID)).toThrow("not_allowed")
    expect(() => assertRequestsAllowed(requests, layout(), SHEET_ID, { allowClear: true })).not.toThrow()
  })
})

describe("verifyWrites", () => {
  it("쓴 값·색·월 합계가 맞으면 ok", () => {
    const plans = writePlans()
    const after = buildGrid([{ ...rowA, months: { "2026-10": [{}, {}, {}, { v: 500, fg: RED }, { v: 0 }] } }, rowB])
    expect(verifyWrites(after, plans, layout())).toEqual([{ draftId: "value", ok: true }])
  })

  it("그 자리에 다른 행 ID 가 오면 row_shifted", () => {
    const plans = writePlans()
    const after = buildGrid([rowB, rowA])
    expect(verifyWrites(after, plans, layout())).toEqual([{ draftId: "value", ok: false, code: "row_shifted" }])
  })

  it("값이 다르거나 월 합계가 주차 합과 다르면 verify_mismatch", () => {
    const plans = writePlans()
    const wrongValue = buildGrid([{ ...rowA, months: { "2026-10": [{}, {}, {}, { v: 501, fg: RED }, {}] } }, rowB])
    expect(verifyWrites(wrongValue, plans, layout())[0]).toMatchObject({ ok: false, code: "verify_mismatch" })
    const wrongSum = buildGrid([{ ...rowA, months: { "2026-10": [{}, {}, {}, { v: 500, fg: RED }, {}] } }, rowB])
    wrongSum.rows[2][oct.totalCol] = { ...wrongSum.rows[2][oct.totalCol], value: 300 }
    expect(verifyWrites(wrongSum, plans, layout())[0]).toMatchObject({ ok: false, code: "verify_mismatch" })
  })

  it("쓰는 사이 열이 끼거나 빠지면(머리 구조가 바뀜) layout_changed — 행 이동으로 보지 않는다(되돌릴 수 없다)", () => {
    const plans = writePlans()
    const inserted = buildGrid([{ ...rowA, months: { "2026-10": [{}, {}, {}, { v: 500, fg: RED }, { v: 0 }] } }, rowB])
    // A~M 사이(F 앞)에 열 하나 — 옛 Row ID 열 번호에는 이제 다른 값이 온다.
    inserted.header.splice(5, 0, null)
    for (const row of inserted.rows) row.splice(5, 0, { value: null, formula: null, fg: null, text: null })
    expect(verifyWrites(inserted, plans, layout())).toEqual([{ draftId: "value", ok: false, code: "layout_changed" }])

    // 월 블록 안에 열이 끼어 머리 해석 자체가 깨져도 같다.
    const broken = cloneGrid(inserted)
    broken.header[oct.weekCols[2]] = "메모"
    expect(verifyWrites(broken, plans, layout())).toEqual([{ draftId: "value", ok: false, code: "layout_changed" }])

    // 머리가 그대로면(행만 움직였으면) 지금처럼 row_shifted.
    expect(verifyWrites(buildGrid([rowB, rowA]), plans, layout())).toEqual([{ draftId: "value", ok: false, code: "row_shifted" }])
  })

  it("색이 다르면 verify_mismatch(색을 쓴 칸만 본다)", () => {
    const row: RowSpec = { rowId: ROW_A, customer: "가나학원", months: { "2026-11": [{}, {}, {}, {}, {}] } }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-11", [])
    const draft = editDraft({ month: "2026-11", amount: 70, baseline, metadata: { confidence: "confirmed" } })
    const plans = planDraftWrites(buildGrid([row]), [draft], { today: TODAY, refFy: REF_FY }).plans.filter((p): p is WriteDraftPlan => p.action === "write")
    const after = buildGrid([{ ...row, months: { "2026-11": [{ v: 70, fg: BLUE }, {}, {}, {}, {}] } }])
    expect(verifyWrites(after, plans, layout())[0]).toMatchObject({ ok: false, code: "verify_mismatch" })
  })
})

describe("restoreRequestsForShift", () => {
  it("그 자리에 지금 있는 행의 쓰기 전 값·색을 되쓴다", () => {
    const plans = writePlans()
    const before = buildGrid([rowA, rowB])
    // 쓰는 사이 B 가 A 자리(3행)로 올라왔고, 우리가 쓴 500 이 B 의 칸에 들어갔다.
    const after = buildGrid([{ ...rowB, months: { "2026-10": [{}, {}, {}, { v: 500, fg: BLUE }, {}] } }, rowA])
    const requests = restoreRequestsForShift(before, after, plans, SHEET_ID) as Array<{ updateCells: { range: Record<string, number>; rows: unknown[]; fields: string } }>
    expect(requests).toHaveLength(1)
    expect(requests[0].updateCells.range).toMatchObject({ startRowIndex: 2, startColumnIndex: oct.weekCols[3] })
    expect(requests[0].updateCells.fields).toBe(FIELDS_VALUE_ONLY)
    expect(requests[0].updateCells.rows).toEqual([{ values: [{ userEnteredValue: { numberValue: 900 } }] }])
    expect(() => assertRequestsAllowed(requests, layout(), SHEET_ID)).not.toThrow()
  })

  it("쓰기 전에 비어 있던 칸이면 칸 비우기(allowClear 로만 통과)", () => {
    const row: RowSpec = { rowId: ROW_A, customer: "가나학원", months: { "2026-11": [{}, {}, {}, {}, {}] } }
    const other: RowSpec = { rowId: ROW_B, customer: "다라학원" }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-11", [])
    const before = buildGrid([row, other])
    const plans = planDraftWrites(before, [editDraft({ month: "2026-11", amount: 70, baseline })], { today: TODAY, refFy: REF_FY })
      .plans.filter((p): p is WriteDraftPlan => p.action === "write")
    const after = buildGrid([{ ...other, months: { "2026-11": [{ v: 70 }] } }, row])
    const requests = restoreRequestsForShift(before, after, plans, SHEET_ID)
    expect(requests).toHaveLength(1)
    expect(() => assertRequestsAllowed(requests, layout(), SHEET_ID)).toThrow("not_allowed")
    expect(() => assertRequestsAllowed(requests, layout(), SHEET_ID, { allowClear: true })).not.toThrow()
  })

  it("그 자리 행을 쓰기 전 그리드에서 찾지 못하면 빈 배열(사람 복구)", () => {
    const plans = writePlans()
    const before = buildGrid([rowA, rowB])
    const stranger: RowSpec = { rowId: "r_zzzzzzzzzzzz", customer: "새 행" }
    const after = cloneGrid(before)
    after.rows[2] = buildRow(stranger, 2)
    expect(restoreRequestsForShift(before, after, plans, SHEET_ID)).toEqual([])
    const noId = cloneGrid(before)
    noId.rows[2] = buildRow({ customer: "ID 없는 행" }, 2)
    expect(restoreRequestsForShift(before, noId, plans, SHEET_ID)).toEqual([])
  })

  it("쓰기 전 그리드에 그 행 ID 가 둘 이상이면(복사 행) 어느 값인지 몰라 되쓰지 않는다", () => {
    const plans = writePlans()
    const before = buildGrid([rowA, rowB, { ...rowB, customer: "다라학원 복사" }])
    const after = buildGrid([rowB, rowA])
    expect(restoreRequestsForShift(before, after, plans, SHEET_ID)).toEqual([])
  })
})
