"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Send,
} from "lucide-react"

import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import QuickQuoteComposer, {
  type QuickQuoteCreatedPayload,
  type QuickQuoteManagerOption,
  type QuickQuotePrefill,
} from "@/components/portal/quotes/QuickQuoteComposer"
import { portalFetch } from "@/lib/portal/portal-fetch"
import type { PartnerDocumentListItem } from "@/lib/portal/types"
import {
  DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID,
  resolveQuoteProductLine,
  type QuoteProductLine,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

type HardwareQuoteRow = {
  id: string
  quoteNumber: string
  title: string
  customerName: string
  dealTitle: string
  totalAmount: number
  status: string
  shareCount: number
  versionCount: number
  latestVersionNumber: number | null
  latestShareCreatedAt: string | null
  viewCount: number
  lastViewedAt: string | null
  reviewConfirmedAt: string | null
  acceptedAt: string | null
  shareUrl: string | null
  updatedAt: string
  /** SW/HW 제품군. 목록 API가 templateId를 주지 않아 제목·거래명 기준 추정이다(불명확하면 HW). */
  productLine: QuoteProductLine
  createdAction?: QuickQuoteCreatedPayload["action"]
}

type DocumentsPayload = {
  documents?: PartnerDocumentListItem[]
}

type SharePayload = {
  shareUrl?: string
  document?: {
    status?: string
    updated_at?: string
  }
}

type QuoteFilter = "all" | "draft" | "shared" | "accepted" | "needs_action"
type QuoteSortKey = "recent" | "amount" | "response"
type HardwareQuoteQuickAction = "new" | StandardQuoteTemplateId

type HardwareQuoteQuickActionRequest = {
  key: string
  action: HardwareQuoteQuickAction
} | null

type HardwareQuotesPanelProps = {
  quickAction?: HardwareQuoteQuickActionRequest
  onQuickActionConsumed?: () => void
  /** 딜/고객 컨텍스트에서 진입한 프리필 대상(있으면 작성기가 기존 고객·거래를 자동 선택). */
  prefill?: QuickQuotePrefill | null
}

const ACTION_LABEL: Record<QuickQuoteCreatedPayload["action"], string> = {
  save: "저장됨",
  save_and_preview: "미리보기",
  save_and_send: "전송 준비",
}

const FILTER_OPTIONS: Array<{ key: QuoteFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "needs_action", label: "후속 필요" },
  { key: "draft", label: "작성 중" },
  { key: "shared", label: "발송됨" },
  { key: "accepted", label: "동의 완료" },
]

const PRODUCT_LINE_OPTIONS: Array<{ key: QuoteProductLine | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "software", label: "소프트웨어" },
  { key: "hardware", label: "하드웨어" },
]

const PRODUCT_LINE_BADGE: Record<QuoteProductLine, { label: string; className: string; title: string }> = {
  software: {
    label: "SW",
    className: "bg-[#ECFDF5] text-[#084734] ring-[#BDEFD8]",
    title: "소프트웨어 견적 (공급자: 클래스인)",
  },
  hardware: {
    label: "HW",
    className: "bg-[#f6f5f2] text-[#615D59] ring-[#e8e8e4]",
    title: "하드웨어 견적 (공급자: 퀴드러닝)",
  },
}

const SORT_OPTIONS: Array<{ key: QuoteSortKey; label: string }> = [
  { key: "recent", label: "최신순" },
  { key: "amount", label: "금액 높은순" },
  { key: "response", label: "응답 최신순" },
]

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_approval: {
    label: "승인 대기",
    className: "bg-[#FFF7ED] text-[#B85C33] ring-[#FED7AA]",
  },
  draft: {
    label: "작성 중",
    className: "bg-[#f6f5f2] text-[#615D59] ring-[#e8e8e4]",
  },
  shared: {
    label: "발송됨",
    className: "bg-[#ECFDF5] text-[#084734] ring-[#D1FAE5]",
  },
  accepted: {
    label: "동의 완료",
    className: "bg-[#D1FAE5] text-[#065c41] ring-[#B7E8D1]",
  },
  expired: {
    label: "만료",
    className: "bg-[#FEF3EE] text-[#B85C33] ring-[#F6D5C5]",
  },
  archived: {
    label: "보관",
    className: "bg-white text-[#1a1a1a]/45 ring-[#e8e8e4]",
  },
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the textarea fallback.
    }
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

function prepareShareWindow() {
  const target = window.open("about:blank", "_blank")
  if (!target) return null

  try {
    target.document.title = "견적서 링크 준비 중"
    target.document.body.style.fontFamily = "system-ui, sans-serif"
    target.document.body.style.padding = "24px"
    target.document.body.textContent = "견적서 링크를 준비하는 중입니다."
  } catch {
    // Navigation can still work even if the temporary document is restricted.
  }

  return target
}

function openShareUrl(url: string, preparedWindow?: Window | null) {
  if (preparedWindow && !preparedWindow.closed) {
    preparedWindow.opener = null
    preparedWindow.location.href = url
    return
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer")
  if (!opened) {
    window.location.href = url
  }
}

function openAdminQuoteView(quoteId: string) {
  const url = `/admin/quotes/${quoteId}/view`
  const opened = window.open(url, "_blank")
  if (!opened) {
    window.location.href = url
  }
}

function mapDocumentToQuoteRow(document: PartnerDocumentListItem): HardwareQuoteRow {
  return {
    id: document.id,
    quoteNumber: document.document_number,
    title: document.title ?? document.deal_title ?? "견적서",
    customerName: document.customer_name ?? "기관 미지정",
    dealTitle: document.deal_title,
    totalAmount: document.total_amount ?? 0,
    status: document.status,
    shareCount: document.share_count,
    versionCount: document.version_count,
    latestVersionNumber: document.latest_version_number,
    latestShareCreatedAt: document.latest_share_created_at ?? null,
    viewCount: document.view_count ?? 0,
    lastViewedAt: document.last_viewed_at ?? null,
    reviewConfirmedAt: document.review_confirmed_at ?? null,
    acceptedAt: document.accepted_at ?? null,
    shareUrl: null,
    updatedAt: document.updated_at,
    productLine: resolveQuoteProductLine({
      templateId: document.template_id ?? null,
      title: document.title ?? null,
      dealTitle: document.deal_title ?? null,
    }),
  }
}

function getStatusMeta(status: string) {
  return STATUS_META[status] ?? {
    label: status,
    className: "bg-white text-[#1a1a1a]/50 ring-[#e8e8e4]",
  }
}

function getResponseMeta(quote: HardwareQuoteRow) {
  if (quote.acceptedAt || quote.status === "accepted") {
    return { label: "동의 확인", dotClassName: "bg-[#084734]", textClassName: "text-[#084734]" }
  }
  if (quote.reviewConfirmedAt) {
    return { label: "검토 확인", dotClassName: "bg-[#084734]", textClassName: "text-[#084734]" }
  }
  if (quote.status === "expired") {
    return { label: "만료됨", dotClassName: "bg-[#B85C33]", textClassName: "text-[#B85C33]" }
  }
  if (quote.lastViewedAt) {
    return { label: `열람 ${quote.viewCount}회`, dotClassName: "bg-[#084734]", textClassName: "text-[#111110]" }
  }
  if (quote.status === "shared" || quote.shareCount > 0 || quote.shareUrl) {
    return { label: "열람 대기", dotClassName: "bg-[#A8741A]", textClassName: "text-[#A8741A]" }
  }
  return { label: "미발송", dotClassName: "bg-[#c9c7c2]", textClassName: "text-[#1a1a1a]/45" }
}

/** 마지막 고객 반응(동의 > 검토 > 열람 > 발송) 시점 — 로그 라인의 상대시간 표기에 사용. */
function getLatestInteractionAt(quote: HardwareQuoteRow) {
  return quote.acceptedAt ?? quote.reviewConfirmedAt ?? quote.lastViewedAt ?? quote.latestShareCreatedAt
}

const UNRESPONSIVE_WARN_DAYS = 3

/** 발송 후 미열람 상태로 경과한 일수. 경고 기준 미만이거나 반응이 있으면 null. */
function getUnresponsiveDays(quote: HardwareQuoteRow) {
  if (quote.acceptedAt || quote.reviewConfirmedAt || quote.lastViewedAt) return null
  if (!isQuoteShared(quote) || !quote.latestShareCreatedAt) return null

  const sharedAt = Date.parse(quote.latestShareCreatedAt)
  if (Number.isNaN(sharedAt)) return null

  const days = Math.floor((Date.now() - sharedAt) / 86_400_000)
  return days >= UNRESPONSIVE_WARN_DAYS ? days : null
}

function formatRelativeTime(value: string | null) {
  if (!value) return null
  const time = Date.parse(value)
  if (Number.isNaN(time)) return null

  const diffMinutes = Math.floor((Date.now() - time) / 60_000)
  if (diffMinutes < 1) return "방금"
  if (diffMinutes < 60) return `${diffMinutes}분 전`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}일 전`

  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(time))
}

function getInteractionHint(quote: HardwareQuoteRow) {
  if (quote.acceptedAt) return `${formatDateTime(quote.acceptedAt)} 동의`
  if (quote.reviewConfirmedAt) return `${formatDateTime(quote.reviewConfirmedAt)} 검토`
  if (quote.lastViewedAt) return `${formatDateTime(quote.lastViewedAt)} 마지막 열람`
  if (quote.latestShareCreatedAt) return `${formatDateTime(quote.latestShareCreatedAt)} 발송`
  return quote.shareCount > 0 || quote.shareUrl ? "링크 발송됨" : "링크 미생성"
}

function isQuoteShared(quote: HardwareQuoteRow) {
  return quote.status === "shared" || quote.shareCount > 0 || Boolean(quote.shareUrl)
}

function needsQuoteFollowUp(quote: HardwareQuoteRow) {
  if (quote.status === "accepted" || quote.acceptedAt) return false
  if (quote.status === "draft" || quote.status === "pending_approval") return true
  if (isQuoteShared(quote) && !quote.lastViewedAt && !quote.reviewConfirmedAt) return true
  if (quote.lastViewedAt && !quote.reviewConfirmedAt) return true
  return false
}

function getNextActionMeta(quote: HardwareQuoteRow) {
  if (quote.status === "accepted" || quote.acceptedAt) {
    return { label: "계약 전환", textClassName: "text-[#084734]" }
  }

  if (quote.status === "draft" || quote.status === "pending_approval") {
    return { label: "검토 후 발송", textClassName: "text-[#A8741A]" }
  }

  if (isQuoteShared(quote) && !quote.lastViewedAt) {
    return { label: "열람 리마인드", textClassName: "text-[#A8741A]" }
  }

  if (quote.lastViewedAt && !quote.reviewConfirmedAt) {
    return { label: "조건 확인", textClassName: "text-[#615D59]" }
  }

  return { label: "기록 확인", textClassName: "text-[#1a1a1a]/45" }
}

function getResponseTime(quote: HardwareQuoteRow) {
  return Math.max(
    Date.parse(quote.acceptedAt ?? "") || 0,
    Date.parse(quote.reviewConfirmedAt ?? "") || 0,
    Date.parse(quote.lastViewedAt ?? "") || 0,
    Date.parse(quote.latestShareCreatedAt ?? "") || 0,
    Date.parse(quote.updatedAt) || 0
  )
}

function templateIdFromQuickAction(action: HardwareQuoteQuickAction): StandardQuoteTemplateId {
  return action === "new" ? DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID : action
}

export default function HardwareQuotesPanel({
  quickAction = null,
  onQuickActionConsumed,
  prefill = null,
}: HardwareQuotesPanelProps) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerTemplateId, setComposerTemplateId] = useState<StandardQuoteTemplateId>(
    DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID
  )
  const [quotes, setQuotes] = useState<HardwareQuoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sharingQuoteId, setSharingQuoteId] = useState<string | null>(null)
  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState<QuoteFilter>("all")
  const [productLineFilter, setProductLineFilter] = useState<QuoteProductLine | "all">("all")
  const [sortKey, setSortKey] = useState<QuoteSortKey>("recent")
  const handledQuickActionKeyRef = useRef<string | null>(null)

  // 견적 작성기의 "공급자 담당자" 드롭다운 후보. 어드민 전용 훅이라 여기서 읽어 주입한다
  // (컴포저는 포털에서도 쓰이므로 admin-client 를 직접 import 하지 않는다).
  const { owners: crmOwners } = useCrmOwners()
  const supplierManagerOptions = useMemo<QuickQuoteManagerOption[]>(() => {
    const seen = new Set<string>()
    const options: QuickQuoteManagerOption[] = []

    for (const owner of crmOwners) {
      const name = owner.displayName?.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      options.push({
        name,
        label: owner.teamRoleLabel ? `${name} · ${owner.teamRoleLabel}` : name,
        // admin_profiles 에 연락처 컬럼이 없다 — 연락처는 작성자가 직접 입력한다.
        phone: null,
      })
    }

    return options
  }, [crmOwners])

  const summary = useMemo(() => {
    return {
      total: quotes.length,
      draft: quotes.filter((quote) => quote.status === "draft" || quote.status === "pending_approval").length,
      shared: quotes.filter((quote) => isQuoteShared(quote)).length,
      accepted: quotes.filter((quote) => quote.status === "accepted" || quote.acceptedAt).length,
      needsAction: quotes.filter((quote) => needsQuoteFollowUp(quote)).length,
    }
  }, [quotes])

  const filterCounts: Record<QuoteFilter, number> = {
    all: summary.total,
    needs_action: summary.needsAction,
    draft: summary.draft,
    shared: summary.shared,
    accepted: summary.accepted,
  }

  const productLineCounts: Record<QuoteProductLine | "all", number> = {
    all: quotes.length,
    software: quotes.filter((quote) => quote.productLine === "software").length,
    hardware: quotes.filter((quote) => quote.productLine === "hardware").length,
  }

  const visibleQuotes = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase()

    return quotes
      .filter((quote) => {
        if (productLineFilter !== "all" && quote.productLine !== productLineFilter) return false
        if (activeFilter === "draft" && quote.status !== "draft" && quote.status !== "pending_approval") return false
        if (activeFilter === "shared" && !isQuoteShared(quote)) return false
        if (activeFilter === "accepted" && quote.status !== "accepted" && !quote.acceptedAt) return false
        if (activeFilter === "needs_action" && !needsQuoteFollowUp(quote)) return false

        if (!normalizedQuery) return true

        return [
          quote.quoteNumber,
          quote.title,
          quote.customerName,
          quote.dealTitle,
          quote.status,
        ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery))
      })
      .sort((left, right) => {
        if (sortKey === "amount") return right.totalAmount - left.totalAmount
        if (sortKey === "response") return getResponseTime(right) - getResponseTime(left)
        return (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0)
      })
  }, [activeFilter, productLineFilter, quotes, searchTerm, sortKey])

  const hasActiveControls =
    activeFilter !== "all" ||
    productLineFilter !== "all" ||
    searchTerm.trim().length > 0 ||
    sortKey !== "recent"

  function resetListControls() {
    setSearchTerm("")
    setActiveFilter("all")
    setProductLineFilter("all")
    setSortKey("recent")
  }

  const recentQuotes = useMemo(
    () =>
      quotes.slice(0, 5).map((quote) => ({
        id: quote.id,
        title: quote.title,
        customerName: quote.customerName,
        updatedAt: quote.updatedAt,
        totalAmount: quote.totalAmount,
        currentVersionLabel:
          quote.latestVersionNumber == null
            ? null
            : `v${quote.latestVersionNumber} · ${formatMoney(quote.totalAmount)}`,
      })),
    [quotes]
  )

  async function loadQuotes() {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await portalFetch("/api/portal/documents?type=quote")
      const payload = (await response.json().catch(() => null)) as
        | (DocumentsPayload & { error?: string })
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "견적서 목록을 불러오지 못했습니다.")
      }

      const nextQuotes = (Array.isArray(payload?.documents) ? payload.documents : []).map(mapDocumentToQuoteRow)
      setQuotes(nextQuotes)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "견적서 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }

  async function handleConvertToContract(quote: HardwareQuoteRow) {
    if (convertingQuoteId) return

    const confirmed = window.confirm(
      `견적 ${quote.quoteNumber}을(를) 계약으로 전환합니다.\n\n` +
        `· 이 견적 내용으로 연결된 계약서가 생성됩니다\n` +
        `· 딜 단계가 '계약'으로 전진합니다(이미 그 이후면 그대로)\n` +
        `· 관련 견적 할 일이 완료 처리됩니다\n\n계속할까요?`
    )
    if (!confirmed) return

    setConvertingQuoteId(quote.id)
    setNotice(null)

    try {
      const response = await portalFetch(`/api/portal/quotes/${quote.id}/convert`, {
        method: "POST",
      })
      const payload = (await response.json().catch(() => null)) as
        | { contract?: { contract_number?: string }; error?: string }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "계약 전환에 실패했습니다.")
      }

      const contractNumber = payload?.contract?.contract_number
      setNotice({
        tone: "success",
        message: contractNumber
          ? `계약 ${contractNumber} 생성 · 딜 단계가 '계약'으로 전진했습니다.`
          : "견적을 계약으로 전환했습니다.",
      })
      await loadQuotes()
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "계약 전환에 실패했습니다.",
      })
    } finally {
      setConvertingQuoteId(null)
    }
  }

  useEffect(() => {
    void loadQuotes()
  }, [])

  useEffect(() => {
    if (!quickAction) return
    if (handledQuickActionKeyRef.current === quickAction.key) return

    handledQuickActionKeyRef.current = quickAction.key
    setComposerTemplateId(templateIdFromQuickAction(quickAction.action))
    setComposerOpen(true)
    onQuickActionConsumed?.()
  }, [onQuickActionConsumed, quickAction])

  async function handleCreated(payload: QuickQuoteCreatedPayload) {
    const nextQuote: HardwareQuoteRow = {
      id: payload.document.id,
      quoteNumber: payload.document.quote_number,
      title: payload.version.title,
      customerName: payload.customer.name,
      dealTitle: payload.deal.title,
      totalAmount: payload.version.total_amount,
      status: payload.share ? "shared" : payload.document.status,
      shareCount: payload.share ? 1 : 0,
      versionCount: 1,
      latestVersionNumber: payload.version.version_number,
      latestShareCreatedAt: payload.share?.created_at ?? null,
      viewCount: 0,
      lastViewedAt: null,
      reviewConfirmedAt: null,
      acceptedAt: null,
      shareUrl: payload.shareUrl ?? null,
      updatedAt: payload.document.updated_at,
      // 작성기가 쓴 템플릿을 그대로 받으므로 방금 만든 행은 추정 없이 유형이 확정된다.
      productLine: resolveQuoteProductLine({
        templateId: payload.templateId,
        title: payload.version.title,
        dealTitle: payload.deal.title,
      }),
      createdAction: payload.action,
    }

    setQuotes((current) => [
      nextQuote,
      ...current.filter((item) => item.id !== payload.document.id),
    ])
  }

  async function ensureShareUrl(quote: HardwareQuoteRow) {
    if (quote.shareUrl) return quote.shareUrl

    setSharingQuoteId(quote.id)
    setNotice(null)

    try {
      const response = await portalFetch(`/api/portal/quotes/${quote.id}/share`, {
        method: "POST",
      })
      const payload = (await response.json().catch(() => null)) as SharePayload | { error?: string } | null

      if (!response.ok || !payload || !("shareUrl" in payload) || !payload.shareUrl) {
        throw new Error(payload && "error" in payload ? payload.error : "공유 링크를 준비하지 못했습니다.")
      }

      const shareUrl = payload.shareUrl
      setQuotes((current) =>
        current.map((item) =>
          item.id === quote.id
            ? {
                ...item,
                status: payload.document?.status ?? "shared",
                shareCount: Math.max(1, item.shareCount),
                latestShareCreatedAt: item.latestShareCreatedAt ?? new Date().toISOString(),
                shareUrl,
                updatedAt: payload.document?.updated_at ?? item.updatedAt,
              }
            : item
        )
      )
      return shareUrl
    } finally {
      setSharingQuoteId(null)
    }
  }

  async function handleCopyShareLink(quote: HardwareQuoteRow) {
    try {
      const shareUrl = await ensureShareUrl(quote)
      await copyTextToClipboard(shareUrl)
      setNotice({ tone: "success", message: `${quote.quoteNumber} 공유 링크를 복사했습니다.` })
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "공유 링크 복사에 실패했습니다.",
      })
    }
  }

  async function handleOpenShareLink(quote: HardwareQuoteRow) {
    const shareWindow = prepareShareWindow()

    try {
      const shareUrl = await ensureShareUrl(quote)
      openShareUrl(shareUrl, shareWindow)
    } catch (error) {
      if (shareWindow && !shareWindow.closed) {
        shareWindow.close()
      }
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "공유 링크 열기에 실패했습니다.",
      })
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:px-6 sm:py-5">
      {notice && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]"
              : "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
          }`}
        >
          {notice.tone === "success" ? <Check className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
          <span>{notice.message}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[#e8e8e4] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0ec] px-4 py-2.5 sm:px-5">
          <span className="text-[11px] font-semibold text-[#1a1a1a]/45">유형</span>
          <div className="inline-flex items-center rounded-full border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
            {PRODUCT_LINE_OPTIONS.map((option) => {
              const active = productLineFilter === option.key

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setProductLineFilter(option.key)}
                  aria-pressed={active}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
                    active ? "bg-white text-[#111110] shadow-sm" : "text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {option.label}
                  <span className={`tabular-nums ${active ? "text-[#1a1a1a]/40" : "text-[#1a1a1a]/35"}`}>
                    {productLineCounts[option.key]}
                  </span>
                </button>
              )
            })}
          </div>
          <span className="text-[11px] text-[#1a1a1a]/35">
            SW = 구독형(클래스인) · HW = 장비(퀴드러닝)
          </span>
        </div>

        <div className="admin-scroll-snap-x no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-[#f0f0ec] px-4 py-3 sm:px-5">
          {FILTER_OPTIONS.map((option) => {
            const count = filterCounts[option.key]
            const active = activeFilter === option.key
            const emphasize = option.key === "needs_action" && count > 0 && !active

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveFilter(option.key)}
                aria-pressed={active}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition-colors ${
                  active
                    ? "bg-[#111110] text-white ring-[#111110]"
                    : emphasize
                      ? "bg-[#FBF1E0] text-[#A8741A] ring-[#ECD29C] hover:text-[#7A520F]"
                      : "bg-white text-[#615D59] ring-[#e8e8e4] hover:text-[#111110]"
                }`}
              >
                {option.key === "needs_action" && count > 0 && (
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-[#A8741A]"}`} />
                )}
                <span>{option.label}</span>
                <span
                  className={`tabular-nums ${
                    active ? "text-white/65" : emphasize ? "text-[#A8741A]/70" : "text-[#1a1a1a]/40"
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 border-b border-[#f0f0ec] bg-[#fafaf8] px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/35" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="견적번호, 고객사, 거래명 검색"
              className="h-9 w-full rounded-md border border-[#e8e8e4] bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-[#1a1a1a]/30 focus:border-[#084734]"
            />
          </label>

          <div className="flex items-center gap-2">
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as QuoteSortKey)}
              className="h-9 rounded-md border border-[#e8e8e4] bg-white px-3 text-xs font-medium text-[#615D59] outline-none focus:border-[#084734]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            {hasActiveControls && (
              <button
                type="button"
                onClick={resetListControls}
                className="h-9 shrink-0 rounded-md border border-[#e8e8e4] bg-white px-3 text-xs font-medium text-[#615D59] transition-colors hover:text-[#111110]"
              >
                초기화
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void loadQuotes()
              }}
              disabled={loading}
              title="새로고침"
              aria-label="새로고침"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-xs font-medium text-[#615D59] transition-colors hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">새로고침</span>
            </button>
            <span className="ml-auto shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#615D59] ring-1 ring-[#e8e8e4] sm:ml-1">
              {loading ? "불러오는 중" : `${visibleQuotes.length}/${quotes.length}`}
            </span>
          </div>
        </div>

        {loadError ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#FEF3EE] text-[#B85C33]">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-[#111110]">견적서 목록을 불러오지 못했습니다.</p>
            <p className="mt-1 text-xs text-[#B85C33]">{loadError}</p>
          </div>
        ) : loading && quotes.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-[#615D59]">
            <Loader2 className="h-4 w-4 animate-spin" />
            견적서를 불러오는 중입니다.
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#f6f5f2] text-[#615D59]">
              <FileText className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-[#111110]">
              저장된 견적서가 없습니다.
            </p>
            <p className="mt-1 text-xs text-[#1a1a1a]/45">
              견적서 작성 후 이 목록에서 발송 링크와 응답 상태를 확인할 수 있습니다.
            </p>
          </div>
        ) : visibleQuotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#f6f5f2] text-[#615D59]">
              <Search className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-[#111110]">조건에 맞는 견적서가 없습니다.</p>
            <p className="mt-1 text-xs text-[#1a1a1a]/45">유형·상태 필터나 검색어를 조정해 보세요.</p>
            <button
              type="button"
              onClick={resetListControls}
              className="mt-4 rounded-md border border-[#e8e8e4] bg-white px-3 py-2 text-xs font-medium text-[#615D59] hover:text-[#111110]"
            >
              전체 보기
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0ec]">
            {visibleQuotes.map((quote) => {
              const statusMeta = getStatusMeta(quote.status)
              const sharing = sharingQuoteId === quote.id
              const nextAction = getNextActionMeta(quote)
              const responseMeta = getResponseMeta(quote)
              const responseRelativeTime = formatRelativeTime(getLatestInteractionAt(quote))
              const unresponsiveDays = getUnresponsiveDays(quote)

              return (
                <div
                  key={quote.id}
                  className="group grid gap-3 px-4 py-4 transition-colors hover:bg-[#fafaf8] sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px_250px] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[#1a1a1a]/45">{quote.quoteNumber}</span>
                      <span
                        title={PRODUCT_LINE_BADGE[quote.productLine].title}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PRODUCT_LINE_BADGE[quote.productLine].className}`}
                      >
                        {PRODUCT_LINE_BADGE[quote.productLine].label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      {/* V2 정본 전환: /api/portal/quotes/[id]/convert — 딜·고객 FK 연결 + stage 전진 + 태스크 완료.
                          레거시 V1 수동 폼 프리필 브리지(onConvertToContract)는 이 경로로 대체·폐기됨. */}
                      {quote.status === "accepted" || quote.acceptedAt ? (
                        <button
                          type="button"
                          onClick={() => void handleConvertToContract(quote)}
                          disabled={convertingQuoteId === quote.id}
                          title="이 견적으로 연결된 계약서를 생성하고 딜 단계를 '계약'으로 전진시킵니다."
                          className="inline-flex items-center gap-1 rounded-full border border-[#084734]/25 bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#d8f3e8] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                        >
                          {convertingQuoteId === quote.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowRight className="h-3 w-3" />
                          )}
                          {convertingQuoteId === quote.id ? "전환 중…" : nextAction.label}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${nextAction.textClassName}`}>
                          <ArrowRight className="h-3 w-3" />
                          {nextAction.label}
                        </span>
                      )}
                      {quote.createdAction && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/45 ring-1 ring-[#e8e8e4]">
                          {ACTION_LABEL[quote.createdAction]}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        openAdminQuoteView(quote.id)
                      }}
                      className="mt-1 block max-w-full truncate text-left text-sm font-semibold text-[#111110] transition-colors hover:text-[#084734] hover:underline underline-offset-2 focus-visible:text-[#084734] focus-visible:outline-none"
                    >
                      {quote.title}
                    </button>
                    <p className="mt-1 truncate text-xs text-[#1a1a1a]/45">
                      {quote.customerName} · {quote.dealTitle} · {formatDateTime(quote.updatedAt)}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs lg:grid-cols-[minmax(0,1fr)_36px_150px] lg:items-baseline lg:gap-3">
                    <div>
                      <p className="text-[#1a1a1a]/35 lg:hidden">금액</p>
                      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#111110] lg:mt-0 lg:text-right">
                        {formatMoney(quote.totalAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/35 lg:hidden">버전</p>
                      <p className="mt-0.5 font-medium text-[#1a1a1a]/50 lg:mt-0">
                        {quote.latestVersionNumber ? `v${quote.latestVersionNumber}` : `${quote.versionCount}개`}
                      </p>
                    </div>
                    <div className="min-w-0" title={getInteractionHint(quote)}>
                      <p className="text-[#1a1a1a]/35 lg:hidden">응답</p>
                      <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap lg:mt-0">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${responseMeta.dotClassName}`} />
                        <span className={`font-semibold ${responseMeta.textClassName}`}>{responseMeta.label}</span>
                        {unresponsiveDays !== null ? (
                          <span className="truncate text-[11px] font-medium text-[#A8741A]" title={`발송 후 ${unresponsiveDays}일째 무반응`}>
                            · 발송 {unresponsiveDays}일째
                          </span>
                        ) : responseRelativeTime ? (
                          <span className="truncate text-[11px] font-normal text-[#1a1a1a]/40">
                            · {responseRelativeTime}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/35 lg:hidden">{getInteractionHint(quote)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap lg:justify-end">
                    {quote.shareCount > 0 && (
                      <span
                        title={`공유 ${quote.shareCount}회`}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-[#ECFDF5] px-2 text-xs font-medium text-[#084734]"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span className="tabular-nums">{quote.shareCount}</span>
                      </span>
                    )}
                    {/* 데스크톱에서는 hover/focus 시에만 노출해 기본 목록을 조용하게.
                        공유 진행 중(sharing)에는 마우스가 벗어나도 스피너가 보이도록 유지. */}
                    <div
                      className={`flex items-center gap-1.5 lg:transition-opacity lg:group-focus-within:opacity-100 lg:group-hover:opacity-100 ${
                        sharing ? "" : "lg:opacity-0"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          openAdminQuoteView(quote.id)
                        }}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-xs font-medium text-[#1a1a1a]/70 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        직접 보기
                      </button>
                      <button
                        type="button"
                        disabled={sharing}
                        onClick={() => {
                          void handleCopyShareLink(quote)
                        }}
                        title="공유 링크 복사"
                        aria-label="공유 링크 복사"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e8e8e4] bg-white text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : quote.shareUrl ? <Copy className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        disabled={sharing}
                        onClick={() => {
                          void handleOpenShareLink(quote)
                        }}
                        title="공유 링크 열기"
                        aria-label="공유 링크 열기"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <QuickQuoteComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        recentQuotes={recentQuotes}
        apiBase="/api/portal"
        initialTemplateId={composerTemplateId}
        supplierManagerOptions={supplierManagerOptions}
        prefill={prefill}
        onCreated={handleCreated}
      />
    </div>
  )
}
