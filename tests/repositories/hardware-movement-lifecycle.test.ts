import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 감사(2026-09-07 #2): confirmPlannedHardwareMovement·voidHardwareMovement·updateHardwareMovement는
// 재고를 실제로 움직이는(확정·취소·수정) 세 함수인데 단위 테스트가 0건이었다. 이 파일이 그 공백을
// 메운다 — 기존 tests/api/admin-hardware-movements.test.ts는 POST(생성) 라인 결과만 다루고,
// tests/repositories/hardware-inventory.test.ts는 importHardwareFromBranchSheets·isDormantStockRow만 본다.
//
// 목킹 규약은 tests/repositories/hardware-inventory.test.ts와 동일(vi.doMock + operations 기록) —
// 세 함수가 공유하는 select().eq().maybeSingle() / update().eq().select().single() / rpc() 체인만
// 지원하는 최소 페이크 Supabase 클라이언트를 쓴다.

type Operation = {
  table?: string
  method: string
  payload?: unknown
  fn?: string
  args?: Record<string, unknown>
}

interface FakeResult {
  data: unknown
  error: unknown
}

const operations: Operation[] = []

// 목킹 상태 — 각 테스트가 필요한 것만 채운다.
let existingRow: FakeResult = { data: null, error: null }
let updateRow: FakeResult = { data: null, error: null }
// rpc는 함수명별 큐 — confirm_hardware_planned_movement_v2가 실패하면 레거시로 폴백하는
// 시나리오를 재현하려면 같은 함수명이라도 호출 순서대로 다른 응답을 내려줘야 한다.
let rpcQueue: Record<string, FakeResult[]> = {}
// ensureHardwareItems(품목 미지정 수정 경로)가 참조하는 hardware_items.select().in() 응답.
let itemsByName: Record<string, { id: string }> = {}
// 재고관리 프로세스 — hardware_items.select().in("id", ...) 로 읽는 품목 설정(lot_tracked 등).
let itemsById: Record<string, Record<string, unknown>> = {}
// allocateOutboundLots 가 fetchAllSupabaseRows 로 읽는 품목 원장 — 확정 전 로트 배정 계산에 쓰인다.
let ledgerRows: Array<Record<string, unknown>> = []

function tableClient(table: string) {
  return {
    select() {
      return {
        eq() {
          return {
            async maybeSingle() {
              operations.push({ table, method: "select.eq.maybeSingle" })
              return existingRow
            },
          }
        },
        async in(col: string, names: string[]) {
          operations.push({ table, method: "select.in", payload: names })
          if (col === "id") {
            return { data: names.filter((id) => itemsById[id]).map((id) => ({ id, ...itemsById[id] })), error: null }
          }
          return {
            data: names
              .filter((name) => itemsByName[name])
              .map((name) => ({ id: itemsByName[name].id, name })),
            error: null,
          }
        },
      }
    },
    update(payload: Record<string, unknown>) {
      operations.push({ table, method: "update", payload })
      return {
        eq() {
          return {
            select() {
              return {
                async single() {
                  return updateRow
                },
              }
            },
          }
        },
      }
    },
    upsert(payload: unknown) {
      operations.push({ table, method: "upsert", payload })
      return Promise.resolve({ data: null, error: null })
    },
  }
}

const MISSING_V4: FakeResult = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function public.confirm_hardware_planned_movement_v4" },
}

/** v4 폴백 호출은 빼고 본 rpc 기록. */
function rpcOps() {
  return operations.filter((op) => op.method === "rpc" && !(op.fn === "confirm_hardware_planned_movement_v4" && rpcQueue.confirm_hardware_planned_movement_v4?.[0] === MISSING_V4))
}

function supabaseClient() {
  return {
    from: vi.fn((table: string) => tableClient(table)),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      operations.push({ method: "rpc", fn, args })
      const queue = rpcQueue[fn]
      if (!queue || queue.length === 0) {
        throw new Error(`unexpected rpc call in test: ${fn}`)
      }
      return queue.length > 1 ? queue.shift()! : queue[0]
    }),
  }
}

const revalidateTagMock = vi.fn()

async function loadRepository() {
  vi.resetModules()
  const client = supabaseClient()

  vi.doMock("next/cache", () => ({
    revalidateTag: revalidateTagMock,
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    fetchAllSupabaseRows: vi.fn(async () => ledgerRows),
    listFreshHwInbound: vi.fn(),
    listFreshHwOutbound: vi.fn(),
    listFreshHwStock: vi.fn(),
  }))

  const repositoryModule = await import("@/lib/repositories/hardware-inventory")
  return { ...repositoryModule, client }
}

beforeEach(() => {
  operations.length = 0
  existingRow = { data: null, error: null }
  updateRow = { data: null, error: null }
  // 확정 v4(20261028)가 없는 DB 를 기본으로 둔다 — 기존 시나리오는 v3 이하 경로를 그대로 검증한다.
  rpcQueue = { confirm_hardware_planned_movement_v4: [MISSING_V4] }
  itemsByName = {}
  itemsById = {}
  ledgerRows = []
  revalidateTagMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

/** 확정 대상 예정 행 — 운영 원장처럼 lot_no 가 비어 있다. */
const PLANNED_ROW = {
  id: "m1",
  item_id: "item-std1",
  product_name: "STD1",
  quantity: 5,
  lot_no: null,
  movement_type: "outbound",
  status: "배송 예정",
  voided_at: null,
}

/** 운영 원장과 같은 모양의 시트 임포트 행 — 로트는 reference_no 에만 있다. */
function ledger(movement_type: string, quantity: number, lot: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: `L-${movement_type}-${lot ?? "none"}-${quantity}-${Math.random().toString(36).slice(2, 6)}`,
    item_id: "item-std1",
    product_name: "STD1",
    movement_type,
    quantity,
    lot_no: null,
    reference_no: lot,
    source: "sheet_import",
    from_location: movement_type === "outbound" ? "창고" : null,
    to_location: movement_type === "inbound" ? "창고" : null,
    status: null,
    occurred_at: "2026-07-16",
    created_at: "2026-08-08T05:39:30.896Z",
    voided_at: null,
    ...extra,
  }
}

describe("confirmPlannedHardwareMovement", () => {
  it("로트 배정을 앱에서 계산해 v3 RPC 로 넘기고 캐시 태그를 무효화한다", async () => {
    existingRow = { data: PLANNED_ROW, error: null }
    ledgerRows = [ledger("inbound", 40, "C1"), ledger("outbound", 10, "C1")]
    rpcQueue.confirm_hardware_planned_movement_v3 = [{ data: { id: "out-1", quantity: 2 }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    const result = await confirmPlannedHardwareMovement("m1", {
      occurredAt: "2026-09-01",
      actor: "admin@example.com",
      confirmQty: 2,
    })

    expect(result).toMatchObject({ id: "out-1", quantity: 2 })
    const rpcCalls = rpcOps()
    expect(rpcCalls.map((op) => op.fn)).toEqual(["confirm_hardware_planned_movement_v3"])
    expect(rpcCalls[0].args).toEqual({
      planned_id: "m1",
      actor: "admin@example.com",
      occurred_on: "2026-09-01",
      confirm_qty: 2,
      lot_allocations: [{ lot_no: "C1", quantity: 2 }],
    })
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
  })

  it("로트가 모자라면 막지 않고 나머지를 로트 미지정으로 넘긴다 (운영자 결정 2026-09-14)", async () => {
    existingRow = { data: PLANNED_ROW, error: null }
    ledgerRows = [ledger("inbound", 3, "C1")]
    rpcQueue.confirm_hardware_planned_movement_v3 = [{ data: { id: "out-1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", {})

    const v3 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v3")
    expect(v3?.args?.lot_allocations).toEqual([
      { lot_no: "C1", quantity: 3 },
      { lot_no: null, quantity: 2 },
    ])
  })

  it("로트 기록이 전혀 없는 품목도 전량을 로트 미지정으로 확정한다", async () => {
    existingRow = { data: { ...PLANNED_ROW, product_name: "OPS", quantity: 4 }, error: null }
    ledgerRows = []
    rpcQueue.confirm_hardware_planned_movement_v3 = [{ data: { id: "out-1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", {})

    const v3 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v3")
    expect(v3?.args?.lot_allocations).toEqual([{ lot_no: null, quantity: 4 }])
  })

  it("확정되는 예정 행 자신은 로트 잔량 계산에서 뺀다", async () => {
    // 로트 없는 예정 출고 5대는 해석기에서 C1 을 FIFO 로 예약한다. 자기 자신을 빼지 않으면
    // 자기가 잡아 둔 C1 을 자기가 못 써 전량이 로트 미지정으로 떨어진다.
    existingRow = { data: PLANNED_ROW, error: null }
    ledgerRows = [ledger("inbound", 5, "C1"), { ...ledger("outbound", 5, null, { status: "배송 예정" }), id: "m1" }]
    rpcQueue.confirm_hardware_planned_movement_v3 = [{ data: { id: "out-1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", {})

    const v3 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v3")
    expect(v3?.args?.lot_allocations).toEqual([{ lot_no: "C1", quantity: 5 }])
  })

  it("실물에 없는 옛 로트를 배정하지 않는다 — 초과 출고를 옛 로트가 흡수한다", async () => {
    existingRow = { data: PLANNED_ROW, error: null }
    ledgerRows = [
      ledger("inbound", 10, "H5", { occurred_at: "2025-08-29" }),
      ledger("inbound", 19, "H8", { occurred_at: "2026-03-19" }),
      ledger("outbound", 29, "H8"),
      ledger("inbound", 40, "C1"),
    ]
    rpcQueue.confirm_hardware_planned_movement_v3 = [{ data: { id: "out-1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", {})

    const v3 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v3")
    expect(v3?.args?.lot_allocations).toEqual([{ lot_no: "C1", quantity: 5 }])
  })

  it("예정 행이 없으면 빈 배정으로 v3 에 넘겨 표준 오류 문구로 거절받는다", async () => {
    existingRow = { data: null, error: null }
    rpcQueue.confirm_hardware_planned_movement_v3 = [
      { data: null, error: { code: "P0001", message: "배송 예정 기록을 찾을 수 없습니다." } },
    ]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(confirmPlannedHardwareMovement("missing", {})).rejects.toMatchObject({
      message: "배송 예정 기록을 찾을 수 없습니다.",
    })
    const v3 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v3")
    expect(v3?.args?.lot_allocations).toEqual([])
    // 진짜 오류는 v2 로 폴백하지 않는다.
    expect(rpcOps()).toHaveLength(1)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it("v3 가 아직 없으면(마이그레이션 미적용) v2 로 폴백한다", async () => {
    existingRow = { data: PLANNED_ROW, error: null }
    rpcQueue.confirm_hardware_planned_movement_v3 = [
      { data: null, error: { code: "PGRST202", message: "function not found" } },
    ]
    rpcQueue.confirm_hardware_planned_movement_v2 = [{ data: { id: "m1", quantity: 2 }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    const result = await confirmPlannedHardwareMovement("m1", { actor: "admin" })

    expect(result).toMatchObject({ id: "m1", quantity: 2 })
    expect(rpcOps().map((op) => op.fn)).toEqual([
      "confirm_hardware_planned_movement_v3",
      "confirm_hardware_planned_movement_v2",
    ])
    const v2 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v2")
    expect(v2?.args).toEqual({ planned_id: "m1", actor: "admin", occurred_on: null, confirm_qty: null })
  })

  it("v3 미적용 상태에서 v2 가 로트 부족으로 거절하면 무엇이 빠졌는지 문구로 알린다", async () => {
    existingRow = { data: PLANNED_ROW, error: null }
    rpcQueue.confirm_hardware_planned_movement_v3 = [
      { data: null, error: { code: "PGRST202", message: "function not found" } },
    ]
    rpcQueue.confirm_hardware_planned_movement_v2 = [
      { data: null, error: { code: "P0001", message: "STD1 lot 재고가 부족합니다. 요청 5대, 자동 배정 가능 0대입니다." } },
    ]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(confirmPlannedHardwareMovement("m1", {})).rejects.toThrow(/DB v3.*적용되지 않아/)
  })

  it("v3·v2 가 모두 없으면 레거시 RPC 로 폴백한다", async () => {
    existingRow = { data: PLANNED_ROW, error: null }
    rpcQueue.confirm_hardware_planned_movement_v3 = [
      { data: null, error: { code: "PGRST202", message: "function not found" } },
    ]
    rpcQueue.confirm_hardware_planned_movement_v2 = [
      { data: null, error: { code: "42883", message: "Could not find the function confirm_hardware_planned_movement_v2 in the schema cache" } },
    ]
    rpcQueue.confirm_hardware_planned_movement = [{ data: { id: "m1", quantity: 5 }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    const result = await confirmPlannedHardwareMovement("m1", {})

    expect(result).toMatchObject({ id: "m1", quantity: 5 })
    expect(rpcOps().map((op) => op.fn)).toEqual([
      "confirm_hardware_planned_movement_v3",
      "confirm_hardware_planned_movement_v2",
      "confirm_hardware_planned_movement",
    ])
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
  })

  it("레거시까지 실패하면 그 오류를 그대로 올린다", async () => {
    existingRow = { data: PLANNED_ROW, error: null }
    rpcQueue.confirm_hardware_planned_movement_v3 = [
      { data: null, error: { code: "PGRST202", message: "function not found" } },
    ]
    rpcQueue.confirm_hardware_planned_movement_v2 = [
      { data: null, error: { code: "PGRST202", message: "function not found" } },
    ]
    rpcQueue.confirm_hardware_planned_movement = [
      { data: null, error: { message: "planned movement already confirmed" } },
    ]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(confirmPlannedHardwareMovement("m1", {})).rejects.toMatchObject({
      message: "planned movement already confirmed",
    })
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})

describe("voidHardwareMovement", () => {
  it("voids an admin_manual, not-yet-voided movement and revalidates the cache tag", async () => {
    existingRow = { data: { id: "m1", source: "admin_manual", voided_at: null }, error: null }
    updateRow = { data: { id: "m1", voided_at: "2026-09-10T00:00:00.000Z" }, error: null }
    const { voidHardwareMovement } = await loadRepository()

    const result = await voidHardwareMovement("m1", { reason: "고객 요청 취소", actor: "admin@example.com" })

    expect(result).toMatchObject({ id: "m1" })
    const updateOp = operations.find((op) => op.method === "update")
    expect(updateOp?.payload).toMatchObject({
      voided_by: "admin@example.com",
      void_reason: "고객 요청 취소",
    })
    expect(typeof (updateOp?.payload as Record<string, unknown>).voided_at).toBe("string")
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
  })

  it("defaults the void reason to '관리자 취소' when no reason is given", async () => {
    existingRow = { data: { id: "m1", source: "admin_manual", voided_at: null }, error: null }
    updateRow = { data: { id: "m1" }, error: null }
    const { voidHardwareMovement } = await loadRepository()

    await voidHardwareMovement("m1", {})

    const updateOp = operations.find((op) => op.method === "update")
    expect(updateOp?.payload).toMatchObject({ void_reason: "관리자 취소" })
  })

  it("throws when the movement does not exist", async () => {
    existingRow = { data: null, error: null }
    const { voidHardwareMovement } = await loadRepository()

    await expect(voidHardwareMovement("missing", {})).rejects.toThrow("원본 기록을 찾을 수 없습니다.")
    expect(operations.some((op) => op.method === "update")).toBe(false)
  })

  it("refuses to void a sheet-imported movement", async () => {
    existingRow = { data: { id: "m1", source: "sheet_import", voided_at: null }, error: null }
    const { voidHardwareMovement } = await loadRepository()

    await expect(voidHardwareMovement("m1", {})).rejects.toThrow(
      "시트 이관 기록은 직접 취소할 수 없습니다. 수기 조정으로 보정하세요."
    )
    expect(operations.some((op) => op.method === "update")).toBe(false)
  })

  it("refuses to void an already-voided movement", async () => {
    existingRow = {
      data: { id: "m1", source: "admin_manual", voided_at: "2026-08-01T00:00:00.000Z" },
      error: null,
    }
    const { voidHardwareMovement } = await loadRepository()

    await expect(voidHardwareMovement("m1", {})).rejects.toThrow("이미 취소되었거나 처리된 원본 기록입니다.")
    expect(operations.some((op) => op.method === "update")).toBe(false)
  })

  it("propagates the lookup error instead of treating it as not-found", async () => {
    existingRow = { data: null, error: { message: "connection reset" } }
    const { voidHardwareMovement } = await loadRepository()

    await expect(voidHardwareMovement("m1", {})).rejects.toMatchObject({ message: "connection reset" })
  })

  it("propagates the update error and does not revalidate on failure", async () => {
    existingRow = { data: { id: "m1", source: "admin_manual", voided_at: null }, error: null }
    updateRow = { data: null, error: { message: "row lock timeout" } }
    const { voidHardwareMovement } = await loadRepository()

    await expect(voidHardwareMovement("m1", {})).rejects.toMatchObject({ message: "row lock timeout" })
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})

describe("updateHardwareMovement", () => {
  const validInput = {
    itemId: "item-1",
    productName: "86 IFP",
    movementType: "outbound" as const,
    quantity: 2,
    occurredAt: "2026-09-01",
    fromLocation: "창고",
    toLocation: "남명학원",
    owner: "Wangchan",
    status: "출고",
    referenceNo: "deal:123",
    memo: "메모",
    lotNo: "H9",
    unitPrice: null,
    amountUsd: 1000,
    amountCny: null,
    storageLocation: "",
    importer: "",
    serials: [],
  }

  it("rejects a blank product name before touching the database", async () => {
    const { updateHardwareMovement } = await loadRepository()
    await expect(updateHardwareMovement("m1", { ...validInput, productName: "   " })).rejects.toThrow(
      "제품명은 필수입니다."
    )
    expect(operations).toHaveLength(0)
  })

  it("rejects an unrecognized movement type", async () => {
    const { updateHardwareMovement } = await loadRepository()
    await expect(
      updateHardwareMovement("m1", { ...validInput, movementType: "scrap" as never })
    ).rejects.toThrow("입출고 유형이 올바르지 않습니다.")
  })

  it("rejects a non-positive or non-integer quantity", async () => {
    const { updateHardwareMovement } = await loadRepository()
    await expect(updateHardwareMovement("m1", { ...validInput, quantity: 0 })).rejects.toThrow(
      "수량은 1 이상 정수여야 합니다."
    )
    await expect(updateHardwareMovement("m1", { ...validInput, quantity: 1.5 })).rejects.toThrow(
      "수량은 1 이상 정수여야 합니다."
    )
  })

  it("throws when the movement does not exist", async () => {
    existingRow = { data: null, error: null }
    const { updateHardwareMovement } = await loadRepository()
    await expect(updateHardwareMovement("missing", validInput)).rejects.toThrow("원본 기록을 찾을 수 없습니다.")
  })

  it("refuses to edit a sheet-imported movement", async () => {
    existingRow = { data: { id: "m1", source: "sheet_import", movement_type: "outbound", status: "출고", voided_at: null }, error: null }
    const { updateHardwareMovement } = await loadRepository()
    await expect(updateHardwareMovement("m1", validInput)).rejects.toThrow(
      "시트 이관 기록은 수정할 수 없습니다. 수기 조정으로 보정하세요."
    )
  })

  it("refuses to edit a voided movement", async () => {
    existingRow = {
      data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "출고", voided_at: "2026-08-01T00:00:00.000Z" },
      error: null,
    }
    const { updateHardwareMovement } = await loadRepository()
    await expect(updateHardwareMovement("m1", validInput)).rejects.toThrow("취소된 기록은 수정할 수 없습니다.")
  })

  it("refuses to edit a converted movement (confirm-planned pairing)", async () => {
    existingRow = {
      data: {
        id: "m1",
        source: "admin_manual",
        movement_type: "outbound",
        status: "배송 예정",
        voided_at: null,
        converted_from_movement_id: null,
        converted_to_movement_id: "m2",
      },
      error: null,
    }
    const { updateHardwareMovement } = await loadRepository()
    await expect(updateHardwareMovement("m1", validInput)).rejects.toThrow("전환된 기록은 수정할 수 없습니다.")
  })

  it("without finalize capability, blocks edits to an already-realized (non-planned) movement", async () => {
    existingRow = {
      data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "출고", voided_at: null },
      error: null,
    }
    const { updateHardwareMovement } = await loadRepository()

    await expect(
      updateHardwareMovement("m1", validInput, { canFinalize: false })
    ).rejects.toThrow("실제 반영된 기록 수정은 확정 권한(hardware.finalize)이 필요합니다.")
    expect(operations.some((op) => op.method === "update")).toBe(false)
  })

  it("without finalize capability, blocks turning a planned row into a realized one (confirm bypass)", async () => {
    existingRow = {
      data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "배송 예정", voided_at: null },
      error: null,
    }
    const { updateHardwareMovement } = await loadRepository()

    await expect(
      updateHardwareMovement("m1", { ...validInput, status: "출고" }, { canFinalize: false })
    ).rejects.toThrow("예정을 실제 출고로 바꾸는 확정은 확정 권한(hardware.finalize)이 필요합니다.")
    expect(operations.some((op) => op.method === "update")).toBe(false)
  })

  it("without finalize capability, allows editing a planned row that stays planned", async () => {
    existingRow = {
      data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "배송 예정", voided_at: null },
      error: null,
    }
    updateRow = { data: { id: "m1", status: "배송 예정" }, error: null }
    const { updateHardwareMovement } = await loadRepository()

    const result = await updateHardwareMovement(
      "m1",
      { ...validInput, status: "배송 예정", quantity: 3 },
      { canFinalize: false }
    )

    expect(result).toMatchObject({ id: "m1" })
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
  })

  it("with finalize capability, allows confirming a planned row into a realized one via update", async () => {
    existingRow = {
      data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "배송 예정", voided_at: null },
      error: null,
    }
    updateRow = { data: { id: "m1", status: "출고" }, error: null }
    const { updateHardwareMovement } = await loadRepository()

    const result = await updateHardwareMovement("m1", { ...validInput, status: "출고" }, { canFinalize: true })
    expect(result).toMatchObject({ id: "m1" })
  })

  it("resolves a missing itemId via ensureHardwareItems and fails clearly when no item can be made", async () => {
    existingRow = { data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "출고", voided_at: null }, error: null }
    itemsByName = {} // 매칭되는 품목이 없다 — ensureHardwareItems가 아무것도 못 만든 상황을 흉내낸다.
    const { updateHardwareMovement } = await loadRepository()

    await expect(
      updateHardwareMovement("m1", { ...validInput, itemId: undefined })
    ).rejects.toThrow("하드웨어 품목을 만들 수 없습니다.")
  })

  it("resolves a missing itemId via ensureHardwareItems when a matching item exists", async () => {
    existingRow = { data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "출고", voided_at: null }, error: null }
    itemsByName = { "86 IFP": { id: "resolved-item-1" } }
    updateRow = { data: { id: "m1", item_id: "resolved-item-1" }, error: null }
    const { updateHardwareMovement } = await loadRepository()

    const result = await updateHardwareMovement("m1", { ...validInput, itemId: undefined })

    expect(result).toMatchObject({ id: "m1" })
    const updateOp = operations.find((op) => op.method === "update" && op.table === "hardware_movements")
    expect(updateOp?.payload).toMatchObject({ item_id: "resolved-item-1" })
  })

  it("maps every editable field onto the update payload, normalizing product name and locations", async () => {
    existingRow = { data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "출고", voided_at: null }, error: null }
    updateRow = { data: { id: "m1" }, error: null }
    const { updateHardwareMovement } = await loadRepository()

    await updateHardwareMovement("m1", {
      ...validInput,
      productName: "  86   IFP  ",
      fromLocation: "오산 창고",
      toLocation: "  남명학원  ",
    })

    const updateOp = operations.find((op) => op.method === "update" && op.table === "hardware_movements")
    expect(updateOp?.payload).toMatchObject({
      item_id: "item-1",
      product_name: "86 IFP",
      movement_type: "outbound",
      quantity: 2,
      occurred_at: "2026-09-01",
      from_location: "창고",
      to_location: "남명학원",
      owner: "Wangchan",
      status: "출고",
      reference_no: "deal:123",
      memo: "메모",
      serials: [],
      lot_no: "H9",
      unit_price: null,
      amount_usd: 1000,
      amount_cny: null,
      storage_location: null,
      importer: null,
    })
  })

  it("propagates the update error and does not revalidate on failure", async () => {
    existingRow = { data: { id: "m1", source: "admin_manual", movement_type: "outbound", status: "출고", voided_at: null }, error: null }
    updateRow = { data: null, error: { message: "constraint violation" } }
    const { updateHardwareMovement } = await loadRepository()

    await expect(updateHardwareMovement("m1", validInput)).rejects.toMatchObject({
      message: "constraint violation",
    })
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})

// 재고관리 프로세스(갭 문서 §6 D2·D6, §7-2) — 요청자(actorContext)가 있으면 본인 건·입고관리 권한과
// 물류번호 직접 선택을 적용하고, 확정은 v4 로 새 칸을 옮긴다.
describe("재고관리 프로세스 — 확정·취소·수정 권한과 물류번호", () => {
  const OWNER = { userId: "u-owner", name: "김매니저", isInventoryManager: false }
  const OTHER = { userId: "u-other", name: "박매니저", isInventoryManager: false }
  const MANAGER = { userId: "u-boss", name: "이왕찬", isInventoryManager: true }
  const OWNED_PLANNED = { ...PLANNED_ROW, source: "admin_manual", owner_user_id: "u-owner" }

  it("본인 배송 예정을 고른 물류번호로 확정하면 v4 에 배정·계정을 넘긴다", async () => {
    existingRow = { data: OWNED_PLANNED, error: null }
    itemsById = { "item-std1": { name: "STD1", lot_tracked: true } }
    ledgerRows = [ledger("inbound", 4, "H8"), ledger("inbound", 4, "C1")]
    rpcQueue.confirm_hardware_planned_movement_v4 = [{ data: { id: "out-1", status: "설치 완료" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", {
      occurredAt: "2026-10-28",
      actor: "김매니저",
      confirmQty: 5,
      actorContext: OWNER,
      lotAllocations: [{ lotNo: "H8", quantity: 3 }, { lotNo: "C1", quantity: 2 }],
    })

    const v4 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v4")
    expect(v4?.args).toMatchObject({
      planned_id: "m1",
      confirm_qty: 5,
      actor_user_id: "u-owner",
      lot_allocations: [{ lot_no: "H8", quantity: 3 }, { lot_no: "C1", quantity: 2 }],
    })
  })

  it("물류번호 관리 품목은 물류번호 없이 확정할 수 없다(FIFO 자동 배정 없음)", async () => {
    existingRow = { data: OWNED_PLANNED, error: null }
    itemsById = { "item-std1": { name: "STD1", lot_tracked: true } }
    ledgerRows = [ledger("inbound", 9, "C1")]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(confirmPlannedHardwareMovement("m1", { actorContext: OWNER })).rejects.toThrow("물류번호를 골라야")
    expect(operations.some((op) => op.method === "rpc")).toBe(false)
  })

  it("고른 물류번호의 잔여를 넘으면 막는다(확정되는 예정 행 자신은 뺀다)", async () => {
    existingRow = { data: OWNED_PLANNED, error: null }
    itemsById = { "item-std1": { name: "STD1", lot_tracked: true } }
    ledgerRows = [ledger("inbound", 2, "C1")]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(
      confirmPlannedHardwareMovement("m1", { actorContext: OWNER, confirmQty: 3, lotNo: "C1" })
    ).rejects.toThrow("C1 잔여는 2대")
  })

  it("배정 합계가 확정 수량과 다르면 막는다", async () => {
    existingRow = { data: OWNED_PLANNED, error: null }
    itemsById = { "item-std1": { name: "STD1", lot_tracked: true } }
    ledgerRows = [ledger("inbound", 9, "C1")]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(
      confirmPlannedHardwareMovement("m1", { actorContext: OWNER, confirmQty: 4, lotAllocations: [{ lotNo: "C1", quantity: 3 }] })
    ).rejects.toThrow("확정 수량(4대)")
  })

  it("수량만 관리하는 품목은 물류번호 없이 한 줄로 확정한다", async () => {
    existingRow = { data: OWNED_PLANNED, error: null }
    itemsById = { "item-std1": { name: "OPS", lot_tracked: false } }
    rpcQueue.confirm_hardware_planned_movement_v4 = [{ data: { id: "out-1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", { actorContext: OWNER, confirmQty: 2 })
    const v4 = operations.find((op) => op.fn === "confirm_hardware_planned_movement_v4")
    expect(v4?.args?.lot_allocations).toEqual([{ lot_no: null, quantity: 2 }])
  })

  it("남의 배송 예정은 확정할 수 없고, 입고관리 권한자는 할 수 있다", async () => {
    existingRow = { data: OWNED_PLANNED, error: null }
    itemsById = { "item-std1": { name: "STD1", lot_tracked: true } }
    ledgerRows = [ledger("inbound", 9, "C1")]
    rpcQueue.confirm_hardware_planned_movement_v4 = [{ data: { id: "out-1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(confirmPlannedHardwareMovement("m1", { actorContext: OTHER, lotNo: "C1" })).rejects.toMatchObject({ status: 403 })
    await expect(confirmPlannedHardwareMovement("m1", { actorContext: MANAGER, lotNo: "C1" })).resolves.toMatchObject({ id: "out-1" })
  })

  it("배송 예정 취소는 본인도, 실현 기록 취소는 입고관리 권한자만", async () => {
    updateRow = { data: { id: "m1" }, error: null }
    existingRow = { data: { ...OWNED_PLANNED }, error: null }
    const { voidHardwareMovement } = await loadRepository()

    await expect(voidHardwareMovement("m1", { actorContext: OWNER })).resolves.toMatchObject({ id: "m1" })

    existingRow = { data: { ...OWNED_PLANNED, status: "설치 완료" }, error: null }
    await expect(voidHardwareMovement("m1", { actorContext: OWNER })).rejects.toMatchObject({ status: 403 })
    await expect(voidHardwareMovement("m1", { actorContext: MANAGER })).resolves.toMatchObject({ id: "m1" })
  })

  it("실현 기록 수정은 입고관리 권한자만, 새 칸은 실려 온 것만 바꾼다", async () => {
    existingRow = {
      data: { ...OWNED_PLANNED, status: "설치 완료", item_id: "item-1", lot_no: "H9", quantity: 2 },
      error: null,
    }
    updateRow = { data: { id: "m1" }, error: null }
    const { updateHardwareMovement } = await loadRepository()
    const input = {
      itemId: "item-1",
      productName: "86 IFP",
      movementType: "outbound" as const,
      quantity: 2,
      status: "설치 완료",
      lotNo: "H9",
      outboundType: "promotion" as const,
    }

    await expect(updateHardwareMovement("m1", input, { actor: OWNER })).rejects.toMatchObject({ status: 403 })

    await updateHardwareMovement("m1", input, { actor: MANAGER })
    const updateOp = operations.filter((op) => op.method === "update").at(-1)
    expect(updateOp?.payload).toMatchObject({ outbound_type: "promotion", status: "설치 완료" })
    expect(updateOp?.payload).not.toHaveProperty("customer_id")
    expect(updateOp?.payload).not.toHaveProperty("expected_return_at")
  })
})
