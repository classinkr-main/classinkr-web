import { afterEach, describe, expect, it, vi } from "vitest"

import type { DistributorSettlementRecord } from "@/lib/distributor-settlements"

/**
 * 총판용 견적서 발행 서비스 — 고객 동의 자동 발행과 사람 발행(설치 완료)의 분기를 확인한다.
 *  - 발행 시점 설정이 다르면 자동 발행하지 않는다.
 *  - 고객 견적 버전이 바뀌었으면 자동 발행을 보류하고 재확인 알림을 남긴다.
 *  - 발행하면 토큰을 붙이고 총판 이메일을 보내 결과를 기록한다.
 */

const SETTLEMENT: DistributorSettlementRecord = {
  id: "ds_1",
  quoteDocumentId: "qd_1",
  dealId: "deal_1",
  fulfillmentMode: "C",
  sourceVersionId: "qv_1",
  issuedVersionId: null,
  distributorName: "하드웨어 총판",
  distributorContactName: null,
  distributorEmail: "dist@example.com",
  distributorPhone: null,
  issueTrigger: "on_accept",
  autoEmail: true,
  priceTemplateId: null,
  lines: [
    {
      sourceLineNumber: 1,
      itemCode: "board-86",
      itemName: '86" 전자칠판',
      itemType: "hardware",
      quantity: 1,
      customerUnitPrice: 6_300_000,
      unitPrice: 5_300_000,
      included: true,
    },
  ],
  vatIncluded: true,
  subtotalAmount: 5_300_000,
  vatAmount: 0,
  totalAmount: 5_300_000,
  customerTotalAmount: 6_300_000,
  status: "draft",
  paidAmount: 0,
  dueDate: "2026-11-30",
  issuedAt: null,
  issueReason: null,
  shareToken: null,
  emailStatus: "not_sent",
  emailedAt: null,
  emailError: null,
  reviewRequiredReason: null,
  notes: null,
  cancelledAt: null,
  installedAt: null,
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
}

async function loadService(options: {
  settlement?: Partial<DistributorSettlementRecord> | null
  versionId?: string
  emailResult?: { sent: number; failed: number; errors?: string[] }
}) {
  vi.resetModules()

  const settlement = options.settlement === null ? null : { ...SETTLEMENT, ...options.settlement }
  const markDistributorSettlementIssued = vi.fn(async (params: { shareToken: string; reason: string }) => ({
    ...SETTLEMENT,
    ...settlement,
    status: "issued" as const,
    shareToken: params.shareToken,
    issuedAt: "2026-10-23T01:00:00.000Z",
    issueReason: params.reason,
  }))
  const recordDistributorEmailResult = vi.fn(async (_id: string, result: { status: string }) => ({
    ...SETTLEMENT,
    status: "issued" as const,
    shareToken: "tok",
    emailStatus: result.status,
  }))
  const flagDistributorSettlementReview = vi.fn().mockResolvedValue(undefined)
  const markDistributorSettlementInstalled = vi.fn(async () => ({
    ...SETTLEMENT,
    ...settlement,
    status: "completed" as const,
    installedAt: "2026-11-02T03:00:00.000Z",
  }))
  const proposeLedgerDraftForInstallation = vi.fn().mockResolvedValue({ status: "created", draftId: "ld_9" })
  const emitNotificationEvent = vi.fn().mockResolvedValue({ id: "evt" })
  const sendEmail = vi.fn().mockResolvedValue(options.emailResult ?? { provider: "resend", sent: 1, failed: 0 })

  vi.doMock("@/lib/repositories/distributor-settlements", () => ({
    DistributorSettlementsNotReadyError: class extends Error {},
    getDistributorSettlementByQuote: vi.fn().mockResolvedValue({ available: true, warning: null, value: settlement }),
    markDistributorSettlementIssued,
    markDistributorSettlementInstalled,
    recordDistributorEmailResult,
    flagDistributorSettlementReview,
  }))
  vi.doMock("@/lib/admin/handoff/distributor-payment-to-ledger-draft", () => ({ proposeLedgerDraftForInstallation }))
  vi.doMock("@/lib/portal/repositories/quote-documents", () => ({
    getQuoteDocument: vi.fn().mockResolvedValue({ id: "qd_1", deal_id: "deal_1", quote_number: "Q-2026-001" }),
    getResolvableQuoteVersion: vi.fn().mockResolvedValue({
      id: options.versionId ?? "qv_1",
      version_number: 2,
      structured_json: null,
      valid_until: null,
      total_amount: 6_300_000,
    }),
  }))
  vi.doMock("@/lib/portal/repositories/deals", () => ({
    getDeal: vi.fn().mockResolvedValue({ id: "deal_1", customer_id: "cus_1" }),
  }))
  vi.doMock("@/lib/portal/repositories/customers", () => ({
    getCustomer: vi.fn().mockResolvedValue({ id: "cus_1", name: "테스트 학원" }),
  }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
  vi.doMock("@/lib/email", () => ({ sendEmail, wrapNotificationHtml: (title: string, body: string) => `${title}${body}` }))

  const service = await import("@/lib/server/distributor-settlement-issue")
  return {
    service,
    markDistributorSettlementIssued,
    recordDistributorEmailResult,
    flagDistributorSettlementReview,
    emitNotificationEvent,
    sendEmail,
    markDistributorSettlementInstalled,
    proposeLedgerDraftForInstallation,
  }
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe("issueDistributorSettlement", () => {
  it("issues on customer accept, sends the distributor email and notifies the team", async () => {
    const ctx = await loadService({})
    const outcome = await ctx.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "customer_accepted",
      mode: "auto",
      actor: "system",
      origin: "https://classin.co.kr",
    })

    expect(outcome.status).toBe("issued")
    if (outcome.status !== "issued") throw new Error("not issued")
    expect(outcome.shareUrl).toMatch(/^https:\/\/classin\.co\.kr\/share\/distributor-quote\/[0-9a-f]{48}$/)
    expect(ctx.markDistributorSettlementIssued).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "customer_accepted", issuedVersionId: "qv_1", customerTotalAmount: 6_300_000 })
    )
    expect(ctx.markDistributorSettlementIssued.mock.calls[0][0]).toMatchObject({ totals: { totalAmount: 5_300_000 } })
    expect(ctx.sendEmail).toHaveBeenCalledTimes(1)
    expect(ctx.sendEmail.mock.calls[0][0].to).toBe("dist@example.com")
    expect(ctx.recordDistributorEmailResult).toHaveBeenCalledWith("ds_1", expect.objectContaining({ status: "sent" }))
    expect(ctx.emitNotificationEvent.mock.calls[0][0].eventType).toBe("distributor_settlement.issued")
  })

  it("does not auto-issue when the settlement waits for installation", async () => {
    const ctx = await loadService({ settlement: { issueTrigger: "on_install" } })
    const outcome = await ctx.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "customer_accepted",
      mode: "auto",
      actor: "system",
    })
    expect(outcome.status).toBe("skipped")
    expect(ctx.markDistributorSettlementIssued).not.toHaveBeenCalled()
  })

  it("issues on installation completion when a person triggers it", async () => {
    const ctx = await loadService({ settlement: { issueTrigger: "on_install", distributorEmail: null } })
    const outcome = await ctx.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "installation_completed",
      mode: "manual",
      actor: "운영자",
    })
    expect(outcome.status).toBe("issued")
    expect(ctx.sendEmail).not.toHaveBeenCalled()
    expect(ctx.recordDistributorEmailResult).toHaveBeenCalledWith("ds_1", expect.objectContaining({ status: "skipped" }))
  })

  it("holds auto issue and asks for review when the customer quote changed", async () => {
    const ctx = await loadService({ versionId: "qv_2" })
    const outcome = await ctx.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "customer_accepted",
      mode: "auto",
      actor: "system",
    })
    expect(outcome.status).toBe("blocked")
    expect(ctx.markDistributorSettlementIssued).not.toHaveBeenCalled()
    expect(ctx.flagDistributorSettlementReview).toHaveBeenCalledWith("ds_1", expect.stringContaining("v2"))
    expect(ctx.emitNotificationEvent.mock.calls[0][0].eventType).toBe("distributor_settlement.review_required")
  })

  it("blocks issuing when a distributor price is missing", async () => {
    const ctx = await loadService({ settlement: { lines: [{ ...SETTLEMENT.lines[0], unitPrice: null }] } })
    const outcome = await ctx.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "manual",
      mode: "manual",
      actor: "운영자",
    })
    expect(outcome.status).toBe("blocked")
    // 사람이 누른 발행은 보류 플래그·알림 없이 사유만 돌려준다.
    expect(ctx.flagDistributorSettlementReview).not.toHaveBeenCalled()
  })

  it("is idempotent once issued and silent when no settlement exists", async () => {
    const issued = await loadService({ settlement: { status: "issued", shareToken: "tok", issuedAt: "2026-10-23" } })
    const again = await issued.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "customer_accepted",
      mode: "auto",
      actor: "system",
    })
    expect(again.status).toBe("already_issued")

    const none = await loadService({ settlement: null })
    const safe = await none.service.issueDistributorSettlementOnAcceptSafely({ quoteDocumentId: "qd_1" })
    expect(safe).toEqual({ status: "not_configured" })
  })

  it("records a failed email without undoing the issue", async () => {
    const ctx = await loadService({ emailResult: { sent: 0, failed: 1, errors: ["bounce"] } })
    const outcome = await ctx.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "customer_accepted",
      mode: "auto",
      actor: "system",
    })
    expect(outcome.status).toBe("issued")
    expect(ctx.recordDistributorEmailResult).toHaveBeenCalledWith("ds_1", { status: "failed", error: "bounce" })
  })
})

describe("H방식(총판 선매입)", () => {
  it("never issues a distributor quote, even on customer accept", async () => {
    const ctx = await loadService({ settlement: { fulfillmentMode: "H", issueTrigger: "on_install" } })
    const outcome = await ctx.service.issueDistributorSettlement({
      quoteDocumentId: "qd_1",
      reason: "customer_accepted",
      mode: "auto",
      actor: "system",
    })
    expect(outcome.status).toBe("skipped")
    expect(ctx.markDistributorSettlementIssued).not.toHaveBeenCalled()
    expect(ctx.sendEmail).not.toHaveBeenCalled()
  })

  it("records revenue at installation completion pressed by staff", async () => {
    const ctx = await loadService({ settlement: { fulfillmentMode: "H", issueTrigger: "on_install" } })
    const outcome = await ctx.service.completeHModeInstallation({ quoteDocumentId: "qd_1", actor: "운영자" })
    expect(outcome.status).toBe("completed")
    expect(ctx.markDistributorSettlementInstalled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ds_1", customerTotalAmount: 6_300_000 })
    )
    expect(ctx.proposeLedgerDraftForInstallation).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: "테스트 학원", quoteNumber: "Q-2026-001" })
    )
  })

  it("leaves C방식 installation to the distributor quote flow", async () => {
    const ctx = await loadService({})
    const outcome = await ctx.service.completeHModeInstallation({ quoteDocumentId: "qd_1", actor: "운영자" })
    expect(outcome.status).toBe("not_h_mode")
    expect(ctx.markDistributorSettlementInstalled).not.toHaveBeenCalled()
  })
})
