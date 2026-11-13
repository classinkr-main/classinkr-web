// 하드웨어 견적서 생성 흐름 검증 — 공급자 퀴드러닝(대표 조혜리 · 담당 배철웅, 내부 호칭 '배 대표님').
//
// 한 건의 HW 견적이 지나가는 길을 순서대로 확인한다.
//  1. 템플릿·프리셋 → 품목 줄과 금액(정가 정본: 86" 630 · 75" 540 · T1 120 · 벽걸이/스탠드 50 · 녹화 세트 830/740만원)
//  2. 공급자 블록(퀴드러닝 등록 정보) — 담당자만 바꿀 수 있다
//  3. 저장 → 다시 읽기(공유 링크·내부 보기·PDF 경로)에서 금액·공급자가 그대로인지
//  4. 고객 동의 후 오더(재고 품목) 변환
//  5. C방식 총판용 견적서 — 공급자 = 회사, 수신 = 퀴드러닝(배철웅), 금액 = 원가
// 정본 설명: docs/hardware-ops/distributor-settlement.md, docs/hardware-ops/quote-document-spec.md
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import {
  DEFAULT_HARDWARE_DISTRIBUTOR,
  buildDistributorLinesFromQuote,
  buildDistributorQuoteDetails,
  computeDistributorTotals,
  getDistributorIssueBlocker,
  type DistributorSettlementLine,
} from "@/lib/distributor-settlements"
import { buildSalesOrderLines, summarizeSalesOrderProducts } from "@/lib/orders/order-lines"
import type { PartnerQuoteDetailsInput } from "@/lib/partners-types"
import { normalizeQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import {
  STANDARD_QUOTE_SUPPLIER,
  STANDARD_QUOTE_TEMPLATES,
  buildConfigurableStandardQuoteDetails,
  buildStandardQuoteTitle,
  finalizeStandardQuoteDetails,
  getStandardQuoteDefaultSelections,
  getStandardQuoteQuickPresets,
  isRetiredQuoteTemplate,
  isSoftwareQuoteTemplate,
  resolveQuoteProductLine,
  resolveQuoteSupplier,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

const HW_TEMPLATE_IDS = STANDARD_QUOTE_TEMPLATES.map((template) => template.id).filter(
  (id) => !isSoftwareQuoteTemplate(id) && !isRetiredQuoteTemplate(id)
)

const QUIDLEARNING = {
  supplierBusinessName: "퀴드러닝",
  supplierBusinessRegistrationNumber: "170-07-03305",
  supplierRepresentativeName: "조혜리",
  supplierAddress: "경기도 오산시 독산성로 425, 1008호",
  supplierContactName: "배철웅",
  supplierContactPhone: "010-9238-5874",
}

/** 작성기가 하는 일과 같은 순서 — 프리셋으로 장을 짜고, 공급자·수신·조건을 합쳐 finalize 한다. */
function composeHardwareQuote(
  templateId: StandardQuoteTemplateId,
  options: {
    presetId?: string
    quantity?: number
    customer?: string
    vatIncluded?: boolean
    quoteDiscount?: PartnerQuoteDetailsInput["quoteDiscount"]
    manager?: { name: string; phone: string }
  } = {}
) {
  const preset = options.presetId
    ? getStandardQuoteQuickPresets(templateId).find((item) => item.id === options.presetId)
    : undefined
  if (options.presetId && !preset) throw new Error(`unknown preset ${options.presetId}`)
  const optionSelections = { ...getStandardQuoteDefaultSelections(templateId), ...(preset?.optionSelections ?? {}) }
  const sheet = buildConfigurableStandardQuoteDetails({
    templateId,
    input: { templateId, presetId: options.presetId },
    optionSelections,
    baseQuantity: options.quantity ?? 1,
  })
  const supplier = resolveQuoteSupplier(templateId)
  return finalizeStandardQuoteDetails(
    {
      ...sheet,
      ...supplier,
      supplierContactName: options.manager?.name || supplier.supplierContactName,
      supplierContactPhone: options.manager?.phone || supplier.supplierContactPhone,
      templateId,
      optionSelections,
      recipientCompanyName: options.customer ?? "검증학원",
      issuedAt: "2026-11-10",
      validUntil: "2026-11-17",
      vatIncluded: options.vatIncluded ?? true,
      // 작성기(composeSheetQuote)처럼 VAT 문구·하단 담당 문구는 실제 설정으로 다시 만든다.
      vatPolicyLabel: undefined,
      footerContactText: undefined,
      quoteDiscount: options.quoteDiscount,
    },
    templateId
  )
}

/** 작성기가 POST /quotes 로 보내는 금액 칸 — HardwareQuotesPanel·목록·계약 전환이 이 값을 쓴다. */
function savePayload(quote: PartnerQuoteDetailsInput) {
  return {
    title: buildStandardQuoteTitle(quote),
    subtotal: quote.subtotalAmount ?? 0,
    discount_amount: quote.discountAmount ?? 0,
    tax_amount: quote.vatAmount ?? 0,
    total_amount: quote.grandTotalAmount ?? 0,
    structured_json: JSON.parse(JSON.stringify({ quoteDetails: quote })) as Record<string, unknown>,
  }
}

describe("1. HW 템플릿·프리셋 → 품목과 금액", () => {
  it.each([
    // [템플릿, 프리셋, 수량, 공급가 합계, 품목 코드(금액 있는 줄)]
    ["board_86", undefined, 1, 6_300_000, ["board-86"]],
    ["board_86", "board_86_bundle", 1, 8_000_000, ["board-86", "wall-mount", "camera-t1"]],
    ["board_86", "board_86_bundle", 3, 24_000_000, ["board-86", "wall-mount", "camera-t1"]],
    ["board_86", "board_86_stand", 2, 13_600_000, ["board-86", "stand"]],
    ["board_75", undefined, 1, 5_400_000, ["board-75"]],
    ["board_75", "board_75_t1_addon", 1, 7_100_000, ["board-75", "wall-mount", "camera-t1"]],
    ["camera_t1", undefined, 2, 2_400_000, ["camera-t1"]],
    ["recording_studio", "recording_studio_default", 1, 8_300_000, ["ai-studio-recording-set"]],
    ["recording_studio_75", "recording_studio_75_default", 2, 14_800_000, ["ai-studio-recording-set-75"]],
  ] as const)("%s / %s × %i = %i원", (templateId, presetId, quantity, subtotal, pricedCodes) => {
    const quote = composeHardwareQuote(templateId, { presetId, quantity })
    expect(quote.subtotalAmount).toBe(subtotal)
    expect(quote.grandTotalAmount).toBe(subtotal) // 기본 VAT 포함
    const priced = (quote.lineItems ?? []).filter((line) => (line.lineSupplyAmount ?? 0) > 0)
    expect(priced.map((line) => line.itemCode)).toEqual(pricedCodes)
    // 칠판에 딸린 카메라·거치 줄은 칠판 대수를 따른다.
    for (const line of priced) expect(line.quantity).toBe(quantity)
  })

  it("카메라 설치는 기본이 '별도 청구'라 합계에 들어가지 않는다", () => {
    const quote = composeHardwareQuote("camera_t1")
    const install = quote.lineItems?.find((line) => line.itemCode === "camera-install")
    expect(install?.billingMode).toBe("separate_invoice")
    expect(quote.grandTotalAmount).toBe(1_200_000)
  })

  it("VAT 별도·견적 할인이 HW 견적에도 같은 규칙으로 계산된다", () => {
    const quote = composeHardwareQuote("board_86", {
      presetId: "board_86_bundle",
      quantity: 2,
      vatIncluded: false,
      quoteDiscount: { mode: "rate", value: 5, label: "교육기관 할인" },
    })
    // 16,000,000 − 5%(800,000) = 15,200,000 → VAT 1,520,000 → 16,720,000
    expect(quote).toMatchObject({
      subtotalAmount: 16_000_000,
      discountAmount: 800_000,
      vatAmount: 1_520_000,
      grandTotalAmount: 16_720_000,
      vatPolicyLabel: "(단위:원, VAT별도)",
    })
  })
})

describe("2. 공급자 블록 — 퀴드러닝 등록 정보", () => {
  it.each(HW_TEMPLATE_IDS)("%s 견적의 공급자는 퀴드러닝(대표 조혜리 · 담당 배철웅)이다", (templateId) => {
    const quote = composeHardwareQuote(templateId)
    expect(quote).toMatchObject(QUIDLEARNING)
    expect(quote.footerContactText).toBe("배철웅/010-9238-5874")
    expect(resolveQuoteProductLine({ templateId })).toBe("hardware")
  })

  it("표준 공급자 상수가 등록 정보와 같다(호칭을 붙이거나 이름을 바꾸지 않는다)", () => {
    expect(STANDARD_QUOTE_SUPPLIER).toMatchObject({
      businessName: QUIDLEARNING.supplierBusinessName,
      businessRegistrationNumber: QUIDLEARNING.supplierBusinessRegistrationNumber,
      representativeName: QUIDLEARNING.supplierRepresentativeName,
      contactName: QUIDLEARNING.supplierContactName,
      contactPhone: QUIDLEARNING.supplierContactPhone,
    })
    expect(STANDARD_QUOTE_SUPPLIER.contactName).not.toMatch(/대표/)
  })

  it("작성기에서 담당자를 바꾸면 담당·연락처만 바뀌고 회사 정보는 퀴드러닝 그대로다", () => {
    const quote = composeHardwareQuote("board_86", { manager: { name: "김영업", phone: "010-1111-2222" } })
    expect(quote).toMatchObject({
      supplierBusinessName: "퀴드러닝",
      supplierBusinessRegistrationNumber: "170-07-03305",
      supplierRepresentativeName: "조혜리",
      supplierContactName: "김영업",
      supplierContactPhone: "010-1111-2222",
      footerContactText: "김영업/010-1111-2222",
    })
  })

  it("작성기는 하단 담당 문구를 실제 공급자·담당자로 다시 만든다(SW 견적에 배철웅이 남지 않게)", () => {
    const composer = readFileSync(join(process.cwd(), "components/portal/quotes/QuickQuoteComposer.tsx"), "utf8")
    const compose = composer.split("function composeSheetQuote")[1].split("\n  }\n")[0]
    expect(compose).toContain("footerContactText: undefined")
    expect(compose).toContain("vatPolicyLabel: undefined")
  })

  it("고객 문서에 퀴드러닝 정보가 찍히고 클래스인 법인은 섞이지 않는다", () => {
    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={composeHardwareQuote("recording_studio")} />)
    for (const text of ["퀴드러닝", "170-07-03305", "조혜리", "배철웅", "010-9238-5874", "하드웨어 공급"]) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain("이이오클래스인코리아")
  })

  it("견적 제목은 '고객명 + 템플릿 이름 + 견적서'다", () => {
    expect(buildStandardQuoteTitle(composeHardwareQuote("recording_studio_75", { customer: "성남여고" }))).toBe(
      '성남여고 올인원 녹화수업 세트 75" 견적서'
    )
  })
})

describe("3. 저장 → 다시 읽기(공유 링크·내부 보기·PDF)", () => {
  it.each(HW_TEMPLATE_IDS)("%s — 저장한 금액 칸과 다시 읽은 견적이 일치한다", (templateId) => {
    const quote = composeHardwareQuote(templateId, {
      quantity: 2,
      vatIncluded: false,
      quoteDiscount: { mode: "amount", value: 100_000 },
    })
    const payload = savePayload(quote)
    // 목록·상세·계약 전환이 쓰는 칸끼리 맞아야 한다: 총액 = 공급가 합계 − 할인 + 부가세
    expect(payload.total_amount).toBe(payload.subtotal - payload.discount_amount + payload.tax_amount)

    const reread = normalizeQuoteDetailsFromStructuredJson(payload.structured_json, { customerName: "검증학원" })
    expect(reread.templateId).toBe(templateId)
    expect(reread).toMatchObject(QUIDLEARNING)
    expect(reread.subtotalAmount).toBe(payload.subtotal)
    expect(reread.discountAmount).toBe(payload.discount_amount)
    expect(reread.vatAmount).toBe(payload.tax_amount)
    expect(reread.grandTotalAmount).toBe(payload.total_amount)
    expect(reread.lineItems?.map((line) => [line.itemCode, line.quantity, line.unitPrice])).toEqual(
      quote.lineItems?.map((line) => [line.itemCode, line.quantity, line.unitPrice])
    )
  })
})

describe("4. 고객 동의 → 오더(재고 품목)", () => {
  it("번들·스탠드·녹화 세트가 칠판·T1·스탠드 재고로 풀리고, 설치·안내 줄은 재고가 아니다", () => {
    const lines = [
      ...(composeHardwareQuote("board_86", { presetId: "board_86_bundle", quantity: 2 }).lineItems ?? []),
      ...(composeHardwareQuote("board_86", { presetId: "board_86_stand", quantity: 1 }).lineItems ?? []),
      ...(composeHardwareQuote("recording_studio_75", { quantity: 3 }).lineItems ?? []),
    ]
    const orderLines = buildSalesOrderLines("qd_hw", lines)
    expect(orderLines.some((line) => line.unmappedHardware)).toBe(false)
    const products = Object.fromEntries(summarizeSalesOrderProducts(orderLines).map((entry) => [entry.product, entry.quantity]))
    expect(products).toEqual({ '86" IFP': 3, T1: 5, STD1: 1, '75" IFP': 3 })
  })
})

describe("5. C방식 총판용 견적서(배 대표님 · 퀴드러닝 앞)", () => {
  const settlementFor = (customer: PartnerQuoteDetailsInput, lines: DistributorSettlementLine[], vatIncluded = true) => ({
    ...DEFAULT_HARDWARE_DISTRIBUTOR,
    lines,
    vatIncluded,
    notes: null,
  })

  // 고객: 녹화 세트 86" 2세트, 12개월 할부, VAT 별도, 교육기관 할인 10% — 고객 쪽 조건이 총판 문서로 새면 안 되는 경우를 한데 모았다.
  const customer = composeHardwareQuote("recording_studio", {
    presetId: "recording_studio_installment",
    quantity: 2,
    customer: "성남여고",
    vatIncluded: false,
    quoteDiscount: { mode: "rate", value: 10, label: "교육기관 할인" },
  })
  const rules = [
    { itemCode: "ai-studio-recording-set", minQuantity: 1, unitPrice: 6_500_000 },
    { itemCode: "ai-studio-recording-set", minQuantity: 5, unitPrice: 6_200_000 },
  ]
  const lines = buildDistributorLinesFromQuote(customer.lineItems, { rules })

  it("총판 정산 줄: 녹화 세트만 기본 포함, 안내 줄은 빠지고, 원가는 수량 구간 템플릿에서 채운다", () => {
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      itemCode: "ai-studio-recording-set",
      quantity: 2,
      customerUnitPrice: 8_300_000,
      unitPrice: 6_500_000,
      included: true,
    })
    expect(computeDistributorTotals(lines, true)).toMatchObject({ subtotalAmount: 13_000_000, totalAmount: 13_000_000 })
    expect(getDistributorIssueBlocker({ lines, vatIncluded: true, distributorName: DEFAULT_HARDWARE_DISTRIBUTOR.distributorName })).toBeNull()
  })

  it("총판 기본값은 퀴드러닝 · 배철웅이다", () => {
    expect(DEFAULT_HARDWARE_DISTRIBUTOR).toMatchObject({
      distributorName: "퀴드러닝",
      distributorContactName: "배철웅",
      distributorPhone: "010-9238-5874",
    })
  })

  it("공급자 = 회사(클래스인), 수신 = 퀴드러닝(배철웅), 참조 = 고객사", () => {
    const details = buildDistributorQuoteDetails(customer, settlementFor(customer, lines), { customerName: "성남여고" })
    expect(details).toMatchObject({
      supplierBusinessName: "이이오클래스인코리아 유한회사",
      recipientCompanyName: "퀴드러닝",
      recipientContactName: "배철웅",
      recipientPhone: "010-9238-5874",
      referenceName: "고객사 성남여고",
    })
  })

  it("문서 총액 = 정산 합계(입금 요청 금액) — 고객 할인·할부 조건·고객 단가가 섞이지 않는다", () => {
    const settlement = settlementFor(customer, lines)
    const details = buildDistributorQuoteDetails(customer, settlement, { customerName: "성남여고" })
    const totals = computeDistributorTotals(lines, settlement.vatIncluded)

    expect(details.discountAmount).toBe(0)
    expect(details.quoteDiscount).toBeUndefined()
    expect(details.grandTotalAmount).toBe(totals.totalAmount)

    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={details} />)
    expect(html).toContain("13,000,000")
    expect(html).not.toContain("교육기관 할인")
    expect(html).not.toContain("할부 시 월 약")
    expect(html).not.toContain("8,300,000") // 고객 단가
    expect(html).not.toContain("12개월 할부 안내") // 고객 결제 조건 행
  })

  it("총판 VAT 별도면 원가 합계에 10%를 붙여 청구한다", () => {
    const details = buildDistributorQuoteDetails(customer, settlementFor(customer, lines, false))
    expect(details).toMatchObject({ subtotalAmount: 13_000_000, vatAmount: 1_300_000, grandTotalAmount: 14_300_000 })
    expect(computeDistributorTotals(lines, false).totalAmount).toBe(14_300_000)
  })
})
