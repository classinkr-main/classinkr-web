import { describe, expect, it } from "vitest"

import {
  QUICK_CART_DRAFT_KEY,
  QUICK_CART_DRAFT_VERSION,
  readStoredQuickCartDrafts,
  writeStoredDraft,
} from "@/components/admin/hardware/inventory/draft-storage"
import {
  customerFromDestination,
  matchStockRowByText,
  parseHardwareLineText,
  pickLatestManualOutbound,
} from "@/components/admin/hardware/inventory/quick-record-model"
import type { HardwareMovement, HardwareStockRow } from "@/components/admin/hardware/inventory/shared"

// 하드웨어 라운드 2 — 빠른 기록 시트의 순수 로직(Q-3·Q-7·Q-8·Q-9·Q-25·Q-1).

function stockRow(itemId: string, product: string): HardwareStockRow {
  return {
    itemId,
    product,
    category: null,
    reorderPoint: 0,
    leadTimeDays: 0,
    warehouseStock: 0,
    plannedOut: 0,
    availableStock: 0,
    outbound30d: 0,
    weeklyOutboundAvg: 0,
    trendOrderPoint: 0,
    daysUntilStockout: null,
    low: false,
    orderRecommended: false,
    locationBalances: [],
    lotBalances: [],
  } as unknown as HardwareStockRow
}

function movement(overrides: Partial<HardwareMovement>): HardwareMovement {
  return {
    id: "m",
    item_id: "item",
    product_name: "T1",
    movement_type: "outbound",
    quantity: 1,
    occurred_at: "2026-09-22",
    from_location: "창고",
    to_location: "남명학원",
    owner: null,
    status: "출고",
    reference_no: null,
    memo: null,
    serials: [],
    lot_no: null,
    source: "admin_manual",
    created_at: "2026-09-22T01:00:00.000Z",
    voided_at: null,
    ...overrides,
  } as HardwareMovement
}

describe("parseHardwareLineText", () => {
  it("reads x/×/* counts, 대·개·ea suffixes and trailing comma/tab cells", () => {
    expect(parseHardwareLineText("T1 x2")).toMatchObject({ productText: "T1", quantity: 2, quantityGuessed: false })
    expect(parseHardwareLineText("86\" IFP ×3")).toMatchObject({ productText: "86\" IFP", quantity: 3 })
    expect(parseHardwareLineText("STD1 * 4")).toMatchObject({ productText: "STD1", quantity: 4 })
    expect(parseHardwareLineText("T1 2대")).toMatchObject({ productText: "T1", quantity: 2 })
    expect(parseHardwareLineText("케이블\t5")).toMatchObject({ productText: "케이블", quantity: 5 })
  })

  it("folds full-width digits and keeps thousands together", () => {
    expect(parseHardwareLineText("T1 ２대")).toMatchObject({ quantity: 2 })
    expect(parseHardwareLineText("브라켓, 1,200")).toMatchObject({ productText: "브라켓", quantity: 1200 })
  })

  it("marks a line whose quantity could not be read as guessed (1)", () => {
    expect(parseHardwareLineText("86 IFP")).toMatchObject({ productText: "86 IFP", quantity: 1, quantityGuessed: true })
    expect(parseHardwareLineText("   ")).toBeNull()
  })
})

describe("matchStockRowByText", () => {
  const stock = [stockRow("dt1", "DT1"), stockRow("t1", "T1"), stockRow("ifp86", "86\" IFP")]
  const items = [
    { id: "dt1", source_aliases: ["DT1"] },
    { id: "t1", source_aliases: ["T1", "클래스인 T1"] },
    { id: "ifp86", source_aliases: ["86 IFP", "86인치 전자칠판"] },
  ]

  it("prefers an exact match over an earlier partial match (T1 is not DT1)", () => {
    expect(matchStockRowByText(stock, items, "T1")?.itemId).toBe("t1")
  })

  it("matches aliases exactly", () => {
    expect(matchStockRowByText(stock, items, "클래스인 T1")?.itemId).toBe("t1")
  })

  it("allows partial matches only for four or more characters", () => {
    expect(matchStockRowByText(stock, items, "86인치 전자칠판 설치")?.itemId).toBe("ifp86")
    expect(matchStockRowByText(stock, items, "T")).toBeNull()
  })
})

describe("pickLatestManualOutbound", () => {
  it("breaks same-day ties by creation time (latest created wins)", () => {
    const older = movement({ id: "older", created_at: "2026-09-22T01:00:00.000Z" })
    const newer = movement({ id: "newer", created_at: "2026-09-22T05:00:00.000Z" })
    // 서버 순서(생성 내림차순) 그대로 — 예전 >= 비교는 배열 뒤쪽(가장 오래된 것)이 이겼다.
    expect(pickLatestManualOutbound([newer, older])?.id).toBe("newer")
  })

  it("only duplicates admin outbound records — inbound goes through the inbound sheet", () => {
    const inbound = movement({ id: "in", movement_type: "inbound", occurred_at: "2026-09-23", created_at: "2026-09-23T01:00:00.000Z" })
    const sheet = movement({ id: "sheet", source: "sheet_import", occurred_at: "2026-09-23" })
    const out = movement({ id: "out" })
    expect(pickLatestManualOutbound([inbound, sheet, out])?.id).toBe("out")
    expect(pickLatestManualOutbound([inbound])).toBeNull()
  })
})

describe("customerFromDestination", () => {
  const presets = new Set(["", "창고", "샘플", "사무실", "고객"])
  it("carries a typed customer but not a preset location", () => {
    expect(customerFromDestination(" 남명학원 ", presets)).toBe("남명학원")
    expect(customerFromDestination("샘플", presets)).toBe("")
  })
})

describe("readStoredQuickCartDrafts — restored lines are safe to render and save", () => {
  function storageWith(value: unknown) {
    const map = new Map<string, string>()
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, v: string) => void map.set(key, v),
      removeItem: (key: string) => void map.delete(key),
    }
    writeStoredDraft(QUICK_CART_DRAFT_KEY, QUICK_CART_DRAFT_VERSION, value, { storage, now: 1_000 })
    return storage
  }

  it("fills missing string fields and drops non-integer quantities and unknown types", () => {
    const storage = storageWith([
      { productName: "T1", movementType: "outbound", quantity: 2, serials: [] },
      { productName: "T1", movementType: "outbound", quantity: 1.5, serials: [] },
      { productName: "T1", movementType: "teleport", quantity: 1, serials: [] },
    ])
    const restored = readStoredQuickCartDrafts({ storage, now: 2_000 })
    expect(restored).toHaveLength(1)
    expect(restored[0].toLocation).toBe("")
    expect(restored[0].lotNo).toBe("")
  })
})
