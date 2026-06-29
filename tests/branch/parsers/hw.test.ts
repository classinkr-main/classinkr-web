import { describe, it, expect } from "vitest"
import { parseInbound, parseOutbound, parseStock, parseSalesMonthly } from "@/lib/branch/parsers/hw"
import type { FormattedCell } from "@/lib/branch/google-sheets"

const c = (value: unknown, bg: FormattedCell["bg"] = null): FormattedCell => ({ value: value as string | number | null, bg })

describe("hw parsers", () => {
  it("inbound", () => {
    const grid: FormattedCell[][] = [
      Array(11).fill(c("")),
      [c("L001"), c("2026. 4. 10"), c('86" IFP'), c(10), c(800000), c(8000000), c(58000000), c("S1,S2"), c("창고A"), c("수입자K"), c("비고")],
    ]
    const out = parseInbound(grid)
    expect(out[0].product).toBe('86" IFP')
    expect(out[0].inbound_date).toBe("2026-04-10")
    expect(out[0].quantity).toBe(10)
    expect(out[0].serials).toEqual(["S1", "S2"])
    expect(out[0].storage).toBe("창고A")
    expect(out[0].importer).toBe("수입자K")
    expect(out[0].remarks).toBe("비고")
  })

  it("outbound maps status/type columns and treats muted red status cells as planned", () => {
    const plannedBg = { red: 0.835, green: 0.651, blue: 0.741 }
    const grid: FormattedCell[][] = [
      Array(13).fill(c("")),
      [c("H8"), c("2026. 4. 27"), c("Wangchan"), c('86" IFP'), c(2), c(2500), c(5000), c(36365.5), c("홍성 프라임수학"), c("S1,S2"), c("배송 예정", plannedBg), c("Sales"), c("메모")],
    ]
    const out = parseOutbound(grid)
    expect(out[0]).toMatchObject({
      logistics_no: "H8",
      outbound_date: "2026-04-27",
      product: '86" IFP',
      quantity: 2,
      revenue: 5000,
      destination: "홍성 프라임수학",
      progress: "배송 예정",
      type: "Sales",
      remarks: "메모",
    })
    expect(out[0].serials).toEqual(["S1", "S2"])
  })

  it("outbound fills merged destination cells down so matching customers sync for each product row", () => {
    const grid: FormattedCell[][] = [
      Array(13).fill(c("")),
      [c(""), c(""), c("Somang"), c('75" IFP'), c(1), c(""), c(""), c(""), c("익산 유투엠"), c(""), c("배송 예정"), c("Sales"), c("")],
      [c(""), c(""), c("Somang"), c("STD1"), c(1), c(""), c(""), c(""), c(""), c(""), c("배송 예정"), c("Sales"), c("")],
      [c(""), c(""), c("Somang"), c("T1(promoted)"), c(1), c(""), c(""), c(""), c(""), c(""), c("배송 예정"), c("Sales"), c("")],
    ]

    const out = parseOutbound(grid)

    expect(out.map((row) => row.destination)).toEqual(["익산 유투엠", "익산 유투엠", "익산 유투엠"])
    expect(out[1].raw).toMatchObject({
      destination: "익산 유투엠",
      destination_cell_value: null,
      destination_filled_from_previous: true,
    })
  })

  it("outbound clears filled destination after a blank separator row", () => {
    const grid: FormattedCell[][] = [
      Array(13).fill(c("")),
      [c(""), c(""), c("Somang"), c('75" IFP'), c(1), c(""), c(""), c(""), c("익산 유투엠"), c(""), c("배송 예정"), c("Sales"), c("")],
      Array(13).fill(c("")),
      [c(""), c(""), c("Han"), c('86" IFP'), c(1), c(""), c(""), c(""), c(""), c(""), c("배송 예정"), c("Sales"), c("")],
    ]

    const out = parseOutbound(grid)

    expect(out.map((row) => row.destination)).toEqual(["익산 유투엠", null])
  })

  it("stock subtracts the outbound block from the inbound block by logistics number", () => {
    const grid: FormattedCell[][] = [
      [c("입출고"), c("제품명"), c("분류"), c("물류No."), c(""), c(""), c("합계")],
      [c(""), c(""), c(""), c("FY24-25"), c("H1"), c("H8")],
      [c("입고 현황"), c('86" IFP'), c("전자칠판"), c(34), c(23), c(35), c(92)],
      [c(""), c('75" IFP'), c("전자칠판"), c(16), c(17), c(10), c(43)],
      [],
      [c("출고 현황"), c('86" IFP'), c("전자칠판"), c(34), c(23), c(23), c(80)],
      [c(""), c('75" IFP'), c("전자칠판"), c(16), c(17), c(9), c(42)],
      [],
      [c("재고 현황"), c("OPS"), c("OPS"), c("사무실 보유"), c(""), c(""), c(53)],
    ]
    const out = parseStock(grid)
    expect(out.find((row) => row.product === '86" IFP')).toMatchObject({ category: "전자칠판", quantity: 12 })
    expect(out.find((row) => row.product === '75" IFP')).toMatchObject({ category: "전자칠판", quantity: 1 })
    expect(out.find((row) => row.product === "OPS")).toMatchObject({ category: "OPS", quantity: 53 })
    expect(out.find((row) => row.product === '86" IFP')?.raw).toMatchObject({
      inbound_total: 92,
      outbound_total: 80,
      by_logistics: { H8: { inbound: 35, outbound: 23, stock: 12 } },
    })
  })
  it("salesMonthly maps FY months", () => {
    const grid: FormattedCell[][] = [
      Array(13).fill(c("")),
      [c('86" IFP'), ...Array(12).fill(c(1))],
    ]
    const out = parseSalesMonthly(grid, 2026)
    expect(out).toHaveLength(12)
    expect(out[0]).toMatchObject({ fiscal_year: 2026, fiscal_month: 4, product: '86" IFP', quantity: 1 })
    expect(out[11]).toMatchObject({ fiscal_year: 2026, fiscal_month: 3 })
  })
})
