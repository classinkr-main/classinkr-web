import { describe, expect, it } from "vitest"
import {
  aggregatePeriodManagerSummaries,
  buildPeriodMonths,
} from "@/components/admin/branch/SalesLedgerWorkbench"
import type { LedgerRevenueRow } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(웨이브 5 — 장부 기간 UX 확장, 항목 2): RevAuxAnalysisSection의 "담당자별 수치"
// 표가 selectedMonth 고정에서 기간 인지(M/Q/Y)로 바뀌면서 쓰는 순수 집계 함수를 렌더 없이
// 직접 구동한다. 확도 합산은 rowMonthAmount/rowMonthConfirmed/rowMonthHighConfidence를 월
// 단위로만 호출한다는 철칙을 지키므로, "분기 3개월 합산 == 개별 월 합의 합"이 항상 성립해야
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

describe("aggregatePeriodManagerSummaries — 담당자별 기간 집계(웨이브 5, 항목 2)", () => {
  it("분기 3개월 합산은 개별 월 합의 합과 정확히 일치한다(핵심 회귀)", () => {
    const rows: LedgerRevenueRow[] = [
      makeRow({
        id: "deal-a",
        manager: "김지사",
        monthlyPayments: { "2026-07": 1_000_000, "2026-08": 500_000, "2026-09": 300_000 },
        monthlyConfirmed: { "2026-07": 1_000_000, "2026-08": 200_000 },
        monthlyHighConfidence: { "2026-08": 300_000 },
      }),
      makeRow({
        id: "deal-b",
        manager: "박지사",
        monthlyPayments: { "2026-08": 2_000_000 },
        monthlyConfirmed: { "2026-08": 2_000_000 },
      }),
    ]
    const quarterMonths = ["2026-07", "2026-08", "2026-09"]

    const quarterResult = aggregatePeriodManagerSummaries(rows, quarterMonths)
    const perMonthResults = quarterMonths.map((month) => aggregatePeriodManagerSummaries(rows, [month]))

    const sumByManager = new Map<string, { total: number; confirmed: number; highConfidence: number; open: number }>()
    for (const monthResult of perMonthResults) {
      for (const entry of monthResult) {
        const current = sumByManager.get(entry.manager) ?? { total: 0, confirmed: 0, highConfidence: 0, open: 0 }
        current.total += entry.total
        current.confirmed += entry.confirmed
        current.highConfidence += entry.highConfidence
        current.open += entry.open
        sumByManager.set(entry.manager, current)
      }
    }

    for (const entry of quarterResult) {
      const expected = sumByManager.get(entry.manager)
      expect(expected).toBeDefined()
      expect(entry.total).toBe(expected!.total)
      expect(entry.confirmed).toBe(expected!.confirmed)
      expect(entry.highConfidence).toBe(expected!.highConfidence)
      expect(entry.open).toBe(expected!.open)
    }
    // 모집단 자체도 동일해야 한다(매니저 유실/추가 없음).
    expect(quarterResult.map((r) => r.manager).sort()).toEqual([...sumByManager.keys()].sort())
  })

  it("건수(rows)는 딜 단위로 dedupe — 3개월 모두 금액이 있어도 1건", () => {
    const rows: LedgerRevenueRow[] = [
      makeRow({
        id: "deal-a",
        manager: "김지사",
        monthlyPayments: { "2026-07": 100_000, "2026-08": 100_000, "2026-09": 100_000 },
        monthlyConfirmed: { "2026-07": 100_000, "2026-08": 100_000, "2026-09": 100_000 },
      }),
    ]
    const result = aggregatePeriodManagerSummaries(rows, ["2026-07", "2026-08", "2026-09"])
    expect(result).toHaveLength(1)
    expect(result[0].rows).toBe(1)
    expect(result[0].total).toBe(300_000)
  })

  it("M(단일월)은 기존 selectedMonth 집계와 동일한 결과다", () => {
    const rows: LedgerRevenueRow[] = [
      makeRow({
        id: "deal-a",
        manager: "김지사",
        monthlyPayments: { "2026-08": 500_000 },
        monthlyConfirmed: { "2026-08": 500_000 },
      }),
    ]
    const result = aggregatePeriodManagerSummaries(rows, buildPeriodMonths("M", "2026-08", MATRIX_MONTHS))
    expect(result).toEqual([
      { manager: "김지사", total: 500_000, confirmed: 500_000, highConfidence: 0, open: 0, rows: 1 },
    ])
  })
})
