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

function tableClient(table: string) {
  return {
    select(_cols: string) {
      return {
        eq(_col: string, _val: string) {
          return {
            async maybeSingle() {
              operations.push({ table, method: "select.eq.maybeSingle" })
              return existingRow
            },
          }
        },
        async in(_col: string, names: string[]) {
          operations.push({ table, method: "select.in", payload: names })
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
        eq(_col: string, _val: string) {
          return {
            select(_cols: string) {
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
    fetchAllSupabaseRows: vi.fn(async () => []),
    listFreshHwInbound: vi.fn(),
    listFreshHwOutbound: vi.fn(),
    listFreshHwStock: vi.fn(),
  }))

  const module = await import("@/lib/repositories/hardware-inventory")
  return { ...module, client }
}

beforeEach(() => {
  operations.length = 0
  existingRow = { data: null, error: null }
  updateRow = { data: null, error: null }
  rpcQueue = {}
  itemsByName = {}
  revalidateTagMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("confirmPlannedHardwareMovement", () => {
  it("confirms via the v2 RPC and revalidates the inventory cache tag on success", async () => {
    rpcQueue.confirm_hardware_planned_movement_v2 = [
      { data: { id: "m1", quantity: 2, status: "출고" }, error: null },
    ]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    const result = await confirmPlannedHardwareMovement("m1", {
      occurredAt: "2026-09-01",
      actor: "admin@example.com",
      confirmQty: 2,
    })

    expect(result).toMatchObject({ id: "m1", quantity: 2 })
    const rpcCall = operations.find((op) => op.method === "rpc")
    expect(rpcCall).toMatchObject({
      fn: "confirm_hardware_planned_movement_v2",
      args: { planned_id: "m1", actor: "admin@example.com", occurred_on: "2026-09-01", confirm_qty: 2 },
    })
    // 레거시 RPC는 절대 호출되지 않아야 한다.
    expect(operations.filter((op) => op.method === "rpc")).toHaveLength(1)
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
  })

  it("defaults actor/occurredAt/confirmQty to null when the caller omits them", async () => {
    rpcQueue.confirm_hardware_planned_movement_v2 = [{ data: { id: "m1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", {})

    const rpcCall = operations.find((op) => op.method === "rpc")
    expect(rpcCall?.args).toMatchObject({ planned_id: "m1", actor: null, occurred_on: null, confirm_qty: null })
  })

  it("falls back to the legacy RPC when v2 is missing from the schema cache (PGRST202)", async () => {
    rpcQueue.confirm_hardware_planned_movement_v2 = [
      { data: null, error: { code: "PGRST202", message: "function not found" } },
    ]
    rpcQueue.confirm_hardware_planned_movement = [{ data: { id: "m1", quantity: 5 }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    const result = await confirmPlannedHardwareMovement("m1", { actor: "admin" })

    expect(result).toMatchObject({ id: "m1", quantity: 5 })
    const rpcCalls = operations.filter((op) => op.method === "rpc")
    expect(rpcCalls.map((op) => op.fn)).toEqual([
      "confirm_hardware_planned_movement_v2",
      "confirm_hardware_planned_movement",
    ])
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
  })

  it("falls back to the legacy RPC when the v2 error message hints at a missing function/schema cache miss", async () => {
    rpcQueue.confirm_hardware_planned_movement_v2 = [
      { data: null, error: { code: "42883", message: "Could not find the function confirm_hardware_planned_movement_v2 in the schema cache" } },
    ]
    rpcQueue.confirm_hardware_planned_movement = [{ data: { id: "m1" }, error: null }]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await confirmPlannedHardwareMovement("m1", {})

    expect(operations.filter((op) => op.method === "rpc")).toHaveLength(2)
  })

  it("does not fall back and rethrows immediately when the v2 RPC fails for a real (non-missing-function) reason", async () => {
    rpcQueue.confirm_hardware_planned_movement_v2 = [
      { data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } },
    ]
    const { confirmPlannedHardwareMovement } = await loadRepository()

    await expect(confirmPlannedHardwareMovement("bad-id", {})).rejects.toMatchObject({
      message: "invalid input syntax for type uuid",
    })
    expect(operations.filter((op) => op.method === "rpc")).toHaveLength(1)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it("propagates the legacy RPC error when both v2 and the legacy RPC fail", async () => {
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

    await expect(voidHardwareMovement("missing", {})).rejects.toThrow("원장 기록을 찾을 수 없습니다.")
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

    await expect(voidHardwareMovement("m1", {})).rejects.toThrow("이미 취소되었거나 처리된 원장 기록입니다.")
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
    await expect(updateHardwareMovement("missing", validInput)).rejects.toThrow("원장 기록을 찾을 수 없습니다.")
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
