import { PRODUCT_TEMPLATES } from "@/lib/product-templates"
import {
  QUOTE_NOTE_PRESETS,
  STANDARD_QUOTE_TEMPLATES,
  isSoftwareQuoteTemplate,
  type QuoteProductLine,
  type StandardQuoteTemplateId,
  type StandardQuoteTemplatePreset,
} from "@/lib/standard-quote-template"

// 견적 팀 템플릿(2026-10-21) — 기본 템플릿(코드 상수 STANDARD_QUOTE_TEMPLATES) + 영업팀이 저장한 구성(quote_team_templates).
//
//  - 견적 1장 = 공급자 1곳(SW=클래스인, HW=퀴드러닝). 템플릿의 product_line 이 공급자를 정하고, 품목은 전부 같은 줄이어야 한다.
//  - 단가는 덮어쓰기만 저장한다(null = 정가). 정가는 카탈로그(getProductBySku) → 없으면 기본 템플릿 라인 단가.
//  - 할인은 표시만 한다(승인 없음) — 정가보다 낮으면 "정가 대비 N% 할인".
//  - 서버·클라이언트 공용 순수 모듈. DB 접근은 lib/repositories/quote-team-templates.ts.

export type QuoteTemplateScope = "mine" | "team"
export type QuoteTemplateVat = "excluded" | "included"
export type QuoteTemplateInstallation = "included_quote" | "separate_billing" | "tbd"
export type QuoteTemplatePayment = "one_time" | "12_month"

export const QUOTE_TEMPLATE_VALIDITY_DAYS = [14, 30, 60] as const
export type QuoteTemplateValidityDays = (typeof QUOTE_TEMPLATE_VALIDITY_DAYS)[number]

export const QUOTE_TEMPLATE_VAT_OPTIONS: Array<{ value: QuoteTemplateVat; label: string }> = [
  { value: "excluded", label: "별도" },
  { value: "included", label: "포함" },
]
export const QUOTE_TEMPLATE_INSTALLATION_OPTIONS: Array<{ value: QuoteTemplateInstallation; label: string }> = [
  { value: "included_quote", label: "견적 포함" },
  { value: "separate_billing", label: "별도 청구" },
  { value: "tbd", label: "추후 협의" },
]
export const QUOTE_TEMPLATE_PAYMENT_OPTIONS: Array<{ value: QuoteTemplatePayment; label: string }> = [
  { value: "one_time", label: "일시 납부" },
  { value: "12_month", label: "12개월 할부" },
]

export const QUOTE_TEMPLATE_NAME_MAX = 60
export const QUOTE_TEMPLATE_ITEMS_MAX = 30
const QUANTITY_MAX = 9_999
const UNIT_PRICE_MAX = 10_000_000_000

export interface QuoteTemplateItem {
  sku: string
  quantity: number
  /** 템플릿 단가 덮어쓰기. null = 정가 그대로 */
  unitPrice: number | null
}

export interface QuoteTemplateDefaults {
  validityDays: QuoteTemplateValidityDays
  vat: QuoteTemplateVat
  installation: QuoteTemplateInstallation
  payment: QuoteTemplatePayment
  /** QUOTE_NOTE_PRESETS id */
  notePresetIds: string[]
}

export const DEFAULT_QUOTE_TEMPLATE_DEFAULTS: QuoteTemplateDefaults = {
  validityDays: 30,
  vat: "excluded",
  installation: "included_quote",
  payment: "one_time",
  notePresetIds: [],
}

/** quote_team_templates 한 행(정규형). */
export interface QuoteTeamTemplateRecord {
  id: string
  name: string
  productLine: QuoteProductLine
  sourceTemplateId: StandardQuoteTemplateId | null
  items: QuoteTemplateItem[]
  defaults: QuoteTemplateDefaults
  scope: QuoteTemplateScope
  showInMenu: boolean
  ownerUserId: string | null
  ownerName: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

// ── 카탈로그 ──────────────────────────────────────────────────────────────

export interface QuoteTemplateCatalogEntry {
  sku: string
  name: string
  listPrice: number
  productLine: QuoteProductLine
}

const SOFTWARE_SKUS = new Set(
  STANDARD_QUOTE_TEMPLATES.filter((template) => isSoftwareQuoteTemplate(template.id)).flatMap((template) =>
    template.lines.map((line) => line.itemCode).filter((code): code is string => Boolean(code))
  )
)

function buildCatalog(): QuoteTemplateCatalogEntry[] {
  const bySku = new Map<string, QuoteTemplateCatalogEntry>()
  const add = (sku: string, name: string, listPrice: number) => {
    // 0원 라인(설치·교육 포함 안내)은 단가를 조정할 대상이 아니다 — 설치 방식 기본값이 담당한다.
    if (bySku.has(sku) || !(listPrice > 0)) return
    bySku.set(sku, { sku, name, listPrice, productLine: SOFTWARE_SKUS.has(sku) ? "software" : "hardware" })
  }
  // 카탈로그 정가가 먼저 — getProductBySku 가 정본.
  for (const product of PRODUCT_TEMPLATES) add(product.key, product.label, product.unit_price)
  // 카탈로그에 없는 템플릿 전용 품목(예: classin-business-recharge)은 기본 템플릿 라인 단가가 정가.
  for (const template of STANDARD_QUOTE_TEMPLATES) {
    for (const line of template.lines) {
      if (line.itemCode && typeof line.unitPrice === "number") add(line.itemCode, line.itemName, line.unitPrice)
    }
  }
  return [...bySku.values()]
}

export const QUOTE_TEMPLATE_CATALOG: readonly QuoteTemplateCatalogEntry[] = buildCatalog()
const CATALOG_BY_SKU = new Map(QUOTE_TEMPLATE_CATALOG.map((entry) => [entry.sku, entry]))

export function getQuoteTemplateCatalogEntry(sku: string) {
  return CATALOG_BY_SKU.get(sku) ?? null
}

export function getQuoteTemplateSupplierLabel(productLine: QuoteProductLine) {
  return productLine === "software" ? "클래스인" : "퀴드러닝"
}

export function getQuoteTemplateProductLineLabel(productLine: QuoteProductLine) {
  return productLine === "software" ? "소프트웨어" : "하드웨어"
}

/** 정가 대비 할인율(%, 소수 1자리). 정가 이상이거나 계산 불가면 null — 표시만, 승인 없음. */
export function quoteTemplateDiscountPercent(listPrice: number, unitPrice: number) {
  if (!(listPrice > 0) || unitPrice >= listPrice) return null
  return Math.round((1 - unitPrice / listPrice) * 1000) / 10
}

// ── 화면·작성기용 뷰 ──────────────────────────────────────────────────────

export interface QuoteTemplateViewItem {
  sku: string
  name: string
  quantity: number
  listPrice: number
  unitPrice: number
  discountPercent: number | null
}

export interface QuoteTemplateView {
  /** 기본 = "base:<StandardQuoteTemplateId>", 팀 = DB uuid */
  id: string
  kind: "base" | "team"
  name: string
  productLine: QuoteProductLine
  supplierLabel: string
  /** 작성기가 옵션 그룹을 빌려 올 기본 템플릿. 기본 템플릿은 자기 자신. */
  baseTemplateId: StandardQuoteTemplateId | null
  items: QuoteTemplateViewItem[]
  defaults: QuoteTemplateDefaults
  scope: QuoteTemplateScope
  showInMenu: boolean
  ownerName: string | null
  updatedAt: string | null
  /** 이 사용자가 수정·보관할 수 있는지(기본 템플릿은 항상 false — 복제해서 수정) */
  canEdit: boolean
  total: number
  listTotal: number
  hasDiscount: boolean
}

function viewItems(items: QuoteTemplateItem[]): QuoteTemplateViewItem[] {
  return items.flatMap((item) => {
    const entry = getQuoteTemplateCatalogEntry(item.sku)
    // 카탈로그에서 빠진 품목(코드 변경)은 조용히 0원 처리하지 않고 뷰에서 뺀다.
    if (!entry) return []
    const unitPrice = item.unitPrice ?? entry.listPrice
    return [{
      sku: item.sku,
      name: entry.name,
      quantity: item.quantity,
      listPrice: entry.listPrice,
      unitPrice,
      discountPercent: quoteTemplateDiscountPercent(entry.listPrice, unitPrice),
    }]
  })
}

function finishView(view: Omit<QuoteTemplateView, "total" | "listTotal" | "hasDiscount">): QuoteTemplateView {
  const total = view.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const listTotal = view.items.reduce((sum, item) => sum + item.listPrice * item.quantity, 0)
  return { ...view, total, listTotal, hasDiscount: view.items.some((item) => item.unitPrice !== item.listPrice) }
}

function optionDefault(template: StandardQuoteTemplatePreset, groupId: string) {
  const group = template.optionGroups.find((option) => option.id === groupId)
  return group?.control === "radio" ? group.defaultValue : undefined
}

// '+ 견적서' 메뉴(app/admin/quotes/page.tsx)는 구독형 AI Suite 를 바로 띄우지 않는다.
const BASE_TEMPLATES_HIDDEN_FROM_MENU: ReadonlySet<StandardQuoteTemplateId> = new Set(["online_suite"])

export function baseQuoteTemplateViews(): QuoteTemplateView[] {
  return STANDARD_QUOTE_TEMPLATES.map((template) => {
    const installation = optionDefault(template, "installation_mode")
    const payment = optionDefault(template, "payment_plan")
    return finishView({
      id: `base:${template.id}`,
      kind: "base",
      name: template.label,
      productLine: isSoftwareQuoteTemplate(template.id) ? "software" : "hardware",
      supplierLabel: getQuoteTemplateSupplierLabel(isSoftwareQuoteTemplate(template.id) ? "software" : "hardware"),
      baseTemplateId: template.id,
      items: viewItems(
        template.lines
          .filter((line) => line.itemCode && getQuoteTemplateCatalogEntry(line.itemCode))
          .map((line) => ({ sku: line.itemCode as string, quantity: line.quantity ?? 1, unitPrice: null }))
      ),
      defaults: {
        ...DEFAULT_QUOTE_TEMPLATE_DEFAULTS,
        installation: isInstallation(installation) ? installation : DEFAULT_QUOTE_TEMPLATE_DEFAULTS.installation,
        payment: isPayment(payment) ? payment : DEFAULT_QUOTE_TEMPLATE_DEFAULTS.payment,
      },
      scope: "team",
      showInMenu: !BASE_TEMPLATES_HIDDEN_FROM_MENU.has(template.id),
      ownerName: null,
      updatedAt: null,
      canEdit: false,
    })
  })
}

export function teamQuoteTemplateView(record: QuoteTeamTemplateRecord, canEdit: boolean): QuoteTemplateView {
  return finishView({
    id: record.id,
    kind: "team",
    name: record.name,
    productLine: record.productLine,
    supplierLabel: getQuoteTemplateSupplierLabel(record.productLine),
    baseTemplateId: record.sourceTemplateId,
    items: viewItems(record.items),
    defaults: record.defaults,
    scope: record.scope,
    showInMenu: record.showInMenu,
    ownerName: record.ownerName,
    updatedAt: record.updatedAt,
    canEdit,
  })
}

// ── 권한 ──────────────────────────────────────────────────────────────────

export interface QuoteTemplateViewer {
  userId: string | null
  isStaffAdmin: boolean
}

/** 팀 전체 = 모두, 나만 = 소유자만(관리자 포함 남의 '나만'은 보이지 않는다). */
export function isQuoteTemplateVisibleTo(record: Pick<QuoteTeamTemplateRecord, "scope" | "ownerUserId">, viewer: QuoteTemplateViewer) {
  return record.scope === "team" || (viewer.userId !== null && record.ownerUserId === viewer.userId)
}

/** 수정·보관 = 소유자, 또는 팀 템플릿이면 관리자. */
export function canEditQuoteTemplate(record: Pick<QuoteTeamTemplateRecord, "scope" | "ownerUserId">, viewer: QuoteTemplateViewer) {
  if (viewer.userId !== null && record.ownerUserId === viewer.userId) return true
  return record.scope === "team" && viewer.isStaffAdmin
}

// ── 검증 ──────────────────────────────────────────────────────────────────

export interface QuoteTemplateInput {
  name: string
  productLine: QuoteProductLine
  sourceTemplateId: StandardQuoteTemplateId | null
  items: QuoteTemplateItem[]
  defaults: QuoteTemplateDefaults
  scope: QuoteTemplateScope
  showInMenu: boolean
}

export type QuoteTemplateValidation<T> = { ok: true; value: T } | { ok: false; error: string }

const NOTE_PRESET_IDS = new Set(QUOTE_NOTE_PRESETS.map((preset) => preset.id))
const STANDARD_TEMPLATE_IDS = new Set<string>(STANDARD_QUOTE_TEMPLATES.map((template) => template.id))

function isInstallation(value: unknown): value is QuoteTemplateInstallation {
  return QUOTE_TEMPLATE_INSTALLATION_OPTIONS.some((option) => option.value === value)
}

function isPayment(value: unknown): value is QuoteTemplatePayment {
  return QUOTE_TEMPLATE_PAYMENT_OPTIONS.some((option) => option.value === value)
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
}

function fail<T>(error: string): QuoteTemplateValidation<T> {
  return { ok: false, error }
}

function validateItems(raw: unknown, productLine: QuoteProductLine): QuoteTemplateValidation<QuoteTemplateItem[]> {
  if (!Array.isArray(raw) || raw.length === 0) return fail("품목을 1개 이상 넣어 주세요.")
  if (raw.length > QUOTE_TEMPLATE_ITEMS_MAX) return fail(`품목은 ${QUOTE_TEMPLATE_ITEMS_MAX}개까지 넣을 수 있습니다.`)
  const seen = new Set<string>()
  const items: QuoteTemplateItem[] = []
  for (const value of raw) {
    if (!value || typeof value !== "object") return fail("품목 형식이 올바르지 않습니다.")
    const { sku, quantity, unitPrice } = value as Record<string, unknown>
    const entry = typeof sku === "string" ? getQuoteTemplateCatalogEntry(sku) : null
    if (!entry) return fail(`카탈로그에 없는 품목입니다: ${String(sku)}`)
    // 견적 1장 = 공급자 1곳 — SW 템플릿에 HW 품목(또는 반대)을 섞지 않는다.
    if (entry.productLine !== productLine) {
      return fail(`${entry.name}은(는) ${getQuoteTemplateProductLineLabel(entry.productLine)} 품목이라 이 템플릿에 넣을 수 없습니다. 견적 1장에는 공급자 1곳만 들어갑니다.`)
    }
    if (seen.has(entry.sku)) return fail(`같은 품목이 두 번 들어 있습니다: ${entry.name}`)
    seen.add(entry.sku)
    if (!isInteger(quantity, 1, QUANTITY_MAX)) return fail(`${entry.name} 수량은 1~${QUANTITY_MAX} 사이 정수여야 합니다.`)
    if (unitPrice !== null && unitPrice !== undefined && !isInteger(unitPrice, 0, UNIT_PRICE_MAX)) {
      return fail(`${entry.name} 단가는 0원 이상 정수여야 합니다.`)
    }
    const price = typeof unitPrice === "number" ? unitPrice : null
    // 정가와 같은 덮어쓰기는 저장하지 않는다 — 나중에 정가가 바뀌면 따라가야 한다.
    items.push({ sku: entry.sku, quantity, unitPrice: price === entry.listPrice ? null : price })
  }
  return { ok: true, value: items }
}

/** DB 의 defaults jsonb 를 읽을 때도 쓴다 — 모르는 값은 기본값으로 접는다. */
export function normalizeQuoteTemplateDefaults(raw: unknown): QuoteTemplateDefaults {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    validityDays: QUOTE_TEMPLATE_VALIDITY_DAYS.includes(value.validityDays as QuoteTemplateValidityDays)
      ? (value.validityDays as QuoteTemplateValidityDays)
      : DEFAULT_QUOTE_TEMPLATE_DEFAULTS.validityDays,
    vat: value.vat === "included" ? "included" : "excluded",
    installation: isInstallation(value.installation) ? value.installation : DEFAULT_QUOTE_TEMPLATE_DEFAULTS.installation,
    payment: isPayment(value.payment) ? value.payment : DEFAULT_QUOTE_TEMPLATE_DEFAULTS.payment,
    notePresetIds: Array.isArray(value.notePresetIds)
      ? [...new Set(value.notePresetIds.filter((id): id is string => typeof id === "string" && NOTE_PRESET_IDS.has(id)))]
      : [],
  }
}

function validateDefaults(raw: unknown): QuoteTemplateValidation<QuoteTemplateDefaults> {
  if (raw === undefined) return { ok: true, value: DEFAULT_QUOTE_TEMPLATE_DEFAULTS }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("기본 조건 형식이 올바르지 않습니다.")
  const value = raw as Record<string, unknown>
  if (value.validityDays !== undefined && !QUOTE_TEMPLATE_VALIDITY_DAYS.includes(value.validityDays as QuoteTemplateValidityDays)) {
    return fail("유효기한은 14·30·60일 중 하나여야 합니다.")
  }
  if (value.vat !== undefined && value.vat !== "included" && value.vat !== "excluded") return fail("부가세 값이 올바르지 않습니다.")
  if (value.installation !== undefined && !isInstallation(value.installation)) return fail("설치 방식 값이 올바르지 않습니다.")
  if (value.payment !== undefined && !isPayment(value.payment)) return fail("결제 방식 값이 올바르지 않습니다.")
  if (value.notePresetIds !== undefined) {
    if (!Array.isArray(value.notePresetIds) || value.notePresetIds.some((id) => typeof id !== "string" || !NOTE_PRESET_IDS.has(id))) {
      return fail("메모 문구 선택이 올바르지 않습니다.")
    }
  }
  return { ok: true, value: normalizeQuoteTemplateDefaults(value) }
}

/**
 * 생성 = 전체 입력. 수정 = 보낸 키만(나머지는 current 값). productLine 을 바꾸면 품목도 같이 검사된다.
 */
export function validateQuoteTemplateInput(
  body: Record<string, unknown>,
  current?: QuoteTemplateInput
): QuoteTemplateValidation<QuoteTemplateInput> {
  const pick = <K extends keyof QuoteTemplateInput>(key: K): unknown => (key in body ? body[key] : current?.[key])

  const name = pick("name")
  if (typeof name !== "string" || name.trim().length === 0) return fail("템플릿 이름을 입력해 주세요.")
  if (name.trim().length > QUOTE_TEMPLATE_NAME_MAX) return fail(`템플릿 이름은 ${QUOTE_TEMPLATE_NAME_MAX}자까지입니다.`)

  const productLine = pick("productLine")
  if (productLine !== "hardware" && productLine !== "software") return fail("유형은 HW 또는 SW 여야 합니다.")

  const sourceTemplateId = pick("sourceTemplateId") ?? null
  if (sourceTemplateId !== null) {
    if (typeof sourceTemplateId !== "string" || !STANDARD_TEMPLATE_IDS.has(sourceTemplateId)) return fail("원본 기본 템플릿이 올바르지 않습니다.")
    if ((isSoftwareQuoteTemplate(sourceTemplateId) ? "software" : "hardware") !== productLine) {
      return fail("원본 기본 템플릿과 유형(HW/SW)이 다릅니다.")
    }
  }

  const items = validateItems(pick("items"), productLine)
  if (!items.ok) return items

  const defaults = "defaults" in body ? validateDefaults(body.defaults) : { ok: true as const, value: current?.defaults ?? DEFAULT_QUOTE_TEMPLATE_DEFAULTS }
  if (!defaults.ok) return defaults

  const scope = pick("scope") ?? "mine"
  if (scope !== "mine" && scope !== "team") return fail("공개 범위는 '나만' 또는 '팀 전체'여야 합니다.")

  const showInMenu = pick("showInMenu") ?? false
  if (typeof showInMenu !== "boolean") return fail("메뉴 표시 값이 올바르지 않습니다.")

  return {
    ok: true,
    value: {
      name: name.trim(),
      productLine,
      sourceTemplateId: sourceTemplateId as StandardQuoteTemplateId | null,
      items: items.value,
      defaults: defaults.value,
      scope,
      showInMenu,
    },
  }
}
