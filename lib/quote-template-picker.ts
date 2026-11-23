import {
  getQuoteTemplateProductLineLabel,
  getQuoteTemplateSupplierLabel,
} from "@/lib/quote-team-templates"
import {
  buildConfigurableStandardQuoteDetails,
  getQuoteProductLineLabel,
  getQuoteProductLineTemplateId,
  getStandardQuoteDefaultSelections,
  getStandardQuoteTemplate,
  isPendingQuoteLine,
  isQuoteNoteLine,
  isRetiredQuoteTemplate,
  isSoftwareQuoteTemplate,
  resolveQuoteSupplier,
  STANDARD_QUOTE_TEMPLATES,
  type QuoteProductLine,
  type StandardQuotePreset,
  type StandardQuoteTemplateId,
  type StandardQuoteTemplatePreset,
} from "@/lib/standard-quote-template"

// 견적서 탭(템플릿 화면)의 왼쪽 목록과 오른쪽 미리보기가 쓰는 기본 템플릿 데이터.
//
// 거르는 기준은 작성기 왼쪽 템플릿 목록(QuickQuoteComposer 의 visibleTemplates)과 같다:
//  - 판매 중단 템플릿(isRetiredQuoteTemplate)은 내놓지 않는다.
//  - 사용자가 숨긴 템플릿(개인 설정 hiddenTemplateIds 의 "base:<id>")은 내놓지 않는다.
// 작성기는 여기에 "지금 작성 중인 유형(SW/HW)" 조건을 하나 더 걸지만, 이 화면은 유형을 고르기 전이라 묶음으로 나눈다.

export type QuoteTemplatePickerCard = Pick<StandardQuoteTemplatePreset, "id" | "label" | "description"> & {
  /** 목록 줄에 보조 글자로 늘어놓는 프리셋 이름. */
  presetLabels: string[]
  /** 미리보기의 구성 선택 버튼. */
  presets: Array<Pick<StandardQuotePreset, "id" | "label" | "description">>
}

export interface QuoteTemplatePickerGroup {
  productLine: QuoteProductLine
  /** "하드웨어" · "소프트웨어" */
  label: string
  /** 견적서에 찍히는 공급자 — SW 와 HW 가 다르다. */
  supplierLabel: string
  templates: QuoteTemplatePickerCard[]
}

const PRODUCT_LINE_ORDER: QuoteProductLine[] = ["hardware", "software"]

/** 개인 설정에 저장되는 기본 템플릿 숨김 키 — 작성기·템플릿 관리 화면과 같은 형식이다. */
export function baseQuoteTemplateHiddenKey(templateId: StandardQuoteTemplateId) {
  return `base:${templateId}`
}

export function isPickableQuoteTemplate(templateId: StandardQuoteTemplateId, hiddenTemplateIds: readonly string[]) {
  return !isRetiredQuoteTemplate(templateId) && !hiddenTemplateIds.includes(baseQuoteTemplateHiddenKey(templateId))
}

/** 숨겨서 이 화면에 안 나오는 기본 템플릿 수(판매 중단은 세지 않는다). */
export function countHiddenBaseQuoteTemplates(hiddenTemplateIds: readonly string[]) {
  return STANDARD_QUOTE_TEMPLATES.filter(
    (template) => !isRetiredQuoteTemplate(template.id) && !isPickableQuoteTemplate(template.id, hiddenTemplateIds)
  ).length
}

/**
 * 하드웨어 → 소프트웨어 순서의 템플릿 묶음. 묶음 안은 그 유형의 대표 템플릿(헤더의 HW·SW 작성 버튼이 여는 것)을
 * 맨 앞에 두고 나머지는 STANDARD_QUOTE_TEMPLATES 순서를 따른다. 내놓을 템플릿이 없는 묶음은 빠진다.
 */
export function listQuoteTemplatePickerGroups(hiddenTemplateIds: readonly string[] = []): QuoteTemplatePickerGroup[] {
  return PRODUCT_LINE_ORDER.flatMap((productLine) => {
    const leadId = getQuoteProductLineTemplateId(productLine)
    const templates = STANDARD_QUOTE_TEMPLATES.filter(
      (template) =>
        (isSoftwareQuoteTemplate(template.id) ? "software" : "hardware") === productLine &&
        isPickableQuoteTemplate(template.id, hiddenTemplateIds)
    )
      .sort((left, right) => Number(right.id === leadId) - Number(left.id === leadId))
      .map((template) => ({
        id: template.id,
        label: template.label,
        description: template.description,
        presetLabels: (template.quickPresets ?? []).map((preset) => preset.label),
        presets: (template.quickPresets ?? []).map(({ id, label, description }) => ({ id, label, description })),
      }))

    if (templates.length === 0) return []
    return [
      {
        productLine,
        label: getQuoteTemplateProductLineLabel(productLine),
        supplierLabel: getQuoteTemplateSupplierLabel(productLine),
        templates,
      },
    ]
  })
}

/** 목록의 검색(템플릿 이름)·유형 필터. 남는 템플릿이 없는 묶음은 빠진다. */
export function filterQuoteTemplatePickerGroups(
  groups: QuoteTemplatePickerGroup[],
  filter: { query?: string; productLine?: QuoteProductLine | "all" }
): QuoteTemplatePickerGroup[] {
  const query = filter.query?.trim().toLowerCase() ?? ""
  const productLine = filter.productLine ?? "all"
  return groups.flatMap((group) => {
    if (productLine !== "all" && group.productLine !== productLine) return []
    const templates = query
      ? group.templates.filter((template) => template.label.toLowerCase().includes(query))
      : group.templates
    return templates.length > 0 ? [{ ...group, templates }] : []
  })
}

export interface QuoteTemplatePreviewLine {
  key: string
  name: string
  description: string | null
  /** 금액 없는 안내 행(note)은 수량·금액을 찍지 않고, 별도 청구 행(pending)은 합계에 들지 않는다. */
  kind: "priced" | "note" | "pending"
  quantity: number | null
  quantityUnit: string | null
  amount: number | null
}

export interface QuoteTemplatePreview {
  templateId: StandardQuoteTemplateId
  presetId: string | null
  label: string
  description: string
  /** "HW" · "SW" */
  productLineLabel: string
  productLine: QuoteProductLine
  /** 견적서에 찍히는 공급자 상호. */
  supplierBusinessName: string
  lines: QuoteTemplatePreviewLine[]
  subtotalAmount: number
  vatAmount: number
  totalAmount: number
  vatIncluded: boolean
  pendingAmountNote: string | null
  deliveryLocationNote: string | null
  /** 작성 창이 처음 여는 구성(프리셋 없음)과 품목·옵션이 같은가. */
  matchesDefault: boolean
}

function buildTemplateQuote(templateId: StandardQuoteTemplateId, presetId?: string | null) {
  const preset = presetId
    ? getStandardQuoteTemplate(templateId).quickPresets?.find((item) => item.id === presetId)
    : undefined
  // 작성기(QuickQuoteComposer 의 buildSheet)가 템플릿·프리셋에서 첫 시트를 만드는 호출과 같다:
  // 기본 옵션 위에 프리셋 옵션을 덮고, 대표 품목 수량 1 로 품목·합계를 계산한다.
  return buildConfigurableStandardQuoteDetails({
    templateId,
    input: { templateId, presetId: preset?.id },
    optionSelections: { ...getStandardQuoteDefaultSelections(templateId), ...(preset?.optionSelections ?? {}) },
    baseQuantity: 1,
  })
}

function compositionKey(quote: ReturnType<typeof buildTemplateQuote>) {
  return JSON.stringify([
    quote.optionSelections,
    (quote.lineItems ?? []).map((line) => [line.itemCode, line.itemName, line.itemDescription, line.quantity, line.unitPrice]),
  ])
}

/** 작성 창이 처음 여는 구성과 같은 프리셋(보통 첫 프리셋). 미리보기의 기본 선택이다. 없으면 null. */
export function getDefaultQuoteTemplatePresetId(templateId: StandardQuoteTemplateId): string | null {
  const base = compositionKey(buildTemplateQuote(templateId))
  const presets = getStandardQuoteTemplate(templateId).quickPresets ?? []
  return presets.find((preset) => compositionKey(buildTemplateQuote(templateId, preset.id)) === base)?.id ?? null
}

/**
 * 템플릿(과 프리셋)의 기본 구성 미리보기. 값은 전부 템플릿 정의에서 계산한다 — 고객·할인·유효기한처럼
 * 작성 창에서 정하는 값은 여기 없다.
 */
export function buildQuoteTemplatePreview(
  templateId: StandardQuoteTemplateId,
  presetId?: string | null
): QuoteTemplatePreview {
  const template = getStandardQuoteTemplate(templateId)
  const quote = buildTemplateQuote(template.id, presetId)
  const productLine: QuoteProductLine = isSoftwareQuoteTemplate(template.id) ? "software" : "hardware"

  return {
    templateId: template.id,
    presetId: quote.presetId ?? null,
    label: template.label,
    description: template.description,
    productLineLabel: getQuoteProductLineLabel(productLine),
    productLine,
    supplierBusinessName: resolveQuoteSupplier(template.id).supplierBusinessName ?? "",
    lines: (quote.lineItems ?? []).map((line, index) => {
      const kind = isQuoteNoteLine(line) ? "note" : isPendingQuoteLine(line) ? "pending" : "priced"
      return {
        key: `${line.itemCode ?? line.itemName}-${index}`,
        name: line.itemName,
        description: line.itemDescription ?? null,
        kind,
        quantity: kind === "note" ? null : (line.quantity ?? null),
        quantityUnit: kind === "note" ? null : (line.quantityUnit ?? null),
        amount: kind === "priced" ? (line.lineSupplyAmount ?? null) : null,
      }
    }),
    subtotalAmount: quote.subtotalAmount ?? 0,
    vatAmount: quote.vatAmount ?? 0,
    totalAmount: quote.grandTotalAmount ?? 0,
    vatIncluded: quote.vatIncluded ?? true,
    pendingAmountNote: quote.pendingAmountNote ?? null,
    deliveryLocationNote: quote.deliveryLocationNote ?? null,
    matchesDefault: compositionKey(quote) === compositionKey(buildTemplateQuote(template.id)),
  }
}
