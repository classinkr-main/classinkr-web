import { afterEach, describe, expect, it, vi } from "vitest"

import type { DistributorSettlementPayment, DistributorSettlementRecord } from "@/lib/distributor-settlements"

/**
 * C1 매출 = 총판 원가 입금 확인 시점. 입금 1건마다 매출 원장 입력 큐에 초안을 올리고(입금월 · CNY 0 · KRW 참고),
 * 입금 기록을 지우면 아직 draft 인 초안만 함께 지운다.
 */

const SETTLEMENT = {
  id: "ds_1",
  quoteDocumentId: "qd_1",
  dealId: "deal_1",
  distributorName: "하드웨어 총판",
} as DistributorSettlementRecord

const PAYMENT: DistributorSettlementPayment = {
  id: "pay_1",
  settlementId: "ds_1",
  amount: 5_300_000,
  paidOn: "2026-11-05",
  memo: null,
  createdBy: "운영자",
  createdAt: "2026-11-05T01:00:00.000Z",
}

function supabaseReturning(rows: Array<{ id: string; status: string; metadata: Record<string, unknown> }>, error: unknown = null) {
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (value: { data: typeof rows; error: unknown }) => unknown) => resolve({ data: rows, error }),
  }
  return { from: () => query }
}

async function loadHandoff(options: {
  existing?: Array<{ id: string; status: string; metadata: Record<string, unknown> }>
  dedupedRecent?: boolean
  lookupError?: unknown
}) {
  vi.resetModules()
  const createBranchSalesLedgerDraft = vi.fn().mockResolvedValue({
    draft: { id: "ld_1" },
    dedupedRecent: options.dedupedRecent ?? false,
  })
  const deleteBranchSalesLedgerDraft = vi.fn().mockResolvedValue(true)
  vi.doMock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
    createBranchSalesLedgerDraft,
    deleteBranchSalesLedgerDraft,
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => supabaseReturning(options.existing ?? [], options.lookupError ?? null),
  }))
  const handoff = await import("@/lib/admin/handoff/distributor-payment-to-ledger-draft")
  return { handoff, createBranchSalesLedgerDraft, deleteBranchSalesLedgerDraft }
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe("proposeLedgerDraftForDistributorPayment", () => {
  it("proposes a confirmed revenue draft in the payment month without currency conversion", async () => {
    const ctx = await loadHandoff({})
    const result = await ctx.handoff.proposeLedgerDraftForDistributorPayment({
      settlement: SETTLEMENT,
      payment: PAYMENT,
      customerName: "테스트 학원",
      quoteNumber: "Q-2026-001",
    })

    expect(result).toEqual({ status: "created", draftId: "ld_1" })
    const [input, actor] = ctx.createBranchSalesLedgerDraft.mock.calls[0]
    expect(actor).toBe("system:distributor-payment")
    expect(input).toMatchObject({
      kind: "new-row",
      sourceDealId: "deal_1",
      customer: "테스트 학원",
      month: "2026-11",
      amount: 0,
      currency: "CNY",
      metadata: {
        operation: "distributor-payment-confirmed",
        confidence: "confirmed",
        sourceDistributorPaymentId: "pay_1",
        sourceDistributorSettlementId: "ds_1",
        sourceAmount: 5_300_000,
        sourceAmountCurrency: "KRW",
      },
    })
    expect(input.note).toContain("₩5,300,000")
    expect(input.note).toContain("Q-2026-001")
  })

  it("does not create a second draft for the same payment", async () => {
    const ctx = await loadHandoff({ existing: [{ id: "ld_0", status: "draft", metadata: {} }] })
    const result = await ctx.handoff.proposeLedgerDraftForDistributorPayment({
      settlement: SETTLEMENT,
      payment: PAYMENT,
      customerName: null,
      quoteNumber: null,
    })
    expect(result.status).toBe("skipped")
    expect(ctx.createBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })

  it("never throws when the ledger table is unavailable", async () => {
    const ctx = await loadHandoff({ lookupError: { message: "relation does not exist" } })
    const result = await ctx.handoff.proposeLedgerDraftForDistributorPayment({
      settlement: SETTLEMENT,
      payment: PAYMENT,
      customerName: null,
      quoteNumber: null,
    })
    expect(result.status).toBe("skipped")
  })

  it("reports when the ledger merged it into a recent identical draft", async () => {
    const ctx = await loadHandoff({ dedupedRecent: true })
    const result = await ctx.handoff.proposeLedgerDraftForDistributorPayment({
      settlement: SETTLEMENT,
      payment: PAYMENT,
      customerName: "테스트 학원",
      quoteNumber: null,
    })
    expect(result).toEqual({ status: "skipped", reason: "merged-into-recent-draft:ld_1" })
  })
})

describe("withdrawLedgerDraftForDistributorPayment", () => {
  it("removes drafts that are not yet checked", async () => {
    const ctx = await loadHandoff({ existing: [{ id: "ld_1", status: "draft", metadata: {} }] })
    expect(await ctx.handoff.withdrawLedgerDraftForDistributorPayment("pay_1")).toEqual({ status: "removed" })
    expect(ctx.deleteBranchSalesLedgerDraft).toHaveBeenCalledWith("ld_1")
  })

  it("keeps checked or applied drafts for manual correction in the ledger", async () => {
    const ctx = await loadHandoff({ existing: [{ id: "ld_1", status: "applied", metadata: {} }] })
    expect(await ctx.handoff.withdrawLedgerDraftForDistributorPayment("pay_1")).toEqual({
      status: "kept",
      draftStatus: "applied",
    })
    expect(ctx.deleteBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })
})
