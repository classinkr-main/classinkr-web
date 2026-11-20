import {
  getQuoteTemplateProductLineLabel,
  getQuoteTemplateSupplierLabel,
} from "@/lib/quote-team-templates"
import {
  getQuoteProductLineTemplateId,
  isRetiredQuoteTemplate,
  isSoftwareQuoteTemplate,
  STANDARD_QUOTE_TEMPLATES,
  type QuoteProductLine,
  type StandardQuoteTemplateId,
  type StandardQuoteTemplatePreset,
} from "@/lib/standard-quote-template"

// 견적서 탭 첫 화면(템플릿 고르기)에 내놓을 기본 템플릿 목록.
//
// 거르는 기준은 작성기 왼쪽 템플릿 목록(QuickQuoteComposer 의 visibleTemplates)과 같다:
//  - 판매 중단 템플릿(isRetiredQuoteTemplate)은 내놓지 않는다.
//  - 사용자가 숨긴 템플릿(개인 설정 hiddenTemplateIds 의 "base:<id>")은 내놓지 않는다.
// 작성기는 여기에 "지금 작성 중인 유형(SW/HW)" 조건을 하나 더 걸지만, 이 화면은 유형을 고르기 전이라 묶음으로 나눈다.

export type QuoteTemplatePickerCard = Pick<StandardQuoteTemplatePreset, "id" | "label" | "description"> & {
  /** 카드에 보조 글자로 늘어놓는 프리셋 이름. */
  presetLabels: string[]
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
 * 하드웨어 → 소프트웨어 순서의 카드 묶음. 묶음 안은 그 유형의 대표 템플릿(헤더의 HW·SW 작성 버튼이 여는 것)을
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
