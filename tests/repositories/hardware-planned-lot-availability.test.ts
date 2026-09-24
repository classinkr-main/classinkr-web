import { afterEach, describe, expect, it, vi } from "vitest"

// 하드웨어 라운드 3 H-3 — 예정 출고 행마다 "그 행을 뺀" lot 잔량(buildPlannedLotAvailability).
// 확정(planConfirmLotAllocations → allocateOutboundLots)은 excludeMovementIds 로 자기 예약을 빼고
// resolveHardwareLotBalances 로 배정한다. 미리보기가 같은 입력·같은 해석기를 쓰는지 여기서 고정한다.

type MovementType = "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"

interface Row {
  id: string
  item_id: string
  movement_type: MovementType
  quantity: number
  status: string | null
  lot_no: string | null
  reference_no: string | null
  source: "admin_manual" | "sheet_import"
  from_location: string | null
  to_location: string | null
  occurred_at: string | null
  created_at: string
}

let seq = 0
function row(movement_type: MovementType, quantity: number, extra: Partial<Row> = {}): Row {
  seq += 1
  return {
    id: `m-${seq}`,
    item_id: "item-t1",
    movement_type,
    quantity,
    status: movement_type === "outbound" ? "설치 완료" : null,
    lot_no: null,
    reference_no: null,
    source: "admin_manual",
    from_location: movement_type === "outbound" ? "창고" : null,
    to_location: movement_type === "inbound" ? "창고" : movement_type === "outbound" ? "고객" : null,
    occurred_at: "2026-09-01",
    created_at: "2026-09-01T00:00:00.000Z",
    ...extra,
  }
}

const planned = (quantity: number, extra: Partial<Row> = {}) => row("outbound", quantity, { status: "배송 예정", ...extra })

async function load() {
  vi.resetModules()
  vi.doMock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    fetchAllSupabaseRows: vi.fn(async () => []),
    listFreshHwInbound: vi.fn(),
    listFreshHwOutbound: vi.fn(),
    listFreshHwStock: vi.fn(),
  }))
  return import("@/lib/repositories/hardware-inventory")
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("buildPlannedLotAvailability", () => {
  it("예정 행은 자기 예약을 뺀 잔량을 본다 — 품목 잔량(모든 예정을 뺀 값)보다 많다", async () => {
    const { buildPlannedLotAvailability, resolveHardwareLotBalances } = await load()
    const inbound = row("inbound", 5, { lot_no: "H8" })
    const mine = planned(3)
    const ledger = [inbound, mine]

    // 품목 잔량은 이 예약까지 뺀 H8 2 — 예전 미리보기는 이걸로 "H8 2대 · 로트 미지정 1대"라고 했다.
    expect(resolveHardwareLotBalances(ledger).lots.map(({ lot, quantity }) => ({ lot, quantity }))).toEqual([{ lot: "H8", quantity: 2 }])
    expect(buildPlannedLotAvailability(ledger)[mine.id]).toEqual({ lots: [{ lot: "H8", quantity: 5 }], tracked: true })
  })

  it("다른 예정 행의 예약은 그대로 뺀다 — 확정도 자기 행만 뺀다", async () => {
    const { buildPlannedLotAvailability } = await load()
    const a = planned(3)
    const b = planned(2)
    const result = buildPlannedLotAvailability([row("inbound", 5, { lot_no: "H8" }), a, b])
    expect(result[a.id].lots).toEqual([{ lot: "H8", quantity: 3 }])
    expect(result[b.id].lots).toEqual([{ lot: "H8", quantity: 2 }])
  })

  it("같은 수량의 로트 없는 예정 행은 결과가 같다(한 번만 계산) — 값은 행마다 맞다", async () => {
    const { buildPlannedLotAvailability } = await load()
    const a = planned(2)
    const b = planned(2)
    const result = buildPlannedLotAvailability([row("inbound", 5, { lot_no: "H8" }), a, b])
    expect(result[a.id].lots).toEqual([{ lot: "H8", quantity: 3 }])
    expect(result[b.id].lots).toEqual([{ lot: "H8", quantity: 3 }])
  })

  it("lot 을 지정한 예정 행도 자기 행만 빼고 계산한다", async () => {
    const { buildPlannedLotAvailability } = await load()
    const lotted = planned(2, { lot_no: "H8" })
    const other = planned(1)
    const result = buildPlannedLotAvailability([row("inbound", 3, { lot_no: "H8" }), lotted, other])
    expect(result[lotted.id].lots).toEqual([{ lot: "H8", quantity: 2 }])
  })

  it("lot 기록이 하나도 없는 품목은 tracked=false", async () => {
    const { buildPlannedLotAvailability } = await load()
    const mine = planned(1, { item_id: "item-ops" })
    const result = buildPlannedLotAvailability([row("inbound", 4, { item_id: "item-ops" }), mine])
    expect(result[mine.id]).toEqual({ lots: [], tracked: false })
  })

  it("예정이 아닌 출고·품목 없는 행은 싣지 않는다", async () => {
    const { buildPlannedLotAvailability } = await load()
    const actual = row("outbound", 1)
    const orphan = planned(1, { item_id: "" })
    const result = buildPlannedLotAvailability([row("inbound", 4, { lot_no: "H8" }), actual, orphan])
    expect(result[actual.id]).toBeUndefined()
    expect(result[orphan.id]).toBeUndefined()
  })

  it("확정 배정 입력과 같다 — 모든 예정 행에서 resolveHardwareLotBalances(원장 − 그 행)과 일치한다", async () => {
    const { buildPlannedLotAvailability, resolveHardwareLotBalances } = await load()
    const ledger = [
      row("inbound", 10, { lot_no: "H5", occurred_at: "2025-08-29" }),
      row("inbound", 19, { reference_no: "H8", source: "sheet_import", occurred_at: "2026-03-19" }),
      row("inbound", 40, { lot_no: "C1", occurred_at: "2026-07-16" }),
      row("outbound", 27, { reference_no: "H8", source: "sheet_import" }),
      row("adjust", 1, { from_location: "창고", to_location: null }),
      planned(4),
      planned(4),
      planned(7, { lot_no: "C1" }),
      planned(3, { reference_no: "HW-2026-09", source: "sheet_import" }),
    ]
    const result = buildPlannedLotAvailability(ledger)
    const plannedRows = ledger.filter((movement) => movement.status === "배송 예정")
    expect(Object.keys(result).sort()).toEqual(plannedRows.map((movement) => movement.id).sort())
    for (const movement of plannedRows) {
      const expected = resolveHardwareLotBalances(ledger.filter((candidate) => candidate.id !== movement.id)).lots.map(
        ({ lot, quantity }) => ({ lot, quantity })
      )
      expect(result[movement.id].lots).toEqual(expected)
    }
  })
})
