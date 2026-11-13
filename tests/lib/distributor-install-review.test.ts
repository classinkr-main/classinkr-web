import { afterEach, describe, expect, it, vi } from "vitest"

import {
  INSTALL_REVIEW_PREFIX,
  buildInstallReviewReason,
  inferFulfillmentModeFromLot,
  inferFulfillmentModeFromLots,
  isInstallReviewReason,
  reviewReasonAfterSave,
  type DistributorSettlementRecord,
} from "@/lib/distributor-settlements"
import { buildConfigurableStandardQuoteDetails, finalizeStandardQuoteDetails, resolveQuoteSupplier } from "@/lib/standard-quote-template"

/**
 * 설치 완료 → 총판 정산 자동 준비 · 검토 요청(2026-11).
 * 재고 앱에서 오더의 배송 예정을 출고 확정하면 정산을 자동으로 만들거나(없을 때) 기존 초안을 그대로 두고,
 * 검토 요청 사유와 팀 알림을 남긴다. 자동 발행·자동 매출은 하지 않는다.
 */

describe("설치 완료 검토 — 규칙", () => {
  it("로트 이름 첫 글자로 방식을 안다(C1 = C, H1~H8 = H)", () => {
    expect(inferFulfillmentModeFromLot("C1")).toBe("C")
    expect(inferFulfillmentModeFromLot(" h3 ")).toBe("H")
    expect(inferFulfillmentModeFromLot("H8-2")).toBe("H")
    expect(inferFulfillmentModeFromLot(null)).toBeNull()
    expect(inferFulfillmentModeFromLot("CN-001")).toBeNull()
  })

  it("출고 확정 한 번에 로트가 여러 개면 방식이 하나로 모일 때만 그 방식이다", () => {
    expect(inferFulfillmentModeFromLots(["C1", "C1"])).toEqual({ mode: "C", mixed: false, label: "C1" })
    expect(inferFulfillmentModeFromLots(["H3", "H8"])).toEqual({ mode: "H", mixed: false, label: "H3·H8" })
    expect(inferFulfillmentModeFromLots(["C1", "H8"])).toEqual({ mode: null, mixed: true, label: "C1·H8" })
    expect(inferFulfillmentModeFromLots([null, undefined])).toEqual({ mode: null, mixed: false, label: "" })
  })

  it("C방식 사유: 출고일·로트·자동 생성·빈 원가·다음 행동을 담는다", () => {
    const reason = buildInstallReviewReason({
      mode: "C",
      installedOn: "2026-11-10",
      created: true,
      lotNo: "C1",
      lotMode: "C",
      missingPriceCount: 2,
    })
    expect(reason.startsWith(INSTALL_REVIEW_PREFIX)).toBe(true)
    expect(reason).toContain("2026-11-10 출고 확정, 로트 C1")
    expect(reason).toContain("총판 견적서 초안을 자동으로 만들었습니다")
    expect(reason).toContain("원가가 빈 품목 2개")
    expect(reason).toContain("'검토 완료' 버튼으로 총판 견적서를 발행")
    expect(reason.length).toBeLessThanOrEqual(300)
  })

  it("로트 방식과 저장된 방식이 다르거나 고객 견적이 바뀌었으면 함께 알린다", () => {
    const reason = buildInstallReviewReason({
      mode: "C",
      installedOn: null,
      created: false,
      lotNo: "H3",
      lotMode: "H",
      missingPriceCount: 0,
      quoteVersionChangedTo: 3,
    })
    expect(reason).toContain("로트는 H방식인데 정산은 C방식입니다")
    expect(reason).toContain("고객 견적이 v3로 바뀌어")
    expect(reason).toContain("초안이 준비됐습니다")
  })

  it("H방식 사유는 매출 잡기를 안내한다(총판 견적서 없음)", () => {
    const reason = buildInstallReviewReason({ mode: "H", installedOn: "2026-11-10", created: true, lotNo: "H3", lotMode: "H", missingPriceCount: 0 })
    expect(reason).toContain("H방식 정산을 자동으로 만들었습니다")
    expect(reason).toContain("매출을 잡아 주세요")
    expect(reason).not.toContain("총판 견적서")
  })

  it("사람이 다시 저장해도 설치 완료 검토 요청은 발행 전까지 남고, 다른 보류 사유는 해소된다", () => {
    const install = buildInstallReviewReason({ mode: "C", installedOn: "2026-11-10", created: true, lotNo: "C1", missingPriceCount: 1 })
    const kept = reviewReasonAfterSave(install)
    expect(isInstallReviewReason(kept)).toBe(true)
    expect(kept).toContain("2026-11-10 출고 확정")
    expect(kept).not.toContain("원가가 빈 품목") // 저장으로 해소됐을 수 있는 세부는 지운다
    expect(reviewReasonAfterSave("고객 견적이 v2로 바뀌었습니다.")).toBeNull()
    expect(reviewReasonAfterSave(null)).toBeNull()
  })
})

/* ─── 서버 처리 ─────────────────────────────────────────────── */

const CUSTOMER_QUOTE = finalizeStandardQuoteDetails(
  {
    ...buildConfigurableStandardQuoteDetails({ templateId: "recording_studio", baseQuantity: 2 }),
    ...resolveQuoteSupplier("recording_studio"),
    recipientCompanyName: "성남여고",
  },
  "recording_studio"
)

const DRAFT: DistributorSettlementRecord = {
  id: "ds_1",
  quoteDocumentId: "qd_1",
  dealId: "deal_1",
  fulfillmentMode: "C",
  sourceVersionId: "qv_1",
  issuedVersionId: null,
  distributorName: "퀴드러닝",
  distributorContactName: "배철웅",
  distributorEmail: null,
  distributorPhone: "010-9238-5874",
  issueTrigger: "on_accept",
  autoEmail: true,
  priceTemplateId: null,
  lines: [
    {
      sourceLineNumber: 1,
      itemCode: "ai-studio-recording-set",
      itemName: "올인원 녹화수업 세트",
      itemType: "hardware",
      quantity: 2,
      customerUnitPrice: 8_300_000,
      unitPrice: 6_400_000,
      included: true,
    },
  ],
  vatIncluded: true,
  subtotalAmount: 12_800_000,
  vatAmount: 0,
  totalAmount: 12_800_000,
  customerTotalAmount: 16_600_000,
  status: "draft",
  paidAmount: 0,
  dueDate: null,
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
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
}

const TEMPLATE = {
  id: "tpl_1",
  name: "C1 원가",
  rules: [{ itemCode: "ai-studio-recording-set", minQuantity: 1, unitPrice: 6_500_000 }],
  notes: null,
  updatedAt: "2026-10-30T00:00:00.000Z",
}

async function loadService(options: {
  order?: { quote_document_id: string | null; deal_id: string | null; status: string } | null
  settlement?: Partial<DistributorSettlementRecord> | null
  templates?: (typeof TEMPLATE)[]
  versionId?: string
  orderError?: boolean
}) {
  vi.resetModules()

  const order = options.order === undefined ? { quote_document_id: "qd_1", deal_id: "deal_1", status: "approved" } : options.order
  const settlement = options.settlement == null ? null : { ...DRAFT, ...options.settlement }
  const saveDistributorSettlementDraft = vi.fn(
    async (params: { input: { fulfillmentMode: "C" | "H"; lines: DistributorSettlementRecord["lines"]; issueTrigger: string; priceTemplateId: string | null; distributorName: string; distributorContactName: string | null }; sourceVersionId: string | null }) => ({
      ...DRAFT,
      id: "ds_new",
      fulfillmentMode: params.input.fulfillmentMode,
      issueTrigger: params.input.issueTrigger as DistributorSettlementRecord["issueTrigger"],
      priceTemplateId: params.input.priceTemplateId,
      distributorName: params.input.distributorName,
      distributorContactName: params.input.distributorContactName,
      sourceVersionId: params.sourceVersionId,
      lines: params.input.lines,
    })
  )
  const flagDistributorSettlementReview = vi.fn().mockResolvedValue(undefined)
  const emitNotificationEvent = vi.fn().mockResolvedValue({ id: "evt" })
  const limit = options.orderError
    ? vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } })
    : vi.fn().mockResolvedValue({ data: order ? [order] : [], error: null })

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit }) }) }) }),
  }))
  vi.doMock("@/lib/repositories/distributor-settlements", () => ({
    getDistributorSettlementByQuote: vi.fn().mockResolvedValue({ available: true, warning: null, value: settlement }),
    getLatestDistributorContact: vi.fn().mockResolvedValue(null),
    listDistributorPriceTemplates: vi.fn().mockResolvedValue({ available: true, warning: null, value: options.templates ?? [TEMPLATE] }),
    saveDistributorSettlementDraft,
    flagDistributorSettlementReview,
  }))
  vi.doMock("@/lib/server/distributor-settlement-issue", () => ({
    loadQuoteContext: vi.fn().mockResolvedValue({
      document: { id: "qd_1", deal_id: "deal_1", quote_number: "Q-2026-0042" },
      version: {
        id: options.versionId ?? "qv_1",
        version_number: 3,
        structured_json: { quoteDetails: CUSTOMER_QUOTE },
        valid_until: null,
        total_amount: 16_600_000,
      },
      customerName: "성남여고",
    }),
  }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))

  const service = await import("@/lib/server/distributor-settlement-install")
  return { service, saveDistributorSettlementDraft, flagDistributorSettlementReview, emitNotificationEvent }
}

const MOVEMENT = { raw: { sales_order_id: "so_1" }, lot_no: "C1", occurred_at: "2026-11-10T00:00:00.000Z" }

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe("설치 완료 → 총판 정산 자동 준비 · 검토 요청", () => {
  it("정산이 없으면 C1 로트로 C방식 초안을 자동으로 만들고(원가 템플릿 적용) 검토를 요청한다", async () => {
    const { service, saveDistributorSettlementDraft, flagDistributorSettlementReview, emitNotificationEvent } = await loadService({})
    const outcome = await service.requestDistributorReviewOnInstall(MOVEMENT)

    expect(outcome.status).toBe("review_requested")
    const params = saveDistributorSettlementDraft.mock.calls[0][0]
    expect(params.input).toMatchObject({
      fulfillmentMode: "C",
      issueTrigger: "on_install",
      priceTemplateId: "tpl_1",
      distributorName: "퀴드러닝",
      distributorContactName: "배철웅",
    })
    // 녹화 세트만 포함, 안내 줄은 빠지고, 원가는 템플릿 값.
    expect(params.input.lines).toHaveLength(1)
    expect(params.input.lines[0]).toMatchObject({ itemCode: "ai-studio-recording-set", quantity: 2, unitPrice: 6_500_000, included: true })
    expect(params.sourceVersionId).toBe("qv_1")

    const [id, reason] = flagDistributorSettlementReview.mock.calls[0]
    expect(id).toBe("ds_new")
    expect(reason).toContain("2026-11-10 출고 확정, 로트 C1")
    expect(reason).toContain("자동으로 만들었습니다")
    expect(reason).not.toContain("원가가 빈 품목")

    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent.mock.calls[0][0]).toMatchObject({
      eventType: "distributor_settlement.install_review",
      notificationType: "action_required",
      routeUrl: "/admin/quotes?tab=hardware&quote=qd_1",
    })
  })

  it("H 로트면 H방식 정산을 만들고 매출 잡기 검토를 요청한다(자동 매출 없음)", async () => {
    const { service, saveDistributorSettlementDraft, flagDistributorSettlementReview } = await loadService({})
    const outcome = await service.requestDistributorReviewOnInstall({ ...MOVEMENT, lot_no: "H3" })
    expect(outcome).toMatchObject({ status: "review_requested", mode: "H", created: true })
    expect(saveDistributorSettlementDraft.mock.calls[0][0].input.fulfillmentMode).toBe("H")
    expect(flagDistributorSettlementReview.mock.calls[0][1]).toContain("매출을 잡아 주세요")
  })

  it("C·H 로트가 섞인 출고 확정은 기본 C방식으로 만들고 방식을 확인하라고 적는다", async () => {
    const { service, saveDistributorSettlementDraft, flagDistributorSettlementReview } = await loadService({})
    await service.requestDistributorReviewOnInstall({ ...MOVEMENT, lotNos: ["C1", "H8"] })
    expect(saveDistributorSettlementDraft.mock.calls[0][0].input.fulfillmentMode).toBe("C")
    const reason = flagDistributorSettlementReview.mock.calls[0][1]
    expect(reason).toContain("로트 C1·H8")
    expect(reason).toContain("로트 방식이 섞여 있습니다")
  })

  it("로트를 모르고 원가 템플릿이 여러 개면 C방식으로 만들되 원가는 비워 사람이 고르게 한다", async () => {
    const { service, saveDistributorSettlementDraft, flagDistributorSettlementReview } = await loadService({
      templates: [TEMPLATE, { ...TEMPLATE, id: "tpl_2", name: "대량 원가" }],
    })
    await service.requestDistributorReviewOnInstall({ ...MOVEMENT, lot_no: null })
    const input = saveDistributorSettlementDraft.mock.calls[0][0].input
    expect(input.fulfillmentMode).toBe("C")
    expect(input.priceTemplateId).toBeNull()
    expect(input.lines[0].unitPrice).toBeNull()
    expect(flagDistributorSettlementReview.mock.calls[0][1]).toContain("원가가 빈 품목 1개")
  })

  it("발행 전 정산이 있으면 사람이 정한 원가를 건드리지 않고 검토만 요청한다(로트·버전 차이도 알린다)", async () => {
    const { service, saveDistributorSettlementDraft, flagDistributorSettlementReview } = await loadService({
      settlement: {},
      versionId: "qv_2",
    })
    const outcome = await service.requestDistributorReviewOnInstall({ ...MOVEMENT, lot_no: "H1" })
    expect(outcome).toMatchObject({ status: "review_requested", created: false, mode: "C" })
    expect(saveDistributorSettlementDraft).not.toHaveBeenCalled()
    const reason = flagDistributorSettlementReview.mock.calls[0][1]
    expect(reason).toContain("로트는 H방식인데 정산은 C방식입니다")
    expect(reason).toContain("고객 견적이 v3로 바뀌어")
  })

  it("같은 오더의 두 번째 출고 확정은 검토 요청·알림을 다시 하지 않는다", async () => {
    const { service, flagDistributorSettlementReview, emitNotificationEvent } = await loadService({
      settlement: { reviewRequiredReason: `${INSTALL_REVIEW_PREFIX}(2026-11-10 출고 확정, 로트 C1) · …` },
    })
    const outcome = await service.requestDistributorReviewOnInstall(MOVEMENT)
    expect(outcome.status).toBe("already_requested")
    expect(flagDistributorSettlementReview).not.toHaveBeenCalled()
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("나중 출고의 로트 방식이 정산 방식과 어긋나면 그 로트 기준으로 한 번 더 검토를 요청한다", async () => {
    // 첫 출고(C1)로 C방식 초안이 생긴 뒤 나머지가 H 로트로 나가면, 검토자가 H 재고분까지 C방식으로 발행하지 않게 알린다.
    const { service, saveDistributorSettlementDraft, flagDistributorSettlementReview, emitNotificationEvent } = await loadService({
      settlement: { fulfillmentMode: "C", reviewRequiredReason: `${INSTALL_REVIEW_PREFIX}(2026-11-10 출고 확정, 로트 C1) · …` },
    })
    const outcome = await service.requestDistributorReviewOnInstall({ ...MOVEMENT, lot_no: "H8", occurred_at: "2026-11-12T00:00:00.000Z" })
    expect(outcome).toMatchObject({ status: "review_requested", created: false, mode: "C" })
    expect(saveDistributorSettlementDraft).not.toHaveBeenCalled()
    const reason = flagDistributorSettlementReview.mock.calls[0][1]
    expect(reason).toContain("2026-11-12 출고 확정, 로트 H8")
    expect(reason).toContain("로트는 H방식인데 정산은 C방식입니다")
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
  })

  it("어긋난 로트로 이미 다시 알렸으면 같은 로트의 다음 출고 확정은 넘어간다", async () => {
    const { service, flagDistributorSettlementReview, emitNotificationEvent } = await loadService({
      settlement: { fulfillmentMode: "C", reviewRequiredReason: `${INSTALL_REVIEW_PREFIX}(2026-11-12 출고 확정, 로트 H8) · 로트는 H방식인데 정산은 C방식입니다 — …` },
    })
    const outcome = await service.requestDistributorReviewOnInstall({ ...MOVEMENT, lot_no: "H8" })
    expect(outcome.status).toBe("already_requested")
    expect(flagDistributorSettlementReview).not.toHaveBeenCalled()
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it.each(["issued", "partial", "paid", "completed", "cancelled"] as const)("이미 %s 인 정산은 건드리지 않는다", async (status) => {
    const { service, saveDistributorSettlementDraft, flagDistributorSettlementReview } = await loadService({ settlement: { status } })
    const outcome = await service.requestDistributorReviewOnInstall(MOVEMENT)
    expect(outcome.status).toBe("skipped")
    expect(saveDistributorSettlementDraft).not.toHaveBeenCalled()
    expect(flagDistributorSettlementReview).not.toHaveBeenCalled()
  })

  it("오더 없는 출고·승인 안 된 오더는 아무것도 하지 않는다", async () => {
    const noOrder = await loadService({})
    expect((await noOrder.service.requestDistributorReviewOnInstall({ raw: {}, lot_no: "C1" })).status).toBe("skipped")
    expect(noOrder.saveDistributorSettlementDraft).not.toHaveBeenCalled()

    const pending = await loadService({ order: { quote_document_id: "qd_1", deal_id: "deal_1", status: "pending_approval" } })
    expect((await pending.service.requestDistributorReviewOnInstall(MOVEMENT)).status).toBe("skipped")
    expect(pending.flagDistributorSettlementReview).not.toHaveBeenCalled()
  })

  it("실패해도 출고 확정을 막지 않는다(Safely 는 null)", async () => {
    const { service } = await loadService({ orderError: true })
    await expect(service.requestDistributorReviewOnInstallSafely(MOVEMENT)).resolves.toBeNull()
    await expect(service.requestDistributorReviewOnInstallSafely(null)).resolves.toBeNull()
  })
})
