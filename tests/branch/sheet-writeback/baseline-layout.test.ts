import { describe, expect, it } from "vitest"

import { buildSheetBaseline, parseSheetBaseline } from "@/lib/branch/sheet-writeback/baseline"
import { a1LettersToCol, colToA1, isRevLayoutError, resolveRevLayout } from "@/lib/branch/sheet-writeback/layout"

import { buildHeader, REF_FY, ROW_A } from "./fixtures"

describe("layout — 실측 머리(84열 + CG Row ID)", () => {
  it("colToA1 / a1LettersToCol", () => {
    expect(colToA1(0)).toBe("A")
    expect(colToA1(25)).toBe("Z")
    expect(colToA1(26)).toBe("AA")
    expect(colToA1(51)).toBe("AZ")
    expect(colToA1(83)).toBe("CF")
    expect(colToA1(84)).toBe("CG")
    for (const col of [0, 1, 25, 26, 51, 52, 83, 84, 701, 702]) expect(a1LettersToCol(colToA1(col))).toBe(col)
    expect(a1LettersToCol("A1")).toBeNull()
  })

  it("월 블록 12개·주차 칸·Row ID 열을 실측 위치로 해석한다", () => {
    const layout = resolveRevLayout(buildHeader(), REF_FY)
    if (isRevLayoutError(layout)) throw new Error(layout.detail)
    expect(layout.monthBlocks.map((block) => colToA1(block.totalCol))).toEqual([
      "N", "T", "Z", "AF", "AL", "AR", "AX", "BD", "BJ", "BP", "BV", "CA",
    ])
    expect(layout.monthBlocks.map((block) => block.ym)).toEqual([
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
      "2027-01", "2027-02", "2027-03",
    ])
    const sept = layout.monthBlocks[5]
    expect(sept.weekCols.map(colToA1)).toEqual(["AS", "AT", "AU", "AV", "AW"])
    expect(layout.monthBlocks[3].weekCols).toHaveLength(5) // 7월 "5w" 포함
    expect(layout.monthBlocks[10].weekCols).toHaveLength(4) // 2월
    expect(layout.rowIdCol).toBe(84)
    expect(layout.columnCount).toBe(85)
  })

  it("Row ID 열이 없으면 rowIdCol null(오류 아님)", () => {
    const layout = resolveRevLayout(buildHeader({ rowId: false }), REF_FY)
    expect(isRevLayoutError(layout)).toBe(false)
    if (!isRevLayoutError(layout)) expect(layout.rowIdCol).toBeNull()
  })

  it.each([
    ["A2 가 Account 가 아님", (h: Array<string | number | null>) => { h[0] = "Customer" }],
    ["월 순서 바뀜", (h: Array<string | number | null>) => { h[13] = "5" }],
    ["주차 칸 하나 빠짐(블록 3칸)", (h: Array<string | number | null>) => { h[14] = null; h[15] = null }],
    ["Row ID 둘", (h: Array<string | number | null>) => { h.push("row id") }],
    ["Row ID 가 월 블록 사이", (h: Array<string | number | null>) => { h[12] = "Sum"; h.splice(19, 0, "Row ID") }],
    ["월 블록 사이 모르는 머리", (h: Array<string | number | null>) => { h.splice(19, 0, "Memo") }],
    ["월 머리 13개", (h: Array<string | number | null>) => { h.splice(84, 0, "4", "w1", "w2", "w3", "w4") }],
    ["주차 칸 6개", (h: Array<string | number | null>) => { h.splice(19, 0, "w6") }],
    ["주차 칸 사이에 빈 열(칸 수는 5)", (h: Array<string | number | null>) => { h.splice(16, 0, null) }],
  ])("%s → layout_changed", (_label, mutate) => {
    const header = buildHeader()
    mutate(header)
    const layout = resolveRevLayout(header, REF_FY)
    expect(isRevLayoutError(layout)).toBe(true)
  })

  it("마지막 월 블록 뒤의 다른 머리는 괜찮다", () => {
    const header = buildHeader()
    header.push("Note")
    expect(isRevLayoutError(resolveRevLayout(header, REF_FY))).toBe(false)
  })
})

describe("baseline", () => {
  const row = {
    rowId: ROW_A,
    sheetRow: 17,
    customer: "  가나학원 ",
    weeklyPayments: { "2026-10": [100, 0, 0, 50, 0] },
    weeklyColors: { "2026-10": "r--b-" },
  }

  it("buildSheetBaseline: 그 달 칸 순서대로, 값 없는 칸은 k", () => {
    const baseline = buildSheetBaseline(row, "2026-10", "2026-10-23T01:00:00.000Z")
    expect(baseline).toEqual({
      v: 1,
      rowId: ROW_A,
      sheetRow: 17,
      customer: "가나학원",
      month: "2026-10",
      weeks: [
        { value: 100, color: "r" },
        { value: 0, color: "k" },
        { value: 0, color: "k" },
        { value: 50, color: "b" },
        { value: 0, color: "k" },
      ],
      capturedAt: "2026-10-23T01:00:00.000Z",
    })
    expect(parseSheetBaseline(JSON.parse(JSON.stringify(baseline)))).toEqual(baseline)
  })

  it("그 달 값이 없던 행은 weeks [] — 칸 수는 서버가 live 로 정한다", () => {
    expect(buildSheetBaseline(row, "2026-11", "2026-10-23T01:00:00.000Z")?.weeks).toEqual([])
  })

  it("행 ID 형식이 틀리면 rowId null, 고객명이 비면 null", () => {
    expect(buildSheetBaseline({ ...row, rowId: "r_BAD" }, "2026-10", "2026-10-23T01:00:00.000Z")?.rowId).toBeNull()
    expect(buildSheetBaseline({ ...row, customer: "  " }, "2026-10", "2026-10-23T01:00:00.000Z")).toBeNull()
    expect(buildSheetBaseline(row, "2026-13", "2026-10-23T01:00:00.000Z")).toBeNull()
  })

  it("parseSheetBaseline 은 형식이 하나라도 틀리면 null", () => {
    const good = buildSheetBaseline(row, "2026-10", "2026-10-23T01:00:00.000Z")!
    const bad: unknown[] = [
      null, [], "x",
      { ...good, v: 2 },
      { ...good, rowId: "r_1" },
      { ...good, rowId: undefined },
      { ...good, sheetRow: 0 },
      { ...good, customer: "" },
      { ...good, month: "2026-1" },
      { ...good, capturedAt: "어제" },
      { ...good, weeks: [{ value: -1, color: "k" }] },
      { ...good, weeks: [{ value: 1, color: "red" }] },
      { ...good, weeks: Array.from({ length: 6 }, () => ({ value: 0, color: "k" })) },
    ]
    for (const value of bad) expect(parseSheetBaseline(value), JSON.stringify(value)).toBeNull()
  })
})
