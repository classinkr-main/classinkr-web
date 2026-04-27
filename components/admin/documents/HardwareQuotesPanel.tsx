"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import QuickQuoteComposer, {
  type QuickQuoteCreatedPayload,
} from "@/components/partner-portal/quotes/QuickQuoteComposer"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import type { PartnerDocumentListItem } from "@/lib/partner-portal/types"

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

const ACTION_LABEL: Record<QuickQuoteCreatedPayload["action"], string> = {
  save: "저장됨",
  save_and_preview: "미리보기",
  save_and_send: "전송 준비",
}

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
    await navigator.clipboard.writeText(text)
    return
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

export default function HardwareQuotesPanel() {
  const [composerOpen, setComposerOpen] = useState(false)
  const [quotes, setQuotes] = useState<HardwareQuoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sharingQuoteId, setSharingQuoteId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null)

  const summary = useMemo(() => {
    return {
      total: quotes.length,
      draft: quotes.filter((quote) => quote.status === "draft").length,
      shared: quotes.filter((quote) => quote.status === "shared" || quote.shareCount > 0).length,
      accepted: quotes.filter((quote) => quote.status === "accepted").length,
    }
  }, [quotes])

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
    try {
      const shareUrl = await ensureShareUrl(quote)
      window.open(shareUrl, "_blank", "noopener,noreferrer")
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "공유 링크 열기에 실패했습니다.",
      })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 rounded-lg border border-[#e8e8e4] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase text-[#1a1a1a]/35">
            Hardware Quote
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[#111110]">
            하드웨어 견적서
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/55">
            작성한 견적서의 저장, 발송 링크, 고객 응답 상태를 한 화면에서 확인합니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void loadQuotes()
            }}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            새로고침
          </Button>
          <Button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="w-full bg-[#084734] text-white hover:bg-[#065c41] sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            견적서 작성
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["전체", summary.total],
          ["작성 중", summary.draft],
          ["발송됨", summary.shared],
          ["동의 완료", summary.accepted],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#e8e8e4] bg-white px-4 py-3">
            <p className="text-[11px] font-medium text-[#1a1a1a]/40">{label}</p>
            <p className="mt-1 text-lg font-semibold text-[#111110]">{value}</p>
          </div>
        ))}
      </div>

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
        <div className="flex flex-col gap-3 border-b border-[#ecebe6] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-sm font-semibold text-[#111110]">견적서 발송 상태</h3>
            <p className="mt-1 text-xs text-[#1a1a1a]/45">
              저장된 견적서와 공유 링크 상태를 최신순으로 봅니다.
            </p>
          </div>
          <span className="rounded-full bg-[#f6f5f2] px-2.5 py-1 text-xs font-medium text-[#615D59]">
            {loading ? "불러오는 중" : `${quotes.length}건`}
          </span>
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
        ) : (
          <div className="divide-y divide-[#f0f0ec]">
            {quotes.map((quote) => {
              const statusMeta = getStatusMeta(quote.status)
              const sharing = sharingQuoteId === quote.id

              return (
                <div
                  key={quote.id}
                  className="grid gap-3 px-4 py-4 transition-colors hover:bg-[#fafaf8] sm:px-5 lg:grid-cols-[minmax(0,1fr)_210px_220px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[#1a1a1a]/45">{quote.quoteNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      {quote.createdAction && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/45 ring-1 ring-[#e8e8e4]">
                          {ACTION_LABEL[quote.createdAction]}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-[#111110]">{quote.title}</p>
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

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
                    {quote.shareCount > 0 && (
                      <span className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md bg-[#ECFDF5] px-2.5 py-2 text-xs font-medium text-[#084734]">
                        <Send className="h-3.5 w-3.5" />
                        공유 {quote.shareCount}회
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={sharing}
                      onClick={() => {
                        void handleCopyShareLink(quote)
                      }}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] px-3 py-2 text-xs font-medium text-[#1a1a1a]/65 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : quote.shareUrl ? <Copy className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                      링크 복사
                    </button>
                    <button
                      type="button"
                      disabled={sharing}
                      onClick={() => {
                        void handleOpenShareLink(quote)
                      }}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-xs font-medium text-[#1a1a1a]/65 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      열기
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
        onCreated={handleCreated}
      />
    </div>
  )
}
