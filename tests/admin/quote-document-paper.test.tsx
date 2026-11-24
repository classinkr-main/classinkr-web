import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import type { PartnerQuoteDetailsInput } from "@/lib/partners-types"
import { normalizeQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import { buildConfigurableStandardQuoteDetails } from "@/lib/standard-quote-template"

const quote: PartnerQuoteDetailsInput = {
  templateId: "business_recharge", recipientCompanyName: "검증 학교", recipientContactName: "수신 담당",
  recipientPhone: "010-0000-0001", supplierBusinessName: "공급 법인", supplierContactName: "공급 담당",
  supplierContactPhone: "010-0000-0002", issuedAt: "2026-10-21", vatIncluded: false,
  subtotalAmount: 2_000_000, vatAmount: 200_000, grandTotalAmount: 2_200_000,
  lineItems: [{ sortOrder: 0, lineNumber: 1, itemType: "service", itemName: "소프트웨어", itemDescription: "수업용", quantity: 1, quantityUnit: "식", unitPrice: 2_000_000, lineSupplyAmount: 2_000_000 }],
}

describe("shared quote paper", () => {
  it("keeps recipient and supplier contacts separate and displays stored VAT totals", () => {
    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={quote} />)
    const recipient = html.split('aria-label="수신처"')[1].split('</section>')[0]
    const supplier = html.split('aria-label="공급자"')[1].split('</section>')[0]
    expect(recipient).toContain("수신 담당")
    expect(recipient).not.toContain("공급 담당")
    expect(supplier).toContain("010-0000-0002")
    expect(supplier).not.toContain("010-0000-0001")
    for (const amount of ["2,000,000", "200,000", "2,200,000"]) expect(html).toContain(amount)
    expect(html).toContain("부가세 (10%)")
  })
  it("preserves pending and separately billed lines without treating them as priced amounts", () => {
    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={{ ...quote, lineItems: [
      { sortOrder: 0, lineNumber: 1, itemType: "hardware", itemName: "별도 설치", billingMode: "separate_invoice", lineSupplyAmount: 0 },
      { sortOrder: 1, lineNumber: 2, itemType: "hardware", itemName: "현장 협의", lineStatus: "pending_price", lineSupplyAmount: 0 },
    ] }} />)
    expect(html).toContain("<td>별도</td>")
    expect(html).toContain("<td>협의</td>")
  })
  it("shows the stored original price and per-unit discount without changing the quoted total", () => {
    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={{ ...quote,
      lineItems: [{ sortOrder: 1, lineNumber: 1, itemType: "hardware", itemName: "스튜디오 세트", quantity: 1, quantityUnit: "세트", originalUnitPrice: 8_300_000, unitPrice: 7_800_000, lineSupplyAmount: 7_800_000 }],
      subtotalAmount: 7_800_000, grandTotalAmount: 7_800_000,
    }} />)
    expect(html).toContain("정가 8,300,000원")
    expect(html).toContain("할인 −500,000원 / 세트")
    expect(html).toContain("7,800,000")
  })
  it("keeps net totals when saved presentation settings hide both kinds of discount", () => {
    const pricedQuote: PartnerQuoteDetailsInput = {
      ...quote,
      showDiscountDetails: false,
      quoteDiscount: { mode: "amount", value: 100_000 },
      discountAmount: 100_000,
      vatAmount: 190_000,
      grandTotalAmount: 2_090_000,
      lineItems: [{ ...quote.lineItems![0], originalUnitPrice: 2_500_000 }],
    }
    const loaded = normalizeQuoteDetailsFromStructuredJson({ quoteDetails: pricedQuote })
    expect(loaded?.showDiscountDetails).toBe(false)

    const hidden = renderToStaticMarkup(<QuoteDocumentPreview quote={loaded!} />)
    expect(hidden).not.toContain("2,500,000")
    expect(hidden).not.toContain("100,000")
    expect(hidden).toContain("1,900,000")
    expect(hidden).toContain("2,090,000")

    const visible = renderToStaticMarkup(<QuoteDocumentPreview quote={{ ...loaded!, showDiscountDetails: true }} />)
    expect(visible).toContain("2,500,000")
    expect(visible).toContain("100,000")
    expect(visible).toContain("2,090,000")
  })
  it("retains the original price and custom discount text after saving, loading, and changing options", () => {
    const draft = buildConfigurableStandardQuoteDetails({ templateId: "recording_studio" })
    const customText = "녹화수업 도입 할인 적용"
    draft.lineItems![0] = { ...draft.lineItems![0], originalUnitPrice: 8_300_000, unitPrice: 7_800_000, discountDisplayText: customText }
    const loaded = normalizeQuoteDetailsFromStructuredJson({ quoteDetails: draft })
    const rebuilt = buildConfigurableStandardQuoteDetails({ templateId: "recording_studio", input: loaded, optionSelections: { delivery_policy: false } })
    expect(rebuilt.lineItems![0].originalUnitPrice).toBe(8_300_000)
    expect(rebuilt.lineItems![0].unitPrice).toBe(7_800_000)
    expect(rebuilt.grandTotalAmount).toBe(7_800_000)
    expect(rebuilt.lineItems![0].discountDisplayText).toBe(customText)

    const visible = renderToStaticMarkup(<QuoteDocumentPreview quote={rebuilt} />)
    expect(visible).toContain(customText)
    expect(visible).not.toContain("정가 8,300,000원")
    expect(visible).toContain("7,800,000")
    const hidden = renderToStaticMarkup(<QuoteDocumentPreview quote={{ ...rebuilt, showDiscountDetails: false }} />)
    expect(hidden).not.toContain(customText)
  })
  it("escapes arbitrary quote content, retains all rows, and uses edit slots without duplicating contacts", () => {
    const html = renderToStaticMarkup(<QuoteDocumentPreview quote={{ ...quote,
      generalNotes: '<script>alert("x")</script>',
      lineItems: Array.from({ length: 35 }, (_, index) => ({ sortOrder: index, lineNumber: index + 1, itemType: "service" as const, itemName: `품목 ${index + 1}` })),
    }} editing slots={{ recipient: <input aria-label="수신 고객사" defaultValue="편집 중" /> }} />)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain("품목 35")
    expect(html).toContain('aria-label="수신 고객사"')
    expect(html).not.toContain("검증 학교")
  })
})
