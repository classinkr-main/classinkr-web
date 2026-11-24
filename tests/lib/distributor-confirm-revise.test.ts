import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildDistributorLinesFromQuote,
  getDistributorReviseBlocker,
  type DistributorSettlementLine,
  type DistributorSettlementRecord,
} from "@/lib/distributor-settlements"

// 총판 견적서 확인·수정(2026-11-24).
//  - 고객 동의 때 정산이 없으면 기본 정산을 만들어 같은 규칙으로 발행한다(고객이 확인하면 총판 견적서도 나온다).
//  - 총판이 링크에서 확인하면 처음 한 번만 확인 메일·사내 알림(메일 포함).
//  - 발행 뒤 금액 수정·직접 추가 줄. 받은 입금보다 작게 줄이지 못한다.

const HW_LINE: DistributorSettlementLine = {
  sourceLineNumber: 1,
  itemCode: "board-86",
  itemName: '86" 전자칠판',
  itemType: "hardware",
  quantity: 2,
  customerUnitPrice: 3_150_000,
  unitPrice: 2_650_000,
  included: true,
}
const CUSTOM_LINE: DistributorSettlementLine = {
  sourceLineNumber: 0,
  itemName: "배송비",
  itemType: "shipping",
  quantity: 1,
  customerUnitPrice: null,
  unitPrice: 50_000,
  included: true,
}

const BASE: DistributorSettlementRecord = {
  id: "ds_1",
  quoteDocumentId: "qd_1",
  dealId: "deal_1",
  fulfillmentMode: "C",
  sourceVersionId: "qv_1",
  issuedVersionId: "qv_1",
  distributorName: "퀴드러닝",
  distributorContactName: "배철웅",
  distributorEmail: "dist@example.com",
  distributorPhone: null,
  issueTrigger: "on_accept",
  autoEmail: true,
  priceTemplateId: null,
  lines: [HW_LINE],
  vatIncluded: true,
  subtotalAmount: 5_300_000,
  vatAmount: 0,
  totalAmount: 5_300_000,
  customerTotalAmount: 6_300_000,
  status: "issued",
  paidAmount: 0,
  dueDate: null,
  issuedAt: "2026-11-24T01:00:00.000Z",
  issueReason: "customer_accepted",
  shareToken: "a".repeat(48),
  emailStatus: "sent",
  emailedAt: null,
  emailError: null,
  reviewRequiredReason: null,
  notes: null,
  cancelledAt: null,
  installedAt: null,
  confirmedAt: null,
  confirmedByName: null,
  revisedAt: null,
  createdAt: "2026-11-24T00:00:00.000Z",
  updatedAt: "2026-11-24T00:00:00.000Z",
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe("직접 추가 줄 · 수정 가능 판정", () => {
  it("고객 견적에서 줄을 다시 만들어도 직접 추가한 줄은 뒤에 남는다", () => {
    const lines = buildDistributorLinesFromQuote(
      [{ sortOrder: 1, lineNumber: 1, itemType: "hardware", itemCode: "board-86", itemName: '86" 전자칠판', quantity: 2, unitPrice: 3_150_000 }],
      { previous: [HW_LINE, CUSTOM_LINE] }
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ sourceLineNumber: 1, unitPrice: 2_650_000 })
    expect(lines[1]).toEqual(CUSTOM_LINE)
  })

  it("받은 입금보다 작은 합계로는 고칠 수 없다", () => {
    expect(
      getDistributorReviseBlocker({ lines: [CUSTOM_LINE], vatIncluded: true, distributorName: "퀴드러닝", paidAmount: 100_000 })
    ).toMatch(/이미 받은 입금/)
    expect(
      getDistributorReviseBlocker({ lines: [HW_LINE, CUSTOM_LINE], vatIncluded: true, distributorName: "퀴드러닝", paidAmount: 100_000 })
    ).toBeNull()
  })

  it("원가가 빈 줄이 있으면 고칠 수 없다", () => {
    expect(
      getDistributorReviseBlocker({
        lines: [{ ...CUSTOM_LINE, unitPrice: null }],
        vatIncluded: true,
        distributorName: "퀴드러닝",
        paidAmount: 0,
      })
    ).toMatch(/원가/)
  })
})

async function loadService(options: {
  settlementSequence: Array<DistributorSettlementRecord | null>
  customerLines?: unknown[]
  templates?: Array<{ id: string; name: string; rules: unknown[]; notes: null; updatedAt: string }>
  confirmResult?: { status: string; settlement?: DistributorSettlementRecord }
}) {
  vi.resetModules()
  const sequence = [...options.settlementSequence]
  const getDistributorSettlementByQuote = vi.fn(async () => ({
    available: true,
    warning: null,
    value: sequence.length > 1 ? sequence.shift() ?? null : sequence[0] ?? null,
  }))
  const saveDistributorSettlementDraft = vi.fn(async () => ({ ...BASE, status: "draft" as const }))
  const markDistributorSettlementIssued = vi.fn(async (params: { shareToken: string }) => ({
    ...BASE,
    shareToken: params.shareToken,
  }))
  const recordDistributorEmailResult = vi.fn(async (_id: string, result: { status: string }) => ({
    ...BASE,
    emailStatus: result.status as DistributorSettlementRecord["emailStatus"],
  }))
  const confirmDistributorSettlementByToken = vi.fn(async () => options.confirmResult ?? { status: "not_found" })
  const emitNotificationEvent = vi.fn().mockResolvedValue({ id: "evt" })
  const sendEmail = vi.fn().mockResolvedValue({ provider: "resend", sent: 1, failed: 0 })

  vi.doMock("@/lib/repositories/distributor-settlements", () => ({
    DistributorSettlementsNotReadyError: class extends Error {},
    getDistributorSettlementByQuote,
    saveDistributorSettlementDraft,
    markDistributorSettlementIssued,
    markDistributorSettlementInstalled: vi.fn(),
    recordDistributorEmailResult,
    flagDistributorSettlementReview: vi.fn().mockResolvedValue(undefined),
    listDistributorPriceTemplates: vi.fn().mockResolvedValue({ available: true, warning: null, value: options.templates ?? [] }),
    getLatestDistributorContact: vi.fn().mockResolvedValue(null),
    confirmDistributorSettlementByToken,
  }))
  vi.doMock("@/lib/admin/handoff/distributor-payment-to-ledger-draft", () => ({ proposeLedgerDraftForInstallation: vi.fn() }))
  vi.doMock("@/lib/portal/repositories/quote-documents", () => ({
    getQuoteDocument: vi.fn().mockResolvedValue({ id: "qd_1", deal_id: "deal_1", quote_number: "Q-2026-014" }),
    getResolvableQuoteVersion: vi.fn().mockResolvedValue({
      id: "qv_1",
      version_number: 1,
      structured_json: { lineItems: options.customerLines ?? [] },
      valid_until: null,
      total_amount: 6_300_000,
    }),
  }))
  vi.doMock("@/lib/portal/quote-details", () => ({
    getQuoteDetailsFromStructuredJson: (json: { lineItems?: unknown[] } | null) => ({ lineItems: json?.lineItems ?? [] }),
  }))
  vi.doMock("@/lib/portal/repositories/deals", () => ({ getDeal: vi.fn().mockResolvedValue({ id: "deal_1", customer_id: "c_1" }) }))
  vi.doMock("@/lib/portal/repositories/customers", () => ({ getCustomer: vi.fn().mockResolvedValue({ id: "c_1", name: "한빛학원" }) }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
  vi.doMock("@/lib/email", () => ({ sendEmail, wrapNotificationHtml: (title: string, body: string) => `${title}${body}` }))

  const service = await import("@/lib/server/distributor-settlement-issue")
  return {
    service,
    saveDistributorSettlementDraft,
    markDistributorSettlementIssued,
    confirmDistributorSettlementByToken,
    emitNotificationEvent,
    sendEmail,
  }
}

const HW_CUSTOMER_LINE = { lineNumber: 1, itemType: "hardware", itemCode: "board-86", itemName: '86" 전자칠판', quantity: 2, unitPrice: 3_150_000 }
const TEMPLATE = {
  id: "tpl_1",
  name: "기본 원가",
  rules: [{ itemCode: "board-86", minQuantity: 1, unitPrice: 2_650_000 }],
  notes: null,
  updatedAt: "2026-11-01T00:00:00.000Z",
}

describe("고객 동의 → 총판 견적서", () => {
  it("정산이 없으면 기본 정산(C방식·동의 시 발행)을 만들고 바로 발행한다", async () => {
    const ctx = await loadService({
      settlementSequence: [null, null, { ...BASE, status: "draft", shareToken: null }],
      customerLines: [HW_CUSTOMER_LINE],
      templates: [TEMPLATE],
    })
    const outcome = await ctx.service.issueDistributorSettlementOnAcceptSafely({ quoteDocumentId: "qd_1" })

    expect(ctx.saveDistributorSettlementDraft).toHaveBeenCalledTimes(1)
    const saved = ctx.saveDistributorSettlementDraft.mock.calls[0] as unknown as [
      { input: { fulfillmentMode: string; issueTrigger: string; lines: DistributorSettlementLine[]; priceTemplateId: string } },
    ]
    expect(saved[0].input).toMatchObject({ fulfillmentMode: "C", issueTrigger: "on_accept", priceTemplateId: "tpl_1" })
    expect(saved[0].input.lines[0]).toMatchObject({ unitPrice: 2_650_000, included: true })
    expect(outcome?.status).toBe("issued")
    expect(ctx.markDistributorSettlementIssued).toHaveBeenCalledTimes(1)
    expect(ctx.sendEmail.mock.calls[0][0].html).toContain("[견적 확인]")
  })

  it("총판에게 청구할 품목(하드웨어·AI Suite)이 없는 견적은 만들지 않는다", async () => {
    const ctx = await loadService({
      settlementSequence: [null],
      customerLines: [{ lineNumber: 1, itemType: "service", itemCode: "training", itemName: "교육", quantity: 1, unitPrice: 300_000 }],
    })
    const outcome = await ctx.service.issueDistributorSettlementOnAcceptSafely({ quoteDocumentId: "qd_1" })
    expect(ctx.saveDistributorSettlementDraft).not.toHaveBeenCalled()
    expect(outcome?.status).toBe("not_configured")
  })

  it("취소한 정산은 되살리지 않는다", async () => {
    const ctx = await loadService({
      settlementSequence: [{ ...BASE, status: "cancelled", shareToken: null }],
      customerLines: [HW_CUSTOMER_LINE],
    })
    await ctx.service.issueDistributorSettlementOnAcceptSafely({ quoteDocumentId: "qd_1" })
    expect(ctx.saveDistributorSettlementDraft).not.toHaveBeenCalled()
    expect(ctx.markDistributorSettlementIssued).not.toHaveBeenCalled()
  })
})

describe("총판 확인", () => {
  it("처음 확인하면 총판에게 확인 메일, 사내에 메일 포함 알림을 보낸다", async () => {
    const confirmed = { ...BASE, confirmedAt: "2026-11-24T02:00:00.000Z", confirmedByName: "배철웅" }
    const ctx = await loadService({ settlementSequence: [BASE], confirmResult: { status: "confirmed", settlement: confirmed } })
    const outcome = await ctx.service.confirmDistributorQuote({ token: BASE.shareToken!, confirmedByName: "배철웅" })

    expect(outcome.status).toBe("confirmed")
    expect(ctx.sendEmail).toHaveBeenCalledTimes(1)
    expect(ctx.sendEmail.mock.calls[0][0]).toMatchObject({ to: "dist@example.com" })
    expect(ctx.sendEmail.mock.calls[0][0].subject).toContain("확인 완료")
    const event = ctx.emitNotificationEvent.mock.calls[0][0]
    expect(event.eventType).toBe("distributor_settlement.confirmed")
    expect(event.channels).toEqual(["wecom_webhook", "email"])
  })

  it("이미 확인한 링크를 다시 눌러도 메일·알림을 다시 보내지 않는다", async () => {
    const ctx = await loadService({
      settlementSequence: [BASE],
      confirmResult: { status: "already_confirmed", settlement: { ...BASE, confirmedAt: "2026-11-24T02:00:00.000Z" } },
    })
    const outcome = await ctx.service.confirmDistributorQuote({ token: BASE.shareToken!, confirmedByName: null })
    expect(outcome.status).toBe("already_confirmed")
    expect(ctx.sendEmail).not.toHaveBeenCalled()
    expect(ctx.emitNotificationEvent).not.toHaveBeenCalled()
  })
})

describe("발행 후 금액 수정 알림", () => {
  it("자동 메일이면 총판에게 [수정] 메일을 보낸다", async () => {
    const ctx = await loadService({ settlementSequence: [BASE] })
    await ctx.service.notifyDistributorSettlementRevised({
      settlement: { ...BASE, totalAmount: 5_350_000, lines: [HW_LINE, CUSTOM_LINE] },
      previousTotalAmount: 5_300_000,
      actor: "운영자",
    })
    expect(ctx.sendEmail.mock.calls[0][0].subject).toContain("[수정]")
    expect(ctx.emitNotificationEvent.mock.calls[0][0].eventType).toBe("distributor_settlement.revised")
  })

  it("자동 메일이 꺼져 있으면 메일 없이 사내 알림만 남긴다", async () => {
    const ctx = await loadService({ settlementSequence: [BASE] })
    await ctx.service.notifyDistributorSettlementRevised({
      settlement: { ...BASE, autoEmail: false },
      previousTotalAmount: 5_300_000,
      actor: "운영자",
    })
    expect(ctx.sendEmail).not.toHaveBeenCalled()
    expect(ctx.emitNotificationEvent).toHaveBeenCalledTimes(1)
  })
})
