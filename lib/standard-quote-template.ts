import type {
  PartnerQuoteDetailsInput,
  PartnerQuoteLineItemInput,
  QuoteOptionSelectionValue,
} from "@/lib/partners-types"

export type StandardQuoteTemplateId = "camera_t1" | "board_75" | "board_86"
export type StandardQuoteOptionSelections = Record<string, QuoteOptionSelectionValue | undefined>

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

type StandardQuoteRadioOption = {
  value: string
  label: string
  description?: string
}

type StandardQuoteRadioOptionGroup = {
  id: string
  label: string
  description?: string
  control: "radio"
  defaultValue: string
  options: StandardQuoteRadioOption[]
}

type StandardQuoteToggleOptionGroup = {
  id: string
  label: string
  description?: string
  control: "toggle"
  defaultValue: boolean
  enabledLabel?: string
  disabledLabel?: string
}

export type StandardQuoteOptionGroup =
  | StandardQuoteRadioOptionGroup
  | StandardQuoteToggleOptionGroup

export type StandardQuotePreset = {
  id: string
  label: string
  description: string
  templateId: StandardQuoteTemplateId
  optionSelections: StandardQuoteOptionSelections
}

export type StandardQuoteTemplatePreset = {
  id: StandardQuoteTemplateId
  label: string
  description: string
  lines: TemplateLinePreset[]
  optionGroups: StandardQuoteOptionGroup[]
  quickPresets?: StandardQuotePreset[]
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
export const STANDARD_QUOTE_DEFAULT_VAT_EXCLUDED_LABEL = "(단위:원, VAT별도)"
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
    optionGroups: [
      {
        id: "installation_mode",
        label: "설치 방식",
        description: "고객 전달본에 설치비 정책을 바로 반영합니다.",
        control: "radio",
        defaultValue: "separate_billing",
        options: [
          { value: "included_quote", label: "견적 포함", description: "같은 견적서 합계에 포함합니다." },
          { value: "separate_billing", label: "별도 청구", description: "합계에서는 제외하고 안내만 넣습니다." },
          { value: "tbd", label: "추후 협의", description: "설치 정책이 미정일 때 사용합니다." },
        ],
      },
      {
        id: "support_package",
        label: "초기 세팅 지원",
        description: "전달 문구에 운영 지원 항목을 추가합니다.",
        control: "toggle",
        defaultValue: false,
        enabledLabel: "포함",
        disabledLabel: "제외",
      },
    ],
    quickPresets: [
      {
        id: "camera_t1_default",
        label: "기본형",
        description: "카메라 본체 + 설치 별도 청구",
        templateId: "camera_t1",
        optionSelections: {
          installation_mode: "separate_billing",
          support_package: false,
        },
      },
      {
        id: "camera_t1_all_in",
        label: "설치 포함형",
        description: "설치와 초기 세팅을 함께 포함",
        templateId: "camera_t1",
        optionSelections: {
          installation_mode: "included_quote",
          support_package: true,
        },
      },
    ],
  },
  {
    id: "board_75",
    label: '전자칠판 75"',
    description: "중형 전자칠판 도입 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "board-75",
        itemName: '전자칠판 75"',
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
    optionGroups: [
      {
        id: "installation_mode",
        label: "설치 방식",
        description: "설치 정책을 바로 고정합니다.",
        control: "radio",
        defaultValue: "included_quote",
        options: [
          { value: "included_quote", label: "견적 포함", description: "설치 및 교육을 같은 견적에 포함합니다." },
          { value: "separate_billing", label: "별도 청구", description: "설치비는 추후 별도 청구합니다." },
          { value: "tbd", label: "추후 협의", description: "현장 조건 확인 후 확정합니다." },
        ],
      },
      {
        id: "mounting_option",
        label: "거치 방식",
        description: "현장 방식에 맞춰 부자재를 추가합니다.",
        control: "radio",
        defaultValue: "wall_mount",
        options: [
          { value: "wall_mount", label: "벽걸이", description: "기본 거치 방식" },
          { value: "stand", label: "스탠드", description: "이동형 스탠드 포함" },
          { value: "none", label: "미정", description: "거치 방식 추후 확정" },
        ],
      },
      {
        id: "camera_bundle",
        label: "카메라 번들",
        description: "전자칠판 수량에 맞춰 T1 카메라를 추가합니다.",
        control: "toggle",
        defaultValue: false,
        enabledLabel: "추가",
        disabledLabel: "제외",
      },
      {
        id: "support_package",
        label: "유지보수 안내",
        description: "보증/지원 안내 행을 함께 표기합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "표시",
        disabledLabel: "숨김",
      },
    ],
    quickPresets: [
      {
        id: "board_75_classroom",
        label: "교실 기본형",
        description: "벽걸이 + 설치 포함",
        templateId: "board_75",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "wall_mount",
          camera_bundle: false,
          support_package: true,
        },
      },
      {
        id: "board_75_bundle",
        label: "카메라 번들형",
        description: "카메라 포함 교실 패키지",
        templateId: "board_75",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "wall_mount",
          camera_bundle: true,
          support_package: true,
        },
      },
    ],
  },
  {
    id: "board_86",
    label: '전자칠판 86"',
    description: "대형 전자칠판 도입 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "board-86",
        itemName: '전자칠판 86"',
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
    optionGroups: [
      {
        id: "installation_mode",
        label: "설치 방식",
        description: "설치 정책을 바로 고정합니다.",
        control: "radio",
        defaultValue: "included_quote",
        options: [
          { value: "included_quote", label: "견적 포함", description: "설치 및 교육을 같은 견적에 포함합니다." },
          { value: "separate_billing", label: "별도 청구", description: "설치비는 추후 별도 청구합니다." },
          { value: "tbd", label: "추후 협의", description: "현장 조건 확인 후 확정합니다." },
        ],
      },
      {
        id: "mounting_option",
        label: "거치 방식",
        description: "현장 방식에 맞춰 부자재를 추가합니다.",
        control: "radio",
        defaultValue: "wall_mount",
        options: [
          { value: "wall_mount", label: "벽걸이", description: "기본 거치 방식" },
          { value: "stand", label: "스탠드", description: "이동형 스탠드 포함" },
          { value: "none", label: "미정", description: "거치 방식 추후 확정" },
        ],
      },
      {
        id: "camera_bundle",
        label: "카메라 번들",
        description: "전자칠판 수량에 맞춰 T1 카메라를 추가합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "추가",
        disabledLabel: "제외",
      },
      {
        id: "support_package",
        label: "유지보수 안내",
        description: "보증/지원 안내 행을 함께 표기합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "표시",
        disabledLabel: "숨김",
      },
    ],
    quickPresets: [
      {
        id: "board_86_classroom",
        label: "교실 기본형",
        description: "벽걸이 + 카메라 포함",
        templateId: "board_86",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "wall_mount",
          camera_bundle: true,
          support_package: true,
        },
      },
      {
        id: "board_86_stand",
        label: "스탠드형",
        description: "이동형 스탠드 구성",
        templateId: "board_86",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "stand",
          camera_bundle: false,
          support_package: true,
        },
      },
    ],
  },
]

type BuildConfigurableStandardQuoteInput = {
  templateId?: string | null
  input?: PartnerQuoteDetailsInput | null
  optionSelections?: StandardQuoteOptionSelections
  baseQuantity?: number
}

function clampPositiveInteger(value: number | null | undefined, fallback = 1) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.round(Number(value)))
}

function readSelectionString(
  selections: StandardQuoteOptionSelections,
  key: string,
  fallback: string
) {
  const value = selections[key]
  return typeof value === "string" && value.trim() ? value : fallback
}

function readSelectionBoolean(
  selections: StandardQuoteOptionSelections,
  key: string,
  fallback = false
) {
  const value = selections[key]
  return typeof value === "boolean" ? value : fallback
}

function sanitizeFileNameSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()
}

function lineIdentity(item: Pick<PartnerQuoteLineItemInput, "itemCode" | "itemName">) {
  return item.itemCode?.trim() || item.itemName.trim()
}

function createGeneratedLine(
  line: Omit<PartnerQuoteLineItemInput, "sortOrder" | "lineNumber" | "lineSupplyAmount">,
  index: number
) {
  const nextItem: PartnerQuoteLineItemInput = {
    ...line,
    sortOrder: index + 1,
    lineNumber: index + 1,
  }

  return {
    ...nextItem,
    lineSupplyAmount: computeLineSupplyAmount(nextItem),
  }
}

function finalizeLineItems(lineItems: PartnerQuoteDetailsInput["lineItems"]) {
  const items = Array.isArray(lineItems) ? lineItems : []
  return items.map((item, index) => {
    const nextItem: PartnerQuoteLineItemInput = {
      ...item,
      sortOrder: item.sortOrder ?? index + 1,
      lineNumber: item.lineNumber ?? index + 1,
      vatIncluded: item.vatIncluded ?? true,
    }

    return {
      ...nextItem,
      lineSupplyAmount: computeLineSupplyAmount(nextItem),
    }
  })
}

function getExistingLineMap(existingItems: PartnerQuoteDetailsInput["lineItems"]) {
  const map = new Map<string, PartnerQuoteLineItemInput>()
  for (const item of existingItems ?? []) {
    const key = lineIdentity(item)
    if (key) map.set(key, item)
  }
  return map
}

function inferTemplateIdFromItemCode(itemCode?: string | null): StandardQuoteTemplateId {
  if (itemCode === "board-75") return "board_75"
  if (itemCode === "board-86") return "board_86"
  return "camera_t1"
}

export function getStandardQuoteTemplate(templateId?: string | null) {
  return (
    STANDARD_QUOTE_TEMPLATES.find((template) => template.id === templateId) ??
    STANDARD_QUOTE_TEMPLATES[0]
  )
}

export function getStandardQuoteOptionGroups(templateId?: string | null) {
  return getStandardQuoteTemplate(templateId).optionGroups
}

export function getStandardQuoteQuickPresets(templateId?: string | null) {
  return getStandardQuoteTemplate(templateId).quickPresets ?? []
}

export function getStandardQuoteDefaultSelections(templateId?: string | null) {
  return getStandardQuoteOptionGroups(templateId).reduce<StandardQuoteOptionSelections>((acc, group) => {
    acc[group.id] = group.defaultValue
    return acc
  }, {})
}

export function formatStandardQuoteCurrency(value?: number | null) {
  if (value == null) return "-"
  return value.toLocaleString("ko-KR")
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
      optionGroupId: current?.optionGroupId,
      optionId: current?.optionId,
      isOptional: current?.isOptional,
      isUserAdded: current?.isUserAdded,
      priceLocked: current?.priceLocked,
      quantityLocked: current?.quantityLocked,
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

export function finalizeStandardQuoteDetails(
  input?: PartnerQuoteDetailsInput | null,
  fallbackTemplateId?: StandardQuoteTemplateId
): PartnerQuoteDetailsInput {
  const templateId = (
    input?.templateId && getStandardQuoteTemplate(input.templateId).id
  ) as StandardQuoteTemplateId | undefined
  const resolvedTemplateId = templateId ?? fallbackTemplateId ?? STANDARD_QUOTE_TEMPLATES[0].id
  const vatIncluded = input?.vatIncluded ?? true
  const lineItems = finalizeLineItems(input?.lineItems)
  const totals = calculateStandardQuoteTotals(lineItems, vatIncluded)
  const deliveryLocationNote = input?.deliveryLocationNote?.trim() || STANDARD_QUOTE_DEFAULT_DELIVERY_NOTE

  return {
    templateId: resolvedTemplateId,
    presetId: input?.presetId?.trim() || undefined,
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
    vatPolicyLabel:
      input?.vatPolicyLabel?.trim() ||
      (vatIncluded ? STANDARD_QUOTE_DEFAULT_VAT_LABEL : STANDARD_QUOTE_DEFAULT_VAT_EXCLUDED_LABEL),
    deliveryLocationNote,
    paymentTerms: input?.paymentTerms?.trim() || undefined,
    installationPolicy: input?.installationPolicy?.trim() || undefined,
    warrantyNote: input?.warrantyNote?.trim() || undefined,
    generalNotes: input?.generalNotes?.trim() || `납품장소: ${deliveryLocationNote}`,
    specialTerms: input?.specialTerms?.trim() || undefined,
    footerContactText: input?.footerContactText?.trim() || `${STANDARD_QUOTE_SUPPLIER.contactName}/${STANDARD_QUOTE_SUPPLIER.contactPhone}`,
    internalMemo: input?.internalMemo?.trim() || undefined,
    optionSelections: input?.optionSelections,
    pricingSource: input?.pricingSource?.trim() || undefined,
    generatedFromVersionId: input?.generatedFromVersionId?.trim() || undefined,
    generatedFromTemplateVersion: input?.generatedFromTemplateVersion?.trim() || undefined,
    subtotalAmount: totals.subtotalAmount,
    vatAmount: totals.vatAmount,
    discountAmount: totals.discountAmount,
    grandTotalAmount: totals.grandTotalAmount,
    hasPendingAmounts: totals.hasPendingAmounts,
    pendingAmountNote: totals.pendingAmountNote,
    lineItems,
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

  return finalizeStandardQuoteDetails(
    {
      ...input,
      templateId: resolvedTemplateId,
      lineItems: mergeStandardQuoteLineItems(resolvedTemplateId, input?.lineItems),
    },
    resolvedTemplateId
  )
}

export function buildConfigurableStandardQuoteDetails({
  templateId,
  input,
  optionSelections,
  baseQuantity,
}: BuildConfigurableStandardQuoteInput) {
  const resolvedTemplateId = getStandardQuoteTemplate(templateId ?? input?.templateId).id as StandardQuoteTemplateId
  const existing = finalizeStandardQuoteDetails(
    {
      ...input,
      templateId: resolvedTemplateId,
      lineItems: input?.lineItems,
    },
    resolvedTemplateId
  )
  const defaultSelections = getStandardQuoteDefaultSelections(resolvedTemplateId)
  const selections = {
    ...defaultSelections,
    ...(existing.optionSelections ?? {}),
    ...(optionSelections ?? {}),
  }
  const template = getStandardQuoteTemplate(resolvedTemplateId)
  const existingMap = getExistingLineMap(existing.lineItems)
  const mainTemplateLine = template.lines[0]
  const mainCode = mainTemplateLine.itemCode ?? resolvedTemplateId
  const mainExisting = existingMap.get(mainCode)
  const quantity = clampPositiveInteger(
    baseQuantity ?? mainExisting?.quantity ?? mainTemplateLine.quantity ?? 1,
    1
  )
  const generatedItems: Array<Omit<PartnerQuoteLineItemInput, "sortOrder" | "lineNumber" | "lineSupplyAmount">> = [
    {
      id: mainExisting?.id,
      itemType: mainTemplateLine.itemType,
      itemCode: mainCode,
      itemName: mainExisting?.itemName ?? mainTemplateLine.itemName,
      itemDescription: mainExisting?.itemDescription ?? mainTemplateLine.itemDescription,
      quantity,
      quantityUnit: mainTemplateLine.quantityUnit ?? "대",
      unitPrice: mainExisting?.unitPrice ?? mainTemplateLine.unitPrice,
      vatIncluded: mainExisting?.vatIncluded ?? true,
      lineStatus: "priced",
      billingMode: "included_in_quote",
      optionGroupId: "main_product",
      optionId: resolvedTemplateId,
      isOptional: false,
      priceLocked: false,
      quantityLocked: false,
    },
  ]

  const addOptionalLine = (
    code: string,
    config: {
      itemType: PartnerQuoteLineItemInput["itemType"]
      itemName: string
      itemDescription?: string
      quantity: number
      quantityUnit?: string
      unitPrice?: number
      lineStatus?: PartnerQuoteLineItemInput["lineStatus"]
      billingMode?: PartnerQuoteLineItemInput["billingMode"]
      optionGroupId: string
      optionId: string
      priceLocked?: boolean
      quantityLocked?: boolean
      remark?: string
    }
  ) => {
    const existingLine = existingMap.get(code)
    generatedItems.push({
      id: existingLine?.id,
      itemType: config.itemType,
      itemCode: code,
      itemName: existingLine?.itemName ?? config.itemName,
      itemDescription: existingLine?.itemDescription ?? config.itemDescription,
      quantity: config.quantity,
      quantityUnit: config.quantityUnit ?? "식",
      unitPrice:
        config.lineStatus === "pending_price" || config.lineStatus === "separate_billing"
          ? undefined
          : existingLine?.unitPrice ?? config.unitPrice,
      vatIncluded: existingLine?.vatIncluded ?? true,
      lineStatus: config.lineStatus,
      billingMode: config.billingMode,
      remark: existingLine?.remark ?? config.remark,
      optionGroupId: config.optionGroupId,
      optionId: config.optionId,
      isOptional: true,
      priceLocked: config.priceLocked ?? false,
      quantityLocked: config.quantityLocked ?? true,
    })
  }

  const installationMode = readSelectionString(
    selections,
    "installation_mode",
    readSelectionString(defaultSelections, "installation_mode", "included_quote")
  )

  if (resolvedTemplateId === "camera_t1") {
    if (installationMode === "included_quote") {
      addOptionalLine("camera-install", {
        itemType: "installation",
        itemName: "카메라 설치",
        itemDescription: "현장 설치 및 초기 세팅",
        quantity,
        quantityUnit: "대",
        unitPrice: 0,
        optionGroupId: "installation_mode",
        optionId: installationMode,
      })
    } else if (installationMode === "separate_billing") {
      addOptionalLine("camera-install", {
        itemType: "installation",
        itemName: "카메라 설치",
        itemDescription: "별도 청구 예정",
        quantity,
        quantityUnit: "대",
        lineStatus: "separate_billing",
        billingMode: "separate_invoice",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    } else {
      addOptionalLine("camera-install", {
        itemType: "installation",
        itemName: "카메라 설치",
        itemDescription: "현장 조건 확인 후 추후 협의",
        quantity,
        quantityUnit: "대",
        lineStatus: "pending_price",
        billingMode: "tbd",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    }

    if (readSelectionBoolean(selections, "support_package", false)) {
      addOptionalLine("camera-support", {
        itemType: "service",
        itemName: "초기 세팅 지원",
        itemDescription: "운영 시작 전 기본 세팅 및 안내",
        quantity: 1,
        unitPrice: 0,
        optionGroupId: "support_package",
        optionId: "enabled",
      })
    }
  } else {
    const mountingOption = readSelectionString(
      selections,
      "mounting_option",
      readSelectionString(defaultSelections, "mounting_option", "none")
    )
    if (mountingOption === "wall_mount") {
      addOptionalLine("wall-mount", {
        itemType: "installation",
        itemName: "벽걸이 설치",
        itemDescription: "현장 벽면 고정 및 기본 부자재 포함",
        quantity,
        quantityUnit: "대",
        unitPrice: 500_000,
        optionGroupId: "mounting_option",
        optionId: mountingOption,
      })
    } else if (mountingOption === "stand") {
      addOptionalLine("stand", {
        itemType: "hardware",
        itemName: "이동형 스탠드",
        itemDescription: "이동형 스탠드 거치",
        quantity,
        quantityUnit: "대",
        unitPrice: 500_000,
        optionGroupId: "mounting_option",
        optionId: mountingOption,
      })
    }

    if (installationMode === "included_quote") {
      addOptionalLine("install-training", {
        itemType: "service",
        itemName: "설치 및 교육",
        itemDescription: "현장 설치 및 초기 운영 교육",
        quantity: 1,
        unitPrice: 0,
        optionGroupId: "installation_mode",
        optionId: installationMode,
      })
    } else if (installationMode === "separate_billing") {
      addOptionalLine("install-training", {
        itemType: "service",
        itemName: "설치 및 교육",
        itemDescription: "별도 청구 예정",
        quantity: 1,
        lineStatus: "separate_billing",
        billingMode: "separate_invoice",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    } else {
      addOptionalLine("install-training", {
        itemType: "service",
        itemName: "설치 및 교육",
        itemDescription: "현장 확인 후 추후 협의",
        quantity: 1,
        lineStatus: "pending_price",
        billingMode: "tbd",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    }

    if (readSelectionBoolean(selections, "camera_bundle", false)) {
      addOptionalLine("camera-t1", {
        itemType: "hardware",
        itemName: "ClassInX 카메라 T1",
        itemDescription: "강사용 모션트래킹 카메라 (전용 POE 스위치 포함)",
        quantity,
        quantityUnit: "대",
        unitPrice: 1_050_000,
        optionGroupId: "camera_bundle",
        optionId: "enabled",
      })
    }

    if (readSelectionBoolean(selections, "support_package", true)) {
      addOptionalLine("support-1y", {
        itemType: "service",
        itemName: "유지보수 1년",
        itemDescription: "기본 보증 및 운영 지원 안내",
        quantity: 1,
        unitPrice: 0,
        optionGroupId: "support_package",
        optionId: "enabled",
      })
    }
  }

  return finalizeStandardQuoteDetails(
    {
      ...existing,
      templateId: resolvedTemplateId,
      optionSelections: selections,
      pricingSource: "standard_quote_builder",
      lineItems: generatedItems.map((item, index) => createGeneratedLine(item, index)),
    },
    resolvedTemplateId
  )
}

export function inferStandardQuoteTemplateId(
  quoteDetails?: Pick<PartnerQuoteDetailsInput, "templateId" | "lineItems"> | null
) {
  if (quoteDetails?.templateId) {
    return getStandardQuoteTemplate(quoteDetails.templateId).id as StandardQuoteTemplateId
  }

  const firstItemCode = quoteDetails?.lineItems?.find((item) => item.itemCode)?.itemCode
  return inferTemplateIdFromItemCode(firstItemCode)
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
