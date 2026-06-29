import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Operation = {
  table?: string
  method: string
  payload?: unknown
  fn?: string
  args?: Record<string, unknown>
}

const operations: Operation[] = []
const listHwInbound = vi.fn()
const listHwOutbound = vi.fn()
const listHwStock = vi.fn()
const listFreshHwInbound = vi.fn()
const listFreshHwOutbound = vi.fn()
const listFreshHwStock = vi.fn()
let previousSheetMovements: Array<Record<string, unknown>> = []
let snapshotInsertError: { message: string } | null = null

function tableClient(table: string) {
  return {
    insert(payload: unknown) {
      operations.push({ table, method: "insert", payload })
      return {
        select() {
          return {
            async single() {
              if (table === "hardware_import_runs") {
                return { data: { id: "run-1" }, error: null }
              }
              if (table === "hardware_sheet_import_snapshots") {
                if (snapshotInsertError) return { data: null, error: snapshotInsertError }
                return {
                  data: {
                    id: "snapshot-1",
                    checksum: "checksum-1",
                    created_at: "2026-06-27T00:00:00.000Z",
                  },
                  error: null,
                }
              }
              return { data: null, error: null }
            },
          }
        },
      }
    },
    update(payload: unknown) {
      operations.push({ table, method: "update", payload })
      return {
        async eq() {
          return { data: null, error: null }
        },
      }
    },
    upsert(payload: unknown) {
      operations.push({ table, method: "upsert", payload })
      return Promise.resolve({ data: null, error: null })
    },
    select() {
      return {
        async in(_column: string, names: string[]) {
          return {
            data: names.map((name, index) => ({
              id: `item-${index + 1}`,
              name,
              sku: null,
              category: null,
              reorder_point: 2,
              lead_time_days: 14,
              active: true,
              source_aliases: [name],
              created_at: "2026-06-27T00:00:00.000Z",
              updated_at: "2026-06-27T00:00:00.000Z",
            })),
            error: null,
          }
        },
        async eq(column: string, value: string) {
          if (table === "hardware_movements" && column === "source" && value === "sheet_import") {
            return { data: previousSheetMovements, error: null }
          }
          return { data: [], error: null }
        },
      }
    },
  }
}

function supabaseClient() {
  return {
    from: vi.fn((table: string) => tableClient(table)),
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      operations.push({ method: "rpc", fn, args })
      const rows = Array.isArray(args.rows) ? args.rows : []
      return Promise.resolve({ data: rows.length, error: null })
    }),
  }
}

async function loadRepository() {
  vi.resetModules()
  const client = supabaseClient()

  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
    unstable_cache: (fn: unknown) => fn,
  }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    listHwInbound,
    listHwOutbound,
    listHwStock,
    listFreshHwInbound,
    listFreshHwOutbound,
    listFreshHwStock,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))

  const module = await import("@/lib/repositories/hardware-inventory")
  return { ...module, client }
}

describe("importHardwareFromBranchSheets", () => {
  beforeEach(() => {
    operations.length = 0
    listHwInbound.mockReset()
    listHwOutbound.mockReset()
    listHwStock.mockReset()
    listFreshHwInbound.mockReset()
    listFreshHwOutbound.mockReset()
    listFreshHwStock.mockReset()
    previousSheetMovements = [
      {
        id: "old-movement",
        source: "sheet_import",
        product_name: "Old Board",
        quantity: 1,
      },
    ]
    snapshotInsertError = null
    const inboundRows = [
      {
        id: "inbound-1",
        logistics_no: "H8",
        inbound_date: "2026-06-01",
        product: "86 IFP",
        quantity: 3,
        unit_price: null,
        amount: null,
        serials: ["S1", "S2", "S3"],
        storage: "창고",
        importer: "Classin",
        remarks: "initial import",
        raw: { values: ["H8", "2026-06-01", "86 IFP"] },
      },
    ]
    listHwInbound.mockResolvedValue(inboundRows)
    listHwOutbound.mockResolvedValue([])
    listHwStock.mockResolvedValue([])
    listFreshHwInbound.mockResolvedValue(inboundRows)
    listFreshHwOutbound.mockResolvedValue([])
    listFreshHwStock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("creates a snapshot before calling the atomic replace RPC", async () => {
    const { importHardwareFromBranchSheets } = await loadRepository()

    const result = await importHardwareFromBranchSheets({ actor: "admin@example.com" })

    expect(result).toMatchObject({
      imported: 1,
      skipped: 0,
      runId: "run-1",
      snapshotId: "snapshot-1",
      snapshotChecksum: "checksum-1",
    })

    const snapshotOpIndex = operations.findIndex(
      (op) => op.table === "hardware_sheet_import_snapshots" && op.method === "insert"
    )
    const replaceOpIndex = operations.findIndex(
      (op) => op.method === "rpc" && op.fn === "replace_hardware_sheet_import"
    )
    expect(snapshotOpIndex).toBeGreaterThanOrEqual(0)
    expect(replaceOpIndex).toBeGreaterThan(snapshotOpIndex)

    const snapshotPayload = operations[snapshotOpIndex].payload as Record<string, unknown>
    expect(snapshotPayload).toMatchObject({
      import_run_id: "run-1",
      created_by: "admin@example.com",
      previous_sheet_movements: previousSheetMovements,
    })
    expect(snapshotPayload.row_counts).toMatchObject({
      previous_sheet_movements: 1,
      candidate_movements: 1,
      branch_hw_inbound: 1,
      branch_hw_outbound: 0,
      branch_hw_stock: 0,
    })

    const replaceArgs = operations[replaceOpIndex].args
    expect(replaceArgs).toMatchObject({
      run_id: "run-1",
      snapshot_id: "snapshot-1",
    })
  })

  it("reads uncached inbound, outbound, and stock rows after forced sheet sync", async () => {
    listHwInbound.mockRejectedValue(new Error("cached inbound should not be used"))
    listHwOutbound.mockRejectedValue(new Error("cached outbound should not be used"))
    listHwStock.mockRejectedValue(new Error("cached stock should not be used"))
    const { importHardwareFromBranchSheets } = await loadRepository()

    await importHardwareFromBranchSheets({ actor: "admin@example.com" })

    expect(listFreshHwInbound).toHaveBeenCalledTimes(1)
    expect(listFreshHwOutbound).toHaveBeenCalledTimes(1)
    expect(listFreshHwStock).toHaveBeenCalledTimes(1)
    expect(listHwInbound).not.toHaveBeenCalled()
    expect(listHwOutbound).not.toHaveBeenCalled()
    expect(listHwStock).not.toHaveBeenCalled()
  })

  it("normalizes warehouse-specific storage names to the warehouse ledger location", async () => {
    listFreshHwInbound.mockResolvedValue([
      {
        id: "inbound-warehouse-alias",
        logistics_no: "H8",
        inbound_date: "2026-06-01",
        product: "86 IFP",
        quantity: 3,
        unit_price: null,
        amount: null,
        serials: [],
        storage: "오산 창고",
        importer: "Classin",
        remarks: null,
        raw: { values: ["H8", "2026-06-01", "86 IFP"] },
      },
    ])
    const { importHardwareFromBranchSheets } = await loadRepository()

    await importHardwareFromBranchSheets({ actor: "admin@example.com" })

    const replaceArgs = operations.find(
      (op) => op.method === "rpc" && op.fn === "replace_hardware_sheet_import"
    )?.args
    const rows = replaceArgs?.rows as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({
      movement_type: "inbound",
      to_location: "창고",
    })
  })

  it("adds stock reconciliation adjustments for products that also have ledger rows", async () => {
    const inboundRows = [
      {
        id: "inbound-1",
        logistics_no: "H8",
        inbound_date: "2026-06-01",
        product: "86 IFP",
        quantity: 3,
        unit_price: null,
        amount: null,
        serials: [],
        storage: "창고",
        importer: "Classin",
        remarks: null,
        raw: { values: ["H8", "2026-06-01", "86 IFP"] },
      },
    ]
    listFreshHwInbound.mockResolvedValue(inboundRows)
    listFreshHwOutbound.mockResolvedValue([
      {
        id: "outbound-1",
        logistics_no: "H8",
        outbound_date: "2026-06-02",
        owner: "Wangchan",
        product: "86 IFP",
        quantity: 1,
        revenue: null,
        destination: "고객",
        serials: [],
        progress: "설치 완료",
        type: "Sales",
        remarks: null,
        raw: { values: ["H8", "2026-06-02", "Wangchan", "86 IFP"] },
      },
    ])
    listFreshHwStock.mockResolvedValue([
      {
        id: "stock-1",
        product: "86 IFP",
        category: "전자칠판",
        quantity: 5,
        raw: {
          source: "재고현황",
          inbound_total: 3,
          outbound_total: 1,
        },
      },
    ])
    const { importHardwareFromBranchSheets } = await loadRepository()

    await importHardwareFromBranchSheets({ actor: "admin@example.com" })

    const replaceArgs = operations.find(
      (op) => op.method === "rpc" && op.fn === "replace_hardware_sheet_import"
    )?.args
    const rows = replaceArgs?.rows as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3)
    expect(rows[2]).toMatchObject({
      product_name: "86 IFP",
      movement_type: "adjust",
      quantity: 3,
      from_location: null,
      to_location: "창고",
      status: "현재고 보정",
      source_table: "branch_hw_stock",
    })
  })

  it("imports stock-only products as current stock adjustments", async () => {
    listFreshHwInbound.mockResolvedValue([])
    listFreshHwOutbound.mockResolvedValue([])
    listFreshHwStock.mockResolvedValue([
      {
        id: "stock-only-1",
        product: "OPS",
        category: "OPS",
        quantity: 32,
        raw: ["재고 현황", "OPS", "OPS", "32"],
      },
    ])
    const { importHardwareFromBranchSheets } = await loadRepository()

    await importHardwareFromBranchSheets({ actor: "admin@example.com" })

    const replaceArgs = operations.find(
      (op) => op.method === "rpc" && op.fn === "replace_hardware_sheet_import"
    )?.args
    const rows = replaceArgs?.rows as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      product_name: "OPS",
      movement_type: "adjust",
      quantity: 32,
      from_location: null,
      to_location: "창고",
      status: "현재고 보정",
      source_table: "branch_hw_stock",
    })
  })

  it("does not replace sheet_import rows when snapshot creation fails", async () => {
    snapshotInsertError = { message: "snapshot insert denied" }
    const { importHardwareFromBranchSheets } = await loadRepository()

    await expect(
      importHardwareFromBranchSheets({ actor: "admin@example.com" })
    ).rejects.toThrow("snapshot insert denied")

    expect(
      operations.some((op) => op.method === "rpc" && op.fn === "replace_hardware_sheet_import")
    ).toBe(false)
    const failedRunUpdate = operations.find(
      (op) => op.table === "hardware_import_runs" && op.method === "update"
    )?.payload as Record<string, unknown>
    expect(failedRunUpdate).toMatchObject({
      status: "failed",
      error: "snapshot insert denied",
    })
  })

  it("assigns distinct, non-empty fingerprint keys to identical bulk-PO inbound lines", async () => {
    const dup = {
      id: "x",
      logistics_no: "",
      inbound_date: "2026-06-01",
      product: "86 IFP",
      quantity: 3,
      unit_price: null,
      amount: null,
      serials: [],
      storage: "창고",
      importer: "Classin",
      remarks: null,
      raw: { values: ["", "2026-06-01", "86 IFP"] },
    }
    listFreshHwInbound.mockResolvedValue([{ ...dup }, { ...dup }])
    listFreshHwOutbound.mockResolvedValue([])
    listFreshHwStock.mockResolvedValue([])
    const { importHardwareFromBranchSheets } = await loadRepository()

    await importHardwareFromBranchSheets({ actor: "admin@example.com" })

    const rows = operations.find(
      (op) => op.method === "rpc" && op.fn === "replace_hardware_sheet_import"
    )?.args?.rows as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0].source_key).toBeTruthy()
    expect(rows[1].source_key).toBeTruthy()
    expect(rows[0].source_key).not.toBe(rows[1].source_key)
    expect(rows.every((r) => typeof r.source_digest === "string" && r.source_digest)).toBe(true)
    const keys = rows.map((r) => r.source_key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("routes to the additive merge RPC only when the flag is enabled", async () => {
    const prev = process.env.HARDWARE_SHEET_ADDITIVE_MERGE
    process.env.HARDWARE_SHEET_ADDITIVE_MERGE = "1"
    try {
      const { importHardwareFromBranchSheets } = await loadRepository()
      await importHardwareFromBranchSheets({ actor: "admin@example.com" })
      expect(operations.some((op) => op.method === "rpc" && op.fn === "merge_hardware_sheet_import")).toBe(true)
      expect(operations.some((op) => op.method === "rpc" && op.fn === "replace_hardware_sheet_import")).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.HARDWARE_SHEET_ADDITIVE_MERGE
      else process.env.HARDWARE_SHEET_ADDITIVE_MERGE = prev
    }
  })
})
