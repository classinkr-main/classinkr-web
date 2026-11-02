"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  Send,
  Share2,
  Smartphone,
  Trash2,
  X,
} from "lucide-react"

import QuoteDocumentPreview from "./QuoteDocumentPreview"
import QuoteDisplaySettings, { type QuoteDisplaySettingsProps } from "./QuoteDisplaySettings"
import paperStyles from "./quote-paper.module.css"

import { Button } from "@/components/ui/button"
import { normalizeQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import { portalFetch } from "@/lib/portal/portal-fetch"
import { getProductBySku } from "@/lib/product-templates"
import { quoteComposerMode } from "@/lib/quote-composer-navigation"
import { QUOTE_WORKSPACE_PREVIEW_LIMIT } from "@/lib/quote-workspace-preferences"
import type {
  CustomerListItem,
  DealListItem,
  QuoteDocumentShare,
  QuoteDocumentVersion,
} from "@/lib/portal/types"
import type {
  PartnerQuoteDetailsInput,
  PartnerQuoteLineItemInput,
} from "@/lib/partners-types"
import {
  STANDARD_QUOTE_TEMPLATES,
  appendQuoteNoteLine,
  buildConfigurableStandardQuoteDetails,
  buildStandardQuoteTitle,
  calculateStandardQuoteTotals,
  createInformationalQuoteLine,
  finalizeStandardQuoteDetails,
  formatStandardQuoteCurrency,
  getOnlineSuiteTermMonths,
  getQuoteNotePresets,
  getStandardQuoteDefaultSelections,
  getStandardQuoteOptionGroups,
  getStandardQuoteQuickPresets,
  getStandardQuoteTemplate,
  inferStandardQuoteTemplateId,
  isSoftwareQuoteTemplate,
  quoteNoteHasLine,
  resolveQuoteSupplier,
  type QuoteNotePresetGroup,
  type QuoteProductLine,
  type StandardQuoteOptionSelections,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

type RecentQuoteOption = {
  id: string
  title: string
  customerName: string
  updatedAt: string
  totalAmount: number
  currentVersionLabel: string | null
}

type CreateAction = "save" | "save_and_preview" | "save_and_send"
type QuickQuoteApiBase = "/api/portal"

type ShareLink = {
  url: string
  quoteNumber: string
  /** 링크가 2개일 때 메시지에서 구분하는 이름(예: "HW 견적(퀴드러닝)") */
  supplierLabel: string
}

/** 저장 후 보내기 줄. 공급자가 갈려 2장이 되면 링크 2개를 한 메시지에 담는다. */
type ShareSheetState = {
  customerName: string
  links: ShareLink[]
}

type ErrorToastState = {
  title: string
  message: string
}

export type QuickQuoteCreatedPayload = {
  action: CreateAction
  /** 저장에 사용한 표준 템플릿 — 호출 측이 SW/HW 유형을 추정 없이 알 수 있게 함께 넘긴다. */
  templateId: StandardQuoteTemplateId
  shareUrl?: string | null
  shareError?: string | null
  share?: QuoteDocumentShare | null
  customer: {
    id: string
    name: string
  }
  deal: {
    id: string
    title: string
    deal_code: string
  }
  document: {
    id: string
    quote_number: string
    status: string
    updated_at: string
  }
  version: QuoteDocumentVersion
}

/**
 * 공급자 담당자 드롭다운에 채울 후보. 어드민 화면(HardwareQuotesPanel)이 CRM 매니저 목록을
 * 주입한다 — 포털 번들이 어드민 클라이언트를 끌어오지 않도록 훅을 여기서 부르지 않는다.
 */
export type QuickQuoteManagerOption = {
  /** 견적서에 표기될 담당자명 */
  name: string
  /** 드롭다운 표시용(예: "정규성 · 매니저"). 없으면 name 사용 */
  label?: string
  /** 연락처를 아는 경우에만. 없으면 연락처는 수동 입력으로 남는다 */
  phone?: string | null
}

/**
 * 팀 템플릿(DB) 꽂을 자리. 저장된 견적 구성(quoteDetails 스냅샷)을 그대로 받아
 * 최근 견적 복제와 같은 경로로 펼친다 — 고객은 지우지 않는다.
 */
export type QuickQuoteTeamTemplate = {
  id: string
  label: string
  details: PartnerQuoteDetailsInput
  canDelete?: boolean
}

type QuickQuoteComposerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  recentQuotes: RecentQuoteOption[]
  /** 견적 1장마다 한 번씩 호출된다(SW·HW 가 섞이면 2번). */
  onCreated: (payload: QuickQuoteCreatedPayload) => void | Promise<void>
  apiBase?: QuickQuoteApiBase
  portalPartnerAccountId?: string | null
  initialTemplateId?: StandardQuoteTemplateId
  /** 공급자 담당자 드롭다운 후보(비면 기존처럼 자유 텍스트 입력만 노출). */
  supplierManagerOptions?: QuickQuoteManagerOption[]
  /** 팀 템플릿 목록(선택). 비면 코드 상수 템플릿만 보인다. */
  teamTemplates?: QuickQuoteTeamTemplate[]
  /**
   * "이 구성을 템플릿으로 저장"(선택). 견적서 1장의 최종 details 를 넘긴다 — 저장 API 호출은 주입하는 쪽 몫
   * (포털 번들이 어드민 클라이언트를 끌어오지 않도록). 실패하면 throw 해서 메시지를 띄운다.
   */
  onSaveTemplate?: (draft: { name: string; details: PartnerQuoteDetailsInput }) => Promise<void>
  onDeleteTemplate?: (id: string) => Promise<void>
  displaySettings?: QuoteDisplaySettingsProps
  /**
   * 딜/고객 컨텍스트에서 진입할 때 프리필할 대상. 값이 있으면 고객·거래 목록이 로드된 뒤
   * "기존 고객" 모드로 해당 고객·거래를 자동 선택한다. (새 고객 암묵 생성 없음)
   */
  prefill?: QuickQuotePrefill | null
}

export type QuickQuotePrefill = {
  dealId?: string | null
  customerId?: string | null
  /** 목록 로드 전에도 수신 칸에 채워둘 이름(선택). */
  customerName?: string | null
}

type QuoteFetchPayload = {
  quote: {
    id: string
    quote_number: string
    status: string
    current_version_id: string | null
  }
  version: {
    id: string
    quote_document_id: string
    version_number: number
    title: string
    structured_json: Record<string, unknown> | null
    valid_until: string | null
    subtotal: number
    tax_amount: number
    total_amount: number
  } | null
  /** 원시 딜 행이라 customer_name 이 없을 수 있다 — 목록의 고객명으로 폴백한다. */
  deal?: { customer_name?: string | null } | null
}

type CustomerPayload = { customers: CustomerListItem[] }
type DealPayload = { deals: DealListItem[] }
type ResolvedCustomer = {
  id: string
  name: string
  partnerAccountId?: string | null
  listItem?: CustomerListItem
}

/**
 * 견적서 한 장. 공급자는 1장에 1곳(SW=클래스인, HW=퀴드러닝)이라 제품군마다 최대 1장이다.
 * 품목은 템플릿이 만들고(buildConfigurable), 수신·조건·메모는 SharedQuoteFields 로 두 장에 같이 들어간다.
 */
type ComposerSheet = {
  line: QuoteProductLine
  templateId: StandardQuoteTemplateId
  optionSelections: StandardQuoteOptionSelections
  quote: PartnerQuoteDetailsInput
}

type SharedQuoteFields = {
  issuedAt: string
  validUntil?: string
  referenceName: string
  vatIncluded: boolean
  generalNotes: string
  specialTerms: string
}

type ManagerOverride = { name: string; phone: string; selection: string }

type QuickAddRailItemId =
  | "board_86"
  | "board_75"
  | "camera_t1"
  | "recording_studio"
  | "online_suite"
  | "business_recharge"
  | "stand"
  | "wall_mount"
  | "bundle_86_t1_wall"

type QuickAddRailGroup = "package" | "software" | "panel" | "accessory"

type QuickAddRailItem = {
  id: QuickAddRailItemId
  label: string
  description: string
  price: number
  group: QuickAddRailGroup
  /** 표에 행으로 붙일 때 쓰는 품목 코드 */
  sku: string
  /** 해당 공급자 견적서가 아직 없을 때 새로 여는 템플릿 */
  templateId: StandardQuoteTemplateId
  presetId?: string
  quantityUnit: string
  badge?: string
  priceUnit?: string
}

const QUICK_ADD_RAIL_ITEMS: QuickAddRailItem[] = [
  // ── 패키지 상품 (수트 · 번들 · 세트) ─────────────────────────
  {
    id: "recording_studio",
    label: "올인원 녹화 세트",
    description: "OMO 830",
    price: getProductBySku("ai-studio-recording-set")?.unit_price ?? 8_300_000,
    group: "package",
    sku: "ai-studio-recording-set",
    templateId: "recording_studio",
    presetId: "recording_studio_default",
    quantityUnit: "세트",
    badge: "녹화 패키지",
  },
  {
    id: "bundle_86_t1_wall",
    label: '86" 번들',
    description: '86" + T1 + 벽걸이',
    price: getProductBySku("bundle-86-t1-wall")?.unit_price ?? 8_000_000,
    group: "package",
    sku: "bundle-86-t1-wall",
    templateId: "board_86",
    presetId: "board_86_bundle",
    quantityUnit: "세트",
    badge: "인기 번들",
  },
  {
    id: "online_suite",
    label: "구독형 AI Suite",
    description: "월 구독",
    price: getProductBySku("online-suite-monthly")?.unit_price ?? 400_000,
    group: "package",
    sku: "online-suite-monthly",
    templateId: "online_suite",
    presetId: "online_suite_default",
    quantityUnit: "월",
    badge: "학원 패키지",
    priceUnit: "/월",
  },
  // ── 소프트웨어(SW) 단독 ────────────────────────────────────
  {
    id: "business_recharge",
    label: "ClassIn Business 충전",
    description: "크레딧 충전형 (수정 가능)",
    price: 2_000_000,
    group: "software",
    sku: "classin-business-recharge",
    templateId: "business_recharge",
    presetId: "recharge_200",
    quantityUnit: "식",
    badge: "SW 단독",
  },
  // ── 전자칠판 패널 ──────────────────────────────────────────
  {
    id: "board_86",
    label: '전자칠판 86"',
    description: "대형 패널",
    price: getProductBySku("board-86")?.unit_price ?? 6_300_000,
    group: "panel",
    sku: "board-86",
    templateId: "board_86",
    quantityUnit: "대",
  },
  {
    id: "board_75",
    label: '전자칠판 75"',
    description: "중형 패널",
    price: getProductBySku("board-75")?.unit_price ?? 5_400_000,
    group: "panel",
    sku: "board-75",
    templateId: "board_75",
    quantityUnit: "대",
  },
  // ── 카메라 & 거치 옵션 ─────────────────────────────────────
  {
    id: "camera_t1",
    label: "T1 카메라",
    description: "모션트래킹",
    price: getProductBySku("camera-t1")?.unit_price ?? 1_200_000,
    group: "accessory",
    sku: "camera-t1",
    templateId: "camera_t1",
    quantityUnit: "대",
  },
  {
    id: "stand",
    label: "스탠드",
    description: "이동형 거치",
    price: getProductBySku("stand")?.unit_price ?? 500_000,
    group: "accessory",
    sku: "stand",
    templateId: "board_86",
    quantityUnit: "대",
  },
  {
    id: "wall_mount",
    label: "벽걸이",
    description: "벽면 설치",
    price: getProductBySku("wall-mount")?.unit_price ?? 500_000,
    group: "accessory",
    sku: "wall-mount",
    templateId: "board_86",
    quantityUnit: "대",
  },
]

/** 별도 장비 구매 + Business 충전은 공급자가 달라 2장. AI Suite는 장비 포함 통합 상품이다. */
const QUICK_COMBOS: Array<{
  id: string
  label: string
  parts: Array<{ templateId: StandardQuoteTemplateId; presetId: string }>
}> = [
  {
    id: "combo_bundle_recharge",
    label: '86" 번들 + Business 충전',
    parts: [
      { templateId: "board_86", presetId: "board_86_bundle" },
      { templateId: "business_recharge", presetId: "recharge_200" },
    ],
  },
]

const SUPPLIER_SHORT_LABEL: Record<QuoteProductLine, string> = {
  hardware: "퀴드러닝",
  software: "클래스인",
}

const MANAGER_CUSTOM_VALUE = "__custom__"
const EMPTY_MANAGER: ManagerOverride = { name: "", phone: "", selection: "" }
const RECHARGE_ITEM_CODE = "classin-business-recharge"
const RECHARGE_MIN_AMOUNT = 2_000_000

/* ── 종이 위 편집 칸 ────────────────────────────────────────────
 * 평소엔 글자처럼 보이고, 올리면 점선 밑줄, 누르면 초록 밑줄. 채움색은 쓰지 않는다.
 */
const EDITABLE_CLASS =
  "min-w-0 rounded-none border-0 border-b border-dashed border-transparent bg-transparent px-0.5 py-px outline-none transition-colors placeholder:text-[#A39E98] hover:border-[#CFCBC5] hover:bg-[#FCFCFA] focus:border-solid focus:border-[#084734] focus:bg-white"
const PAPER_SELECT_CLASS =
  "h-7 rounded-[4px] border border-transparent bg-transparent px-1 text-[12px] text-[#31302E] outline-none transition-colors hover:border-[#E3E0DB] focus-visible:border-[#084734]"
const RAIL_BUTTON_CLASS =
  "flex w-full items-baseline gap-2 rounded-[6px] px-2 py-[7px] text-left text-[#111110] transition-colors hover:bg-white disabled:opacity-60"
const RAIL_ACTIVE_CLASS = "bg-white font-semibold shadow-[inset_2px_0_0_#084734]"
const RAIL_HEADING_CLASS = "mx-2 mb-1.5 text-[11.5px] font-semibold text-[#78736D]"
const OPTION_CHIP_CLASS =
  "h-7 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors"

function sheetLineOf(templateId: StandardQuoteTemplateId): QuoteProductLine {
  return isSoftwareQuoteTemplate(templateId) ? "software" : "hardware"
}

/** HW 먼저, SW 다음 — 화면·저장 순서가 항상 같게 */
function withSheet(list: ComposerSheet[], sheet: ComposerSheet) {
  return [...list.filter((item) => item.line !== sheet.line), sheet].sort((left, right) =>
    left.line === right.line ? 0 : left.line === "hardware" ? -1 : 1
  )
}

function buildSheet(
  templateId: StandardQuoteTemplateId,
  presetId?: string,
  patch?: Partial<StandardQuoteOptionSelections>
): ComposerSheet {
  const preset = presetId
    ? getStandardQuoteQuickPresets(templateId).find((item) => item.id === presetId)
    : undefined
  const optionSelections: StandardQuoteOptionSelections = {
    ...getStandardQuoteDefaultSelections(templateId),
    ...(preset?.optionSelections ?? {}),
    ...(patch ?? {}),
  }
  return {
    line: sheetLineOf(templateId),
    templateId,
    optionSelections,
    quote: buildConfigurableStandardQuoteDetails({
      templateId,
      input: { templateId, presetId },
      optionSelections,
      baseQuantity: 1,
    }),
  }
}

function buildSharedFields(today: string, generalNotes = ""): SharedQuoteFields {
  return {
    issuedAt: today,
    validUntil: addDays(today, 7),
    referenceName: "",
    vatIncluded: true,
    generalNotes,
    specialTerms: "",
  }
}

function getMainLine(quote: PartnerQuoteDetailsInput) {
  return (
    quote.lineItems?.find((item) => item.optionGroupId === "main_product") ??
    quote.lineItems?.find((item) => item.itemType === "hardware") ??
    quote.lineItems?.[0]
  )
}

function getMainQuantity(sheet: ComposerSheet) {
  return Math.max(1, Number(getMainLine(sheet.quote)?.quantity ?? 1))
}

function isBoardTemplate(templateId: StandardQuoteTemplateId) {
  return templateId === "board_86" || templateId === "board_75"
}

function isBundleSheet(sheet: ComposerSheet) {
  return (
    sheet.templateId === "board_86" &&
    sheet.optionSelections.camera_bundle === true &&
    sheet.optionSelections.mounting_option === "wall_mount"
  )
}

/** 카탈로그 정가. 충전형은 금액 자체가 입력값이라 할인 표시 대상이 아니다. */
function getListPrice(line: PartnerQuoteLineItemInput) {
  if (!line.itemCode || line.itemCode === RECHARGE_ITEM_CODE) return undefined
  return getProductBySku(line.itemCode)?.unit_price
}

function sheetSubtotal(sheet: ComposerSheet) {
  return calculateStandardQuoteTotals(sheet.quote.lineItems, true).subtotalAmount
}

function quantityUnitOf(templateId: StandardQuoteTemplateId) {
  return templateId === "online_suite"
    ? "월"
    : templateId === "recording_studio"
      ? "세트"
      : templateId === "business_recharge"
        ? "건"
        : "대"
}

function mergeCustomerListItems(
  preferred: CustomerListItem[],
  fallback: CustomerListItem[]
) {
  const merged = new Map(preferred.map((item) => [item.customer.id, item]))
  for (const item of fallback) {
    if (!merged.has(item.customer.id)) {
      merged.set(item.customer.id, item)
    }
  }
  return Array.from(merged.values())
}

function mergeDealListItems(preferred: DealListItem[], fallback: DealListItem[]) {
  const merged = new Map(preferred.map((item) => [item.id, item]))
  for (const item of fallback) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item)
    }
  }
  return Array.from(merged.values())
}

/** 수신 칸 자동완성 표기 — 같은 이름의 고객을 캠퍼스로 구분한다. */
function customerLabel(customer: CustomerListItem["customer"]) {
  return customer.campus_name ? `${customer.name} (${customer.campus_name})` : customer.name
}

/** 브라우저 현지 날짜(KST). toISOString 은 UTC 라 오전 9시 전엔 어제가 된다. */
function getTodayDateValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function addDays(dateValue: string, days: number) {
  // UTC 로 계산해야 KST 에서 하루 밀리지 않는다(7일 → 6일 되던 문제).
  const base = new Date(`${dateValue}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return dateValue
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

function daysBetween(from?: string, to?: string) {
  if (!from || !to) return null
  const diff = Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000)
  return Number.isFinite(diff) && diff > 0 ? diff : null
}

function formatQuickAddPrice(value: number, unit?: string) {
  const formatted = `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`
  return unit ? `${formatted}${unit}` : formatted
}

function renumberLineItems(items: PartnerQuoteLineItemInput[]) {
  return items.map((item, index) => ({ ...item, sortOrder: index + 1, lineNumber: index + 1 }))
}

function parseNumericInput(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value.replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildDefaultDealTitle(sheets: ComposerSheet[], customerName?: string | null) {
  const subject = sheets
    .map((sheet) => {
      const template = getStandardQuoteTemplate(sheet.templateId)
      return `${template.label} ${getMainQuantity(sheet)}${quantityUnitOf(sheet.templateId)}`
    })
    .join(" + ")
  return customerName?.trim() ? `${customerName.trim()} ${subject}` : subject
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy copy flow.
    }
  }

  if (typeof document === "undefined") {
    return false
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "0"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand("copy")
  } finally {
    document.body.removeChild(textarea)
  }

  return copied
}

function buildQuoteShareText(share: ShareSheetState) {
  const numbers = share.links.map((link) => link.quoteNumber).join(", ")
  if (share.links.length === 1) {
    return `[견적서] ${numbers}\n${share.customerName}님 견적서입니다.\n${share.links[0].url}`
  }
  return [
    `[견적서] ${numbers}`,
    `${share.customerName}님 견적서 ${share.links.length}장입니다.`,
    ...share.links.map((link) => `${link.supplierLabel}: ${link.url}`),
  ].join("\n")
}

function openKakaoShare(share: ShareSheetState) {
  const text = buildQuoteShareText(share)
  window.open(
    `https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(share.links[0].url)}&text=${encodeURIComponent(text)}`,
    "_blank",
    "width=480,height=640"
  )
}

function openSmsShare(share: ShareSheetState) {
  window.location.href = `sms:?body=${encodeURIComponent(buildQuoteShareText(share))}`
}

function openMailShare(share: ShareSheetState) {
  const subject = `[견적서] ${share.links.map((link) => link.quoteNumber).join(", ")}`
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildQuoteShareText(share))}`
}

function prepareQuotePreviewWindow() {
  if (typeof window === "undefined") return null
  const target = window.open("about:blank", "_blank")
  if (!target) return null

  try {
    target.document.title = "견적서 준비 중"
    target.document.body.style.fontFamily = "system-ui, sans-serif"
    target.document.body.style.padding = "24px"
    target.document.body.textContent = "견적서를 준비하는 중입니다."
  } catch {
    // Some browsers restrict the temporary document; navigation can still work.
  }

  return target
}

function openQuotePreviewUrl(url: string, preparedWindow?: Window | null) {
  if (preparedWindow && !preparedWindow.closed) {
    preparedWindow.opener = null
    preparedWindow.location.href = url
    return true
  }

  if (typeof window === "undefined") return false
  const opened = window.open(url, "_blank", "noopener,noreferrer")
  if (opened) return true
  window.location.href = url
  return true
}

function isInputFixMessage(message: string) {
  return ["입력", "선택", "필수", "required"].some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase())
  )
}

function getQuoteSubmitErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "견적서 생성에 실패했습니다."
  const normalized = message.toLowerCase()

  if (normalized.includes("deal_id") && normalized.includes("title")) {
    return "거래 또는 견적 제목이 비어 있습니다. 거래 제목을 입력해 주세요."
  }

  if (normalized.includes("title") && normalized.includes("required")) {
    return "견적 제목이 비어 있습니다. 제목을 입력해 주세요."
  }

  if (normalized.includes("deal_id") || message.includes("deal_id 필수")) {
    return "거래 연결이 필요합니다. 기존 거래를 선택하거나 새 거래 제목을 입력해 주세요."
  }

  return message
}

type ShareOptionButtonProps = {
  icon: ReactNode
  label: string
  title: string
  onClick: () => void
}

function ShareOptionButton({
  icon,
  label,
  title,
  onClick,
}: ShareOptionButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-[52px] w-[64px] flex-col items-center justify-center gap-1 rounded-[8px] text-[#31302E] transition-colors hover:bg-[#F6F5F2] hover:text-[#111110]"
    >
      {icon}
      <span className="whitespace-nowrap text-[11.5px]">{label}</span>
    </button>
  )
}

/** 프리셋 칩 + 직접 추가 + 종이 위 textarea 한 세트(기타사항/특약사항 공용). */
function QuoteNoteField({
  id,
  label,
  group,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  group: QuoteNotePresetGroup
  value: string
  placeholder?: string
  onChange: (next: string) => void
}) {
  const presets = getQuoteNotePresets(group)
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState("")

  function commitCustomText() {
    const next = appendQuoteNoteLine(value, customText)
    if (next !== value) onChange(next)
    setCustomText("")
    setCustomOpen(false)
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={id} className="text-[11.5px] font-semibold text-[#78736D]">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1" aria-label={`${label} 문구 추가`}>
          {presets.map((preset) => {
            const included = quoteNoteHasLine(value, preset.text)

            return (
              <button
                key={preset.id}
                type="button"
                title={preset.text}
                disabled={included}
                onClick={() => onChange(appendQuoteNoteLine(value, preset.text))}
                className={`inline-flex h-6 items-center gap-0.5 rounded-full border px-2 text-[11px] transition-colors ${
                  included
                    ? "cursor-default border-[#084734]/40 text-[#084734]"
                    : "border-[#E3E0DB] text-[#615D59] hover:border-[#084734] hover:text-[#111110]"
                }`}
              >
                {included ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {preset.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setCustomOpen((current) => !current)}
            className="inline-flex h-6 items-center rounded-full border border-dashed border-[#CFCBC5] px-2 text-[11px] text-[#615D59] transition-colors hover:border-[#084734] hover:text-[#084734]"
          >
            직접 추가
          </button>
        </div>
      </div>

      {customOpen && (
        <div className="flex items-center gap-1.5">
          <input
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitCustomText()
              }
            }}
            placeholder="추가할 문구를 입력하고 Enter"
            className={`${EDITABLE_CLASS} h-7 flex-1 border-[#CFCBC5] text-[12.5px]`}
          />
          <button
            type="button"
            onClick={commitCustomText}
            className="inline-flex h-7 shrink-0 items-center rounded-[6px] border border-[#E3E0DB] px-2.5 text-[12px] text-[#111110] transition-colors hover:border-[#084734]"
          >
            추가
          </button>
        </div>
      )}

      <textarea
        id={id}
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${EDITABLE_CLASS} w-full resize-y text-[12.5px] leading-[1.75] text-[#31302E]`}
      />
    </div>
  )
}

export default function QuickQuoteComposer({
  open,
  onOpenChange,
  recentQuotes,
  onCreated,
  apiBase = "/api/portal",
  portalPartnerAccountId = null,
  initialTemplateId = "board_86",
  supplierManagerOptions,
  teamTemplates,
  onSaveTemplate,
  onDeleteTemplate,
  displaySettings,
  prefill = null,
}: QuickQuoteComposerProps) {
  const today = getTodayDateValue()
  const isPortalApi = apiBase === "/api/portal"
  const [portalMounted, setPortalMounted] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [deals, setDeals] = useState<DealListItem[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  // 수신 칸 하나로 고객을 정한다: 기존 고객 표기와 정확히 같으면 기존 고객, 아니면 새 고객.
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new")
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [recipientInput, setRecipientInput] = useState("")
  const [selectedDealId, setSelectedDealId] = useState("")
  const [newDealTitle, setNewDealTitle] = useState("")
  const [sheets, setSheets] = useState<ComposerSheet[]>(() => [buildSheet(initialTemplateId)])
  const [shared, setShared] = useState<SharedQuoteFields>(() =>
    buildSharedFields(today, buildSheet(initialTemplateId).quote.generalNotes ?? "")
  )
  // 왼쪽 레일에서 마지막으로 고른 조합/템플릿(강조용). 품목을 손으로 바꾸면 풀린다.
  const [activePick, setActivePick] = useState<string | null>(null)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [showAllTemplates, setShowAllTemplates] = useState(false)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [templateDeleteError, setTemplateDeleteError] = useState<string | null>(null)
  // 최근 견적 복제 직후 안내(고객만 비웠음 + 옛 단가 되돌리기)
  const [cloneSource, setCloneSource] = useState<{ customerName: string; title: string } | null>(null)
  // "이 구성을 템플릿으로 저장" 인라인 폼. name=null 이면 닫힘.
  const [templateDraftName, setTemplateDraftName] = useState<string | null>(null)
  const [templateSaveState, setTemplateSaveState] = useState<
    { status: "saving" } | { status: "saved"; name: string } | { status: "error"; message: string } | null
  >(null)
  const [submittingAction, setSubmittingAction] = useState<CreateAction | null>(null)
  const [reuseLoadingId, setReuseLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareSheet, setShareSheet] = useState<ShareSheetState | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const [errorToast, setErrorToast] = useState<ErrorToastState | null>(null)
  // 공급자 담당자 override(제품군별). 비우면 공급자 블록 기본값(SW=클래스인 매니저, HW=퀴드러닝 담당자).
  const [managers, setManagers] = useState<Record<QuoteProductLine, ManagerOverride>>({
    hardware: EMPTY_MANAGER,
    software: EMPTY_MANAGER,
  })
  // 정보 라인(금액 없는 note_only) 인라인 추가 폼 — 어느 장에 붙일지
  const [noteLineOpenFor, setNoteLineOpenFor] = useState<QuoteProductLine | null>(null)
  const [noteLineTitle, setNoteLineTitle] = useState("")
  const [noteLineText, setNoteLineText] = useState("")
  // ClassIn Business 충전형: 200만원 미만 예외 발행 확인 모달 상태
  const [underMinModalOpen, setUnderMinModalOpen] = useState(false)
  const [pendingRechargeAmount, setPendingRechargeAmount] = useState<number | null>(null)
  const [underMinConfirmed, setUnderMinConfirmed] = useState(false)
  const [pendingSubmitAction, setPendingSubmitAction] = useState<CreateAction | null>(null)
  const errorToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 프리필은 이번 open 세션에서 한 번만 적용한다(사용자가 이후 수동 변경하면 덮어쓰지 않음).
  const prefillAppliedRef = useRef(false)
  const hasPrefillTarget = Boolean(prefill?.dealId || prefill?.customerId)

  const managerOptions = useMemo(() => supplierManagerOptions ?? [], [supplierManagerOptions])
  const hasManagerOptions = managerOptions.length > 0

  useEffect(() => {
    setPortalMounted(true)
  }, [])

  useEffect(() => {
    if (!open || !portalMounted) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    return () => previousFocus?.focus()
  }, [open, portalMounted])

  useEffect(() => {
    if (!open) return

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [open])

  // 목록이 도착하면 현재 담당자명을 드롭다운 값과 한 번 맞춘다(사용자가 고르면 그 값을 유지).
  useEffect(() => {
    if (!hasManagerOptions) return
    setManagers((current) => {
      let changed = false
      const next = { ...current }
      for (const line of ["hardware", "software"] as const) {
        const entry = current[line]
        if (entry.selection || !entry.name.trim()) continue
        const matched = managerOptions.find((option) => option.name === entry.name.trim())
        next[line] = { ...entry, selection: matched ? matched.name : MANAGER_CUSTOM_VALUE }
        changed = true
      }
      return changed ? next : current
    })
  }, [hasManagerOptions, managerOptions, managers.hardware.name, managers.software.name])

  function handleManagerSelectionChange(line: QuoteProductLine, value: string) {
    setManagers((current) => {
      const entry = current[line]
      if (value === MANAGER_CUSTOM_VALUE) return { ...current, [line]: { ...entry, selection: value } }
      // "기본 담당자" — override 를 비워 공급자 블록 기본값으로 되돌린다.
      if (!value) return { ...current, [line]: EMPTY_MANAGER }
      const option = managerOptions.find((item) => item.name === value)
      if (!option) return current
      return {
        ...current,
        [line]: {
          selection: value,
          name: option.name,
          phone: option.phone?.trim() || entry.phone,
        },
      }
    })
  }

  function setManagerField(line: QuoteProductLine, field: "name" | "phone", value: string) {
    setManagers((current) => ({ ...current, [line]: { ...current[line], [field]: value } }))
  }

  // 공급자 블록은 템플릿이 정하고(SW=클래스인 / HW=퀴드러닝), 담당자·연락처만 작성자가 덮어쓴다.
  function supplierFor(sheet: ComposerSheet) {
    const defaults = resolveQuoteSupplier(sheet.templateId)
    const override = managers[sheet.line]
    return {
      ...defaults,
      supplierContactName: override.name.trim() || defaults.supplierContactName,
      supplierContactPhone: override.phone.trim() || defaults.supplierContactPhone,
    }
  }

  const sortedCustomers = useMemo(
    () => [...customers].sort((left, right) => left.customer.name.localeCompare(right.customer.name, "ko")),
    [customers]
  )
  const selectedCustomer =
    customerMode === "existing"
      ? sortedCustomers.find((item) => item.customer.id === selectedCustomerId)?.customer ?? null
      : null
  const availableDeals = useMemo(
    () =>
      customerMode === "existing" && selectedCustomerId
        ? deals.filter((deal) => deal.customer_id === selectedCustomerId)
        : [],
    [customerMode, deals, selectedCustomerId]
  )
  const activeCustomerName =
    customerMode === "existing" ? selectedCustomer?.name ?? "" : recipientInput.trim()
  const customerReady =
    customerMode === "existing" ? Boolean(selectedCustomer) : recipientInput.trim().length > 0

  /** 저장·화면에 쓰는 한 장의 최종 견적(수신·조건·메모·공급자를 합쳐 finalize). */
  function composeSheetQuote(sheet: ComposerSheet) {
    return finalizeStandardQuoteDetails(
      {
        ...sheet.quote,
        ...supplierFor(sheet),
        templateId: sheet.templateId,
        optionSelections: sheet.optionSelections,
        recipientCompanyName: activeCustomerName,
        referenceName: shared.referenceName,
        issuedAt: shared.issuedAt || today,
        validUntil: shared.validUntil,
        vatIncluded: shared.vatIncluded,
        vatPolicyLabel: undefined,
        generalNotes: shared.generalNotes,
        specialTerms: shared.specialTerms,
      },
      sheet.templateId
    )
  }

  const composedSheets = sheets.map((sheet) => {
    const quote = composeSheetQuote(sheet)
    return { sheet, quote, totals: calculateStandardQuoteTotals(quote.lineItems, quote.vatIncluded ?? true) }
  })
  const isSplit = sheets.length > 1
  const composerMode = quoteComposerMode(sheets[0]?.templateId ?? initialTemplateId)
  const hiddenTemplateIds = displaySettings?.preferences.hiddenTemplateIds ?? []
  const showRecentQuotes = displaySettings?.preferences.showRecentQuotes ?? true
  const showTemplates = displaySettings?.preferences.showTemplates ?? true
  const visibleTemplates = STANDARD_QUOTE_TEMPLATES.filter((template) => quoteComposerMode(template.id) === composerMode && !hiddenTemplateIds.includes(`base:${template.id}`))
  const visibleCatalogItems = QUICK_ADD_RAIL_ITEMS.filter((item) => quoteComposerMode(item.templateId) === composerMode)
  const visibleTeamTemplates = (teamTemplates ?? []).filter((template) => quoteComposerMode(inferStandardQuoteTemplateId(template.details)) === composerMode && !hiddenTemplateIds.includes(template.id))
  const templateCount = visibleTeamTemplates.length + visibleTemplates.length
  const displayedTeamTemplates = showAllTemplates ? visibleTeamTemplates : visibleTeamTemplates.slice(0, QUOTE_WORKSPACE_PREVIEW_LIMIT)
  const displayedBaseTemplates = showAllTemplates ? visibleTemplates : visibleTemplates.slice(0, Math.max(0, QUOTE_WORKSPACE_PREVIEW_LIMIT - displayedTeamTemplates.length))
  const grandTotalAll = composedSheets.reduce((sum, entry) => sum + entry.totals.grandTotalAmount, 0)
  const lineItemCount = sheets.reduce((sum, sheet) => sum + (sheet.quote.lineItems?.length ?? 0), 0)
  const canCreateQuote = customerReady && lineItemCount > 0
  const hasNoExpiration = !shared.validUntil
  const validityPresetValue = hasNoExpiration
    ? "none"
    : [7, 14, 30].find((days) => shared.validUntil === addDays(shared.issuedAt || today, days))?.toString() ??
      "custom"
  const preflightChecks = [
    { label: customerReady ? "수신" : "수신 비어 있음", ok: customerReady },
    { label: `품목 ${lineItemCount}개`, ok: lineItemCount > 0 },
    { label: isSplit ? "견적서 2장" : "견적서 1장", ok: true },
    { label: hasNoExpiration ? "유효기한 없음" : "유효기한", ok: true },
  ]
  // 복제해 온 단가 중 지금 정가와 다른 행(옛 단가)
  const staleLines = cloneSource
    ? sheets.flatMap((sheet) =>
        (sheet.quote.lineItems ?? [])
          .map((line, lineIndex) => ({ sheet, line, lineIndex, listPrice: getListPrice(line) }))
          .filter((item) => item.listPrice != null && item.line.unitPrice != null && item.line.unitPrice !== item.listPrice)
      )
    : []

  const rechargeSheet = sheets.find((sheet) => sheet.templateId === "business_recharge") ?? null
  const rechargeLine = (rechargeSheet?.quote.lineItems ?? []).find(
    (line) => line.itemCode === RECHARGE_ITEM_CODE || line.optionGroupId === "main_product"
  )
  const currentRechargeAmount = rechargeLine?.unitPrice ?? RECHARGE_MIN_AMOUNT

  const comboTotals = useMemo(
    () =>
      Object.fromEntries(
        QUICK_COMBOS.map((combo) => [
          combo.id,
          combo.parts.reduce((sum, part) => sum + sheetSubtotal(buildSheet(part.templateId, part.presetId)), 0),
        ])
      ),
    []
  )
  const templateTotals = useMemo(
    () =>
      Object.fromEntries(
        STANDARD_QUOTE_TEMPLATES.map((template) => [
          template.id,
          sheetSubtotal(buildSheet(template.id)),
        ])
      ),
    []
  )

  async function handleDeleteTemplate(template: QuickQuoteTeamTemplate) {
    if (!onDeleteTemplate || deletingTemplateId || !window.confirm(`'${template.label}' 템플릿을 삭제할까요? 이미 만든 견적서는 그대로 유지됩니다.`)) return
    setDeletingTemplateId(template.id)
    setTemplateDeleteError(null)
    try {
      await onDeleteTemplate(template.id)
      setActivePick((current) => current === `team:${template.id}` ? null : current)
    } catch (deleteError) {
      setTemplateDeleteError(deleteError instanceof Error ? deleteError.message : "템플릿을 삭제하지 못했습니다.")
    } finally {
      setDeletingTemplateId(null)
    }
  }

  function showErrorToast(message: string, title?: string) {
    if (errorToastTimerRef.current) {
      clearTimeout(errorToastTimerRef.current)
    }
    setErrorToast({
      title: title ?? (isInputFixMessage(message) ? "입력 확인 필요" : "견적서 생성 실패"),
      message,
    })
    errorToastTimerRef.current = setTimeout(() => setErrorToast(null), 3200)
  }

  useEffect(() => {
    if (!open) return

    let alive = true
    setLoadingOptions(true)
    setError(null)

    Promise.allSettled([
      portalFetch(`${apiBase}/customers`).then(async (response) => {
        if (!response.ok) throw new Error("고객 목록을 불러오지 못했습니다.")
        return (await response.json()) as CustomerPayload
      }),
      portalFetch(`${apiBase}/deals`).then(async (response) => {
        if (!response.ok) throw new Error("거래 목록을 불러오지 못했습니다.")
        return (await response.json()) as DealPayload
      }),
    ]).then((results) => {
      if (!alive) return

      const [customerResult, dealResult] = results
      const nextCustomers =
        customerResult.status === "fulfilled" ? customerResult.value.customers ?? [] : []
      const nextDeals = dealResult.status === "fulfilled" ? dealResult.value.deals ?? [] : []

      setCustomers((current) => mergeCustomerListItems(nextCustomers, current))
      setDeals((current) => mergeDealListItems(nextDeals, current))
      if (customerResult.status === "rejected" || dealResult.status === "rejected") {
        setError("고객 또는 거래 목록 일부를 불러오지 못했습니다. 수신 칸에 이름을 직접 입력하면 새 고객으로 저장됩니다.")
      }
      setLoadingOptions(false)
    })

    return () => {
      alive = false
    }
  }, [apiBase, open])

  useEffect(() => {
    if (!open) return
    prefillAppliedRef.current = false
    setCustomerMode(hasPrefillTarget ? "existing" : "new")
    setSelectedCustomerId(prefill?.customerId ?? "")
    // 신규 고객 모드(딜/고객 타깃 없음)로 진입하면 customerName 프리필을 수신 칸에 1회 채운다.
    setRecipientInput(prefill?.customerName?.trim() ?? "")
    setSelectedDealId(prefill?.dealId ?? "")
    setNewDealTitle("")
    const initialSheet = buildSheet(initialTemplateId)
    setSheets([initialSheet])
    setShared(buildSharedFields(today, initialSheet.quote.generalNotes ?? ""))
    setActivePick(null)
    setCloneSource(null)
    setTemplateDraftName(null)
    setTemplateSaveState(null)
    // SW 견적만 클래스인 명의라 로그인 관리자를 자동 채운다.
    // HW는 퀴드러닝 담당자가 기본값이므로 비워둔 채로 시작한다(기존 발행물과 동일).
    const adminName = typeof window === "undefined" ? null : window.sessionStorage.getItem("admin_name")
    setManagers({ hardware: EMPTY_MANAGER, software: { ...EMPTY_MANAGER, name: adminName ?? "" } })
    setSubmittingAction(null)
    setReuseLoadingId(null)
    setShareSheet(null)
    setLinkCopied(false)
    setSaveToast(null)
    setErrorToast(null)
    setNoteLineOpenFor(null)
    setNoteLineTitle("")
    setNoteLineText("")
    setUnderMinModalOpen(false)
    setPendingRechargeAmount(null)
    setUnderMinConfirmed(false)
    setPendingSubmitAction(null)
    setError(null)
  }, [hasPrefillTarget, initialTemplateId, open, prefill?.customerId, prefill?.customerName, prefill?.dealId, today])

  useEffect(() => {
    return () => {
      if (errorToastTimerRef.current) {
        clearTimeout(errorToastTimerRef.current)
      }
    }
  }, [])

  // 딜/고객 프리필 — 목록 로드가 끝난 뒤 한 번만 고객·거래를 선택한다.
  // 자동은 '선택 제안'까지이며, 새 고객을 암묵 생성하지 않는다.
  useEffect(() => {
    if (!open || loadingOptions) return
    if (!hasPrefillTarget || prefillAppliedRef.current) return

    const customerId = prefill?.dealId
      ? deals.find((item) => item.id === prefill.dealId)?.customer_id
      : prefill?.customerId
    // 딜이 아직 안 보이면 다음 로드까지 대기(적용 마킹하지 않음).
    if (!customerId) return
    const customer = customers.find((item) => item.customer.id === customerId)
    if (!customer) return

    prefillAppliedRef.current = true
    setCustomerMode("existing")
    setSelectedCustomerId(customer.customer.id)
    setRecipientInput(customerLabel(customer.customer))
    setSelectedDealId(prefill?.dealId ?? "")
  }, [customers, deals, hasPrefillTarget, loadingOptions, open, prefill?.customerId, prefill?.dealId])

  useEffect(() => {
    if (!open || customerMode !== "existing") return
    // 프리필이 아직 목록에서 딜/고객을 확정하기 전에는 시드된 selectedDealId를 지우지 않는다.
    if (hasPrefillTarget && !prefillAppliedRef.current) return
    if (selectedDealId && !availableDeals.some((deal) => deal.id === selectedDealId)) {
      setSelectedDealId("")
    }
  }, [availableDeals, customerMode, hasPrefillTarget, open, selectedDealId])

  function handleRecipientChange(text: string) {
    setRecipientInput(text)
    const match = sortedCustomers.find((item) => customerLabel(item.customer) === text.trim())
    setCustomerMode(match ? "existing" : "new")
    setSelectedCustomerId(match?.customer.id ?? "")
    setSelectedDealId("")
  }

  function patchShared(patch: Partial<SharedQuoteFields>) {
    setShared((current) => ({ ...current, ...patch }))
  }

  function setValidityDays(days: number | null) {
    setShared((current) => ({
      ...current,
      validUntil: days == null ? undefined : addDays(current.issuedAt || today, days),
    }))
  }

  function updateSheet(line: QuoteProductLine, update: (sheet: ComposerSheet) => ComposerSheet | null) {
    setSheets((current) =>
      current.flatMap((sheet) => {
        if (sheet.line !== line) return [sheet]
        const next = update(sheet)
        return next ? [next] : []
      })
    )
  }

  /** 템플릿 기준으로 한 장을 다시 짠다(옵션·대표 수량·대표 단가가 바뀔 때). 사용자 추가 행은 유지된다. */
  function rebuildSheet(
    sheet: ComposerSheet,
    next: {
      optionSelections?: StandardQuoteOptionSelections
      baseQuantity?: number
      lineItems?: PartnerQuoteLineItemInput[]
    } = {}
  ): ComposerSheet {
    const optionSelections = next.optionSelections ?? sheet.optionSelections
    return {
      ...sheet,
      optionSelections,
      quote: buildConfigurableStandardQuoteDetails({
        templateId: sheet.templateId,
        input: {
          ...sheet.quote,
          lineItems: next.lineItems ?? sheet.quote.lineItems,
          templateId: sheet.templateId,
          optionSelections,
        },
        optionSelections,
        baseQuantity: next.baseQuantity ?? getMainQuantity(sheet),
      }),
    }
  }

  function withLineItems(sheet: ComposerSheet, lineItems: PartnerQuoteLineItemInput[]): ComposerSheet {
    return {
      ...sheet,
      quote: finalizeStandardQuoteDetails({ ...sheet.quote, lineItems }, sheet.templateId),
    }
  }

  function setSheetOption(line: QuoteProductLine, groupId: string, value: string | boolean) {
    setActivePick(null)
    updateSheet(line, (sheet) =>
      rebuildSheet(sheet, { optionSelections: { ...sheet.optionSelections, [groupId]: value } })
    )
  }

  function updateLine(line: QuoteProductLine, lineIndex: number, patch: Partial<PartnerQuoteLineItemInput>) {
    updateSheet(line, (sheet) => {
      const items = sheet.quote.lineItems ?? []
      const target = items[lineIndex]
      if (!target) return sheet
      const nextItems = items.map((item, index) => (index === lineIndex ? { ...item, ...patch } : item))
      // 대표 품목의 수량·단가는 딸린 행(벽걸이 수량, 구독 약정 총액 문구)에 번지므로 템플릿으로 다시 짠다.
      if (target.optionGroupId === "main_product" && (patch.quantity != null || "unitPrice" in patch)) {
        return rebuildSheet(sheet, {
          lineItems: nextItems,
          baseQuantity:
            patch.quantity != null ? Math.max(1, Math.round(Number(patch.quantity) || 1)) : undefined,
        })
      }
      return withLineItems(sheet, nextItems)
    })
  }

  function nudgeLineQuantity(line: QuoteProductLine, lineIndex: number, delta: number) {
    const target = sheets.find((sheet) => sheet.line === line)?.quote.lineItems?.[lineIndex]
    if (!target) return
    if (target.quantityLocked === true && target.optionGroupId !== "main_product") return
    setActivePick(null)
    updateLine(line, lineIndex, { quantity: Math.max(1, Math.round(Number(target.quantity ?? 1)) + delta) })
  }

  /** 옵션에서 생긴 행은 옵션을 끄는 방식으로만 지운다(지워도 다시 생기지 않게). */
  function getOptionOffValue(sheet: ComposerSheet, line: PartnerQuoteLineItemInput) {
    const group = getStandardQuoteOptionGroups(sheet.templateId).find((item) => item.id === line.optionGroupId)
    if (!group) return undefined
    if (group.control === "toggle") return false
    return group.options.some((option) => option.value === "none") ? "none" : undefined
  }

  function canRemoveLine(sheet: ComposerSheet, line: PartnerQuoteLineItemInput) {
    if (line.isUserAdded === true || line.optionGroupId === "main_product") return true
    return getOptionOffValue(sheet, line) !== undefined
  }

  function removeLine(line: QuoteProductLine, lineIndex: number) {
    setActivePick(null)
    updateSheet(line, (sheet) => {
      const items = sheet.quote.lineItems ?? []
      const target = items[lineIndex]
      if (!target) return sheet
      // 대표 품목을 지우면 그 공급자 견적서 한 장이 통째로 빠진다.
      if (target.optionGroupId === "main_product") return null
      if (target.isUserAdded === true) {
        // finalize 는 기존 lineNumber 를 존중하므로 삭제 후 번호를 다시 매긴다(번호 구멍 방지).
        return withLineItems(sheet, renumberLineItems(items.filter((_, index) => index !== lineIndex)))
      }
      const offValue = getOptionOffValue(sheet, target)
      if (offValue === undefined || !target.optionGroupId) return sheet
      return rebuildSheet(sheet, {
        optionSelections: { ...sheet.optionSelections, [target.optionGroupId]: offValue },
      })
    })
  }

  /** 품목 카탈로그: 해당 공급자 견적서가 없으면 새 장을 열고, 있으면 그 표에 행을 더한다. */
  function handleCatalogAdd(item: QuickAddRailItem) {
    // AI Suite는 장비까지 포함한 단일 패키지. 기존 HW 장에 SW 장을 덧붙이지 않는다.
    if (item.templateId === "online_suite" && (sheets.length !== 1 || sheets[0].templateId !== "online_suite")) {
      applyTemplate("online_suite")
      return
    }
    setActivePick(null)
    const line = sheetLineOf(item.templateId)
    const sheet = sheets.find((entry) => entry.line === line)

    if (!sheet) {
      const mounting = item.id === "stand" || item.id === "wall_mount" ? { mounting_option: item.id } : undefined
      setSheets((current) => withSheet(current, buildSheet(item.templateId, item.presetId, mounting)))
      return
    }

    const isMainOfSheet =
      item.templateId === sheet.templateId &&
      item.id !== "stand" &&
      item.id !== "wall_mount" &&
      (item.id === "bundle_86_t1_wall" ? isBundleSheet(sheet) : !(item.id === "board_86" && isBundleSheet(sheet)))
    if (isMainOfSheet) {
      updateSheet(line, (current) => rebuildSheet(current, { baseQuantity: getMainQuantity(current) + 1 }))
      return
    }

    if ((item.id === "stand" || item.id === "wall_mount") && isBoardTemplate(sheet.templateId)) {
      setSheetOption(line, "mounting_option", item.id)
      return
    }

    if (item.id === "camera_t1" && isBoardTemplate(sheet.templateId) && sheet.optionSelections.camera_bundle !== true) {
      setSheetOption(line, "camera_bundle", true)
      return
    }

    updateSheet(line, (current) => {
      const items = current.quote.lineItems ?? []
      const existingIndex = items.findIndex(
        (entry) => entry.itemCode === item.sku && entry.isUserAdded === true
      )
      if (existingIndex >= 0) {
        return withLineItems(
          current,
          items.map((entry, index) =>
            index === existingIndex ? { ...entry, quantity: Number(entry.quantity ?? 0) + 1 } : entry
          )
        )
      }
      return withLineItems(
        current,
        renumberLineItems([
          ...items,
          {
            sortOrder: items.length + 1,
            lineNumber: items.length + 1,
            itemType: line === "software" ? "service" : "hardware",
            itemCode: item.sku,
            itemName: item.label,
            itemDescription: item.description,
            quantity: 1,
            quantityUnit: item.quantityUnit,
            unitPrice: item.price,
            vatIncluded: true,
            lineStatus: "priced",
            billingMode: "included_in_quote",
            isOptional: true,
            isUserAdded: true,
            priceLocked: false,
            quantityLocked: false,
          },
        ])
      )
    })
  }

  function applyCombo(combo: (typeof QUICK_COMBOS)[number]) {
    setSheets(combo.parts.reduce<ComposerSheet[]>(
      (list, part) => withSheet(list, buildSheet(part.templateId, part.presetId)),
      []
    ))
    setActivePick(combo.id)
    setCloneSource(null)
    setUnderMinConfirmed(false)
  }

  function applyTemplate(templateId: StandardQuoteTemplateId) {
    setSheets([buildSheet(templateId)])
    setActivePick(`template:${templateId}`)
    setCloneSource(null)
    setUnderMinConfirmed(false)
  }

  /** 저장된 견적 구성 한 건을 한 장으로 펼친다(최근 견적 복제·팀 템플릿 공용). */
  function loadQuoteDetails(details: PartnerQuoteDetailsInput) {
    const templateId = inferStandardQuoteTemplateId(details)
    const optionSelections =
      (details.optionSelections as StandardQuoteOptionSelections | undefined) ??
      getStandardQuoteDefaultSelections(templateId)
    const quote = finalizeStandardQuoteDetails(
      {
        ...details,
        templateId,
        optionSelections,
        recipientCompanyName: undefined,
        recipientContactName: undefined,
        recipientPhone: undefined,
        recipientEmail: undefined,
      },
      templateId
    )
    setSheets([{ line: sheetLineOf(templateId), templateId, optionSelections, quote }])
    const validityDays = daysBetween(details.issuedAt, details.validUntil)
    setShared((current) => ({
      ...current,
      issuedAt: today,
      validUntil: details.validUntil ? addDays(today, validityDays ?? 7) : undefined,
      vatIncluded: details.vatIncluded ?? true,
      generalNotes: quote.generalNotes ?? "",
      specialTerms: quote.specialTerms ?? "",
    }))
    setUnderMinConfirmed(false)
  }

  function applyTeamTemplate(template: QuickQuoteTeamTemplate) {
    loadQuoteDetails(template.details)
    setActivePick(`team:${template.id}`)
    setCloneSource(null)
  }

  async function handleReuseQuote(item: RecentQuoteOption) {
    setReuseLoadingId(item.id)
    setError(null)

    try {
      // include=viewer 여야 version(structured_json)이 함께 온다. 기본 응답은 { quote } 뿐이다.
      const response = await portalFetch(`${apiBase}/quotes/${item.id}?include=viewer`)
      if (!response.ok) {
        throw new Error("기존 견적을 불러오지 못했습니다.")
      }

      const payload = (await response.json()) as QuoteFetchPayload
      const normalized = normalizeQuoteDetailsFromStructuredJson(payload.version?.structured_json, {
        customerName: payload.deal?.customer_name ?? item.customerName,
        validUntil: payload.version?.valid_until,
      })
      loadQuoteDetails({ ...normalized, generatedFromVersionId: payload.version?.id })
      // 품목·단가·조건·메모는 그대로, 고객(수신·참조·거래)만 비운다.
      setCustomerMode("new")
      setSelectedCustomerId("")
      setRecipientInput("")
      setSelectedDealId("")
      setNewDealTitle("")
      patchShared({ referenceName: "" })
      setActivePick(`recent:${item.id}`)
      setCloneSource({
        customerName: payload.deal?.customer_name ?? item.customerName,
        title: payload.version?.title ?? item.title,
      })
    } catch (reuseError) {
      setError(
        reuseError instanceof Error
          ? reuseError.message
          : "최근 견적 복제에 실패했습니다."
      )
    } finally {
      setReuseLoadingId(null)
    }
  }

  function resetStalePrices() {
    for (const stale of staleLines) {
      updateLine(stale.sheet.line, stale.lineIndex, { unitPrice: stale.listPrice })
    }
  }

  function addInformationalLine(line: QuoteProductLine) {
    const itemName = noteLineTitle.trim()
    const itemDescription = noteLineText.trim()
    if (!itemName && !itemDescription) return

    updateSheet(line, (sheet) => {
      const items = sheet.quote.lineItems ?? []
      return withLineItems(
        sheet,
        renumberLineItems([
          ...items,
          createInformationalQuoteLine({ itemName, itemDescription, sortOrder: items.length + 1 }),
        ])
      )
    })

    setNoteLineTitle("")
    setNoteLineText("")
    setNoteLineOpenFor(null)
  }

  function applyRechargeAmount(amount: number, isConfirmed = false) {
    const safeAmount = Math.max(0, amount)
    if (safeAmount >= RECHARGE_MIN_AMOUNT) {
      setUnderMinConfirmed(false)
    } else if (isConfirmed) {
      setUnderMinConfirmed(true)
    }

    setSheets((current) =>
      current.map((sheet) =>
        sheet.templateId !== "business_recharge"
          ? sheet
          : withLineItems(
              sheet,
              (sheet.quote.lineItems ?? []).map((line) =>
                line.itemCode === RECHARGE_ITEM_CODE || line.optionGroupId === "main_product"
                  ? { ...line, unitPrice: safeAmount }
                  : line
              )
            )
      )
    )
  }

  function requestSetRechargeAmount(amount: number) {
    const safeAmount = Math.max(0, amount)
    if (safeAmount < RECHARGE_MIN_AMOUNT) {
      if (underMinConfirmed && currentRechargeAmount === safeAmount) return
      setPendingRechargeAmount(safeAmount)
      setUnderMinModalOpen(true)
    } else {
      applyRechargeAmount(safeAmount, false)
    }
  }

  function confirmUnderMinRecharge() {
    setUnderMinModalOpen(false)
    if (pendingRechargeAmount != null) {
      applyRechargeAmount(pendingRechargeAmount, true)
    } else {
      setUnderMinConfirmed(true)
    }
    const targetAction = pendingSubmitAction
    setPendingRechargeAmount(null)
    setPendingSubmitAction(null)

    if (targetAction) {
      setTimeout(() => {
        void executeSubmit(targetAction)
      }, 0)
    }
  }

  function cancelUnderMinRecharge() {
    setUnderMinModalOpen(false)
    setPendingRechargeAmount(null)
    setUnderMinConfirmed(false)
    setPendingSubmitAction(null)
    applyRechargeAmount(RECHARGE_MIN_AMOUNT, false)
  }

  function handleRechargeInputChange(rawValue: string) {
    const parsed = parseNumericInput(rawValue) ?? 0
    applyRechargeAmount(parsed, underMinConfirmed && parsed < RECHARGE_MIN_AMOUNT)
  }

  function handleRechargeInputBlur(rawValue: string) {
    const parsed = parseNumericInput(rawValue) ?? 0
    if (parsed > 0 && parsed < RECHARGE_MIN_AMOUNT && !underMinConfirmed) {
      setPendingRechargeAmount(parsed)
      setUnderMinModalOpen(true)
    }
  }

  // created: 이번 호출에서 고객을 새로 만들었는지(부분 실패 시 롤백 대상 판단용).
  async function resolveCustomer(): Promise<{ customer: ResolvedCustomer; created: boolean }> {
    if (customerMode === "existing") {
      if (selectedCustomer) {
        return {
          customer: {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            partnerAccountId: selectedCustomer.partner_account_id,
          },
          created: false,
        }
      }

      throw new Error("수신 고객을 선택해 주세요.")
    }

    const name = recipientInput.trim()
    if (!name) {
      throw new Error("수신 칸에 고객사 이름을 입력해 주세요.")
    }

    const requestBody: {
      name: string
      contact_name?: string
      partner_account_id?: string
    } = { name }
    // 새 고객이면 참조(담당자명)를 고객 담당자로도 남긴다.
    if (shared.referenceName.trim()) {
      requestBody.contact_name = shared.referenceName.trim()
    }
    if (isPortalApi && portalPartnerAccountId) {
      requestBody.partner_account_id = portalPartnerAccountId
    }

    const response = await portalFetch(`${apiBase}/customers`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; customer?: CustomerListItem["customer"] }
      | null

    if (!response.ok || !payload?.customer) {
      throw new Error(payload?.error ?? "고객 생성에 실패했습니다.")
    }

    return {
      customer: {
        id: payload.customer.id,
        name: payload.customer.name,
        partnerAccountId: payload.customer.partner_account_id ?? portalPartnerAccountId,
        listItem: { customer: payload.customer, summary: null },
      },
      created: true,
    }
  }

  // created: 이번 호출에서 딜을 새로 만들었는지(부분 실패 시 롤백 대상 판단용).
  async function resolveDeal(customer: ResolvedCustomer, targets: ComposerSheet[], expectedAmount: number) {
    const existingDeal =
      selectedDealId && deals.find((deal) => deal.id === selectedDealId && deal.customer_id === customer.id)

    if (existingDeal) {
      return { deal: existingDeal, created: false }
    }

    const title = newDealTitle.trim() || buildDefaultDealTitle(targets, customer.name)
    if (!title) {
      throw new Error("거래 제목을 입력해 주세요.")
    }

    const partnerAccountId = customer.partnerAccountId ?? portalPartnerAccountId ?? undefined
    if (isPortalApi && !partnerAccountId) {
      throw new Error("어드민 견적서는 고객의 파트너 계정 연결이 필요합니다.")
    }

    const requestBody: {
      customer_id: string
      title: string
      expected_amount: number
      current_stage: "quote"
      partner_account_id?: string
    } = {
      customer_id: customer.id,
      title,
      expected_amount: expectedAmount,
      current_stage: "quote",
    }
    if (isPortalApi && partnerAccountId) {
      requestBody.partner_account_id = partnerAccountId
    }

    const response = await portalFetch(`${apiBase}/deals`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; deal?: DealListItem }
      | null

    if (!response.ok || !payload?.deal) {
      throw new Error(payload?.error ?? "거래 생성에 실패했습니다.")
    }

    return {
      deal: {
        ...payload.deal,
        customer_name: payload.deal.customer_name ?? customer.name,
        customer_contact_name: payload.deal.customer_contact_name ?? null,
        customer_region_label: payload.deal.customer_region_label ?? null,
        customer_campus_name: payload.deal.customer_campus_name ?? null,
      },
      created: true,
    }
  }

  // 생성 롤백: 이번 시도에서 새로 만든 딜/고객만 삭제한다(서버가 빈 딜만 지우도록 가드).
  // 딜을 먼저 지운다(고객을 FK 참조). 모두 best-effort — 실패해도 원래 에러를 가리지 않는다.
  async function cleanupCreatedEntities(dealId: string | null, customerId: string | null) {
    if (dealId) {
      try {
        await portalFetch(`${apiBase}/deals/${dealId}`, { method: "DELETE" })
      } catch (cleanupError) {
        console.warn("[quote-composer] orphan deal cleanup skipped", cleanupError)
      }
    }
    if (customerId) {
      try {
        await portalFetch(`${apiBase}/customers/${customerId}`, { method: "DELETE" })
      } catch (cleanupError) {
        console.warn("[quote-composer] orphan customer cleanup skipped", cleanupError)
      }
    }
  }

  function rememberResolvedCustomerAndDeal(customer: ResolvedCustomer, deal: DealListItem) {
    setCustomers((current) => {
      if (current.some((item) => item.customer.id === customer.id)) return current
      return customer.listItem ? mergeCustomerListItems([customer.listItem], current) : current
    })
    setDeals((current) => mergeDealListItems([deal], current))
    setCustomerMode("existing")
    setSelectedCustomerId(customer.id)
    setSelectedDealId(deal.id)
    setNewDealTitle("")
  }

  async function handleSubmit(action: CreateAction) {
    if (submittingAction) return

    // ClassIn Business 충전형이면서 200만원 미만이고 아직 확인 승인을 받지 않은 경우 확인 창 팝업
    if (rechargeSheet && currentRechargeAmount < RECHARGE_MIN_AMOUNT && !underMinConfirmed) {
      setPendingRechargeAmount(currentRechargeAmount)
      setPendingSubmitAction(action)
      setUnderMinModalOpen(true)
      return
    }

    await executeSubmit(action)
  }

  async function executeSubmit(action: CreateAction) {
    if (submittingAction) return

    const targets = composedSheets.filter((entry) => (entry.sheet.quote.lineItems?.length ?? 0) > 0)
    if (targets.length === 0) return

    const previewWindow = action === "save_and_preview" ? prepareQuotePreviewWindow() : null
    setSubmittingAction(action)
    setError(null)

    // 부분 실패 시 이번 시도에서 새로 만든 딜/고객을 정리하기 위한 추적.
    let createdCustomerId: string | null = null
    let createdDealId: string | null = null
    const savedLines: QuoteProductLine[] = []
    const links: ShareLink[] = []
    let customerName = ""

    try {
      const { customer, created: customerCreated } = await resolveCustomer()
      if (customerCreated) createdCustomerId = customer.id
      customerName = customer.name
      const { deal, created: dealCreated } = await resolveDeal(
        customer,
        targets.map((entry) => entry.sheet),
        targets.reduce((sum, entry) => sum + (entry.quote.grandTotalAmount ?? 0), 0)
      )
      if (dealCreated) createdDealId = deal.id

      // 공급자가 다르면 견적 2건 — 한 장씩 같은 계약(structured_json.quoteDetails)으로 저장한다.
      for (const { sheet, quote } of targets) {
        const preparedQuote = finalizeStandardQuoteDetails(
          { ...quote, recipientCompanyName: customer.name },
          sheet.templateId
        )

        const response = await portalFetch(`${apiBase}/quotes`, {
          method: "POST",
          body: JSON.stringify({
            deal_id: deal.id,
            title: buildStandardQuoteTitle(preparedQuote),
            subtotal: preparedQuote.subtotalAmount ?? 0,
            discount_amount: preparedQuote.discountAmount ?? 0,
            tax_amount: preparedQuote.vatAmount ?? 0,
            total_amount: preparedQuote.grandTotalAmount ?? 0,
            structured_json: {
              quoteDetails: preparedQuote,
            },
            valid_until: preparedQuote.validUntil ?? null,
          }),
        })

        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string
              document?: {
                id: string
                quote_number: string
                status: string
                updated_at: string
              }
              version?: QuoteDocumentVersion
            }
          | null

        if (!response.ok || !payload?.document || !payload?.version) {
          throw new Error(payload?.error ?? "견적서 생성에 실패했습니다.")
        }

        // 견적 문서가 하나라도 생겼으면 이후 실패에서는 딜/고객을 롤백하지 않는다.
        if (savedLines.length === 0) rememberResolvedCustomerAndDeal(customer, deal)
        savedLines.push(sheet.line)

        let shareUrl: string | null = null
        let shareError: string | null = null
        let share: QuoteDocumentShare | null = null

        if (action === "save_and_preview" || action === "save_and_send") {
          try {
            const shareResponse = await portalFetch(`${apiBase}/quotes/${payload.document.id}/share`, {
              method: "POST",
            })
            const sharePayload = (await shareResponse.json().catch(() => null)) as
              | { error?: string; shareUrl?: string; share?: QuoteDocumentShare }
              | null
            if (!shareResponse.ok || !sharePayload?.shareUrl) {
              throw new Error(sharePayload?.error ?? "공유 링크 생성에 실패했습니다.")
            }

            share = sharePayload.share ?? null
            shareUrl = sharePayload.shareUrl
            links.push({
              url: shareUrl,
              quoteNumber: payload.document.quote_number,
              supplierLabel: `${sheet.line === "software" ? "SW" : "HW"} 견적(${SUPPLIER_SHORT_LABEL[sheet.line]})`,
            })
          } catch (shareIssue) {
            shareError =
              shareIssue instanceof Error
                ? shareIssue.message
                : "공유 링크 생성에 실패했습니다."
            const message = `견적서 ${payload.document.quote_number}는 저장했지만 ${shareError}`
            setError(message)
            showErrorToast(message, "발송 준비 실패")
          }
        }

        await onCreated({
          action,
          templateId: sheet.templateId,
          shareUrl,
          shareError,
          share,
          customer,
          deal: {
            id: deal.id,
            title: deal.title,
            deal_code: deal.deal_code,
          },
          document: payload.document,
          version: payload.version,
        })
      }

      if (action === "save") {
        // 임시저장 → 토스트 표시, 모달 유지
        setSaveToast(targets.length > 1 ? `견적서 ${targets.length}장 저장 완료` : "저장 완료")
        setTimeout(() => setSaveToast(null), 2000)
        return
      }

      if (links.length === 0) {
        if (previewWindow && !previewWindow.closed) previewWindow.close()
        return
      }

      if (action === "save_and_preview") {
        openQuotePreviewUrl(links[0].url, previewWindow)
        // 1장이면 미리보기 새 탭만 열고 닫는다. 2장이면 두 번째 링크를 보내기 줄에서 연다.
        if (links.length === 1) {
          onOpenChange(false)
          return
        }
      } else if (previewWindow && !previewWindow.closed) {
        previewWindow.close()
      }

      setShareSheet({ customerName, links })
      setLinkCopied(false)
    } catch (submitError) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close()
      }
      const reason = getQuoteSubmitErrorMessage(submitError)
      if (savedLines.length === 0) {
        // 견적 생성 전 실패라면 이번 시도에서 새로 만든 딜/고객을 정리한다
        // (best-effort — 브라우저 종료 등은 커버하지 못한다).
        void cleanupCreatedEntities(createdDealId, createdCustomerId)
        setError(reason)
        showErrorToast(reason)
      } else {
        // 2장 중 앞 장만 저장됐다 — 저장된 장은 화면에서 빼서 다시 눌러도 중복 저장되지 않게 한다.
        setSheets((current) => current.filter((sheet) => !savedLines.includes(sheet.line)))
        const message = `견적서 ${savedLines.length}장은 저장했습니다. 남은 장 저장 실패: ${reason}`
        setError(message)
        showErrorToast(message)
      }
    } finally {
      setSubmittingAction(null)
    }
  }

  async function handleSaveTemplate() {
    const name = templateDraftName?.trim()
    const entry = composedSheets[0]
    if (!onSaveTemplate || !name || !entry || isSplit) return
    setTemplateSaveState({ status: "saving" })
    try {
      await onSaveTemplate({ name, details: entry.quote })
      setTemplateSaveState({ status: "saved", name })
      setTemplateDraftName(null)
    } catch (saveError) {
      setTemplateSaveState({
        status: "error",
        message: saveError instanceof Error ? saveError.message : "템플릿 저장에 실패했습니다.",
      })
    }
  }

  function copyShareLink(share: ShareSheetState) {
    const text = share.links.length === 1 ? share.links[0].url : buildQuoteShareText(share)
    void copyTextToClipboard(text).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  if (!open || !portalMounted) return null

  function renderLineRow(sheet: ComposerSheet, line: PartnerQuoteLineItemInput, lineIndex: number) {
    const informational = line.lineStatus === "informational"
    const pending = !informational && (line.unitPrice == null || line.lineStatus === "separate_billing" || line.lineStatus === "pending_price")
    const listPrice = getListPrice(line)
    const priceChanged = listPrice != null && line.unitPrice != null && line.unitPrice !== listPrice
    const changePct = priceChanged ? Math.round((1 - (line.unitPrice ?? 0) / (listPrice ?? 1)) * 1000) / 10 : 0
    const isRechargeLine = sheet.templateId === "business_recharge" && line.itemCode === RECHARGE_ITEM_CODE
    const quantityEditable =
      line.quantity != null && !(line.quantityLocked === true && line.optionGroupId !== "main_product")
    const isMain = line.optionGroupId === "main_product"

    return (
      <div
        key={`${line.itemCode ?? line.itemName}-${line.lineNumber}`}
        role="row"
        className={`group ${paperStyles.itemGrid}`}
      >
        <span role="cell" className="tabular-nums text-[#78736D]">{line.lineNumber}</span>
        <span role="cell" className="grid min-w-0">
          <input
            aria-label="품목명"
            value={line.itemName}
            onChange={(event) => updateLine(sheet.line, lineIndex, { itemName: event.target.value })}
            className={`${EDITABLE_CLASS} w-full font-semibold text-[#111110]`}
          />
          <input
            aria-label="세부 내역"
            value={line.itemDescription ?? ""}
            placeholder="세부 내역"
            onChange={(event) => updateLine(sheet.line, lineIndex, { itemDescription: event.target.value })}
            className={`${EDITABLE_CLASS} w-full text-[11.5px] text-[#78736D]`}
          />
        </span>
        <span role="cell" className="flex flex-col items-end">
          {informational ? (
            <span className="text-[#A39E98]">–</span>
          ) : pending ? (
            <span className="text-[11.5px] text-[#78736D]">
              {line.lineStatus === "separate_billing" ? "별도 청구" : "협의"}
            </span>
          ) : line.priceLocked === true ? (
            <span className="tabular-nums">{formatStandardQuoteCurrency(line.unitPrice)}</span>
          ) : (
            <input
              aria-label={isRechargeLine ? "충전 금액" : "단가"}
              inputMode="numeric"
              value={formatStandardQuoteCurrency(line.unitPrice)}
              onChange={(event) => {
                if (isRechargeLine) {
                  handleRechargeInputChange(event.target.value)
                  return
                }
                setActivePick(null)
                updateLine(sheet.line, lineIndex, { unitPrice: parseNumericInput(event.target.value) ?? 0 })
              }}
              onBlur={isRechargeLine ? (event) => handleRechargeInputBlur(event.target.value) : undefined}
              className={`${EDITABLE_CLASS} w-full text-right tabular-nums ${
                priceChanged ? "font-semibold text-[#7A520F]" : "text-[#31302E]"
              }`}
            />
          )}
          {priceChanged && (
            <button
              type="button"
              title={`정가 ${formatStandardQuoteCurrency(listPrice)}원`}
              onClick={() => updateLine(sheet.line, lineIndex, { unitPrice: listPrice })}
              className="text-[10.5px] font-semibold text-[#7A520F] hover:underline"
            >
              {changePct >= 0 ? `${changePct}% 할인` : `${Math.abs(changePct)}% 인상`} · 정가로
            </button>
          )}
        </span>
        <span role="cell" className="flex items-center justify-center gap-0.5">
          {quantityEditable ? (
            <>
              <button
                type="button"
                aria-label="수량 줄이기"
                onClick={() => nudgeLineQuantity(sheet.line, lineIndex, -1)}
                className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[#615D59] hover:bg-[#F0F0EC]"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="min-w-[30px] whitespace-nowrap text-center font-semibold tabular-nums">
                {line.quantity}
                <span className="text-[10.5px] font-normal text-[#78736D]">{line.quantityUnit}</span>
              </span>
              <button
                type="button"
                aria-label="수량 늘리기"
                onClick={() => nudgeLineQuantity(sheet.line, lineIndex, 1)}
                className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[#615D59] hover:bg-[#F0F0EC]"
              >
                <Plus className="h-3 w-3" />
              </button>
            </>
          ) : (
            <span className="whitespace-nowrap tabular-nums text-[#615D59]">
              {line.quantity == null ? "–" : `${line.quantity}${line.quantityUnit ?? ""}`}
            </span>
          )}
        </span>
        <span role="cell" className="text-right font-semibold tabular-nums">
          {informational || line.lineSupplyAmount == null ? "–" : formatStandardQuoteCurrency(line.lineSupplyAmount)}
        </span>
        {canRemoveLine(sheet, line) ? (
          <button
            type="button"
            aria-label={isMain ? "이 견적서 장 삭제" : `${line.itemName} 행 삭제`}
            title={isMain ? "대표 품목을 지우면 이 견적서 한 장이 빠집니다" : "행 삭제"}
            onClick={() => removeLine(sheet.line, lineIndex)}
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[#78736D] opacity-0 transition-opacity hover:bg-[#F0F0EC] hover:text-[#111110] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span />
        )}
      </div>
    )
  }

  function renderSheet(entry: (typeof composedSheets)[number], index: number) {
    const { sheet, quote, totals } = entry
    const supplier = supplierFor(sheet)
    const supplierDefaults = resolveQuoteSupplier(sheet.templateId)
    const manager = managers[sheet.line]
    const managerManualMode = !hasManagerOptions || manager.selection === MANAGER_CUSTOM_VALUE
    const optionGroups = getStandardQuoteOptionGroups(sheet.templateId)
    const termMonths =
      sheet.templateId === "online_suite"
        ? getOnlineSuiteTermMonths(sheet.optionSelections.contract_term as string)
        : null
    const noteLineOpen = noteLineOpenFor === sheet.line

    return (
      <section key={sheet.line} aria-label={`${sheet.templateId === "online_suite" ? "AI Suite 통합" : sheet.line === "software" ? "SW" : "HW"} 견적서`} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {/* 구성 옵션 — 종이에 찍히지 않는 편집 도구 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[12px]">
          <span className="font-semibold text-[#111110]">
            {sheet.templateId === "online_suite" ? "AI Suite · HW+SW" : sheet.line === "software" ? "SW 단독" : "HW"} · {SUPPLIER_SHORT_LABEL[sheet.line]}
          </span>
          <span className="text-[#78736D]">{getStandardQuoteTemplate(sheet.templateId).label} 구성</span>
          {optionGroups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label} className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-[#78736D]">{group.label}</span>
              {group.control === "radio" ? (
                group.options.map((option) => {
                  const active = sheet.optionSelections[group.id] === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.description}
                      aria-pressed={active}
                      onClick={() => setSheetOption(sheet.line, group.id, option.value)}
                      className={`${OPTION_CHIP_CLASS} ${
                        active
                          ? "border-[#084734] font-semibold text-[#084734]"
                          : "border-[#E3E0DB] text-[#615D59] hover:border-[#CFCBC5] hover:text-[#111110]"
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })
              ) : (
                <button
                  type="button"
                  aria-pressed={sheet.optionSelections[group.id] === true}
                  onClick={() => setSheetOption(sheet.line, group.id, sheet.optionSelections[group.id] !== true)}
                  className={`${OPTION_CHIP_CLASS} ${
                    sheet.optionSelections[group.id] === true
                      ? "border-[#084734] font-semibold text-[#084734]"
                      : "border-[#E3E0DB] text-[#615D59] hover:border-[#CFCBC5] hover:text-[#111110]"
                  }`}
                >
                  {sheet.optionSelections[group.id] === true
                    ? group.enabledLabel ?? "포함"
                    : group.disabledLabel ?? "제외"}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ClassIn Business 충전형 — 충전 금액 직접 수정 & 빠른 금액 */}
        {sheet.templateId === "business_recharge" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[8px] border border-[#E3E0DB] bg-white px-3 py-2 text-[12px]">
            <span className="font-semibold text-[#111110]">충전 금액 설정</span>
            <span className="text-[11px] text-[#78736D]">가격 직접 수정 가능 · 최소 200만 · 50만 단위 권장</span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => requestSetRechargeAmount(Math.max(100_000, currentRechargeAmount - 500_000))}
                className={`${OPTION_CHIP_CLASS} border-[#E3E0DB] text-[#615D59] hover:border-[#CFCBC5]`}
              >
                -50만
              </button>
              <button
                type="button"
                onClick={() => requestSetRechargeAmount(currentRechargeAmount + 500_000)}
                className={`${OPTION_CHIP_CLASS} border-[#E3E0DB] text-[#615D59] hover:border-[#CFCBC5]`}
              >
                +50만
              </button>
              {[1_000_000, 2_000_000, 3_500_000, 5_000_000, 10_000_000].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={currentRechargeAmount === amount}
                  onClick={() => requestSetRechargeAmount(amount)}
                  className={`${OPTION_CHIP_CLASS} ${
                    currentRechargeAmount === amount
                      ? "border-[#084734] font-semibold text-[#084734]"
                      : amount < RECHARGE_MIN_AMOUNT
                        ? "border-[#E3D3B4] text-[#7A520F] hover:border-[#7A520F]"
                        : "border-[#E3E0DB] text-[#615D59] hover:border-[#CFCBC5]"
                  }`}
                >
                  {formatQuickAddPrice(amount)}
                </button>
              ))}
            </div>
            {currentRechargeAmount < RECHARGE_MIN_AMOUNT ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#7A520F]">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {underMinConfirmed ? "200만원 미만 예외 발행 (확인 완료)" : "200만원 미만 — 저장 전에 확인 창이 뜹니다"}
              </span>
            ) : currentRechargeAmount % 500_000 !== 0 ? (
              <span className="text-[11px] font-semibold text-[#7A520F]">50만원 단위 권장</span>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-baseline gap-2 px-1 text-xs">
              {/* 거래 연결 — 견적서에는 찍히지 않는 내부 정보 */}
              <span className="text-[11px] text-[#A39E98]">거래</span>
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11.5px]">
                {availableDeals.length > 0 && (
                  <select
                    aria-label="거래 연결"
                    value={selectedDealId}
                    onChange={(event) => setSelectedDealId(event.target.value)}
                    className={`${PAPER_SELECT_CLASS} max-w-full text-[11.5px]`}
                  >
                    <option value="">새 거래로 생성</option>
                    {availableDeals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.title}
                      </option>
                    ))}
                  </select>
                )}
                {!selectedDealId && (
                  <input
                    aria-label="새 거래 제목"
                    value={newDealTitle}
                    onChange={(event) => setNewDealTitle(event.target.value)}
                    placeholder={`비우면 "${buildDefaultDealTitle(sheets, activeCustomerName || null)}"`}
                    className={`${EDITABLE_CLASS} min-w-[180px] flex-1 text-[11.5px] text-[#615D59]`}
                  />
                )}
              </div>
        </div>
        <QuoteDocumentPreview
          quote={quote}
          editing
          slots={{
            issuedAt: (<input
                id={`quote-issued-at-${sheet.line}`}
                type="date"
                aria-label="발행일"
                value={shared.issuedAt}
                onChange={(event) => patchShared({ issuedAt: event.target.value })}
                className={`${EDITABLE_CLASS} w-fit`}
              />),
            recipient: (<div className={paperStyles.fields}>
              <div className="col-span-2 grid min-w-0">
                <input
                  id={`quote-recipient-${sheet.line}`}
                  aria-label="수신 고객사"
                  list="quick-quote-customer-options"
                  value={recipientInput}
                  onChange={(event) => handleRecipientChange(event.target.value)}
                  placeholder="고객명 입력"
                  className={`${EDITABLE_CLASS} w-full text-[12pt] font-semibold text-[#111110] ${
                    customerReady ? "" : "border-b-[1.5px] border-solid border-[#084734]"
                  }`}
                />
                <span className="mt-0.5 text-[11px] text-[#78736D]">
                  {loadingOptions
                    ? "고객 목록 불러오는 중…"
                    : customerMode === "existing"
                      ? "기존 고객"
                      : recipientInput.trim()
                        ? "새 고객으로 저장됩니다"
                        : "기존 고객은 이름을 치면 목록에 뜹니다"}
                </span>
              </div>
              <label htmlFor={`quote-reference-${sheet.line}`} className="text-[#78736D]">참조</label>
              <input
                id={`quote-reference-${sheet.line}`}
                aria-label="참조"
                value={shared.referenceName}
                onChange={(event) => patchShared({ referenceName: event.target.value })}
                placeholder="담당자명 (선택)"
                className={`${EDITABLE_CLASS} w-full`}
              />
              <label htmlFor={`quote-valid-until-${sheet.line}`} className="text-[#78736D]">유효기한</label>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {!hasNoExpiration && (
                  <input
                    id={`quote-valid-until-${sheet.line}`}
                    type="date"
                    aria-label="유효기한"
                    value={shared.validUntil ?? ""}
                    onChange={(event) => patchShared({ validUntil: event.target.value || undefined })}
                    className={`${EDITABLE_CLASS} w-fit`}
                  />
                )}
                <select
                  value={validityPresetValue}
                  aria-label="유효기한 빠른 선택"
                  onChange={(event) => {
                    const next = event.target.value
                    if (next === "none") {
                      setValidityDays(null)
                      return
                    }
                    if (next === "custom") {
                      // 기한 없음 상태에서 직접 지정으로 오면 날짜 입력을 다시 열어준다.
                      if (hasNoExpiration) setValidityDays(7)
                      return
                    }
                    setValidityDays(Number(next))
                  }}
                  className={PAPER_SELECT_CLASS}
                >
                  <option value="7">7일</option>
                  <option value="14">14일</option>
                  <option value="30">30일</option>
                  <option value="custom">직접</option>
                  <option value="none">기한 없음</option>
                </select>
              </div>
</div>),
            supplier: (<div className={paperStyles.fields}>              <p className="col-span-2 mb-1 text-[10.5pt] font-semibold text-[#111110]">{supplier.supplierBusinessName}</p>
              <span className="text-[#78736D]">사업자번호</span>
              <span className="tabular-nums">{supplier.supplierBusinessRegistrationNumber || "-"}</span>
              <span className="text-[#78736D]">대표</span>
              <span>{supplier.supplierRepresentativeName || "-"}</span>
              <span className="text-[#78736D]">주소</span>
              <span className="break-keep">{supplier.supplierAddress || "-"}</span>
              <label htmlFor={`quote-supplier-manager-${sheet.line}`} className="text-[#78736D]">담당</label>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {hasManagerOptions && (
                  <select
                    id={`quote-supplier-manager-${sheet.line}`}
                    aria-label="공급자 담당자"
                    value={manager.selection}
                    onChange={(event) => handleManagerSelectionChange(sheet.line, event.target.value)}
                    className={`${PAPER_SELECT_CLASS} max-w-[160px]`}
                  >
                    <option value="">
                      {supplierDefaults.supplierContactName
                        ? `기본 (${supplierDefaults.supplierContactName})`
                        : "담당자 선택"}
                    </option>
                    {managerOptions.map((option) => (
                      <option key={option.name} value={option.name}>
                        {option.label ?? option.name}
                      </option>
                    ))}
                    <option value={MANAGER_CUSTOM_VALUE}>직접 입력</option>
                  </select>
                )}
                {managerManualMode && (
                  <input
                    id={hasManagerOptions ? undefined : `quote-supplier-manager-${sheet.line}`}
                    value={manager.name}
                    onChange={(event) => setManagerField(sheet.line, "name", event.target.value)}
                    placeholder={supplierDefaults.supplierContactName || "담당자명"}
                    className={`${EDITABLE_CLASS} w-20`}
                    aria-label="공급자 담당자명"
                  />
                )}

              </div>
              <span className="text-[#78736D]">연락처</span>
                <input
                  value={manager.phone}
                  onChange={(event) => setManagerField(sheet.line, "phone", event.target.value)}
                  placeholder={supplierDefaults.supplierContactPhone || "연락처"}
                  className={`${EDITABLE_CLASS} w-[118px] tabular-nums`}
                  aria-label="공급자 담당자 연락처"
                /></div>),
            vatPolicy: (            <select
              id={index === 0 ? "quote-vat-policy" : undefined}
              aria-label="부가세 기준"
              value={shared.vatIncluded ? "included" : "excluded"}
              onChange={(event) => patchShared({ vatIncluded: event.target.value === "included" })}
              className={`${PAPER_SELECT_CLASS} text-[11.5px] text-[#78736D]`}
            >
              <option value="included">단위: 원 · VAT 포함</option>
              <option value="excluded">단위: 원 · VAT 별도</option>
            </select>),
            items: (          <div role="table" aria-label="품목" className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div
                role="row"
                className={`${paperStyles.itemGrid} ${paperStyles.itemHead}`}
              >
                <span role="columnheader">No</span>
                <span role="columnheader">품목 / 세부내역</span>
                <span role="columnheader" className="text-right">단가</span>
                <span role="columnheader" className="text-center">수량</span>
                <span role="columnheader" className="text-right">공급가액</span>
                <span />
              </div>
              {(quote.lineItems ?? []).map((line, lineIndex) => renderLineRow(sheet, line, lineIndex))}

              {noteLineOpen ? (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-[#F0F0EC] py-2">
                  <input
                    autoFocus
                    value={noteLineTitle}
                    onChange={(event) => setNoteLineTitle(event.target.value)}
                    placeholder="구분(예: 납품 조건)"
                    className={`${EDITABLE_CLASS} w-[140px] border-[#CFCBC5]`}
                  />
                  <input
                    value={noteLineText}
                    onChange={(event) => setNoteLineText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        addInformationalLine(sheet.line)
                      }
                    }}
                    placeholder="세부내역(예: 설치 배송비 포함)"
                    className={`${EDITABLE_CLASS} min-w-[180px] flex-1 border-[#CFCBC5]`}
                  />
                  <button
                    type="button"
                    onClick={() => addInformationalLine(sheet.line)}
                    className="h-7 rounded-[6px] border border-[#E3E0DB] px-2.5 text-[12px] text-[#111110] hover:border-[#084734]"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteLineOpenFor(null)}
                    className="h-7 px-1.5 text-[12px] text-[#78736D] hover:text-[#111110]"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNoteLineOpenFor(sheet.line)
                    setNoteLineTitle("")
                    setNoteLineText("")
                  }}
                  className="w-full border-b border-[#F0F0EC] py-2 text-left text-[12px] text-[#78736D] hover:text-[#084734]"
                >
                  + 정보 라인 추가 <span className="text-[#A39E98]">(금액 없음 · 안내 문구 행)</span>
                </button>
              )}
            </div>
          </div>),
            addenda: (<>
            {termMonths && (
              <p className="text-right text-[11.5px] text-[#615D59]">
                약정 {termMonths}개월 · 약정 총 공급가{" "}
                <b className="tabular-nums text-[#111110]">
                  {formatStandardQuoteCurrency((totals.subtotalAmount ?? 0) * termMonths)}원
                </b>{" "}
                (VAT 별도)
              </p>
            )}
            {sheet.templateId === "recording_studio" && sheet.optionSelections.payment_plan === "12_month" && (
              <p className="text-right text-[11.5px] text-[#615D59]">
                12개월 분할 시 월 약{" "}
                <b className="tabular-nums text-[#111110]">
                  {formatStandardQuoteCurrency(Math.round((totals.grandTotalAmount ?? 0) / 12))}원
                </b>{" "}
                (VAT 포함)
              </p>
            )}</>),
            notes: (<div className="grid gap-4">
            <QuoteNoteField
              id={`quote-general-notes-${sheet.line}`}
              label="기타사항"
              group="general"
              value={shared.generalNotes}
              onChange={(next) => patchShared({ generalNotes: next })}
            />
            <QuoteNoteField
              id={`quote-special-terms-${sheet.line}`}
              label="특약사항"
              group="special"
              value={shared.specialTerms}
              placeholder="필요한 경우에만 입력합니다."
              onChange={(next) => patchShared({ specialTerms: next })}
            />
          </div>),
          }}
        />
      </section>
    )
  }

  const submitDisabled = Boolean(submittingAction) || loadingOptions || !canCreateQuote

  return createPortal(
    <div
      data-testid="quick-quote-composer-overlay"
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[#111110]/42 p-0 backdrop-blur-[3px] sm:p-4 lg:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-quote-composer-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented && !submittingAction && !underMinModalOpen) {
            event.preventDefault()
            event.stopPropagation()
            onOpenChange(false)
          }
          if (event.key === "Tab") {
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
            )).filter((element) => element.getClientRects().length > 0)
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
        className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-[#F3F2EF] text-[13px] text-[#111110] shadow-[0_24px_80px_rgba(17,17,16,0.28)] sm:h-[calc(100dvh-32px)] sm:max-w-[1480px] sm:rounded-2xl"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#E8E8E4] bg-white px-4 py-3 sm:px-6">
          <h2 id="quick-quote-composer-title" className="text-[16px] font-bold">
            새 견적
          </h2>
          <ul aria-label="발송 전 확인" className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px]">
            {preflightChecks.map((check) => (
              <li
                key={check.label}
                className={check.ok ? "text-[#31302E]" : "font-semibold text-[#7A520F]"}
              >
                <span aria-hidden="true">{check.ok ? "✓" : "!"}</span> {check.label}
              </li>
            ))}
          </ul>
          <span className="flex-1" />
          <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:flex sm:flex-wrap">
            <Button
              ref={closeButtonRef}
              type="button"
              variant="outline"
              size="sm"
              aria-label="견적 작성 닫기"
              title="작성 화면 나가기 (Esc)"
              className="h-9 text-[13px] text-[#615D59] hover:text-[#111110] hover:no-underline"
              onClick={() => onOpenChange(false)}
              disabled={Boolean(submittingAction)}
            >
              <X className="h-4 w-4" />
              나가기
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-[13px]"
              disabled={submitDisabled}
              onClick={() => {
                void handleSubmit("save")
              }}
            >
              {submittingAction === "save" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              저장
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-[13px]"
              title="저장 후 고객 화면 미리보기"
              disabled={submitDisabled}
              onClick={() => {
                void handleSubmit("save_and_preview")
              }}
            >
              {submittingAction === "save_and_preview" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="mr-1.5 h-3.5 w-3.5" />
              )}
              미리보기
            </Button>
            <Button
              type="button"
              size="sm"
              title="저장 후 공유 링크 생성"
              disabled={submitDisabled}
              onClick={() => {
                void handleSubmit("save_and_send")
              }}
              className="col-span-3 h-9 bg-[#084734] text-[13px] text-white hover:bg-[#065c41] sm:col-span-1"
            >
              {submittingAction === "save_and_send" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              보내기
            </Button>
          </div>
        </header>

        {shareSheet && (
          <div role="region" aria-label="보내기" className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-[#E8E8E4] bg-white px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-[13px] font-bold">
                <span aria-hidden className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-[#084734] align-[1px]" />
                {shareSheet.links.length > 1
                  ? `견적서 ${shareSheet.links.length}장 저장됨 — 링크 ${shareSheet.links.length}개를 한 메시지로 보냅니다`
                  : "견적서 저장됨 — 링크 생성"}
              </p>
              <p className="mt-0.5 text-[12px] text-[#615D59]">{shareSheet.customerName}에게 보낼 방법을 고르세요</p>
              {shareSheet.links.length > 1 && (
                <ul className="mt-1.5 grid gap-0.5 text-[11.5px] text-[#615D59]">
                  {shareSheet.links.map((link) => (
                    <li key={link.url} className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-semibold text-[#31302E]">{link.supplierLabel}</span>
                      <span className="shrink-0 tabular-nums">{link.quoteNumber}</span>
                      <span className="min-w-0 max-w-[280px] truncate text-[#A39E98]">{link.url}</span>
                      <button
                        type="button"
                        onClick={() => openQuotePreviewUrl(link.url)}
                        className="shrink-0 underline decoration-[#CFCBC5] underline-offset-2 hover:text-[#084734]"
                      >
                        고객 화면
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="flex-1" />
            <div role="group" aria-label="보내는 방법" className="flex flex-wrap items-center gap-0.5">
              <ShareOptionButton
                icon={linkCopied ? <Check className="h-[18px] w-[18px] text-[#084734]" /> : <Copy className="h-[18px] w-[18px]" />}
                label={linkCopied ? "복사됨" : "링크 복사"}
                title={shareSheet.links.length > 1 ? "링크 2개가 담긴 메시지 복사" : "링크 복사"}
                onClick={() => copyShareLink(shareSheet)}
              />
              <ShareOptionButton
                icon={<MessageCircle className="h-[18px] w-[18px]" />}
                label="카카오톡"
                title="카카오톡으로 전송"
                onClick={() => openKakaoShare(shareSheet)}
              />
              <ShareOptionButton
                icon={<Smartphone className="h-[18px] w-[18px]" />}
                label="문자"
                title="문자로 전송"
                onClick={() => openSmsShare(shareSheet)}
              />
              <ShareOptionButton
                icon={<Mail className="h-[18px] w-[18px]" />}
                label="메일"
                title="메일 앱으로 전송"
                onClick={() => openMailShare(shareSheet)}
              />
              {typeof navigator !== "undefined" && "share" in navigator && (
                <ShareOptionButton
                  icon={<Share2 className="h-[18px] w-[18px]" />}
                  label="기타 공유"
                  title="기기 공유 메뉴 열기"
                  onClick={() => {
                    navigator.share({
                      title: `견적서 ${shareSheet.links.map((link) => link.quoteNumber).join(", ")}`,
                      text: buildQuoteShareText(shareSheet),
                    }).catch(() => {})
                  }}
                />
              )}
              <ShareOptionButton
                icon={<Printer className="h-[18px] w-[18px]" />}
                label="미리보기"
                title="고객 화면 미리보기"
                onClick={() => {
                  openQuotePreviewUrl(shareSheet.links[0].url)
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-[13px]"
                onClick={() => setShareSheet(null)}
              >
                편집 계속
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShareSheet(null)
                  onOpenChange(false)
                }}
                className="h-9 bg-[#084734] text-[13px] text-white hover:bg-[#065c41]"
              >
                완료
              </Button>
            </div>
          </div>
        )}

        <div role="group" aria-label="견적 유형" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#E8E8E4] bg-white px-4 py-2 sm:px-6">
          {([
            { id: "business_recharge", mode: "software", label: "SW 단독" },
            { id: "board_86", mode: "hardware", label: "HW" },
            { id: "online_suite", mode: "suite", label: "AI Suite · HW+SW 통합" },
          ] as const).map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={!isSplit && composerMode === choice.mode}
              disabled={Boolean(submittingAction)}
              onClick={() => applyTemplate(choice.id)}
              className={`rounded-md border px-3 py-1.5 text-[12px] font-semibold ${!isSplit && composerMode === choice.mode ? "border-[#084734] bg-[#ECFDF5] text-[#084734]" : "border-[#E8E8E4] text-[#615D59]"}`}
            >
              {choice.label}
            </button>
          ))}
          <span className="text-[11px] text-[#615D59]">
            {composerMode === "suite" ? "전자칠판·카메라·소프트웨어 포함 · 견적서 1장" : "유형 선택 시 품목 구성이 바뀝니다. 수신 정보는 유지됩니다."}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main className="flex flex-wrap items-start justify-center gap-7 p-4 sm:p-6">
            <nav
              aria-label="시작 방법과 품목"
              className="flex w-full min-w-0 flex-[1_1_100%] flex-col gap-4 lg:sticky lg:top-0 lg:w-auto lg:flex-[0_1_270px]"
            >
              <button type="button" aria-expanded={toolsExpanded} aria-controls="quote-composer-tools" onClick={() => setToolsExpanded((value) => !value)} className="flex items-center justify-between rounded-md border border-[#E8E8E4] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#31302E] lg:hidden">
                <span>최근 견적·템플릿·품목</span><span>{toolsExpanded ? "접기" : "펼치기"}</span>
              </button>
              <div id="quote-composer-tools" className={toolsExpanded ? "contents" : "hidden lg:contents"}>
                {displaySettings && <QuoteDisplaySettings {...displaySettings} />}
                {showRecentQuotes && recentQuotes.length > 0 && (
                  <section aria-label="최근 견적서">
                    <p className={RAIL_HEADING_CLASS}>
                      최근 견적서 <span className="font-normal">· 고객만 바꿔 재사용</span>
                    </p>
                    {recentQuotes.slice(0, showAllRecent ? recentQuotes.length : QUOTE_WORKSPACE_PREVIEW_LIMIT).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={activePick === `recent:${item.id}`}
                        disabled={reuseLoadingId === item.id}
                        onClick={() => {
                          void handleReuseQuote(item)
                        }}
                        className={`${RAIL_BUTTON_CLASS} ${activePick === `recent:${item.id}` ? RAIL_ACTIVE_CLASS : ""}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold">
                            {reuseLoadingId === item.id ? "불러오는 중…" : item.customerName}
                          </span>
                          <span className="block truncate text-[11px] font-normal text-[#615D59]">{item.title}</span>
                        </span>
                        <span className="text-[11.5px] font-normal tabular-nums text-[#78736D]">
                          {formatQuickAddPrice(item.totalAmount)}
                        </span>
                      </button>
                    ))}
                    {recentQuotes.length > QUOTE_WORKSPACE_PREVIEW_LIMIT && (
                      <button type="button" onClick={() => setShowAllRecent((value) => !value)} className="mx-2 mt-1 py-1 text-[11.5px] text-[#084734]">
                        {showAllRecent ? "접기" : `최근 견적 ${recentQuotes.length}개 모두 보기`}
                      </button>
                    )}
                  </section>
                )}

                <div>
                  {showTemplates && (
                    <section aria-label="견적 템플릿" className="border-t border-[#E8E8E4] pt-3.5">
                      <p className={RAIL_HEADING_CLASS}>템플릿 <span className="font-normal">{templateCount}</span></p>
                      {displayedTeamTemplates.map((template) => {
                        const pickId = `team:${template.id}`
                        return (
                          <div key={template.id} className="flex min-w-0 items-center">
                            <button
                              type="button"
                              aria-pressed={activePick === pickId}
                              onClick={() => applyTeamTemplate(template)}
                              className={`${RAIL_BUTTON_CLASS} min-w-0 flex-1 ${activePick === pickId ? RAIL_ACTIVE_CLASS : ""}`}
                            >
                              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                                {template.label} <span className="text-[10.5px] text-[#78736D]">· 팀</span>
                              </span>
                            </button>
                            {template.canDelete && onDeleteTemplate ? (
                              <button type="button" aria-label={`${template.label} 삭제`} title="템플릿 삭제" disabled={deletingTemplateId !== null} onClick={() => void handleDeleteTemplate(template)} className="shrink-0 rounded-md p-2 text-[#615D59] hover:bg-white hover:text-[#B43E3E] disabled:opacity-50">
                                {deletingTemplateId === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            ) : displaySettings ? (
                              <button type="button" aria-label={`${template.label} 숨기기`} title="내 목록에서 숨기기" onClick={() => displaySettings.onChange({ hiddenTemplateIds: [...hiddenTemplateIds, template.id] })} className="shrink-0 rounded-md p-2 text-[#615D59] hover:bg-white hover:text-[#111110]">
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        )
                      })}
                      {displayedBaseTemplates.map((template) => {
                        const pickId = `template:${template.id}`
                        return (
                          <div key={template.id} className="flex min-w-0 items-center">
                            <button type="button" title={template.description} aria-pressed={activePick === pickId} onClick={() => applyTemplate(template.id)} className={`${RAIL_BUTTON_CLASS} min-w-0 flex-1 ${activePick === pickId ? RAIL_ACTIVE_CLASS : ""}`}>
                              <span className="min-w-0 flex-1 truncate text-[12.5px]">{template.label}</span>
                              <span className="text-[11.5px] font-normal tabular-nums text-[#615D59]">{formatQuickAddPrice(templateTotals[template.id] ?? 0)}</span>
                            </button>
                            {displaySettings && (
                              <button type="button" aria-label={`${template.label} 숨기기`} title="내 목록에서 숨기기" onClick={() => displaySettings.onChange({ hiddenTemplateIds: [...hiddenTemplateIds, `base:${template.id}`] })} className="shrink-0 rounded-md p-2 text-[#615D59] hover:bg-white hover:text-[#111110]">
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {templateCount === 0 && <p className="mx-2 text-[12px] text-[#615D59]">표시할 템플릿이 없습니다. 보기 설정에서 숨긴 항목을 다시 표시할 수 있습니다.</p>}
                      {templateCount > QUOTE_WORKSPACE_PREVIEW_LIMIT && (
                        <button type="button" onClick={() => setShowAllTemplates((value) => !value)} className="mx-2 mt-1 py-1 text-[11.5px] text-[#084734]">
                          {showAllTemplates ? "접기" : `템플릿 ${templateCount}개 모두 보기`}
                        </button>
                      )}
                      {composerMode === "hardware" && (
                        <details className="mx-2 mt-2 text-[11.5px] text-[#615D59]">
                          <summary className="cursor-pointer py-1">빠른 조합 · HW + SW 별도 구매</summary>
                          {QUICK_COMBOS.map((combo) => (
                            <button key={combo.id} type="button" aria-pressed={activePick === combo.id} onClick={() => applyCombo(combo)} className={`${RAIL_BUTTON_CLASS} ${activePick === combo.id ? RAIL_ACTIVE_CLASS : ""}`}>
                              <span className="min-w-0 flex-1 text-[12px]">{combo.label}</span>
                              <span className="text-[11px] tabular-nums">{formatQuickAddPrice(comboTotals[combo.id] ?? 0)}</span>
                            </button>
                          ))}
                        </details>
                      )}
                      {templateDeleteError && <p role="alert" className="mx-2 mt-2 text-[12px] text-[#B43E3E]">{templateDeleteError}</p>}
                    </section>
                  )}
                  {onSaveTemplate && (
                    <div className="mx-2 mt-1.5 grid gap-1 text-[12px]">
                      {templateDraftName === null ? (
                        <button
                          type="button"
                          disabled={isSplit || sheets.length === 0}
                          title={isSplit ? "템플릿은 공급자 1곳 기준입니다 — 견적서가 1장일 때 저장하세요" : undefined}
                          onClick={() => {
                            setTemplateSaveState(null)
                            setTemplateDraftName(sheets[0] ? buildDefaultDealTitle([sheets[0]]) : "")
                          }}
                          className="w-fit text-left text-[#31302E] underline decoration-[#CFCBC5] underline-offset-[3px] hover:decoration-[#084734] disabled:cursor-not-allowed disabled:text-[#A39E98]"
                        >
                          이 구성을 템플릿으로 저장
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            aria-label="템플릿 이름"
                            value={templateDraftName}
                            maxLength={60}
                            onChange={(event) => setTemplateDraftName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                void handleSaveTemplate()
                              }
                              if (event.key === "Escape") {
                                event.preventDefault()
                                event.stopPropagation()
                                setTemplateDraftName(null)
                              }
                            }}
                            className={`${EDITABLE_CLASS} min-w-0 flex-1 border-[#CFCBC5]`}
                          />
                          <button
                            type="button"
                            disabled={!templateDraftName.trim() || templateSaveState?.status === "saving"}
                            onClick={() => {
                              void handleSaveTemplate()
                            }}
                            className="h-7 shrink-0 rounded-[6px] border border-[#E3E0DB] px-2 text-[12px] hover:border-[#084734] disabled:opacity-50"
                          >
                            {templateSaveState?.status === "saving" ? "저장 중…" : "저장"}
                          </button>
                          <button
                            type="button"
                            aria-label="템플릿 저장 취소"
                            onClick={() => setTemplateDraftName(null)}
                            className="h-7 shrink-0 px-1 text-[#78736D] hover:text-[#111110]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {templateSaveState?.status === "saved" && (
                        <span className="text-[#084734]">✓ 팀 템플릿으로 저장됨 · {templateSaveState.name}</span>
                      )}
                      {templateSaveState?.status === "error" && (
                        <span role="alert" className="text-[#B85C33]">{templateSaveState.message}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-[#E3E0DB] pt-3.5">
                  <p className={RAIL_HEADING_CLASS}>품목 · 눌러서 추가</p>
                  {visibleCatalogItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={`${item.label} · ${item.description}`}
                      onClick={() => handleCatalogAdd(item)}
                      className={`group ${RAIL_BUTTON_CLASS} items-center py-1.5`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-[12.5px] font-semibold">{item.label}</span>{" "}
                        <span className="text-[10.5px] text-[#78736D]">
                          {item.templateId === "online_suite" ? "HW+SW" : isSoftwareQuoteTemplate(item.templateId) ? "SW" : "HW"}
                          {item.badge ? ` · ${item.badge}` : ""}
                        </span>
                        <span className="block text-[11.5px] tabular-nums text-[#78736D]">
                          {formatQuickAddPrice(item.price, item.priceUnit)}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-[#D6D3CE] text-[#615D59] transition-colors group-hover:border-[#084734] group-hover:text-[#084734]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </nav>

            <div className="flex min-w-0 flex-[0_1_760px] flex-col gap-5">
              {error && (
                <p role="alert" className="rounded-[8px] border border-[#E9C2AF] bg-white px-3.5 py-2.5 text-[12.5px] text-[#B85C33]">
                  {error}
                </p>
              )}

              {cloneSource && (
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[8px] border border-[#084734] bg-white px-3.5 py-2.5 text-[12.5px]">
                  <span className="flex-[1_1_260px]">
                    {cloneSource.title} ({cloneSource.customerName}) 구성을 가져왔습니다 — 수신 칸에 새 고객명만 입력하세요.
                  </span>
                  {staleLines.length > 0 && (
                    <button
                      type="button"
                      onClick={resetStalePrices}
                      className="text-[12px] font-semibold text-[#7A520F] underline underline-offset-[3px]"
                    >
                      옛 단가 {staleLines.length}건 → 지금 정가로
                    </button>
                  )}
                </div>
              )}

              {isSplit && (
                <p className="text-[12px] text-[#615D59]">
                  공급자가 달라 견적서가 <b className="text-[#111110]">2장</b>으로 나뉩니다(HW=퀴드러닝, SW=클래스인).
                  수신·조건·메모는 두 장에 같이 들어가고, 저장하면 견적 2건이 생기며 링크 2개를 한 메시지로 보냅니다.
                </p>
              )}

              {sheets.length === 0 && (
                <p className="rounded-[8px] border border-dashed border-[#CFCBC5] px-4 py-10 text-center text-[12.5px] text-[#78736D]">
                  왼쪽에서 조합·템플릿을 고르거나 품목을 눌러 견적서를 시작하세요.
                </p>
              )}

              {composedSheets.map((entry, index) => renderSheet(entry, index))}

              {isSplit && (
                <div className="flex justify-end gap-7 px-1 text-[14px] font-bold">
                  <span className="font-semibold text-[#615D59]">두 장 합계</span>
                  <span className="tabular-nums">{formatStandardQuoteCurrency(grandTotalAll)}원</span>
                </div>
              )}
            </div>
          </main>
        </div>

        <datalist id="quick-quote-customer-options">
          {sortedCustomers.map((item) => (
            <option key={item.customer.id} value={customerLabel(item.customer)} />
          ))}
        </datalist>

        {/* ── 임시저장 토스트 ─────────────────────────────────── */}
        {saveToast && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div
              className="pointer-events-auto rounded-2xl bg-[#111110] px-6 py-4 text-center shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
              style={{ animation: "fadeInUp 0.25s ease-out" }}
            >
              <Check className="mx-auto h-6 w-6 text-[#6EE7B7]" />
              <p className="mt-2 text-sm font-medium text-white">{saveToast}</p>
            </div>
          </div>
        )}

        {errorToast && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
            <div
              role="alert"
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-[#F2B8A2] bg-white px-4 py-4 shadow-[0_18px_60px_rgba(80,30,12,0.22)]"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#F2B8A2] text-[#B85C33]">
                <AlertCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#111110]">{errorToast.title}</p>
                <p className="mt-1 text-sm leading-5 text-[#7A4A36]">
                  이유: {errorToast.message}
                </p>
              </div>
              <button
                type="button"
                title="오류 메시지 닫기"
                onClick={() => setErrorToast(null)}
                className="rounded-md p-1 text-[#7A4A36]/60 transition-colors hover:text-[#7A4A36]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {/* ── 200만원 미만 예외 발행 확인 모달 ────────────────── */}
        {underMinModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="under-min-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-md space-y-4 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E3D3B4] text-[#7A520F]">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 id="under-min-modal-title" className="text-sm font-bold text-[#111110]">
                    200만원 미만 예외 발행 확인
                  </h4>
                  <p className="mt-0.5 text-[11px] text-[#A39E98]">
                    ClassIn Business 충전형 최소 기준 안내
                  </p>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[#E3D3B4] p-3.5 text-xs text-[#615D59]">
                <p>
                  설정하신 금액{" "}
                  <strong className="font-bold tabular-nums text-[#084734]">
                    {formatStandardQuoteCurrency(pendingRechargeAmount ?? currentRechargeAmount)}원
                  </strong>
                  은 ClassIn Business 충전형의 기본 최소 기준(2,000,000원) 미만입니다.
                </p>
                <p className="text-[11px] leading-relaxed text-[#A39E98]">
                  • 소액 테스트 도입, 파일럿 학원, 추가 보충 충전 등 특별 승인 건인 경우 예외 발행이 가능합니다.
                  <br />
                  • 승인 시 고객 견적서에 해당 금액으로 정상 조판되어 발급됩니다.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-[#615D59]"
                  onClick={cancelUnderMinRecharge}
                >
                  취소 (200만원으로 복원)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-[#084734] px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#065c41]"
                  onClick={confirmUnderMinRecharge}
                >
                  예외 발행 승인 및 계속
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
