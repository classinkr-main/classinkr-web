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

import QuickQuoteComposer, {
  type QuickQuoteCreatedPayload,
  type QuickQuotePrefill,
} from "@/components/portal/quotes/QuickQuoteComposer"
import { portalFetch } from "@/lib/portal/portal-fetch"
import type { PartnerDocumentListItem } from "@/lib/portal/types"
import type { StandardQuoteTemplateId } from "@/lib/standard-quote-template"

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
  }
}

function getStatusMeta(status: string) {
  return STATUS_META[status] ?? {
    label: status,
    className: "bg-white text-[#1a1a1a]/50 ring-[#e8e8e4]",
  }
}

function getResponseLabel(quote: HardwareQuoteRow) {
  if (quote.acceptedAt || quote.status === "accepted") return "동의 확인"
  if (quote.reviewConfirmedAt) return "검토 확인"
  if (quote.status === "expired") return "만료됨"
  if (quote.lastViewedAt) return `열람 ${quote.viewCount}회`
  if (quote.status === "shared" || quote.shareCount > 0 || quote.shareUrl) return "열람 대기"
  return "미발송"
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
  return action === "new" ? "board_86" : action
}

export default function HardwareQuotesPanel({
  quickAction = null,
  onQuickActionConsumed,
  prefill = null,
}: HardwareQuotesPanelProps) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerTemplateId, setComposerTemplateId] = useState<StandardQuoteTemplateId>("board_86")
  const [quotes, setQuotes] = useState<HardwareQuoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sharingQuoteId, setSharingQuoteId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState<QuoteFilter>("all")
  const [sortKey, setSortKey] = useState<QuoteSortKey>("recent")
  const handledQuickActionKeyRef = useRef<string | null>(null)

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

  const visibleQuotes = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase()

    return quotes
      .filter((quote) => {
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
  }, [activeFilter, quotes, searchTerm, sortKey])

  const hasActiveControls = activeFilter !== "all" || searchTerm.trim().length > 0 || sortKey !== "recent"

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
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:px-6 sm:py-5">
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
                onClick={() => {
                  setSearchTerm("")
                  setActiveFilter("all")
                  setSortKey("recent")
                }}
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
              저장된 하드웨어 견적서가 없습니다.
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
            <p className="mt-1 text-xs text-[#1a1a1a]/45">검색어 또는 상태 필터를 조정해 보세요.</p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm("")
                setActiveFilter("all")
                setSortKey("recent")
              }}
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

              return (
                <div
                  key={quote.id}
                  className="grid gap-3 px-4 py-4 transition-colors hover:bg-[#fafaf8] sm:px-5 lg:grid-cols-[minmax(0,1fr)_190px_184px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[#1a1a1a]/45">{quote.quoteNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${nextAction.textClassName}`}>
                        <ArrowRight className="h-3 w-3" />
                        {nextAction.label}
                      </span>
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

                  <div className="grid grid-cols-3 gap-2 text-xs lg:grid-cols-1">
                    <div>
                      <p className="text-[#1a1a1a]/35">금액</p>
                      <p className="mt-0.5 font-semibold text-[#111110]">{formatMoney(quote.totalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/35">버전</p>
                      <p className="mt-0.5 font-semibold text-[#111110]">
                        {quote.latestVersionNumber ? `v${quote.latestVersionNumber}` : `${quote.versionCount}개`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/35">응답</p>
                      <p className="mt-0.5 font-semibold text-[#111110]">{getResponseLabel(quote)}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/35">{getInteractionHint(quote)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    {quote.shareCount > 0 && (
                      <span
                        title={`공유 ${quote.shareCount}회`}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-[#ECFDF5] px-2 text-xs font-medium text-[#084734]"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span className="tabular-nums">{quote.shareCount}</span>
                      </span>
                    )}
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
        prefill={prefill}
        onCreated={handleCreated}
      />
    </div>
  )
}
