import { describe, expect, it } from "vitest"

import {
  applyPriceTemplate,
  buildDistributorLinesFromQuote,
  buildDistributorQuoteDetails,
  computeDistributorTotals,
  deriveSettlementStatus,
  getDistributorIssueBlocker,
  getOutstandingAmount,
  isSettlementOverdue,
  pickTemplateUnitPrice,
  validateDistributorPaymentInput,
  validateDistributorPriceTemplateInput,
  validateDistributorSettlementInput,
  type DistributorPriceRule,
} from "@/lib/distributor-settlements"
import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"

const CUSTOMER_LINES: PartnerQuoteLineItemInput[] = [
  { sortOrder: 1, lineNumber: 1, itemType: "hardware", itemCode: "board-86", itemName: '86" 전자칠판', quantity: 2, unitPrice: 6_300_000 },
  { sortOrder: 2, lineNumber: 2, itemType: "service", itemCode: "install-training", itemName: "설치 및 교육", quantity: 2, unitPrice: 500_000 },
  { sortOrder: 3, lineNumber: 3, itemType: "service", itemCode: "online-suite-monthly", itemName: "AI Suite", quantity: 12, unitPrice: 400_000 },
  { sortOrder: 4, lineNumber: 4, itemType: "note_only", itemName: "납품 안내" },
]

const RULES: DistributorPriceRule[] = [
  { itemCode: "board-86", minQuantity: 1, unitPrice: 5_500_000 },
  { itemCode: "board-86", minQuantity: 5, unitPrice: 5_300_000 },
  { itemCode: "online-suite-monthly", minQuantity: 1, unitPrice: 300_000 },
]

describe("distributor settlement lines", () => {
  it("includes hardware and AI Suite by default, excludes installation and note lines", () => {
    const lines = buildDistributorLinesFromQuote(CUSTOMER_LINES)
    expect(lines.map((line) => [line.itemCode, line.included])).toEqual([
      ["board-86", true],
      ["install-training", false],
      ["online-suite-monthly", true],
    ])
    expect(lines.every((line) => line.unitPrice === null)).toBe(true)
  })

  it("picks the largest quantity tier that applies", () => {
    expect(pickTemplateUnitPrice(RULES, "board-86", 2)).toBe(5_500_000)
    expect(pickTemplateUnitPrice(RULES, "board-86", 5)).toBe(5_300_000)
    expect(pickTemplateUnitPrice(RULES, "board-75", 5)).toBeNull()
  })

  it("fills template prices on draft and keeps prior human edits when the quote is rebuilt", () => {
    const fromTemplate = buildDistributorLinesFromQuote(CUSTOMER_LINES, { rules: RULES })
    expect(fromTemplate[0].unitPrice).toBe(5_500_000)

    const edited = fromTemplate.map((line) => (line.itemCode === "board-86" ? { ...line, unitPrice: 5_450_000 } : line))
    const rebuilt = buildDistributorLinesFromQuote(CUSTOMER_LINES, { previous: edited, rules: RULES })
    expect(rebuilt[0].unitPrice).toBe(5_450_000)

    const reapplied = applyPriceTemplate(rebuilt, RULES)
    expect(reapplied[0].unitPrice).toBe(5_500_000)
    // 제외된 품목은 템플릿을 다시 적용해도 건드리지 않는다.
    expect(reapplied[1].unitPrice).toBeNull()
  })

  it("totals only included priced lines and reports missing prices", () => {
    const lines = buildDistributorLinesFromQuote(CUSTOMER_LINES, { rules: RULES })
    expect(computeDistributorTotals(lines, true)).toMatchObject({
      subtotalAmount: 2 * 5_500_000 + 12 * 300_000,
      vatAmount: 0,
      totalAmount: 14_600_000,
      missingPriceCount: 0,
      includedCount: 2,
    })
    expect(computeDistributorTotals(lines, false).vatAmount).toBe(1_460_000)

    const missing = buildDistributorLinesFromQuote(CUSTOMER_LINES)
    expect(computeDistributorTotals(missing, true).missingPriceCount).toBe(2)
    expect(getDistributorIssueBlocker({ lines: missing, vatIncluded: true, distributorName: "총판" })).toContain("2개")
    expect(getDistributorIssueBlocker({ lines, vatIncluded: true, distributorName: " " })).toContain("총판 이름")
    expect(getDistributorIssueBlocker({ lines, vatIncluded: true, distributorName: "총판" })).toBeNull()
  })
})

describe("distributor quote document", () => {
  it("keeps the customer quote format but swaps recipient and amounts", () => {
    const customer: PartnerQuoteDetailsInput = {
      templateId: "board_86",
      recipientCompanyName: "테스트 학원",
      recipientContactName: "원장",
      supplierBusinessName: "퀴드러닝",
      vatIncluded: true,
      lineItems: CUSTOMER_LINES,
    }
    const lines = buildDistributorLinesFromQuote(CUSTOMER_LINES, { rules: RULES })
    const details = buildDistributorQuoteDetails(customer, {
      distributorName: "하드웨어 총판",
      distributorContactName: "김담당",
      distributorPhone: null,
      distributorEmail: "dist@example.com",
      lines,
      vatIncluded: true,
      notes: null,
    })

    expect(details.recipientCompanyName).toBe("하드웨어 총판")
    expect(details.recipientContactName).toBe("김담당")
    expect(details.referenceName).toBe("고객사 테스트 학원")
    expect(details.supplierBusinessName).toBe("퀴드러닝")
    expect(details.lineItems?.map((line) => [line.itemCode, line.unitPrice, line.lineSupplyAmount])).toEqual([
      ["board-86", 5_500_000, 11_000_000],
      ["online-suite-monthly", 300_000, 3_600_000],
    ])
    expect(details.grandTotalAmount).toBe(14_600_000)
    // 고객 단가는 총판 문서에 남지 않는다.
    expect(JSON.stringify(details.lineItems)).not.toContain("6300000")
  })
})

describe("distributor receivable status", () => {
  it("derives partial and paid from payments", () => {
    expect(deriveSettlementStatus({ status: "issued", totalAmount: 100, paidAmount: 0 })).toBe("issued")
    expect(deriveSettlementStatus({ status: "issued", totalAmount: 100, paidAmount: 40 })).toBe("partial")
    expect(deriveSettlementStatus({ status: "partial", totalAmount: 100, paidAmount: 100 })).toBe("paid")
    expect(deriveSettlementStatus({ status: "paid", totalAmount: 100, paidAmount: 30 })).toBe("partial")
    expect(deriveSettlementStatus({ status: "draft", totalAmount: 100, paidAmount: 30 })).toBe("draft")
  })

  it("computes outstanding and overdue only for issued settlements", () => {
    expect(getOutstandingAmount({ status: "partial", totalAmount: 100, paidAmount: 40 })).toBe(60)
    expect(getOutstandingAmount({ status: "draft", totalAmount: 100, paidAmount: 0 })).toBe(0)
    const record = { status: "issued" as const, dueDate: "2026-10-20", totalAmount: 100, paidAmount: 0 }
    expect(isSettlementOverdue(record, "2026-10-23")).toBe(true)
    expect(isSettlementOverdue({ ...record, dueDate: "2026-10-30" }, "2026-10-23")).toBe(false)
    expect(isSettlementOverdue({ ...record, status: "paid" as const }, "2026-10-23")).toBe(false)
  })
})

describe("distributor input validation", () => {
  it("validates settlement input", () => {
    const ok = validateDistributorSettlementInput({
      distributorName: " 총판 ",
      distributorEmail: "dist@example.com",
      issueTrigger: "on_install",
      lines: [{ itemName: "보드", quantity: 2, unitPrice: 5_500_000, included: true }],
      dueDate: "2026-11-30",
    })
    expect(ok.ok && ok.value).toMatchObject({
      distributorName: "총판",
      issueTrigger: "on_install",
      autoEmail: true,
      vatIncluded: true,
      dueDate: "2026-11-30",
    })
    expect(validateDistributorSettlementInput({ distributorName: "", lines: [] }).ok).toBe(false)
    expect(validateDistributorSettlementInput({ distributorName: "총판", distributorEmail: "x", lines: [] }).ok).toBe(false)
    expect(
      validateDistributorSettlementInput({ distributorName: "총판", lines: [{ itemName: "보드", quantity: 1, unitPrice: -1 }] }).ok
    ).toBe(false)
    const unknownTrigger = validateDistributorSettlementInput({ distributorName: "총판", issueTrigger: "x", lines: [] })
    expect(unknownTrigger.ok && unknownTrigger.value.issueTrigger).toBe("on_accept")
  })

  it("validates payments and price templates", () => {
    expect(validateDistributorPaymentInput({ amount: 1000, paidOn: "2026-10-23" }).ok).toBe(true)
    expect(validateDistributorPaymentInput({ amount: 0, paidOn: "2026-10-23" }).ok).toBe(false)
    expect(validateDistributorPaymentInput({ amount: 1000, paidOn: "10/23" }).ok).toBe(false)

    const template = validateDistributorPriceTemplateInput({
      name: "총판가",
      rules: [{ itemCode: "board-86", minQuantity: 0, unitPrice: 5_500_000 }],
    })
    expect(template.ok && template.value.rules[0].minQuantity).toBe(1)
    expect(validateDistributorPriceTemplateInput({ name: "총판가", rules: [] }).ok).toBe(false)
  })
})
