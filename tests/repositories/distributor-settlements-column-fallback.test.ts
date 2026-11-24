import { afterEach, describe, expect, it, vi } from "vitest"

// 20261124 칸(총판 확인·발행 후 수정)이 없는 DB — 기존 칸만으로 다시 읽고, 확인·수정 쓰기만 503 으로 막는다.

function makeClient(missing: boolean) {
  const selects: string[] = []
  const row = {
    id: "ds_1",
    quote_document_id: "qd_1",
    distributor_name: "퀴드러닝",
    issue_trigger: "on_accept",
    lines: [],
    status: "issued",
    created_at: "2026-11-24T00:00:00.000Z",
    updated_at: "2026-11-24T00:00:00.000Z",
  }
  const builder = (columns: string) => {
    selects.push(columns)
    const failing = missing && columns.includes("distributor_confirmed_at")
    const result = failing
      ? { data: null, error: { code: "42703", message: "column distributor_settlements.distributor_confirmed_at does not exist" } }
      : { data: row, error: null }
    const chain: Record<string, unknown> = {}
    for (const method of ["eq", "in", "is", "order", "limit", "update", "insert"]) chain[method] = () => chain
    chain.maybeSingle = () => Promise.resolve(result)
    chain.single = () => Promise.resolve(result)
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return chain
  }
  const client = { from: () => ({ select: builder, update: () => ({ eq: () => ({}) }) }) }
  return { client, selects }
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

async function load(missing: boolean) {
  vi.resetModules()
  const { client, selects } = makeClient(missing)
  vi.doMock("server-only", () => ({}))
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))
  const repo = await import("@/lib/repositories/distributor-settlements")
  return { repo, selects }
}

describe("새 칸 미적용 폴백", () => {
  it("새 칸이 없으면 기존 칸만으로 다시 읽고, 새 필드는 null 이다", async () => {
    const { repo, selects } = await load(true)
    const record = await repo.getDistributorSettlementByToken("t")
    expect(record?.id).toBe("ds_1")
    expect(record?.confirmedAt).toBeNull()
    expect(record?.revisedAt).toBeNull()
    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toContain("distributor_confirmed_at")
    expect(repo.areConfirmReviseColumnsKnownMissing()).toBe(true)
  })

  it("새 칸이 없으면 총판 확인 쓰기는 '적용 필요' 오류로 막는다", async () => {
    const { repo } = await load(true)
    await repo.getDistributorSettlementByToken("t")
    await expect(repo.confirmDistributorSettlementByToken({ token: "t", confirmedByName: null })).rejects.toThrow(
      /20261124_distributor_settlement_confirm_revise/
    )
  })

  it("새 칸이 없으면 할인·문구를 넣은 저장은 조용히 버리지 않고 '적용 필요'로 막는다", async () => {
    const { repo } = await load(true)
    const input = {
      fulfillmentMode: "C" as const,
      distributorName: "퀴드러닝",
      distributorContactName: null,
      distributorEmail: null,
      distributorPhone: null,
      issueTrigger: "on_accept" as const,
      autoEmail: true,
      priceTemplateId: null,
      lines: [],
      vatIncluded: true,
      dueDate: null,
      notes: null,
      discount: { mode: "amount" as const, value: 10_000 },
    }
    await expect(
      repo.saveDistributorSettlementDraft({
        quoteDocumentId: "qd_1",
        dealId: null,
        sourceVersionId: null,
        customerTotalAmount: 0,
        input,
        totals: { subtotalAmount: 0, discountAmount: 0, vatAmount: 0, totalAmount: 0, missingPriceCount: 0, includedCount: 0 },
        actor: "운영자",
      })
    ).rejects.toThrow(/20261124_distributor_settlement_confirm_revise/)
  })

  it("새 칸이 있으면 한 번에 읽는다", async () => {
    const { repo, selects } = await load(false)
    await repo.getDistributorSettlementByToken("t")
    expect(selects).toHaveLength(1)
    expect(selects[0]).toContain("distributor_confirmed_at")
    expect(repo.areConfirmReviseColumnsKnownMissing()).toBe(false)
  })
})
