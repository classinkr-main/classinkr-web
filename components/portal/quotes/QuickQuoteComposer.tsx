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
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  buildConfigurableStandardQuoteDetails,
  buildStandardQuoteTitle,
  calculateStandardQuoteTotals,
  finalizeStandardQuoteDetails,
  formatStandardQuoteCurrency,
  getStandardQuoteDefaultSelections,
  getStandardQuoteOptionGroups,
  getStandardQuoteQuickPresets,
  getStandardQuoteTemplate,
  inferStandardQuoteTemplateId,
  isSoftwareQuoteTemplate,
  resolveQuoteSupplier,
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

type QuickQuoteComposerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  recentQuotes: RecentQuoteOption[]
  onCreated: (payload: QuickQuoteCreatedPayload) => void | Promise<void>
  apiBase?: QuickQuoteApiBase
  portalPartnerAccountId?: string | null
  initialTemplateId?: StandardQuoteTemplateId
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
    description: "OMO 780",
    price: getProductBySku("ai-studio-recording-set")?.unit_price ?? 7_800_000,
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
    price: getProductBySku("board-86")?.unit_price ?? 5_800_000,
  },
  {
    id: "board_75",
    label: '전자칠판 75"',
    description: "",
    price: getProductBySku("board-75")?.unit_price ?? 4_900_000,
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
    price: getProductBySku("bundle-86-t1-wall")?.unit_price ?? 7_500_000,
  },
]

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
      className="flex h-[74px] w-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-[#e8e8e4] bg-white text-[#111110] shadow-sm transition-colors hover:border-[#B7E8D1] hover:bg-[#F0FDF7]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f6f5f2] text-[#615D59]">
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
  // SW 견적 공급자 담당자(클래스인 명의). 이름은 로그인 관리자에서 자동 채우고 수정 가능.
  const [managerContactName, setManagerContactName] = useState("")
  const [managerContactPhone, setManagerContactPhone] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return
    const adminName = window.sessionStorage.getItem("admin_name")
    if (adminName) setManagerContactName((prev) => prev || adminName)
  }, [])

  const isSoftwareQuote = isSoftwareQuoteTemplate(templateId)
  const resolvedSupplier = useMemo(
    () => resolveQuoteSupplier(templateId, { name: managerContactName, phone: managerContactPhone }),
    [templateId, managerContactName, managerContactPhone],
  )
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
        <div className="flex items-center justify-between gap-3 border-b border-[#ecebe6] px-4 py-3 sm:px-5 lg:px-6">
          <div className="min-w-0">
            <h2 id="quick-quote-composer-title" className="flex items-center gap-2 text-lg font-semibold text-[#111110]">
              <Sparkles className="h-4 w-4 text-[#084734]" />
              빠른 견적 작성
            </h2>
            <p className="mt-0.5 truncate text-xs text-[#615D59]">
              고객사와 구성만 정하면 합계와 발송본이 바로 맞춰집니다.
            </p>
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
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5 lg:px-6">
            <div className="space-y-4">
              {recentQuotes.length > 0 && (
              <section className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">최근 견적 복제</p>
                    <p className="mt-0.5 text-xs text-[#615D59]">이전 견적을 불러와 고객사만 바꿉니다.</p>
                  </div>
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
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#1a1a1a]/60 ring-1 ring-[#e8e8e4] hover:text-[#111110]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    초기화
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {recentQuotes.slice(0, 5).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          void handleReuseQuote(item.id)
                        }}
                        disabled={reuseLoadingId === item.id}
                        className="rounded-2xl border border-[#ecebe6] bg-white px-3 py-2 text-left text-xs text-[#1a1a1a]/70 hover:border-[#D1FAE5] hover:bg-[#ECFDF5] disabled:opacity-60"
                      >
                        <div className="font-medium text-[#111110]">
                          {reuseLoadingId === item.id ? "불러오는 중..." : item.customerName}
                        </div>
                        <div className="mt-0.5">
                          {item.currentVersionLabel ?? item.title}
                        </div>
                      </button>
                    ))}
                </div>
              </section>
              )}

              <section className="grid gap-3 rounded-xl border border-[#e8e8e4] bg-white p-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>고객사</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerMode("new")
                        setSelectedDealId("")
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        customerMode === "new"
                          ? "bg-[#111110] text-white"
                          : "bg-[#f6f5f2] text-[#615D59]"
                      }`}
                    >
                      바로 입력
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode("existing")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        customerMode === "existing"
                          ? "bg-[#111110] text-white"
                          : "bg-[#f6f5f2] text-[#615D59]"
                      }`}
                    >
                      기존 고객
                    </button>
                  </div>
                  {customerMode === "existing" ? (
                    <div className="grid gap-2">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/35" />
                        <input
                          value={customerQuery}
                          onChange={(event) => setCustomerQuery(event.target.value)}
                          placeholder="고객사, 캠퍼스, 지역 검색"
                          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </label>
                      <select
                        value={selectedCustomerId}
                        disabled={loadingOptions}
                        onChange={(event) => {
                          setSelectedCustomerId(event.target.value)
                          setSelectedDealId("")
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    <div className="grid gap-2">
                      <Input
                        value={newCustomerName}
                        onChange={(event) => setNewCustomerName(event.target.value)}
                        placeholder="학원/기관명 입력"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={newCustomerContactName}
                          onChange={(event) => setNewCustomerContactName(event.target.value)}
                          placeholder="담당자명(선택)"
                        />
                        <Input
                          value={newCustomerPhone}
                          onChange={(event) => setNewCustomerPhone(event.target.value)}
                          placeholder="연락처(선택)"
                        />
                      </div>
                      <p className="text-xs text-[#615D59]">
                        홈페이지 리드가 없어도 저장 시 고객과 거래가 함께 생성됩니다.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label>거래 연결</Label>
                  <select
                    value={selectedDealId}
                    disabled={loadingOptions}
                    onChange={(event) => setSelectedDealId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    />
                  )}
                </div>

                {isSoftwareQuote && (
                  <div className="md:col-span-2 grid gap-2 rounded-xl border border-[#cfe9dd] bg-[#f2fbf7] px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs font-semibold text-[#0b5a41]">공급자 담당자 (클래스인 명의)</Label>
                      <span className="text-[11px] text-[#4f7a68]">SW 견적 · 로그인 관리자 자동 채움 · 수정 가능</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={managerContactName}
                        onChange={(event) => setManagerContactName(event.target.value)}
                        placeholder="담당자명"
                      />
                      <Input
                        value={managerContactPhone}
                        onChange={(event) => setManagerContactPhone(event.target.value)}
                        placeholder="연락처 (예: 010-0000-0000)"
                      />
                    </div>
                  </div>
                )}

                <details className="md:col-span-2 rounded-xl border border-[#ecebe6] bg-[#fafaf8] px-3 py-2">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-[#111110]">
                    발행/세금 옵션
                    <span className="ml-2 font-normal text-[#615D59]">
                      {quote.issuedAt ?? today} · {hasNoExpiration ? "기한 없음" : `${quote.validUntil ?? addDays(today, 7)}까지`} · {quote.vatPolicyLabel}
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="quote-issued-at">발행일</Label>
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
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="quote-valid-until">유효기한</Label>
                        <span className="text-[11px] font-medium text-[#1a1a1a]/35">
                          {hasNoExpiration ? "만료일 없음" : "빠른 선택 가능"}
                        </span>
                      </div>
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
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[7, 14, 30].map((days) => {
                          const active = quote.validUntil === addDays(quote.issuedAt || today, days)

                          return (
                            <button
                              key={days}
                              type="button"
                              onClick={() => setValidityDays(days)}
                              className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
                                active
                                  ? "bg-[#111110] text-white"
                                  : "bg-white text-[#615D59] ring-1 ring-[#e8e8e4] hover:text-[#111110]"
                              }`}
                            >
                              {days}일
                            </button>
                          )
                        })}
                        <button
                          type="button"
                          onClick={() => setValidityDays(null)}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
                            hasNoExpiration
                              ? "bg-[#111110] text-white"
                              : "bg-white text-[#615D59] ring-1 ring-[#e8e8e4] hover:text-[#111110]"
                          }`}
                        >
                          없음
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="quote-reference">참조</Label>
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
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>VAT 정책</Label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setQuote((current) =>
                              finalizeStandardQuoteDetails(
                                {
                                  ...current,
                                  vatIncluded: true,
                                  vatPolicyLabel: undefined,
                                },
                                templateId
                              )
                            )
                          }
                          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                            (quote.vatIncluded ?? true)
                              ? "bg-[#111110] text-white"
                              : "bg-white text-[#615D59] ring-1 ring-[#e8e8e4]"
                          }`}
                        >
                          VAT 포함
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setQuote((current) =>
                              finalizeStandardQuoteDetails(
                                {
                                  ...current,
                                  vatIncluded: false,
                                  vatPolicyLabel: undefined,
                                },
                                templateId
                              )
                            )
                          }
                          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                            quote.vatIncluded === false
                              ? "bg-[#111110] text-white"
                              : "bg-white text-[#615D59] ring-1 ring-[#e8e8e4]"
                          }`}
                        >
                          VAT 별도
                        </button>
                      </div>
                    </div>
                  </div>
                </details>
              </section>

              <section className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">구성</p>
                    <p className="mt-0.5 text-xs text-[#615D59]">버튼을 눌러 품목을 바로 바꿉니다.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[#615D59] ring-1 ring-[#e8e8e4]">
                    <button
                      type="button"
                      title={`${quantityHeading} 줄이기`}
                      onClick={() => rebuildQuote({ baseQuantity: Math.max(1, baseQuantity - 1) })}
                      className="rounded-full p-1 text-[#615D59] hover:bg-[#f6f5f2] hover:text-[#111110]"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-10 text-center text-xs font-semibold text-[#111110]">
                      {baseQuantity}
                      {quantityUnitLabel}
                    </span>
                    <button
                      type="button"
                      title={`${quantityHeading} 늘리기`}
                      onClick={() => rebuildQuote({ baseQuantity: baseQuantity + 1 })}
                      className="rounded-full p-1 text-[#615D59] hover:bg-[#f6f5f2] hover:text-[#111110]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8">
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
                        onClick={() => handleQuickAdd(item.id)}
                        className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? "border-[#084734] bg-[#ECFDF5]"
                            : "border-[#e8e8e4] bg-white hover:border-[#CBE7DE] hover:bg-[#f8fbf9]"
                        }`}
                      >
                        <div className="truncate text-sm font-semibold text-[#111110]">{item.label}</div>
                        {item.description && <div className="mt-0.5 truncate text-[11px] text-[#615D59]">{item.description}</div>}
                        <div className="mt-1 text-xs font-medium text-[#111110]">
                          {formatQuickAddPrice(item.price)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="grid gap-3 lg:grid-cols-2">
                {optionGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-[#e8e8e4] bg-white p-3">
                    <div>
                      <p className="text-sm font-semibold text-[#111110]">{group.label}</p>
                      {group.description && (
                        <p className="mt-0.5 text-xs text-[#615D59]">{group.description}</p>
                      )}
                    </div>

                    {group.control === "radio" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
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
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                                active
                                  ? "border-[#084734] bg-[#ECFDF5]"
                                  : "border-[#ecebe6] bg-[#fafaf8] text-[#615D59] hover:text-[#111110]"
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
                        className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 ${
                          optionSelections[group.id]
                            ? "border-[#084734] bg-[#ECFDF5]"
                            : "border-[#ecebe6] bg-[#fafaf8]"
                        }`}
                      >
                        <div className="text-left">
                          <div className="text-sm font-medium text-[#111110]">{group.label}</div>
                          <div className="mt-0.5 text-xs text-[#615D59]">
                            {optionSelections[group.id] ? group.enabledLabel ?? "활성" : group.disabledLabel ?? "비활성"}
                          </div>
                        </div>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[#084734]">
                          {optionSelections[group.id] ? "ON" : "OFF"}
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </section>

              <details className="rounded-xl border border-[#e8e8e4] bg-white p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-[#111110]">세부 품목 수정</span>
                    <span className="mt-0.5 block text-xs text-[#615D59]">
                      {lineItemCount}개 품목 · {quote.vatPolicyLabel}
                    </span>
                  </span>
                  <span className="rounded-full bg-[#f6f5f2] px-3 py-1 text-xs font-semibold text-[#111110]">
                    {formatStandardQuoteCurrency(totals.grandTotalAmount)}원
                  </span>
                </summary>

                <div className="mt-3 overflow-x-auto rounded-xl border border-[#ecebe6]">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead className="bg-[#f7f6f3] text-[#1a1a1a]/55">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium">No</th>
                        <th className="px-3 py-2 text-left text-xs font-medium">품목</th>
                        <th className="px-3 py-2 text-left text-xs font-medium">세부내역</th>
                        <th className="px-3 py-2 text-right text-xs font-medium">단가</th>
                        <th className="px-3 py-2 text-right text-xs font-medium">수량</th>
                        <th className="px-3 py-2 text-right text-xs font-medium">공급가액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quote.lineItems ?? []).map((line, index) => (
                        <tr key={`${line.itemCode ?? line.itemName}-${line.lineNumber}`} className="border-t border-[#f0efea] align-top">
                          <td className="px-3 py-3 text-xs text-[#1a1a1a]/45">{line.lineNumber}</td>
                          <td className="px-3 py-3 font-medium text-[#111110]">{line.itemName}</td>
                          <td className="px-3 py-3 text-xs text-[#1a1a1a]/55">{line.itemDescription || "-"}</td>
                          <td className="px-3 py-3">
                            <div className="ml-auto w-28">
                              <Input
                                type="number"
                                min={0}
                                value={line.unitPrice ?? ""}
                                disabled={line.priceLocked === true}
                                onChange={(event) =>
                                  updateLine(index, { unitPrice: parseNumericInput(event.target.value) })
                                }
                                className="text-right"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="ml-auto flex w-[124px] items-center gap-2">
                              <button
                                type="button"
                                onClick={() => nudgeLineQuantity(index, -1)}
                                disabled={line.quantityLocked === true && line.optionGroupId !== "main_product"}
                                className="rounded-full border border-[#e8e8e4] p-1 text-[#615D59] hover:bg-[#f6f5f2] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <Input
                                type="number"
                                min={0}
                                value={line.quantity ?? ""}
                                disabled={line.quantityLocked === true}
                                onChange={(event) =>
                                  updateLine(index, { quantity: parseNumericInput(event.target.value) })
                                }
                                className="text-center"
                              />
                              <button
                                type="button"
                                onClick={() => nudgeLineQuantity(index, 1)}
                                disabled={line.quantityLocked === true && line.optionGroupId !== "main_product"}
                                className="rounded-full border border-[#e8e8e4] p-1 text-[#615D59] hover:bg-[#f6f5f2] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-[#111110]">
                            {line.lineSupplyAmount == null ? "-" : `${formatStandardQuoteCurrency(line.lineSupplyAmount)}원`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                <details className="rounded-xl border border-[#e8e8e4] bg-white p-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-[#111110]">
                    기타/특약 메모
                    <span className="ml-2 text-xs font-normal text-[#615D59]">필요할 때만 수정</span>
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="quote-general-notes">기타사항</Label>
                      <textarea
                        id="quote-general-notes"
                        value={quote.generalNotes ?? ""}
                        onChange={(event) =>
                          setQuote((current) =>
                            finalizeStandardQuoteDetails(
                              {
                                ...current,
                                generalNotes: event.target.value,
                              },
                              templateId
                            )
                          )
                        }
                        className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="quote-special-terms">특약사항</Label>
                      <textarea
                        id="quote-special-terms"
                        value={quote.specialTerms ?? ""}
                        onChange={(event) =>
                          setQuote((current) =>
                            finalizeStandardQuoteDetails(
                              {
                                ...current,
                                specialTerms: event.target.value,
                              },
                              templateId
                            )
                          )
                        }
                        className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="필요한 경우에만 입력합니다."
                      />
                    </div>
                  </div>
                </details>

                <div className="rounded-xl border border-[#e8e8e4] bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">금액 요약</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between text-[#1a1a1a]/55">
                      <span>공급가액 합계</span>
                      <span className="font-medium text-[#111110]">{formatStandardQuoteCurrency(totals.subtotalAmount)}원</span>
                    </div>
                    <div className="flex items-center justify-between text-[#1a1a1a]/55">
                      <span>VAT</span>
                      <span className="font-medium text-[#111110]">{formatStandardQuoteCurrency(totals.vatAmount)}원</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[#ebeae3] pt-3 text-base">
                      <span className="font-semibold text-[#111110]">합계</span>
                      <span className="font-bold text-[#111110]">{formatStandardQuoteCurrency(totals.grandTotalAmount)}원</span>
                    </div>
                    {totals.hasPendingAmounts && (
                      <p className="pt-2 text-xs leading-5 text-[#B85C33]">{totals.pendingAmountNote}</p>
                    )}
                  </div>
                </div>
              </section>

              {loadingOptions && (
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 text-sm text-[#615D59]">
                  고객과 거래 데이터를 불러오는 중입니다.
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-sm text-[#B85C33]">
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
                  className="flex h-[74px] w-10 items-center justify-center rounded-xl border border-[#e8e8e4] bg-white text-[#615D59] shadow-sm transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[#ecebe6] bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 lg:px-6">
          <div className="min-w-0 flex-1 text-sm text-[#615D59]">
            <div className="truncate">{buildStandardQuoteTitle(quote)}</div>
            {shareSheet && (
              <p className="mt-1 text-xs text-[#084734]">공유 메뉴에서 복사하거나 앱으로 바로 보낼 수 있습니다.</p>
            )}
          </div>
          {shareSheet ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShareSheet(null)
                }}
              >
                편집 계속
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShareSheet(null)
                  onOpenChange(false)
                }}
                className="bg-[#084734] text-white hover:bg-[#065c41]"
              >
                완료
              </Button>
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMobilePreviewOpen(true)}
                className="hidden xl:hidden"
              >
                <Eye className="mr-2 h-4 w-4" />
                화면 미리보기
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(submittingAction)}>
                취소
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(submittingAction) || loadingOptions || !canCreateQuote}
                onClick={() => {
                  void handleSubmit("save")
                }}
              >
                {submittingAction === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                저장
              </Button>
              <Button
                type="button"
                variant="outline"
                title="저장 후 미리보기"
                disabled={Boolean(submittingAction) || loadingOptions || !canCreateQuote}
                onClick={() => {
                  void handleSubmit("save_and_preview")
                }}
              >
                {submittingAction === "save_and_preview" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                미리보기
              </Button>
              <Button
                type="button"
                title="저장 후 공유 링크 생성"
                disabled={Boolean(submittingAction) || loadingOptions || !canCreateQuote}
                onClick={() => {
                  void handleSubmit("save_and_send")
                }}
                className="bg-[#084734] text-white hover:bg-[#065c41]"
              >
                {submittingAction === "save_and_send" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
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
