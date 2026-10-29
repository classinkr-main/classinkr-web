import { describe, expect, it } from "vitest"

import {
  buildHistoryExportRows,
  buildInboundLotsExportRows,
  buildLotCompositionRows,
  buildOutboundPeriodExportRows,
  buildPlannedExportRows,
  buildSampleUnitsExportRows,
  buildStockExportRows,
  HISTORY_EXPORT_HEADER,
} from "@/components/admin/hardware/inventory/hardware-export"
import { parseInboundPaste } from "@/components/admin/hardware/inventory/inbound-sheet-model"
import type { HardwareMovement, HardwareSampleUnit, HardwareStockRow } from "@/components/admin/hardware/inventory/shared"
import { toCsv, toTsv } from "@/lib/export/delimited"

// 하드웨어 라운드 2 B — 읽은 표를 그대로 가져간다(CSV·TSV). 숫자는 원값, 수식 주입 방지는 공용 모듈이 한다.

function movement(overrides: Partial<HardwareMovement>): HardwareMovement {
  return {
    id: "m1",
    item_id: "i1",
    product_name: "T1",
    movement_type: "outbound",
    quantity: 2,
    occurred_at: "2026-09-20",
    from_location: "창고",
    to_location: "남명학원",
    owner: "김운영",
    status: "출고",
    reference_no: "DEAL-1",
    memo: null,
    serials: [],
    lot_no: "C1",
    unit_price: null,
    amount_usd: 1200.5,
    amount_cny: null,
    storage_location: null,
    importer: null,
    source: "admin_manual",
    created_at: "2026-09-20T01:00:00.000Z",
    voided_at: null,
    converted_from_movement_id: null,
    converted_to_movement_id: null,
    ...overrides,
  } as HardwareMovement
}

describe("buildHistoryExportRows", () => {
  it("keeps raw numbers and marks planned, source and void info", () => {
    const rows = buildHistoryExportRows([
      movement({}),
      movement({ id: "m2", status: "배송 예정", planned: true }),
      movement({ id: "m3", voided_at: "2026-09-22T00:00:00Z", void_reason: "중복 입력", source: "sheet_import", lot_no: null, reference_no: "H8" }),
    ])
    expect(rows[0]).toEqual([...HISTORY_EXPORT_HEADER])
    expect(rows[1][HISTORY_EXPORT_HEADER.indexOf("수량")]).toBe(2)
    expect(rows[1][HISTORY_EXPORT_HEADER.indexOf("금액(USD)")]).toBe(1200.5)
    expect(rows[1][HISTORY_EXPORT_HEADER.indexOf("고객사")]).toBe("남명학원")
    expect(rows[2][HISTORY_EXPORT_HEADER.indexOf("유형")]).toBe("배송 예정")
    const voided = rows[3]
    expect(voided[HISTORY_EXPORT_HEADER.indexOf("원천")]).toBe("시트 이관")
    expect(voided[HISTORY_EXPORT_HEADER.indexOf("물량번호")]).toBe("H8")
    expect(voided[HISTORY_EXPORT_HEADER.indexOf("취소 사유")]).toBe("중복 입력")
  })

  it("escapes commas and neutralizes formula-like memos in CSV", () => {
    const csv = toCsv(buildHistoryExportRows([movement({ memo: "=HYPERLINK(1), 확인" })]))
    expect(csv).toContain(`"'=HYPERLINK(1), 확인"`)
  })
})

describe("buildLotCompositionRows", () => {
  it("round-trips into the inbound sheet paste parser (same products, quantities, prices)", () => {
    const lot = {
      lot: "C2",
      displayLot: "C2",
      date: "2026-09-08",
      importer: "FPL",
      items: [
        movement({ movement_type: "inbound", product_name: '86" IFP', quantity: 10, unit_price: 2500 }),
        movement({ id: "m2", movement_type: "inbound", product_name: '86" IFP', quantity: 5, unit_price: 2500 }),
        movement({ id: "m3", movement_type: "inbound", product_name: "STD1", quantity: 15, unit_price: 155 }),
      ],
    }
    const tsv = toTsv(buildLotCompositionRows(lot))
    const parsed = parseInboundPaste(tsv, ['86" IFP', "STD1"])
    expect(parsed.unmatched).toEqual([])
    expect(parsed.rows.map((row) => [row.productName, row.quantity, row.unitPrice])).toEqual([
      ['86" IFP', 15, 2500],
      ["STD1", 15, 155],
    ])
  })

  it("lists every line of every lot for the CSV", () => {
    const rows = buildInboundLotsExportRows([
      { lot: "C2", displayLot: "C2", date: "2026-09-08", importer: "FPL", items: [movement({ movement_type: "inbound", occurred_at: "2026-09-08" })] },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[1].slice(0, 5)).toEqual(["C2", "2026-09-08", "FPL", "T1", 2])
  })
})

describe("other tables", () => {
  it("planned rows carry elapsed days since the planned date", () => {
    const rows = buildPlannedExportRows([movement({ status: "배송 예정", occurred_at: "2026-09-13" })], "2026-09-23")
    expect(rows[1].slice(0, 3)).toEqual(["2026-09-13", 10, "남명학원"])
  })

  it("stock rows spell out the status and lot balances", () => {
    const row = {
      itemId: "i",
      product: "T1",
      category: "카메라",
      reorderPoint: 2,
      leadTimeDays: 14,
      warehouseStock: 1,
      plannedOut: 0,
      availableStock: 1,
      outbound30d: 3,
      weeklyOutboundAvg: 0,
      trendOrderPoint: 4,
      daysUntilStockout: null,
      low: true,
      orderRecommended: true,
      locationBalances: [],
      lotBalances: [{ lot: "C1", quantity: 1 }],
    } as HardwareStockRow
    expect(buildStockExportRows([row])[1]).toEqual(["T1", "카메라", 1, 0, 1, 3, 4, 2, "부족", "C1 1"])
  })

  it("period rows put the bucket total before its customers", () => {
    const rows = buildOutboundPeriodExportRows([
      { label: "2026-09", total: 5, revenue: 0, hasRevenue: false, customers: [{ name: "남명학원", qty: 5, revenue: 100, hasRevenue: true, dateLabel: "9.20" }] },
    ])
    expect(rows[1]).toEqual(["2026-09", "기간 합계", "", 5, null, ""])
    expect(rows[2]).toEqual(["2026-09", "고객사", "남명학원", 5, 100, "9.20"])
  })

  it("sample rows give the follow-up list: customer, loan date, days out, days to return", () => {
    const unit = {
      id: "u1",
      item_id: "i",
      product_name: "T1",
      asset_code: "S-T1-001",
      serial_no: null,
      status: "loaned",
      current_customer: "남명학원",
      current_owner: null,
      loaned_at: "2026-06-01",
      expected_return_at: "2026-09-20",
      created_by: null,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    } as HardwareSampleUnit
    const rows = buildSampleUnitsExportRows([unit], {}, "2026-09-23")
    expect(rows[1][0]).toBe("S-T1-001")
    expect(rows[1][3]).toBe("남명학원")
    expect(rows[1][6]).toBe("2026-09-20")
    expect(rows[1][7]).toBe(-3)
  })
})
