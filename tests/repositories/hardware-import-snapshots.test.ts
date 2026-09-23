import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 감사(2026-09-07 #4): restore_hardware_sheet_import_snapshot RPC(20260701_hardware_restore_
// snapshot_guard.sql)가 있는데 UI/API 어디에도 연결돼 있지 않았다. listHardwareSheetImportSnapshots·
// restoreHardwareSheetImportSnapshot(lib/repositories/hardware-inventory.ts)이 그 연결부이고,
// 이 파일이 그 두 함수를 검증한다. API 라우트(app/api/admin/hardware/import-snapshots/**)의
// 권한 게이트(hardware.finalize)는 라우트 자체 테스트가 아니라 여기서는 레포지토리 계층만 본다.

type Operation = { method: string; table?: string; args?: Record<string, unknown> }

const operations: Operation[] = []
let selectResult: { data: unknown; error: unknown } = { data: [], error: null }
let rpcResult: { data: unknown; error: unknown } = { data: 0, error: null }
const revalidateTagMock = vi.fn()

// 복원의 시트 우선 취소 되살리기(하드웨어 라운드 2 S-11)가 읽는 행 — 스냅샷 → 이관 기록 → 이후 이관들의 취소 id.
let snapshotRunRow: unknown = null
let importRunRow: unknown = null
let importRunsSince: unknown[] = []
let revivedRows: unknown[] = []

function tableClient(table: string) {
  const builder: Record<string, unknown> = {}
  let isUpdate = false
  builder.select = (columns: string) => {
    operations.push({ method: "select", table, args: { columns } })
    return builder
  }
  builder.order = (column: string, opts: unknown) => {
    operations.push({ method: "order", table, args: { column, opts } })
    return builder
  }
  builder.limit = (limit: number) => {
    operations.push({ method: "limit", table, args: { limit } })
    return Promise.resolve(selectResult)
  }
  builder.eq = (column: string, value: unknown) => {
    operations.push({ method: "eq", table, args: { column, value } })
    return builder
  }
  builder.gte = (column: string, value: unknown) => {
    operations.push({ method: "gte", table, args: { column, value } })
    return builder
  }
  builder.in = (column: string, values: unknown) => {
    operations.push({ method: "in", table, args: { column, values } })
    return builder
  }
  builder.update = (payload: unknown) => {
    isUpdate = true
    operations.push({ method: "update", table, args: { payload } })
    return builder
  }
  builder.maybeSingle = () => {
    if (table === "hardware_sheet_import_snapshots") return Promise.resolve({ data: snapshotRunRow, error: null })
    if (table === "hardware_import_runs") return Promise.resolve({ data: importRunRow, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  builder.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
    const result =
      table === "hardware_import_runs"
        ? { data: importRunsSince, error: null }
        : table === "hardware_movements" && isUpdate
          ? { data: revivedRows, error: null }
          : { data: [], error: null }
    return Promise.resolve(result).then(resolve)
  }
  return builder
}

async function loadRepository() {
  vi.resetModules()
  const client = {
    from: vi.fn((table: string) => tableClient(table)),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      operations.push({ method: "rpc", args: { fn, ...args } })
      return rpcResult
    }),
  }
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
  return import("@/lib/repositories/hardware-inventory")
}

beforeEach(() => {
  operations.length = 0
  snapshotRunRow = null
  importRunRow = null
  importRunsSince = []
  revivedRows = []
  selectResult = { data: [], error: null }
  rpcResult = { data: 0, error: null }
  revalidateTagMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("listHardwareSheetImportSnapshots", () => {
  it("maps snapshot rows and reads counts from row_counts instead of the large movement arrays", async () => {
    selectResult = {
      data: [
        {
          id: "snap-2",
          import_run_id: "run-2",
          created_at: "2026-09-05T00:00:00.000Z",
          created_by: "admin@example.com",
          checksum: "abc123",
          row_counts: { previous_sheet_movements: 480, candidate_movements: 512 },
        },
        {
          id: "snap-1",
          import_run_id: "run-1",
          created_at: "2026-09-01T00:00:00.000Z",
          created_by: null,
          checksum: "def456",
          row_counts: null,
        },
      ],
      error: null,
    }
    const { listHardwareSheetImportSnapshots } = await loadRepository()

    const snapshots = await listHardwareSheetImportSnapshots()

    expect(snapshots).toEqual([
      {
        id: "snap-2",
        importRunId: "run-2",
        createdAt: "2026-09-05T00:00:00.000Z",
        createdBy: "admin@example.com",
        checksum: "abc123",
        previousMovementCount: 480,
        candidateMovementCount: 512,
      },
      {
        id: "snap-1",
        importRunId: "run-1",
        createdAt: "2026-09-01T00:00:00.000Z",
        createdBy: null,
        checksum: "def456",
        previousMovementCount: 0,
        candidateMovementCount: 0,
      },
    ])
    // previous_sheet_movements(품목당 이동 전체를 담아 큰 배열)는 select 컬럼 목록에 없어야 한다.
    const selectOp = operations.find((op) => op.method === "select")
    expect(selectOp?.args?.columns).not.toContain("previous_sheet_movements")
    const orderOp = operations.find((op) => op.method === "order")
    expect(orderOp?.args).toMatchObject({ column: "created_at", opts: { ascending: false } })
  })

  it("defaults to a limit of 10 and clamps a caller-provided limit at the repository boundary", async () => {
    const { listHardwareSheetImportSnapshots } = await loadRepository()
    await listHardwareSheetImportSnapshots()
    expect(operations.find((op) => op.method === "limit")?.args).toMatchObject({ limit: 10 })

    operations.length = 0
    const { listHardwareSheetImportSnapshots: list2 } = await loadRepository()
    await list2(25)
    expect(operations.find((op) => op.method === "limit")?.args).toMatchObject({ limit: 25 })
  })

  it("propagates a query error instead of returning an empty list silently", async () => {
    selectResult = { data: null, error: { message: "permission denied" } }
    const { listHardwareSheetImportSnapshots } = await loadRepository()
    await expect(listHardwareSheetImportSnapshots()).rejects.toMatchObject({ message: "permission denied" })
  })
})

describe("restoreHardwareSheetImportSnapshot", () => {
  it("calls the restore RPC with snapshot_id/actor and revalidates the inventory cache tag", async () => {
    rpcResult = { data: 42, error: null }
    const { restoreHardwareSheetImportSnapshot } = await loadRepository()

    const result = await restoreHardwareSheetImportSnapshot("snap-1", "admin@example.com")

    expect(result).toEqual({ restoredCount: 42, sheetWinsRevived: 0, sheetWinsReviveError: null })
    const rpcOp = operations.find((op) => op.method === "rpc")
    expect(rpcOp?.args).toMatchObject({
      fn: "restore_hardware_sheet_import_snapshot",
      snapshot_id: "snap-1",
      actor: "admin@example.com",
    })
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
  })

  it("revives admin confirmations that the undone imports voided under the sheet-wins policy", async () => {
    rpcResult = { data: 10, error: null }
    snapshotRunRow = { import_run_id: "run-5" }
    importRunRow = { started_at: "2026-09-22T00:00:00.000Z" }
    importRunsSince = [{ id: "run-5", voided_ids: ["adm-1", "adm-2"] }, { id: "run-6", voided_ids: ["adm-2", "adm-3"] }, { id: "run-7", voided_ids: null }]
    revivedRows = [{ id: "adm-1" }, { id: "adm-3" }]
    const { restoreHardwareSheetImportSnapshot } = await loadRepository()

    const result = await restoreHardwareSheetImportSnapshot("snap-5", "admin")

    expect(result).toEqual({ restoredCount: 10, sheetWinsRevived: 2, sheetWinsReviveError: null })
    // 이후 이관 기록은 스냅샷 이관의 시작 시각 이상만 본다.
    expect(operations).toContainEqual({ method: "gte", table: "hardware_import_runs", args: { column: "started_at", value: "2026-09-22T00:00:00.000Z" } })
    // 되살리기는 모은 id 전체를, 사유가 여전히 시트 우선인 행에만 한다.
    const reviveIn = operations.find((op) => op.method === "in" && op.table === "hardware_movements")
    expect(reviveIn?.args).toEqual({ column: "id", values: ["adm-1", "adm-2", "adm-3"] })
    const reviveReason = operations.find((op) => op.method === "eq" && op.table === "hardware_movements")
    expect(reviveReason?.args?.column).toBe("void_reason")
    // 되살리기는 복원 RPC 뒤에 한다.
    const rpcIndex = operations.findIndex((op) => op.method === "rpc")
    const updateIndex = operations.findIndex((op) => op.method === "update" && op.table === "hardware_movements")
    expect(rpcIndex).toBeLessThan(updateIndex)
  })

  it("does not touch movements when the restored snapshot's imports voided nothing", async () => {
    rpcResult = { data: 3, error: null }
    snapshotRunRow = { import_run_id: "run-1" }
    importRunRow = { started_at: "2026-09-01T00:00:00.000Z" }
    importRunsSince = [{ id: "run-1", voided_ids: [] }]
    const { restoreHardwareSheetImportSnapshot } = await loadRepository()

    const result = await restoreHardwareSheetImportSnapshot("snap-1", "admin")

    expect(result.sheetWinsRevived).toBe(0)
    expect(operations.some((op) => op.method === "update")).toBe(false)
  })

  it("defaults actor to null when not provided", async () => {
    const { restoreHardwareSheetImportSnapshot } = await loadRepository()
    await restoreHardwareSheetImportSnapshot("snap-1", null)
    const rpcOp = operations.find((op) => op.method === "rpc")
    expect(rpcOp?.args).toMatchObject({ actor: null })
  })

  it("propagates the RPC's fail-closed guard error (e.g. empty previous_sheet_movements) without revalidating", async () => {
    rpcResult = {
      data: null,
      error: { message: "hardware sheet import snapshot snap-1 previous_sheet_movements is empty; refusing destructive restore" },
    }
    const { restoreHardwareSheetImportSnapshot } = await loadRepository()

    await expect(restoreHardwareSheetImportSnapshot("snap-1", "admin")).rejects.toMatchObject({
      message: expect.stringContaining("refusing destructive restore"),
    })
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})
