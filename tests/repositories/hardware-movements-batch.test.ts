import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 배치 저장(createHardwareMovementsBatch) — 바구니·입고표 한 번 저장이 왕복 한 번으로 끝나는지,
// 그리고 그 결과가 줄 단위 저장(예전 라우트 루프)과 **같은지**를 고정한다.
// 목킹 규약은 tests/repositories/hardware-movement-lifecycle.test.ts와 동일하다
// (vi.doMock + 최소 페이크 Supabase 클라이언트, fetchAllSupabaseRows 는 품목 원장 큐).

interface FakeRow {
  [key: string]: unknown
}

const insertedBatches: FakeRow[][] = []
let itemsByName: Record<string, { id: string }> = {}
// 재고관리 프로세스 — select().in("id", ...) 로 읽는 품목 설정(lot_tracked).
let itemsById: Record<string, FakeRow> = {}
// 품목별 원장 — loadItemLotLedgerRows(fetchAllSupabaseRows) 호출 순서대로 꺼내 쓴다.
let ledgerQueue: FakeRow[][] = []
let ledgerCallCount = 0
// admin_manual CRM 중복 후보 — reference_no in (...) 한 번 읽기.
let crmDuplicateRows: FakeRow[] = []
let crmSelectCount = 0
let insertShouldFail: string | null = null

function movementsTableClient() {
  return {
    insert(payload: FakeRow[]) {
      return {
        async select() {
          if (insertShouldFail) return { data: null, error: { message: insertShouldFail } }
          const rows = payload.map((row, index) => ({ id: `movement-${insertedBatches.length + 1}-${index + 1}`, ...row }))
          insertedBatches.push(rows)
          return { data: rows, error: null }
        },
      }
    },
    select() {
      return {
        eq() {
          return {
            in() {
              return {
                async is() {
                  crmSelectCount += 1
                  return { data: crmDuplicateRows, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

function itemsTableClient() {
  return {
    upsert() {
      return Promise.resolve({ data: null, error: null })
    },
    select() {
      return {
        async in(column: string, names: string[]) {
          if (column === "id") {
            return { data: names.filter((id) => itemsById[id]).map((id) => ({ id, ...itemsById[id] })), error: null }
          }
          return {
            data: names.filter((name) => itemsByName[name]).map((name) => ({ id: itemsByName[name].id, name })),
            error: null,
          }
        },
      }
    },
  }
}

const revalidateTagMock = vi.fn()

async function loadRepository() {
  vi.resetModules()
  const client = {
    from: vi.fn((table: string) => (table === "hardware_items" ? itemsTableClient() : movementsTableClient())),
    rpc: vi.fn(),
  }

  vi.doMock("next/cache", () => ({
    revalidateTag: revalidateTagMock,
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    fetchAllSupabaseRows: vi.fn(async () => {
      const rows = ledgerQueue[ledgerCallCount] ?? []
      ledgerCallCount += 1
      return rows
    }),
    listFreshHwInbound: vi.fn(),
    listFreshHwOutbound: vi.fn(),
    listFreshHwStock: vi.fn(),
  }))

  const repositoryModule = await import("@/lib/repositories/hardware-inventory")
  return { ...repositoryModule, client }
}

function inboundLot(lot: string, quantity: number) {
  return {
    id: `ledger-${lot}-${quantity}`,
    lot_no: lot,
    source: "admin_manual",
    reference_no: null,
    movement_type: "inbound",
    quantity,
    from_location: null,
    to_location: "창고",
    occurred_at: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
  }
}

describe("createHardwareMovementsBatch", () => {
  beforeEach(() => {
    insertedBatches.length = 0
    itemsByName = {}
    itemsById = {}
    ledgerQueue = []
    ledgerCallCount = 0
    crmDuplicateRows = []
    crmSelectCount = 0
    insertShouldFail = null
    revalidateTagMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("saves every line with one INSERT and one cache invalidation", async () => {
    const { createHardwareMovementsBatch } = await loadRepository()

    const results = await createHardwareMovementsBatch([
      { itemId: "item-1", productName: "86 IFP", movementType: "inbound", quantity: 3, lotNo: "C3" },
      { itemId: "item-2", productName: "T1", movementType: "inbound", quantity: 2, lotNo: "C3" },
      { itemId: "item-3", productName: "STD1", movementType: "inbound", quantity: 5, lotNo: "C3" },
    ])

    expect(results.map((result) => result.ok)).toEqual([true, true, true])
    expect(insertedBatches).toHaveLength(1)
    expect(insertedBatches[0]).toHaveLength(3)
    expect(results[0].movements[0]).toMatchObject({ product_name: "86 IFP", quantity: 3, lot_no: "C3" })
    expect(results[2].movements[0]).toMatchObject({ product_name: "STD1", quantity: 5 })
    // 입고는 자동 배정을 타지 않는다 — 원장을 읽지 않는다.
    expect(ledgerCallCount).toBe(0)
    expect(revalidateTagMock).toHaveBeenCalledTimes(1)
  })

  it("reads each item ledger once and lets earlier lines consume lots for later lines", async () => {
    ledgerQueue = [[inboundLot("C1", 5), inboundLot("C2", 5)]]
    const { createHardwareMovementsBatch } = await loadRepository()

    const results = await createHardwareMovementsBatch([
      { itemId: "item-1", productName: "86 IFP", movementType: "outbound", quantity: 7, status: "출고" },
      { itemId: "item-1", productName: "86 IFP", movementType: "outbound", quantity: 2, status: "출고" },
    ])

    expect(results.map((result) => result.ok)).toEqual([true, true])
    // 줄 단위 저장과 같은 결과: 1줄 C1 5 + C2 2, 2줄은 남은 C2 에서 2.
    expect(results[0].movements.map((movement) => [movement.lot_no, movement.quantity])).toEqual([
      ["C1", 5],
      ["C2", 2],
    ])
    expect(results[1].movements.map((movement) => [movement.lot_no, movement.quantity])).toEqual([["C2", 2]])
    // 품목 원장은 한 번만 읽는다(예전에는 줄마다 전량 스캔했다).
    expect(ledgerCallCount).toBe(1)
    expect(insertedBatches).toHaveLength(1)
    expect(insertedBatches[0]).toHaveLength(3)
  })

  it("falls back to an unlotted row when lots run out, like line-by-line saving did", async () => {
    ledgerQueue = [[inboundLot("C1", 2)]]
    const { createHardwareMovementsBatch } = await loadRepository()

    const results = await createHardwareMovementsBatch([
      { itemId: "item-1", productName: "86 IFP", movementType: "outbound", quantity: 3, status: "출고" },
    ])

    expect(results[0].ok).toBe(true)
    expect(results[0].movements.map((movement) => [movement.lot_no, movement.quantity])).toEqual([
      ["C1", 2],
      [null, 1],
    ])
  })

  it("isolates a failed line and still saves the rest in one INSERT", async () => {
    ledgerQueue = [[inboundLot("C1", 1)]]
    const { createHardwareMovementsBatch } = await loadRepository()

    const results = await createHardwareMovementsBatch([
      { itemId: "item-1", productName: "86 IFP", movementType: "outbound", quantity: 5, status: "출고", lotNo: "C1" },
      { itemId: "item-2", productName: "T1", movementType: "inbound", quantity: 2, lotNo: "C3" },
    ])

    expect(results[0].ok).toBe(false)
    expect(results[0].error).toContain("C1 lot 재고가 부족합니다")
    expect(results[1].ok).toBe(true)
    expect(insertedBatches).toHaveLength(1)
    expect(insertedBatches[0]).toHaveLength(1)
    expect(insertedBatches[0][0]).toMatchObject({ product_name: "T1" })
  })

  it("rejects a line whose shape is invalid without creating an item for it", async () => {
    const { createHardwareMovementsBatch } = await loadRepository()

    const results = await createHardwareMovementsBatch([
      { productName: "  ", movementType: "inbound", quantity: 1 },
      { itemId: "item-2", productName: "T1", movementType: "inbound", quantity: 0 },
      { itemId: "item-3", productName: "STD1", movementType: "inbound", quantity: 1 },
    ])

    expect(results[0]).toMatchObject({ ok: false, error: "제품명은 필수입니다." })
    expect(results[1]).toMatchObject({ ok: false, error: "수량은 1 이상 정수여야 합니다." })
    expect(results[2].ok).toBe(true)
    expect(insertedBatches[0]).toHaveLength(1)
  })

  it("catches a duplicate CRM order inside the same batch with one lookup", async () => {
    const { createHardwareMovementsBatch } = await loadRepository()

    const results = await createHardwareMovementsBatch([
      { itemId: "item-1", productName: "86 IFP", movementType: "outbound", quantity: 1, status: "출고", referenceNo: "deal:42" },
      { itemId: "item-1", productName: "86 IFP", movementType: "outbound", quantity: 1, status: "출고", referenceNo: "deal:42" },
    ])

    expect(results[0].ok).toBe(true)
    expect(results[1]).toMatchObject({ ok: false, error: "이미 같은 CRM 오더가 실제 출고로 반영되어 있습니다." })
    // 참조번호는 한 번에 읽는다(줄마다 왕복하지 않는다).
    expect(crmSelectCount).toBe(1)
  })

  it("keeps partial saving when the single INSERT fails", async () => {
    insertShouldFail = "bulk insert rejected"
    const { createHardwareMovementsBatch } = await loadRepository()

    const results = await createHardwareMovementsBatch([
      { itemId: "item-1", productName: "86 IFP", movementType: "inbound", quantity: 1, lotNo: "C3" },
    ])

    expect(results[0]).toMatchObject({ ok: false })
    expect(results[0].error).toContain("bulk insert rejected")
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  // 재고관리 프로세스(갭 문서 §6 D3·D6) — 고객사 직배송: 같은 저장에서 새 물류번호로 입고하고 바로 출고한다.
  // 뒤 줄(출고)의 잔여 검사는 앞 줄(입고)을 센다. FIFO 자동 배정 없이 고른 번호만 쓴다.
  describe("재고관리 프로세스 — 요청자 규칙", () => {
    const MANAGER = { userId: "u-boss", name: "이왕찬", isInventoryManager: true }
    const directShip = (outboundQty: number) => [
      { itemId: "item-t1", productName: "T1", movementType: "inbound" as const, quantity: 2, lotNo: "c3", isFree: false, toLocation: "고객사 직송" },
      {
        itemId: "item-t1",
        productName: "T1",
        movementType: "outbound" as const,
        quantity: outboundQty,
        lotNo: "C3",
        fromLocation: "고객사 직송",
        toLocation: "대치학원",
        occurredAt: "2026-10-28",
        outboundType: "sales" as const,
        status: "설치 완료",
      },
    ]

    it("새 물류번호 입고 뒤 같은 번호 출고를 한 번에 저장하고 새 칸을 싣는다", async () => {
      itemsById = { "item-t1": { name: "T1", lot_tracked: true } }
      ledgerQueue = [[inboundLot("C1", 5), inboundLot("C2", 5)], []] // ① 기존 물류번호 ② T1 원장
      const { createHardwareMovementsBatch } = await loadRepository()

      const results = await createHardwareMovementsBatch(directShip(2), { actor: MANAGER })

      expect(results.map((result) => result.ok)).toEqual([true, true])
      const [inbound, outbound] = insertedBatches[0]
      expect(inbound).toMatchObject({ lot_no: "C3", is_free: false, created_by_user_id: "u-boss" })
      expect(outbound).toMatchObject({
        lot_no: "C3",
        outbound_type: "sales",
        owner_user_id: "u-boss",
        owner: "이왕찬",
        status: "설치 완료",
      })
      expect(outbound).not.toHaveProperty("raw.autoLot")
    })

    it("고른 물류번호 잔여를 넘는 출고 줄만 실패한다", async () => {
      itemsById = { "item-t1": { name: "T1", lot_tracked: true } }
      ledgerQueue = [[inboundLot("C1", 5), inboundLot("C2", 5)], []]
      const { createHardwareMovementsBatch } = await loadRepository()

      const results = await createHardwareMovementsBatch(directShip(3), { actor: MANAGER })

      expect(results[0].ok).toBe(true)
      expect(results[1]).toMatchObject({ ok: false, error: expect.stringContaining("C3 잔여는 2대") })
    })

    it("새 물류번호를 건너뛰면 그 입고 줄이 실패한다", async () => {
      itemsById = { "item-t1": { name: "T1", lot_tracked: true } }
      ledgerQueue = [[inboundLot("C1", 5)]]
      const { createHardwareMovementsBatch } = await loadRepository()

      const results = await createHardwareMovementsBatch(
        [{ itemId: "item-t1", productName: "T1", movementType: "inbound", quantity: 1, lotNo: "C4", isFree: true }],
        { actor: MANAGER }
      )

      expect(results[0]).toMatchObject({ ok: false, error: expect.stringContaining("C2 차례") })
      expect(insertedBatches).toHaveLength(0)
    })
  })
})
