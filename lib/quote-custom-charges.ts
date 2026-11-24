import type { PartnerQuoteLineItemInput } from "@/lib/partners-types"

export const QUOTE_CHARGE_OPTIONS = {
  shipping: { label: "배송비", itemName: "배송비", itemCode: "quote-shipping-fee", itemType: "shipping" },
  installation: { label: "설치비", itemName: "설치비", itemCode: "quote-installation-fee", itemType: "installation" },
  custom: { label: "직접 입력", itemName: "추가 항목", itemCode: "quote-custom-fee", itemType: "service" },
} as const

export type QuoteChargeOption = keyof typeof QUOTE_CHARGE_OPTIONS

export function createQuoteChargeLine(
  kind: QuoteChargeOption,
  itemCode: string,
  position: number
): PartnerQuoteLineItemInput {
  const { itemName, itemType } = QUOTE_CHARGE_OPTIONS[kind]
  return {
    sortOrder: position,
    lineNumber: position,
    itemName,
    itemType,
    itemCode,
    quantity: 1,
    quantityUnit: "식",
    unitPrice: 0,
    vatIncluded: true,
    lineStatus: "priced",
    billingMode: "included_in_quote",
    isOptional: true,
    isUserAdded: true,
  }
}

export function isCustomQuoteCharge(line: PartnerQuoteLineItemInput) {
  const itemCode = line.itemCode
  return line.isUserAdded === true && (
    itemCode === QUOTE_CHARGE_OPTIONS.shipping.itemCode ||
    itemCode === QUOTE_CHARGE_OPTIONS.installation.itemCode ||
    itemCode?.startsWith(`${QUOTE_CHARGE_OPTIONS.custom.itemCode}-`) === true
  )
}
