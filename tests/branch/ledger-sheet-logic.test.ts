import { describe, expect, it } from "vitest"

import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import {
  buildSheetColumns,
  buildSheetRowView,
  clearSheetFilter,
  countSheetRowsPassing,
  DEFAULT_SHEET_FILTERS,
  describeSheetFilters,
  filterSheetRows,
  isSheetFilterCondition,
  NO_SHEET_FILTERS,
  normalizeSheetFilterSet,
  objectParticle,
  onlySheetFilter,
  parseSheetFilters,
  previewSheetFilter,
  sameSheetFilters,
  serializeSheetFilters,
  setSheetFilter,
  SHEET_FILTER_CONDITIONS,
  SHEET_FILTER_CONFIDENCES,
  SHEET_FILTER_KEYS,
  SHEET_AMOUNT_STEPS,
  SHEET_FILTER_OPTIONS,
  SHEET_SUM_STEPS,
  sheetAmountFontClass,
  sheetAmountFontPx,
  sheetAmountTextWidth,
  sheetCurrentWeekKey,
  sheetEditableCells,
  sheetFilterColumnLabel,
  sheetFilterConditionLabel,
  sheetFilterDraft,
  sheetFilterRelaxHint,
  sheetFilterSetLabel,
  sheetFiltersApply,
  sheetMenuAnchorSpan,
  sheetRevealScrollDelta,
  sheetRowNumberCell,
  sheetRowPassesFilters,
  sortSheetRows,
  sumSheetRows,
  toggleSheetFilterCondition,
  weekCellConfidences,
  type SheetColumnFilters,
  type SheetFilterCondition,
} from "@/components/admin/branch/ledger/ledger-sheet-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 장부 건별 시트(2026-11-23) — 열 구성·평면 행·열 필터(열 안은 OR · 열끼리 AND, 2026-11-24 필터 기획 F-1)·합계·URL 직렬화.

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
const NOV = "2026-11"
const DEC = "2026-12"

function row(partial: Partial<LedgerRevenueRow>): LedgerRevenueRow {
  return { id: partial.id ?? "x", customer: "x", manager: "A", team: "BD", region: null, revenue: 0, ledgerOrigin: "sheet", ...partial }
}

// 같은 기관(한빛)이 두 건 — 시트처럼 두 줄이어야 한다.
const rows: LedgerRevenueRow[] = [
  // 11월 W2 확정 100(전액 확정), 12월 W3 예정 50
  row({
    id: "a-sw", sheetRow: 12, customer: "한빛", productVersion: "ClassIn 라이선스", status: "New", dealType: "Direct", region: "서울",
    monthlyPayments: { [NOV]: 100, [DEC]: 50 }, monthlyConfirmed: { [NOV]: 100, [DEC]: 0 }, monthlyHighConfidence: { [NOV]: 0, [DEC]: 0 },
    weeklyPayments: { [NOV]: [0, 100, 0, 0, 0], [DEC]: [0, 0, 50, 0, 0] }, weeklyColors: { [NOV]: "-r---", [DEC]: "--k--" },
  }),
  // 11월 W2 고확도 300 + W4 예정 200 (섞임), 지난달 10월 확정 70
  row({
    id: "a-hw", sheetRow: 13, customer: "한빛", productVersion: "전자칠판 86", status: "New", dealType: "Channel", region: "서울",
    monthlyPayments: { "2026-10": 70, [NOV]: 500 }, monthlyConfirmed: { "2026-10": 70, [NOV]: 0 }, monthlyHighConfidence: { [NOV]: 300 },
    weeklyPayments: { [NOV]: [0, 300, 0, 200, 0] }, weeklyColors: { [NOV]: "-b-k-" },
  }),
  // 11월은 비고 12월에만 고확도 40(월합계만 — 주차 없음), 이후 1월 예정 10
  row({
    id: "b", sheetRow: 5, customer: "다온", productVersion: "ClassIn", status: "Renew", dealType: "Direct", region: "경기",
    monthlyPayments: { [DEC]: 40, "2027-01": 10 }, monthlyConfirmed: { [DEC]: 0, "2027-01": 0 }, monthlyHighConfidence: { [DEC]: 40, "2027-01": 0 },
  }),
  // 회계연도에 금액이 없는 행 — 필터를 전부 풀면 시트처럼 그대로 보인다.
  row({ id: "empty", sheetRow: 2, customer: "빈 행", productVersion: "ClassIn", status: "Renew", dealType: "Direct" }),
]

const columns = buildSheetColumns(MONTHS, NOV)
const views = sortSheetRows(rows).map((item) => buildSheetRowView(item, columns))
const ids = (list: Array<{ row: LedgerRevenueRow }>) => list.map((view) => view.row.id)

describe("열 구성", () => {
  it("기준 달·다음 달만 주차로 펴고, 지난달과 이후 달은 한 열씩 묶는다", () => {
    expect(columns.pastMonths).toEqual(MONTHS.slice(0, 7))
    expect(columns.pastLabel).toBe("4–10월")
    expect(columns.pastPinned).toBe(true)
    expect(columns.blocks).toEqual([
      { slot: 0, month: NOV, label: "11월" },
      { slot: 1, month: DEC, label: "12월" },
    ])
    expect(columns.laterMonths).toEqual(["2027-01", "2027-02", "2027-03"])
    expect(columns.laterLabel).toBe("1–3월")
  })

  it("회계연도 첫 달은 지난달 묶음이 없고, 마지막 달은 다음 달·이후 묶음이 없다", () => {
    const first = buildSheetColumns(MONTHS, "2026-04")
    expect(first.pastMonths).toEqual([])
    expect(first.pastLabel).toBeNull()
    expect(first.blocks.map((block) => block.month)).toEqual(["2026-04", "2026-05"])
    const last = buildSheetColumns(MONTHS, "2027-03")
    expect(last.blocks).toEqual([{ slot: 0, month: "2027-03", label: "3월" }])
    expect(last.laterMonths).toEqual([])
    expect(last.laterLabel).toBeNull()
  })

  it("회계연도 밖의 달은 가까운 끝 달로 맞추고, 지난달 고정 여부를 그대로 싣는다", () => {
    expect(buildSheetColumns(MONTHS, "2025-12").anchor).toBe("2026-04")
    expect(buildSheetColumns(MONTHS, "2027-08").anchor).toBe("2027-03")
    expect(buildSheetColumns(MONTHS, NOV, false).pastPinned).toBe(false)
  })
})

describe("평면 행 — 시트처럼 건별 한 줄", () => {
  it("같은 기관이 두 건이면 두 줄이고, 시트 행 번호 순서다", () => {
    expect(ids(views)).toEqual(["empty", "b", "a-sw", "a-hw"])
    expect(views.filter((view) => view.row.customer === "한빛")).toHaveLength(2)
  })

  it("행 번호가 없는 행(장부에서 넣은 행)은 원래 순서대로 맨 뒤다", () => {
    const sorted = sortSheetRows([{ id: "d1" }, { id: "s9", sheetRow: 9 }, { id: "d2" }, { id: "s3", sheetRow: 3 }] as Array<{ id: string; sheetRow?: number }>)
    expect(sorted.map((item) => item.id)).toEqual(["s3", "s9", "d1", "d2"])
  })

  it("`#` 칸 — 시트 행 번호, 장부에서 넣은 행은 \"새\", 시트에서 왔는데 번호가 없는 행은 \"새\"가 아니다(C-1 · D4)", () => {
    expect(sheetRowNumberCell(row({ id: "s", sheetRow: 342 }))).toEqual({ kind: "sheet", text: "342", title: "시트 '2. REV' 342행(동기화 시점)" })
    // 장부 정정 초안도 원래 시트 행을 가리키면 그 번호다.
    expect(sheetRowNumberCell(row({ id: "ledger-e1", sheetRow: 17, ledgerOrigin: "draft" })).text).toBe("17")
    const ledger = sheetRowNumberCell(row({ id: "ledger-e2", ledgerOrigin: "draft" }))
    expect(ledger).toMatchObject({ kind: "ledger", text: "새" })
    expect(ledger.title).toBe("장부에서 넣은 행 · 시트에 없음 · 장부 행 ID ledger-e2")
    // 시트 행인데 동기화 기록에 번호가 빠졌다 — "시트에 없음"이라고 하지 않는다.
    const unnumbered = sheetRowNumberCell(row({ id: "row-nosheet" }))
    expect(unnumbered).toMatchObject({ kind: "unnumbered", text: "–" })
    expect(unnumbered.title).toContain("시트에서 온 행")
    expect(unnumbered.title).toContain("row-nosheet")
    expect(unnumbered.title).not.toContain("시트에 없음")
  })

  it("제품·계약·경로 라벨과 묶음 금액을 한 줄에 싣는다", () => {
    const hw = views.find((view) => view.row.id === "a-hw")!
    expect([hw.product, hw.contract, hw.channel]).toEqual(["HW", "신규", "채널"])
    expect(hw.past.total).toBe(70)
    expect(hw.pastByMonth).toHaveLength(7)
    expect(hw.pastByMonth[6].total).toBe(70)
    expect(hw.blocks[0].bucket).toMatchObject({ total: 500, confirmed: 0, high: 300, open: 200 })
    expect(hw.annual.total).toBe(570)
    const sw = views.find((view) => view.row.id === "a-sw")!
    expect([sw.product, sw.contract, sw.channel]).toEqual(["SW", "신규", "직접"])
    const b = views.find((view) => view.row.id === "b")!
    expect(b.contract).toBe("갱신")
    expect(b.later.total).toBe(10)
  })

  it("주차 칸은 값과 그 칸의 확도를 갖고, 월합계만 있는 달은 W5 에 얹는다", () => {
    const sw = views.find((view) => view.row.id === "a-sw")!
    expect(sw.blocks[0].weeks.map((cell) => cell.display)).toEqual([0, 100, 0, 0, 0])
    expect(sw.blocks[0].weeks.map((cell) => cell.confidence)).toEqual([null, "confirmed", null, null, null])
    expect(sw.blocks[1].weeks[2]).toMatchObject({ display: 50, confidence: "expected" })
    const hw = views.find((view) => view.row.id === "a-hw")!
    expect(hw.blocks[0].weeks.map((cell) => cell.confidence)).toEqual([null, "high-confidence", null, "expected", null])
    const b = views.find((view) => view.row.id === "b")!
    expect(b.blocks[1].weeks.map((cell) => cell.display)).toEqual([0, 0, 0, 0, 40])
    expect(b.blocks[1].weeks[4]).toMatchObject({ isMonthOnly: true, confidence: "high-confidence" })
  })

  it("섞인 달의 빨강 칸은 그 달의 확정 금액이 남아 있을 때만 확정으로 본다(아직 오지 않은 주차의 빨강 = 예정)", () => {
    const mixed = { total: 300, confirmed: 100, high: 0, open: 200 }
    expect(weekCellConfidences({ weeklyColors: { [NOV]: "r---r" } }, NOV, [100, 0, 0, 0, 200], mixed)).toEqual(["confirmed", null, null, null, "expected"])
    // 글자색을 모르면 그 달의 우세 확도.
    expect(weekCellConfidences({}, NOV, [100, 0, 0, 0, 200], mixed)).toEqual(["expected", null, null, null, "expected"])
    // 빈 달은 전부 null.
    expect(weekCellConfidences({}, NOV, [0, 0, 0, 0, 0], { total: 0, confirmed: 0, high: 0, open: 0 })).toEqual([null, null, null, null, null])
  })

  it("전액 확정으로 잠긴 행과 주차·월 불일치 행을 표시한다", () => {
    const locked = buildSheetRowView(rows[0], columns)
    // a-sw 는 12월 예정이 남아 있어 잠긴 행이 아니다.
    expect(locked.lockedConfirmed).toBe(false)
    const allConfirmed = buildSheetRowView(
      row({ id: "done", monthlyPayments: { [NOV]: 100 }, monthlyConfirmed: { [NOV]: 100 }, monthlyHighConfidence: {}, weeklyPayments: { [NOV]: [100, 0, 0, 0, 0] } }),
      columns,
    )
    expect(allConfirmed.lockedConfirmed).toBe(true)
    expect(allConfirmed.blocks[0].monthLocked).toBe(true)
    expect(buildSheetRowView(rows[3], columns).lockedConfirmed).toBe(false)
    const mismatch = buildSheetRowView(
      row({ id: "mm", monthlyPayments: { [NOV]: 100 }, monthlyConfirmed: { [NOV]: 0 }, monthlyHighConfidence: { [NOV]: 0 }, weeklyPayments: { [NOV]: [30, 0, 0, 0, 0] } }),
      columns,
    )
    expect(mismatch.mismatchMonths).toEqual([NOV])
    expect(mismatch.blocks[0].mismatch).toBe(true)
    expect(views.every((view) => view.mismatchMonths.length === 0)).toBe(true)
  })
})

describe("열 필터 — 열 안은 OR, 열끼리는 AND", () => {
  it("값 있음은 그 열에 값이 있는 행만 남긴다", () => {
    expect(ids(filterSheetRows(views, { m0: ["any"] }))).toEqual(["a-sw", "a-hw"])
    expect(ids(filterSheetRows(views, { m1: ["any"] }))).toEqual(["b", "a-sw"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["any"] }))).toEqual(["a-sw", "a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w4": ["any"] }))).toEqual(["a-hw"])
    // 월합계만 있는 달은 W5 에 보이므로 W5 값 있음에 걸린다.
    expect(ids(filterSheetRows(views, { "m1.w5": ["any"] }))).toEqual(["b"])
  })

  it("확도 한 단계 — 월 계는 그 확도 금액이 있으면, 주차는 그 칸의 확도가 같아야 통과한다", () => {
    expect(ids(filterSheetRows(views, { m0: ["confirmed"] }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { m0: ["high-confidence"] }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { m0: ["expected"] }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["confirmed"] }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["high-confidence"] }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["expected"] }))).toEqual([])
    expect(ids(filterSheetRows(views, { m1: ["high-confidence"] }))).toEqual(["b"])
  })

  it("한 열에 조건을 여러 개 고르면 OR — 하나라도 맞으면 통과한다", () => {
    expect(ids(filterSheetRows(views, { m0: ["confirmed", "high-confidence"] }))).toEqual(["a-sw", "a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["confirmed", "high-confidence"] }))).toEqual(["a-sw", "a-hw"])
    // W4 의 값은 예정뿐이라 확정·고확도를 골라도 남지 않는다.
    expect(ids(filterSheetRows(views, { "m0.w4": ["confirmed", "high-confidence"] }))).toEqual([])
    expect(ids(filterSheetRows(views, { m1: ["high-confidence", "expected"] }))).toEqual(["b", "a-sw"])
    expect(ids(filterSheetRows(views, { "m1.w5": ["confirmed", "high-confidence"] }))).toEqual(["b"])
  })

  it("값 없음은 빈 칸만, 확도와 섞으면 '그 확도이거나 비었다'", () => {
    expect(ids(filterSheetRows(views, { m0: ["empty"] }))).toEqual(["empty", "b"])
    expect(ids(filterSheetRows(views, { m1: ["empty"] }))).toEqual(["empty", "a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["empty"] }))).toEqual(["empty", "b"])
    expect(ids(filterSheetRows(views, { "m0.w4": ["empty"] }))).toEqual(["empty", "b", "a-sw"])
    expect(ids(filterSheetRows(views, { "m0.w2": ["confirmed", "empty"] }))).toEqual(["empty", "b", "a-sw"])
    expect(ids(filterSheetRows(views, { "m1.w5": ["empty"] }))).toEqual(["empty", "a-sw", "a-hw"])
  })

  it("여러 열에 걸면 전부 통과한 행만 남는다(AND)", () => {
    expect(ids(filterSheetRows(views, { m0: ["any"], "m0.w2": ["confirmed"] }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { m0: ["any"], m1: ["any"] }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { m0: ["any"], "m0.w4": ["expected"], "m0.w2": ["high-confidence"] }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { m0: ["confirmed"], "m0.w4": ["any"] }))).toEqual([])
    expect(ids(filterSheetRows(views, { m0: ["empty"], m1: ["any"] }))).toEqual(["b"])
    expect(ids(filterSheetRows(views, { m0: ["empty"], m1: ["expected"] }))).toEqual([])
    // OR 열과 AND 가 함께 — 11월 확정 또는 고확도이면서 12월 W3 예정.
    expect(ids(filterSheetRows(views, { m0: ["confirmed", "high-confidence"], "m1.w3": ["expected"] }))).toEqual(["a-sw"])
    expect(sheetRowPassesFilters(views[2], { m0: ["any"], "m1.w3": ["expected"] })).toBe(true)
  })

  it("전부 풀면 모든 행이 보인다(금액이 없는 행까지). 빈 조건·거르지 않는 조건도 같다", () => {
    expect(ids(filterSheetRows(views, NO_SHEET_FILTERS))).toEqual(["empty", "b", "a-sw", "a-hw"])
    expect(filterSheetRows(views, NO_SHEET_FILTERS)).toBe(views)
    expect(filterSheetRows(views, { m0: [] })).toHaveLength(views.length)
    expect(filterSheetRows(views, { m0: ["any", "empty"] })).toHaveLength(views.length)
    expect(filterSheetRows(views, { "m1.w2": ["confirmed", "empty", "any"] })).toHaveLength(views.length)
  })

  it("그 자리에 달이 없는 필터(회계연도 마지막 달의 다음 달)는 조건과 상관없이 건너뛴다", () => {
    const last = buildSheetColumns(MONTHS, "2027-03")
    const lastViews = rows.map((item) => buildSheetRowView(item, last))
    expect(lastViews[0].blocks).toHaveLength(1)
    expect(filterSheetRows(lastViews, { m1: ["any"] })).toHaveLength(rows.length)
    expect(filterSheetRows(lastViews, { m1: ["empty"] })).toHaveLength(rows.length)
    expect(filterSheetRows(lastViews, { "m1.w2": ["confirmed"] })).toHaveLength(rows.length)
    expect(filterSheetRows(lastViews, { m0: ["any"] })).toHaveLength(0)
    expect(filterSheetRows(lastViews, { m0: ["empty"] })).toHaveLength(rows.length)
    expect(countSheetRowsPassing(lastViews, { m0: ["any"], m1: ["any"] })).toBe(0)
    // 걸린 필터 목록에는 남는다 — 안 보이다가 월을 옮기면 몰래 다시 걸리지 않게.
    expect(describeSheetFilters({ m1: ["any"], "m1.w2": ["confirmed"] }, last)).toEqual([
      { key: "m1", label: "다음 달 계 값 있음", columnLabel: "다음 달 계", conditionLabel: "값 있음", conditions: ["any"], applies: false },
      { key: "m1.w2", label: "다음 달 W2 확정", columnLabel: "다음 달 W2", conditionLabel: "확정", conditions: ["confirmed"], applies: false },
    ])
  })
})

describe("조건 집합 정규화", () => {
  it("겹친 값을 빼고 값 있음 → 확도(토큰 순서) → 값 없음 순서로 줄 세운다", () => {
    expect(normalizeSheetFilterSet(["expected", "confirmed", "expected"])).toEqual(["confirmed", "expected"])
    expect(normalizeSheetFilterSet(["empty", "high-confidence"])).toEqual(["high-confidence", "empty"])
    expect(normalizeSheetFilterSet(["expected", "high-confidence", "confirmed"])).toEqual(["confirmed", "high-confidence", "expected"])
    expect(normalizeSheetFilterSet(["bogus", "expected"])).toEqual(["expected"])
  })

  it("값 있음 + 값 없음은 모든 행이 통과하므로 열을 지우고, 빈 집합도 지운다", () => {
    expect(normalizeSheetFilterSet(["any", "empty"])).toBeNull()
    expect(normalizeSheetFilterSet(["empty", "confirmed", "any"])).toBeNull()
    expect(normalizeSheetFilterSet([])).toBeNull()
    expect(normalizeSheetFilterSet(null)).toBeNull()
    expect(normalizeSheetFilterSet(["bogus"])).toBeNull()
  })

  it("값 있음 + 확도는 값 있음 하나로 줄인다. 확도를 전부 골라도 값 있음으로 줄이지 않는다", () => {
    expect(normalizeSheetFilterSet(["confirmed", "any"])).toEqual(["any"])
    expect(normalizeSheetFilterSet(["any", "high-confidence", "expected"])).toEqual(["any"])
    expect(normalizeSheetFilterSet(SHEET_FILTER_CONFIDENCES)).toEqual(["confirmed", "high-confidence", "expected"])
  })

  it("정규화해도 거르는 결과는 같다 — 모든 열 × 모든 조건 조합", () => {
    // 이 행은 월 금액이 0인데 주차 값만 있다 — 칸에 값은 있지만 확도가 없다(확도 전부 ≠ 값 있음인 이유).
    const weekOnly = buildSheetRowView(row({ id: "week-only", weeklyPayments: { [NOV]: [0, 30, 0, 0, 0] } }), columns)
    expect(weekOnly.blocks[0].weeks[1]).toMatchObject({ display: 30, confidence: null })
    const sample = [...views, weekOnly]
    for (let mask = 0; mask < 1 << SHEET_FILTER_CONDITIONS.length; mask += 1) {
      const raw = SHEET_FILTER_CONDITIONS.filter((_, index) => mask & (1 << index))
      const normalized = normalizeSheetFilterSet(raw)
      for (const key of SHEET_FILTER_KEYS) {
        const expected = ids(filterSheetRows(sample, { [key]: raw }))
        const actual = ids(normalized ? filterSheetRows(sample, { [key]: normalized }) : sample)
        expect(actual, `${key} ${raw.join("+")}`).toEqual(expected)
      }
    }
  })
})

describe("열 하나 걸기 · 풀기 · 이 열만 보기", () => {
  it("열 하나씩 걸고 풀 수 있고, 다른 열의 필터는 그대로다", () => {
    let filters = DEFAULT_SHEET_FILTERS
    filters = setSheetFilter(filters, "m0.w2", ["high-confidence", "confirmed"])
    expect(filters).toEqual({ m0: ["any"], "m0.w2": ["confirmed", "high-confidence"] })
    filters = setSheetFilter(filters, "m1", ["expected"])
    expect(Object.keys(filters)).toEqual(["m0", "m0.w2", "m1"])
    filters = clearSheetFilter(filters, "m0")
    expect(filters).toEqual({ "m0.w2": ["confirmed", "high-confidence"], m1: ["expected"] })
    filters = setSheetFilter(filters, "m0.w2", ["expected", "empty"])
    expect(filters["m0.w2"]).toEqual(["expected", "empty"])
    // 거르지 않는 집합·빈 집합·null 은 그 열을 푼다.
    expect(setSheetFilter(filters, "m1", ["any", "empty"])).toEqual({ "m0.w2": ["expected", "empty"] })
    expect(setSheetFilter(filters, "m1", [])).toEqual({ "m0.w2": ["expected", "empty"] })
    expect(setSheetFilter(filters, "m1", null)).toEqual({ "m0.w2": ["expected", "empty"] })
    // 모르는 열이거나 뜻이 그대로면 같은 객체를 돌려준다.
    expect(setSheetFilter(filters, "m2", ["any"])).toBe(filters)
    expect(setSheetFilter(filters, "m0.w6", ["any"])).toBe(filters)
    expect(setSheetFilter(filters, "m1", ["expected", "expected"])).toBe(filters)
    expect(clearSheetFilter(filters, "m0")).toBe(filters)
  })

  it("이 열만 보기 — 기본 필터까지 풀고 이 열의 조건만 남긴다", () => {
    expect(onlySheetFilter(DEFAULT_SHEET_FILTERS, "m1", ["high-confidence"])).toEqual({ m1: ["high-confidence"] })
    expect(onlySheetFilter({ m0: ["any"], "m0.w2": ["confirmed"] }, "m0.w2", ["confirmed"])).toEqual({ "m0.w2": ["confirmed"] })
    expect(onlySheetFilter(DEFAULT_SHEET_FILTERS, "m1", ["any", "empty"])).toEqual({})
    expect(onlySheetFilter(DEFAULT_SHEET_FILTERS, "m9", ["any"])).toBe(DEFAULT_SHEET_FILTERS)
    expect(onlySheetFilter(DEFAULT_SHEET_FILTERS, "m0", ["confirmed", "any"])).toBe(DEFAULT_SHEET_FILTERS)
  })

  it("메뉴를 열면 걸린 조건, 안 걸린 열은 값 있음이 켜진 채로 시작한다(새 배열)", () => {
    const filters: SheetColumnFilters = { m1: ["confirmed", "expected"] }
    expect(sheetFilterDraft(filters, "m1")).toEqual(["confirmed", "expected"])
    expect(sheetFilterDraft(filters, "m1")).not.toBe(filters.m1)
    expect(sheetFilterDraft(filters, "m0.w3")).toEqual(["any"])
    expect(sheetFilterDraft(DEFAULT_SHEET_FILTERS, "m0")).toEqual(["any"])
  })

  it("체크박스를 켜고 끄면 정규 순서로 줄 선다. 확도 · 값 없음끼리는 여러 개(OR)를 켤 수 있다", () => {
    expect(toggleSheetFilterCondition(["confirmed"], "expected")).toEqual(["confirmed", "expected"])
    expect(toggleSheetFilterCondition(["empty"], "high-confidence")).toEqual(["high-confidence", "empty"])
    expect(toggleSheetFilterCondition([], "expected")).toEqual(["expected"])
    expect(toggleSheetFilterCondition(["expected"], "expected")).toEqual([])
    expect(toggleSheetFilterCondition(["confirmed", "expected"], "confirmed")).toEqual(["expected"])
  })

  it("값 있음은 확도 · 값 없음과 함께 켜지지 않는다 — 체크한 그대로 걸린다", () => {
    // 확도 · 값 없음을 켜면 값 있음이 꺼진다(메뉴는 값 있음이 켜진 채 열린다 — D2).
    expect(toggleSheetFilterCondition(["any"], "confirmed")).toEqual(["confirmed"])
    expect(toggleSheetFilterCondition(["any"], "empty")).toEqual(["empty"])
    // 값 있음을 켜면 확도 · 값 없음이 꺼진다.
    expect(toggleSheetFilterCondition(["confirmed", "high-confidence"], "any")).toEqual(["any"])
    expect(toggleSheetFilterCondition(["expected", "empty"], "any")).toEqual(["any"])
    // 값 있음을 끄면 빈 체크(적용하면 이 열을 푼다).
    expect(toggleSheetFilterCondition(["any"], "any")).toEqual([])
    // 체크 상태는 늘 정규형이다 — 적용해도 다른 조건으로 바뀌지 않는다.
    for (const start of [["any"], ["confirmed"], ["empty"], []] as SheetFilterCondition[][]) {
      for (const condition of SHEET_FILTER_CONDITIONS) {
        const next = toggleSheetFilterCondition(start, condition)
        expect(normalizeSheetFilterSet(next) ?? [], `${start.join("+")} → ${condition}`).toEqual(next)
      }
    }
  })

  it("기획 F-1 3클릭 — 머리(값 있음이 켜진 채 열림) → 확정 → 이 열만 보기 = 그 열 확정만", () => {
    const draft = toggleSheetFilterCondition(sheetFilterDraft(DEFAULT_SHEET_FILTERS, "m0.w2"), "confirmed")
    expect(draft).toEqual(["confirmed"])
    expect(onlySheetFilter(DEFAULT_SHEET_FILTERS, "m0.w2", draft)).toEqual({ "m0.w2": ["confirmed"] })
    // 같은 길에서 확정 대신 값 없음을 켜도 열이 몰래 풀리지 않는다.
    const empty = toggleSheetFilterCondition(sheetFilterDraft(DEFAULT_SHEET_FILTERS, "m1"), "empty")
    expect(setSheetFilter(DEFAULT_SHEET_FILTERS, "m1", empty)).toEqual({ m0: ["any"], m1: ["empty"] })
  })

  it("미리보기 — '적용하면 N행 · 이 열만 보면 M행'", () => {
    expect(countSheetRowsPassing(views, NO_SHEET_FILTERS)).toBe(4)
    expect(countSheetRowsPassing(views, DEFAULT_SHEET_FILTERS)).toBe(2)
    // 다음 달 고확도 점검 — 기본 필터와 겹치면 0행(F4), 이 열만 보면 1행.
    expect(previewSheetFilter(views, DEFAULT_SHEET_FILTERS, "m1", ["high-confidence"])).toEqual({ apply: 0, only: 1 })
    expect(previewSheetFilter(views, DEFAULT_SHEET_FILTERS, "m0.w2", ["confirmed", "high-confidence"])).toEqual({ apply: 2, only: 2 })
    expect(previewSheetFilter(views, DEFAULT_SHEET_FILTERS, "m1", ["empty"])).toEqual({ apply: 1, only: 2 })
    // 기본 필터가 걸린 열을 고치면 그 열의 조건이 바뀐다(겹치지 않는다).
    expect(previewSheetFilter(views, DEFAULT_SHEET_FILTERS, "m0", ["empty"])).toEqual({ apply: 2, only: 2 })
    expect(previewSheetFilter(views, DEFAULT_SHEET_FILTERS, "m0", null)).toEqual({ apply: 4, only: 4 })
    // 미리보기 숫자는 실제로 걸었을 때의 행 수와 같다.
    const applied = setSheetFilter(DEFAULT_SHEET_FILTERS, "m1", ["empty"])
    expect(filterSheetRows(views, applied)).toHaveLength(1)
  })
})

describe("필터 메뉴 자리 — 머리 칸이 표 스크롤 상자 안에서 보일 때만", () => {
  // 1440 창 · 사이드바 240 · 레일 360: 표 상자는 240~1080, 고정 열(# 40 + 고객 172) = 212 → 보이는 머리 구간 452~1080.
  const viewport = { left: 0, right: 1440, top: 0, bottom: 900 }
  const scroller = { left: 240, right: 1080, top: 120, bottom: 900 }
  const head = (left: number, width = 72) => ({ left, right: left + width, top: 150, bottom: 176 })

  it("보이는 머리 칸이면 그 구간을 돌려준다", () => {
    expect(sheetMenuAnchorSpan(head(600), viewport, scroller, 212)).toEqual({ left: 600, right: 672 })
  })

  it("가로 스크롤로 고정 열(# · 고객) 밑에 숨으면 창 안이어도 null — 메뉴를 닫는다", () => {
    expect(sheetMenuAnchorSpan(head(300), viewport, scroller, 212)).toBeNull()
    expect(sheetMenuAnchorSpan(head(380), viewport, scroller, 212)).toBeNull()
    // 반쯤 가려졌으면 보이는 부분만.
    expect(sheetMenuAnchorSpan(head(420), viewport, scroller, 212)).toEqual({ left: 452, right: 492 })
  })

  it("레일 밑(상자 오른쪽 밖)이면 null, 반쯤 걸치면 상자 안쪽 부분만", () => {
    expect(sheetMenuAnchorSpan(head(1100), viewport, scroller, 212)).toBeNull()
    expect(sheetMenuAnchorSpan(head(1080), viewport, scroller, 212)).toBeNull()
    expect(sheetMenuAnchorSpan(head(1040), viewport, scroller, 212)).toEqual({ left: 1040, right: 1080 })
  })

  it("상자가 창 밖으로 밀렸거나 머리가 위아래로 벗어나면 null, 상자가 없으면 창만 본다", () => {
    expect(sheetMenuAnchorSpan(head(600), { ...viewport, right: 590 }, scroller, 212)).toBeNull()
    expect(sheetMenuAnchorSpan({ left: 600, right: 672, top: 90, bottom: 116 }, viewport, scroller, 212)).toBeNull()
    expect(sheetMenuAnchorSpan(head(300), viewport, null, 212)).toEqual({ left: 300, right: 372 })
    expect(sheetMenuAnchorSpan(head(1500), viewport, null, 212)).toBeNull()
  })
})

describe("필터를 건 뒤 그 열을 보이는 자리로(이 열만 보기 · 적용)", () => {
  // 최종 검증 라운드 2: 1440(레일 접힘)에서 12월 W2 를 "이 열만 보기" 하면 머리가 1369~1440 끝에 붙은 채 남고 "12월" 띠가
  // 잘렸다. 보이는 구간 = 표 상자 240~1440 + 고정 열 196 → 436~1440. 12월 묶음 = 계 80 + 주 72×5 → 1217~1657.
  const area = { left: 436, right: 1440 }
  const w2 = { left: 1369, right: 1441 }
  const block = { left: 1217, right: 1657 }

  it("그 달 묶음이 통째로 들어가면 묶음 오른쪽 끝을 맞춘다 — 띠 · 계 · W1~W5 가 다 보인다", () => {
    expect(sheetRevealScrollDelta(w2, block, area)).toBe(217)
  })

  it("묶음이 이미 다 보이면 움직이지 않는다", () => {
    expect(sheetRevealScrollDelta({ left: 929, right: 1001 }, { left: 777, right: 1217 }, area)).toBe(0)
  })

  it("고정 열(# · 고객) 밑으로 숨은 묶음은 왼쪽 끝을 맞춘다", () => {
    expect(sheetRevealScrollDelta({ left: 480, right: 552 }, { left: 400, right: 840 }, area)).toBe(-36)
  })

  it("묶음이 안 들어가는 좁은 화면이면 그 열만 가장 가까운 쪽으로 — 다 보이면 0", () => {
    const narrow = { left: 436, right: 800 }
    expect(sheetRevealScrollDelta({ left: 760, right: 832 }, block, narrow)).toBe(32)
    expect(sheetRevealScrollDelta({ left: 600, right: 672 }, { left: 450, right: 900 }, narrow)).toBe(0)
    expect(sheetRevealScrollDelta({ left: 400, right: 472 }, null, narrow)).toBe(-36)
  })

  it("열 하나도 다 안 들어가면 왼쪽 끝(앞자리)부터 보이게", () => {
    expect(sheetRevealScrollDelta({ left: 500, right: 600 }, null, { left: 520, right: 560 })).toBe(-20)
  })
})

describe("조건 이름 · 메뉴 · 걸린 필터 목록", () => {
  it("메뉴 체크박스는 값 있음 · 확도(토큰 맵 순서) · 값 없음이다", () => {
    expect(SHEET_FILTER_OPTIONS.map((option) => [option.id, option.label, option.hint, option.confidence])).toEqual([
      ["any", "값 있음", "공백 제외", null],
      ["confirmed", "확정", null, "confirmed"],
      ["high-confidence", "고확도", null, "high-confidence"],
      ["expected", "예정", null, "expected"],
      ["empty", "값 없음", "빈 칸", null],
    ])
    // 확도 칸은 토큰 맵을 그대로 돌린다 — 5단계 전환 때 토큰 맵만 바뀌면 메뉴도 따라간다.
    const confidenceOptions = SHEET_FILTER_OPTIONS.filter((option) => option.confidence != null)
    expect(confidenceOptions.map((option) => option.id)).toEqual(Object.keys(CONFIDENCE_TOKENS))
    expect(confidenceOptions.map((option) => option.label)).toEqual(Object.values(CONFIDENCE_TOKENS).map((token) => token.label))
    expect(SHEET_FILTER_CONDITIONS).toEqual(SHEET_FILTER_OPTIONS.map((option) => option.id))
    expect(SHEET_FILTER_KEYS).toHaveLength(12)
  })

  it("조건 이름 — 하나면 그 이름, 여럿이면 정규 순서로 '·'", () => {
    expect(SHEET_FILTER_CONDITIONS.map(sheetFilterConditionLabel)).toEqual(["값 있음", "확정", "고확도", "예정", "값 없음"])
    expect(sheetFilterSetLabel(["high-confidence", "confirmed"])).toBe("확정·고확도")
    expect(sheetFilterSetLabel(["any"])).toBe("값 있음")
    expect(sheetFilterSetLabel(["empty", "expected", "empty"])).toBe("예정·값 없음")
    expect(sheetFilterSetLabel([])).toBe("")
    expect(sheetFilterSetLabel(undefined)).toBe("")
    expect(isSheetFilterCondition("high-confidence")).toBe(true)
    expect(isSheetFilterCondition("high")).toBe(false)
  })

  it("걸린 필터 목록 — 열 순서대로 '11월 계 값 있음 · 11월 W2 확정·고확도'", () => {
    expect(describeSheetFilters({ "m0.w2": ["high-confidence", "confirmed"], m0: ["any"] }, columns)).toEqual([
      { key: "m0", label: "11월 계 값 있음", columnLabel: "11월 계", conditionLabel: "값 있음", conditions: ["any"], applies: true },
      {
        key: "m0.w2",
        label: "11월 W2 확정·고확도",
        columnLabel: "11월 W2",
        conditionLabel: "확정·고확도",
        conditions: ["confirmed", "high-confidence"],
        applies: true,
      },
    ])
    expect(describeSheetFilters({ "m1.w5": ["high-confidence"] }, columns).map((chip) => chip.label)).toEqual(["12월 W5 고확도"])
    expect(describeSheetFilters({ m1: ["expected", "empty"] }, columns).map((chip) => chip.label)).toEqual(["12월 계 예정·값 없음"])
    // 정규화 전 집합도 정규형 이름으로, 거르지 않는 집합은 목록에서 뺀다.
    expect(describeSheetFilters({ m0: ["confirmed", "any"], m1: ["any", "empty"], m2: ["any"] }, columns).map((chip) => chip.label)).toEqual(["11월 계 값 있음"])
    expect(describeSheetFilters(NO_SHEET_FILTERS, columns)).toEqual([])
    expect(sheetFilterColumnLabel("m1", columns)).toBe("12월 계")
    expect(sheetFilterColumnLabel("m1", buildSheetColumns(MONTHS, "2027-03"))).toBeNull()
    // 월을 옮기면 같은 자리의 필터가 그 달 이름으로 읽힌다.
    expect(describeSheetFilters(DEFAULT_SHEET_FILTERS, buildSheetColumns(MONTHS, DEC)).map((chip) => chip.label)).toEqual(["12월 계 값 있음"])
  })
})

describe("URL 직렬화 — cf", () => {
  it("생략은 기본값(이번 달 계 · 값 있음), none 은 전부 풀림", () => {
    expect(parseSheetFilters(null)).toEqual({ m0: ["any"] })
    expect(parseSheetFilters(null)).toBe(DEFAULT_SHEET_FILTERS)
    expect(parseSheetFilters("none")).toEqual({})
    expect(parseSheetFilters("")).toEqual({})
    expect(serializeSheetFilters(DEFAULT_SHEET_FILTERS)).toBeNull()
    expect(serializeSheetFilters({ m0: ["confirmed", "any"] })).toBeNull()
    expect(serializeSheetFilters(NO_SHEET_FILTERS)).toBe("none")
    expect(serializeSheetFilters({ m0: ["any", "empty"] })).toBe("none")
  })

  it("한 열의 조건은 '+'로 잇는다", () => {
    const filters = parseSheetFilters("m0:any,m1.w2:confirmed+high,m1:empty")
    expect(filters).toEqual({ m0: ["any"], m1: ["empty"], "m1.w2": ["confirmed", "high-confidence"] })
    expect(Object.keys(filters)).toEqual(["m0", "m1", "m1.w2"])
    expect(serializeSheetFilters(filters)).toBe("m0:any,m1:empty,m1.w2:confirmed+high")
    expect(serializeSheetFilters({ "m0.w3": ["expected", "confirmed", "empty"] })).toBe("m0.w3:confirmed+expected+empty")
    expect(serializeSheetFilters({ m1: ["high-confidence"] })).toBe("m1:high")
  })

  it("한 조건짜리 옛 주소는 같은 뜻으로 열리고, 다시 적어도 같은 주소다", () => {
    expect(parseSheetFilters("m0:any,m0.w2:confirmed")).toEqual({ m0: ["any"], "m0.w2": ["confirmed"] })
    expect(parseSheetFilters("m1:high")).toEqual({ m1: ["high-confidence"] })
    expect(parseSheetFilters("m0.w1:expected,m1.w5:any")).toEqual({ "m0.w1": ["expected"], "m1.w5": ["any"] })
    expect(ids(filterSheetRows(views, parseSheetFilters("m0:any,m0.w2:confirmed")))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, parseSheetFilters("m1:high")))).toEqual(["b"])
    for (const old of ["m0:any,m0.w2:confirmed", "m1:high", "m0:confirmed", "m0.w1:expected,m1:high,m1.w5:any"]) {
      expect(serializeSheetFilters(parseSheetFilters(old))).toBe(old)
    }
    expect(serializeSheetFilters(parseSheetFilters("m0:any"))).toBeNull()
  })

  it("왕복해도 같은 필터다(URLSearchParams 를 거쳐도)", () => {
    const cases: SheetColumnFilters[] = [
      DEFAULT_SHEET_FILTERS,
      NO_SHEET_FILTERS,
      { m0: ["confirmed"] },
      { m0: ["any"], "m0.w2": ["confirmed"] },
      { "m0.w1": ["expected"], m1: ["high-confidence"], "m1.w5": ["any"] },
      { m0: ["confirmed", "high-confidence", "expected"], "m1.w2": ["confirmed", "high-confidence"] },
      { m0: ["empty"], "m0.w4": ["high-confidence", "empty"], m1: ["expected", "empty"] },
    ]
    for (const filters of cases) {
      const param = serializeSheetFilters(filters)
      expect(parseSheetFilters(param)).toEqual(filters)
      // 쉼표·콜론·'+' 는 인코딩되어 그대로 돌아온다.
      const search = new URLSearchParams()
      if (param) search.set("cf", param)
      expect(parseSheetFilters(new URLSearchParams(search.toString()).get("cf"))).toEqual(filters)
    }
  })

  it("인코딩 없이 '+'를 그대로 쓴 주소(공백으로 읽힌다)도 같은 뜻이다", () => {
    const raw = new URLSearchParams("cf=m1.w2:confirmed+high,m0:any").get("cf")
    expect(raw).toBe("m1.w2:confirmed high,m0:any")
    expect(parseSheetFilters(raw)).toEqual({ m0: ["any"], "m1.w2": ["confirmed", "high-confidence"] })
  })

  it("열 순서·정규형으로 적고, 모르는 열·조건은 버리고, 같은 열이 두 번이면 합친다", () => {
    expect(serializeSheetFilters(parseSheetFilters("m1.w3:expected,m0:any"))).toBe("m0:any,m1.w3:expected")
    expect(parseSheetFilters("m9:any,m0.w2:whatever,m1:high,junk")).toEqual({ m1: ["high-confidence"] })
    expect(parseSheetFilters("m0:confirmed+bogus+high,m0.w2")).toEqual({ m0: ["confirmed", "high-confidence"] })
    expect(parseSheetFilters("m0:high+confirmed+high")).toEqual({ m0: ["confirmed", "high-confidence"] })
    expect(parseSheetFilters("m0:any+expected")).toEqual({ m0: ["any"] })
    expect(parseSheetFilters("m0:any+empty")).toEqual({})
    expect(parseSheetFilters("m0:confirmed,m0:expected")).toEqual({ m0: ["confirmed", "expected"] })
    expect(parseSheetFilters("m0:any,m0:empty")).toEqual({})
    expect(parseSheetFilters(" m0 : confirmed + high ")).toEqual({ m0: ["confirmed", "high-confidence"] })
    expect(sameSheetFilters(parseSheetFilters("m1:any,m0:any"), { m0: ["any"], m1: ["any"] })).toBe(true)
    expect(sameSheetFilters({ m0: ["expected", "confirmed"] }, { m0: ["confirmed", "expected"] })).toBe(true)
    expect(sameSheetFilters(DEFAULT_SHEET_FILTERS, NO_SHEET_FILTERS)).toBe(false)
  })
})

describe("합계 행·칸 이동 순서", () => {
  it("합계는 지금 보이는 행만 더한다", () => {
    const all = sumSheetRows(views, columns)
    expect(all.past.total).toBe(70)
    expect(all.blocks[0].bucket).toMatchObject({ total: 600, confirmed: 100, high: 300, open: 200 })
    expect(all.blocks[0].weeks).toEqual([0, 400, 0, 200, 0])
    expect(all.blocks[1].bucket.total).toBe(90)
    expect(all.blocks[1].weeks).toEqual([0, 0, 50, 0, 40])
    expect(all.later.total).toBe(10)
    expect(all.annual.total).toBe(770)
    const filtered = sumSheetRows(filterSheetRows(views, { "m0.w2": ["confirmed"] }), columns)
    expect(filtered.blocks[0].bucket.total).toBe(100)
    expect(filtered.annual.total).toBe(150)
    expect(sumSheetRows([], columns).annual.total).toBe(0)
  })

  it("고칠 수 있는 칸은 행 위→아래, 기준 달 W1~W5 → 다음 달 W1~W5 순서이고, 잠긴 달의 값 있는 칸은 뺀다", () => {
    const b = views.filter((view) => view.row.id === "b")
    expect(sheetEditableCells(b)).toEqual([
      ...[0, 1, 2, 3, 4].map((week) => ({ rowId: "b", month: NOV, week })),
      ...[0, 1, 2, 3, 4].map((week) => ({ rowId: "b", month: DEC, week })),
    ])
    // a-sw 의 11월은 전액 확정이라 잠겼다 — 값이 찍힌 W2 만 빠지고 빈 주차는 열려 있다.
    const sw = sheetEditableCells(views.filter((view) => view.row.id === "a-sw"))
    expect(sw.filter((cell) => cell.month === NOV).map((cell) => cell.week)).toEqual([0, 2, 3, 4])
    expect(sw.filter((cell) => cell.month === DEC).map((cell) => cell.week)).toEqual([0, 1, 2, 3, 4])
    expect(sheetEditableCells(views).map((cell) => cell.rowId).filter((id, index, list) => list.indexOf(id) === index)).toEqual(["empty", "b", "a-sw", "a-hw"])
  })
})

describe("결과 0행 안내 · 합계 행 이름(D-4)", () => {
  it("열 필터가 행을 거르고 있으면 '필터 결과', 그 자리에 달이 없는 필터만 남았으면 '합계'", () => {
    expect(sheetFiltersApply(DEFAULT_SHEET_FILTERS, columns)).toBe(true)
    expect(sheetFiltersApply(NO_SHEET_FILTERS, columns)).toBe(false)
    const lastMonth = buildSheetColumns(MONTHS, "2027-03")
    expect(sheetFiltersApply({ m1: ["any"] }, lastMonth)).toBe(false)
    expect(sheetFiltersApply({ m0: ["any"], m1: ["any"] }, lastMonth)).toBe(true)
  })

  it("0행이면 하나만 풀었을 때 가장 많이 남는 필터를 고른다", () => {
    // 11월 계 값 있음(한빛 두 건) AND 12월 계 고확도(다온) → 0행.
    const filters: SheetColumnFilters = { m0: ["any"], m1: ["high-confidence"] }
    expect(filterSheetRows(views, filters)).toHaveLength(0)
    // 12월 계 고확도를 풀면 2행, 11월 계 값 있음을 풀면 1행.
    expect(sheetFilterRelaxHint(views, filters, columns)).toEqual({ key: "m1", label: "12월 계 고확도", count: 2 })
    // 하나를 풀어도 0행이면(열 필터 밖이 0을 만들었다) 안내하지 않는다.
    expect(sheetFilterRelaxHint([], filters, columns)).toBeNull()
    expect(sheetFilterRelaxHint(views, NO_SHEET_FILTERS, columns)).toBeNull()
  })

  it("목적격 조사 — 받침이 있으면 '을', 없으면 '를'", () => {
    expect(objectParticle("12월 계 고확도")).toBe("를")
    expect(objectParticle("11월 W2 확정")).toBe("을")
    expect(objectParticle("11월 계 값 있음")).toBe("을")
    expect(objectParticle("W2")).toBe("를")
    expect(objectParticle("W1")).toBe("을")
    expect(objectParticle("")).toBe("을(를)")
  })
})

describe("이번 주 열(D-3)", () => {
  it("기준 달이 오늘이 든 달이면 그 주차 열 — 1·8·15·22·29일 시작(시트 쓰기와 같은 규칙)", () => {
    expect(sheetCurrentWeekKey(columns, "2026-11-01")).toBe("m0.w1")
    expect(sheetCurrentWeekKey(columns, "2026-11-07")).toBe("m0.w1")
    expect(sheetCurrentWeekKey(columns, "2026-11-08")).toBe("m0.w2")
    expect(sheetCurrentWeekKey(columns, "2026-11-25")).toBe("m0.w4")
    expect(sheetCurrentWeekKey(columns, "2026-11-30")).toBe("m0.w5")
  })

  it("다른 달을 보고 있거나 날짜가 아니면 없다", () => {
    expect(sheetCurrentWeekKey(columns, "2026-12-03")).toBeNull()
    expect(sheetCurrentWeekKey(buildSheetColumns(MONTHS, "2026-10"), "2026-11-25")).toBeNull()
    expect(sheetCurrentWeekKey(columns, "2026-11")).toBeNull()
    expect(sheetCurrentWeekKey({ blocks: [] }, "2026-11-25")).toBeNull()
  })
})

describe("금액 글자 맞추기(C-2 가) — 앞자리를 숨기지 않고 글자를 줄인다", () => {
  // 주차 칸 72px − 선 1 − 여백 8 = 63, 월 계 84px − 선 1 − 여백 12 = 71.
  const WEEK = 63
  const MONTH_TOTAL = 71

  it("7자리는 주차 칸에 12px 그대로, 8자리는 한 단계씩 줄인다", () => {
    expect(sheetAmountFontPx("1,660,000", WEEK)).toBe(12)
    expect(sheetAmountFontPx("12,340,000", WEEK)).toBe(10.5)
    expect(sheetAmountFontPx("98,760,000", MONTH_TOTAL)).toBe(12)
    expect(sheetAmountFontPx("123,450,000", MONTH_TOTAL)).toBe(10.5)
  })

  it("마지막 단계에서도 넘치면 마지막 단계(나머지는 칸이 끝을 줄임표로 자른다)", () => {
    expect(sheetAmountFontPx("123,450,000", WEEK)).toBe(SHEET_AMOUNT_STEPS[SHEET_AMOUNT_STEPS.length - 1])
    expect(sheetAmountTextWidth("123,450,000", 10.5)).toBeGreaterThan(WEEK)
  })

  it("합계 행은 한 단계 작게 시작하고 9자리 주 합계까지 줄여 넣는다", () => {
    expect(SHEET_SUM_STEPS[0]).toBeLessThan(SHEET_AMOUNT_STEPS[0])
    expect(sheetAmountFontPx("8,765,432", WEEK, SHEET_SUM_STEPS)).toBe(11)
    expect(sheetAmountFontPx("123,456,789", WEEK, SHEET_SUM_STEPS)).toBe(9.5)
  })

  it("글자 크기 클래스는 완성된 리터럴이다(단계마다 하나)", () => {
    expect(sheetAmountFontClass("1,660,000", WEEK)).toBe("text-[12px]")
    expect(sheetAmountFontClass("12,340,000", WEEK)).toBe("text-[10.5px]")
    for (const px of [...SHEET_AMOUNT_STEPS, ...SHEET_SUM_STEPS]) {
      const text = "1"
      expect(sheetAmountFontClass(text, 100, [px])).toBe(`text-[${px}px]`)
    }
  })
})
