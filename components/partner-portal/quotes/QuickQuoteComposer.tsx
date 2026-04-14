"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, Eye, Loader2, Minus, Plus, RefreshCw, Sparkles, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import { getProductBySku } from "@/lib/product-templates"
import type {
  CustomerListItem,
  DealListItem,
  QuoteDocumentShare,
  QuoteDocumentVersion,
} from "@/lib/partner-portal/types"
import type {
  PartnerQuoteDetailsInput,
  PartnerQuoteLineItemInput,
  QuoteOptionSelectionValue,
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
  STANDARD_QUOTE_SUPPLIER,
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

type CreateAction = "save" | "save_and_copy_link" | "save_and_preview"

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

type QuickAddRailItemId =
  | "board_86"
  | "board_75"
  | "camera_t1"
  | "stand"
  | "wall_mount"
  | "bundle_86_t1_wall"

type QuickAddRailItem = {
  id: QuickAddRailItemId
  label: string
  description: string
  price: number
}

const TEMPLATE_CARD_ORDER: StandardQuoteTemplateId[] = ["board_86", "board_75", "camera_t1"]
const QUICK_ADD_RAIL_ITEMS: QuickAddRailItem[] = [
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
    (quantity != null && unitPrice != null ? Math.max(0, Math.round(quantity * unitPrice)) : undefined)

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

function normalizeQuoteDetails(
  structuredJson: Record<string, unknown> | null | undefined,
  fallback: {
    customerName?: string | null
    validUntil?: string | null
  } = {}
) {
  const root = isRecord(structuredJson) ? structuredJson : {}
  const details = isRecord(root.quoteDetails) ? root.quoteDetails : root
  const lineItemSource =
    Array.isArray(details.lineItems) ? details.lineItems :
    Array.isArray(details.items) ? details.items :
    Array.isArray(root.lineItems) ? root.lineItems :
    Array.isArray(root.items) ? root.items :
    []

  const templateId = inferStandardQuoteTemplateId({
    templateId: pickString(details, "templateId", "template_id"),
    lineItems: lineItemSource.map((item, index) => normalizeLineItem(item, index)),
  })

  return finalizeStandardQuoteDetails(
    {
      templateId,
      presetId: pickString(details, "presetId"),
      issuedAt: pickString(details, "issuedAt", "issued_at") ?? getTodayDateValue(),
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
      lineItems: lineItemSource.map((item, index) => normalizeLineItem(item, index)),
    },
    templateId
  )
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
  const subject = `${template.label} ${Math.max(1, quantity)}대`
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

function QuotePreviewPanel({ quote }: { quote: PartnerQuoteDetailsInput }) {
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
            <PreviewField label="상호명" value={STANDARD_QUOTE_SUPPLIER.businessName} align="right" />
            <PreviewField label="사업자등록번호" value={STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber} align="right" />
            <PreviewField label="대표이사" value={STANDARD_QUOTE_SUPPLIER.representativeName} align="right" />
            <PreviewField label="주소" value={STANDARD_QUOTE_SUPPLIER.address} align="right" />
            <PreviewField
              label="담당자/연락처"
              value={`${STANDARD_QUOTE_SUPPLIER.contactName}/${STANDARD_QUOTE_SUPPLIER.contactPhone}`}
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
}: QuickQuoteComposerProps) {
  const today = getTodayDateValue()
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [deals, setDeals] = useState<DealListItem[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing")
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [newCustomerName, setNewCustomerName] = useState("")
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

  const sortedCustomers = useMemo(
    () => [...customers].sort((left, right) => left.customer.name.localeCompare(right.customer.name, "ko")),
    [customers]
  )
  const selectedCustomer = sortedCustomers.find((item) => item.customer.id === selectedCustomerId)?.customer ?? null
  const fallbackExistingCustomer = selectedCustomer ?? sortedCustomers[0]?.customer ?? null
  const availableDeals = useMemo(
    () =>
      customerMode === "existing" && selectedCustomerId
        ? deals.filter((deal) => deal.customer_id === selectedCustomerId)
        : [],
    [customerMode, deals, selectedCustomerId]
  )
  const selectedCustomerName = fallbackExistingCustomer?.name ?? null
  const totals = calculateStandardQuoteTotals(quote.lineItems, quote.vatIncluded ?? true)
  const baseLine = getBaseLine(quote)
  const baseQuantity = Math.max(1, Number(baseLine?.quantity ?? 1))
  const optionGroups = getStandardQuoteOptionGroups(templateId)
  const bundlePreset =
    getStandardQuoteQuickPresets("board_86").find((preset) => preset.id === "board_86_bundle") ?? null
  const hasNoExpiration = !quote.validUntil
  const isBundleSelected =
    templateId === "board_86" &&
    optionSelections.camera_bundle === true &&
    optionSelections.mounting_option === "wall_mount"

  useEffect(() => {
    if (!open) return

    let alive = true
    setLoadingOptions(true)
    setError(null)

    Promise.allSettled([
      portalFetch("/api/partner/customers").then(async (response) => {
        if (!response.ok) throw new Error("고객 목록을 불러오지 못했습니다.")
        return (await response.json()) as CustomerPayload
      }),
      portalFetch("/api/partner/deals").then(async (response) => {
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
  }, [open])

  useEffect(() => {
    if (!open) return
    setCustomerMode("existing")
    setSelectedCustomerId("")
    setNewCustomerName("")
    setSelectedDealId("")
    setNewDealTitle("")
    setTemplateId("board_86")
    const defaultSelections = getStandardQuoteDefaultSelections("board_86")
    setOptionSelections(defaultSelections)
    setQuote(
      buildConfigurableStandardQuoteDetails({
        templateId: "board_86",
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
    setError(null)
  }, [open, today])

  useEffect(() => {
    if (!open || customerMode !== "existing") return
    if (!selectedCustomerId && sortedCustomers[0]?.customer.id) {
      setSelectedCustomerId(sortedCustomers[0].customer.id)
    }
  }, [customerMode, open, selectedCustomerId, sortedCustomers])

  useEffect(() => {
    if (!open) return

    if (customerMode === "existing" && !selectedCustomerName) return

    const recipientName = customerMode === "existing" ? selectedCustomerName || "" : newCustomerName || ""

    setQuote((current) =>
      current.recipientCompanyName === recipientName
        ? current
        :
      finalizeStandardQuoteDetails(
        {
          ...current,
          recipientCompanyName: recipientName,
        },
        templateId
      )
    )
  }, [customerMode, newCustomerName, open, selectedCustomerName, templateId])

  useEffect(() => {
    if (!open || customerMode !== "existing") return
    if (selectedDealId && !availableDeals.some((deal) => deal.id === selectedDealId)) {
      setSelectedDealId("")
    }
  }, [availableDeals, customerMode, open, selectedDealId])

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

  function handleQuickAdd(itemId: QuickAddRailItemId) {
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
      const response = await portalFetch(`/api/partner/quotes/${quoteId}`)
      if (!response.ok) {
        throw new Error("기존 견적을 불러오지 못했습니다.")
      }

      const payload = (await response.json()) as QuoteFetchPayload
      const normalized = normalizeQuoteDetails(payload.version?.structured_json, {
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

  async function resolveCustomer() {
    if (customerMode === "existing" && fallbackExistingCustomer) {
      return {
        id: fallbackExistingCustomer.id,
        name: fallbackExistingCustomer.name,
      }
    }

    const name = newCustomerName.trim()
    if (!name) {
      throw new Error("고객사 이름을 입력해 주세요.")
    }

    const response = await portalFetch("/api/partner/customers", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; customer?: { id: string; name: string } }
      | null

    if (!response.ok || !payload?.customer) {
      throw new Error(payload?.error ?? "고객 생성에 실패했습니다.")
    }

    return payload.customer
  }

  async function resolveDeal(customerId: string, customerName?: string | null) {
    const existingDeal =
      selectedDealId && deals.find((deal) => deal.id === selectedDealId && deal.customer_id === customerId)

    if (existingDeal) {
      return existingDeal
    }

    const title =
      newDealTitle.trim() ||
      buildDefaultDealTitle({
        templateId,
        quantity: baseQuantity,
        customerName,
      })
    if (!title) {
      throw new Error("거래 제목을 입력해 주세요.")
    }

    const response = await portalFetch("/api/partner/deals", {
      method: "POST",
      body: JSON.stringify({
        customer_id: customerId,
        title,
        expected_amount: quote.grandTotalAmount ?? 0,
      }),
    })
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; deal?: DealListItem }
      | null

    if (!response.ok || !payload?.deal) {
      throw new Error(payload?.error ?? "거래 생성에 실패했습니다.")
    }

    return payload.deal
  }

  async function handleSubmit(action: CreateAction) {
    setSubmittingAction(action)
    setError(null)
    const previewWindow =
      action === "save_and_preview" && typeof window !== "undefined"
        ? window.open("", "_blank")
        : null

    try {
      const customer = await resolveCustomer()
      const deal = await resolveDeal(customer.id, customer.name)
      const preparedQuote = finalizeStandardQuoteDetails(
        {
          ...quote,
          templateId,
          optionSelections,
          recipientCompanyName: customer.name,
          issuedAt: quote.issuedAt || today,
          validUntil: quote.validUntil ?? undefined,
        },
        templateId
      )

      const response = await portalFetch("/api/partner/quotes", {
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

      let shareUrl: string | null = null
      let shareError: string | null = null
      let share: QuoteDocumentShare | null = null
      if (action !== "save") {
        try {
          const shareResponse = await portalFetch(`/api/partner/quotes/${payload.document.id}/share`, {
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
          if (action === "save_and_copy_link") {
            const copied = await copyTextToClipboard(shareUrl)
            if (!copied) {
              throw new Error("브라우저에서 링크 복사를 허용하지 않았습니다.")
            }
          }
          if (action === "save_and_preview") {
            if (previewWindow) {
              previewWindow.location.href = shareUrl
            } else if (typeof window !== "undefined") {
              window.location.href = shareUrl
            }
          }
        } catch (shareIssue) {
          if (previewWindow && !previewWindow.closed) {
            previewWindow.close()
          }
          shareError =
            shareIssue instanceof Error
              ? shareIssue.message
              : "공유 링크 생성에 실패했습니다."
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

      onOpenChange(false)
    } catch (submitError) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close()
      }
      setError(
        submitError instanceof Error
          ? submitError.message
          : "견적서 생성에 실패했습니다."
      )
    } finally {
      setSubmittingAction(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-[32px] border border-[rgba(255,255,255,0.25)] bg-white shadow-[0_24px_80px_rgba(17,17,16,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#ecebe6] px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#ECFDF5] px-3 py-1 text-[11px] font-medium text-[#084734]">
              <Sparkles className="h-3.5 w-3.5" />
              Quick Quote Composer
            </div>
            <h2 className="mt-3 text-xl font-semibold text-[#111110]">새 문서에서 바로 견적 옵션 설정</h2>
            <p className="mt-1 text-sm text-[#615D59]">
              고객사, 템플릿, 옵션, 수량만 정하면 합계와 발송본이 바로 맞춰집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-[#e8e8e4] px-3 py-1.5 text-sm text-[#615D59] hover:bg-[#f6f5f2]"
          >
            닫기
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(520px,560px)]">
          <div className="min-h-0 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              <section className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">최근 견적 복제</p>
                    <p className="mt-1 text-xs text-[#615D59]">이전 설정을 그대로 가져오고 고객사나 날짜만 바꿀 수 있습니다.</p>
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
                  {recentQuotes.length === 0 ? (
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs text-[#615D59] ring-1 ring-[#ecebe6]">
                      아직 복제할 최근 견적이 없습니다.
                    </span>
                  ) : (
                    recentQuotes.slice(0, 5).map((item) => (
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
                    ))
                  )}
                </div>
              </section>

              <section className="grid gap-4 rounded-2xl border border-[#e8e8e4] bg-white p-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>고객사</Label>
                  <div className="flex gap-2">
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
                      신규 고객
                    </button>
                  </div>
                  {customerMode === "existing" ? (
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
                      ) : (
                        sortedCustomers.map((item) => (
                          <option key={item.customer.id} value={item.customer.id}>
                            {item.customer.name}
                            {item.customer.campus_name ? ` (${item.customer.campus_name})` : ""}
                          </option>
                        ))
                      )}
                    </select>
                  ) : (
                    <Input
                      value={newCustomerName}
                      onChange={(event) => setNewCustomerName(event.target.value)}
                      placeholder="예: 권경옥어학원"
                    />
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
                    <button
                      type="button"
                      onClick={() =>
                        setQuote((current) =>
                          finalizeStandardQuoteDetails(
                            {
                              ...current,
                              validUntil: current.validUntil ? undefined : addDays(current.issuedAt || today, 7),
                            },
                            templateId
                          )
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
                        hasNoExpiration
                          ? "bg-[#111110] text-white"
                          : "bg-[#f6f5f2] text-[#615D59]"
                      }`}
                    >
                      유효기간 없음
                    </button>
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
                  <p className="text-xs text-[#615D59]">
                    {hasNoExpiration ? "만료일 표시 없이 발송합니다." : "기본값은 발행일 기준 7일입니다."}
                  </p>
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
                          : "bg-[#f6f5f2] text-[#615D59]"
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
                          : "bg-[#f6f5f2] text-[#615D59]"
                      }`}
                    >
                      VAT 별도
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">Quick Add</p>
                    <p className="mt-1 text-xs text-[#615D59]">
                      패스트푸드 POS처럼 눌러서 바로 구성합니다. 같은 버튼을 다시 누르면 수량이 늘어납니다.
                    </p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#615D59] ring-1 ring-[#e8e8e4]">
                    현재 본체 {baseQuantity}대
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {QUICK_ADD_RAIL_ITEMS.map((item) => {
                    const active =
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
                        className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
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

              <section className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-sm font-semibold text-[#111110]">템플릿 선택</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TEMPLATE_CARD_ORDER.map((item) => {
                    const template = getStandardQuoteTemplate(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          const defaultSelections = getStandardQuoteDefaultSelections(item)
                          setTemplateId(item)
                          setOptionSelections(defaultSelections)
                          rebuildQuote({
                            templateId: item,
                            optionSelections: defaultSelections,
                            patch: {
                              templateId: item,
                            },
                          })
                        }}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          templateId === item
                            ? "border-[#084734] bg-[#ECFDF5]"
                            : "border-[#e8e8e4] bg-white"
                        }`}
                      >
                        <div className="text-sm font-semibold text-[#111110]">{template.label}</div>
                        <div className="mt-1 text-xs text-[#615D59]">{template.description}</div>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">본체 수량</p>
                    <p className="mt-1 text-xs text-[#615D59]">옵션이 연결된 항목은 본체 수량을 따라갑니다.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-[#f6f5f2] px-2 py-1">
                    <button
                      type="button"
                      onClick={() => rebuildQuote({ baseQuantity: Math.max(1, baseQuantity - 1) })}
                      className="rounded-full p-1 text-[#615D59] hover:bg-white"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-10 text-center text-sm font-semibold text-[#111110]">{baseQuantity}</span>
                    <button
                      type="button"
                      onClick={() => rebuildQuote({ baseQuantity: baseQuantity + 1 })}
                      className="rounded-full p-1 text-[#615D59] hover:bg-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                {optionGroups.map((group) => (
                  <div key={group.id} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111110]">{group.label}</p>
                      {group.description && (
                        <p className="mt-1 text-xs text-[#615D59]">{group.description}</p>
                      )}
                    </div>

                    {group.control === "radio" ? (
                      <div className="mt-3 grid gap-2">
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
                              className={`rounded-2xl border px-3 py-3 text-left ${
                                active
                                  ? "border-[#084734] bg-[#ECFDF5]"
                                  : "border-[#ecebe6] bg-[#fafaf8]"
                              }`}
                            >
                              <div className="text-sm font-medium text-[#111110]">{option.label}</div>
                              {option.description && (
                                <div className="mt-1 text-xs text-[#615D59]">{option.description}</div>
                              )}
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
                        className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-3 py-3 ${
                          optionSelections[group.id]
                            ? "border-[#084734] bg-[#ECFDF5]"
                            : "border-[#ecebe6] bg-[#fafaf8]"
                        }`}
                      >
                        <div className="text-left">
                          <div className="text-sm font-medium text-[#111110]">{group.label}</div>
                          <div className="mt-1 text-xs text-[#615D59]">
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

              <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111110]">최종 품목 / 자동 계산</p>
                    <p className="mt-1 text-xs text-[#615D59]">옵션 선택 결과를 바로 수정할 수 있습니다. 공급가액은 자동 계산됩니다.</p>
                  </div>
                  <div className="rounded-full bg-[#f6f5f2] px-3 py-1 text-xs font-medium text-[#615D59]">
                    {quote.vatPolicyLabel}
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-[#ecebe6]">
                  <table className="w-full text-sm">
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
              </section>

              <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="grid gap-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
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
                      className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                      className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="필요한 경우에만 입력합니다."
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">금액 요약</p>
                  <div className="mt-4 space-y-2 text-sm">
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

          <div className="min-h-0 overflow-auto border-l border-[#ecebe6] bg-[#fcfbf8] px-6 py-6">
            <QuotePreviewPanel quote={quote} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ecebe6] bg-white px-6 py-4">
          <div className="text-sm text-[#615D59]">
            {buildStandardQuoteTitle(quote)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(submittingAction)}>
              취소
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(submittingAction) || loadingOptions}
              onClick={() => {
                void handleSubmit("save")
              }}
            >
              {submittingAction === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              임시 저장
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(submittingAction) || loadingOptions}
              onClick={() => {
                void handleSubmit("save_and_preview")
              }}
            >
              {submittingAction === "save_and_preview" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              저장 후 미리보기
            </Button>
            <Button
              type="button"
              disabled={Boolean(submittingAction) || loadingOptions}
              onClick={() => {
                void handleSubmit("save_and_copy_link")
              }}
            >
              {submittingAction === "save_and_copy_link" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              저장 후 링크 복사
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
