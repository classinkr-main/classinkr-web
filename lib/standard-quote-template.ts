import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"

export type StandardQuoteTemplateId = "camera_t1" | "board_75" | "board_86"

type TemplateLinePreset = {
  itemType: PartnerQuoteLineItemInput["itemType"]
  itemCode?: string
  itemName: string
  itemDescription?: string
  quantity?: number
  quantityUnit?: string
  unitPrice?: number
  lineStatus?: PartnerQuoteLineItemInput["lineStatus"]
  billingMode?: PartnerQuoteLineItemInput["billingMode"]
  remark?: string
  quantityEditable?: boolean
  priceEditable?: boolean
}

export type StandardQuoteTemplatePreset = {
  id: StandardQuoteTemplateId
  label: string
  description: string
  lines: TemplateLinePreset[]
}

export const STANDARD_QUOTE_SUPPLIER = {
  businessName: "퀴드러닝",
  businessRegistrationNumber: "170-07-03305",
  representativeName: "조혜리",
  address: "경기도 오산시 독산성로 425, 1008호",
  contactName: "배철웅",
  contactPhone: "010-9238-5874",
  contactEmail: "",
} as const

export const STANDARD_QUOTE_DEFAULT_BODY = "아래와 같이 견적서를 제출합니다."
export const STANDARD_QUOTE_DEFAULT_UNIT_LABEL = "원"
export const STANDARD_QUOTE_DEFAULT_VAT_LABEL = "(단위:원, VAT포함)"
export const STANDARD_QUOTE_DEFAULT_DELIVERY_NOTE = "구매처 지정장소"

export const STANDARD_QUOTE_TEMPLATES: StandardQuoteTemplatePreset[] = [
  {
    id: "camera_t1",
    label: "카메라 T1",
    description: "강사용 모션트래킹 카메라 기본 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "camera-t1",
        itemName: "ClassInX 카메라 T1",
        itemDescription: "강사용 모션트래킹 카메라 (전용 POE 스위치 포함)",
        quantity: 1,
        quantityUnit: "대",
        unitPrice: 1_050_000,
        quantityEditable: true,
        priceEditable: true,
      },
      {
        itemType: "installation",
        itemCode: "camera-install",
        itemName: "카메라 설치",
        itemDescription: "별도 청구 예정",
        quantity: 1,
        quantityUnit: "대",
        lineStatus: "separate_billing",
        billingMode: "separate_invoice",
        quantityEditable: true,
        priceEditable: false,
      },
    ],
  },
  {
    id: "board_75",
    label: "보드 75인치",
    description: "중형 전자칠판 도입 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "board-75",
        itemName: "ClassIn Board 75인치",
        itemDescription: "중형 전자칠판 패널",
        quantity: 1,
        quantityUnit: "대",
        unitPrice: 4_000_000,
        quantityEditable: true,
        priceEditable: true,
      },
      {
        itemType: "service",
        itemCode: "install-training",
        itemName: "설치 및 교육",
        itemDescription: "현장 설치 및 초기 운영 교육",
        quantity: 1,
        quantityUnit: "식",
        unitPrice: 0,
        quantityEditable: false,
        priceEditable: true,
      },
    ],
  },
  {
    id: "board_86",
    label: "보드 86인치",
    description: "대형 전자칠판 도입 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "board-86",
        itemName: "ClassIn Board 86인치",
        itemDescription: "대형 전자칠판 패널",
        quantity: 1,
        quantityUnit: "대",
        unitPrice: 5_000_000,
        quantityEditable: true,
        priceEditable: true,
      },
      {
        itemType: "service",
        itemCode: "install-training",
        itemName: "설치 및 교육",
        itemDescription: "현장 설치 및 초기 운영 교육",
        quantity: 1,
        quantityUnit: "식",
        unitPrice: 0,
        quantityEditable: false,
        priceEditable: true,
      },
    ],
  },
]

export function getStandardQuoteTemplate(templateId?: string | null) {
  return (
    STANDARD_QUOTE_TEMPLATES.find((template) => template.id === templateId) ??
    STANDARD_QUOTE_TEMPLATES[0]
  )
}

export function formatStandardQuoteCurrency(value?: number | null) {
  if (value == null) return "-"
  return value.toLocaleString("ko-KR")
}

function sanitizeFileNameSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()
}

export function isPendingQuoteLine(item: Pick<PartnerQuoteLineItemInput, "lineStatus" | "billingMode" | "unitPrice">) {
  return (
    item.lineStatus === "pending_price" ||
    item.lineStatus === "separate_billing" ||
    item.billingMode === "separate_invoice" ||
    item.unitPrice == null
  )
}

function computeLineSupplyAmount(item: Pick<PartnerQuoteLineItemInput, "quantity" | "unitPrice" | "lineStatus" | "billingMode">) {
  if (isPendingQuoteLine(item)) return undefined
  const quantity = Number(item.quantity ?? 0)
  const unitPrice = Number(item.unitPrice ?? 0)
  return Math.max(0, Math.round(quantity * unitPrice))
}

export function getTemplateLinePreset(
  templateId: StandardQuoteTemplateId,
  lineNumber: number
) {
  return getStandardQuoteTemplate(templateId).lines[lineNumber - 1]
}

export function mergeStandardQuoteLineItems(
  templateId: StandardQuoteTemplateId,
  existingItems?: PartnerQuoteDetailsInput["lineItems"]
) {
  const template = getStandardQuoteTemplate(templateId)
  const currentItems = Array.isArray(existingItems) ? existingItems : []

  return template.lines.map<PartnerQuoteLineItemInput>((line, index) => {
    const current = currentItems[index]
    const quantity = current?.quantity ?? line.quantity
    const unitPrice = current?.unitPrice ?? line.unitPrice
    const nextItem: PartnerQuoteLineItemInput = {
      id: current?.id,
      sortOrder: index + 1,
      lineNumber: index + 1,
      itemType: line.itemType,
      itemCode: line.itemCode,
      itemName: current?.itemName ?? line.itemName,
      itemDescription: current?.itemDescription ?? line.itemDescription,
      quantity,
      quantityUnit: current?.quantityUnit ?? line.quantityUnit ?? "대",
      unitPrice,
      vatIncluded: current?.vatIncluded ?? true,
      lineStatus: current?.lineStatus ?? line.lineStatus,
      billingMode: current?.billingMode ?? line.billingMode,
      remark: current?.remark ?? line.remark,
      linkedChecklistTemplateId: current?.linkedChecklistTemplateId,
      linkedQuantityRowId: current?.linkedQuantityRowId,
    }

    return {
      ...nextItem,
      lineSupplyAmount: computeLineSupplyAmount(nextItem),
    }
  })
}

export function calculateStandardQuoteTotals(
  lineItems: PartnerQuoteDetailsInput["lineItems"],
  vatIncluded = true
) {
  const items = Array.isArray(lineItems) ? lineItems : []
  const subtotalAmount = items.reduce((sum, item) => sum + Number(item.lineSupplyAmount ?? 0), 0)
  const vatAmount = vatIncluded ? 0 : Math.round(subtotalAmount * 0.1)
  const grandTotalAmount = subtotalAmount + vatAmount
  const hasPendingAmounts = items.some((item) => isPendingQuoteLine(item))

  return {
    subtotalAmount,
    vatAmount,
    discountAmount: 0,
    grandTotalAmount,
    hasPendingAmounts,
    pendingAmountNote: hasPendingAmounts ? "별도 청구 예정 항목은 합계에서 제외됩니다." : undefined,
  }
}

export function buildStandardQuoteDetails(
  input?: PartnerQuoteDetailsInput | null,
  fallbackTemplateId?: StandardQuoteTemplateId
): PartnerQuoteDetailsInput {
  const templateId = (
    input?.templateId && getStandardQuoteTemplate(input.templateId).id
  ) as StandardQuoteTemplateId | undefined
  const resolvedTemplateId = templateId ?? fallbackTemplateId ?? STANDARD_QUOTE_TEMPLATES[0].id
  const vatIncluded = input?.vatIncluded ?? true
  const lineItems = mergeStandardQuoteLineItems(resolvedTemplateId, input?.lineItems)
  const totals = calculateStandardQuoteTotals(lineItems, vatIncluded)
  const deliveryLocationNote = input?.deliveryLocationNote?.trim() || STANDARD_QUOTE_DEFAULT_DELIVERY_NOTE

  return {
    templateId: resolvedTemplateId,
    estimateNumber: input?.estimateNumber?.trim() || undefined,
    workflowStatus: input?.workflowStatus ?? "draft",
    issuedAt: input?.issuedAt || undefined,
    validUntil: input?.validUntil || undefined,
    subjectText: input?.subjectText?.trim() || STANDARD_QUOTE_DEFAULT_BODY,
    recipientCompanyName: input?.recipientCompanyName?.trim() || undefined,
    recipientContactName: input?.recipientContactName?.trim() || undefined,
    recipientPhone: input?.recipientPhone?.trim() || undefined,
    recipientEmail: input?.recipientEmail?.trim() || undefined,
    referenceName: input?.referenceName?.trim() || undefined,
    supplierBusinessName: STANDARD_QUOTE_SUPPLIER.businessName,
    supplierBusinessRegistrationNumber: STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber,
    supplierRepresentativeName: STANDARD_QUOTE_SUPPLIER.representativeName,
    supplierAddress: STANDARD_QUOTE_SUPPLIER.address,
    supplierContactName: STANDARD_QUOTE_SUPPLIER.contactName,
    supplierContactPhone: STANDARD_QUOTE_SUPPLIER.contactPhone,
    supplierContactEmail: STANDARD_QUOTE_SUPPLIER.contactEmail,
    currencyUnitLabel: input?.currencyUnitLabel?.trim() || STANDARD_QUOTE_DEFAULT_UNIT_LABEL,
    vatIncluded,
    vatPolicyLabel: input?.vatPolicyLabel?.trim() || STANDARD_QUOTE_DEFAULT_VAT_LABEL,
    deliveryLocationNote,
    paymentTerms: input?.paymentTerms?.trim() || undefined,
    installationPolicy: input?.installationPolicy?.trim() || undefined,
    warrantyNote: input?.warrantyNote?.trim() || undefined,
    generalNotes: input?.generalNotes?.trim() || `납품장소: ${deliveryLocationNote}`,
    specialTerms: input?.specialTerms?.trim() || undefined,
    footerContactText: input?.footerContactText?.trim() || `${STANDARD_QUOTE_SUPPLIER.contactName}/${STANDARD_QUOTE_SUPPLIER.contactPhone}`,
    internalMemo: input?.internalMemo?.trim() || undefined,
    subtotalAmount: totals.subtotalAmount,
    vatAmount: totals.vatAmount,
    discountAmount: totals.discountAmount,
    grandTotalAmount: totals.grandTotalAmount,
    hasPendingAmounts: totals.hasPendingAmounts,
    pendingAmountNote: totals.pendingAmountNote,
    lineItems,
  }
}

export function buildStandardQuoteTitle(quoteDetails: PartnerQuoteDetailsInput) {
  const template = getStandardQuoteTemplate(quoteDetails.templateId)
  const recipient = quoteDetails.recipientCompanyName?.trim()
  return recipient ? `${recipient} ${template.label} 견적서` : `${template.label} 표준 견적서`
}

export function buildStandardQuoteFileLabel(quoteDetails: PartnerQuoteDetailsInput) {
  const title = sanitizeFileNameSegment(buildStandardQuoteTitle(quoteDetails))
  return `${title || "표준 견적서"}.pdf`
}
