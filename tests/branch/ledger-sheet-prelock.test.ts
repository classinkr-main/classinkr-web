import { describe, expect, it, vi } from "vitest"

import {
  buildSheetColumns,
  buildSheetRowView,
  describeSheetFilters,
  filterSheetRows,
  guardSheetCellActions,
  normalizeSheetFilterSet,
  parseSheetFilters,
  SHEET_FILTER_CONDITIONS,
  SHEET_FILTER_KEYS,
  sheetBlockPending,
  sheetCellEditable,
  sheetEditableCells,
  sheetMonthWeekCount,
  sheetRowNumberCell,
  sheetWeekCellsForRender,
  sheetWeekCellTitle,
  sumSheetRows,
  type SheetRowView,
} from "@/components/admin/branch/ledger/ledger-sheet-logic"
import type { MatrixPendingDraft } from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 잠금 전 정리(2026-11-25) — 건별 시트의 표시 규칙.
//  - D2: 환불(음수) 달도 값이다. 값 있음 = 순액 ≠ 0, 값 없음 = 순액 0(상계 달 포함). 시트 음수 칸이 든 달은 고치지 않는다.
//  - 설계 0 Phase 1b: 환불 주차를 읽기 전용 칸(refund)으로 실어 합계 행 W1~W5 가 계와 맞는다.
//  - F-04 정정이 대체한 달은 주차 전부 잠금, F-31 2월 W5 없음, F-32 정정 행 #, F-19 대기 초안, F-51 cf 파서.

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
const NOV = "2026-11"
const DEC = "2026-12"
const FEB = "2027-02"
const MAR = "2027-03"
// 확도는 읽는 날(KST)에 따라 바뀔 수 있어 날을 고정한다.
const TODAY = "2026-11-25"

function row(partial: Partial<LedgerRevenueRow>): LedgerRevenueRow {
  return { id: partial.id ?? "x", customer: partial.id ?? "x", manager: "A", team: "BD", region: null, revenue: 0, ledgerOrigin: "sheet", ...partial }
}

// A — 주차 없이 월 칸만 빨강 −30,000(환불).
const refundOnly = row({ id: "refund", sheetRow: 4, monthlyPayments: { [NOV]: -30_000 }, monthlyConfirmed: { [NOV]: -30_000 }, monthlyRed: { [NOV]: true } })
// B — 주차가 섞인 환불 달: W1 +100,000 · W2 −130,000, 월 −30,000(시트 =Sum 과 같다).
const mixed = row({
  id: "mixed", sheetRow: 5, monthlyPayments: { [NOV]: -30_000 }, monthlyConfirmed: { [NOV]: -30_000 }, monthlyRed: { [NOV]: true },
  weeklyPayments: { [NOV]: [100_000, -130_000, 0, 0, 0] }, weeklyColors: { [NOV]: "rr---" },
})
// C — 상계로 순액 0(빨강 +100 · 검정 −100).
const offset = row({
  id: "offset", sheetRow: 6, monthlyPayments: { [NOV]: 0 }, monthlyConfirmed: { [NOV]: 100 }, monthlyHighConfidence: { [NOV]: 0 },
  weeklyPayments: { [NOV]: [100, -100, 0, 0, 0] }, weeklyColors: { [NOV]: "rk---" },
})
// D — 평범한 양수: W2 확정 50,000(전액 확정이라 그 달이 잠긴다).
const plain = row({
  id: "plain", sheetRow: 7, monthlyPayments: { [NOV]: 50_000 }, monthlyConfirmed: { [NOV]: 50_000 }, monthlyHighConfidence: { [NOV]: 0 },
  weeklyPayments: { [NOV]: [0, 50_000, 0, 0, 0] }, weeklyColors: { [NOV]: "-r---" },
})

const columns = buildSheetColumns(MONTHS, NOV)
const build = (item: LedgerRevenueRow, corrected: Set<string> | null = null) => buildSheetRowView(item, columns, corrected, TODAY)
const views = [refundOnly, mixed, offset, plain].map((item) => build(item))
const byId = (id: string) => views.find((view) => view.row.id === id)!
const ids = (list: Array<{ row: LedgerRevenueRow }>) => list.map((view) => view.row.id)

describe("D2 — 환불(음수) 달은 값이다", () => {
  it("달 버킷 · FY 합계는 부호 그대로(환불을 0 으로 자르지 않는다)", () => {
    expect(byId("refund").blocks[0].bucket).toEqual({ total: -30_000, confirmed: -30_000, high: 0, open: 0 })
    expect(byId("refund").annual.total).toBe(-30_000)
    expect(byId("mixed").blocks[0].bucket.total).toBe(-30_000)
    expect(byId("offset").blocks[0].bucket.total).toBe(0)
    // FY 합계 행 = 시트 1행 =Sum() 과 같은 뜻(음수 포함): −30,000 − 30,000 + 0 + 50,000.
    expect(sumSheetRows(views, columns).annual.total).toBe(-10_000)
    expect(sumSheetRows(views, columns).blocks[0].bucket.total).toBe(-10_000)
  })

  it("잠금 자물쇠는 값이 있는(> 0) 달만 센다 — 환불만 있는 행은 잠긴 행이 아니다", () => {
    expect(byId("refund").lockedConfirmed).toBe(false)
    expect(byId("plain").lockedConfirmed).toBe(true)
  })

  it("월 계 필터 — 값 있음 = 순액 ≠ 0, 값 없음 = 순액 0(상계 달 포함), 확도 = 순액 ≠ 0 이고 그 확도 ≠ 0", () => {
    expect(ids(filterSheetRows(views, { m0: ["any"] }))).toEqual(["refund", "mixed", "plain"])
    expect(ids(filterSheetRows(views, { m0: ["empty"] }))).toEqual(["offset"])
    // 빨강 환불 −30,000 은 확정이다. 상계 달은 확정 금액(+100)이 있어도 순액이 0 이라 맞지 않는다.
    expect(ids(filterSheetRows(views, { m0: ["confirmed"] }))).toEqual(["refund", "mixed", "plain"])
    expect(ids(filterSheetRows(views, { m0: ["expected"] }))).toEqual([])
  })

  it("기본 필터(11월 계 값 있음)는 환불 행을 남긴다", () => {
    expect(ids(filterSheetRows(views, parseSheetFilters(null)))).toEqual(["refund", "mixed", "plain"])
  })

  it("정규화(값 있음 ⊇ 확도)는 부호가 섞인 달에서도 거르는 결과가 같다 — 모든 열 × 모든 조건 조합", () => {
    for (let mask = 0; mask < 1 << SHEET_FILTER_CONDITIONS.length; mask += 1) {
      const raw = SHEET_FILTER_CONDITIONS.filter((_, index) => mask & (1 << index))
      const normalized = normalizeSheetFilterSet(raw)
      for (const key of SHEET_FILTER_KEYS) {
        const expected = ids(filterSheetRows(views, { [key]: raw }))
        const actual = ids(normalized ? filterSheetRows(views, { [key]: normalized }) : views)
        expect(actual, `${key} ${raw.join("+")}`).toEqual(expected)
      }
    }
  })

  it("주차·월 불일치는 부호 그대로 비교한다 — [+100,000 · −130,000] 과 월 −30,000 은 맞다", () => {
    expect(byId("mixed").mismatchMonths).toEqual([])
    const off = build(row({ id: "off", monthlyPayments: { [NOV]: -30_000 }, weeklyPayments: { [NOV]: [100_000, -100_000, 0, 0, 0] } }))
    expect(off.mismatchMonths).toEqual([NOV])
  })
})

describe("설계 0 Phase 1b — 환불 주차 칸(읽기 전용)", () => {
  it("음수 주차는 refund 로, 주차 없는 환불 달은 순액을 마지막 주차(W5)에 — 중립(확도 색 없음)", () => {
    const refund = byId("refund").blocks[0].weeks
    expect(refund.map((cell) => cell.refund)).toEqual([0, 0, 0, 0, -30_000])
    expect(refund[4]).toMatchObject({ display: 0, isMonthOnly: true, confidence: null, refundConfidence: "confirmed" })
    const weeks = byId("mixed").blocks[0].weeks
    expect(weeks.map((cell) => cell.display)).toEqual([100_000, 0, 0, 0, 0])
    expect(weeks.map((cell) => cell.refund)).toEqual([0, -130_000, 0, 0, 0])
    // 합계가 0 이하인 달은 확도 색을 칠하지 않는다. 환불 칸 확도(필터용)는 시트 글자색.
    expect(weeks.map((cell) => cell.confidence)).toEqual([null, null, null, null, null])
    expect(weeks[1].refundConfidence).toBe("confirmed")
  })

  it("합계 행 주차 칸 = 보이는 금액 + 환불 — W1~W5 합이 계와 맞는다", () => {
    const totals = sumSheetRows(views, columns).blocks[0]
    expect(totals.weeks).toEqual([100_100, -80_100, 0, 0, -30_000])
    expect(totals.weeks.reduce((sum, value) => sum + value, 0)).toBe(totals.bucket.total)
    const mixedOnly = sumSheetRows([byId("mixed")], columns).blocks[0]
    expect(mixedOnly.weeks.reduce((sum, value) => sum + value, 0)).toBe(mixedOnly.bucket.total)
  })

  it("환불이 든 달은 주차 칸 전부 고치지 않는다 — 칸 이동 순서에서 빠지고, 클릭 가드도 막는다", () => {
    for (const id of ["refund", "mixed", "offset"]) {
      const block = byId(id).blocks[0]
      expect(block.refundMonth, id).toBe(true)
      expect(block.weeks.every((cell) => !cell.editable && cell.lock === "refund"), id).toBe(true)
      expect(sheetEditableCells([byId(id)]).filter((cell) => cell.month === NOV), id).toEqual([])
    }
    // 평범한 행은 잠긴 확정 W2 만 빠진다(빈 주차는 열려 있다 — 2026-07-20 규칙 그대로).
    expect(sheetEditableCells([byId("plain")]).filter((cell) => cell.month === NOV).map((cell) => cell.week)).toEqual([0, 2, 3, 4])
    expect(sheetEditableCells([byId("refund")]).filter((cell) => cell.month === DEC)).toHaveLength(5)
    expect(sheetCellEditable(byId("mixed"), NOV, 2)).toBe(false)
    expect(sheetCellEditable(byId("plain"), NOV, 2)).toBe(true)
  })

  it("주차 필터 — 환불 칸도 값이다(값 있음 · 그 칸 확도), 비면 값 없음", () => {
    expect(ids(filterSheetRows(views, { "m0.w2": ["any"] }))).toEqual(["mixed", "offset", "plain"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["confirmed"] }))).toEqual(["mixed", "plain"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["expected"] }))).toEqual(["offset"])
    expect(ids(filterSheetRows(views, { "m0.w5": ["any"] }))).toEqual(["refund"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["empty"] }))).toEqual(["refund"])
  })

  it("툴팁 — 환불 칸은 '환불 — 시트 값', 같은 달 다른 칸은 고치지 않는 까닭", () => {
    expect(sheetWeekCellTitle(byId("refund").blocks[0].weeks[4], 4, NOV)).toBe("W5 -¥30,000 · 월합계만 · 환불 — 시트 값")
    expect(sheetWeekCellTitle(byId("mixed").blocks[0].weeks[1], 1, NOV)).toBe("W2 -¥130,000 · 환불 — 시트 값")
    expect(sheetWeekCellTitle(byId("mixed").blocks[0].weeks[0], 0, NOV)).toBe("W1 ¥100,000 · 환불이 든 달 — 시트 값이라 장부에서 고치지 않습니다")
    expect(sheetWeekCellTitle(byId("mixed").blocks[0].weeks[2], 2, NOV, { interactive: true })).toBe("W3 미입력 · 환불이 든 달 — 시트 값이라 장부에서 고치지 않습니다")
  })
})

describe("F-04 — 정정이 대체한 달은 원래 행의 주차 칸 전부 잠근다", () => {
  it("correctedMonths 의 달은 빈 칸까지 전부 빠진다(다른 달은 그대로)", () => {
    const corrected = build(plain, new Set([NOV]))
    expect(corrected.blocks[0].corrected).toBe(true)
    expect(corrected.blocks[0].weeks.every((cell) => cell.lock === "corrected" && !cell.editable)).toBe(true)
    expect(sheetEditableCells([corrected]).map((cell) => cell.month)).toEqual([DEC, DEC, DEC, DEC, DEC])
    expect(sheetWeekCellTitle(corrected.blocks[0].weeks[0], 0, NOV)).toContain("장부 정정으로 대체된 달이라 잠금")
  })
})

describe("F-31 — 2월은 시트에 W4 까지만", () => {
  const feb = buildSheetColumns(MONTHS, FEB)
  // 월합계만 800(고확도), 시트에 없는 W5 에 값이 든 장부 행 300, 3월 월합계만 10.
  const monthOnly = buildSheetRowView(
    row({ id: "feb-mo", monthlyPayments: { [FEB]: 800, [MAR]: 10 }, monthlyConfirmed: { [FEB]: 0, [MAR]: 0 }, monthlyHighConfidence: { [FEB]: 800, [MAR]: 0 } }),
    feb,
    null,
    TODAY,
  )
  const stray = buildSheetRowView(
    row({ id: "feb-w5", monthlyPayments: { [FEB]: 300 }, monthlyConfirmed: { [FEB]: 0 }, monthlyHighConfidence: { [FEB]: 0 }, weeklyPayments: { [FEB]: [0, 0, 0, 0, 300] } }),
    feb,
    null,
    TODAY,
  )
  const febViews: SheetRowView[] = [monthOnly, stray]

  it("주차 칸 수는 달력 규칙 — 2월 4, 그 밖 5(7월 포함)", () => {
    expect(sheetMonthWeekCount(FEB)).toBe(4)
    expect(sheetMonthWeekCount("2026-07")).toBe(5)
    expect(sheetMonthWeekCount(NOV)).toBe(5)
    expect(monthOnly.blocks[0].weekCount).toBe(4)
    expect(monthOnly.blocks[1].weekCount).toBe(5)
  })

  it("2월 월합계만 · W5 값은 W4 에, W5 는 비활성(없는 주차)", () => {
    expect(monthOnly.blocks[0].weeks.map((cell) => cell.display)).toEqual([0, 0, 0, 800, 0])
    expect(monthOnly.blocks[0].weeks[3]).toMatchObject({ isMonthOnly: true, confidence: "high-confidence", editable: true })
    expect(monthOnly.blocks[0].weeks[4]).toMatchObject({ absent: true, editable: false, lock: "absent", display: 0 })
    expect(stray.blocks[0].weeks.map((cell) => cell.display)).toEqual([0, 0, 0, 300, 0])
    // 3월은 W5 가 있다 — 월합계만은 그대로 W5.
    expect(monthOnly.blocks[1].weeks.map((cell) => cell.display)).toEqual([0, 0, 0, 0, 10])
    expect(sumSheetRows(febViews, feb).blocks[0].weeks).toEqual([0, 0, 0, 1_100, 0])
  })

  it("2월 W5 는 칸 이동 순서에 없고, 그 열 필터는 걸려 있어도 거르지 않는다", () => {
    expect(sheetEditableCells([monthOnly]).filter((cell) => cell.month === FEB).map((cell) => cell.week)).toEqual([0, 1, 2, 3])
    expect(sheetEditableCells([monthOnly]).filter((cell) => cell.month === MAR).map((cell) => cell.week)).toEqual([0, 1, 2, 3, 4])
    expect(filterSheetRows(febViews, { "m0.w5": ["any"] })).toHaveLength(2)
    expect(filterSheetRows(febViews, { "m0.w5": ["empty"] })).toHaveLength(2)
    expect(ids(filterSheetRows(febViews, { "m0.w4": ["any"] }))).toEqual(["feb-mo", "feb-w5"])
    expect(describeSheetFilters({ "m0.w5": ["any"], "m1.w5": ["any"] }, feb).map((chip) => [chip.label, chip.applies])).toEqual([
      ["2월 W5 값 있음", false],
      ["3월 W5 값 있음", true],
    ])
    expect(sheetWeekCellTitle(monthOnly.blocks[0].weeks[4], 4, FEB)).toBe("W5 · 2월은 시트에 W4까지만 있습니다")
  })
})

describe("F-32 — 장부 정정 행의 # 칸", () => {
  it("edit-row 정정은 흐린 '342*', 툴팁은 그 행의 그 달을 대체한다는 사실", () => {
    expect(sheetRowNumberCell(row({ id: "ledger-e1", sheetRow: 342, ledgerOrigin: "draft", draftKind: "edit-row", draftMonth: NOV }))).toEqual({
      kind: "correction",
      text: "342*",
      title: "장부 정정 · 시트 342행의 11월을 대체",
    })
  })

  it("신규 초안 · 종류를 모르는 장부 행은 정정이 아니다(번호 그대로)", () => {
    expect(sheetRowNumberCell(row({ id: "n1", sheetRow: 17, ledgerOrigin: "draft", draftKind: "new-row" }))).toMatchObject({ kind: "sheet", text: "17" })
    expect(sheetRowNumberCell(row({ id: "n2", sheetRow: 17, ledgerOrigin: "draft" }))).toMatchObject({ kind: "sheet", text: "17" })
    expect(sheetRowNumberCell(row({ id: "s1", sheetRow: 342 }))).toMatchObject({ kind: "sheet", text: "342" })
  })
})

describe("F-19 — 대기 초안을 칸에 보인다", () => {
  const pending = (partial: Partial<MatrixPendingDraft>): MatrixPendingDraft => ({
    id: "p1", kind: "edit-row", amount: 0, confidence: "expected", weekly: null, weeklyConfidence: null, ...partial,
  })

  it("수정 초안(주차 병합) — 계는 적용되면 될 금액, 주차는 바뀐 칸만 대기 금액", () => {
    const draft = pending({ amount: 80_000, weekly: [0, 50_000, 30_000, 0, 0], weeklyConfidence: [null, "confirmed", "expected", null, null] })
    const map = new Map([["plain::2026-11", draft], ["plain::2026-11::w3", draft]])
    const block = byId("plain").blocks[0]
    const result = sheetBlockPending(plain, block, map)
    expect(result).toMatchObject({ draftId: "p1", total: 80_000, current: 50_000, weeks: [null, null, 30_000, null, null] })
    expect(result?.weekConfidences).toEqual([null, null, "expected", null, null])

    const cells = sheetWeekCellsForRender(plain, block, result, { interactive: true })
    expect(cells[2]).toMatchObject({ pendingAmount: 30_000, pendingConfidence: "expected" })
    // '미입력'을 지우고 대기 금액 · 지금 장부 값을 말한다.
    expect(cells[2].title).toBe("W3 대기 중 변경 ¥30,000 (지금 장부 ¥0) · 클릭·Enter로 편집")
    expect(cells[0].title).toBe("W1 미입력 · 클릭·Enter로 편집")
    expect(cells[1].title).toBe("W2 ¥50,000 · 확정 · 🔒 시트 확정 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로")
    // 읽기 전용 표면은 '클릭·Enter로 편집'을 말하지 않는다.
    expect(sheetWeekCellsForRender(plain, block, result)[0].title).toBe("W1 미입력")
  })

  it("주차 하나만 바꾸는 초안(병합 없음)은 그 칸에 초안 금액", () => {
    const draft = pending({ amount: 1_234_567 })
    const map = new Map([["refund::2026-12", draft], ["refund::2026-12::w3", draft]])
    const result = sheetBlockPending(refundOnly, byId("refund").blocks[1], map)
    expect(result).toMatchObject({ total: 1_234_567, current: 0, weeks: [null, null, 1_234_567, null, null] })
  })

  it("고객 이름으로만 걸린 신규 초안은 시트 행 금액처럼 보이지 않는다", () => {
    const map = new Map([["plain::2026-12", pending({ kind: "new-row", amount: 999 })]])
    expect(sheetBlockPending(plain, byId("plain").blocks[1], map)).toBeNull()
    expect(sheetBlockPending(plain, byId("plain").blocks[1], null)).toBeNull()
    expect(sheetBlockPending(plain, byId("plain").blocks[1], new Map())).toBeNull()
  })

  it("장부에서 넣은 행의 칸에 건 신규 초안은 더해진다", () => {
    const entry = row({ id: "ledger-1", ledgerOrigin: "draft", draftKind: "new-row", draftMonth: DEC, revenue: 20_000, monthlyPayments: { [DEC]: 20_000 } })
    const view = build(entry)
    const draft = pending({ kind: "new-row", amount: 5_000 })
    const result = sheetBlockPending(entry, view.blocks[1], new Map([["ledger-1::2026-12", draft], ["ledger-1::2026-12::w2", draft]]))
    expect(result).toMatchObject({ total: 25_000, current: 20_000, weeks: [null, 5_000, null, null, null] })
  })
})

describe("클릭 편집 가드", () => {
  it("고칠 수 없는 칸은 selectCell · beginEdit 를 넘기지 않고, 나머지는 그대로 넘긴다", () => {
    const actions = { selectCell: vi.fn(), beginEdit: vi.fn(), cancelEdit: vi.fn() }
    const guarded = guardSheetCellActions(actions, (month, week) => sheetCellEditable(byId("mixed"), month, week))
    guarded.selectCell("mixed", NOV, 0)
    guarded.beginEdit("mixed", NOV, "1", 2)
    expect(actions.selectCell).not.toHaveBeenCalled()
    expect(actions.beginEdit).not.toHaveBeenCalled()
    guarded.selectCell("mixed", DEC, 1)
    guarded.beginEdit("mixed", DEC, undefined, 1)
    expect(actions.selectCell).toHaveBeenCalledWith("mixed", DEC, 1)
    expect(actions.beginEdit).toHaveBeenCalledWith("mixed", DEC, undefined, 1)
    expect(guarded.cancelEdit).toBe(actions.cancelEdit)
  })
})

describe("F-51 — cf 파서는 같은 열이 반복돼도 선형", () => {
  it("256KB 짜리 반복 cf 도 금방 읽고 같은 뜻이다", () => {
    const param = "m0.w1:confirmed+high+expected,".repeat(Math.ceil((256 * 1024) / 31))
    const started = performance.now()
    const filters = parseSheetFilters(param)
    const elapsed = performance.now() - started
    expect(filters).toEqual({ "m0.w1": ["confirmed", "high-confidence", "expected"] })
    expect(elapsed).toBeLessThan(500)
    expect(parseSheetFilters("m0:any,".repeat(40_000))).toEqual({ m0: ["any"] })
  })
})
