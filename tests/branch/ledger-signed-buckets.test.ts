// 장부 화면 매출 한 정의(D1 · D2)를 쓰는 helper — 환불(음수) 달을 0 으로 자르지 않는다.
// design-0 의 예시(11월, 전체 담당자): 시트 A +50,000 확정 · B −30,000 빨강 환불 · C 80,000(20,000 확정 + 60,000 고확도),
// 장부 D +40,000 확정. 기대값: 확정 80,000 · 고확도 60,000 · 예정 0 · 합계 140,000.
import { describe, expect, it } from "vitest"

import { buildForecastBoardModel } from "@/components/admin/branch/ledger/ForecastBoard"
import { rowConfidenceTone } from "@/components/admin/branch/ledger/CockpitDealList"
import {
  numberCell,
  rowMonthConfirmed,
  rowMonthHasRefund,
  rowMonthHighConfidence,
  rowMonthNet,
  rowWeeklyMismatch,
  type LedgerRevenueRow,
} from "@/components/admin/branch/ledger/shared"
import {
  aggregatePeriodManagerSummaries,
  buildPrevPeriodComparison,
  buildRevMonthScalars,
  buildRevProductSummary,
  rowHasMonthValue,
  rowMatchesForecastFilter,
  rowMonthBucket,
  rowMonthOpen,
} from "@/components/admin/branch/ledger/workbench-shared"
import { renderToStaticMarkup } from "react-dom/server"

const NOV = "2026-11"
const OCT = "2026-10"
const TODAY = "2026-11-25"

function sheet(partial: Partial<LedgerRevenueRow> & { id: string; customer: string }): LedgerRevenueRow {
  return {
    manager: "예시A",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    confidenceColorHint: true,
    ...partial,
  } as LedgerRevenueRow
}

const A = sheet({ id: "A", customer: "예시학원A", monthlyPayments: { [NOV]: 50_000, [OCT]: 100_000 }, monthlyRed: { [NOV]: true, [OCT]: true } })
const B = sheet({ id: "B", customer: "예시학원B", manager: "예시B", monthlyPayments: { [NOV]: -30_000 }, monthlyRed: { [NOV]: true } })
const C = sheet({
  id: "C",
  customer: "예시학원C",
  manager: "예시B",
  monthlyPayments: { [NOV]: 80_000 },
  monthlyConfirmed: { [NOV]: 20_000 },
  monthlyHighConfidence: { [NOV]: 60_000 },
  weeklyPayments: { [NOV]: [80_000, 0, 0, 0, 0] },
})
const D = sheet({
  id: "ledger-D",
  customer: "예시학원D",
  ledgerOrigin: "draft",
  draftKind: "new-row",
  draftMonth: NOV,
  revenue: 40_000,
  monthlyPayments: { [NOV]: 40_000 },
  monthlyConfirmed: { [NOV]: 40_000 },
  monthlyRed: { [NOV]: true },
})
const ROWS = [A, B, C, D]

describe("rowMonthBucket — 부호 그대로(D2)", () => {
  it("빨강 환불 달은 합계 −30,000 · 확정 −30,000(예전에는 네 값 모두 0)", () => {
    expect(rowMonthBucket(B, NOV, TODAY)).toEqual({ total: -30_000, confirmed: -30_000, high: 0, open: 0 })
    expect(rowMonthConfirmed(B, NOV, TODAY)).toBe(-30_000)
    expect(rowMonthOpen(B, NOV, TODAY)).toBe(0)
    expect(rowMonthNet(B, NOV)).toBe(-30_000)
  })

  it("검정 환불 달은 예정 −30,000 — 미확정 필터에 든다, 확정 필터에는 안 든다", () => {
    const black = sheet({ id: "K", customer: "검정환불", monthlyPayments: { [NOV]: -30_000 }, monthlyRed: { [NOV]: false } })
    expect(rowMonthBucket(black, NOV, TODAY)).toEqual({ total: -30_000, confirmed: 0, high: 0, open: -30_000 })
    expect(rowMatchesForecastFilter(black, NOV, "open")).toBe(true)
    expect(rowMatchesForecastFilter(black, NOV, "confirmed")).toBe(false)
  })

  it("빨강 환불은 '확정 포함'에 들고 '예정/고확도 남음'에는 들지 않는다(예전에는 +30,000 예정이 생겨 미확정으로 셌다)", () => {
    expect(rowMatchesForecastFilter(B, NOV, "confirmed")).toBe(true)
    expect(rowMatchesForecastFilter(B, NOV, "open")).toBe(false)
  })

  it("환불 달 판정 · 값 있음 판정", () => {
    expect(rowMonthHasRefund(B, NOV)).toBe(true)
    expect(rowMonthHasRefund(A, NOV)).toBe(false)
    expect(rowMonthHasRefund(sheet({ id: "M", customer: "섞임", monthlyPayments: { [NOV]: 70_000 }, weeklyPayments: { [NOV]: [100_000, -30_000, 0, 0, 0] } }), NOV)).toBe(true)
    expect(rowHasMonthValue(B, NOV)).toBe(true)
    expect(rowHasMonthValue(sheet({ id: "Z", customer: "영", monthlyPayments: { [NOV]: 0 } }), NOV)).toBe(false)
  })
})

describe("rowWeeklyMismatch — 부호 그대로 비교", () => {
  it("주차 [100,000 · −130,000] 과 월 −30,000 은 맞는 달이다(예전에는 월 0 과 비교해 거짓 경고)", () => {
    const mixed = sheet({ id: "M", customer: "섞임", monthlyPayments: { [NOV]: -30_000 }, weeklyPayments: { [NOV]: [100_000, -130_000, 0, 0, 0] } })
    expect(rowWeeklyMismatch(mixed, NOV)).toBeNull()
  })

  it("환불 주만 있는 달도 비교한다 — 월 0 이면 −30,000 차이", () => {
    const refundOnly = sheet({ id: "R", customer: "환불주", monthlyPayments: { [NOV]: 0 }, weeklyPayments: { [NOV]: [0, -30_000, 0, 0, 0] } })
    expect(rowWeeklyMismatch(refundOnly, NOV)).toEqual({ weekly: -30_000, monthly: 0, diff: -30_000 })
  })

  it("주차가 없는 달(월합계만)은 비교하지 않는다", () => {
    expect(rowWeeklyMismatch(A, NOV)).toBeNull()
  })
})

describe("한 정의로 더한 합계 — design-0 예시", () => {
  it("buildRevMonthScalars: 확정 80,000 · 고확도 60,000 · 예정 0 · 합계 140,000(네 칸 합 = 합계)", () => {
    const scalars = buildRevMonthScalars(ROWS, NOV, TODAY)
    expect(scalars).toEqual({ total: 140_000, confirmed: 80_000, high: 60_000, monthlyOnlyOpen: 0, open: 0, rows: 4 })
    expect(scalars.confirmed + scalars.high + scalars.monthlyOnlyOpen + scalars.open).toBe(scalars.total)
  })

  it("월합계만 행의 미확정 잔여는 monthlyOnlyOpen 으로 따로 센다", () => {
    const monthOnly = sheet({ id: "O", customer: "월합계만", monthlyPayments: { [NOV]: 10_000 }, monthlyRed: { [NOV]: false } })
    expect(buildRevMonthScalars([monthOnly], NOV, TODAY)).toEqual({ total: 10_000, confirmed: 0, high: 0, monthlyOnlyOpen: 10_000, open: 0, rows: 1 })
  })

  it("aggregatePeriodManagerSummaries: 예시A 90,000/90,000 · 예시B 50,000(확정 −10,000 · 고확도 60,000)", () => {
    const summaries = aggregatePeriodManagerSummaries(ROWS, [NOV], TODAY)
    expect(summaries.find((item) => item.manager === "예시A")).toEqual({ manager: "예시A", total: 90_000, confirmed: 90_000, highConfidence: 0, open: 0, rows: 2 })
    expect(summaries.find((item) => item.manager === "예시B")).toEqual({ manager: "예시B", total: 50_000, confirmed: -10_000, highConfidence: 60_000, open: 0, rows: 2 })
  })

  it("buildRevProductSummary: 환불 행도 상품군 합계에 든다", () => {
    const [software] = buildRevProductSummary(ROWS, NOV, TODAY)
    expect(software).toMatchObject({ total: 140_000, confirmed: 80_000, highConfidence: 60_000, open: 0, rows: 4 })
  })

  it("buildPrevPeriodComparison: 전월 확정은 부호 그대로 더한다 — 11월 80,000 vs 10월 100,000 → −20%", () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", OCT, NOV, "2026-12", "2027-01", "2027-02", "2027-03"]
    const chip = buildPrevPeriodComparison("M", 80_000, ROWS, months, [NOV])
    expect(chip?.label).toBe("2026.10 대비")
    expect(chip?.deltaPct).toBeCloseTo(-20)
  })

  it("rowMonthHighConfidence 도 같은 버킷의 몫이다", () => {
    expect(rowMonthHighConfidence(C, NOV, TODAY)).toBe(60_000)
  })
})

describe("buildForecastBoardModel — 머리 합계는 부호 그대로, 칸반은 양수만", () => {
  it("머리: 4행 · ¥14만 · 확정 ¥8만 · 고확도 ¥6만 · 예정 0, 환불 카드는 없다", () => {
    const model = buildForecastBoardModel(ROWS, NOV, TODAY)
    expect(model).toMatchObject({ monthTotal: 140_000, monthConfirmed: 80_000, monthHighConfidence: 60_000, monthOpen: 0, dealCount: 4 })
    const cardIds = model.columns.flatMap((column) => column.cards.map((card) => card.rowId))
    expect(cardIds).not.toContain("B")
    expect(cardIds.sort()).toEqual(["A", "C", "ledger-D"])
  })

  it("예정은 0 으로 자르지 않는다 — 검정 환불이 예정을 줄인다", () => {
    const open = sheet({ id: "P", customer: "예정학원", monthlyPayments: { [NOV]: 50_000 }, monthlyRed: { [NOV]: false } })
    const black = sheet({ id: "K", customer: "검정환불", monthlyPayments: { [NOV]: -80_000 }, monthlyRed: { [NOV]: false } })
    const model = buildForecastBoardModel([open, black], NOV, TODAY)
    expect(model).toMatchObject({ monthTotal: -30_000, monthOpen: -30_000, dealCount: 2 })
  })
})

describe("콕핏 · 표 숫자 칸", () => {
  it("rowConfidenceTone: 합계 0 이하는 예정(확도 색은 양수만)", () => {
    expect(rowConfidenceTone(-30_000, -30_000, 0)).toBe("expected")
    expect(rowConfidenceTone(50_000, 50_000, 0)).toBe("confirmed")
  })

  it("numberCell: 0 은 '–', 음수는 부호 붙은 중립색, 양수는 확도 색", () => {
    expect(renderToStaticMarkup(numberCell(0))).toContain("–")
    const negative = renderToStaticMarkup(numberCell(-30_000, "text-[#B43E3E]"))
    expect(negative).toContain("-¥3만")
    expect(negative).toContain("text-[#31302E]")
    expect(negative).not.toContain("text-[#B43E3E]")
    expect(renderToStaticMarkup(numberCell(30_000, "text-[#B43E3E]"))).toContain("text-[#B43E3E]")
  })
})
