import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// §8-6 이중 계상 정책(운영자 결정 2026-09-21): 가져오기 때는 시트가 이긴다.
//
// 시트 행을 어드민에서 확정하면 admin_manual 출고가 생기고 시트 행은 void 된다. 교체 가져오기는
// 시트 이관분을 통째로 지우고 다시 넣으므로 같은 물량이 두 번 잡힌다 — 가져오기 뒤에 그 어드민
// 확정만 취소한다. 사람이 직접 만든 어드민 기록은 건드리지 않는다.

type Row = Record<string, unknown>

interface Update {
  table: string
  payload: Row
  ids: string[]
}

const updates: Update[] = []
let adminConvertedRows: Row[] = []
let sheetSourceRows: Row[] = []
let rpcCalls: string[] = []
// 시트가 이번에 실어 온 출고 — 같은 품목·고객사가 다시 들어와야 어드민 확정을 취소한다.
let outboundSheetRows: Row[] = []

function movementsTable() {
  return {
    select(columns: string) {
      // 전환 링크가 있는 어드민 기록 조회: .eq().is().not()
      if (columns === "id,product_name,to_location,converted_from_movement_id") {
        const chain = {
          eq: () => chain,
          is: () => chain,
          not: () => Promise.resolve({ data: adminConvertedRows, error: null }),
        }
        return chain
      }
      // 링크가 가리키는 행 중 시트 이관분: .eq().in()
      if (columns === "id") {
        const chain = {
          eq: () => chain,
          in: (_column: string, ids: string[]) => Promise.resolve({
            data: sheetSourceRows.filter((row) => ids.includes(row.id as string)),
            error: null,
          }),
        }
        return chain
      }
      // 스냅샷용 기존 시트 이관분
      return { eq: () => Promise.resolve({ data: [], error: null }) }
    },
    update(payload: Row) {
      return {
        in: (_column: string, ids: string[]) => {
          updates.push({ table: "hardware_movements", payload, ids })
          return Promise.resolve({ data: null, error: null })
        },
        eq: () => Promise.resolve({ data: null, error: null }),
      }
    },
    insert() {
      return { select: () => ({ single: async () => ({ data: { id: "row-1" }, error: null }) }) }
    },
  }
}

function otherTable(table: string) {
  return {
    insert() {
      return {
        select: () => ({
          single: async () => ({
            data:
              table === "hardware_import_runs"
                ? { id: "run-1" }
                : { id: "snapshot-1", checksum: "checksum-1", created_at: "2026-09-21T00:00:00.000Z" },
            error: null,
          }),
        }),
      }
    },
    update() {
      return { eq: async () => ({ data: null, error: null }) }
    },
    upsert: () => Promise.resolve({ data: null, error: null }),
    select() {
      return {
        in: async (_column: string, names: string[]) => ({
          data: names.map((name, index) => ({ id: `item-${index + 1}`, name })),
          error: null,
        }),
        eq: async () => ({ data: [], error: null }),
      }
    },
  }
}

async function loadRepository() {
  vi.resetModules()
  const client = {
    from: vi.fn((table: string) => (table === "hardware_movements" ? movementsTable() : otherTable(table))),
    rpc: vi.fn((fn: string) => {
      rpcCalls.push(fn)
      return Promise.resolve({ data: 1, error: null })
    }),
  }

  vi.doMock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    fetchAllSupabaseRows: vi.fn(async () => []),
    listFreshHwInbound: vi.fn(async () => [
      {
        id: "inbound-1",
        logistics_no: "C3",
        inbound_date: "2026-09-20",
        product: '86" IFP',
        quantity: 3,
        unit_price: null,
        amount: null,
        serials: [],
        storage: "창고",
        importer: "Classin",
        remarks: "",
        raw: {},
      },
    ]),
    listFreshHwOutbound: vi.fn(async () => outboundSheetRows),
    listFreshHwStock: vi.fn(async () => []),
    listHwInbound: vi.fn(async () => []),
    listHwOutbound: vi.fn(async () => []),
    listHwStock: vi.fn(async () => []),
  }))

  return import("@/lib/repositories/hardware-inventory")
}

describe("importHardwareFromBranchSheets — 시트가 이긴다(§8-6)", () => {
  beforeEach(() => {
    updates.length = 0
    rpcCalls = []
    adminConvertedRows = []
    sheetSourceRows = []
    outboundSheetRows = [
      {
        id: "sheet-out-1",
        logistics_no: "H8",
        outbound_date: "2026-09-21",
        owner: null,
        product: '86" IFP',
        quantity: 2,
        revenue: null,
        destination: "남명학원",
        serials: [],
        progress: "설치 완료",
        type: "Sales",
        remarks: "",
        raw: {},
      },
    ]
    delete process.env.HARDWARE_SHEET_ADDITIVE_MERGE
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete process.env.HARDWARE_SHEET_ADDITIVE_MERGE
  })

  it("시트 행에서 확정한 어드민 기록만 취소하고, 사람이 직접 만든 기록은 건드리지 않는다", async () => {
    adminConvertedRows = [
      { id: "admin-from-sheet", product_name: '86" IFP', to_location: "남명학원", converted_from_movement_id: "sheet-1" },
      { id: "admin-from-admin", product_name: '86" IFP', to_location: "남명학원", converted_from_movement_id: "admin-planned-1" },
    ]
    sheetSourceRows = [{ id: "sheet-1" }]

    const { importHardwareFromBranchSheets } = await loadRepository()
    const result = await importHardwareFromBranchSheets({ actor: "ops@classin.kr" })

    expect(result.sheetWinsVoided).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].ids).toEqual(["admin-from-sheet"])
    expect(updates[0].payload).toMatchObject({
      voided_by: "ops@classin.kr",
      void_reason: expect.stringContaining("시트 가져오기 우선"),
    })
    // 지우지 않는다 — 취소로만 남겨 되돌릴 수 있게 한다.
    expect(updates[0].payload.voided_at).toEqual(expect.any(String))
  })

  it("정리는 교체가 끝난 뒤에 한다 — 가져오기가 먼저다", async () => {
    adminConvertedRows = [
      { id: "admin-from-sheet", product_name: '86" IFP', to_location: "남명학원", converted_from_movement_id: "sheet-1" },
    ]
    sheetSourceRows = [{ id: "sheet-1" }]

    const { importHardwareFromBranchSheets } = await loadRepository()
    await importHardwareFromBranchSheets({ actor: "ops@classin.kr" })

    expect(rpcCalls).toContain("replace_hardware_sheet_import")
    expect(updates).toHaveLength(1)
  })

  it("시트가 같은 물량을 다시 싣지 않으면 취소하지 않고 남긴다", async () => {
    adminConvertedRows = [
      { id: "admin-from-sheet", product_name: '86" IFP', to_location: "남명학원", converted_from_movement_id: "sheet-1" },
    ]
    sheetSourceRows = [{ id: "sheet-1" }]
    // 시트에서 그 줄이 사라졌다(운영자가 지웠거나 품목이 해석되지 않아 건너뛰었다).
    outboundSheetRows = []

    const { importHardwareFromBranchSheets } = await loadRepository()
    const result = await importHardwareFromBranchSheets({ actor: "ops@classin.kr" })

    // 취소하면 그 출하가 원장에서 통째로 사라진다 — 스냅샷도 시트 이관분만 담아 되돌리지 못한다.
    expect(result.sheetWinsVoided).toBe(0)
    expect(result.sheetWinsKept).toBe(1)
    expect(updates).toHaveLength(0)
  })

  it("취소할 것이 없으면 아무것도 건드리지 않는다", async () => {
    adminConvertedRows = []

    const { importHardwareFromBranchSheets } = await loadRepository()
    const result = await importHardwareFromBranchSheets({ actor: "ops@classin.kr" })

    expect(result.sheetWinsVoided).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it("추가형 머지 모드에서는 취소하지 않는다 — 머지는 확정 행을 human_locked 로 보호한다", async () => {
    process.env.HARDWARE_SHEET_ADDITIVE_MERGE = "1"
    adminConvertedRows = [
      { id: "admin-from-sheet", product_name: '86" IFP', to_location: "남명학원", converted_from_movement_id: "sheet-1" },
    ]
    sheetSourceRows = [{ id: "sheet-1" }]

    const { importHardwareFromBranchSheets } = await loadRepository()
    const result = await importHardwareFromBranchSheets({ actor: "ops@classin.kr" })

    expect(rpcCalls).toContain("merge_hardware_sheet_import")
    expect(result.sheetWinsVoided).toBe(0)
    expect(updates).toHaveLength(0)
  })
})
