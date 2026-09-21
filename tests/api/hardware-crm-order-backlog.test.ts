import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 입력 가속 P2-1 — "CRM 에 있는데 원장에 없는 출고" 목록.
// 참조번호가 맞으면 뺀다(확실). 시트 이관 행에는 딜 참조가 없어 참조로 대사할 수 없으므로,
// 고객사·품목이 겹치면 지우지 않고 표시한다(§8-6 이중 계상은 링크가 없어 자동 정리도 안 된다).

type Row = Record<string, unknown>

let dealLineItems: Row[] = []
let deals: Row[] = []
let customers: Row[] = []
let ledgerRows: Row[] = []

function selectChain(rows: Row[]) {
  const result = { data: rows, error: null }
  const chain: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const method of ["order", "limit", "ilike", "eq", "in", "is", "gt"]) {
    chain[method] = () => chain
  }
  return chain
}

function tableClient(table: string) {
  if (table === "deal_line_items") return { select: () => selectChain(dealLineItems) }
  if (table === "deals") return { select: () => selectChain(deals) }
  if (table === "customers") return { select: () => selectChain(customers) }
  if (table === "hardware_movements") return { select: () => selectChain(ledgerRows) }
  return {
    select: () => {
      throw new Error(`${table} unavailable in test`)
    },
  }
}

async function loadRepository() {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn((table: string) => tableClient(table)) })),
  }))
  vi.doMock("@/lib/portal/quote-details", () => ({
    normalizeQuoteDetailsFromStructuredJson: vi.fn(() => ({ lineItems: [] })),
  }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    fetchAllSupabaseRows: vi.fn(async () => ledgerRows),
  }))
  return import("@/lib/repositories/hardware-crm-orders")
}

describe("listHardwareCrmOrderBacklog", () => {
  beforeEach(() => {
    dealLineItems = [
      { id: "line-1", deal_id: "deal-1", product_name: '86" IFP', quantity: 2, amount: 100, updated_at: "2026-09-20" },
      { id: "line-2", deal_id: "deal-2", product_name: "T1", quantity: 4, amount: 50, updated_at: "2026-09-19" },
    ]
    deals = [
      { id: "deal-1", title: "가을 증설", status: "open", current_stage: null, customer_id: "cust-1", updated_at: "2026-09-20" },
      { id: "deal-2", title: "신규 캠퍼스", status: "open", current_stage: null, customer_id: "cust-2", updated_at: "2026-09-19" },
    ]
    customers = [
      { id: "cust-1", name: "남명학원", contact_name: null, campus_name: null },
      { id: "cust-2", name: "갈무리국어", contact_name: null, campus_name: null },
    ]
    ledgerRows = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("원장에 없는 CRM 라인을 등록 후보로 올린다", async () => {
    const { listHardwareCrmOrderBacklog } = await loadRepository()

    const result = await listHardwareCrmOrderBacklog()

    expect(result.entries.map((entry) => entry.customerName).sort()).toEqual(["갈무리국어", "남명학원"])
    expect(result.entries.every((entry) => entry.ledgerOverlap == null)).toBe(true)
  })

  it("참조번호가 원장에 이미 있으면 목록에서 뺀다", async () => {
    ledgerRows = [
      {
        id: "movement-1",
        product_name: '86" IFP',
        to_location: "남명학원",
        quantity: 2,
        occurred_at: "2026-09-20",
        status: "배송 예정",
        reference_no: "deal:deal-1:line:line-1",
        source: "admin_manual",
      },
    ]
    const { listHardwareCrmOrderBacklog } = await loadRepository()

    const result = await listHardwareCrmOrderBacklog()

    expect(result.entries.map((entry) => entry.customerName)).toEqual(["갈무리국어"])
  })

  it("시트 이관 출고와 고객사·품목이 겹치면 지우지 않고 표시한다", async () => {
    ledgerRows = [
      {
        id: "movement-sheet",
        product_name: '86" IFP',
        to_location: "남명학원",
        quantity: 2,
        occurred_at: "2026-09-18",
        status: "설치 완료",
        // 시트 이관 행에는 딜 참조가 없다 — 참조 대사로는 절대 걸리지 않는다.
        reference_no: "H8",
        source: "sheet_import",
      },
    ]
    const { listHardwareCrmOrderBacklog } = await loadRepository()

    const result = await listHardwareCrmOrderBacklog()

    const flagged = result.entries.find((entry) => entry.customerName === "남명학원")
    expect(flagged).toBeDefined()
    expect(flagged?.ledgerOverlap).toMatchObject({ quantity: 2, lastOccurredAt: "2026-09-18" })
    // 다른 고객사는 겹치지 않는다.
    expect(result.entries.find((entry) => entry.customerName === "갈무리국어")?.ledgerOverlap).toBeNull()
  })

  it("예정 출고는 겹침 근거가 아니다 — 아직 나가지 않은 물량이다", async () => {
    ledgerRows = [
      {
        id: "movement-planned",
        product_name: '86" IFP',
        to_location: "남명학원",
        quantity: 2,
        occurred_at: "2026-09-18",
        status: "배송 예정",
        reference_no: "H8",
        source: "sheet_import",
      },
    ]
    const { listHardwareCrmOrderBacklog } = await loadRepository()

    const result = await listHardwareCrmOrderBacklog()

    expect(result.entries.find((entry) => entry.customerName === "남명학원")?.ledgerOverlap).toBeNull()
  })

  it("짧은 품목명은 부분일치로 겹쳤다고 보지 않는다 — T1 이 DT1 에 걸리면 등록이 막힌다", async () => {
    ledgerRows = [
      {
        id: "movement-dt1",
        product_name: "DT1",
        to_location: "갈무리국어",
        quantity: 1,
        occurred_at: "2026-09-18",
        status: "설치 완료",
        reference_no: "H8",
        source: "sheet_import",
      },
    ]
    const { listHardwareCrmOrderBacklog } = await loadRepository()

    const result = await listHardwareCrmOrderBacklog()

    // T1 주문은 DT1 출고와 무관하다.
    expect(result.entries.find((entry) => entry.productName === "T1")?.ledgerOverlap).toBeNull()
  })

  it("품목·수량이 없는 후보(외부 CRM 오더)는 등록 후보로 올리지 않는다", async () => {
    dealLineItems = [
      { id: "line-3", deal_id: "deal-1", product_name: '86" IFP', quantity: 0, amount: 0, updated_at: "2026-09-20" },
    ]
    const { listHardwareCrmOrderBacklog } = await loadRepository()

    const result = await listHardwareCrmOrderBacklog()

    expect(result.entries).toEqual([])
  })
})
