import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 입력 가속 P1-2 — CRM 오더 후보가 품목·수량만 보던 것을 고객사까지 보게 했다.
// 같은 품목·수량의 딜이 여럿일 때 기록 중인 고객사와 맞는 후보가 맨 위로 와야 확인이 한 번에 끝난다.
//
// 목킹은 CRM 딜 라인 경로만 채운다 — 나머지 세 소스(포털 견적·레거시 견적·외부 CRM)는 테이블이
// 없어 실패하고 warnings 로만 남는다(listHardwareCrmOrderCandidates 의 allSettled 계약).

type Row = Record<string, unknown>

let dealLineItems: Row[] = []
let deals: Row[] = []
let customers: Row[] = []

// PostgREST 빌더처럼 체인 자체가 thenable 이어야 한다 — 실코드가 .limit() 뒤에 .ilike() 를 더 붙인다.
function selectChain(rows: Row[]) {
  const result = { data: rows, error: null }
  const chain: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const method of ["order", "limit", "ilike", "eq", "in"]) {
    chain[method] = () => chain
  }
  return chain
}

function tableClient(table: string) {
  if (table === "deal_line_items") return { select: () => selectChain(dealLineItems) }
  if (table === "deals") return { select: () => selectChain(deals) }
  if (table === "customers") return { select: () => selectChain(customers) }
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
  return import("@/lib/repositories/hardware-crm-orders")
}

describe("listHardwareCrmOrderCandidates — 고객사 신호", () => {
  beforeEach(() => {
    dealLineItems = [
      { id: "line-1", deal_id: "deal-1", product_name: '86" IFP', quantity: 2, amount: 100, updated_at: "2026-09-01" },
      { id: "line-2", deal_id: "deal-2", product_name: '86" IFP', quantity: 2, amount: 100, updated_at: "2026-09-02" },
    ]
    deals = [
      { id: "deal-1", title: "가을 증설", status: "open", current_stage: null, customer_id: "cust-1", updated_at: "2026-09-01" },
      { id: "deal-2", title: "신규 캠퍼스", status: "open", current_stage: null, customer_id: "cust-2", updated_at: "2026-09-02" },
    ]
    customers = [
      { id: "cust-1", name: "남명학원", contact_name: null, campus_name: null },
      { id: "cust-2", name: "갈무리국어", contact_name: null, campus_name: null },
    ]
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("고객사를 주지 않으면 품목·수량만 보므로 두 딜이 같은 신뢰도로 남는다", async () => {
    const { listHardwareCrmOrderCandidates } = await loadRepository()

    const result = await listHardwareCrmOrderCandidates({ productName: '86" IFP', quantity: 2 })

    expect(result.candidates).toHaveLength(2)
    expect(new Set(result.candidates.map((candidate) => candidate.confidence))).toEqual(new Set(["high"]))
  })

  it("고객사가 맞는 후보를 맨 위로 올리고 이유에 밝힌다", async () => {
    const { listHardwareCrmOrderCandidates } = await loadRepository()

    // 남명학원 딜이 더 **오래된** 쪽이다 — 신뢰도·최신순만으로는 갈무리국어가 맨 위에 온다.
    const result = await listHardwareCrmOrderCandidates({
      productName: '86" IFP',
      quantity: 2,
      customerName: "남명학원",
    })

    expect(result.candidates[0]).toMatchObject({
      customerName: "남명학원",
      confidence: "high",
    })
    expect(result.candidates[0].reason).toContain("고객사가 일치합니다")
    // 다른 고객사의 후보는 지우지 않는다 — 오프라인 판매처럼 CRM 표기가 다른 건을 숨기면 찾을 길이 없다.
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[1].reason).not.toContain("고객사가 일치합니다")
  })

  it("고객사 이름이 부분만 같아도(본원·캠퍼스 표기) 같은 고객사로 본다", async () => {
    const { listHardwareCrmOrderCandidates } = await loadRepository()

    const result = await listHardwareCrmOrderCandidates({
      productName: '86" IFP',
      quantity: 2,
      customerName: "남명학원 본원",
    })

    expect(result.candidates[0]).toMatchObject({ customerName: "남명학원" })
    expect(result.candidates[0].reason).toContain("고객사가 일치합니다")
  })

  it("한 글자 이름은 신호로 쓰지 않는다(우연한 겹침 방지)", async () => {
    const { listHardwareCrmOrderCandidates } = await loadRepository()

    const result = await listHardwareCrmOrderCandidates({ productName: '86" IFP', quantity: 2, customerName: "남" })

    expect(result.candidates.every((candidate) => !candidate.reason.includes("고객사가 일치합니다"))).toBe(true)
  })
})
