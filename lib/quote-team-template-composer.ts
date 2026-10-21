import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"
import {
  QUOTE_TEMPLATE_VALIDITY_DAYS,
  getQuoteTemplateCatalogEntry,
  type QuoteTemplateInput,
  type QuoteTemplateItem,
  type QuoteTemplateView,
} from "@/lib/quote-team-templates"
import {
  QUOTE_NOTE_PRESETS,
  STANDARD_QUOTE_TEMPLATES,
  buildConfigurableStandardQuoteDetails,
  getStandardQuoteDefaultSelections,
  getStandardQuoteOptionGroups,
  getStandardQuoteTemplate,
  isSoftwareQuoteTemplate,
  quoteNoteHasLine,
  type StandardQuoteOptionSelections,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

// 팀 템플릿(quote_team_templates 뷰) ⇄ 견적 작성기(QuickQuoteComposer) 변환.
//  - 뷰 → 작성기: 기본 템플릿으로 한 장을 짜고(옵션 그룹·딸린 0원 행 유지) 템플릿 품목의 수량·단가를 덮어쓴다.
//  - 작성기 → 저장 입력: 카탈로그 품목만 골라 sku·수량·단가 덮어쓰기(정가면 null)로 접는다.

const MAIN_PRODUCT_SKU = new Map<StandardQuoteTemplateId, string | undefined>(
  STANDARD_QUOTE_TEMPLATES.map((template) => [template.id, template.lines[0]?.itemCode])
)

function addDays(dateValue: string, days: number) {
  // UTC 로 계산해야 KST 에서 하루 밀리지 않는다.
  const base = new Date(`${dateValue}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

function hasOptionGroup(templateId: StandardQuoteTemplateId, groupId: string) {
  return getStandardQuoteOptionGroups(templateId).some((group) => group.id === groupId)
}

/** 대표 품목이 템플릿 품목 안에 있는 기본 템플릿 — 원본(baseTemplateId)을 먼저 본다. */
function pickTemplateId(view: QuoteTemplateView): StandardQuoteTemplateId | null {
  const skus = new Set(view.items.map((item) => item.sku))
  const candidates = [
    ...(view.baseTemplateId ? [view.baseTemplateId] : []),
    ...STANDARD_QUOTE_TEMPLATES.map((template) => template.id),
  ]
  return (
    candidates.find((templateId) => {
      const mainSku = MAIN_PRODUCT_SKU.get(templateId)
      return (
        mainSku !== undefined &&
        skus.has(mainSku) &&
        (isSoftwareQuoteTemplate(templateId) ? "software" : "hardware") === view.productLine
      )
    }) ?? null
  )
}

function userLine(item: QuoteTemplateView["items"][number], index: number, productLine: QuoteTemplateView["productLine"]): PartnerQuoteLineItemInput {
  return {
    sortOrder: index + 1,
    lineNumber: index + 1,
    itemType: productLine === "software" ? "service" : "hardware",
    itemCode: item.sku,
    itemName: item.name,
    quantity: item.quantity,
    quantityUnit: productLine === "software" ? "식" : "대",
    unitPrice: item.unitPrice,
    vatIncluded: true,
    lineStatus: "priced",
    billingMode: "included_in_quote",
    isOptional: true,
    isUserAdded: true,
    priceLocked: false,
    quantityLocked: false,
  }
}

/** 팀 템플릿 뷰 한 건 → 작성기 details(견적서 1장). 품목이 없으면 null. */
export function teamTemplateViewToQuoteDetails(
  view: QuoteTemplateView,
  today: string
): PartnerQuoteDetailsInput | null {
  if (view.items.length === 0) return null

  const templateId =
    pickTemplateId(view) ?? (view.productLine === "software" ? "business_recharge" : "board_86")
  const mainSku = MAIN_PRODUCT_SKU.get(templateId)
  const mainItem = view.items.find((item) => item.sku === mainSku)
  const mainQuantity = mainItem?.quantity ?? 1

  const selections: StandardQuoteOptionSelections = { ...getStandardQuoteDefaultSelections(templateId) }
  if (hasOptionGroup(templateId, "installation_mode")) selections.installation_mode = view.defaults.installation
  if (hasOptionGroup(templateId, "payment_plan")) selections.payment_plan = view.defaults.payment

  // 대표 수량과 같이 움직이는 딸린 품목(벽걸이·스탠드·T1)은 옵션으로 켜고, 수량이 다르면 따로 행을 둔다.
  const consumed = new Set<string>(mainItem ? [mainItem.sku] : [])
  const followsMain = (sku: string) =>
    view.items.some((item) => item.sku === sku && item.quantity === mainQuantity)
  if (mainItem && hasOptionGroup(templateId, "mounting_option")) {
    const mounting = followsMain("wall-mount") ? "wall-mount" : followsMain("stand") ? "stand" : null
    selections.mounting_option = mounting === "wall-mount" ? "wall_mount" : mounting ?? "none"
    if (mounting) consumed.add(mounting)
  }
  if (mainItem && hasOptionGroup(templateId, "camera_bundle")) {
    selections.camera_bundle = followsMain("camera-t1")
    if (selections.camera_bundle) consumed.add("camera-t1")
  }

  const built = buildConfigurableStandardQuoteDetails({
    templateId,
    input: { templateId },
    optionSelections: selections,
    baseQuantity: mainQuantity,
  })
  const priceBySku = new Map(view.items.map((item) => [item.sku, item.unitPrice]))
  const generated = (built.lineItems ?? [])
    // 대표 품목이 템플릿에 없으면(번들만 담은 템플릿 등) 기본 템플릿의 대표 행을 빼고 품목 행만 쓴다.
    .filter((line) => mainItem || line.optionGroupId !== "main_product")
    .map((line) =>
      line.itemCode && consumed.has(line.itemCode)
        ? { ...line, unitPrice: priceBySku.get(line.itemCode) ?? line.unitPrice }
        : line
    )
  const extras = view.items.filter((item) => !consumed.has(item.sku))
  const lineItems = [...generated, ...extras.map((item, index) => userLine(item, generated.length + index, view.productLine))]
    .map((line, index) => ({ ...line, sortOrder: index + 1, lineNumber: index + 1 }))

  const presets = QUOTE_NOTE_PRESETS.filter((preset) => view.defaults.notePresetIds.includes(preset.id))
  const notesOf = (group: "general" | "special") =>
    presets.filter((preset) => preset.group === group).map((preset) => preset.text).join("\n") || undefined

  return {
    ...built,
    templateId,
    optionSelections: selections,
    lineItems,
    issuedAt: today,
    validUntil: addDays(today, view.defaults.validityDays),
    vatIncluded: view.defaults.vat === "included",
    vatPolicyLabel: undefined,
    generalNotes: notesOf("general"),
    specialTerms: notesOf("special"),
  }
}

function nearestValidityDays(issuedAt?: string, validUntil?: string): QuoteTemplateInput["defaults"]["validityDays"] {
  const days =
    issuedAt && validUntil
      ? Math.round((Date.parse(`${validUntil}T00:00:00`) - Date.parse(`${issuedAt}T00:00:00`)) / 86_400_000)
      : NaN
  if (!Number.isFinite(days) || days <= 0) return 30
  return QUOTE_TEMPLATE_VALIDITY_DAYS.reduce((best, option) =>
    Math.abs(option - days) < Math.abs(best - days) ? option : best
  )
}

/**
 * 작성기의 견적서 한 장 → POST /api/admin/quote-templates 입력.
 * 카탈로그에 없는 행(0원 안내·정보 라인)은 빠지고, 같은 품목은 수량을 합친다. 품목이 없으면 null.
 */
export function quoteDetailsToTeamTemplateInput(
  name: string,
  details: PartnerQuoteDetailsInput
): QuoteTemplateInput | null {
  const templateId = getStandardQuoteTemplate(details.templateId).id
  const productLine = isSoftwareQuoteTemplate(templateId) ? "software" : "hardware"
  const items: QuoteTemplateItem[] = []

  for (const line of details.lineItems ?? []) {
    const entry = line.itemCode ? getQuoteTemplateCatalogEntry(line.itemCode) : null
    const quantity = Math.round(Number(line.quantity ?? 0))
    if (!entry || entry.productLine !== productLine || quantity < 1 || line.unitPrice == null) continue
    const unitPrice = line.unitPrice === entry.listPrice ? null : Math.max(0, Math.round(line.unitPrice))
    const existing = items.find((item) => item.sku === entry.sku)
    if (existing) {
      existing.quantity += quantity
      continue
    }
    items.push({ sku: entry.sku, quantity, unitPrice })
  }
  if (items.length === 0) return null

  const selections = details.optionSelections ?? {}
  const installation = selections.installation_mode
  const notes = [details.generalNotes, details.specialTerms].join("\n")

  return {
    name: name.trim(),
    productLine,
    sourceTemplateId: templateId,
    items,
    defaults: {
      validityDays: nearestValidityDays(details.issuedAt, details.validUntil),
      vat: details.vatIncluded === false ? "excluded" : "included",
      installation:
        installation === "separate_billing" || installation === "tbd" ? installation : "included_quote",
      payment: selections.payment_plan === "12_month" ? "12_month" : "one_time",
      notePresetIds: QUOTE_NOTE_PRESETS.filter((preset) => quoteNoteHasLine(notes, preset.text)).map(
        (preset) => preset.id
      ),
    },
    // 디자인 정본: "이 구성을 팀 템플릿으로 저장". 메뉴 노출은 설정 화면에서 켠다.
    scope: "team",
    showInMenu: false,
  }
}
