"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  BadgeCheck,
  BookCopy,
  FileText,
  Layers3,
  Link2,
  RefreshCw,
  ReceiptText,
  Signature,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
type DocumentsApiPayload = {
  mode: PartnerReadMode
  summary: PartnerDocumentSummary
  documents: PartnerDocumentListItem[]
  deals: Array<{ id: string }>
  customers: Array<{ id: string }>
}

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
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "contract":
      return "bg-violet-50 text-violet-700 border-violet-200"
    case "receipt":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
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

function buildDocuments(details: DealDetailPayload[]) {
  const documents: HubDocument[] = []

  for (const detail of details) {
    for (const doc of detail.quote_documents) {
      documents.push({
        id: doc.id,
        kind: "quote",
        number: doc.quote_number,
        title: doc.versions[0]?.title ?? "견적서",
        status: doc.status,
        updatedAt: doc.updated_at,
        customerName: detail.customer.name,
        customerId: detail.customer.id,
        dealId: detail.deal.id,
        dealTitle: detail.deal.title,
        dealCode: detail.deal.deal_code,
        versionCount: doc.versions.length,
        currentVersionLabel: latestVersionLabel("quote", doc.versions),
        totalAmount: doc.versions[0]?.total_amount ?? 0,
        versions: doc.versions,
        shares: doc.shares,
        pdfUrl: null,
      })
    }

    for (const doc of detail.contract_documents) {
      documents.push({
        id: doc.id,
        kind: "contract",
        number: doc.contract_number,
        title: doc.versions[0]?.title ?? "계약서",
        status: doc.status,
        updatedAt: doc.updated_at,
        customerName: detail.customer.name,
        customerId: detail.customer.id,
        dealId: detail.deal.id,
        dealTitle: detail.deal.title,
        dealCode: detail.deal.deal_code,
        versionCount: doc.versions.length,
        currentVersionLabel: latestVersionLabel("contract", doc.versions),
        totalAmount: doc.versions[0]?.total_amount ?? detail.deal.contracted_amount,
        versions: doc.versions,
        shares: doc.shares,
        pdfUrl: null,
      })
    }

    for (const receipt of detail.receipts) {
      documents.push({
        id: receipt.id,
        kind: "receipt",
        number: receipt.receipt_number,
        title: "영수증",
        status: receipt.pdf_url ? "issued" : "draft",
        updatedAt: receipt.created_at,
        customerName: detail.customer.name,
        customerId: detail.customer.id,
        dealId: detail.deal.id,
        dealTitle: detail.deal.title,
        dealCode: detail.deal.deal_code,
        versionCount: 1,
        currentVersionLabel: formatMoney(receipt.total_amount),
        totalAmount: receipt.total_amount,
        versions: [],
        shares: [],
        pdfUrl: receipt.pdf_url,
        receipt,
      })
    }
  }

  return documents.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
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

function getCopyableLink(document: HubDocument) {
  if (typeof window === "undefined") return ""

  if (document.kind === "contract") {
    const share = document.shares[0] as ContractDocumentBundle["shares"][number] | undefined
    if (share?.token) {
      return `${window.location.origin}/partner/sign/${share.token}`
    }
  }

  if (document.kind === "quote") {
    const share = document.shares[0] as QuoteDocumentBundle["shares"][number] | undefined
    if (share?.token) {
      return `${window.location.origin}/partner/quote/${document.id}`
    }
  }

  if (document.kind === "receipt" && document.pdfUrl) {
    return document.pdfUrl
  }

  return `${window.location.origin}/partner/workspace`
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
          <p className="text-[11px] text-[#1a1a1a]/35">버전</p>
          <p className="mt-1 text-xs font-semibold text-[#1a1a1a]">{document.currentVersionLabel ?? `${document.versionCount}개`}</p>
        </div>
        <div className="rounded-xl bg-[#f7f7f5] px-3 py-2">
          <p className="text-[11px] text-[#1a1a1a]/35">업데이트</p>
          <p className="mt-1 text-xs font-semibold text-[#1a1a1a]">{formatDate(document.updatedAt)}</p>
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
  const [section, setSection] = useState<HubSection>("all")
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(DEMO_DOCUMENTS[0].id)
  const [hydratedDealIds, setHydratedDealIds] = useState<Record<string, true>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

        return

        setMode(payload.mode ?? "demo")
        setSourceDealCount(payload.deals.length)

        const dealsToLoad = payload.deals.slice(0, 12)
        const details = await Promise.allSettled(
          dealsToLoad.map(async (deal) => {
            const response = await readJson<{ deal: DealDetailPayload }>(`/api/partner/deals/${deal.id}`)
            return response.deal
          })
        )

        if (!alive) return

        const loadedDetails = details
          .filter((result): result is PromiseFulfilledResult<DealDetailPayload> => result.status === "fulfilled")
          .map((result) => result.value)

        const legacyHubDocuments = buildDocuments(loadedDetails)
        if (legacyHubDocuments.length > 0) {
          setDocuments(legacyHubDocuments)
          setSelectedDocumentId(legacyHubDocuments[0].id)
        } else {
          setDocuments(DEMO_DOCUMENTS)
          setSelectedDocumentId(DEMO_DOCUMENTS[0].id)
          setError("문서 전용 API가 아직 없어 거래 상세를 모아 보여주는 중입니다.")
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
  }, [documents, hydratedDealIds, selectedDocumentId])

  const visibleDocuments =
    section === "all"
      ? documents
      : documents.filter((document) => document.kind === section)

  const selectedDocument = visibleDocuments.find((document) => document.id === selectedDocumentId) ?? visibleDocuments[0] ?? documents[0]
  const quoteCount = documents.filter((document) => document.kind === "quote").length
  const contractCount = documents.filter((document) => document.kind === "contract").length
  const receiptCount = documents.filter((document) => document.kind === "receipt").length
  void summary

  return (
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
                견적서, 계약서, 영수증을 한 곳에 모아 보고 버전과 링크를 거래 단위로 관리합니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1a1a1a]/50">
                <DocumentStat icon={<Layers3 className="h-3.5 w-3.5" />} label="전체" value={`${documents.length}건`} />
                <DocumentStat icon={<FileText className="h-3.5 w-3.5" />} label="견적서" value={`${quoteCount}건`} />
                <DocumentStat icon={<Signature className="h-3.5 w-3.5" />} label="계약서" value={`${contractCount}건`} />
                <DocumentStat icon={<ReceiptText className="h-3.5 w-3.5" />} label="영수증" value={`${receiptCount}건`} />
                <DocumentStat
                  icon={<BadgeCheck className="h-3.5 w-3.5" />}
                  label="기준 거래"
                  value={sourceDealCount > 0 ? `${sourceDealCount}건` : "demo"}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 self-end">
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

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="gap-4 pb-4">
              <div>
                <CardTitle className="text-lg font-semibold text-[#1a1a1a]">문서 목록</CardTitle>
                <p className="mt-1 text-sm text-[#1a1a1a]/45">
                  전체 / 견적서 / 계약서 / 영수증 단위로 전환하며 하위 버전까지 확인합니다.
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
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-2xl bg-[#f0f0ec]" />
                  ))}
                </div>
              ) : visibleDocuments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-4 py-10 text-center">
                  <p className="text-sm text-[#1a1a1a]/50">
                    견적서나 계약서가 생성되면 여기에 표시됩니다. 견적서 탭에서 견적을 작성하고 거래로 연결하세요.
                  </p>
                  <a
                    href="/partner/quotes"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2 text-sm font-medium text-[#084734] hover:bg-[#ECFDF5]"
                  >
                    견적서 탭으로 이동
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
              <CardTitle className="text-lg font-semibold text-[#1a1a1a]">문서 상세</CardTitle>
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
                        <p className="text-[11px] text-[#1a1a1a]/35">상태</p>
                        <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{selectedDocument.status}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] text-[#1a1a1a]/35">업데이트</p>
                        <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{formatDate(selectedDocument.updatedAt)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">링크 / 파일</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/45">
                          문서 전용 백엔드가 없어 현재는 거래 상세에서 모은 링크를 보여줍니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const link = getCopyableLink(selectedDocument)
                          if (navigator.clipboard) {
                            await navigator.clipboard.writeText(link)
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-3 py-2 text-sm font-medium text-[#1a1a1a] hover:bg-white"
                      >
                        <Link2 className="h-4 w-4" />
                        링크 복사
                      </button>
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
              <CardTitle className="text-sm font-semibold text-[#1a1a1a]">문서 메모</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#1a1a1a]/60">
              <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                견적서는 고객에게 버전 고정 링크로 보여주고, 계약서는 서명 링크와 함께 관리합니다.
              </div>
              <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                영수증은 분할 입금이 많기 때문에 수납 기록과 연결해서 보는 것이 기본입니다.
              </div>
              <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                현재는 전용 문서 API가 없어 거래 상세를 모아 보여주는 구조입니다.
              </div>
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
  )
}
