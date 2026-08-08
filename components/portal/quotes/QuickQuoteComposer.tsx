"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Share2,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { normalizeQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import { portalFetch } from "@/lib/portal/portal-fetch"
import { getProductBySku } from "@/lib/product-templates"
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
  DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID,
  appendQuoteNoteLine,
  buildConfigurableStandardQuoteDetails,
  buildStandardQuoteTitle,
  calculateStandardQuoteTotals,
  createInformationalQuoteLine,
  finalizeStandardQuoteDetails,
  formatStandardQuoteCurrency,
  getQuoteNotePresets,
  getStandardQuoteDefaultSelections,
  getStandardQuoteOptionGroups,
  getStandardQuoteQuickPresets,
  getQuoteProductLineTemplateId,
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

type ShareSheetState = {
  url: string
  quoteNumber: string
  customerName: string
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

type QuickQuoteComposerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  recentQuotes: RecentQuoteOption[]
  onCreated: (payload: QuickQuoteCreatedPayload) => void | Promise<void>
  apiBase?: QuickQuoteApiBase
  portalPartnerAccountId?: string | null
  initialTemplateId?: StandardQuoteTemplateId
  /** 공급자 담당자 드롭다운 후보(비면 기존처럼 자유 텍스트 입력만 노출). */
  supplierManagerOptions?: QuickQuoteManagerOption[]
  /**
   * 딜/고객 컨텍스트에서 진입할 때 프리필할 대상. 값이 있으면 고객·거래 목록이 로드된 뒤
   * "기존 고객" 모드로 해당 고객·거래를 자동 선택한다. (새 고객 암묵 생성 없음)
   */
  prefill?: QuickQuotePrefill | null
}

export type QuickQuotePrefill = {
  dealId?: string | null
  customerId?: string | null
  /** 목록 로드 전에도 미리보기에 채워둘 수신처 이름(선택). */
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
  deal: DealListItem
}

type CustomerPayload = { customers: CustomerListItem[] }
type DealPayload = { deals: DealListItem[] }
type ResolvedCustomer = {
  id: string
  name: string
  partnerAccountId?: string | null
  listItem?: CustomerListItem
}

type QuickAddRailItemId =
  | "board_86"
  | "board_75"
  | "camera_t1"
  | "recording_studio"
  | "online_suite"
  | "stand"
  | "wall_mount"
  | "bundle_86_t1_wall"

type QuickAddRailItem = {
  id: QuickAddRailItemId
  label: string
  description: string
  price: number
}

const QUICK_ADD_RAIL_ITEMS: QuickAddRailItem[] = [
  {
    id: "recording_studio",
    label: "녹화 세트",
    description: "OMO 830",
    price: getProductBySku("ai-studio-recording-set")?.unit_price ?? 8_300_000,
  },
  {
    id: "online_suite",
    label: "AI Suite",
    description: "월 구독",
    price: getProductBySku("online-suite-monthly")?.unit_price ?? 400_000,
  },
  {
    id: "board_86",
    label: '전자칠판 86"',
    description: "",
    price: getProductBySku("board-86")?.unit_price ?? 6_300_000,
  },
  {
    id: "board_75",
    label: '전자칠판 75"',
    description: "",
    price: getProductBySku("board-75")?.unit_price ?? 5_400_000,
  },
  {
    id: "camera_t1",
    label: "T1 카메라",
    description: "",
    price: getProductBySku("camera-t1")?.unit_price ?? 1_200_000,
  },
  {
    id: "stand",
    label: "스탠드",
    description: "",
    price: getProductBySku("stand")?.unit_price ?? 500_000,
  },
  {
    id: "wall_mount",
    label: "벽걸이",
    description: "",
    price: getProductBySku("wall-mount")?.unit_price ?? 500_000,
  },
  {
    id: "bundle_86_t1_wall",
    label: "번들",
    description: '86" + T1 + 벽걸이',
    price: getProductBySku("bundle-86-t1-wall")?.unit_price ?? 8_000_000,
  },
]

/* ── 컴팩트 폼 토큰 ─────────────────────────────────────────────
 * 입력 h-9 / 라벨 11px / 카드 whisper border. DESIGN.md 팔레트만 사용한다.
 */
const COMPACT_INPUT_CLASS = "h-9 text-[13px]"
const COMPACT_SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-[6px] border border-[#E5E5E0] bg-white px-2.5 text-[13px] text-[#111110] outline-none transition-colors hover:border-[#D8D8D2] focus-visible:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/20 disabled:cursor-not-allowed disabled:opacity-50"
const COMPACT_CARD_CLASS = "rounded-[12px] border border-black/[0.08] bg-white p-3.5"
const COMPACT_CHIP_CLASS =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors"
const MANAGER_CUSTOM_VALUE = "__custom__"

function SectionHeading({
  step,
  title,
  hint,
  required,
  action,
}: {
  step: string
  title: string
  hint?: string
  required?: boolean
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#084734]">{step}</span>
        <h3 className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#111110]">
          {title}
          {required && (
            <>
              <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-[#B43E3E]" />
              <span className="sr-only">필수</span>
            </>
          )}
        </h3>
        {hint && <span className="truncate text-[11px] text-[#A39E98]">{hint}</span>}
      </div>
      {action}
    </div>
  )
}

function FieldLabel({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor?: string
  children: ReactNode
  required?: boolean
  hint?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1 text-[11px] font-semibold leading-none text-[#615D59]"
    >
      <span className={required ? "text-[#111110]" : undefined}>{children}</span>
      {required && (
        <>
          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-[#B43E3E]" />
          <span className="sr-only">필수</span>
        </>
      )}
      {hint && <span className="truncate font-normal text-[#A39E98]">{hint}</span>}
    </label>
  )
}

/** 프리셋 칩 + 직접 추가 + textarea 한 세트(기타사항/특약사항 공용). */
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
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-1">
        {presets.map((preset) => {
          const included = quoteNoteHasLine(value, preset.text)

          return (
            <button
              key={preset.id}
              type="button"
              title={preset.text}
              disabled={included}
              onClick={() => onChange(appendQuoteNoteLine(value, preset.text))}
              className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                included
                  ? "cursor-default border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                  : "border-black/[0.08] bg-white text-[#615D59] hover:border-[#BDEFD8] hover:text-[#111110]"
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
          className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-black/[0.14] px-2.5 text-[11px] font-medium text-[#615D59] transition-colors hover:border-[#084734] hover:text-[#084734]"
        >
          직접 추가
        </button>
      </div>

      {customOpen && (
        <div className="flex items-center gap-1.5">
          <Input
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitCustomText()
              }
            }}
            placeholder="추가할 문구를 입력하고 Enter"
            className="h-8 text-[13px]"
          />
          <button
            type="button"
            onClick={commitCustomText}
            className="inline-flex h-8 shrink-0 items-center rounded-[6px] border border-black/[0.08] bg-white px-3 text-[12px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4]"
          >
            추가
          </button>
        </div>
      )}

      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[72px] w-full rounded-[6px] border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] text-[#111110] outline-none transition-colors placeholder:text-[#A39E98] focus-visible:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/20"
      />
    </div>
  )
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

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateValue: string, days: number) {
  const base = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(base.getTime())) return dateValue
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}

function formatQuickAddPrice(value: number) {
  return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`
}

function getBaseLine(quote: PartnerQuoteDetailsInput) {
  return (
    quote.lineItems?.find((item) => item.optionGroupId === "main_product") ??
    quote.lineItems?.find((item) => item.itemType === "hardware") ??
    quote.lineItems?.[0]
  )
}

function renumberLineItems(items: PartnerQuoteLineItemInput[]) {
  return items.map((item, index) => ({ ...item, sortOrder: index + 1, lineNumber: index + 1 }))
}

function parseNumericInput(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value.replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildDefaultDealTitle({
  templateId,
  quantity,
  customerName,
}: {
  templateId: StandardQuoteTemplateId
  quantity: number
  customerName?: string | null
}) {
  const template = getStandardQuoteTemplate(templateId)
  const quantityUnit =
    templateId === "online_suite" ? "월" : templateId === "recording_studio" ? "세트" : "대"
  const subject = `${template.label} ${Math.max(1, quantity)}${quantityUnit}`
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
  return `[견적서] ${share.quoteNumber}\n${share.customerName}님 견적서입니다.\n${share.url}`
}

function openKakaoShare(share: ShareSheetState) {
  const text = buildQuoteShareText(share)
  window.open(
    `https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(share.url)}&text=${encodeURIComponent(text)}`,
    "_blank",
    "width=480,height=640"
  )
}

function openSmsShare(share: ShareSheetState) {
  const body = `[견적서 ${share.quoteNumber}] ${share.customerName}님 견적서입니다. ${share.url}`
  window.location.href = `sms:?body=${encodeURIComponent(body)}`
}

function openMailShare(share: ShareSheetState) {
  const subject = `[견적서] ${share.quoteNumber}`
  const body = `${share.customerName}님 견적서입니다.\n\n${share.url}`
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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
      className="flex h-[58px] w-[64px] flex-col items-center justify-center gap-1 rounded-[10px] border border-black/[0.08] bg-white text-[#111110] transition-colors hover:border-[#BDEFD8] hover:bg-[#F0FDF7]"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f6f5f2] text-[#615D59]">
        {icon}
      </span>
      <span className="whitespace-nowrap text-[11px] font-medium">{label}</span>
    </button>
  )
}

function PreviewField({
  label,
  value,
  align = "left",
}: {
  label: string
  value?: string
  align?: "left" | "right"
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 border-b border-black/80 pb-1 text-[11px] leading-5 text-black">
      <span className="break-keep">{label}</span>
      <span className={`break-keep whitespace-pre-wrap ${align === "right" ? "text-right" : ""}`}>
        {value || " "}
      </span>
    </div>
  )
}

function QuotePreviewPanel({
  quote,
  supplier,
}: {
  quote: PartnerQuoteDetailsInput
  supplier: ReturnType<typeof resolveQuoteSupplier>
}) {
  const lineItems = quote.lineItems ?? []
  const fillerRowCount = Math.max(0, 4 - lineItems.length)
  const [zoom, setZoom] = useState(0.72)
  const zoomIn = () => setZoom(z => Math.min(1.2, +(z + 0.08).toFixed(2)))
  const zoomOut = () => setZoom(z => Math.max(0.4, +(z - 0.08).toFixed(2)))

  return (
    <aside className="flex flex-col rounded-[28px] border border-[#e8e8e4] bg-[#f6f5f2]">
      {/* Zoom Controls */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[11px] font-medium text-[#A39E98]">미리보기</span>
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="rounded-lg p-1 text-[#615D59] hover:bg-black/5" title="축소">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[36px] text-center text-[11px] tabular-nums text-[#A39E98]">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="rounded-lg p-1 text-[#615D59] hover:bg-black/5" title="확대">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Scrollable preview area */}
      <div className="min-h-0 flex-1 overflow-auto p-4 pt-2">
        <div className="flex justify-center">
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
      <div className="mx-auto w-[560px] rounded-[24px] bg-white px-9 py-10 shadow-[0_12px_32px_rgba(17,17,16,0.08)]">
        <p className="text-center text-[18px] font-semibold tracking-tight text-black">견적서</p>

        <div className="mt-8 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-6">
          <div className="space-y-3">
            <PreviewField label="발행일" value={quote.issuedAt} />
            <PreviewField label="수신" value={quote.recipientCompanyName} />
            <PreviewField label="참조" value={quote.referenceName} />
          </div>
          <div className="space-y-3">
            <PreviewField label="상호명" value={supplier.supplierBusinessName} align="right" />
            <PreviewField label="사업자등록번호" value={supplier.supplierBusinessRegistrationNumber} align="right" />
            <PreviewField label="대표이사" value={supplier.supplierRepresentativeName} align="right" />
            <PreviewField label="주소" value={supplier.supplierAddress} align="right" />
            <PreviewField
              label="담당자/연락처"
              value={`${supplier.supplierContactName ?? ""}/${supplier.supplierContactPhone ?? ""}`}
              align="right"
            />
          </div>
        </div>

        <p className="mt-10 text-center text-[13px] text-black">{quote.subjectText}</p>
        <div className="mt-4 text-right text-[12px] text-black">{quote.vatPolicyLabel}</div>

        <table className="mt-3 w-full table-fixed border-collapse text-[12px] text-black">
          <colgroup>
            <col className="w-[30px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[82px]" />
            <col className="w-[56px]" />
            <col className="w-[92px]" />
          </colgroup>
          <thead className="bg-[#ecebea]">
            <tr className="border-y border-black">
              <th className="px-1 py-2 text-left font-normal">No</th>
              <th className="px-1 py-2 text-left font-normal">품목</th>
              <th className="px-1 py-2 text-left font-normal">세부내역</th>
              <th className="px-1 py-2 text-right font-normal">단가</th>
              <th className="px-1 py-2 text-right font-normal">수량(대)</th>
              <th className="px-1 py-2 text-right font-normal">공급가액</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line) => (
              <tr key={`preview-${line.lineNumber}-${line.itemName}`} className="border-b border-black">
                <td className="px-1 py-2 align-top">{line.lineNumber}</td>
                <td className="px-1 py-2 align-top break-keep">{line.itemName}</td>
                <td className="px-1 py-2 align-top break-keep">{line.itemDescription || "-"}</td>
                <td className="px-1 py-2 text-right align-top whitespace-nowrap">
                  {line.unitPrice == null ? "-" : formatStandardQuoteCurrency(line.unitPrice)}
                </td>
                <td className="px-1 py-2 text-right align-top whitespace-nowrap">{line.quantity ?? "-"}</td>
                <td className="px-1 py-2 text-right align-top whitespace-nowrap">
                  {line.lineSupplyAmount == null ? "-" : formatStandardQuoteCurrency(line.lineSupplyAmount)}
                </td>
              </tr>
            ))}
            {Array.from({ length: fillerRowCount }).map((_, index) => (
              <tr key={`filler-${index}`} className="border-b border-black">
                <td className="px-1 py-4">&nbsp;</td>
                <td className="px-1 py-4" />
                <td className="px-1 py-4" />
                <td className="px-1 py-4" />
                <td className="px-1 py-4" />
                <td className="px-1 py-4" />
              </tr>
            ))}
            <tr className="border-b border-black">
              <td className="px-1 py-3" colSpan={4} />
              <td className="px-1 py-3 text-right">합계</td>
              <td className="px-1 py-3 text-right whitespace-nowrap">{formatStandardQuoteCurrency(quote.grandTotalAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-10 border-b border-black pb-2 text-[12px] font-medium text-black">&gt;기타사항</div>
        <div className="pt-2 whitespace-pre-line text-[12px] leading-6 text-black">
          {quote.generalNotes || " "}
        </div>

        {quote.specialTerms && (
          <div className="mt-6 border-t border-black pt-3 whitespace-pre-line text-[12px] leading-6 text-black">
            {quote.specialTerms}
          </div>
        )}
      </div>
        </div>{/* end scale wrapper */}
        </div>{/* end flex center */}
      </div>{/* end scrollable area */}
    </aside>
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
  prefill = null,
}: QuickQuoteComposerProps) {
  const today = getTodayDateValue()
  const isPortalApi = apiBase === "/api/portal"
  const [portalMounted, setPortalMounted] = useState(false)
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [deals, setDeals] = useState<DealListItem[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new")
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerContactName, setNewCustomerContactName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [customerQuery, setCustomerQuery] = useState("")
  const [selectedDealId, setSelectedDealId] = useState("")
  const [newDealTitle, setNewDealTitle] = useState("")
  const [templateId, setTemplateId] = useState<StandardQuoteTemplateId>("board_86")
  const [optionSelections, setOptionSelections] = useState<StandardQuoteOptionSelections>(
    getStandardQuoteDefaultSelections("board_86")
  )
  const [quote, setQuote] = useState<PartnerQuoteDetailsInput>(
    buildConfigurableStandardQuoteDetails({
      templateId: "board_86",
      input: {
        issuedAt: today,
        validUntil: addDays(today, 7),
        recipientCompanyName: "",
      },
      optionSelections: getStandardQuoteDefaultSelections("board_86"),
    })
  )
  const [submittingAction, setSubmittingAction] = useState<CreateAction | null>(null)
  const [reuseLoadingId, setReuseLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareSheet, setShareSheet] = useState<ShareSheetState | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [saveToast, setSaveToast] = useState(false)
  const [errorToast, setErrorToast] = useState<ErrorToastState | null>(null)
  // 공급자 담당자 override. 비우면 공급자 블록 기본값(SW=클래스인 매니저, HW=퀴드러닝 담당자)을 쓴다.
  const [managerContactName, setManagerContactName] = useState("")
  const [managerContactPhone, setManagerContactPhone] = useState("")
  const [managerSelection, setManagerSelection] = useState("")
  // 정보 라인(금액 없는 note_only) 인라인 추가 폼
  const [noteLineOpen, setNoteLineOpen] = useState(false)
  const [noteLineTitle, setNoteLineTitle] = useState("")
  const [noteLineText, setNoteLineText] = useState("")

  const isSoftwareQuote = isSoftwareQuoteTemplate(templateId)
  const activeProductLine: QuoteProductLine = isSoftwareQuote ? "software" : "hardware"
  const activeTemplateLabel = getStandardQuoteTemplate(templateId).label
  const supplierFamilyRef = useRef(isSoftwareQuote)
  // HW 로 돌아올 때 직전에 쓰던 HW 템플릿을 복원한다(전자칠판 75"였다면 그대로).
  const lastHardwareTemplateRef = useRef<StandardQuoteTemplateId>(
    isSoftwareQuote ? DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID : templateId
  )

  useEffect(() => {
    if (!isSoftwareQuoteTemplate(templateId)) {
      lastHardwareTemplateRef.current = templateId
    }
  }, [templateId])

  /** 헤더 세그먼트: 제품군 전환. 품목은 템플릿 기준으로 재생성되고 고객·거래 입력은 유지된다. */
  function handleProductLineChange(nextLine: QuoteProductLine) {
    if (nextLine === activeProductLine) return
    const nextTemplateId =
      nextLine === "software"
        ? getQuoteProductLineTemplateId("software")
        : lastHardwareTemplateRef.current
    updateTemplateShortcut(
      nextTemplateId,
      getStandardQuoteDefaultSelections(nextTemplateId),
      1
    )
  }

  // 공급자 블록이 바뀌면(SW 클래스인 ↔ HW 퀴드러닝) 담당자 override 를 비워
  // 새 블록의 기본 담당자로 되돌린다. SW 명의가 HW 견적에 새어 나가지 않게 하는 가드.
  useEffect(() => {
    if (supplierFamilyRef.current === isSoftwareQuote) return
    supplierFamilyRef.current = isSoftwareQuote
    setManagerContactName("")
    setManagerContactPhone("")
    setManagerSelection("")
  }, [isSoftwareQuote])

  useEffect(() => {
    if (typeof window === "undefined") return
    // SW 견적만 클래스인 명의라 로그인 관리자를 자동 채운다.
    // HW는 퀴드러닝 담당자가 기본값이므로 비워둔 채로 시작한다(기존 발행물과 동일).
    if (!isSoftwareQuote) return
    const adminName = window.sessionStorage.getItem("admin_name")
    if (adminName) setManagerContactName((prev) => prev || adminName)
  }, [isSoftwareQuote])

  const managerOptions = useMemo(() => supplierManagerOptions ?? [], [supplierManagerOptions])
  const hasManagerOptions = managerOptions.length > 0
  const managerManualMode = !hasManagerOptions || managerSelection === MANAGER_CUSTOM_VALUE

  const supplierDefaults = useMemo(() => resolveQuoteSupplier(templateId), [templateId])
  // 공급자 블록은 템플릿이 정하고(SW=클래스인 / HW=퀴드러닝), 담당자·연락처만 작성자가 덮어쓴다.
  const resolvedSupplier = useMemo(
    () => ({
      ...supplierDefaults,
      supplierContactName: managerContactName.trim() || supplierDefaults.supplierContactName,
      supplierContactPhone: managerContactPhone.trim() || supplierDefaults.supplierContactPhone,
    }),
    [supplierDefaults, managerContactName, managerContactPhone],
  )

  // 목록이 도착하면 현재 담당자명을 드롭다운 값과 한 번 맞춘다(사용자가 고르면 그 값을 유지).
  useEffect(() => {
    if (!hasManagerOptions || managerSelection) return
    const current = managerContactName.trim()
    if (!current) return
    const matched = managerOptions.find((option) => option.name === current)
    setManagerSelection(matched ? matched.name : MANAGER_CUSTOM_VALUE)
  }, [hasManagerOptions, managerContactName, managerOptions, managerSelection])

  function handleManagerSelectionChange(value: string) {
    setManagerSelection(value)
    if (value === MANAGER_CUSTOM_VALUE) return
    if (!value) {
      // "기본 담당자" — override 를 비워 공급자 블록 기본값으로 되돌린다.
      setManagerContactName("")
      setManagerContactPhone("")
      return
    }
    const option = managerOptions.find((item) => item.name === value)
    if (!option) return
    setManagerContactName(option.name)
    if (option.phone?.trim()) setManagerContactPhone(option.phone.trim())
  }
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const errorToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 프리필은 이번 open 세션에서 한 번만 적용한다(사용자가 이후 수동 변경하면 덮어쓰지 않음).
  const prefillAppliedRef = useRef(false)
  const hasPrefillTarget = Boolean(prefill?.dealId || prefill?.customerId)

  useEffect(() => {
    setPortalMounted(true)
  }, [])

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

  const sortedCustomers = useMemo(
    () => [...customers].sort((left, right) => left.customer.name.localeCompare(right.customer.name, "ko")),
    [customers]
  )
  const visibleCustomers = useMemo(() => {
    const normalizedQuery = customerQuery.trim().toLowerCase()
    if (!normalizedQuery) return sortedCustomers

    const matches = sortedCustomers.filter((item) =>
      [
        item.customer.name,
        item.customer.campus_name,
        item.customer.region_label,
        item.customer.contact_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    )
    const selected = sortedCustomers.find((item) => item.customer.id === selectedCustomerId)
    if (selected && !matches.some((item) => item.customer.id === selected.customer.id)) {
      return [selected, ...matches]
    }
    return matches
  }, [customerQuery, selectedCustomerId, sortedCustomers])
  const selectedCustomer = sortedCustomers.find((item) => item.customer.id === selectedCustomerId)?.customer ?? null
  const fallbackExistingCustomer = selectedCustomer ?? sortedCustomers[0]?.customer ?? null
  const availableDeals = useMemo(
    () =>
      customerMode === "existing" && selectedCustomerId
        ? deals.filter((deal) => deal.customer_id === selectedCustomerId)
        : [],
    [customerMode, deals, selectedCustomerId]
  )
  const selectedDeal = selectedDealId
    ? deals.find((deal) => deal.id === selectedDealId) ?? null
    : null
  const selectedCustomerName = fallbackExistingCustomer?.name ?? null
  const totals = calculateStandardQuoteTotals(quote.lineItems, quote.vatIncluded ?? true)
  const baseLine = getBaseLine(quote)
  const baseQuantity = Math.max(1, Number(baseLine?.quantity ?? 1))
  const lineItemCount = quote.lineItems?.length ?? 0
  const activeCustomerName =
    customerMode === "existing" ? selectedCustomerName ?? "" : newCustomerName.trim()
  const activeDealTitle = selectedDeal?.title ?? (newDealTitle.trim() || "새 거래 자동 생성")
  const optionGroups = getStandardQuoteOptionGroups(templateId)
  const bundlePreset =
    getStandardQuoteQuickPresets("board_86").find((preset) => preset.id === "board_86_bundle") ?? null
  const hasNoExpiration = !quote.validUntil
  const validityPresetValue = hasNoExpiration
    ? "none"
    : [7, 14, 30].find((days) => quote.validUntil === addDays(quote.issuedAt || today, days))?.toString() ??
      "custom"
  const isBundleSelected =
    templateId === "board_86" &&
    optionSelections.camera_bundle === true &&
    optionSelections.mounting_option === "wall_mount"
  const customerReady =
    customerMode === "existing" ? Boolean(fallbackExistingCustomer) : newCustomerName.trim().length > 0
  const canCreateQuote = customerReady && lineItemCount > 0
  const quantityUnitLabel =
    templateId === "online_suite" ? "월" : templateId === "recording_studio" ? "세트" : "대"
  const quantityHeading =
    templateId === "online_suite" ? "구독 수량" : templateId === "recording_studio" ? "세트 수량" : "본체 수량"
  const readyChecks = [
    { label: "고객", value: activeCustomerName || "미선택", done: customerReady },
    { label: "거래", value: activeDealTitle, done: true },
    { label: "품목", value: `${lineItemCount}개 · 대표 ${baseQuantity}${quantityUnitLabel}`, done: lineItemCount > 0 },
    {
      label: "총액",
      value: `${formatStandardQuoteCurrency(totals.grandTotalAmount)}원`,
      done: totals.grandTotalAmount > 0,
    },
  ]
  const readyCheckCount = readyChecks.filter((item) => item.done).length

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
      setSelectedCustomerId((current) => current || nextCustomers[0]?.customer.id || "")
      if (customerResult.status === "rejected" || dealResult.status === "rejected") {
        setError("고객 또는 거래 목록 일부를 불러오지 못했습니다. 최근 견적 복제는 사용할 수 있지만 선택지가 완전하지 않을 수 있습니다.")
      }
      setLoadingOptions(false)
    })

    return () => {
      alive = false
    }
  }, [apiBase, open])

  useEffect(() => {
    if (!open) return
    // 딜/고객 컨텍스트에서 진입하면 "기존 고객" 모드로 시작해 프리필 적용 후 목록에서 선택한다.
    prefillAppliedRef.current = false
    setCustomerMode(hasPrefillTarget ? "existing" : "new")
    setSelectedCustomerId(prefill?.customerId ?? "")
    // 신규 고객 모드(딜/고객 타깃 없음)로 진입하면 customerName 프리필을 이름 필드에 1회 채운다.
    // 사용자가 이후 수정하면 이 open 세션 동안 덮어쓰지 않는다.
    setNewCustomerName(hasPrefillTarget ? "" : prefill?.customerName?.trim() ?? "")
    setNewCustomerContactName("")
    setNewCustomerPhone("")
    setCustomerQuery("")
    setSelectedDealId(prefill?.dealId ?? "")
    setNewDealTitle("")
    setTemplateId(initialTemplateId)
    const defaultSelections = getStandardQuoteDefaultSelections(initialTemplateId)
    setOptionSelections(defaultSelections)
    setQuote(
      buildConfigurableStandardQuoteDetails({
        templateId: initialTemplateId,
        input: {
          issuedAt: today,
          validUntil: addDays(today, 7),
          recipientCompanyName: "",
        },
        optionSelections: defaultSelections,
      })
    )
    setSubmittingAction(null)
    setReuseLoadingId(null)
    setShareSheet(null)
    setLinkCopied(false)
    setSaveToast(false)
    setErrorToast(null)
    setMobilePreviewOpen(false)
    setNoteLineOpen(false)
    setNoteLineTitle("")
    setNoteLineText("")
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

    if (prefill?.dealId) {
      const deal = deals.find((item) => item.id === prefill.dealId)
      if (deal) {
        prefillAppliedRef.current = true
        setCustomerMode("existing")
        setSelectedCustomerId(deal.customer_id)
        setSelectedDealId(deal.id)
        return
      }
      // 딜이 아직 안 보이면 다음 로드까지 대기(적용 마킹하지 않음).
      return
    }

    if (prefill?.customerId) {
      const customer = customers.find((item) => item.customer.id === prefill.customerId)
      if (customer) {
        prefillAppliedRef.current = true
        setCustomerMode("existing")
        setSelectedCustomerId(customer.customer.id)
        setSelectedDealId("")
      }
    }
  }, [customers, deals, hasPrefillTarget, loadingOptions, open, prefill?.customerId, prefill?.dealId])

  useEffect(() => {
    if (!open || customerMode !== "existing") return
    if (hasPrefillTarget && !prefillAppliedRef.current) return
    if (!selectedCustomerId && sortedCustomers[0]?.customer.id) {
      setSelectedCustomerId(sortedCustomers[0].customer.id)
    }
  }, [customerMode, hasPrefillTarget, open, selectedCustomerId, sortedCustomers])

  useEffect(() => {
    if (!open) return

    if (customerMode === "existing" && !selectedCustomerName) return

    const recipientName = customerMode === "existing" ? selectedCustomerName || "" : newCustomerName || ""
    const recipientContactName = customerMode === "new" ? newCustomerContactName.trim() : quote.recipientContactName
    const recipientPhone = customerMode === "new" ? newCustomerPhone.trim() : quote.recipientPhone

    setQuote((current) =>
      current.recipientCompanyName === recipientName &&
      current.recipientContactName === recipientContactName &&
      current.recipientPhone === recipientPhone
        ? current
        :
      finalizeStandardQuoteDetails(
        {
          ...current,
          recipientCompanyName: recipientName,
          recipientContactName,
          recipientPhone,
        },
        templateId
      )
    )
  }, [customerMode, newCustomerContactName, newCustomerName, newCustomerPhone, open, quote.recipientContactName, quote.recipientPhone, selectedCustomerName, templateId])

  useEffect(() => {
    if (!open || customerMode !== "existing") return
    // 프리필이 아직 목록에서 딜/고객을 확정하기 전에는 시드된 selectedDealId를 지우지 않는다.
    if (hasPrefillTarget && !prefillAppliedRef.current) return
    if (selectedDealId && !availableDeals.some((deal) => deal.id === selectedDealId)) {
      setSelectedDealId("")
    }
  }, [availableDeals, customerMode, hasPrefillTarget, open, selectedDealId])

  function rebuildQuote(next: {
    templateId?: StandardQuoteTemplateId
    optionSelections?: StandardQuoteOptionSelections
    baseQuantity?: number
    patch?: Partial<PartnerQuoteDetailsInput>
  }) {
    const nextTemplateId = next.templateId ?? templateId
    const nextSelections = next.optionSelections ?? optionSelections

    setQuote((current) =>
      buildConfigurableStandardQuoteDetails({
        templateId: nextTemplateId,
        input: {
          ...current,
          ...next.patch,
          templateId: nextTemplateId,
          optionSelections: nextSelections,
        },
        optionSelections: nextSelections,
        baseQuantity: next.baseQuantity ?? getBaseLine(current)?.quantity,
      })
    )
  }

  function updateTemplateShortcut(
    nextTemplateId: StandardQuoteTemplateId,
    nextSelections: StandardQuoteOptionSelections,
    nextBaseQuantity: number,
    presetId?: string
  ) {
    setTemplateId(nextTemplateId)
    setOptionSelections(nextSelections)
    rebuildQuote({
      templateId: nextTemplateId,
      optionSelections: nextSelections,
      baseQuantity: nextBaseQuantity,
      patch: {
        templateId: nextTemplateId,
        presetId,
      },
    })
  }

  function setValidityDays(days: number | null) {
    setQuote((current) =>
      finalizeStandardQuoteDetails(
        {
          ...current,
          validUntil: days == null ? undefined : addDays(current.issuedAt || today, days),
        },
        templateId
      )
    )
  }

  function handleQuickAdd(itemId: QuickAddRailItemId) {
    if (itemId === "recording_studio") {
      const preset = getStandardQuoteQuickPresets("recording_studio")[0]
      const nextSelections = {
        ...getStandardQuoteDefaultSelections("recording_studio"),
        ...(preset?.optionSelections ?? {}),
      }
      updateTemplateShortcut("recording_studio", nextSelections, 1, preset?.id ?? "recording_studio_default")
      return
    }

    if (itemId === "online_suite") {
      const preset = getStandardQuoteQuickPresets("online_suite")[0]
      const nextSelections = {
        ...getStandardQuoteDefaultSelections("online_suite"),
        ...(preset?.optionSelections ?? {}),
      }
      updateTemplateShortcut("online_suite", nextSelections, 1, preset?.id ?? "online_suite_default")
      return
    }

    if (itemId === "board_86") {
      if (templateId === "board_86" && !isBundleSelected) {
        rebuildQuote({ baseQuantity: baseQuantity + 1, patch: { presetId: undefined } })
        return
      }

      updateTemplateShortcut(
        "board_86",
        getStandardQuoteDefaultSelections("board_86"),
        templateId === "board_86" ? baseQuantity : 1
      )
      return
    }

    if (itemId === "board_75") {
      if (templateId === "board_75") {
        rebuildQuote({ baseQuantity: baseQuantity + 1, patch: { presetId: undefined } })
        return
      }

      updateTemplateShortcut(
        "board_75",
        getStandardQuoteDefaultSelections("board_75"),
        1
      )
      return
    }

    if (itemId === "camera_t1") {
      if (templateId === "camera_t1") {
        rebuildQuote({ baseQuantity: baseQuantity + 1, patch: { presetId: undefined } })
        return
      }

      updateTemplateShortcut(
        "camera_t1",
        getStandardQuoteDefaultSelections("camera_t1"),
        1
      )
      return
    }

    if (itemId === "bundle_86_t1_wall") {
      if (isBundleSelected) {
        rebuildQuote({
          baseQuantity: baseQuantity + 1,
          patch: { presetId: bundlePreset?.id ?? "board_86_bundle" },
        })
        return
      }

      updateTemplateShortcut(
        "board_86",
        {
          ...getStandardQuoteDefaultSelections("board_86"),
          ...(bundlePreset?.optionSelections ?? {}),
        },
        templateId === "board_86" ? baseQuantity : 1,
        bundlePreset?.id ?? "board_86_bundle"
      )
      return
    }

    const boardTemplateId: StandardQuoteTemplateId =
      templateId === "board_75" ? "board_75" : "board_86"
    const nextSelections: StandardQuoteOptionSelections = {
      ...getStandardQuoteDefaultSelections(boardTemplateId),
      ...(boardTemplateId === templateId ? optionSelections : {}),
      mounting_option: itemId === "stand" ? "stand" : "wall_mount",
    }

    updateTemplateShortcut(
      boardTemplateId,
      nextSelections,
      boardTemplateId === templateId ? baseQuantity : 1
    )
  }

  function updateLine(
    lineIndex: number,
    patch: Partial<PartnerQuoteLineItemInput>
  ) {
    setQuote((current) => {
      const currentItems = current.lineItems ?? []
      const target = currentItems[lineIndex]
      if (!target) return current

      if (target.optionGroupId === "main_product" && patch.quantity != null) {
        return buildConfigurableStandardQuoteDetails({
          templateId,
          input: {
            ...current,
            optionSelections,
          },
          optionSelections,
          baseQuantity: Math.max(1, Math.round(Number(patch.quantity) || 1)),
        })
      }

      const nextItems = currentItems.map((item, index) =>
        index === lineIndex ? { ...item, ...patch } : item
      )

      return finalizeStandardQuoteDetails(
        {
          ...current,
          lineItems: nextItems,
        },
        templateId
      )
    })
  }

  /** 금액 없는 정보 라인 추가(스키마 그대로 note_only + informational). */
  function addInformationalLine() {
    const itemName = noteLineTitle.trim()
    const itemDescription = noteLineText.trim()
    if (!itemName && !itemDescription) return

    setQuote((current) => {
      const items = current.lineItems ?? []
      return finalizeStandardQuoteDetails(
        {
          ...current,
          lineItems: renumberLineItems([
            ...items,
            createInformationalQuoteLine({
              itemName,
              itemDescription,
              sortOrder: items.length + 1,
            }),
          ]),
        },
        templateId
      )
    })

    setNoteLineTitle("")
    setNoteLineText("")
    setNoteLineOpen(false)
  }

  function removeLine(lineIndex: number) {
    setQuote((current) => {
      const items = current.lineItems ?? []
      if (!items[lineIndex]) return current
      return finalizeStandardQuoteDetails(
        {
          ...current,
          // finalize 는 기존 lineNumber 를 존중하므로 삭제 후 번호를 다시 매긴다(미리보기 번호 구멍 방지).
          lineItems: renumberLineItems(items.filter((_, index) => index !== lineIndex)),
        },
        templateId
      )
    })
  }

  function nudgeLineQuantity(lineIndex: number, delta: number) {
    const target = quote.lineItems?.[lineIndex]
    if (!target) return
    if (target.quantityLocked === true && target.optionGroupId !== "main_product") return

    const nextQuantity = Math.max(1, Math.round(Number(target.quantity ?? 1)) + delta)
    updateLine(lineIndex, { quantity: nextQuantity })
  }

  async function handleReuseQuote(quoteId: string) {
    setReuseLoadingId(quoteId)
    setError(null)

    try {
      const response = await portalFetch(`${apiBase}/quotes/${quoteId}`)
      if (!response.ok) {
        throw new Error("기존 견적을 불러오지 못했습니다.")
      }

      const payload = (await response.json()) as QuoteFetchPayload
      const normalized = normalizeQuoteDetailsFromStructuredJson(payload.version?.structured_json, {
        customerName: payload.deal.customer_name,
        validUntil: payload.version?.valid_until,
      })
      const nextTemplateId = inferStandardQuoteTemplateId(normalized)
      const nextSelections =
        (normalized.optionSelections as StandardQuoteOptionSelections | undefined) ??
        getStandardQuoteDefaultSelections(nextTemplateId)

      setCustomers((current) => {
        if (current.some((item) => item.customer.id === payload.deal.customer_id)) {
          return current
        }

        return [
          {
            customer: {
              id: payload.deal.customer_id,
              partner_account_id: payload.deal.partner_account_id,
              name: payload.deal.customer_name ?? normalized.recipientCompanyName ?? "고객사",
              contact_name: payload.deal.customer_contact_name,
              email: null,
              phone: null,
              address: null,
              business_number: null,
              campus_name: payload.deal.customer_campus_name,
              region_label: payload.deal.customer_region_label,
              notes: null,
              created_by: null,
              created_at: payload.deal.created_at,
              updated_at: payload.deal.updated_at,
            },
            summary: null,
          },
          ...current,
        ]
      })
      setDeals((current) => {
        if (current.some((deal) => deal.id === payload.deal.id)) {
          return current
        }

        return [payload.deal, ...current]
      })
      setTemplateId(nextTemplateId)
      setOptionSelections(nextSelections)
      setCustomerMode("existing")
      setSelectedCustomerId(payload.deal.customer_id)
      setSelectedDealId(payload.deal.id)
      setNewDealTitle(payload.deal.title)
      setQuote(
        finalizeStandardQuoteDetails(
          {
            ...normalized,
            templateId: nextTemplateId,
            optionSelections: nextSelections,
            issuedAt: today,
            validUntil: normalized.validUntil ?? undefined,
            generatedFromVersionId: payload.version?.id,
            recipientCompanyName: payload.deal.customer_name ?? normalized.recipientCompanyName,
          },
          nextTemplateId
        )
      )
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

  // created: 이번 호출에서 고객을 새로 만들었는지(부분 실패 시 롤백 대상 판단용).
  async function resolveCustomer(): Promise<{ customer: ResolvedCustomer; created: boolean }> {
    if (customerMode === "existing") {
      if (fallbackExistingCustomer) {
        return {
          customer: {
            id: fallbackExistingCustomer.id,
            name: fallbackExistingCustomer.name,
            partnerAccountId: fallbackExistingCustomer.partner_account_id,
          },
          created: false,
        }
      }

      throw new Error("고객사를 선택해 주세요.")
    }

    const name = newCustomerName.trim()
    if (!name) {
      throw new Error("고객사 이름을 입력해 주세요.")
    }

    const requestBody: {
      name: string
      contact_name?: string
      phone?: string
      partner_account_id?: string
    } = { name }
    if (newCustomerContactName.trim()) {
      requestBody.contact_name = newCustomerContactName.trim()
    }
    if (newCustomerPhone.trim()) {
      requestBody.phone = newCustomerPhone.trim()
    }
    if (isPortalApi && portalPartnerAccountId) {
      const partnerAccountId = portalPartnerAccountId
      requestBody.partner_account_id = partnerAccountId
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

    const listItem: CustomerListItem = {
      customer: payload.customer,
      summary: null,
    }

    return {
      customer: {
        id: payload.customer.id,
        name: payload.customer.name,
        partnerAccountId: payload.customer.partner_account_id ?? portalPartnerAccountId,
        listItem,
      },
      created: true,
    }
  }

  // created: 이번 호출에서 딜을 새로 만들었는지(부분 실패 시 롤백 대상 판단용).
  async function resolveDeal(customer: ResolvedCustomer) {
    const existingDeal =
      selectedDealId && deals.find((deal) => deal.id === selectedDealId && deal.customer_id === customer.id)

    if (existingDeal) {
      return { deal: existingDeal, created: false }
    }

    const title =
      newDealTitle.trim() ||
      buildDefaultDealTitle({
        templateId,
        quantity: baseQuantity,
        customerName: customer.name,
      })
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
      expected_amount: quote.grandTotalAmount ?? 0,
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
    setNewCustomerName("")
    setNewCustomerContactName("")
    setNewCustomerPhone("")
    setNewDealTitle("")
  }

  async function handleSubmit(action: CreateAction) {
    if (submittingAction) return

    const previewWindow = action === "save_and_preview" ? prepareQuotePreviewWindow() : null
    setSubmittingAction(action)
    setError(null)

    // 부분 실패 시 이번 시도에서 새로 만든 딜/고객을 정리하기 위한 추적.
    let createdCustomerId: string | null = null
    let createdDealId: string | null = null
    let quoteCreated = false

    try {
      const { customer, created: customerCreated } = await resolveCustomer()
      if (customerCreated) createdCustomerId = customer.id
      const { deal, created: dealCreated } = await resolveDeal(customer)
      if (dealCreated) createdDealId = deal.id
      const preparedQuote = finalizeStandardQuoteDetails(
        {
          ...quote,
          ...resolvedSupplier,
          templateId,
          optionSelections,
          recipientCompanyName: customer.name,
          issuedAt: quote.issuedAt || today,
          validUntil: quote.validUntil ?? undefined,
        },
        templateId
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

      // 견적 문서가 생겼으니 이후 실패(공유 등)에서는 딜/고객을 롤백하지 않는다.
      quoteCreated = true
      rememberResolvedCustomerAndDeal(customer, deal)

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

          if (action === "save_and_preview") {
            openQuotePreviewUrl(shareUrl, previewWindow)
          }

          if (action === "save_and_send") {
            setShareSheet({
              url: shareUrl,
              quoteNumber: payload.document.quote_number,
              customerName: customer.name,
            })
            setLinkCopied(false)
          }
        } catch (shareIssue) {
          if (previewWindow && !previewWindow.closed) {
            previewWindow.close()
          }
          shareError =
            shareIssue instanceof Error
              ? shareIssue.message
              : "공유 링크 생성에 실패했습니다."
          const message = `견적서는 저장했지만 ${shareError}`
          setError(message)
          showErrorToast(message, "발송 준비 실패")
        }
      }

      await onCreated({
        action,
        templateId,
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

      if (action === "save") {
        // 임시저장 → 토스트 표시, 모달 유지
        setSaveToast(true)
        setTimeout(() => setSaveToast(false), 2000)
      } else if (action === "save_and_preview") {
        // 미리보기 → 모달 닫기 (새 탭은 이미 열림)
        onOpenChange(false)
      }
      // save_and_send → 공유 시트 유지
    } catch (submitError) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close()
      }
      // 견적 생성 전 실패라면 이번 시도에서 새로 만든 딜/고객을 정리한다
      // (best-effort — 브라우저 종료 등은 커버하지 못한다).
      if (!quoteCreated) {
        void cleanupCreatedEntities(createdDealId, createdCustomerId)
      }
      const message = getQuoteSubmitErrorMessage(submitError)
      setError(message)
      showErrorToast(message)
    } finally {
      setSubmittingAction(null)
    }
  }

  if (!open || !portalMounted) return null

  return createPortal(
    <div
      data-testid="quick-quote-composer-overlay"
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[#111110]/42 p-0 backdrop-blur-[3px] sm:p-4 lg:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-quote-composer-title"
        className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-[rgba(255,255,255,0.25)] bg-white shadow-[0_24px_80px_rgba(17,17,16,0.28)] sm:h-[min(860px,calc(100dvh-48px))] sm:max-h-[calc(100dvh-32px)] sm:max-w-[1480px] sm:rounded-2xl xl:rounded-[24px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#ecebe6] px-4 py-3 sm:px-5 lg:px-6">
          <div className="min-w-0">
            <h2 id="quick-quote-composer-title" className="flex items-center gap-2 text-lg font-semibold text-[#111110]">
              <Sparkles className="h-4 w-4 text-[#084734]" />
              {isSoftwareQuote ? "SW 견적서 작성" : "HW 견적서 작성"}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="견적 유형"
                className="inline-flex items-center rounded-full border border-black/[0.08] bg-[#fafaf8] p-0.5"
              >
                {(
                  [
                    { line: "software" as const, label: "소프트웨어" },
                    { line: "hardware" as const, label: "하드웨어" },
                  ]
                ).map((item) => {
                  const active = activeProductLine === item.line
                  return (
                    <button
                      key={item.line}
                      type="button"
                      onClick={() => handleProductLineChange(item.line)}
                      aria-pressed={active}
                      className={`h-7 rounded-full px-3 text-[11px] font-semibold transition-colors ${
                        active ? "bg-white text-[#111110] shadow-sm" : "text-[#615D59] hover:text-[#111110]"
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
              <span className="truncate text-[11px] text-[#A39E98]">
                {isSoftwareQuote ? "공급자 클래스인" : "공급자 퀴드러닝"} · {activeTemplateLabel} · 유형을 바꾸면 품목만 템플릿 기준으로 다시 잡히고 고객·거래 입력은 유지됩니다.
              </span>
            </div>
          </div>
          <button
            type="button"
            title="닫기"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-md border border-[#e8e8e4] p-2 text-[#615D59] hover:bg-[#f6f5f2] hover:text-[#111110]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#ecebe6] bg-[#fafaf8] px-4 py-2 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="admin-scroll-snap-x no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1 xl:flex-1 xl:flex-wrap xl:overflow-visible xl:pb-0">
              <div className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1">
                <span className="text-[11px] font-bold text-[#084734]">
                  {isSoftwareQuote ? "SW 견적" : "HW 견적"}
                </span>
                <span className="max-w-[150px] truncate text-xs font-semibold text-[#111110]">
                  {activeTemplateLabel}
                </span>
              </div>
              {readyChecks.map((item) => (
                <div
                  key={item.label}
                  className="flex min-h-8 shrink-0 items-center gap-2 rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      item.done ? "bg-[#084734] text-white" : "bg-[#f6f5f2] text-[#A39E98]"
                    }`}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className="text-[11px] font-medium text-[#1a1a1a]/45">{item.label}</span>
                  <span className="max-w-[150px] truncate text-xs font-semibold text-[#111110]">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#615D59] ring-1 ring-[#e8e8e4]">
                준비 {readyCheckCount}/{readyChecks.length}
              </span>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-xs font-medium text-[#615D59] transition-colors hover:text-[#111110] xl:hidden"
              >
                <Eye className="h-3.5 w-3.5" />
                화면 미리보기
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(520px,560px)]">
          <div className="min-h-0 overflow-y-auto bg-[#fafaf8] px-4 py-4 sm:px-5 lg:px-6">
            <div className="space-y-3">
              {recentQuotes.length > 0 && (
              <section className={COMPACT_CARD_CLASS}>
                <SectionHeading
                  step="00"
                  title="최근 견적 복제"
                  hint="이전 견적을 불러와 고객사만 바꿉니다"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        const defaultSelections = getStandardQuoteDefaultSelections(templateId)
                        setOptionSelections(defaultSelections)
                        setQuote(
                          buildConfigurableStandardQuoteDetails({
                            templateId,
                            input: {
                              ...quote,
                              issuedAt: today,
                              validUntil: quote.validUntil || addDays(today, 7),
                              generatedFromVersionId: undefined,
                            },
                            optionSelections: defaultSelections,
                          })
                        )
                      }}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-black/[0.08] bg-white px-2.5 text-[11px] font-medium text-[#615D59] transition-colors hover:text-[#111110]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      초기화
                    </button>
                  }
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {recentQuotes.slice(0, 5).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          void handleReuseQuote(item.id)
                        }}
                        disabled={reuseLoadingId === item.id}
                        className={`${COMPACT_CHIP_CLASS} border-black/[0.08] bg-white text-[#615D59] hover:border-[#BDEFD8] hover:bg-[#ECFDF5] disabled:opacity-60`}
                      >
                        <span className="font-medium text-[#111110]">
                          {reuseLoadingId === item.id ? "불러오는 중..." : item.customerName}
                        </span>
                        <span className="max-w-[140px] truncate text-[11px] text-[#A39E98]">
                          {item.currentVersionLabel ?? item.title}
                        </span>
                      </button>
                    ))}
                </div>
              </section>
              )}

              <section className={COMPACT_CARD_CLASS}>
                <SectionHeading step="01" title="고객 · 거래" hint="누구에게 보내는 견적인지" />
                <div className="mt-2.5 grid gap-2.5 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel required>고객사</FieldLabel>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerMode("new")
                          setSelectedDealId("")
                        }}
                        className={`h-7 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
                          customerMode === "new"
                            ? "bg-[#111110] text-white"
                            : "bg-[#f6f5f2] text-[#615D59] hover:text-[#111110]"
                        }`}
                      >
                        바로 입력
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomerMode("existing")}
                        className={`h-7 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
                          customerMode === "existing"
                            ? "bg-[#111110] text-white"
                            : "bg-[#f6f5f2] text-[#615D59] hover:text-[#111110]"
                        }`}
                      >
                        기존 고객
                      </button>
                    </div>
                  </div>
                  {customerMode === "existing" ? (
                    <div className="grid gap-1.5">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
                        <input
                          value={customerQuery}
                          onChange={(event) => setCustomerQuery(event.target.value)}
                          placeholder="고객사, 캠퍼스, 지역 검색"
                          className="h-9 w-full rounded-[6px] border border-[#E5E5E0] bg-white pl-8 pr-3 text-[13px] outline-none transition-colors placeholder:text-[#A39E98] focus-visible:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/20"
                        />
                      </label>
                      <select
                        value={selectedCustomerId}
                        disabled={loadingOptions}
                        onChange={(event) => {
                          setSelectedCustomerId(event.target.value)
                          setSelectedDealId("")
                        }}
                        className={COMPACT_SELECT_CLASS}
                      >
                        {sortedCustomers.length === 0 ? (
                          <option value="">등록된 고객이 없습니다</option>
                        ) : visibleCustomers.length === 0 ? (
                          <option value="">검색 결과가 없습니다</option>
                        ) : (
                          visibleCustomers.map((item) => (
                            <option key={item.customer.id} value={item.customer.id}>
                              {item.customer.name}
                              {item.customer.campus_name ? ` (${item.customer.campus_name})` : ""}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      <Input
                        value={newCustomerName}
                        onChange={(event) => setNewCustomerName(event.target.value)}
                        placeholder="학원/기관명 입력"
                        className={COMPACT_INPUT_CLASS}
                      />
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        <Input
                          value={newCustomerContactName}
                          onChange={(event) => setNewCustomerContactName(event.target.value)}
                          placeholder="담당자명(선택)"
                          className={COMPACT_INPUT_CLASS}
                        />
                        <Input
                          value={newCustomerPhone}
                          onChange={(event) => setNewCustomerPhone(event.target.value)}
                          placeholder="연락처(선택)"
                          className={COMPACT_INPUT_CLASS}
                        />
                      </div>
                      <p className="text-[11px] text-[#A39E98]">
                        홈페이지 리드가 없어도 저장 시 고객과 거래가 함께 생성됩니다.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="quote-deal">거래 연결</FieldLabel>
                  <select
                    id="quote-deal"
                    value={selectedDealId}
                    disabled={loadingOptions}
                    onChange={(event) => setSelectedDealId(event.target.value)}
                    className={COMPACT_SELECT_CLASS}
                  >
                    <option value="">새 거래로 생성</option>
                    {availableDeals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.title}
                      </option>
                    ))}
                  </select>
                  {!selectedDealId && (
                    <Input
                      value={newDealTitle}
                      onChange={(event) => setNewDealTitle(event.target.value)}
                      placeholder="예: 본관 전자칠판 4대 설치"
                      className={COMPACT_INPUT_CLASS}
                    />
                  )}
                </div>
                </div>
              </section>

              <section className={COMPACT_CARD_CLASS}>
                <SectionHeading
                  step="02"
                  title="구성 · 품목"
                  hint="칩을 눌러 품목을 바꿉니다"
                  required
                  action={
                    <div className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-black/[0.08] bg-white px-1">
                      <button
                        type="button"
                        title={`${quantityHeading} 줄이기`}
                        onClick={() => rebuildQuote({ baseQuantity: Math.max(1, baseQuantity - 1) })}
                        className="rounded-full p-1 text-[#615D59] transition-colors hover:bg-[#f6f5f2] hover:text-[#111110]"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[40px] text-center text-[12px] font-semibold tabular-nums text-[#111110]">
                        {baseQuantity}
                        {quantityUnitLabel}
                      </span>
                      <button
                        type="button"
                        title={`${quantityHeading} 늘리기`}
                        onClick={() => rebuildQuote({ baseQuantity: baseQuantity + 1 })}
                        className="rounded-full p-1 text-[#615D59] transition-colors hover:bg-[#f6f5f2] hover:text-[#111110]"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  }
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {QUICK_ADD_RAIL_ITEMS.map((item) => {
                    const active =
                      (item.id === "recording_studio" && templateId === "recording_studio") ||
                      (item.id === "online_suite" && templateId === "online_suite") ||
                      (item.id === "board_86" && templateId === "board_86" && !isBundleSelected) ||
                      (item.id === "board_75" && templateId === "board_75") ||
                      (item.id === "camera_t1" && templateId === "camera_t1") ||
                      (item.id === "stand" &&
                        (templateId === "board_86" || templateId === "board_75") &&
                        optionSelections.mounting_option === "stand") ||
                      (item.id === "wall_mount" &&
                        (templateId === "board_86" || templateId === "board_75") &&
                        optionSelections.mounting_option === "wall_mount") ||
                      (item.id === "bundle_86_t1_wall" && isBundleSelected)

                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={item.description ? `${item.label} · ${item.description}` : item.label}
                        onClick={() => handleQuickAdd(item.id)}
                        className={`${COMPACT_CHIP_CLASS} ${
                          active
                            ? "border-[#084734] bg-[#ECFDF5]"
                            : "border-black/[0.08] bg-white hover:border-[#BDEFD8] hover:bg-[#f8fbf9]"
                        }`}
                      >
                        <span className="font-semibold text-[#111110]">{item.label}</span>
                        {item.description && (
                          <span className="hidden text-[11px] text-[#A39E98] sm:inline">{item.description}</span>
                        )}
                        <span className="text-[11px] font-medium tabular-nums text-[#615D59]">
                          {formatQuickAddPrice(item.price)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {optionGroups.map((group) => (
                  <div key={group.id} className="rounded-[10px] border border-black/[0.08] bg-[#fbfaf8] p-2.5">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <p className="shrink-0 text-[12px] font-semibold text-[#111110]">{group.label}</p>
                      {group.description && (
                        <p className="truncate text-[11px] text-[#A39E98]">{group.description}</p>
                      )}
                    </div>

                    {group.control === "radio" ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {group.options.map((option) => {
                          const active = optionSelections[group.id] === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                const nextSelections = {
                                  ...optionSelections,
                                  [group.id]: option.value,
                                }
                                setOptionSelections(nextSelections)
                                rebuildQuote({ optionSelections: nextSelections })
                              }}
                              title={option.description}
                              className={`h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                                active
                                  ? "border-[#084734] bg-[#ECFDF5] text-[#111110]"
                                  : "border-black/[0.08] bg-white text-[#615D59] hover:text-[#111110]"
                              }`}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const nextSelections = {
                            ...optionSelections,
                            [group.id]: !(optionSelections[group.id] as boolean | undefined),
                          }
                          setOptionSelections(nextSelections)
                          rebuildQuote({ optionSelections: nextSelections })
                        }}
                        className={`mt-1.5 flex h-8 w-full items-center justify-between gap-2 rounded-full border px-2.5 transition-colors ${
                          optionSelections[group.id]
                            ? "border-[#084734] bg-[#ECFDF5]"
                            : "border-black/[0.08] bg-white"
                        }`}
                      >
                        <span className="truncate text-[11px] text-[#615D59]">
                          {optionSelections[group.id] ? group.enabledLabel ?? "활성" : group.disabledLabel ?? "비활성"}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-[#084734]">
                          {optionSelections[group.id] ? "ON" : "OFF"}
                        </span>
                      </button>
                    )}
                  </div>
                ))}
                </div>

              <details className="mt-2.5 rounded-[10px] border border-black/[0.08] bg-white p-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[12px] font-semibold text-[#111110]">세부 품목 수정</span>
                    <span className="text-[11px] text-[#A39E98]">
                      {lineItemCount}개 품목 · {quote.vatPolicyLabel}
                    </span>
                  </span>
                  <span className="rounded-full bg-[#f6f5f2] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#111110]">
                    {formatStandardQuoteCurrency(totals.grandTotalAmount)}원
                  </span>
                </summary>

                <div className="mt-2 overflow-x-auto rounded-[10px] border border-black/[0.08]">
                  <table className="min-w-[760px] w-full text-[13px]">
                    <thead className="bg-[#f7f6f3] text-[#615D59]">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left text-[11px] font-medium">No</th>
                        <th className="px-2.5 py-1.5 text-left text-[11px] font-medium">품목</th>
                        <th className="px-2.5 py-1.5 text-left text-[11px] font-medium">세부내역</th>
                        <th className="px-2.5 py-1.5 text-right text-[11px] font-medium">단가</th>
                        <th className="px-2.5 py-1.5 text-right text-[11px] font-medium">수량</th>
                        <th className="px-2.5 py-1.5 text-right text-[11px] font-medium">공급가액</th>
                        <th className="w-9 px-1 py-1.5">
                          <span className="sr-only">행 삭제</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quote.lineItems ?? []).map((line, index) => (
                        <tr key={`${line.itemCode ?? line.itemName}-${line.lineNumber}`} className="border-t border-[#f0efea] align-middle">
                          <td className="px-2.5 py-1.5 text-[11px] tabular-nums text-[#A39E98]">{line.lineNumber}</td>
                          <td className="px-2.5 py-1.5 font-medium text-[#111110]">{line.itemName}</td>
                          <td className="px-2.5 py-1.5 text-[11px] text-[#615D59]">{line.itemDescription || "-"}</td>
                          <td className="px-2.5 py-1.5">
                            <div className="ml-auto w-24">
                              <Input
                                type="number"
                                min={0}
                                value={line.unitPrice ?? ""}
                                disabled={line.priceLocked === true}
                                onChange={(event) =>
                                  updateLine(index, { unitPrice: parseNumericInput(event.target.value) })
                                }
                                className="h-8 text-right text-[13px]"
                              />
                            </div>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <div className="ml-auto flex w-[108px] items-center gap-1">
                              <button
                                type="button"
                                title="수량 줄이기"
                                onClick={() => nudgeLineQuantity(index, -1)}
                                disabled={line.quantityLocked === true && line.optionGroupId !== "main_product"}
                                className="shrink-0 rounded-full border border-black/[0.08] p-1 text-[#615D59] hover:bg-[#f6f5f2] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <Input
                                type="number"
                                min={0}
                                value={line.quantity ?? ""}
                                disabled={line.quantityLocked === true}
                                onChange={(event) =>
                                  updateLine(index, { quantity: parseNumericInput(event.target.value) })
                                }
                                className="h-8 px-1 text-center text-[13px]"
                              />
                              <button
                                type="button"
                                title="수량 늘리기"
                                onClick={() => nudgeLineQuantity(index, 1)}
                                disabled={line.quantityLocked === true && line.optionGroupId !== "main_product"}
                                className="shrink-0 rounded-full border border-black/[0.08] p-1 text-[#615D59] hover:bg-[#f6f5f2] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-medium tabular-nums text-[#111110]">
                            {line.lineSupplyAmount == null ? "-" : `${formatStandardQuoteCurrency(line.lineSupplyAmount)}원`}
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            {line.isUserAdded === true && (
                              <button
                                type="button"
                                title="정보 라인 삭제"
                                aria-label={`${line.itemName} 정보 라인 삭제`}
                                onClick={() => removeLine(index)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[#A39E98] transition-colors hover:bg-[#FCE9E9] hover:text-[#B43E3E]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNoteLineOpen((current) => !current)}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-black/[0.14] px-2.5 text-[11px] font-medium text-[#615D59] transition-colors hover:border-[#084734] hover:text-[#084734]"
                  >
                    <Plus className="h-3 w-3" />
                    정보 라인 추가
                  </button>
                  <span className="text-[11px] text-[#A39E98]">금액 없이 안내 문구만 들어가는 행입니다.</span>
                </div>

                {noteLineOpen && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Input
                      value={noteLineTitle}
                      onChange={(event) => setNoteLineTitle(event.target.value)}
                      placeholder="구분(예: 납품 조건)"
                      className="h-8 w-[150px] text-[13px]"
                    />
                    <Input
                      value={noteLineText}
                      onChange={(event) => setNoteLineText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          addInformationalLine()
                        }
                      }}
                      placeholder="세부내역(예: 설치 배송비 포함)"
                      className="h-8 min-w-[180px] flex-1 text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={addInformationalLine}
                      className="inline-flex h-8 shrink-0 items-center rounded-[6px] border border-black/[0.08] bg-white px-3 text-[12px] font-medium text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                    >
                      추가
                    </button>
                  </div>
                )}
              </details>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[10px] border border-black/[0.08] bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#615D59]">
                  <span>공급가 <span className="tabular-nums text-[#111110]">{formatStandardQuoteCurrency(totals.subtotalAmount)}</span></span>
                  <span>VAT <span className="tabular-nums text-[#111110]">{formatStandardQuoteCurrency(totals.vatAmount)}</span></span>
                  <span className="text-[#A39E98]">{quote.vatPolicyLabel}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-semibold text-[#084734]">합계</span>
                  <span className="text-[19px] font-bold leading-none tabular-nums text-[#111110]">
                    {formatStandardQuoteCurrency(totals.grandTotalAmount)}
                  </span>
                  <span className="text-[12px] font-medium text-[#615D59]">원</span>
                </div>
              </div>
              {totals.hasPendingAmounts && (
                <p className="mt-1 text-[11px] leading-5 text-[#B85C33]">{totals.pendingAmountNote}</p>
              )}
              </section>

              <section className={COMPACT_CARD_CLASS}>
                <SectionHeading step="03" title="조건" hint="발행 · 유효기한 · 세금 · 우리 쪽 담당자" />
                <div className="mt-2.5 grid gap-2.5 md:grid-cols-3">
                  <div className="grid gap-1.5">
                    <FieldLabel htmlFor="quote-issued-at">발행일</FieldLabel>
                    <Input
                      id="quote-issued-at"
                      type="date"
                      value={quote.issuedAt ?? ""}
                      onChange={(event) =>
                        setQuote((current) =>
                          finalizeStandardQuoteDetails(
                            {
                              ...current,
                              issuedAt: event.target.value,
                            },
                            templateId
                          )
                        )
                      }
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <FieldLabel htmlFor="quote-valid-until" required>
                      유효기한
                    </FieldLabel>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="quote-valid-until"
                        type="date"
                        disabled={hasNoExpiration}
                        value={quote.validUntil ?? ""}
                        onChange={(event) =>
                          setQuote((current) =>
                            finalizeStandardQuoteDetails(
                              {
                                ...current,
                                validUntil: event.target.value,
                              },
                              templateId
                            )
                          )
                        }
                        className={`${COMPACT_INPUT_CLASS} min-w-0 flex-1`}
                      />
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
                        className={`${COMPACT_SELECT_CLASS} w-[76px] shrink-0 px-1.5`}
                      >
                        <option value="7">7일</option>
                        <option value="14">14일</option>
                        <option value="30">30일</option>
                        <option value="custom">직접</option>
                        <option value="none">없음</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <FieldLabel htmlFor="quote-vat-policy">세금</FieldLabel>
                    <select
                      id="quote-vat-policy"
                      value={(quote.vatIncluded ?? true) ? "included" : "excluded"}
                      onChange={(event) => {
                        const vatIncluded = event.target.value === "included"
                        setQuote((current) =>
                          finalizeStandardQuoteDetails(
                            {
                              ...current,
                              vatIncluded,
                              vatPolicyLabel: undefined,
                            },
                            templateId
                          )
                        )
                      }}
                      className={COMPACT_SELECT_CLASS}
                    >
                      <option value="included">VAT 포함</option>
                      <option value="excluded">VAT 별도</option>
                    </select>
                  </div>

                  <div className="grid gap-1.5">
                    <FieldLabel htmlFor="quote-reference">참조</FieldLabel>
                    <Input
                      id="quote-reference"
                      value={quote.referenceName ?? ""}
                      onChange={(event) =>
                        setQuote((current) =>
                          finalizeStandardQuoteDetails(
                            {
                              ...current,
                              referenceName: event.target.value,
                            },
                            templateId
                          )
                        )
                      }
                      placeholder="예: 담당자명"
                      className={COMPACT_INPUT_CLASS}
                    />
                  </div>

                  <div className="grid gap-1.5 md:col-span-2">
                    <FieldLabel
                      htmlFor="quote-supplier-manager"
                      hint={isSoftwareQuote ? "클래스인 명의" : "퀴드러닝 명의"}
                    >
                      공급자 담당자
                    </FieldLabel>
                    <div className={`grid gap-1.5 ${managerManualMode && hasManagerOptions ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                      {hasManagerOptions && (
                        <select
                          id="quote-supplier-manager"
                          value={managerSelection}
                          onChange={(event) => handleManagerSelectionChange(event.target.value)}
                          className={COMPACT_SELECT_CLASS}
                        >
                          <option value="">
                            {supplierDefaults.supplierContactName
                              ? `기본 담당자 (${supplierDefaults.supplierContactName})`
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
                        <Input
                          value={managerContactName}
                          onChange={(event) => setManagerContactName(event.target.value)}
                          placeholder="담당자명"
                          className={COMPACT_INPUT_CLASS}
                          aria-label="공급자 담당자명"
                        />
                      )}
                      <Input
                        value={managerContactPhone}
                        onChange={(event) => setManagerContactPhone(event.target.value)}
                        placeholder={supplierDefaults.supplierContactPhone || "연락처 (010-0000-0000)"}
                        className={COMPACT_INPUT_CLASS}
                        aria-label="공급자 담당자 연락처"
                      />
                    </div>
                    <p className="text-[11px] text-[#A39E98]">
                      견적서 표기: {resolvedSupplier.supplierContactName || "-"} / {resolvedSupplier.supplierContactPhone || "-"}
                    </p>
                  </div>
                </div>
              </section>

              <section className={COMPACT_CARD_CLASS}>
                <SectionHeading step="04" title="메모" hint="칩을 누르면 아래 메모에 한 줄로 추가됩니다" />
                <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
                  <QuoteNoteField
                    id="quote-general-notes"
                    label="기타사항"
                    group="general"
                    value={quote.generalNotes ?? ""}
                    onChange={(next) =>
                      setQuote((current) =>
                        finalizeStandardQuoteDetails(
                          {
                            ...current,
                            generalNotes: next,
                          },
                          templateId
                        )
                      )
                    }
                  />
                  <QuoteNoteField
                    id="quote-special-terms"
                    label="특약사항"
                    group="special"
                    value={quote.specialTerms ?? ""}
                    placeholder="필요한 경우에만 입력합니다."
                    onChange={(next) =>
                      setQuote((current) =>
                        finalizeStandardQuoteDetails(
                          {
                            ...current,
                            specialTerms: next,
                          },
                          templateId
                        )
                      )
                    }
                  />
                </div>
              </section>

              {loadingOptions && (
                <div className="rounded-[10px] border border-black/[0.08] bg-white px-3 py-2 text-[12px] text-[#615D59]">
                  고객과 거래 데이터를 불러오는 중입니다.
                </div>
              )}

              {error && (
                <div className="rounded-[10px] border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="hidden min-h-0 overflow-auto border-l border-[#ecebe6] bg-[#fcfbf8] px-6 py-6 xl:block">
            <QuotePreviewPanel quote={quote} supplier={resolvedSupplier} />
          </div>
        </div>

        {mobilePreviewOpen && (
          <div className="absolute inset-0 z-30 flex flex-col bg-white xl:hidden">
            <div className="flex items-center justify-between border-b border-[#ecebe6] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#111110]">견적서 미리보기</p>
                <p className="mt-0.5 text-xs text-[#615D59]">{buildStandardQuoteTitle(quote)}</p>
              </div>
              <button
                type="button"
                title="미리보기 닫기"
                onClick={() => setMobilePreviewOpen(false)}
                className="rounded-md border border-[#e8e8e4] p-2 text-[#615D59] hover:bg-[#f6f5f2] hover:text-[#111110]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#fcfbf8] p-4">
              <QuotePreviewPanel quote={quote} supplier={resolvedSupplier} />
            </div>
          </div>
        )}

        {error && (
          <div className="border-t border-[#F6D5C5] bg-[#FEF3EE] px-6 py-2.5">
            <p
              className="text-center text-sm font-medium text-[#B85C33]"
              style={{ textShadow: "0 1px 2px rgba(184,92,51,0.08)" }}
            >
              {error}
            </p>
          </div>
        )}
        {shareSheet && (
          <div className="border-t border-[#D1FAE5] bg-[#F0FDF7] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#084734] ring-1 ring-[#B7E8D1]">
                    <Check className="h-3.5 w-3.5" />
                    전송 준비 완료
                  </span>
                  <span className="text-xs font-medium text-[#1a1a1a]/45">
                    {shareSheet.customerName} · {shareSheet.quoteNumber}
                  </span>
                </div>
                <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-[#D1FAE5]">
                  <Link2 className="h-4 w-4 shrink-0 text-[#084734]" />
                  <span className="min-w-0 flex-1 truncate text-xs text-[#1a1a1a]/55">
                    {shareSheet.url}
                  </span>
                  <button
                    type="button"
                    title="링크 복사"
                    onClick={() => {
                      void copyTextToClipboard(shareSheet.url).then(() => {
                        setLinkCopied(true)
                        setTimeout(() => setLinkCopied(false), 2000)
                      })
                    }}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#084734] px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-[#065c41]"
                  >
                    {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {linkCopied ? "복사됨" : "복사"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ShareOptionButton
                  icon={linkCopied ? <Check className="h-4 w-4 text-[#084734]" /> : <Copy className="h-4 w-4" />}
                  label={linkCopied ? "복사됨" : "링크"}
                  title="링크 복사"
                  onClick={() => {
                    void copyTextToClipboard(shareSheet.url).then(() => {
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    })
                  }}
                />
                <ShareOptionButton
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="카카오"
                  title="카카오톡으로 전송"
                  onClick={() => openKakaoShare(shareSheet)}
                />
                <ShareOptionButton
                  icon={<Smartphone className="h-4 w-4" />}
                  label="문자"
                  title="문자로 전송"
                  onClick={() => openSmsShare(shareSheet)}
                />
                <ShareOptionButton
                  icon={<Mail className="h-4 w-4" />}
                  label="메일"
                  title="메일 앱으로 전송"
                  onClick={() => openMailShare(shareSheet)}
                />
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <ShareOptionButton
                    icon={<Share2 className="h-4 w-4" />}
                    label="기타"
                    title="기기 공유 메뉴 열기"
                    onClick={() => {
                      navigator.share({
                        title: `견적서 ${shareSheet.quoteNumber}`,
                        text: `${shareSheet.customerName}님 견적서입니다.`,
                        url: shareSheet.url,
                      }).catch(() => {})
                    }}
                  />
                )}
                <ShareOptionButton
                  icon={<Printer className="h-4 w-4" />}
                  label="미리보기"
                  title="견적서 미리보기"
                  onClick={() => {
                    openQuotePreviewUrl(shareSheet.url)
                  }}
                />
                <button
                  type="button"
                  title="공유 메뉴 닫기"
                  onClick={() => {
                    setShareSheet(null)
                  }}
                  className="flex h-[58px] w-9 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white text-[#615D59] transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[#ecebe6] bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 lg:px-6">
          <div className="min-w-0 flex-1 text-sm text-[#615D59]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#084734]">
                {isSoftwareQuote ? "SW" : "HW"}
              </span>
              <span className="truncate">{buildStandardQuoteTitle(quote)}</span>
            </div>
            {shareSheet && (
              <p className="mt-1 text-xs text-[#084734]">공유 메뉴에서 복사하거나 앱으로 바로 보낼 수 있습니다.</p>
            )}
          </div>
          {shareSheet ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-[13px]"
                onClick={() => {
                  setShareSheet(null)
                }}
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
          ) : (
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-[13px] text-[#615D59] hover:text-[#111110] hover:no-underline"
                onClick={() => onOpenChange(false)}
                disabled={Boolean(submittingAction)}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-[13px]"
                disabled={Boolean(submittingAction) || loadingOptions || !canCreateQuote}
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
                title="저장 후 미리보기"
                disabled={Boolean(submittingAction) || loadingOptions || !canCreateQuote}
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
                disabled={Boolean(submittingAction) || loadingOptions || !canCreateQuote}
                onClick={() => {
                  void handleSubmit("save_and_send")
                }}
                className="h-9 bg-[#084734] text-[13px] text-white hover:bg-[#065c41]"
              >
                {submittingAction === "save_and_send" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                발송
              </Button>
            </div>
          )}
        </div>

        {/* ── 임시저장 토스트 ─────────────────────────────────── */}
        {saveToast && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div
              className="pointer-events-auto rounded-2xl bg-[#111110] px-6 py-4 text-center shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
              style={{ animation: "fadeInUp 0.25s ease-out" }}
            >
              <Check className="mx-auto h-6 w-6 text-[#6EE7B7]" />
              <p className="mt-2 text-sm font-medium text-white">저장 완료</p>
            </div>
          </div>
        )}

        {errorToast && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
            <div
              role="alert"
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-[#F2B8A2] bg-white px-4 py-4 shadow-[0_18px_60px_rgba(80,30,12,0.22)]"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEF3EE] text-[#B85C33]">
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
                className="rounded-md p-1 text-[#7A4A36]/60 transition-colors hover:bg-[#FEF3EE] hover:text-[#7A4A36]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
