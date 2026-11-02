import { describe, expect, it } from "vitest"

import {
  buildSalesDashboardRows,
  formatSalesCell,
  salesDashboardColumns,
  salesDashboardHeadline,
  salesFyLabel,
  salesFyOptions,
} from "@/components/admin/hardware/inventory/sales-dashboard-view"
import type { SalesDashboardCounts, SalesDashboardLine } from "@/lib/repositories/hardware-sales-dashboard"

function counts(installed = 0, planned = 0, returned = 0): SalesDashboardCounts {
  return { installed, planned, returned }
}

function line(total: SalesDashboardCounts, monthIndex = 0): SalesDashboardLine {
  const months = Array.from({ length: 12 }, () => counts())
  months[monthIndex] = { ...total }
  return { months, undated: counts(), total: { ...total } }
}

describe("formatSalesCell", () => {
  it("설치 / +예정 — +0 은 숨긴다", () => {
    expect(formatSalesCell(counts(9, 3))).toMatchObject({ installed: "9", planned: "+3", returned: null, empty: false })
    expect(formatSalesCell(counts(9, 0))).toMatchObject({ installed: "9", planned: null })
    expect(formatSalesCell(counts(0, 2))).toMatchObject({ installed: "0", planned: "+2" })
  })

  it("빈 칸은 비우고, 합계 칸은 0을 보인다", () => {
    expect(formatSalesCell(counts())).toMatchObject({ installed: "", planned: null, empty: true })
    expect(formatSalesCell(counts(), { showZero: true })).toMatchObject({ installed: "0", empty: true })
  })

  it("회수는 따로 적는다", () => {
    expect(formatSalesCell(counts(0, 0, 2))).toMatchObject({ installed: "", returned: "회수 2", empty: false })
    expect(formatSalesCell(counts(1200, 0, 1))).toMatchObject({ installed: "1,200", returned: "회수 1" })
  })
})

describe("FY 선택지·열", () => {
  it("현재·직전 FY 는 늘 있고, 미래 FY 는 빼고 내림차순", () => {
    expect(salesFyOptions([2026], 2026)).toEqual([2026, 2025])
    expect(salesFyOptions([2027, 2026, 2023], 2026)).toEqual([2026, 2025, 2023])
    expect(salesFyLabel(2026)).toBe("FY26 (2026.4 ~ 2027.3)")
  })

  it("4월부터 3월까지, 첫 달과 1월에 연도를 붙이고 이번 달을 표시한다", () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
    const columns = salesDashboardColumns(months, new Date("2026-10-28T03:00:00Z"))
    expect(columns.map((column) => column.label)).toEqual(["4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월", "1월", "2월", "3월"])
    expect(columns.filter((column) => column.yearHint).map((column) => [column.key, column.yearHint])).toEqual([["2026-04", "'26"], ["2027-01", "'27"]])
    expect(columns.filter((column) => column.current).map((column) => column.key)).toEqual(["2026-10"])
  })
})

describe("buildSalesDashboardRows", () => {
  it("묶음마다 품목 줄 + 소계, 마지막에 합계", () => {
    const rows = buildSalesDashboardRows({
      groups: [
        {
          key: "board",
          label: "전자칠판",
          rows: [
            { itemId: "i-110", name: '110" IFP', ...line(counts()) },
            { itemId: "i-86", name: '86" IFP', ...line(counts(9, 3), 6) },
          ],
          subtotal: line(counts(9, 3), 6),
        },
        { key: "camera", label: "카메라", rows: [], subtotal: line(counts()) },
      ],
      grandTotal: line(counts(9, 3, 1), 6),
    })
    expect(rows.map((row) => [row.kind, row.label, row.groupLabel])).toEqual([
      ["item", '110" IFP', "전자칠판"],
      ["item", '86" IFP', null],
      ["subtotal", "전자칠판 소계", null],
      ["subtotal", "카메라 소계", "카메라"],
      ["grand", "합계", null],
    ])
    expect(rows[0].total).toMatchObject({ installed: "0", empty: true })
    expect(rows[1].cells[6]).toMatchObject({ installed: "9", planned: "+3" })
    expect(rows[1].cells[0]).toMatchObject({ installed: "", empty: true })
    expect(rows[4].total).toMatchObject({ installed: "9", planned: "+3", returned: "회수 1" })
  })

  it("머리 요약은 FY 합계를 쓴다", () => {
    expect(salesDashboardHeadline({ grandTotal: line(counts(1234, 5, 2)) })).toEqual({
      installed: "1,234",
      planned: "5",
      returned: "2",
      hasUndated: false,
    })
  })
})
