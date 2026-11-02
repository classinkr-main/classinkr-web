import { describe, expect, it } from "vitest"

import { buildSheetBaseline } from "@/lib/branch/sheet-writeback/baseline"
import { planDraftWrites, type DraftPlan } from "@/lib/branch/sheet-writeback/plan"

import {
  baselineFor,
  block,
  BLUE,
  buildGrid,
  editDraft,
  RED,
  REF_FY,
  ROW_A,
  ROW_B,
  TODAY,
  type RowSpec,
} from "./fixtures"

const opts = { today: TODAY, refFy: REF_FY }
const oct = block("2026-10")

function plan(rows: RowSpec[], drafts: Parameters<typeof planDraftWrites>[1], gridOpts?: Parameters<typeof buildGrid>[1]) {
  return planDraftWrites(buildGrid(rows, gridOpts), drafts, opts)
}

function only(result: { plans: DraftPlan[] }): DraftPlan {
  expect(result.plans).toHaveLength(1)
  return result.plans[0]
}

const baseRow: RowSpec = {
  rowId: ROW_A,
  customer: "가나학원",
  months: { "2026-10": [{}, {}, {}, { v: 300, fg: RED }, {}] },
}
const baseBaseline = baselineFor(ROW_A, "가나학원", "2026-10", [
  { value: 0, color: "k" },
  { value: 0, color: "k" },
  { value: 0, color: "k" },
  { value: 300, color: "r" },
  { value: 0, color: "k" },
])

describe("planDraftWrites — 대상·구조", () => {
  it("new-row 는 시트 쓰기 대상이 아니다(app_only)", () => {
    expect(only(plan([baseRow], [editDraft({ kind: "new-row", baseline: baseBaseline })]))).toEqual({
      draftId: "draft-1",
      action: "app_only",
      code: "new_row_app_only",
    })
  })

  it("탭 title·sheetId 가 다르면 not_allowed", () => {
    expect(only(plan([baseRow], [editDraft({ baseline: baseBaseline })], { title: "1. DSH" }))).toMatchObject({ action: "refuse", code: "not_allowed" })
    expect(only(plan([baseRow], [editDraft({ baseline: baseBaseline })], { sheetId: 1 }))).toMatchObject({ action: "refuse", code: "not_allowed" })
  })

  it("머리 구조가 바뀌면 layout_changed(+ layoutError)", () => {
    const grid = buildGrid([baseRow])
    grid.header = [...grid.header]
    grid.header[0] = "Customer"
    const result = planDraftWrites(grid, [editDraft({ baseline: baseBaseline })], opts)
    expect(result.layoutError).toBeTruthy()
    expect(only(result)).toMatchObject({ action: "refuse", code: "layout_changed" })
  })

  it("Row ID 열이 없으면 no_row_id", () => {
    expect(only(plan([baseRow], [editDraft({ baseline: baseBaseline })], { rowIdHeader: false }))).toMatchObject({ code: "no_row_id" })
  })
})

describe("planDraftWrites — 행 찾기", () => {
  it.each([
    ["baseline 없음", editDraft({}), "no_baseline"],
    ["baseline 형식 오류", editDraft({ baseline: { v: 1 } }), "no_baseline"],
    ["baseline 달이 초안 달과 다름", editDraft({ baseline: { ...baseBaseline, month: "2026-11" } }), "no_baseline"],
    ["행 ID 없음", editDraft({ baseline: { ...baseBaseline, rowId: null } }), "no_row_id"],
    ["시트에 그 행 ID 없음", editDraft({ baseline: { ...baseBaseline, rowId: ROW_B } }), "row_not_found"],
    ["고객이 바뀜", editDraft({ baseline: { ...baseBaseline, customer: "다른학원" } }), "identity_changed"],
    ["시트에 없는 달", editDraft({ month: "2025-10", baseline: { ...baseBaseline, month: "2025-10" } }), "month_not_in_sheet"],
    ["통화가 CNY 아님", editDraft({ currency: "KRW", baseline: baseBaseline }), "amount_invalid"],
  ])("%s → %s", (_label, draft, code) => {
    expect(only(plan([baseRow], [draft]))).toMatchObject({ action: "refuse", code })
  })

  it("같은 행 ID 가 두 행에 있으면 row_id_duplicate", () => {
    expect(only(plan([baseRow, { ...baseRow, customer: "복사본" }], [editDraft({ baseline: baseBaseline })]))).toMatchObject({ code: "row_id_duplicate" })
  })

  it("행이 움직였어도(정렬) 행 ID 로 찾는다", () => {
    const result = only(plan([{ rowId: ROW_B, customer: "다른학원" }, baseRow], [editDraft({ amount: 500, baseline: baseBaseline })]))
    expect(result).toMatchObject({ action: "write", rowIndex: 3, rowId: ROW_A })
  })
})

describe("planDraftWrites — 계획", () => {
  it("값 있는 칸 1개의 금액을 바꾼다(색 그대로)", () => {
    const result = only(plan([baseRow], [editDraft({ amount: 500, baseline: baseBaseline })]))
    expect(result).toEqual({
      draftId: "draft-1",
      action: "write",
      rowIndex: 2,
      rowId: ROW_A,
      cells: [
        {
          a1: "BB3",
          row: 2,
          col: oct.weekCols[3],
          before: { value: 300, color: "r" },
          after: { value: 500, color: "r" },
          writeValue: true,
          writeColor: false,
        },
      ],
    })
  })

  it("빈 칸에 숨은 빨강이 있어도 쓰는 색(예정=검정)을 명시해 덮는다", () => {
    const row: RowSpec = { rowId: ROW_A, customer: "가나학원", months: { "2026-11": [{ fg: RED }, { fg: BLUE }, {}, {}, {}] } }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-11", [])
    const result = only(plan([row], [editDraft({ month: "2026-11", amount: 700, baseline })]))
    expect(result).toMatchObject({ action: "write" })
    if (result.action !== "write") return
    expect(result.cells).toEqual([
      expect.objectContaining({ before: { value: null, color: "r" }, after: { value: 700, color: "k" }, writeValue: true, writeColor: true }),
    ])
  })

  it("baseline 과 live 가 다르면 conflict", () => {
    const changed: RowSpec = { ...baseRow, months: { "2026-10": [{}, {}, {}, { v: 350, fg: RED }, {}] } }
    expect(only(plan([changed], [editDraft({ amount: 500, baseline: baseBaseline })]))).toMatchObject({ action: "refuse", code: "conflict" })
  })

  it("값 칸의 색만 바뀌어도 conflict(빈 칸 색은 비교하지 않는다)", () => {
    const recolored: RowSpec = { ...baseRow, months: { "2026-10": [{ fg: BLUE }, {}, {}, { v: 300, fg: BLUE }, {}] } }
    expect(only(plan([recolored], [editDraft({ amount: 500, baseline: baseBaseline })]))).toMatchObject({ code: "conflict" })
    const hiddenOnly: RowSpec = { ...baseRow, months: { "2026-10": [{ fg: BLUE }, {}, {}, { v: 300, fg: RED }, {}] } }
    expect(only(plan([hiddenOnly], [editDraft({ amount: 500, baseline: baseBaseline })]))).toMatchObject({ action: "write" })
  })

  it("live 가 이미 의도한 결과면(이전 시도 결과 모름) already_written", () => {
    const done: RowSpec = { ...baseRow, months: { "2026-10": [{}, {}, {}, { v: 500, fg: RED }, {}] } }
    const result = only(plan([done], [editDraft({ amount: 500, baseline: baseBaseline })]))
    expect(result).toMatchObject({ action: "skip_write", code: "already_written", rowIndex: 2, rowId: ROW_A })
    if (result.action === "skip_write") {
      expect(result.cells[0]).toMatchObject({ before: { value: 300, color: "r" }, after: { value: 500, color: "r" } })
    }
  })

  it("바꿀 칸이 없으면 noop(code no_change — 시트에 쓴 것이 없다)", () => {
    expect(only(plan([baseRow], [editDraft({ amount: 300, baseline: baseBaseline })]))).toEqual({ draftId: "draft-1", action: "noop", code: "no_change" })
  })

  it("주차 단위 초안은 metadata.weeklyConfidenceTouched 로 고른 주차만 색을 쓴다(모양이 틀리면 표시 없음)", () => {
    const row: RowSpec = { ...baseRow, months: { "2026-10": [{}, {}, {}, { v: 300, fg: RED }, { v: 200, fg: BLUE }] } }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-10", [
      { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 300, color: "r" }, { value: 200, color: "b" },
    ])
    const metadata = (weeklyConfidenceTouched: unknown) => ({
      confidence: "expected",
      weekly: [0, 0, 0, 300, 250],
      weeklyConfidence: [null, null, null, "expected", "expected"],
      confidenceTouched: true,
      weeklyConfidenceTouched,
    })
    const cellsOf = (weeklyConfidenceTouched: unknown) => {
      const result = only(plan([row], [editDraft({ amount: 550, baseline, metadata: metadata(weeklyConfidenceTouched) })]))
      return result.action === "write" ? result.cells.map((cell) => [cell.a1, cell.after, cell.writeValue, cell.writeColor]) : result
    }
    // W5 만 고름 → W5 값·색, 손대지 않은 W4 빨강은 그대로(쓰지 않는다).
    expect(cellsOf([false, false, false, false, true])).toEqual([["BC3", { value: 250, color: "k" }, true, true]])
    // 아무 주차도 안 고름 → W5 값만, 색 그대로.
    expect(cellsOf([false, false, false, false, false])).toEqual([["BC3", { value: 250, color: "b" }, true, false]])
    // 모양이 틀린 표시는 "표시 없음"(주차 토큰도 없으니 어느 주차도 고르지 않은 것).
    expect(cellsOf([true, true])).toEqual([["BC3", { value: 250, color: "b" }, true, false]])
  })

  it("planWeekWrites 거절은 그 코드로(지난 주차)", () => {
    const row: RowSpec = { ...baseRow, months: { "2026-10": [{ v: 100, fg: RED }, {}, {}, {}, {}] } }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-10", [{ value: 100, color: "r" }, { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 0, color: "k" }])
    expect(only(plan([row], [editDraft({ amount: 200, baseline })]))).toMatchObject({ code: "past_week" })
  })

  it("대상 칸에 수식(상수 산식 포함)이나 글자가 있으면 formula_cell", () => {
    const formulaRow: RowSpec = { ...baseRow, months: { "2026-10": [{}, {}, {}, { v: 300, fg: RED, formula: "=100*3" }, {}] } }
    expect(only(plan([formulaRow], [editDraft({ amount: 500, baseline: baseBaseline })]))).toMatchObject({ code: "formula_cell" })
    const textRow: RowSpec = { rowId: ROW_A, customer: "가나학원", months: { "2026-11": [{ text: "TBD" }, {}, {}, {}, {}] } }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-11", [])
    expect(only(plan([textRow], [editDraft({ month: "2026-11", amount: 10, baseline })]))).toMatchObject({ code: "formula_cell" })
  })

  it("실측 사례: 9월 합계가 AZ(10월 w2)를 더하는 행에 10월 쓰기 → month_formula_irregular", () => {
    const row: RowSpec = {
      ...baseRow,
      totalFormula: { "2026-09": "=AS3+AT3+AU3+AV3+AZ3" },
      months: { "2026-10": [{}, {}, {}, {}, {}] },
    }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-10", [])
    // 10월 w2(AZ, 8일 시작)가 아직 지나지 않은 날로 본다.
    const early = { today: "2026-10-05", refFy: REF_FY }
    const azDraft = editDraft({ amount: 400, baseline, metadata: { confidence: "confirmed", weekly: [0, 400, 0, 0, 0], weeklyConfidence: null, confidenceTouched: false } })
    expect(only(planDraftWrites(buildGrid([row]), [azDraft], early))).toMatchObject({ code: "month_formula_irregular" })
    // 같은 행이라도 9월 합계가 더하지 않는 칸(w4·BB)은 쓸 수 있다.
    const bbDraft = editDraft({ amount: 400, baseline, metadata: { confidence: "confirmed", weekly: [0, 0, 0, 400, 0], weeklyConfidence: null, confidenceTouched: false } })
    expect(only(planDraftWrites(buildGrid([row]), [bbDraft], early))).toMatchObject({ action: "write" })
  })

  it("같은 배치에 같은 (행 ID, 달) 두 건 → 늦게 고친 것만, 나머지 conflict", () => {
    const early = editDraft({ id: "early", amount: 500, baseline: baseBaseline, updatedAt: "2026-10-23T01:00:00Z" })
    const late = editDraft({ id: "late", amount: 600, baseline: baseBaseline, updatedAt: "2026-10-23T02:00:00Z" })
    const result = plan([baseRow], [late, early])
    expect(result.plans).toEqual([
      expect.objectContaining({ draftId: "late", action: "write" }),
      { draftId: "early", action: "refuse", code: "conflict" },
    ])
  })

  it("배열 순서와 무관하게 updatedAt 이 늦은 쪽이 쓴다([early, late] 순서)", () => {
    const early = editDraft({ id: "early", amount: 500, baseline: baseBaseline, updatedAt: "2026-10-23T01:00:00Z" })
    const late = editDraft({ id: "late", amount: 600, baseline: baseBaseline, updatedAt: "2026-10-23T02:00:00Z" })
    const result = plan([baseRow], [early, late])
    expect(result.plans).toEqual([
      { draftId: "early", action: "refuse", code: "conflict" },
      expect.objectContaining({ draftId: "late", action: "write" }),
    ])
    const written = result.plans.find((candidate) => candidate.action === "write")
    if (written?.action !== "write") throw new Error("write plan missing")
    expect(written.cells[0].after.value).toBe(600)
  })

  it("updatedAt 이 같거나 없으면 배열 뒤쪽(나중에 들어온 것)이 쓴다", () => {
    const first = editDraft({ id: "first", amount: 500, baseline: baseBaseline, updatedAt: "2026-10-23T02:00:00Z" })
    const second = editDraft({ id: "second", amount: 600, baseline: baseBaseline, updatedAt: "2026-10-23T02:00:00Z" })
    expect(plan([baseRow], [first, second]).plans).toEqual([
      { draftId: "first", action: "refuse", code: "conflict" },
      expect.objectContaining({ draftId: "second", action: "write" }),
    ])
    const a = editDraft({ id: "a", amount: 500, baseline: baseBaseline })
    const b2 = editDraft({ id: "b", amount: 600, baseline: baseBaseline })
    expect(plan([baseRow], [a, b2]).plans).toEqual([
      { draftId: "a", action: "refuse", code: "conflict" },
      expect.objectContaining({ draftId: "b", action: "write" }),
    ])
  })

  it("주차 칸을 가리킨 초안(metadata.week w3, weekly 없음)은 빈 달에서 첫 결제일 주차가 아니라 그 주차에 쓴다", () => {
    const row: RowSpec = { rowId: ROW_A, customer: "가나학원", months: {} }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-11", [])
    const draft = editDraft({
      month: "2026-11",
      amount: 700,
      baseline,
      sourceSnapshot: { sheetBaseline: baseline, row: { firstPayment: "2026-11-02" } },
      metadata: { confidence: "expected", week: "w3", weekly: null, confidenceTouched: false },
    })
    const result = only(plan([row], [draft]))
    expect(result).toMatchObject({ action: "write" })
    if (result.action === "write") expect(result.cells.map((cell) => cell.col)).toEqual([block("2026-11").weekCols[2]])
    // 월 칸("month")이면 첫 결제일 주차(w1).
    const monthCell = only(plan([row], [{ ...draft, metadata: { ...draft.metadata, week: "month" } }]))
    if (monthCell.action === "write") expect(monthCell.cells.map((cell) => cell.col)).toEqual([block("2026-11").weekCols[0]])
    expect(monthCell).toMatchObject({ action: "write" })
  })

  it("2월(4칸): buildSheetBaseline 이 5칸 파이프라인 값을 잘라 live 와 맞는다(conflict 아님)", () => {
    const row: RowSpec = { rowId: ROW_A, customer: "가나학원", months: { "2027-02": [{ v: 100, fg: RED }, {}, {}, {}] } }
    const baseline = buildSheetBaseline(
      { rowId: ROW_A, customer: "가나학원", weeklyPayments: { "2027-02": [100, 0, 0, 0, 0] }, weeklyColors: { "2027-02": "r---" } },
      "2027-02",
      "2026-10-23T01:00:00.000Z",
    )
    const result = only(plan([row], [editDraft({ month: "2027-02", amount: 400, baseline })]))
    expect(result).toMatchObject({ action: "write", cells: [{ col: block("2027-02").weekCols[0], after: { value: 400, color: "r" } }] })
  })

  it("확도만 바꾼 월 칸 → 값 있는 칸 색만", () => {
    const row: RowSpec = { ...baseRow, months: { "2026-10": [{}, {}, {}, { v: 300, fg: RED }, { v: 200, fg: BLUE }] } }
    const baseline = baselineFor(ROW_A, "가나학원", "2026-10", [
      { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 0, color: "k" }, { value: 300, color: "r" }, { value: 200, color: "b" },
    ])
    const draft = editDraft({ amount: 500, baseline, metadata: { confidence: "confirmed", confidenceTouched: true } })
    const result = only(plan([row], [draft]))
    expect(result).toMatchObject({ action: "write" })
    if (result.action === "write") {
      expect(result.cells).toEqual([
        expect.objectContaining({ a1: "BC3", before: { value: 200, color: "b" }, after: { value: 200, color: "r" }, writeValue: false, writeColor: true }),
      ])
    }
  })
})
