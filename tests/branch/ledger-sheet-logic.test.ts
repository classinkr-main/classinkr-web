import { describe, expect, it } from "vitest"

import {
  buildSheetColumns,
  buildSheetRowView,
  DEFAULT_SHEET_FILTERS,
  describeSheetFilters,
  filterSheetRows,
  NO_SHEET_FILTERS,
  parseSheetFilters,
  sameSheetFilters,
  serializeSheetFilters,
  setSheetFilter,
  SHEET_FILTER_KEYS,
  SHEET_FILTER_MODES,
  sheetEditableCells,
  sheetFilterColumnLabel,
  sheetRowPassesFilters,
  sortSheetRows,
  sumSheetRows,
  weekCellConfidences,
} from "@/components/admin/branch/ledger/ledger-sheet-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 장부 건별 시트(2026-11-23) — 열 구성·평면 행·열 필터(겹쳐 걸기 = AND)·합계·URL 직렬화.

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

describe("열 필터 — 겹쳐 걸면 AND", () => {
  it("공백 제외는 그 열에 값이 있는 행만 남긴다", () => {
    expect(ids(filterSheetRows(views, { m0: "any" }))).toEqual(["a-sw", "a-hw"])
    expect(ids(filterSheetRows(views, { m1: "any" }))).toEqual(["b", "a-sw"])
    expect(ids(filterSheetRows(views, { "m0.w2": "any" }))).toEqual(["a-sw", "a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w4": "any" }))).toEqual(["a-hw"])
    // 월합계만 있는 달은 W5 에 보이므로 W5 공백 제외에 걸린다.
    expect(ids(filterSheetRows(views, { "m1.w5": "any" }))).toEqual(["b"])
  })

  it("확도 필터 — 월 계는 그 확도 금액이 있으면, 주차는 그 칸의 확도가 같아야 통과한다", () => {
    expect(ids(filterSheetRows(views, { m0: "confirmed" }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { m0: "high-confidence" }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { m0: "expected" }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w2": "confirmed" }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { "m0.w2": "high-confidence" }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { "m0.w2": "expected" }))).toEqual([])
    expect(ids(filterSheetRows(views, { m1: "high-confidence" }))).toEqual(["b"])
  })

  it("여러 열에 겹쳐 걸면 전부 통과한 행만 남는다", () => {
    expect(ids(filterSheetRows(views, { m0: "any", "m0.w2": "confirmed" }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { m0: "any", m1: "any" }))).toEqual(["a-sw"])
    expect(ids(filterSheetRows(views, { m0: "any", "m0.w4": "expected", "m0.w2": "high-confidence" }))).toEqual(["a-hw"])
    expect(ids(filterSheetRows(views, { m0: "confirmed", "m0.w4": "any" }))).toEqual([])
    expect(sheetRowPassesFilters(views[2], { m0: "any", "m1.w3": "expected" })).toBe(true)
  })

  it("전부 풀면 모든 행이 보인다(금액이 없는 행까지)", () => {
    expect(ids(filterSheetRows(views, NO_SHEET_FILTERS))).toEqual(["empty", "b", "a-sw", "a-hw"])
    expect(filterSheetRows(views, NO_SHEET_FILTERS)).toBe(views)
  })

  it("그 자리에 달이 없는 필터(회계연도 마지막 달의 다음 달)는 건너뛴다", () => {
    const last = buildSheetColumns(MONTHS, "2027-03")
    const lastViews = rows.map((item) => buildSheetRowView(item, last))
    expect(lastViews[0].blocks).toHaveLength(1)
    expect(filterSheetRows(lastViews, { m1: "any" })).toHaveLength(rows.length)
    expect(filterSheetRows(lastViews, { m0: "any" })).toHaveLength(0)
  })

  it("열 하나씩 걸고 풀 수 있고, 다른 열의 필터는 그대로다", () => {
    let filters = DEFAULT_SHEET_FILTERS
    filters = setSheetFilter(filters, "m0.w2", "confirmed")
    expect(filters).toEqual({ m0: "any", "m0.w2": "confirmed" })
    filters = setSheetFilter(filters, "m1", "high-confidence")
    expect(Object.keys(filters)).toEqual(["m0", "m0.w2", "m1"])
    filters = setSheetFilter(filters, "m0", null)
    expect(filters).toEqual({ "m0.w2": "confirmed", m1: "high-confidence" })
    filters = setSheetFilter(filters, "m0.w2", "expected")
    expect(filters["m0.w2"]).toBe("expected")
    // 모르는 열은 무시한다.
    expect(setSheetFilter(filters, "m2", "any")).toBe(filters)
    expect(setSheetFilter(filters, "m0.w6", "any")).toBe(filters)
  })

  it("필터 종류는 공백 제외와 지금의 확도 3단계다", () => {
    expect(SHEET_FILTER_MODES.map((mode) => [mode.id, mode.label])).toEqual([
      ["any", "공백 제외"],
      ["confirmed", "확정"],
      ["high-confidence", "고확도"],
      ["expected", "예정"],
    ])
    expect(SHEET_FILTER_KEYS).toHaveLength(12)
  })

  it("걸린 필터 목록 — 열 순서대로 '11월 계 공백 제외 · 11월 W2 확정'", () => {
    expect(describeSheetFilters({ "m0.w2": "confirmed", m0: "any" }, columns)).toEqual([
      { key: "m0", label: "11월 계 공백 제외" },
      { key: "m0.w2", label: "11월 W2 확정" },
    ])
    expect(describeSheetFilters({ "m1.w5": "high-confidence" }, columns)).toEqual([{ key: "m1.w5", label: "12월 W5 고확도" }])
    expect(describeSheetFilters(NO_SHEET_FILTERS, columns)).toEqual([])
    expect(sheetFilterColumnLabel("m1", columns)).toBe("12월 계")
    expect(sheetFilterColumnLabel("m1", buildSheetColumns(MONTHS, "2027-03"))).toBeNull()
    // 월을 옮기면 같은 자리의 필터가 그 달 이름으로 읽힌다.
    expect(describeSheetFilters(DEFAULT_SHEET_FILTERS, buildSheetColumns(MONTHS, DEC))).toEqual([{ key: "m0", label: "12월 계 공백 제외" }])
  })
})

describe("URL 직렬화 — cf", () => {
  it("생략은 기본값(이번 달 계 · 공백 제외), none 은 전부 풀림", () => {
    expect(parseSheetFilters(null)).toEqual({ m0: "any" })
    expect(parseSheetFilters("none")).toEqual({})
    expect(parseSheetFilters("")).toEqual({})
    expect(serializeSheetFilters(DEFAULT_SHEET_FILTERS)).toBeNull()
    expect(serializeSheetFilters(NO_SHEET_FILTERS)).toBe("none")
  })

  it("왕복해도 같은 필터다", () => {
    const cases = [
      DEFAULT_SHEET_FILTERS,
      NO_SHEET_FILTERS,
      { m0: "confirmed" } as const,
      { m0: "any", "m0.w2": "confirmed" } as const,
      { "m0.w1": "expected", "m1": "high-confidence", "m1.w5": "any" } as const,
    ]
    for (const filters of cases) {
      const param = serializeSheetFilters(filters)
      expect(parseSheetFilters(param)).toEqual(filters)
      // URLSearchParams 를 거쳐도(쉼표·콜론 인코딩) 같다.
      const search = new URLSearchParams()
      if (param) search.set("cf", param)
      expect(parseSheetFilters(new URLSearchParams(search.toString()).get("cf"))).toEqual(filters)
    }
    expect(serializeSheetFilters({ m0: "any", "m0.w2": "confirmed" })).toBe("m0:any,m0.w2:confirmed")
    expect(serializeSheetFilters({ m1: "high-confidence" })).toBe("m1:high")
  })

  it("열 순서로 정규화하고, 모르는 키·값은 버린다", () => {
    expect(serializeSheetFilters(parseSheetFilters("m1.w3:expected,m0:any"))).toBe("m0:any,m1.w3:expected")
    expect(parseSheetFilters("m9:any,m0.w2:whatever,m1:high,junk")).toEqual({ m1: "high-confidence" })
    expect(sameSheetFilters(parseSheetFilters("m1:any,m0:any"), { m0: "any", m1: "any" })).toBe(true)
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
    const filtered = sumSheetRows(filterSheetRows(views, { "m0.w2": "confirmed" }), columns)
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
