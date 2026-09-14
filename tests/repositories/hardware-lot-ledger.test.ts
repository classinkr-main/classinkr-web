import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

// 로트 잔량 정본 해석기(resolveHardwareLotBalances) 계약.
//
// 2026-09-14 운영 실측: 화면이 실물에 없는 옛 로트를 재고로 보여줬다(STD1 H4 1·H5 10·H6 3,
// T1 H6 6). 실제 재고는 전부 H8·C1 물량이다(운영자 확인). 원인은 시트 원장의 두 기록 습관 —
// ① 로트를 넘는 출고(STD1 은 H8 입고 19 에 H8 출고 27 → H8 −8, 음수는 숨겨졌다),
// ② 로트 없는 출고·보정 — 이다. 같은 잘못된 잔량을 새 출고 자동 배정도 써서, 그대로 두면
// STD1 5대 출고에 H4 1·H5 4 가 찍혔다.

type MovementType = "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"

interface Fixture {
  id: string
  item_id: string
  product_name: string
  movement_type: MovementType
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  owner: string | null
  status: string | null
  reference_no: string | null
  memo: string | null
  serials: string[]
  lot_no: string | null
  unit_price: number | null
  amount_usd: number | null
  amount_cny: number | null
  storage_location: string | null
  importer: string | null
  source: "admin_manual" | "sheet_import"
  raw: unknown
  created_at: string
  voided_at: string | null
  converted_from_movement_id: string | null
  converted_to_movement_id: string | null
}

let seq = 0
/** 운영 원장과 같은 모양 — 시트 임포트, lot_no 는 비고 로트는 reference_no(물류No)에 있다. */
function sheet(
  movement_type: MovementType,
  quantity: number,
  lot: string | null,
  extra: Partial<Fixture> = {}
): Fixture {
  seq += 1
  return {
    id: `m-${seq}`,
    item_id: "item-std1",
    product_name: "STD1",
    movement_type,
    quantity,
    occurred_at: "2026-01-01",
    from_location: movement_type === "outbound" ? "창고" : null,
    to_location: movement_type === "inbound" ? "창고" : movement_type === "outbound" ? "고객" : null,
    owner: null,
    status: movement_type === "outbound" ? "설치 완료" : null,
    reference_no: lot,
    memo: null,
    serials: [],
    lot_no: null,
    unit_price: null,
    amount_usd: null,
    amount_cny: null,
    storage_location: null,
    importer: null,
    source: "sheet_import",
    raw: {},
    created_at: "2026-08-08T05:39:30.896Z",
    voided_at: null,
    converted_from_movement_id: null,
    converted_to_movement_id: null,
    ...extra,
  }
}

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

const summary = (lots: Array<{ lot: string; quantity: number }>) => lots.map((l) => `${l.lot}=${l.quantity}`)

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("resolveHardwareLotBalances — 해석 규칙", () => {
  it("로트를 넘는 출고는 가장 오래된 양수 로트부터 흡수한다", async () => {
    const { resolveHardwareLotBalances } = await load()
    const result = resolveHardwareLotBalances([
      sheet("inbound", 10, "H5", { occurred_at: "2025-08-29" }),
      sheet("inbound", 19, "H8", { occurred_at: "2026-03-19" }),
      sheet("outbound", 27, "H8"), // H8 −8 → 그 8대는 실제로 H5 에서 나갔다
    ])
    expect(summary(result.lots)).toEqual(["H5=2"])
    expect(result.unabsorbedOverdraw).toBe(0)
  })

  it("로트 없는 출고는 FIFO 로 차감한다 — 새 출고 자동 배정과 같은 규약", async () => {
    const { resolveHardwareLotBalances } = await load()
    const result = resolveHardwareLotBalances([
      sheet("inbound", 3, "H6", { occurred_at: "2025-11-03" }),
      sheet("inbound", 40, "C1", { occurred_at: "2026-07-16" }),
      sheet("outbound", 5, null, { status: "배송 예정" }),
    ])
    expect(summary(result.lots)).toEqual(["C1=38"])
  })

  it("로트 없는 음수 보정도 FIFO 로 차감하고, 양수 보정은 로트에 넣지 않는다", async () => {
    const { resolveHardwareLotBalances } = await load()
    const result = resolveHardwareLotBalances([
      sheet("inbound", 19, "H8"),
      sheet("adjust", 1, null, { from_location: "창고", to_location: null }),
      sheet("adjust", 6, null, { from_location: null, to_location: "창고" }),
    ])
    // 보정+6 은 어느 로트인지 알 수 없어 귀속시키지 않는다(로트 미기록분).
    expect(summary(result.lots)).toEqual(["H8=18"])
  })

  it("FIFO 순서는 FY < H숫자 < 그 밖(처음 본 날짜순)이다", async () => {
    const { resolveHardwareLotBalances } = await load()
    const result = resolveHardwareLotBalances([
      sheet("inbound", 5, "C1", { occurred_at: "2026-07-16" }),
      sheet("inbound", 5, "Sample", { occurred_at: "2026-02-01" }),
      sheet("inbound", 5, "H8", { occurred_at: "2026-03-19" }),
      sheet("inbound", 5, "FY24-25", { occurred_at: "2024-04-01" }),
      sheet("inbound", 5, "H3", { occurred_at: "2025-06-11" }),
    ])
    expect(result.lots.map((l) => l.lot)).toEqual(["FY24-25", "H3", "H8", "Sample", "C1"])
  })

  it("흡수할 로트가 없으면 초과분을 원장 점검 신호로 돌려준다", async () => {
    const { resolveHardwareLotBalances } = await load()
    const result = resolveHardwareLotBalances([
      sheet("outbound", 10, "H5"),
      sheet("outbound", 3, "H6"),
      sheet("outbound", 4, null),
    ])
    expect(result.lots).toEqual([])
    expect(result.unabsorbedOverdraw).toBe(13)
    expect(result.unattributedReduction).toBe(4)
  })

  it("이동·수리는 로트를 바꾸지 않는다", async () => {
    const { resolveHardwareLotBalances } = await load()
    const result = resolveHardwareLotBalances([
      sheet("inbound", 5, "C1"),
      sheet("transfer", 2, "C1", { from_location: "창고", to_location: "사무실" }),
      sheet("repair", 1, "C1", { from_location: "창고", to_location: "수리" }),
    ])
    expect(summary(result.lots)).toEqual(["C1=5"])
  })

  it("입력 순서와 무관하게 같은 결과를 낸다 — 시트 원장은 출고일이 입고일보다 앞서는 행이 흔하다", async () => {
    const { resolveHardwareLotBalances } = await load()
    const rows = [
      sheet("outbound", 4, "H6", { occurred_at: "2025-10-02" }),
      sheet("inbound", 20, "H6", { occurred_at: "2025-11-03" }),
      sheet("inbound", 40, "C1", { occurred_at: "2026-07-16" }),
      sheet("outbound", 18, null, { status: "배송 예정" }),
    ]
    const forward = summary(resolveHardwareLotBalances(rows).lots)
    const reversed = summary(resolveHardwareLotBalances([...rows].reverse()).lots)
    expect(forward).toEqual(reversed)
  })
})

describe("운영 회귀 — STD1 원장(2026-09-14 실측 압축)", () => {
  // 운영 원장의 로트별 합계를 그대로 재현한다: FY 0 · H3 0 · H4 1 · H5 10 · H6 3 · H8 −9 · C1 30,
  // 그리고 로트 없는 배송 예정 출고 16대.
  const std1 = () => [
    sheet("inbound", 31, "FY24-25", { occurred_at: "2026-08-08" }),
    sheet("outbound", 31, "FY24-25", { occurred_at: "2024-04-01" }),
    sheet("inbound", 20, "H3", { occurred_at: "2025-06-11" }),
    sheet("outbound", 20, "H3"),
    sheet("inbound", 20, "H4", { occurred_at: "2025-07-18" }),
    sheet("outbound", 19, "H4"),
    sheet("inbound", 10, "H5", { occurred_at: "2025-08-29" }),
    sheet("inbound", 20, "H6", { occurred_at: "2025-11-03" }),
    sheet("outbound", 17, "H6"),
    sheet("inbound", 19, "H8", { occurred_at: "2026-03-19" }),
    sheet("outbound", 28, "H8"),
    sheet("inbound", 40, "C1", { occurred_at: "2026-07-16" }),
    sheet("outbound", 10, "C1"),
    sheet("outbound", 16, null, { status: "배송 예정" }),
  ]

  it("H8 이전 로트가 남지 않는다 — 운영자 확인: 현재 재고는 H8·C1 물량뿐", async () => {
    const { resolveHardwareLotBalances } = await load()
    const lots = resolveHardwareLotBalances(std1()).lots
    const beforeH8 = lots.filter((l) => /^(FY|H[1-7]\b|H[1-7]\()/i.test(l.lot))
    expect(beforeH8).toEqual([])
    expect(summary(lots)).toEqual(["C1=19"])
  })

  it("화면 표시(computeHardwareStockRow)가 같은 해석 결과를 쓴다", async () => {
    const { computeHardwareStockRow, resolveHardwareLotBalances } = await load()
    const row = computeHardwareStockRow({
      item: { id: "item-std1", name: "STD1", category: "스탠드", reorder_point: 2, lead_time_days: 14 },
      itemMovements: std1(),
      cutoff30dMs: 0,
    })
    const resolved = resolveHardwareLotBalances(std1()).lots.map(({ lot, quantity }) => ({ lot, quantity }))
    expect([...row.lotBalances].sort((a, b) => a.lot.localeCompare(b.lot))).toEqual(
      [...resolved].sort((a, b) => a.lot.localeCompare(b.lot))
    )
  })
})

describe("새 출고 자동 배정이 같은 해석기를 쓴다", () => {
  const source = readFileSync(join(process.cwd(), "lib/repositories/hardware-inventory.ts"), "utf8")
  const allocate = source.slice(source.indexOf("async function allocateOutboundLots"))
  const allocateBody = allocate.slice(0, allocate.indexOf("\nasync function buildMovementInsertRows"))

  it("resolveHardwareLotBalances 로 잔량을 낸다", () => {
    expect(allocateBody).toContain("resolveHardwareLotBalances(")
  })

  it("자체 로트 합산을 되살리지 않는다 — 두 번째 모델이 생기면 화면과 찍히는 로트가 갈라진다", () => {
    expect(allocateBody).not.toContain("new Map<string, { lotNo: string")
    expect(allocateBody).not.toContain("movementLotKey(")
  })
})
