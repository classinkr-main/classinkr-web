"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react"

import { useCrmOwners } from "@/components/admin/crm/useCrmOwners"
import { useQuoteWorkspacePreferences } from "@/components/admin/quote-templates/useQuoteWorkspacePreferences"
import QuickQuoteComposer, {
  type QuickQuoteCreatedPayload,
  type QuickQuoteManagerOption,
  type QuickQuotePrefill,
  type QuickQuoteTeamTemplate,
} from "@/components/portal/quotes/QuickQuoteComposer"
import { adminFetchJson } from "@/lib/admin-client"
import type { PartnerQuoteDetailsInput } from "@/lib/partners-types"
import {
  quoteDetailsToTeamTemplateInput,
  teamTemplateViewToQuoteDetails,
} from "@/lib/quote-team-template-composer"
import type { QuoteTemplateView } from "@/lib/quote-team-templates"
import type { QuoteTemplateCatalogResponse } from "@/lib/repositories/quote-team-templates"
import { portalFetch } from "@/lib/portal/portal-fetch"
import { getQuoteDetailsFromStructuredJson } from "@/lib/portal/quote-details"
import type { PartnerDocumentListItem } from "@/lib/portal/types"
import {
  DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID,
  resolveQuoteProductLine,
  type QuoteProductLine,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"
import {
  getQuoteQueueKey,
  getQuoteSentDays,
  getQuoteStage,
  QUOTE_QUEUE_GROUPS,
  QUOTE_STAGE_LABELS,
  type QuoteQueueKey,
} from "./quote-queue"
import DistributorSettlementSection from "./DistributorSettlementSection"

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
  /** SW/HW 제품군. 목록 API의 templateId 우선, 없으면 제목·거래명 기준 추정(불명확하면 HW). */
  productLine: QuoteProductLine
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

type ViewerPayload = {
  version?: {
    structured_json: Record<string, unknown> | null
    valid_until: string | null
  }
  error?: string
}

type QuoteDetailLine = { key: string; name: string; description: string | null; quantity: string; amount: string }
type QuoteDetail = { lines: QuoteDetailLine[]; supplier: string | null; validUntil: string | null }
type DetailState = { status: "loading" } | { status: "ready"; detail: QuoteDetail } | { status: "error"; message: string }

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

const PRODUCT_LINE_OPTIONS: Array<{ key: QuoteProductLine | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "software", label: "SW" },
  { key: "hardware", label: "HW" },
]

const PRODUCT_LINE_META: Record<QuoteProductLine, { label: string; supplier: string }> = {
  software: { label: "SW", supplier: "클래스인" },
  hardware: { label: "HW", supplier: "퀴드러닝" },
}

const STATUS_LABEL: Record<string, string> = {
  expired: "만료",
  archived: "보관",
}

// 신호색은 점·작은 글자에만(DESIGN.md 운영 상태 스케일). 채움 배경은 쓰지 않는다.
const TONE_DOT: Record<"go" | "warn" | "neutral" | "muted", string> = {
  go: "bg-[#084734]",
  warn: "bg-[#A8741A]",
  neutral: "bg-[#31302E]",
  muted: "bg-[#C9C6C0]",
}

const DESKTOP_QUERY = "(min-width: 1024px)"

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`
}

function formatMan(value: number) {
  return `${(Math.round(value / 1000) / 10).toLocaleString("ko-KR")}만`
}

function formatDay(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date)
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

/** 견적 제목·거래명은 보통 "고객명 …"으로 시작한다 — 고객명 옆에 붙일 때 앞머리를 뗀다. */
function withoutCustomerPrefix(value: string, customerName: string) {
  const trimmed = value.trim()
  if (customerName && trimmed.startsWith(customerName)) {
    const rest = trimmed.slice(customerName.length).trim()
    if (rest) return rest
  }
  return trimmed
}

/** 목록 2번째 줄 오른쪽 — 그 단계에서 제일 중요한 사실 한 가지. */
function getQueueStatus(quote: HardwareQuoteRow, key: QuoteQueueKey) {
  const sentDays = getQuoteSentDays(quote)
  switch (key) {
    case "convert":
      return { text: `동의 · ${formatDay(quote.acceptedAt) ?? "확인됨"}`, className: "font-semibold text-[#084734]" }
    case "remind":
      return sentDays !== null
        ? { text: `발송 ${sentDays}일째 미열람`, className: "font-semibold text-[#7A520F]" }
        : { text: "열람 대기", className: "text-[#78736D]" }
    case "send":
      return { text: `작성 중 · ${formatDay(quote.updatedAt) ?? ""}`, className: "font-semibold text-[#7A520F]" }
    case "terms":
      return { text: `열람 ${quote.viewCount}회 · ${formatDay(quote.lastViewedAt) ?? ""}`, className: "text-[#78736D]" }
    case "close":
      return { text: `검토 확인 · ${formatDay(quote.reviewConfirmedAt) ?? ""}`, className: "text-[#78736D]" }
    default:
      return { text: STATUS_LABEL[quote.status] ?? quote.status, className: "text-[#78736D]" }
  }
}

function getNextActionCopy(quote: HardwareQuoteRow, key: QuoteQueueKey) {
  const sentDays = getQuoteSentDays(quote)
  switch (key) {
    case "convert":
      return { label: "계약 전환", description: "고객 동의 완료 — 계약서를 만들고 딜 단계를 '계약'으로 넘깁니다." }
    case "remind":
      return {
        label: "열람 리마인드",
        description:
          sentDays !== null
            ? `발송 ${sentDays}일째 미열람 — 링크를 다시 보내 안내하세요.`
            : "발송했지만 아직 열람 전입니다.",
      }
    case "send":
      return { label: "검토 후 발송", description: "작성 중 — 금액·조건을 확인한 뒤 링크를 보내세요." }
    case "terms":
      return { label: "조건 확인", description: `열람 ${quote.viewCount}회, 검토 확인 전 — 조건에 질문이 있는지 확인하세요.` }
    case "close":
      return { label: "동의 요청", description: "검토 확인 완료 — 최종 동의를 요청하세요." }
    default:
      return { label: STATUS_LABEL[quote.status] ?? "종료", description: "만료되었거나 보관된 견적입니다." }
  }
}

function getTimeline(quote: HardwareQuoteRow) {
  const stage = getQuoteStage(quote)
  const sentDays = getQuoteSentDays(quote)
  const sentAt = formatDay(quote.latestShareCreatedAt)
  const details: Array<{ text: string | null; warn?: boolean }> = [
    { text: `v${quote.latestVersionNumber ?? quote.versionCount} · ${formatDay(quote.updatedAt) ?? ""} 수정` },
    { text: stage >= 2 ? `${sentAt ?? "발송됨"}${quote.shareCount > 1 ? ` · 링크 ${quote.shareCount}회` : ""}` : "아직 발송 전" },
    {
      text:
        quote.viewCount > 0
          ? `${quote.viewCount}회${quote.lastViewedAt ? ` · 마지막 ${formatDay(quote.lastViewedAt)}` : ""}`
          : sentDays !== null
            ? `${sentDays}일째 미열람`
            : null,
      warn: quote.viewCount === 0 && sentDays !== null,
    },
    { text: formatDay(quote.reviewConfirmedAt) },
    { text: formatDay(quote.acceptedAt) },
  ]

  return QUOTE_STAGE_LABELS.map((label, index) => ({
    label,
    done: index + 1 <= stage,
    won: index === 4 && stage === 5,
    ...details[index],
  }))
}

async function fetchQuoteDetail(quoteId: string): Promise<QuoteDetail> {
  const response = await portalFetch(`/api/portal/quotes/${quoteId}?include=viewer`)
  const payload = (await response.json().catch(() => null)) as ViewerPayload | null
  if (!response.ok || !payload?.version) {
    throw new Error(payload?.error ?? "견적 상세를 불러오지 못했습니다.")
  }

  const details = getQuoteDetailsFromStructuredJson(payload.version.structured_json, {
    validUntil: payload.version.valid_until,
  })
  const lines = (details?.lineItems ?? []).map((line, index) => {
    const amount = line.lineSupplyAmount ?? (line.unitPrice != null ? line.unitPrice * (line.quantity ?? 1) : null)
    return {
      key: line.id ?? `${index}`,
      name: line.itemName,
      description: line.itemDescription ?? null,
      quantity: line.quantity != null ? `×${line.quantity}${line.quantityUnit && line.quantityUnit !== "대" ? line.quantityUnit : ""}` : "",
      amount: amount != null ? formatMoney(amount) : "—",
    }
  })

  return {
    lines,
    supplier: details?.supplierBusinessName ?? null,
    validUntil: formatDay(payload.version.valid_until),
  }
}

function templateIdFromQuickAction(action: HardwareQuoteQuickAction): StandardQuoteTemplateId {
  return action === "new" ? DEFAULT_HARDWARE_QUOTE_TEMPLATE_ID : action
}

const GHOST_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12.5px] font-semibold text-[#31302E] transition-colors hover:border-[#c8c8c4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
const SOLID_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-60"
const OUTLINE_STRONG_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#31302E] bg-white px-3.5 text-[12.5px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F2] disabled:cursor-not-allowed disabled:opacity-60"

const QUOTE_TEMPLATES_API = "/api/admin/quote-templates"

/** 브라우저 현지 날짜(KST) — 팀 템플릿 유효기한 계산 기준. */
function getLocalDateValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function HardwareQuotesPanel({
  quickAction = null,
  onQuickActionConsumed,
  prefill = null,
}: HardwareQuotesPanelProps) {
  const { preferences, updatePreferences, storageError } = useQuoteWorkspacePreferences()
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
  const [productLineFilter, setProductLineFilter] = useState<QuoteProductLine | "all">("all")
  // ?quote=<id> 딥링크(총판 미수금 탭·알림)로 들어오면 그 견적을 먼저 연다. 목록이 비동기로 오므로 첫 렌더 마크업은 같다.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("quote")
  )
  const [details, setDetails] = useState<Record<string, DetailState>>({})
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

  const productLineCounts: Record<QuoteProductLine | "all", number> = {
    all: quotes.length,
    software: quotes.filter((quote) => quote.productLine === "software").length,
    hardware: quotes.filter((quote) => quote.productLine === "hardware").length,
  }

  // 다음 할 일 기준 묶음. 그룹 순서 = 처리 우선순위, 그룹 안은 최근 수정순.
  const groups = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase()
    const visible = quotes
      .filter((quote) => {
        if (productLineFilter !== "all" && quote.productLine !== productLineFilter) return false
        if (!normalizedQuery) return true
        return [quote.quoteNumber, quote.title, quote.customerName, quote.dealTitle].some((value) =>
          String(value ?? "").toLowerCase().includes(normalizedQuery)
        )
      })
      .sort((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0))

    return QUOTE_QUEUE_GROUPS.map((group) => {
      const items = visible.filter((quote) => getQuoteQueueKey(quote) === group.key)
      return { ...group, items, amount: items.reduce((sum, quote) => sum + quote.totalAmount, 0) }
    }).filter((group) => group.items.length > 0)
  }, [productLineFilter, quotes, searchTerm])

  const visibleCount = groups.reduce((sum, group) => sum + group.items.length, 0)
  const selectedQuote =
    groups.flatMap((group) => group.items).find((quote) => quote.id === selectedId) ?? groups[0]?.items[0] ?? null
  const selectedDetail = selectedQuote ? details[selectedQuote.id] : undefined

  // 작성기 '템플릿' 칸의 팀 템플릿. 표가 없거나 API 가 실패하면 빈 목록 — 기본 템플릿(코드 상수)만으로 동작한다.
  const [teamTemplates, setTeamTemplates] = useState<QuickQuoteTeamTemplate[]>([])

  async function loadTeamTemplates() {
    try {
      const catalog = await adminFetchJson<QuoteTemplateCatalogResponse>(QUOTE_TEMPLATES_API, { cache: "no-store" })
      const today = getLocalDateValue()
      setTeamTemplates(
        (catalog?.team ?? []).flatMap((view) => {
          const details = teamTemplateViewToQuoteDetails(view, today)
          return details ? [{ id: view.id, label: view.name, details, canDelete: view.canEdit }] : []
        })
      )
    } catch (error) {
      console.warn("[quotes] 팀 템플릿을 불러오지 못해 기본 템플릿만 씁니다", error)
      setTeamTemplates([])
    }
  }

  useEffect(() => {
    if (composerOpen) void loadTeamTemplates()
  }, [composerOpen])

  async function handleSaveTemplate(draft: { name: string; details: PartnerQuoteDetailsInput }) {
    const input = quoteDetailsToTeamTemplateInput(draft.name, draft.details)
    if (!input) throw new Error("템플릿에 담을 카탈로그 품목이 없습니다.")
    await adminFetchJson<{ template: QuoteTemplateView }>(QUOTE_TEMPLATES_API, {
      method: "POST",
      body: JSON.stringify(input),
    })
    await loadTeamTemplates()
  }

  async function handleDeleteTemplate(id: string) {
    await adminFetchJson(`${QUOTE_TEMPLATES_API}/${id}`, { method: "DELETE" })
    setTeamTemplates((current) => current.filter((template) => template.id !== id))
    updatePreferences({ hiddenTemplateIds: preferences.hiddenTemplateIds.filter((hiddenId) => hiddenId !== id) })
  }

  const recentQuotes = useMemo(
    () =>
      [...quotes].sort((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0)).slice(0, 10).map((quote) => ({
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
      // 목록이 바뀌면 상세(품목)도 다시 받는다 — 버전이 올라갔을 수 있다.
      setDetails({})
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

  // 선택한 견적의 품목·공급자는 목록 API에 없어 상세를 한 번 받아 캐시한다.
  // id 별 캐시라 응답이 늦게 와도 다른 견적에 섞이지 않는다 — 취소 없이 한 번만 받는다.
  const selectedQuoteId = selectedQuote?.id ?? null
  useEffect(() => {
    if (!selectedQuoteId || details[selectedQuoteId]) return
    setDetails((current) => ({ ...current, [selectedQuoteId]: { status: "loading" } }))
    fetchQuoteDetail(selectedQuoteId)
      .then((detail) => {
        setDetails((current) => ({ ...current, [selectedQuoteId]: { status: "ready", detail } }))
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "견적 상세를 불러오지 못했습니다."
        setDetails((current) => ({ ...current, [selectedQuoteId]: { status: "error", message } }))
      })
  }, [selectedQuoteId, details])

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
    }

    setQuotes((current) => [
      nextQuote,
      ...current.filter((item) => item.id !== payload.document.id),
    ])
    setSelectedId(payload.document.id)
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

  function handleSelect(quote: HardwareQuoteRow) {
    // 좁은 화면에는 상세 패널이 없다 — 기존 직접 보기로 연다.
    if (typeof window !== "undefined" && !window.matchMedia(DESKTOP_QUERY).matches) {
      openAdminQuoteView(quote.id)
      return
    }
    setSelectedId(quote.id)
  }

  function renderNextActionButtons(quote: HardwareQuoteRow, key: QuoteQueueKey) {
    const sharing = sharingQuoteId === quote.id
    const viewButton = (
      <button type="button" onClick={() => openAdminQuoteView(quote.id)} className={GHOST_BUTTON}>
        <FileText className="h-3.5 w-3.5" />
        문서 보기
      </button>
    )

    if (key === "convert") {
      const converting = convertingQuoteId === quote.id
      return (
        <>
          {viewButton}
          <button
            type="button"
            onClick={() => void handleConvertToContract(quote)}
            disabled={converting}
            title="이 견적으로 연결된 계약서를 생성하고 딜 단계를 '계약'으로 전진시킵니다."
            className={SOLID_BUTTON}
          >
            {converting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {converting ? "전환 중…" : "계약서 만들기 →"}
          </button>
        </>
      )
    }

    if (key === "closed") return viewButton

    const copyButton = (
      <button
        type="button"
        onClick={() => void handleCopyShareLink(quote)}
        disabled={sharing}
        className={key === "remind" || key === "send" ? SOLID_BUTTON : OUTLINE_STRONG_BUTTON}
      >
        {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        {key === "send" ? "발송 링크 복사" : "링크 복사"}
      </button>
    )

    if (key === "remind") {
      return (
        <>
          <button type="button" onClick={() => void handleOpenShareLink(quote)} disabled={sharing} className={GHOST_BUTTON}>
            <ExternalLink className="h-3.5 w-3.5" />
            고객 화면
          </button>
          {copyButton}
        </>
      )
    }

    return (
      <>
        {viewButton}
        {copyButton}
      </>
    )
  }

  function renderDetail(quote: HardwareQuoteRow) {
    const key = getQuoteQueueKey(quote)
    const group = QUOTE_QUEUE_GROUPS.find((item) => item.key === key)
    const nextAction = getNextActionCopy(quote, key)
    const lineMeta = PRODUCT_LINE_META[quote.productLine]
    const timeline = getTimeline(quote)
    const sharing = sharingQuoteId === quote.id

    return (
      <section aria-live="polite" aria-label="견적 상세" className="flex min-w-0 flex-col gap-6 px-7 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11.5px] text-[#78736D]">{quote.quoteNumber}</span>
              <span
                className={`rounded border px-1.5 text-[11px] font-semibold tracking-wide ${
                  quote.productLine === "software" ? "border-[#084734]/35 text-[#084734]" : "border-[#e8e8e4] text-[#615D59]"
                }`}
              >
                {lineMeta.label} · {lineMeta.supplier}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAdminQuoteView(quote.id)}
              className="mt-1.5 block max-w-full truncate text-left text-lg font-bold tracking-[-0.02em] text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline"
            >
              {quote.customerName} · {withoutCustomerPrefix(quote.title, quote.customerName)}
            </button>
            <p className="mt-0.5 text-xs text-[#615D59]">
              {withoutCustomerPrefix(quote.dealTitle, quote.customerName)} · v{quote.latestVersionNumber ?? quote.versionCount} · {formatDay(quote.updatedAt)} 수정
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-[-0.02em] tabular-nums text-[#111110]">{formatMoney(quote.totalAmount)}</p>
            <p className="text-[11.5px] text-[#78736D]">VAT 별도</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e8e8e4] px-4 py-3.5">
          <div className="min-w-0 flex-[1_1_240px]">
            <p className="flex items-center gap-2 text-[13.5px] font-bold text-[#111110]">
              <span className={`h-[7px] w-[7px] rounded-full ${TONE_DOT[group?.tone ?? "neutral"]}`} />
              {nextAction.label}
            </p>
            <p className="mt-0.5 text-xs text-[#615D59]">{nextAction.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">{renderNextActionButtons(quote, key)}</div>
        </div>

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <h3 className="mb-3 text-[11.5px] font-semibold text-[#78736D]">고객 반응</h3>
            <ol>
              {timeline.map((step, index) => (
                <li key={step.label} className="flex gap-2.5">
                  <span aria-hidden className="flex w-3 shrink-0 flex-col items-center pt-1">
                    <span
                      className={`h-[9px] w-[9px] rounded-full border-[1.5px] ${
                        step.won
                          ? "border-[#084734] bg-[#084734]"
                          : step.done
                            ? "border-[#31302E] bg-[#31302E]"
                            : "border-[#CFCBC5] bg-white"
                      }`}
                    />
                    {index < timeline.length - 1 && (
                      <span
                        className={`mt-[3px] min-h-5 w-[1.5px] flex-1 ${
                          timeline[index + 1].done ? "bg-[#31302E]" : "bg-[#e8e8e4]"
                        }`}
                      />
                    )}
                  </span>
                  <span className="pb-3.5">
                    <span className={`block text-[13px] ${step.done ? "font-semibold text-[#111110]" : "text-[#78736D]"}`}>
                      {step.label}
                    </span>
                    {step.text && (
                      <span className={`block text-[11.5px] ${step.warn ? "font-semibold text-[#7A520F]" : "text-[#78736D]"}`}>
                        {step.text}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="mb-1.5 text-[11.5px] font-semibold text-[#78736D]">품목</h3>
            {!selectedDetail || selectedDetail.status === "loading" ? (
              <p className="flex items-center gap-2 py-3 text-xs text-[#78736D]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                품목을 불러오는 중
              </p>
            ) : selectedDetail.status === "error" ? (
              <p className="py-3 text-xs text-[#B43E3E]">{selectedDetail.message}</p>
            ) : (
              <>
                {selectedDetail.detail.lines.length === 0 ? (
                  <p className="py-3 text-xs text-[#78736D]">저장된 품목 정보가 없습니다 — 문서 보기에서 확인하세요.</p>
                ) : (
                  selectedDetail.detail.lines.map((line) => (
                    <div
                      key={line.key}
                      className="grid grid-cols-[minmax(0,1fr)_48px_112px] gap-2 border-b border-[#f0f0ec] py-2 text-[12.5px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{line.name}</span>
                        {line.description && <span className="block truncate text-[11px] text-[#78736D]">{line.description}</span>}
                      </span>
                      <span className="text-right tabular-nums text-[#78736D]">{line.quantity}</span>
                      <span className="text-right font-semibold tabular-nums">{line.amount}</span>
                    </div>
                  ))
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2 border-t border-[#31302E] pt-2.5 text-[12.5px] font-bold">
                  <span>합계</span>
                  <span className="text-right tabular-nums">{formatMoney(quote.totalAmount)}</span>
                </div>
                <dl className="mt-4 grid grid-cols-[72px_1fr] gap-x-2.5 gap-y-1.5 text-xs">
                  <dt className="text-[#78736D]">공급자</dt>
                  <dd className="text-[#31302E]">{selectedDetail.detail.supplier ?? lineMeta.supplier}</dd>
                  <dt className="text-[#78736D]">유효기한</dt>
                  <dd className="text-[#31302E]">{selectedDetail.detail.validUntil ?? "—"}</dd>
                </dl>
              </>
            )}

            <h3 className="mb-2 mt-5 text-[11.5px] font-semibold text-[#78736D]">공유 링크</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCopyShareLink(quote)}
                disabled={sharing}
                className={GHOST_BUTTON}
              >
                {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {quote.shareCount > 0 || quote.shareUrl ? "링크 복사" : "링크 만들고 복사"}
              </button>
              <button
                type="button"
                onClick={() => void handleOpenShareLink(quote)}
                disabled={sharing}
                className={GHOST_BUTTON}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                고객 화면 열기
              </button>
            </div>
          </div>
        </div>

        <DistributorSettlementSection key={quote.id} quoteId={quote.id} />
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:px-6 sm:py-5">
      {notice && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border bg-white px-4 py-3 text-sm ${
            notice.tone === "success" ? "border-[#084734]/30 text-[#084734]" : "border-[#F2B8B8] text-[#B43E3E]"
          }`}
        >
          {notice.tone === "success" ? <Check className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
          <span>{notice.message}</span>
        </div>
      )}

      {loadError ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-6 py-14 text-center">
          <AlertCircle className="h-5 w-5 text-[#B43E3E]" />
          <p className="mt-3 text-sm font-medium text-[#111110]">견적서 목록을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs text-[#B43E3E]">{loadError}</p>
          <button type="button" onClick={() => void loadQuotes()} className={`${GHOST_BUTTON} mt-4`}>
            다시 시도
          </button>
        </div>
      ) : loading && quotes.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-6 py-14 text-sm text-[#615D59]">
          <Loader2 className="h-4 w-4 animate-spin" />
          견적서를 불러오는 중입니다.
        </div>
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-6 py-16 text-center">
          <FileText className="h-5 w-5 text-[#615D59]" />
          <p className="mt-3 text-sm font-medium text-[#111110]">저장된 견적서가 없습니다.</p>
          <p className="mt-1 text-xs text-[#78736D]">견적서를 만들면 여기서 다음 할 일 순서로 정리됩니다.</p>
          <button
            type="button"
            onClick={() => {
              setComposerTemplateId("board_86")
              setComposerOpen(true)
            }}
            className={`${SOLID_BUTTON} mt-4`}
          >
            <Plus className="h-3.5 w-3.5" />
            첫 견적서 작성
          </button>
        </div>
      ) : (
        <div className="flex overflow-hidden rounded-[10px] border border-[#e8e8e4] bg-white">
          <aside aria-label="다음 할 일별 견적" className="w-full min-w-0 shrink-0 border-[#e8e8e4] lg:w-[400px] lg:border-r">
            <div className="flex flex-col gap-2.5 border-b border-[#e8e8e4] px-3.5 py-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="견적번호, 고객사, 거래명"
                  aria-label="견적 검색"
                  className="h-9 w-full rounded-md border border-[#e8e8e4] bg-white pl-9 pr-3 text-[13px] outline-none placeholder:text-[#A39E98] focus:border-[#084734]"
                />
              </label>
              <div className="flex items-center gap-4">
                <div role="group" aria-label="유형" className="flex gap-4">
                  {PRODUCT_LINE_OPTIONS.map((option) => {
                    const active = productLineFilter === option.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setProductLineFilter(option.key)}
                        aria-pressed={active}
                        className={`py-1.5 text-[12.5px] ${
                          active ? "font-semibold text-[#111110] shadow-[inset_0_-1.5px_0_#111110]" : "text-[#615D59] hover:text-[#111110]"
                        }`}
                      >
                        {option.label} <span className="font-normal tabular-nums text-[#78736D]">{productLineCounts[option.key]}</span>
                      </button>
                    )
                  })}
                </div>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => void loadQuotes()}
                  disabled={loading}
                  title="새로고침"
                  aria-label="새로고침"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#615D59] hover:bg-[#f0f0ec] hover:text-[#111110] disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {visibleCount === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-[#111110]">조건에 맞는 견적서가 없습니다.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("")
                    setProductLineFilter("all")
                  }}
                  className={`${GHOST_BUTTON} mt-3`}
                >
                  전체 보기
                </button>
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.key} className="border-b border-[#f0f0ec] pb-1.5 last:border-b-0">
                  <h2 className="flex items-baseline justify-between px-4 pb-1.5 pt-3.5 text-[11.5px] font-semibold text-[#31302E]">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[group.tone]}`} />
                      {group.label}
                      <span className="font-normal tabular-nums text-[#78736D]">{group.items.length}</span>
                    </span>
                    <span className="font-normal tabular-nums text-[#78736D]">{formatMan(group.amount)}원</span>
                  </h2>
                  {group.items.map((quote) => {
                    const selected = quote.id === selectedQuote?.id
                    const status = getQueueStatus(quote, group.key)
                    return (
                      <button
                        key={quote.id}
                        type="button"
                        onClick={() => handleSelect(quote)}
                        aria-pressed={selected}
                        className={`block w-full py-2.5 pl-[18px] pr-4 text-left transition-colors ${
                          selected ? "bg-[#F6F5F2] shadow-[inset_2px_0_0_#084734]" : "hover:bg-[#FCFCFA]"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-2.5">
                          <span className="truncate font-semibold text-[13px] text-[#111110]">
                            {quote.customerName}{" "}
                            <span className="font-normal text-[#615D59]">
                              · {withoutCustomerPrefix(quote.dealTitle, quote.customerName)}
                            </span>
                          </span>
                          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#111110]">
                            {formatMan(quote.totalAmount)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex justify-between gap-2 text-[11.5px] text-[#78736D]">
                          <span>
                            <span className="font-mono text-[11px]">{quote.quoteNumber}</span> · {PRODUCT_LINE_META[quote.productLine].label}
                          </span>
                          <span className={`whitespace-nowrap ${status.className}`}>{status.text}</span>
                        </span>
                      </button>
                    )
                  })}
                </section>
              ))
            )}
          </aside>

          <div className="hidden min-w-0 flex-1 lg:block">
            {selectedQuote ? (
              renderDetail(selectedQuote)
            ) : (
              <p className="px-7 py-16 text-center text-sm text-[#78736D]">왼쪽에서 견적을 고르세요.</p>
            )}
          </div>
        </div>
      )}

      <QuickQuoteComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        recentQuotes={recentQuotes}
        apiBase="/api/portal"
        initialTemplateId={composerTemplateId}
        supplierManagerOptions={supplierManagerOptions}
        teamTemplates={teamTemplates}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        displaySettings={{ preferences, onChange: updatePreferences, storageError }}
        prefill={prefill}
        onCreated={handleCreated}
      />
    </div>
  )
}
