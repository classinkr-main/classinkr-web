import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import { normalizeQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import { describeQuoteVat } from "@/lib/portal/quote-vat"
import {
  buildConfigurableStandardQuoteDetails,
  calculateStandardQuoteTotals,
  finalizeStandardQuoteDetails,
  formatQuoteDiscountLabel,
  normalizeQuoteDiscount,
  resolveQuoteDiscountAmount,
} from "@/lib/standard-quote-template"

const line = (amount: number) => ({
  sortOrder: 1,
  lineNumber: 1,
  itemType: "hardware" as const,
  itemName: "품목",
  quantity: 1,
  unitPrice: amount,
  lineSupplyAmount: amount,
})

describe("견적 할인 계산", () => {
  it("금액 할인은 공급가 합계에서 빼고, 합계를 넘지 않는다", () => {
    expect(resolveQuoteDiscountAmount(8_300_000, { mode: "amount", value: 300_000 })).toBe(300_000)
    expect(resolveQuoteDiscountAmount(1_000_000, { mode: "amount", value: 5_000_000 })).toBe(1_000_000)
  })

  it("% 할인은 공급가 합계 기준으로 원 단위 반올림한다", () => {
    expect(resolveQuoteDiscountAmount(7_400_000, { mode: "rate", value: 5 })).toBe(370_000)
    expect(resolveQuoteDiscountAmount(1_000_001, { mode: "rate", value: 10 })).toBe(100_000)
  })

  it("0·음수·숫자가 아닌 값은 할인이 없다", () => {
    expect(normalizeQuoteDiscount({ mode: "amount", value: 0 })).toBeUndefined()
    expect(normalizeQuoteDiscount({ mode: "rate", value: -3 })).toBeUndefined()
    expect(normalizeQuoteDiscount({ mode: "amount", value: "abc" })).toBeUndefined()
    expect(normalizeQuoteDiscount({ mode: "bogus", value: 10 })).toBeUndefined()
    expect(normalizeQuoteDiscount({ mode: "rate", value: 150 })?.value).toBe(100)
  })

  it("VAT 별도 견적은 할인 뒤 공급가에 부가세를 붙인다", () => {
    const totals = calculateStandardQuoteTotals([line(8_300_000)], false, { mode: "amount", value: 300_000 })
    expect(totals).toMatchObject({
      subtotalAmount: 8_300_000,
      discountAmount: 300_000,
      discountedSupplyAmount: 8_000_000,
      vatAmount: 800_000,
      grandTotalAmount: 8_800_000,
    })
  })

  it("VAT 포함 견적은 총액에서 바로 뺀다", () => {
    const totals = calculateStandardQuoteTotals([line(8_300_000)], true, { mode: "rate", value: 10 })
    expect(totals.grandTotalAmount).toBe(7_470_000)
    expect(totals.vatAmount).toBe(0)
  })

  it("할인이 없으면 예전 합계와 같다", () => {
    expect(calculateStandardQuoteTotals([line(8_300_000)], false)).toMatchObject({
      discountAmount: 0,
      vatAmount: 830_000,
      grandTotalAmount: 9_130_000,
    })
  })

  it("할인 이름은 비우면 '특별 할인', % 할인은 비율을 붙인다", () => {
    expect(formatQuoteDiscountLabel({ mode: "amount", value: 1 })).toBe("특별 할인")
    expect(formatQuoteDiscountLabel({ mode: "rate", value: 10, label: "교육기관 할인" })).toBe("교육기관 할인 10%")
  })
})

describe("견적 할인 저장·재계산", () => {
  it("옵션을 바꿔 장을 다시 짜도 할인이 유지된다", () => {
    const base = buildConfigurableStandardQuoteDetails({ templateId: "recording_studio" })
    const discounted = finalizeStandardQuoteDetails(
      { ...base, quoteDiscount: { mode: "amount", value: 300_000, label: "오픈 기념" } },
      "recording_studio"
    )
    const rebuilt = buildConfigurableStandardQuoteDetails({
      templateId: "recording_studio",
      input: discounted,
      optionSelections: { payment_plan: "12_month" },
    })
    expect(rebuilt.discountAmount).toBe(300_000)
    expect(rebuilt.grandTotalAmount).toBe(8_000_000)
  })

  it("저장된 structured_json 을 다시 읽으면 할인·총액이 그대로 계산된다(공유 링크·내부 보기)", () => {
    const saved = finalizeStandardQuoteDetails(
      {
        ...buildConfigurableStandardQuoteDetails({ templateId: "recording_studio_75" }),
        vatIncluded: false,
        quoteDiscount: { mode: "rate", value: 5 },
      },
      "recording_studio_75"
    )
    const reread = normalizeQuoteDetailsFromStructuredJson(JSON.parse(JSON.stringify({ quoteDetails: saved })))
    expect(reread.quoteDiscount).toEqual({ mode: "rate", value: 5 })
    expect(reread.discountAmount).toBe(370_000)
    expect(reread.vatAmount).toBe(703_000)
    expect(reread.grandTotalAmount).toBe(7_733_000)
  })

  it("할인이 없던 옛 견적은 저장된 discountAmount 가 있어도 다시 계산해 0이다", () => {
    const reread = normalizeQuoteDetailsFromStructuredJson({
      quoteDetails: { templateId: "board_86", discountAmount: 500_000, lineItems: [line(6_300_000)] },
    })
    expect(reread.discountAmount).toBe(0)
    expect(reread.grandTotalAmount).toBe(6_300_000)
  })
})

describe("견적서·상세 패널 표기", () => {
  it("할인이 있으면 소계·할인·공급가액 줄을 찍고, 없으면 공급가액 한 줄이다", () => {
    const base = buildConfigurableStandardQuoteDetails({ templateId: "recording_studio" })
    const plain = renderToStaticMarkup(<QuoteDocumentPreview quote={base} />)
    expect(plain).not.toContain("소계")

    const discounted = finalizeStandardQuoteDetails(
      { ...base, vatIncluded: false, quoteDiscount: { mode: "amount", value: 300_000, label: "오픈 기념" } },
      "recording_studio"
    )
    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={discounted} />)
    expect(html).toContain("소계")
    expect(html).toContain("오픈 기념")
    expect(html).toContain("−300,000")
    expect(html).toContain("8,000,000")
    expect(html).toContain("8,800,000")
  })

  it("상세 패널 금액 라벨은 할인 뒤 공급가와 할인액을 보여 준다", () => {
    expect(describeQuoteVat({ vatIncluded: false, subtotalAmount: 8_300_000, discountAmount: 300_000, taxAmount: 800_000 })).toBe(
      "공급가 8,000,000원 + VAT 800,000원 · 할인 −300,000원"
    )
    expect(describeQuoteVat({ vatIncluded: true, subtotalAmount: 8_300_000, discountAmount: 0, taxAmount: 0 })).toBe("VAT 포함")
  })
})
