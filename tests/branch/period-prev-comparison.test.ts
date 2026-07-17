import { describe, expect, it } from "vitest"
import { buildPrevPeriodComparison } from "@/components/admin/branch/SalesLedgerWorkbench"
import type { LedgerRevenueRow } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(웨이브 5 — 장부 기간 UX 확장, 항목 3): "실적" 지표 타일의 전기 대비 칩이 쓰는
// 순수 함수를 렌더 없이 직접 구동한다. 이전 기간 확정 합계는 rowMonthConfirmed를 월 단위로만
// 호출해 합산한다(철칙). FY 경계를 벗어나는 이전 기간·이전 기간 합 0·Y 스코프는 전부 null을
// 반환해 렌더 생략(거짓 0% 금지, DealMixSection의 prev_period_available 가드와 동일 원칙)해야
// 한다 — 이 파일의 핵심 불변식.

function makeRow(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "row-1",
    sourceDealId: "deal-1",
    customer: "테스트 학원",
    manager: "김지사",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: {},
    ...overrides,
  }
}

// FY26-27(4월 시작) 12개월 — SalesLedgerWorkbench.buildFiscalMonthOptions와 동일 순서.
const MATRIX_MONTHS = [
  "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12",
  "2027-01", "2027-02", "2027-03",
]

describe("buildPrevPeriodComparison — 전기 대비 칩 가드(웨이브 5, 항목 3)", () => {
  const rows: LedgerRevenueRow[] = [
    makeRow({ id: "deal-a", monthlyPayments: { "2026-06": 1_000_000 }, monthlyConfirmed: { "2026-06": 1_000_000 } }),
    makeRow({
      id: "deal-b",
      monthlyPayments: { "2026-04": 500_000, "2026-05": 500_000, "2026-06": 500_000 },
      monthlyConfirmed: { "2026-04": 500_000, "2026-05": 500_000, "2026-06": 500_000 },
    }),
  ]

  it("M: 전월 확정 합계 대비 델타를 계산한다", () => {
    // selectedMonth=2026-07 → periodMonths=["2026-07"], 전월=2026-06(확정 합계 1.5M:
    // deal-a 1,000,000 + deal-b 500,000)
    const result = buildPrevPeriodComparison("M", 3_000_000, rows, MATRIX_MONTHS, ["2026-07"])
    expect(result).not.toBeNull()
    expect(result!.label).toBe("2026.6 대비")
    expect(result!.deltaPct).toBeCloseTo(((3_000_000 - 1_500_000) / 1_500_000) * 100)
  })

  it("M 가드: FY 첫 달(4월)의 '전월'은 회계연도 밖 — 렌더 생략(null)", () => {
    const result = buildPrevPeriodComparison("M", 1_000_000, rows, MATRIX_MONTHS, ["2026-04"])
    expect(result).toBeNull()
  })

  it("Q 가드: Q1의 '전분기'는 회계연도 밖 — 렌더 생략(null)", () => {
    const result = buildPrevPeriodComparison("Q", 1_000_000, rows, MATRIX_MONTHS, ["2026-04", "2026-05", "2026-06"])
    expect(result).toBeNull()
  })

  it("Q: Q2 선택 시 Q1(4-6월) 확정 합계와 비교한다", () => {
    const result = buildPrevPeriodComparison("Q", 4_000_000, rows, MATRIX_MONTHS, ["2026-07", "2026-08", "2026-09"])
    expect(result).not.toBeNull()
    // Q1 확정 합계 = deal-a(2026-06) 1,000,000 + deal-b(4,5,6월) 1,500,000 = 2,500,000
    expect(result!.label).toBe("Q1 대비")
    expect(result!.deltaPct).toBeCloseTo(((4_000_000 - 2_500_000) / 2_500_000) * 100)
  })

  it("가드: 이전 기간 합이 0이면 렌더 생략(null) — 거짓 0% 금지", () => {
    const emptyRows: LedgerRevenueRow[] = []
    const result = buildPrevPeriodComparison("M", 1_000_000, emptyRows, MATRIX_MONTHS, ["2026-08"])
    expect(result).toBeNull()
  })

  it("Y는 항상 미지원(null)", () => {
    const result = buildPrevPeriodComparison("Y", 10_000_000, rows, MATRIX_MONTHS, MATRIX_MONTHS)
    expect(result).toBeNull()
  })

  it("currentActual이 없으면(로딩 중 등) 렌더 생략(null)", () => {
    const result = buildPrevPeriodComparison("M", null, rows, MATRIX_MONTHS, ["2026-07"])
    expect(result).toBeNull()
  })
})
