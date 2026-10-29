import { describe, expect, it } from "vitest"

import { parseInboundPaste, parseInboundPrice, parseInboundQuantity } from "@/components/admin/hardware/inventory/inbound-sheet-model"
import { compareInboundLotGroups, sortLotsByRecency } from "@/components/admin/hardware/inventory/lot-order"
import { describeReturnDue } from "@/components/admin/hardware/inventory/SampleTrackerSection"
import { historyDateRange } from "@/components/admin/hardware/inventory/shared"

// 하드웨어 라운드 2 — 정합 항목 회귀(E-1 lot 정렬, I-4·I-9·I-13 입고 숫자·붙여넣기, L-15 이번 달, P-12 회수 예정).

describe("compareInboundLotGroups (E-1)", () => {
  it("puts the most recent inbound lot first, so C3 is not buried under H8", () => {
    const groups = [
      { lot: "H8", date: "2025-11-02" },
      { lot: "C2", date: "2026-09-08" },
      { lot: "H7", date: "2025-08-10" },
      { lot: "C3", date: "2026-09-23" },
      { lot: "FY24-25", date: "-" },
    ]
    expect(groups.slice().sort(compareInboundLotGroups).map((group) => group.lot)).toEqual(["C3", "C2", "H8", "H7", "FY24-25"])
  })

  it("breaks same-day ties by H number, then label", () => {
    const groups = [
      { lot: "H6", date: "2025-01-01" },
      { lot: "H8", date: "2025-01-01" },
      { lot: "Sample", date: "2025-01-01" },
    ]
    expect(groups.slice().sort(compareInboundLotGroups).map((group) => group.lot)).toEqual(["H8", "H6", "Sample"])
  })

  it("sorts a lot dropdown by the latest movement date", () => {
    const lastDate = new Map([
      ["H8", "2026-01-01"],
      ["C1", "2026-09-20"],
    ])
    expect(sortLotsByRecency(lastDate.keys(), lastDate)).toEqual(["C1", "H8"])
  })
})

describe("inbound numbers and paste (I-4·I-9·I-13)", () => {
  it("accepts full-width digits and a unit suffix typed into the quantity cell", () => {
    expect(parseInboundQuantity("４０")).toBe(40)
    expect(parseInboundQuantity("40대")).toBe(40)
    expect(parseInboundQuantity("1,200")).toBe(1200)
    expect(parseInboundPrice("２，５００")).toBe(2500)
  })

  it("reads comma-space separated lines with thousands (86\" IFP, 1,200, 2,500)", () => {
    const { rows } = parseInboundPaste('86" IFP, 1,200, 2,500', ['86" IFP'])
    expect(rows[0]).toMatchObject({ productName: '86" IFP', quantity: 1200, unitPrice: 2500 })
  })

  it("flags a price cell it could not read instead of silently using the last price", () => {
    const { rows } = parseInboundPaste('86" IFP\t40\t2500원', ['86" IFP'])
    expect(rows[0]).toMatchObject({ quantity: 40, unitPrice: null, priceUnreadable: true, priceText: "2500원" })
    const clean = parseInboundPaste('86" IFP\t40\t2500', ['86" IFP']).rows[0]
    expect(clean.priceUnreadable).toBeUndefined()
  })
})

describe("historyDateRange thisMonth (L-15)", () => {
  it("ends on the last day of the month so later planned dates this month are included", () => {
    const { from, to } = historyDateRange("thisMonth")
    const now = new Date()
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    expect(from.endsWith("-01")).toBe(true)
    expect(to).toBe(
      `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`
    )
  })
})

describe("describeReturnDue (P-12)", () => {
  it("says D-n, today or overdue by local date", () => {
    expect(describeReturnDue("2026-09-26", "2026-09-23")).toBe("회수 D-3")
    expect(describeReturnDue("2026-09-23", "2026-09-23")).toBe("회수 오늘")
    expect(describeReturnDue("2026-09-18T00:00:00Z", "2026-09-23")).toBe("회수 5일 지남")
  })
})
