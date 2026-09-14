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

function tableClient(table: string) {
  const builder: Record<string, unknown> = {}
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

    expect(result).toEqual({ restoredCount: 42 })
    const rpcOp = operations.find((op) => op.method === "rpc")
    expect(rpcOp?.args).toMatchObject({
      fn: "restore_hardware_sheet_import_snapshot",
      snapshot_id: "snap-1",
      actor: "admin@example.com",
    })
    expect(revalidateTagMock).toHaveBeenCalledWith("hardware-inventory", "max")
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
