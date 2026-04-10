"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  BadgeCheck,
  BookCopy,
  Eye,
  FileText,
  Layers3,
  Link2,
  Plus,
  RefreshCw,
  ReceiptText,
  Send,
  Signature,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import type {
  ContractDocumentBundle,
  DealDetailPayload,
  PartnerDocumentListItem,
  PartnerDocumentSummary,
  QuoteDocumentBundle,
  ReceiptRecord,
} from "@/lib/partner-portal/types"
import type { PartnerReadMode } from "@/lib/partner-portal/repositories/partner-read"

type HubSection = "all" | "quote" | "contract" | "receipt"
type HubDocumentKind = "quote" | "contract" | "receipt"
type HubMode = "create" | "send" | "organize"
type HubQueue = "all" | "draft" | "send" | "shared" | "responded" | "expiring" | "done"
type DocumentsApiPayload = {
  mode: PartnerReadMode
  summary: PartnerDocumentSummary
  documents: PartnerDocumentListItem[]
  deals: Array<{ id: string }>
  customers: Array<{ id: string }>
}

type DocumentShare =
  | QuoteDocumentBundle["shares"][number]
  | ContractDocumentBundle["shares"][number]

type HubDocument = {
  id: string
  kind: HubDocumentKind
  number: string
  title: string
  status: string
  updatedAt: string
  customerName: string
  customerId: string
  dealId: string
  dealTitle: string
  dealCode: string
  versionCount: number
  currentVersionLabel: string | null
  totalAmount: number
  versions: QuoteDocumentBundle["versions"] | ContractDocumentBundle["versions"]
  shares: QuoteDocumentBundle["shares"] | ContractDocumentBundle["shares"]
  pdfUrl: string | null
  receipt?: ReceiptRecord
}

const SECTION_LABELS: Record<HubSection, string> = {
  all: "전체",
  quote: "견적서",
  contract: "계약서",
  receipt: "영수증",
}

const MODE_LABELS: Record<HubMode, string> = {
  create: "만들기",
  send: "발송하기",
  organize: "보기·정리",
}

const QUEUE_LABELS: Record<HubQueue, string> = {
  all: "전체",
  draft: "작성 중",
  send: "발송 준비",
  shared: "발송됨",
  responded: "응답 확인",
  expiring: "만료 임박",
  done: "완료/보관",
}

const DEMO_DOCUMENTS: HubDocument[] = [
  {
    id: "demo-quote-1",
    kind: "quote",
    number: "Q-2026-001",
    title: "강남메가스터디학원 전자칠판 견적",
    status: "shared",
    updatedAt: "2026-04-04T09:00:00Z",
    customerName: "강남메가스터디학원",
    customerId: "demo-customer-1",
    dealId: "demo-deal-1",
    dealTitle: "2-4층 전자칠판 설치",
    dealCode: "D-2026-001",
    versionCount: 3,
    currentVersionLabel: "v3 · 29,000,000원",
    totalAmount: 29000000,
    versions: [],
    shares: [],
    pdfUrl: null,
  },
  {
    id: "demo-contract-1",
    kind: "contract",
    number: "C-2026-001",
    title: "강남메가스터디학원 계약서",
    status: "shared",
    updatedAt: "2026-04-03T11:20:00Z",
    customerName: "강남메가스터디학원",
    customerId: "demo-customer-1",
    dealId: "demo-deal-1",
    dealTitle: "2-4층 전자칠판 설치",
    dealCode: "D-2026-001",
    versionCount: 2,
    currentVersionLabel: "v2 · 서명 대기",
    totalAmount: 29000000,
    versions: [],
    shares: [],
    pdfUrl: null,
  },
  {
    id: "demo-receipt-1",
    kind: "receipt",
    number: "R-2026-004",
    title: "리더스입시학원 수납 영수증",
    status: "issued",
    updatedAt: "2026-04-02T05:30:00Z",
    customerName: "리더스입시학원",
    customerId: "demo-customer-2",
    dealId: "demo-deal-3",
    dealTitle: "3층 전체 전자칠판 교체",
    dealCode: "D-2026-004",
    versionCount: 1,
    currentVersionLabel: "영수 1건",
    totalAmount: 24200000,
    versions: [],
    shares: [],
    pdfUrl: "/demo/receipt.pdf",
  },
]

const DEMO_PAYLOAD: DocumentsApiPayload = {
  mode: "demo",
  summary: {
    all: DEMO_DOCUMENTS.length,
    quote: DEMO_DOCUMENTS.filter((item) => item.kind === "quote").length,
    contract: DEMO_DOCUMENTS.filter((item) => item.kind === "contract").length,
    receipt: DEMO_DOCUMENTS.filter((item) => item.kind === "receipt").length,
  },
  documents: [],
  deals: [],
  customers: [],
}

function readJson<T>(url: string) {
  return fetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }

    return (await response.json()) as T
  })
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-"
  return `${value.toLocaleString("ko-KR")}원`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function latestVersionLabel(
  kind: HubDocumentKind,
  versions: QuoteDocumentBundle["versions"] | ContractDocumentBundle["versions"]
) {
  if (versions.length === 0) return "버전 없음"

  const latest = [...versions].sort((left, right) => right.version_number - left.version_number)[0]
  if (kind === "quote") {
    return `v${latest.version_number} · ${formatMoney((latest as QuoteDocumentBundle["versions"][number]).total_amount)}`
  }

  return `v${latest.version_number} · ${formatMoney((latest as ContractDocumentBundle["versions"][number]).total_amount)}`
}

function docTone(kind: HubDocumentKind) {
  switch (kind) {
    case "quote":
      return "bg-[#ECFDF5] text-[#084734] border-[#D1FAE5]"
    case "contract":
      return "bg-[#D1FAE5] text-[#065c41] border-[#D1FAE5]"
    case "receipt":
      return "bg-[#f0f0ec] text-[#615D59] border-[#e8e8e4]"
    default:
      return "bg-white text-[#1a1a1a]/60 border-[#e8e8e4]"
  }
}

function docIcon(kind: HubDocumentKind) {
  switch (kind) {
    case "quote":
      return <FileText className="h-4 w-4" />
    case "contract":
      return <Signature className="h-4 w-4" />
    case "receipt":
      return <ReceiptText className="h-4 w-4" />
    default:
      return <BookCopy className="h-4 w-4" />
  }
}

function buildDocumentFromListItem(item: PartnerDocumentListItem): HubDocument {
  const fallbackTitle =
    item.kind === "quote"
      ? "견적서"
      : item.kind === "contract"
        ? "계약서"
        : "영수증"

  return {
    id: item.id,
    kind: item.kind,
    number: item.document_number,
    title: fallbackTitle,
    status: item.status,
    updatedAt: item.updated_at,
    customerName: item.customer_name ?? "기관 미지정",
    customerId: item.customer_id,
    dealId: item.deal_id,
    dealTitle: item.deal_title,
    dealCode: item.deal_id,
    versionCount: item.version_count,
    currentVersionLabel:
      item.latest_version_number != null
        ? `v${item.latest_version_number}`
        : item.kind === "receipt"
          ? formatMoney(item.total_amount)
          : `${item.version_count}개 버전`,
    totalAmount: item.total_amount ?? 0,
    versions: [],
    shares: [],
    pdfUrl: item.pdf_url,
  }
}

function getLatestShare(document: HubDocument) {
  if (document.kind === "receipt") return null

  return [...document.shares]
    .filter((share) => !share.expires_at || new Date(share.expires_at).getTime() >= Date.now())
    .sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    )[0] as DocumentShare | undefined
}

function isExpired(value: string | null | undefined) {
  if (!value) return false
  return new Date(value).getTime() < Date.now()
}

function isExpiringSoon(value: string | null | undefined) {
  if (!value) return false
  const diff = new Date(value).getTime() - Date.now()
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function getDocumentStatusLabel(document: HubDocument) {
  if (document.kind === "quote") {
    switch (document.status) {
      case "draft":
        return "초안"
      case "shared":
        return "공유됨"
      case "accepted":
        return "수락됨"
      case "expired":
        return "만료됨"
      case "archived":
        return "보관"
      default:
        return document.status
    }
  }

  if (document.kind === "contract") {
    switch (document.status) {
      case "draft":
        return "초안"
      case "shared":
        return "서명 대기"
      case "partner_signed":
        return "파트너 서명"
      case "admin_signed":
        return "내부 서명"
      case "completed":
        return "완료"
      case "cancelled":
        return "취소"
      default:
        return document.status
    }
  }

  if (document.status === "issued") return "발행됨"
  return document.status === "draft" ? "초안" : document.status
}

function getRecentSentLabel(document: HubDocument) {
  if (document.kind === "receipt") {
    return document.pdfUrl ? formatDate(document.updatedAt) : "미발행"
  }

  const share = getLatestShare(document)
  if (!share) {
    return document.status === "shared" ? "공유됨" : "미발송"
  }

  return formatDate(share.created_at)
}

function getRecentViewLabel(document: HubDocument) {
  if (document.kind === "quote") {
    if (document.status === "accepted") return "수락 확인"
    if (document.status === "expired") return "만료됨"
  }

  if (document.kind === "contract") {
    if (document.status === "completed") return "체결 완료"
    if (document.status === "admin_signed") return "내부 서명"
    if (document.status === "partner_signed") return "파트너 서명"
    if (document.status === "cancelled") return "취소됨"
  }

  if (document.kind === "receipt") {
    return document.pdfUrl ? "PDF 기준" : "미확인"
  }

  const share = getLatestShare(document)
  if (share?.expires_at && isExpired(share.expires_at)) return "만료됨"
  if (share) return "열람 대기"
  return "미확인"
}

function getNextActionLabel(document: HubDocument) {
  if (document.kind === "quote") {
    if (document.status === "draft") return "발송 준비"
    if (document.status === "accepted") return "계약 진행"
    if (document.status === "expired") return "재발송"
    return getLatestShare(document) ? "응답 확인" : "링크 발송"
  }

  if (document.kind === "contract") {
    if (document.status === "draft") return "발송 준비"
    if (document.status === "shared") return "서명 확인"
    if (document.status === "partner_signed") return "내부 서명"
    if (document.status === "admin_signed") return "완료 처리"
    if (document.status === "completed") return "설치/수납 확인"
    return "상태 확인"
  }

  if (!document.pdfUrl) return "PDF 발행"
  return "보관/공유"
}

function matchesQueue(document: HubDocument, queue: HubQueue) {
  const share = getLatestShare(document)

  switch (queue) {
    case "all":
      return true
    case "draft":
      return document.status === "draft"
    case "send":
      return document.kind === "receipt"
        ? !document.pdfUrl
        : document.status === "draft" || !share
    case "shared":
      return document.kind === "receipt"
        ? Boolean(document.pdfUrl)
        : Boolean(share) || document.status === "shared"
    case "responded":
      return (
        document.status === "accepted" ||
        document.status === "partner_signed" ||
        document.status === "admin_signed" ||
        document.status === "completed" ||
        (document.kind === "receipt" && Boolean(document.pdfUrl))
      )
    case "expiring":
      return Boolean(share?.expires_at && isExpiringSoon(share.expires_at))
    case "done":
      return (
        document.status === "accepted" ||
        document.status === "completed" ||
        document.status === "archived" ||
        (document.kind === "receipt" && Boolean(document.pdfUrl))
      )
    default:
      return true
  }
}

function queueDescription(mode: HubMode) {
  if (mode === "create") {
    return "새 문서를 시작하거나 최근 초안을 이어서 작업합니다."
  }

  if (mode === "send") {
    return "발송 준비, 발송됨, 응답 확인, 만료 임박 큐로 문서를 정리합니다."
  }

  return "최신 버전, 최근 발송, 최근 열람, 다음 액션 기준으로 문서를 읽습니다."
}

function getDocumentShareUrl(document: HubDocument, token: string) {
  if (typeof window === "undefined") return ""

  if (document.kind === "quote") {
    return `${window.location.origin}/partner/quote/${token}`
  }

  if (document.kind === "contract") {
    return `${window.location.origin}/partner/sign/${token}`
  }

  if (document.kind === "receipt" && document.pdfUrl) {
    return document.pdfUrl
  }

  return `${window.location.origin}/partner/workspace`
}

function hydrateDocumentFromDetail(
  document: HubDocument,
  detail: DealDetailPayload
): HubDocument {
  if (document.kind === "quote") {
    const quote = detail.quote_documents.find((item) => item.id === document.id)
    if (!quote) return document

    const currentVersion =
      quote.versions.find((version) => version.id === quote.current_version_id) ??
      quote.versions[0]

    return {
      ...document,
      title: currentVersion?.title ?? document.title,
      status: quote.status,
      updatedAt: quote.updated_at,
      versionCount: quote.versions.length,
      currentVersionLabel: latestVersionLabel("quote", quote.versions),
      totalAmount: currentVersion?.total_amount ?? document.totalAmount,
      versions: quote.versions,
      shares: quote.shares,
    }
  }

  if (document.kind === "contract") {
    const contract = detail.contract_documents.find((item) => item.id === document.id)
    if (!contract) return document

    const currentVersion =
      contract.versions.find(
        (version) => version.id === contract.current_version_id
      ) ?? contract.versions[0]

    return {
      ...document,
      title: currentVersion?.title ?? document.title,
      status: contract.status,
      updatedAt: contract.updated_at,
      versionCount: contract.versions.length,
      currentVersionLabel: latestVersionLabel("contract", contract.versions),
      totalAmount: currentVersion?.total_amount ?? document.totalAmount,
      versions: contract.versions,
      shares: contract.shares,
    }
  }

  const receipt = detail.receipts.find((item) => item.id === document.id)
  if (!receipt) return document

  return {
    ...document,
    title: "영수증",
    status: receipt.pdf_url ? "issued" : "draft",
    updatedAt: receipt.updated_at,
    versionCount: 1,
    currentVersionLabel: formatMoney(receipt.total_amount),
    totalAmount: receipt.total_amount,
    pdfUrl: receipt.pdf_url,
    receipt,
  }
}

function DocumentStat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
      <div className="flex items-center gap-2 text-[#1a1a1a]/45">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold text-[#1a1a1a]">{value}</p>
    </div>
  )
}

function DocumentRow({
  document,
  active,
  onClick,
}: {
  document: HubDocument
  active: boolean
  onClick: () => void
}) {
  const statusBorderClass =
    document.status === "draft"
      ? "border-l-2 border-l-amber-400"
      : document.status === "accepted" || document.status === "issued"
        ? "border-l-2 border-l-emerald-400"
        : ""
  const recentSent = getRecentSentLabel(document)
  const recentView = getRecentViewLabel(document)
  const nextAction = getNextActionLabel(document)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
        active
          ? "border-[#1a1a1a] bg-[#fafafa] ring-1 ring-[#1a1a1a]/10"
          : "border-[#e8e8e4] bg-white hover:border-[#cccccc] hover:bg-[#fafaf8]"
      } ${statusBorderClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${docTone(document.kind)}`}>
              {docIcon(document.kind)}
              {SECTION_LABELS[document.kind]}
            </span>
            <span className="text-xs text-[#1a1a1a]/45">{document.number}</span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-[#1a1a1a]">{document.title}</p>
          <p className="mt-1 text-xs text-[#1a1a1a]/50">
            {document.customerName} · {document.dealCode}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-[#1a1a1a]/25" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#f7f7f5] px-3 py-2">
          <p className="text-[11px] text-[#1a1a1a]/35">최신 버전</p>
          <p className="mt-1 text-xs font-semibold text-[#1a1a1a]">{document.currentVersionLabel ?? `${document.versionCount}개`}</p>
        </div>
        <div className="rounded-xl bg-[#f7f7f5] px-3 py-2">
          <p className="text-[11px] text-[#1a1a1a]/35">최근 발송</p>
          <p className="mt-1 text-xs font-semibold text-[#1a1a1a]">{recentSent}</p>
        </div>
        <div className="rounded-xl bg-[#f7f7f5] px-3 py-2">
          <p className="text-[11px] text-[#1a1a1a]/35">최근 열람</p>
          <p className="mt-1 text-xs font-semibold text-[#1a1a1a]">{recentView}</p>
        </div>
        <div className="rounded-xl bg-[#f7f7f5] px-3 py-2">
          <p className="text-[11px] text-[#1a1a1a]/35">다음 액션</p>
          <p className="mt-1 text-xs font-semibold text-[#1a1a1a]">{nextAction}</p>
        </div>
      </div>
    </button>
  )
}

export default function PartnerDocumentsPage() {
  const router = useRouter()
  const [mode, setMode] = useState<PartnerReadMode>("demo")
  const [documents, setDocuments] = useState<HubDocument[]>(DEMO_DOCUMENTS)
  const [summary, setSummary] = useState<PartnerDocumentSummary>(DEMO_PAYLOAD.summary)
  const [sourceDealCount, setSourceDealCount] = useState(0)
  const [hubMode, setHubMode] = useState<HubMode>("organize")
  const [queue, setQueue] = useState<HubQueue>("all")
  const [section, setSection] = useState<HubSection>("all")
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(DEMO_DOCUMENTS[0].id)
  const [hydratedDealIds, setHydratedDealIds] = useState<Record<string, true>>({})
  const [sharingDocumentId, setSharingDocumentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ── 견적서 빠른 생성 다이얼로그 ──────────────────────────── */
  const [quoteDialog, setQuoteDialog] = useState(false)
  const [qForm, setQForm] = useState({ customerName: "", dealTitle: "", quoteTitle: "", amount: "" })
  const [qSubmitting, setQSubmitting] = useState(false)
  const [qError, setQError] = useState<string | null>(null)

  async function handleQuoteCreate(e: React.FormEvent) {
    e.preventDefault()
    setQSubmitting(true)
    setQError(null)
    try {
      // 1. 고객 생성
      const custRes = await fetch("/api/partner/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: qForm.customerName }),
      })
      if (!custRes.ok) {
        const err = await custRes.json()
        throw new Error(`고객 생성 실패: ${err.error ?? "알 수 없는 오류"}`)
      }
      const cust = await custRes.json()

      // 2. 거래 생성
      const dealRes = await fetch("/api/partner/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: cust.id,
          title: qForm.dealTitle,
          expected_amount: qForm.amount ? Number(qForm.amount.replace(/,/g, "")) : null,
        }),
      })
      if (!dealRes.ok) {
        const err = await dealRes.json()
        throw new Error(`거래 생성 실패: ${err.error ?? "알 수 없는 오류"}`)
      }
      const deal = await dealRes.json()

      // 3. 견적서 생성
      const quoteRes = await fetch("/api/partner/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: deal.id,
          title: qForm.quoteTitle,
          total_amount: qForm.amount ? Number(qForm.amount.replace(/,/g, "")) : 0,
          subtotal: qForm.amount ? Number(qForm.amount.replace(/,/g, "")) : 0,
        }),
      })
      if (!quoteRes.ok) {
        const err = await quoteRes.json()
        throw new Error(`견적서 생성 실패: ${err.error ?? "알 수 없는 오류"}`)
      }

      setQuoteDialog(false)
      setQForm({ customerName: "", dealTitle: "", quoteTitle: "", amount: "" })
      router.refresh()
      window.location.reload()
    } catch (err) {
      setQError(err instanceof Error ? err.message : "생성 중 오류가 발생했습니다")
    } finally {
      setQSubmitting(false)
    }
  }

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const payload = await readJson<DocumentsApiPayload>("/api/partner/documents")
        if (!alive) return

        const hubDocuments =
          payload.documents.length > 0
            ? payload.documents.map(buildDocumentFromListItem)
            : DEMO_DOCUMENTS
        const nextDealCount = new Set(
          hubDocuments.map((document) => document.dealId)
        ).size

        setMode(payload.mode ?? "demo")
        setSummary(
          payload.documents.length > 0 ? payload.summary : DEMO_PAYLOAD.summary
        )
        setSourceDealCount(nextDealCount)
        setHydratedDealIds({})
        setDocuments(hubDocuments)
        setSelectedDocumentId(hubDocuments[0]?.id ?? "")

        if (payload.documents.length === 0) {
          setError("등록된 문서가 없어 demo 문서를 보여주고 있습니다.")
        }
      } catch {
        if (!alive) return

        setMode("demo")
        setSummary(DEMO_PAYLOAD.summary)
        setSourceDealCount(
          new Set(DEMO_DOCUMENTS.map((document) => document.dealId)).size
        )
        setHydratedDealIds({})
        setDocuments(DEMO_DOCUMENTS)
        setSelectedDocumentId(DEMO_DOCUMENTS[0].id)
        setError("문서 전용 API가 아직 없어 데모 문서로 전환했습니다.")
      } finally {
        if (alive) setLoading(false)
      }
    }

    const timer = setTimeout(() => {
      void load()
    }, 0)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const selectedDocument =
      documents.find((document) => document.id === selectedDocumentId) ?? null

    if (!selectedDocument) return
    // 데모 모드(비로그인·폴백)에서는 실제 API를 찌르지 않는다 — 401 유발 방지
    if (mode === "demo") return
    const targetDealId = selectedDocument.dealId
    if (hydratedDealIds[targetDealId]) return

    let alive = true

    async function hydrateSelectedDeal() {
      try {
        const response = await readJson<{ deal: DealDetailPayload }>(
          `/api/partner/deals/${targetDealId}`
        )
        if (!alive) return

        setDocuments((current) =>
          current.map((document) =>
            document.dealId === targetDealId
              ? hydrateDocumentFromDetail(document, response.deal)
              : document
          )
        )
        setHydratedDealIds((current) => ({
          ...current,
          [targetDealId]: true,
        }))
      } catch (fetchError) {
        if (alive) {
          console.error("[partner/documents] hydrate deal", fetchError)
        }
      }
    }

    void hydrateSelectedDeal()

    return () => {
      alive = false
    }
  }, [documents, hydratedDealIds, selectedDocumentId, mode])

  async function ensureShareLink(document: HubDocument) {
    if (typeof window === "undefined") return ""

    if (document.kind === "receipt") {
      return document.pdfUrl ?? `${window.location.origin}/partner/workspace`
    }

    const existingShare = getLatestShare(document)
    if (existingShare?.token) {
      return getDocumentShareUrl(document, existingShare.token)
    }

    if (mode === "demo") {
      return `${window.location.origin}/partner/workspace`
    }

    setSharingDocumentId(document.id)
    try {
      const endpoint =
        document.kind === "quote"
          ? `/api/portal/quotes/${document.id}/share`
          : `/api/portal/contracts/${document.id}/share`

      const response = await portalFetch(endpoint, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      const payload = (await response.json()) as {
        share?: DocumentShare
      }

      if (!payload.share?.token) {
        throw new Error("Share token missing in response")
      }

      const share = payload.share
      setDocuments((current) =>
        current.map((item) => {
          if (item.id !== document.id) return item

          if (item.kind === "quote" && document.kind === "quote") {
            const nextShares: QuoteDocumentBundle["shares"] = [
              share as QuoteDocumentBundle["shares"][number],
              ...(item.shares as QuoteDocumentBundle["shares"]).filter(
                (entry) => entry.id !== share.id
              ),
            ]

            return {
              ...item,
              status: "shared",
              shares: nextShares,
            }
          }

          if (item.kind === "contract" && document.kind === "contract") {
            const nextShares: ContractDocumentBundle["shares"] = [
              share as ContractDocumentBundle["shares"][number],
              ...(item.shares as ContractDocumentBundle["shares"]).filter(
                (entry) => entry.id !== share.id
              ),
            ]

            return {
              ...item,
              status: "shared",
              shares: nextShares,
            }
          }

          return item
        })
      )

      return getDocumentShareUrl(document, share.token)
    } finally {
      setSharingDocumentId(null)
    }
  }

  function handleHubModeChange(nextMode: HubMode) {
    setHubMode(nextMode)
    setQueue(
      nextMode === "create"
        ? "draft"
        : nextMode === "send"
          ? "send"
          : "all"
    )
  }

  const visibleDocuments =
    (section === "all"
      ? documents
      : documents.filter((document) => document.kind === section)
    ).filter((document) => matchesQueue(document, queue))

  const selectedDocument = visibleDocuments.find((document) => document.id === selectedDocumentId) ?? visibleDocuments[0] ?? documents[0]
  const draftCount = documents.filter((document) => matchesQueue(document, "draft")).length
  const sendCount = documents.filter((document) => matchesQueue(document, "send")).length
  const respondedCount = documents.filter((document) => matchesQueue(document, "responded")).length
  const expiringCount = documents.filter((document) => matchesQueue(document, "expiring")).length
  const draftDocuments = documents.filter((document) => matchesQueue(document, "draft")).slice(0, 4)
  const queueOptions: HubQueue[] =
    hubMode === "create"
      ? ["draft", "all", "done"]
      : hubMode === "send"
        ? ["send", "shared", "responded", "expiring"]
        : ["all", "draft", "shared", "responded", "expiring", "done"]
  void summary

  return (
    <>
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <Card className="border-[#e8e8e4] bg-white shadow-none">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#1a1a1a]/15 bg-[#1a1a1a] text-white">
                  {mode === "demo" ? "DEMO" : "LIVE"}
                </Badge>
                <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/50">
                  Documents Hub
                </Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1a1a1a] lg:text-4xl">
                파트너 포털 문서
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/50">
                문서를 `만들기 / 발송하기 / 보기·정리` 흐름으로 묶고, 최신 버전과 발송 상태를 같은 화면에서 확인합니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1a1a1a]/50">
                <DocumentStat icon={<Layers3 className="h-3.5 w-3.5" />} label="전체" value={`${documents.length}건`} />
                <DocumentStat icon={<Plus className="h-3.5 w-3.5" />} label="작성 중" value={`${draftCount}건`} />
                <DocumentStat icon={<Send className="h-3.5 w-3.5" />} label="발송 준비" value={`${sendCount}건`} />
                <DocumentStat icon={<Eye className="h-3.5 w-3.5" />} label="응답 확인" value={`${respondedCount}건`} />
                <DocumentStat
                  icon={<BadgeCheck className="h-3.5 w-3.5" />}
                  label="만료 임박"
                  value={`${expiringCount}건`}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 self-end">
                <button
                  type="button"
                  onClick={() => handleHubModeChange("create")}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#D1FAE5] bg-[#084734] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#065c41]"
                >
                  <Plus className="h-4 w-4" />
                  새 문서
                </button>
                <button
                  type="button"
                  onClick={() => handleHubModeChange("send")}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] hover:bg-[#f7f7f5]"
                >
                  <Send className="h-4 w-4" />
                  빠른 발송
                </button>
                <div className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-2.5 text-sm text-[#1a1a1a]/60">
                  <BadgeCheck className="h-4 w-4" />
                  버전 고정 링크와 PDF는 현재 {sourceDealCount > 0 ? `${sourceDealCount}개 거래` : "demo"} 기준으로 노출합니다
                </div>
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] hover:bg-[#f7f7f5]"
                >
                  새로고침
                  <RefreshCw className="h-4 w-4" />
                </button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4 border-[#e8e8e4] bg-white shadow-none">
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">
                  Work Modes
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[#1a1a1a]">
                  {MODE_LABELS[hubMode]}
                </h2>
                <p className="mt-1 text-sm text-[#1a1a1a]/50">{queueDescription(hubMode)}</p>
              </div>
              <Tabs value={hubMode} onValueChange={(value) => handleHubModeChange(value as HubMode)}>
                <TabsList className="h-auto flex-wrap rounded-full bg-[#f0f0ec] p-1">
                  <TabsTrigger value="create" className="rounded-full px-3 py-1.5 text-xs">
                    만들기
                  </TabsTrigger>
                  <TabsTrigger value="send" className="rounded-full px-3 py-1.5 text-xs">
                    발송하기
                  </TabsTrigger>
                  <TabsTrigger value="organize" className="rounded-full px-3 py-1.5 text-xs">
                    보기·정리
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-wrap gap-2">
              {queueOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setQueue(item)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    queue === item
                      ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                      : "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/60 hover:bg-white hover:text-[#1a1a1a]"
                  }`}
                >
                  {QUEUE_LABELS[item]}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="gap-4 pb-4">
              <div>
                <CardTitle className="text-lg font-semibold text-[#1a1a1a]">
                  {hubMode === "create" ? "만들기 시작" : hubMode === "send" ? "발송 큐" : "문서 목록"}
                </CardTitle>
                <p className="mt-1 text-sm text-[#1a1a1a]/45">
                  {hubMode === "create"
                    ? "문서 작성 진입점과 최근 초안을 한 번에 모읍니다."
                    : hubMode === "send"
                      ? "발송 준비, 발송됨, 응답 확인, 만료 임박 순으로 큐를 읽습니다."
                      : "문서 종류와 상태 큐를 함께 좁혀서 최신 버전과 액션을 확인합니다."}
                </p>
              </div>
              <Tabs value={section} onValueChange={(value) => setSection(value as HubSection)}>
                <TabsList className="h-auto flex-wrap rounded-full bg-[#f0f0ec] p-1">
                  <TabsTrigger value="all" className="rounded-full px-3 py-1.5 text-xs">
                    전체
                  </TabsTrigger>
                  <TabsTrigger value="quote" className="rounded-full px-3 py-1.5 text-xs">
                    견적서
                  </TabsTrigger>
                  <TabsTrigger value="contract" className="rounded-full px-3 py-1.5 text-xs">
                    계약서
                  </TabsTrigger>
                  <TabsTrigger value="receipt" className="rounded-full px-3 py-1.5 text-xs">
                    영수증
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {hubMode === "create" ? (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => setQuoteDialog(true)}
                      className="flex items-center justify-between rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4 text-left hover:border-[#D1FAE5] hover:bg-[#ECFDF5]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">견적서 초안 시작</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/50">고객·거래·견적서를 한 번에 만듭니다.</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-[#1a1a1a]/25" />
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/partner/contracts")}
                      className="flex items-center justify-between rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4 text-left hover:border-[#D1FAE5] hover:bg-[#ECFDF5]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">계약서 이어쓰기</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/50">확정된 거래에서 계약 초안을 만들고 서명 흐름으로 넘깁니다.</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-[#1a1a1a]/25" />
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/partner/receipts")}
                      className="flex items-center justify-between rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4 text-left hover:border-[#D1FAE5] hover:bg-[#ECFDF5]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">영수증 발행</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/50">수납 기록과 연결된 PDF 영수증을 바로 만듭니다.</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-[#1a1a1a]/25" />
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    <p className="text-sm font-semibold text-[#1a1a1a]">최근 초안</p>
                    <p className="mt-1 text-xs text-[#1a1a1a]/45">중간에 멈춘 문서부터 다시 이어서 작업할 수 있습니다.</p>
                  </div>

                  {draftDocuments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-10 text-center">
                      <p className="text-sm text-[#1a1a1a]/50">이어쓸 초안이 아직 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {draftDocuments.map((document) => (
                        <DocumentRow
                          key={document.id}
                          document={document}
                          active={document.id === selectedDocument?.id}
                          onClick={() => setSelectedDocumentId(document.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-2xl bg-[#f0f0ec]" />
                  ))}
                </div>
              ) : visibleDocuments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-10 text-center">
                  <p className="text-sm text-[#1a1a1a]/50">
                    {hubMode === "send"
                      ? "현재 선택한 큐에 걸린 문서가 없습니다. 작성 중 또는 발송된 문서를 다른 큐에서 확인해보세요."
                      : "선택한 조건에 맞는 문서가 아직 없습니다. 필터를 넓히거나 새 문서를 시작해보세요."}
                  </p>
                  <a
                    href={hubMode === "send" ? "/partner/documents" : "/partner/quotes"}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2 text-sm font-medium text-[#084734] hover:bg-[#ECFDF5]"
                  >
                    {hubMode === "send" ? "문서 허브 새로 보기" : "견적서 탭으로 이동"}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleDocuments.map((document) => (
                    <DocumentRow
                      key={document.id}
                      document={document}
                      active={document.id === selectedDocument?.id}
                      onClick={() => setSelectedDocumentId(document.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-[#1a1a1a]">
                {hubMode === "send" ? "발송 준비 상세" : hubMode === "create" ? "문서 컨텍스트" : "문서 상세"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDocument ? (
                <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-10 text-center text-sm text-[#1a1a1a]/45">
                  선택된 문서가 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${docTone(selectedDocument.kind)}`}>
                        {docIcon(selectedDocument.kind)}
                        {SECTION_LABELS[selectedDocument.kind]}
                      </span>
                      <span className="text-xs text-[#1a1a1a]/45">{selectedDocument.number}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-[#1a1a1a]">{selectedDocument.title}</h2>
                    <p className="mt-1 text-sm text-[#1a1a1a]/50">
                      {selectedDocument.customerName} · {selectedDocument.dealTitle}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] text-[#1a1a1a]/35">문서 상태</p>
                        <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{getDocumentStatusLabel(selectedDocument)}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] text-[#1a1a1a]/35">다음 액션</p>
                        <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{getNextActionLabel(selectedDocument)}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] text-[#1a1a1a]/35">최근 발송</p>
                        <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{getRecentSentLabel(selectedDocument)}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] text-[#1a1a1a]/35">최근 열람</p>
                        <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{getRecentViewLabel(selectedDocument)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">링크 / 파일</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/45">
                          공유 토큰이 있으면 바로 사용하고, 없으면 필요한 경우에만 새 링크를 만듭니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={sharingDocumentId === selectedDocument.id}
                          onClick={async () => {
                            try {
                              const link = await ensureShareLink(selectedDocument)
                              if (navigator.clipboard?.writeText) {
                                await navigator.clipboard.writeText(link)
                              }
                            } catch (error) {
                              console.error("[partner/documents] copy share link", error)
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-3 py-2 text-sm font-medium text-[#1a1a1a] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Link2 className="h-4 w-4" />
                          {sharingDocumentId === selectedDocument.id ? "링크 준비 중" : "링크 복사"}
                        </button>
                        <button
                          type="button"
                          disabled={sharingDocumentId === selectedDocument.id}
                          onClick={async () => {
                            try {
                              const link = await ensureShareLink(selectedDocument)
                              window.open(link, "_blank", "noopener,noreferrer")
                            } catch (error) {
                              console.error("[partner/documents] open share link", error)
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-sm font-medium text-[#1a1a1a] hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ArrowRight className="h-4 w-4" />
                          열기
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-[#ecece8] bg-[#fafaf8] px-4 py-3">
                        <span className="text-sm text-[#1a1a1a]/60">최신 버전</span>
                        <span className="text-sm font-semibold text-[#1a1a1a]">{selectedDocument.currentVersionLabel ?? "-"}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-[#ecece8] bg-[#fafaf8] px-4 py-3">
                        <span className="text-sm text-[#1a1a1a]/60">버전 수</span>
                        <span className="text-sm font-semibold text-[#1a1a1a]">{selectedDocument.versionCount}개</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-[#ecece8] bg-[#fafaf8] px-4 py-3">
                        <span className="text-sm text-[#1a1a1a]/60">금액</span>
                        <span className="text-sm font-semibold text-[#1a1a1a]">{formatMoney(selectedDocument.totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                    <p className="text-sm font-semibold text-[#1a1a1a]">버전 이력</p>
                    <div className="mt-3 space-y-3">
                      {selectedDocument.kind === "receipt" ? (
                        <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4 text-sm text-[#1a1a1a]/60">
                          영수증은 수납 레코드 기반으로 생성되며 별도 버전 이력은 없습니다.
                        </div>
                      ) : (
                        [...selectedDocument.versions]
                          .sort((left, right) => right.version_number - left.version_number)
                          .map((version) => (
                            <div key={version.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-[#1a1a1a]">v{version.version_number}</p>
                                  <p className="mt-1 text-xs text-[#1a1a1a]/50">{version.title}</p>
                                </div>
                                <span className="text-sm font-semibold text-[#1a1a1a]">
                                  {selectedDocument.kind === "quote"
                                    ? formatMoney((version as QuoteDocumentBundle["versions"][number]).total_amount)
                                    : formatMoney((version as ContractDocumentBundle["versions"][number]).total_amount)}
                                </span>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-[#1a1a1a]/45">
                                <div className="flex items-center justify-between">
                                  <span>발행일</span>
                                  <span>{formatDate(version.created_at)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>유효일</span>
                                  <span>{formatDate("valid_until" in version ? version.valid_until : null)}</span>
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  {selectedDocument.kind === "receipt" && selectedDocument.receipt && (
                    <div className="rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                      <p className="text-sm font-semibold text-[#1a1a1a]">수납 정보</p>
                      <div className="mt-3 space-y-2 text-sm text-[#1a1a1a]/60">
                        <div className="flex items-center justify-between">
                          <span>영수 번호</span>
                          <span>{selectedDocument.receipt.receipt_number}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>수납 금액</span>
                          <span>{formatMoney(selectedDocument.receipt.total_amount)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>생성일</span>
                          <span>{formatDate(selectedDocument.receipt.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-4 text-sm text-[#1a1a1a]/50">
                    견적서와 계약서는 버전 고정 링크 방식으로, 영수증은 수납 레코드 기반으로 노출합니다.
                    전용 문서 API가 생기면 이 패널은 그대로 이어서 붙일 수 있습니다.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#1a1a1a]">
                {hubMode === "create" ? "만들기 메모" : hubMode === "send" ? "발송 메모" : "정리 메모"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#1a1a1a]/60">
              {hubMode === "create" ? (
                <>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    새 문서는 거래 맥락에서 시작하고, 최근 초안은 여기서 다시 이어 붙입니다.
                  </div>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    견적, 계약, 영수증은 종류가 달라도 같은 문서 허브 안에서 시작하도록 유도합니다.
                  </div>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    작성이 끝나면 바로 발송하기 모드로 넘어가서 버전과 수신자를 고정하는 흐름이 좋습니다.
                  </div>
                </>
              ) : hubMode === "send" ? (
                <>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    링크와 PDF는 같은 버튼이 아니라 다른 전달 수단으로 봅니다.
                  </div>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    최신 문서와 실제로 나간 버전은 다를 수 있으니, 발송 전에는 항상 버전을 다시 확인해야 합니다.
                  </div>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    만료 임박 큐는 재발송이나 연장 액션을 바로 결정하는 운영용 레일입니다.
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    견적서는 고객에게 버전 고정 링크로 보여주고, 계약서는 서명 링크와 함께 관리합니다.
                  </div>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    영수증은 분할 입금이 많기 때문에 수납 기록과 연결해서 보는 것이 기본입니다.
                  </div>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                    현재는 전용 문서 API가 없어 거래 상세를 모아 보여주는 구조입니다.
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => router.push("/partner/workspace")}
                className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] hover:bg-[#f7f7f5]"
              >
                거래 화면으로 이동
                <ArrowRight className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── 견적서 빠른 생성 다이얼로그 ─────────────────────────── */}
      {quoteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-6 shadow-xl">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-[#111110]">견적서 빠른 생성</h2>
              <p className="mt-1 text-xs text-[#615D59]">고객·거래·견적서를 한 번에 만듭니다.</p>
            </div>

            <form onSubmit={handleQuoteCreate} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#615D59]">고객명 <span className="text-red-400">*</span></label>
                <input
                  required
                  value={qForm.customerName}
                  onChange={e => setQForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="예) 강남메가스터디학원"
                  className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#615D59]">거래명 <span className="text-red-400">*</span></label>
                <input
                  required
                  value={qForm.dealTitle}
                  onChange={e => setQForm(f => ({ ...f, dealTitle: e.target.value }))}
                  placeholder="예) 전자칠판 4대 설치"
                  className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#615D59]">견적서 제목 <span className="text-red-400">*</span></label>
                <input
                  required
                  value={qForm.quoteTitle}
                  onChange={e => setQForm(f => ({ ...f, quoteTitle: e.target.value }))}
                  placeholder="예) ClassIn Board CB-86 4대 견적"
                  className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#615D59]">견적 금액 (원, 선택)</label>
                <input
                  value={qForm.amount}
                  onChange={e => setQForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="예) 14000000"
                  className="w-full rounded-lg border border-[#E5E5E0] px-3 py-2 text-sm focus:border-[#084734] focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
                />
              </div>

              {qError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{qError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setQuoteDialog(false); setQError(null) }}
                  className="flex-1 rounded-lg border border-[rgba(0,0,0,0.08)] py-2.5 text-sm font-medium text-[#615D59] hover:bg-[#F6F5F4]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={qSubmitting}
                  className="flex-1 rounded-lg bg-[#084734] py-2.5 text-sm font-medium text-white hover:bg-[#065c41] disabled:opacity-50"
                >
                  {qSubmitting ? "생성 중…" : "견적서 만들기"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
