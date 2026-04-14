"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useParams } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Printer,
  XCircle,
} from "lucide-react"
import {
  STANDARD_QUOTE_DEFAULT_VAT_LABEL,
  STANDARD_QUOTE_SUPPLIER,
} from "@/lib/standard-quote-template"

type PublicQuoteLineItem = {
  id: string
  sortOrder: number
  lineNumber: number
  itemType?: string | null
  itemCode?: string | null
  itemName: string
  itemDescription?: string | null
  quantity?: number
  quantityUnit?: string | null
  unitPrice?: number
  lineSupplyAmount?: number
  vatIncluded?: boolean
  lineStatus?: string | null
  billingMode?: string | null
  remark?: string | null
}

type PublicQuoteDetails = {
  templateId?: string
  estimateNumber?: string
  workflowStatus?: string
  issuedAt?: string
  validUntil?: string
  subjectText?: string
  recipientCompanyName?: string
  recipientContactName?: string
  recipientPhone?: string
  recipientEmail?: string
  referenceName?: string
  supplierBusinessName?: string
  supplierBusinessRegistrationNumber?: string
  supplierRepresentativeName?: string
  supplierAddress?: string
  supplierContactName?: string
  supplierContactPhone?: string
  supplierContactEmail?: string
  currencyUnitLabel?: string
  vatIncluded?: boolean
  vatPolicyLabel?: string
  deliveryLocationNote?: string
  paymentTerms?: string
  installationPolicy?: string
  warrantyNote?: string
  generalNotes?: string
  specialTerms?: string
  footerContactText?: string
  subtotalAmount?: number
  vatAmount?: number
  discountAmount?: number
  grandTotalAmount?: number
  hasPendingAmounts?: boolean
  pendingAmountNote?: string
  lineItems: PublicQuoteLineItem[]
}

type PublicQuoteInteraction = {
  status: "open" | "confirmed" | "locked"
  canConfirmReview: boolean
  canRequestProceed: boolean
  primaryActionLabel: string
  secondaryActionLabel: string
  helperText: string
  summary: {
    viewCount: number
    firstViewedAt: string | null
    lastViewedAt: string | null
    reviewConfirmedAt: string | null
    acceptedAt: string | null
    acceptedVersionId: string | null
    acceptedShareId: string | null
  }
}

type PublicQuoteApiResponse = {
  quote: {
    id: string
    deal_id: string
    quote_number: string
    current_version_id: string | null
    status: string
    created_at: string
    updated_at: string
  }
  version: {
    id: string
    quote_document_id: string
    version_number: number
    title: string
    content_html: string | null
    structured_json: Record<string, unknown> | null
    subtotal: number
    discount_amount: number
    tax_amount: number
    total_amount: number
    valid_until: string | null
    created_at: string
  }
  share: {
    id: string
    quote_document_version_id: string
    access_mode: "view" | "sign"
    expires_at: string | null
    created_at: string
  }
  customer_name: string | null
  quote_details?: PublicQuoteDetails | null
  interaction: PublicQuoteInteraction
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
    const value = source[key]
    if (typeof value === "boolean") return value
  }
  return undefined
}

function formatMoney(value?: number | null) {
  if (value == null) return "-"
  return `${value.toLocaleString("ko-KR")}원`
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function formatCompactDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function parseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  return fallback
}

function buildActionMessage({
  kind,
  quoteNumber,
  token,
  supplierName,
  recipientName,
  totalAmount,
}: {
  kind: "review_confirmed" | "proceed_requested"
  quoteNumber: string
  token: string
  supplierName: string
  recipientName: string
  totalAmount: number
}) {
  const heading =
    kind === "review_confirmed" ? "검토 완료 안내" : "견적 진행 요청"

  return [
    "안녕하세요,",
    "",
    kind === "review_confirmed"
      ? "견적 검토를 완료했습니다."
      : "견적 검토 후 진행 요청드립니다.",
    "",
    `견적번호: ${quoteNumber}`,
    `수신처: ${recipientName}`,
    `발신처: ${supplierName}`,
    `합계 금액: ${formatMoney(totalAmount)}`,
    `공개 토큰: ${token}`,
    "",
    `- ${heading}`,
  ].join("\n")
}

function buildMailtoLink(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function normalizeLineItem(value: unknown, index: number): PublicQuoteLineItem {
  const item = isRecord(value) ? value : {}
  const quantity = pickNumber(item, "quantity", "qty")
  const unitPrice = pickNumber(item, "unitPrice", "unit_price", "price")
  const lineSupplyAmount =
    pickNumber(item, "lineSupplyAmount", "amount") ??
    (quantity != null && unitPrice != null ? Math.max(0, Math.round(quantity * unitPrice)) : undefined)

  return {
    id: pickString(item, "id") ?? `line-${index + 1}`,
    sortOrder: pickNumber(item, "sortOrder", "sort_order") ?? index + 1,
    lineNumber: pickNumber(item, "lineNumber", "line_number") ?? index + 1,
    itemType: pickString(item, "itemType", "item_type"),
    itemCode: pickString(item, "itemCode", "item_code"),
    itemName:
      pickString(item, "itemName", "product_name", "name", "title") ?? `견적 품목 ${index + 1}`,
    itemDescription: pickString(item, "itemDescription", "description", "notes", "remark"),
    quantity,
    quantityUnit: pickString(item, "quantityUnit", "quantity_unit"),
    unitPrice,
    lineSupplyAmount,
    vatIncluded: pickBoolean(item, "vatIncluded", "vat_included"),
    lineStatus: pickString(item, "lineStatus", "line_status"),
    billingMode: pickString(item, "billingMode", "billing_mode"),
    remark: pickString(item, "remark"),
  }
}

function normalizeQuoteDetails(
  value: unknown,
  fallback: {
    customerName?: string | null
    title?: string | null
    quoteNumber?: string | null
    issuedAt?: string | null
    validUntil?: string | null
    subtotal?: number | null
    discountAmount?: number | null
    vatAmount?: number | null
    totalAmount?: number | null
  } = {}
): PublicQuoteDetails {
  const root = isRecord(value) ? value : {}
  const details = isRecord(root.quoteDetails) ? root.quoteDetails : root
  const lineItemsSource =
    Array.isArray(details.lineItems) ? details.lineItems :
    Array.isArray(details.items) ? details.items :
    Array.isArray(root.line_items) ? root.line_items :
    Array.isArray(root.items) ? root.items :
    []

  const lineItems = lineItemsSource.map((item, index) => normalizeLineItem(item, index))
  const subtotalFromLines = lineItems.reduce((sum, item) => sum + Number(item.lineSupplyAmount ?? 0), 0)
  const discountFromLines = lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 0)
    const unitPrice = Number(item.unitPrice ?? 0)
    const base = Math.max(0, Math.round(quantity * unitPrice))
    const amount = Number(item.lineSupplyAmount ?? 0)
    return sum + Math.max(0, base - amount)
  }, 0)

  const subtotalAmount = pickNumber(details, "subtotalAmount", "subtotal") ?? fallback.subtotal ?? subtotalFromLines
  const discountAmount =
    pickNumber(details, "discountAmount", "discount_amount") ?? fallback.discountAmount ?? discountFromLines
  const vatAmount =
    pickNumber(details, "vatAmount", "tax_amount", "taxAmount") ?? fallback.vatAmount ?? 0
  const grandTotalAmount =
    pickNumber(details, "grandTotalAmount", "total_amount", "totalAmount") ??
    fallback.totalAmount ??
    subtotalAmount + vatAmount - discountAmount

  return {
    templateId: pickString(details, "templateId", "template_id"),
    estimateNumber: pickString(details, "estimateNumber", "estimate_number") ?? fallback.quoteNumber ?? undefined,
    workflowStatus: pickString(details, "workflowStatus"),
    issuedAt: pickString(details, "issuedAt", "issued_at") ?? fallback.issuedAt ?? undefined,
    validUntil: pickString(details, "validUntil", "valid_until") ?? fallback.validUntil ?? undefined,
    subjectText:
      pickString(details, "subjectText", "title", "subject") ??
      fallback.title ??
      fallback.quoteNumber ??
      "견적서",
    recipientCompanyName:
      pickString(details, "recipientCompanyName", "customerName", "customer_name", "partner_name") ??
      fallback.customerName ??
      undefined,
    recipientContactName: pickString(details, "recipientContactName", "contact_name"),
    recipientPhone: pickString(details, "recipientPhone", "phone"),
    recipientEmail: pickString(details, "recipientEmail", "email"),
    referenceName: pickString(details, "referenceName"),
    supplierBusinessName: pickString(details, "supplierBusinessName", "supplier_name"),
    supplierBusinessRegistrationNumber: pickString(details, "supplierBusinessRegistrationNumber"),
    supplierRepresentativeName: pickString(details, "supplierRepresentativeName"),
    supplierAddress: pickString(details, "supplierAddress"),
    supplierContactName: pickString(details, "supplierContactName"),
    supplierContactPhone: pickString(details, "supplierContactPhone"),
    supplierContactEmail: pickString(details, "supplierContactEmail"),
    currencyUnitLabel: pickString(details, "currencyUnitLabel") ?? "원",
    vatIncluded: pickBoolean(details, "vatIncluded", "vat_included"),
    vatPolicyLabel: pickString(details, "vatPolicyLabel"),
    deliveryLocationNote: pickString(details, "deliveryLocationNote", "delivery_location_note"),
    paymentTerms: pickString(details, "paymentTerms"),
    installationPolicy: pickString(details, "installationPolicy"),
    warrantyNote: pickString(details, "warrantyNote"),
    generalNotes: pickString(details, "generalNotes", "notes"),
    specialTerms: pickString(details, "specialTerms"),
    footerContactText: pickString(details, "footerContactText"),
    subtotalAmount,
    vatAmount,
    discountAmount,
    grandTotalAmount,
    hasPendingAmounts: pickBoolean(details, "hasPendingAmounts", "has_pending_amounts"),
    pendingAmountNote: pickString(details, "pendingAmountNote", "pending_amount_note"),
    lineItems: lineItems.sort((left, right) => {
      const leftOrder = Number(left.sortOrder ?? left.lineNumber ?? 0)
      const rightOrder = Number(right.sortOrder ?? right.lineNumber ?? 0)
      return leftOrder - rightOrder
    }),
  }
}

function statusMeta(status: string) {
  const map: Record<string, { label: string; className: string; icon: ReactNode }> = {
    draft: {
      label: "초안",
      className: "bg-[#f0f0ec] text-[#1a1a1a]/55",
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    shared: {
      label: "공개",
      className: "bg-[#ECFDF5] text-[#084734]",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    },
    accepted: {
      label: "수락됨",
      className: "bg-[#D1FAE5] text-[#065c41]",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    },
    expired: {
      label: "만료됨",
      className: "bg-[#FEF3EE] text-[#B85C33]",
      icon: <XCircle className="h-3.5 w-3.5" />,
    },
    archived: {
      label: "보관됨",
      className: "bg-[#f0f0ec] text-[#1a1a1a]/45",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
    },
  }

  return map[status] ?? {
    label: status,
    className: "bg-[#f0f0ec] text-[#1a1a1a]/55",
    icon: null,
  }
}

function lineItemAmount(item: PublicQuoteLineItem) {
  if (item.lineSupplyAmount != null) return item.lineSupplyAmount
  if (item.quantity != null && item.unitPrice != null) {
    return Math.max(0, Math.round(item.quantity * item.unitPrice))
  }
  return null
}

export default function QuotePreviewPage() {
  const { id } = useParams<{ id: string }>()
  const token = Array.isArray(id) ? id[0] : id
  const quoteToken = token ?? ""
  const [quote, setQuote] = useState<PublicQuoteApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<"review_confirmed" | "proceed_requested" | null>(
    null
  )
  const [actionNotice, setActionNotice] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  )
  const [showAgreeModal, setShowAgreeModal] = useState(false)

  useEffect(() => {
    let alive = true

    async function loadQuote() {
      if (!token) {
        if (alive) {
          setError("token이 필요합니다")
          setLoading(false)
        }
        return
      }

      try {
        const response = await fetch(`/api/partner/quote?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        })
        const body = (await response.json().catch(() => ({}))) as Partial<PublicQuoteApiResponse> & {
          error?: string
        }

        if (!response.ok) {
          throw new Error(body.error ?? "견적서를 찾을 수 없습니다")
        }

        if (!alive) return
        setQuote(body as PublicQuoteApiResponse)
        setError(null)
      } catch (err) {
        if (alive) {
          setError(parseErrorMessage(err, "견적서를 찾을 수 없습니다"))
        }
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    void loadQuote()

    return () => {
      alive = false
    }
  }, [token])

  const details = useMemo(() => {
    if (!quote) return null
    return (
      quote.quote_details ??
      normalizeQuoteDetails(quote.version.structured_json, {
        customerName: quote.customer_name,
        title: quote.version.title,
        quoteNumber: quote.quote.quote_number,
        issuedAt: quote.version.created_at,
        validUntil: quote.version.valid_until,
        subtotal: quote.version.subtotal,
        discountAmount: quote.version.discount_amount,
        vatAmount: quote.version.tax_amount,
        totalAmount: quote.version.total_amount,
      })
    )
  }, [quote])

  const displayLines = details?.lineItems ?? []
  const hasStructuredLines = displayLines.length > 0
  const hasHtmlBody = Boolean(quote?.version.content_html)
  const title =
    details?.subjectText?.trim() ||
    quote?.version.title ||
    quote?.quote.quote_number ||
    "공개 견적서"
  const supplierName = details?.supplierBusinessName?.trim() || STANDARD_QUOTE_SUPPLIER.businessName
  const recipientName = details?.recipientCompanyName?.trim() || quote?.customer_name || "고객사"
  const issueDate = details?.issuedAt ?? quote?.version.created_at
  const validUntil = details?.validUntil ?? quote?.version.valid_until
  const validUntilText = validUntil ? formatDate(validUntil) : "유효기간 없음"
  const subtotalAmount = details?.subtotalAmount ?? quote?.version.subtotal ?? 0
  const discountAmount = details?.discountAmount ?? quote?.version.discount_amount ?? 0
  const vatAmount = details?.vatAmount ?? quote?.version.tax_amount ?? 0
  const totalAmount = details?.grandTotalAmount ?? quote?.version.total_amount ?? subtotalAmount + vatAmount - discountAmount
  const quoteStatus = statusMeta(quote?.quote.status ?? "draft")
  const interaction = quote?.interaction
  const supplierEmail = details?.supplierContactEmail?.trim()

  async function confirmReview() {
    if (!quote || !quoteToken) return

    setShowAgreeModal(false)
    setActionLoading("review_confirmed")
    setActionNotice(null)

    try {
      const response = await fetch("/api/partner/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: quoteToken, action: "review_confirmed" }),
      })
      const body = (await response.json().catch(() => ({}))) as Partial<PublicQuoteApiResponse> & {
        error?: string
      }

      if (!response.ok) {
        throw new Error(body.error ?? "진행 동의를 접수하지 못했습니다")
      }

      setQuote(body as PublicQuoteApiResponse)
      setActionNotice({ tone: "success", text: "진행 동의가 접수되었습니다. 담당자가 다음 단계를 안내드립니다." })
    } catch (err) {
      setActionNotice({ tone: "error", text: parseErrorMessage(err, "진행 동의를 접수하지 못했습니다") })
    } finally {
      setActionLoading(null)
    }
  }

  async function requestProceed() {
    if (!quote) return
    if (!quoteToken) {
      setActionNotice({ tone: "error", text: "token이 필요합니다" })
      return
    }

    const subject = `[견적 진행 요청] ${quote.quote.quote_number}`
    const body = buildActionMessage({
      kind: "proceed_requested",
      quoteNumber: quote.quote.quote_number,
      token: quoteToken,
      supplierName,
      recipientName,
      totalAmount,
    })

    if (supplierEmail) {
      window.location.href = buildMailtoLink(supplierEmail, subject, body)
      setActionNotice({ tone: "success", text: "진행 요청 메일 작성 창을 열었습니다." })
      return
    }

    try {
      await navigator.clipboard.writeText(body)
      setActionNotice({ tone: "success", text: "진행 요청 문구를 복사했습니다." })
    } catch (err) {
      setActionNotice({ tone: "error", text: parseErrorMessage(err, "진행 요청 문구를 복사하지 못했습니다") })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f8f7f2_0%,#f5f3ee_100%)]">
        <p className="text-sm text-[#1a1a1a]/40">견적서를 불러오는 중...</p>
      </div>
    )
  }

  if (error || !quote || !details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f8f7f2_0%,#f5f3ee_100%)] p-4">
        <div className="w-full max-w-md rounded-3xl border border-[#e8e8e4] bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[#B85C33]" />
          <h2 className="mb-2 text-base font-semibold text-[#1a1a1a]">견적서를 찾을 수 없습니다</h2>
          <p className="text-sm text-[#1a1a1a]/50">{error ?? "유효하지 않은 링크입니다."}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fbfaf5_0%,#f4f1e9_42%,#f3f2ee_100%)] px-4 py-10 text-[#1a1a1a] print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between print:hidden">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e8e8e4] bg-white px-3 py-1.5 text-xs text-[#1a1a1a]/50 shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#084734]" />
            공개 견적서
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2 text-sm text-[#1a1a1a]/60 transition-colors hover:bg-[#fafafa] hover:text-[#1a1a1a]"
          >
            <Printer className="h-4 w-4" />
            인쇄 / PDF 저장
          </button>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[#e8e8e4] bg-white shadow-[0_18px_60px_rgba(26,26,26,0.08)] print:rounded-none print:border-none print:shadow-none">
          <div className="border-b border-[#e8e8e4] px-8 py-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1a1a1a]/35">견 적 서</p>
                  <h1 className="text-2xl font-semibold leading-tight text-[#1a1a1a] md:text-[2rem]">{title}</h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-[#1a1a1a]/42">{quote.quote.quote_number}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${quoteStatus.className}`}
                    >
                      {quoteStatus.icon}
                      {quoteStatus.label}
                    </span>
                    {quote.share.expires_at && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f7f5] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/55">
                        <Clock className="h-3.5 w-3.5" />
                        만료 {formatCompactDate(quote.share.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
                {details.subjectText && details.subjectText !== title && (
                  <p className="max-w-2xl text-sm leading-6 text-[#1a1a1a]/55">{details.subjectText}</p>
                )}
              </div>

              <div className="grid gap-3 rounded-2xl bg-[#fafaf8] p-4 text-sm md:min-w-[260px]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">발신</p>
                  <p className="mt-1 font-semibold text-[#1a1a1a]">{supplierName}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-dashed border-[#e8e8e4] pt-3">
                  <div>
                    <p className="text-[11px] text-[#1a1a1a]/35">발행일</p>
                    <p className="mt-1 font-medium text-[#1a1a1a]">{formatDate(issueDate)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#1a1a1a]/35">유효기간</p>
                    <p className="mt-1 font-medium text-[#1a1a1a]">{validUntilText}</p>
                  </div>
                </div>
              </div>
            </div>

            {interaction && (
              <div className="mt-6 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-5 py-4 print:hidden">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/30">응답 상태</p>
                    <p className="text-sm leading-6 text-[#1a1a1a]/62">{interaction.helperText}</p>
                    {interaction.summary.viewCount > 0 && (
                      <p className="text-xs text-[#1a1a1a]/42">
                        최근 열람 {interaction.summary.viewCount}회
                        {interaction.summary.lastViewedAt ? ` · ${formatCompactDate(interaction.summary.lastViewedAt)}` : ""}
                        {interaction.summary.reviewConfirmedAt
                          ? ` · 진행 동의 ${formatCompactDate(interaction.summary.reviewConfirmedAt)}`
                          : ""}
                      </p>
                    )}
                    {actionNotice && (
                      <p
                        className={`text-sm font-medium ${
                          actionNotice.tone === "error" ? "text-[#B85C33]" : "text-[#084734]"
                        }`}
                      >
                        {actionNotice.text}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {interaction.canConfirmReview ? (
                      <button
                        type="button"
                        onClick={() => setShowAgreeModal(true)}
                        disabled={actionLoading === "review_confirmed"}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#084734] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {actionLoading === "review_confirmed" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {interaction.primaryActionLabel}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-xl bg-[#ECFDF5] px-4 py-2 text-sm font-medium text-[#084734]">
                        <CheckCircle2 className="h-4 w-4" />
                        동의 완료됨
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-0 border-b border-[#e8e8e4] md:grid-cols-2" style={{ breakInside: "avoid" }}>
            <div className="border-b border-[#e8e8e4] px-8 py-6 md:border-b-0 md:border-r">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/30">수신</p>
              <p className="mt-2 text-lg font-semibold text-[#1a1a1a]">{recipientName}</p>
              {details.recipientContactName && (
                <p className="mt-1 text-sm text-[#1a1a1a]/55">{details.recipientContactName}</p>
              )}
              <p className="mt-1 text-sm text-[#1a1a1a]/45">귀중</p>
            </div>
            <div className="px-8 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/30">발신</p>
              <p className="mt-2 text-lg font-semibold text-[#1a1a1a]">
                {details.supplierBusinessName?.trim() || STANDARD_QUOTE_SUPPLIER.businessName}
              </p>
              <div className="mt-3 grid gap-2 text-sm text-[#1a1a1a]/58">
                {(details.supplierBusinessRegistrationNumber || STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber) && (
                  <p>사업자등록번호: {details.supplierBusinessRegistrationNumber ?? STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber}</p>
                )}
                <p>대표: {details.supplierRepresentativeName ?? STANDARD_QUOTE_SUPPLIER.representativeName}</p>
                <p>주소: {details.supplierAddress ?? STANDARD_QUOTE_SUPPLIER.address}</p>
                <p>담당: {details.supplierContactName ?? STANDARD_QUOTE_SUPPLIER.contactName}</p>
                <p>연락처: {details.supplierContactPhone ?? STANDARD_QUOTE_SUPPLIER.contactPhone}</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-7">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/30">견적 내역</p>
                <p className="mt-1 text-sm text-[#1a1a1a]/45">
                  {hasStructuredLines
                    ? "표준 템플릿 데이터에 맞춰 항목을 정리했습니다."
                    : "구조화된 항목이 없어 원문 중심으로 표시합니다."}
                </p>
              </div>
              {details.currencyUnitLabel && <p className="text-xs text-[#1a1a1a]/35">단위: {details.currencyUnitLabel}</p>}
            </div>

            {hasStructuredLines ? (
              <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] print:rounded-none print:border print:border-[#ccc]">
                <table className="w-full border-collapse text-sm" style={{ breakInside: "avoid" }}>
                  <thead className="bg-[#fafaf8]" style={{ display: "table-header-group" }}>
                    <tr className="border-b border-[#e8e8e4] text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/35">
                      <th className="px-4 py-3">품목</th>
                      <th className="px-4 py-3">설명</th>
                      <th className="px-4 py-3 text-center">수량</th>
                      <th className="px-4 py-3 text-right">단가</th>
                      <th className="px-4 py-3 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayLines.map((item, index) => {
                      const amount = lineItemAmount(item)
                      const isSeparateBilling = item.billingMode === "separate_invoice" || item.lineStatus === "separate_billing"
                      const isPending = item.lineStatus === "pending_price" || item.unitPrice == null || amount == null

                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-[#f0f0ec] last:border-b-0 ${
                            index % 2 === 0 ? "bg-white" : "bg-[#fcfcfb]"
                          }`}
                        >
                          <td className="px-4 py-4 align-top font-medium text-[#1a1a1a]">{item.itemName}</td>
                          <td className="px-4 py-4 align-top text-sm text-[#1a1a1a]/55">
                            <div className="space-y-1">
                              <p>{item.itemDescription ?? "—"}</p>
                              {(item.remark || isSeparateBilling || isPending) && (
                                <div className="flex flex-wrap gap-1.5">
                                  {item.remark && (
                                    <span className="rounded-full bg-[#f7f7f5] px-2 py-0.5 text-[11px] text-[#1a1a1a]/50">
                                      {item.remark}
                                    </span>
                                  )}
                                  {isSeparateBilling && (
                                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] text-[#084734]">
                                      별도 청구
                                    </span>
                                  )}
                                  {isPending && (
                                    <span className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] text-[#B85C33]">
                                      금액 미정
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top text-center text-[#1a1a1a]/70">
                            {item.quantity == null ? "—" : `${item.quantity}${item.quantityUnit ?? ""}`}
                          </td>
                          <td className="px-4 py-4 align-top text-right text-[#1a1a1a]/70">
                            {item.unitPrice == null ? "—" : formatMoney(item.unitPrice)}
                          </td>
                          <td className="px-4 py-4 align-top text-right font-semibold text-[#1a1a1a]">
                            {amount == null ? "—" : amount > 0 ? formatMoney(amount) : "포함"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : hasHtmlBody ? (
              <div
                className="prose prose-sm max-w-none rounded-2xl border border-[#e8e8e4] px-6 py-5 text-[#1a1a1a]"
                dangerouslySetInnerHTML={{ __html: quote.version.content_html ?? "" }}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-[#e8e8e4] px-6 py-10 text-center text-sm text-[#1a1a1a]/45">
                표시할 품목 정보가 없습니다.
              </div>
            )}
          </div>

          <div className="border-t border-[#e8e8e4] px-8 py-7" style={{ breakInside: "avoid" }}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] print:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                {details.generalNotes && (
                  <div className="rounded-2xl bg-[#fafaf8] px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/30">비고</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#1a1a1a]/68">
                      {details.generalNotes}
                    </p>
                  </div>
                )}
                {(details.paymentTerms || details.installationPolicy || details.warrantyNote || details.specialTerms) && (
                  <div className="grid gap-3 rounded-2xl border border-[#e8e8e4] p-5 text-sm text-[#1a1a1a]/68">
                    {details.paymentTerms && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/30">결제 조건</p>
                        <p className="mt-1 whitespace-pre-line leading-6">{details.paymentTerms}</p>
                      </div>
                    )}
                    {details.installationPolicy && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/30">설치 정책</p>
                        <p className="mt-1 whitespace-pre-line leading-6">{details.installationPolicy}</p>
                      </div>
                    )}
                    {details.warrantyNote && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/30">보증</p>
                        <p className="mt-1 whitespace-pre-line leading-6">{details.warrantyNote}</p>
                      </div>
                    )}
                    {details.specialTerms && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]/30">특약</p>
                        <p className="mt-1 whitespace-pre-line leading-6">{details.specialTerms}</p>
                      </div>
                    )}
                  </div>
                )}
                {details.hasPendingAmounts && details.pendingAmountNote && (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                    {details.pendingAmountNote}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-[#e8e8e4] bg-[#fbfbfa] p-5" style={{ breakInside: "avoid" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/30">금액 요약</p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between text-[#1a1a1a]/58">
                    <span>공급가액</span>
                    <span className="font-medium text-[#1a1a1a]">{formatMoney(subtotalAmount)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex items-center justify-between text-[#1a1a1a]/58">
                      <span>할인금액</span>
                      <span className="font-medium text-[#B85C33]">- {formatMoney(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[#1a1a1a]/58">
                    <span>{details.vatPolicyLabel ?? STANDARD_QUOTE_DEFAULT_VAT_LABEL}</span>
                    <span className="font-medium text-[#1a1a1a]">{formatMoney(vatAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#e8e8e4] pt-3 text-base">
                    <span className="font-semibold text-[#1a1a1a]">합계 금액</span>
                    <span className="text-lg font-bold text-[#1a1a1a]">{formatMoney(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {hasHtmlBody && hasStructuredLines && (
              <div className="mt-6 rounded-2xl border border-[#e8e8e4] bg-white px-6 py-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/30">원문</p>
                  <p className="text-xs text-[#1a1a1a]/35">구조화 데이터와 함께 보관된 HTML 버전입니다.</p>
                </div>
                <div
                  className="prose prose-sm max-w-none text-[#1a1a1a]"
                  dangerouslySetInnerHTML={{ __html: quote.version.content_html ?? "" }}
                />
              </div>
            )}
          </div>

          <div className="border-t border-[#e8e8e4] bg-[#fafafa] px-8 py-5">
            <div className="flex flex-col gap-2 text-xs text-[#1a1a1a]/35 md:flex-row md:items-center md:justify-between">
              <p>본 견적서는 공개 링크를 통해 확인할 수 있습니다.</p>
              <p>
                {supplierName} · {quote.quote.quote_number}
              </p>
            </div>
          </div>
        </div>

        <p className="pb-6 text-center text-xs text-[#1a1a1a]/30 print:hidden">
          인쇄 시 배경색을 포함하려면 브라우저 인쇄 옵션에서 &quot;배경 그래픽&quot;을 활성화하세요.
        </p>
      </div>

      {/* ── 진행 동의 확인 모달 ───────────────────────────────── */}
      {showAgreeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
            <h3 className="text-lg font-semibold text-[#111110]">진행 동의 확인</h3>
            <p className="mt-3 text-sm leading-6 text-[#615D59]">
              이 견적 내용에 동의하고 다음 단계(계약) 진행을 요청합니다.
              <br />
              동의 후에는 취소할 수 없으며, 담당자에게 알림이 전송됩니다.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAgreeModal(false)}
                className="rounded-lg border border-[#e8e8e4] px-4 py-2 text-sm font-medium text-[#615D59] hover:bg-[#fafafa]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmReview}
                className="rounded-lg bg-[#084734] px-5 py-2 text-sm font-medium text-white hover:bg-[#065c41]"
              >
                동의합니다
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
