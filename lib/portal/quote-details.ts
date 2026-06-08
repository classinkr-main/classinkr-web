import type {
  PartnerQuoteDetailsInput,
  PartnerQuoteLineItemInput,
  QuoteOptionSelectionValue,
} from "@/lib/partners-types"
import {
  finalizeStandardQuoteDetails,
  inferStandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

type QuoteDetailsFallback = {
  customerName?: string | null
  validUntil?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

function pickString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = readString(source[key])
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

function pickNumber(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = readNumber(source[key])
    if (value !== undefined) return value
  }
  return undefined
}

function pickBoolean(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = readBoolean(source[key])
    if (value !== undefined) return value
  }
  return undefined
}

function normalizeLineItem(value: unknown, index: number): PartnerQuoteLineItemInput {
  const item = isRecord(value) ? value : {}
  const quantity = pickNumber(item, "quantity", "qty")
  const unitPrice = pickNumber(item, "unitPrice", "unit_price", "price")
  const lineSupplyAmount =
    pickNumber(item, "lineSupplyAmount", "amount") ??
    (quantity != null && unitPrice != null
      ? Math.max(0, Math.round(quantity * unitPrice))
      : undefined)

  return {
    id: pickString(item, "id"),
    sortOrder: pickNumber(item, "sortOrder", "sort_order") ?? index + 1,
    lineNumber: pickNumber(item, "lineNumber", "line_number") ?? index + 1,
    itemType:
      (pickString(item, "itemType", "item_type") as PartnerQuoteLineItemInput["itemType"]) ??
      "hardware",
    itemCode: pickString(item, "itemCode", "item_code", "sku"),
    itemName:
      pickString(item, "itemName", "product_name", "name", "title") ?? `견적 품목 ${index + 1}`,
    itemDescription: pickString(item, "itemDescription", "description", "notes", "remark"),
    quantity,
    quantityUnit: pickString(item, "quantityUnit", "quantity_unit"),
    unitPrice,
    lineSupplyAmount,
    vatIncluded: pickBoolean(item, "vatIncluded", "vat_included") ?? true,
    lineStatus:
      pickString(item, "lineStatus", "line_status") as PartnerQuoteLineItemInput["lineStatus"] | undefined,
    billingMode:
      pickString(item, "billingMode", "billing_mode") as PartnerQuoteLineItemInput["billingMode"] | undefined,
    remark: pickString(item, "remark"),
    optionGroupId: pickString(item, "optionGroupId"),
    optionId: pickString(item, "optionId"),
    isOptional: pickBoolean(item, "isOptional"),
    isUserAdded: pickBoolean(item, "isUserAdded"),
    priceLocked: pickBoolean(item, "priceLocked"),
    quantityLocked: pickBoolean(item, "quantityLocked"),
  }
}

function getQuoteDetailsSource(structuredJson: Record<string, unknown> | null | undefined) {
  const root = isRecord(structuredJson) ? structuredJson : {}
  const details = isRecord(root.quoteDetails) ? root.quoteDetails : root
  const lineItemSource =
    Array.isArray(details.lineItems) ? details.lineItems :
    Array.isArray(details.items) ? details.items :
    Array.isArray(root.lineItems) ? root.lineItems :
    Array.isArray(root.items) ? root.items :
    []

  return { root, details, lineItemSource }
}

export function hasQuoteDetailsStructuredJson(
  structuredJson: Record<string, unknown> | null | undefined
) {
  const { root, details, lineItemSource } = getQuoteDetailsSource(structuredJson)
  return (
    isRecord(root.quoteDetails) ||
    lineItemSource.length > 0 ||
    Boolean(
      pickString(
        details,
        "templateId",
        "template_id",
        "subjectText",
        "subject",
        "recipientCompanyName",
        "customerName",
        "customer_name"
      )
    )
  )
}

export function normalizeQuoteDetailsFromStructuredJson(
  structuredJson: Record<string, unknown> | null | undefined,
  fallback: QuoteDetailsFallback = {}
) {
  const { details, lineItemSource } = getQuoteDetailsSource(structuredJson)
  const lineItems = lineItemSource.map((item, index) => normalizeLineItem(item, index))
  const templateId = inferStandardQuoteTemplateId({
    templateId: pickString(details, "templateId", "template_id"),
    lineItems,
  })

  return finalizeStandardQuoteDetails(
    {
      templateId,
      presetId: pickString(details, "presetId"),
      issuedAt: pickString(details, "issuedAt", "issued_at"),
      validUntil: pickString(details, "validUntil", "valid_until") ?? fallback.validUntil ?? undefined,
      recipientCompanyName:
        pickString(details, "recipientCompanyName", "customerName", "customer_name") ??
        fallback.customerName ??
        undefined,
      referenceName: pickString(details, "referenceName"),
      subjectText: pickString(details, "subjectText", "subject"),
      generalNotes: pickString(details, "generalNotes"),
      specialTerms: pickString(details, "specialTerms"),
      deliveryLocationNote: pickString(details, "deliveryLocationNote"),
      vatIncluded: pickBoolean(details, "vatIncluded", "vat_included") ?? true,
      vatPolicyLabel: pickString(details, "vatPolicyLabel", "vat_policy_label"),
      optionSelections: isRecord(details.optionSelections)
        ? (details.optionSelections as Record<string, QuoteOptionSelectionValue | undefined>)
        : undefined,
      lineItems,
    },
    templateId
  )
}

export function getQuoteDetailsFromStructuredJson(
  structuredJson: Record<string, unknown> | null | undefined,
  fallback: QuoteDetailsFallback = {}
): PartnerQuoteDetailsInput | null {
  if (!hasQuoteDetailsStructuredJson(structuredJson)) return null
  return normalizeQuoteDetailsFromStructuredJson(structuredJson, fallback)
}
