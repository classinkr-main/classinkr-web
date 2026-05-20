"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  BarChart3,
  Bot,
  Bookmark,
  CheckSquare,
  Database,
  Eye,
  ExternalLink,
  FileText,
  FolderTree,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  ThumbsUp,
} from "lucide-react"

import DocsCategoryManager from "@/components/admin/docs/DocsCategoryManager"
import DocsQuestionClusterBacklog from "@/components/admin/docs/DocsQuestionClusterBacklog"
import DocsRecommendedQuestionsManager from "@/components/admin/docs/DocsRecommendedQuestionsManager"
import DocsRedirectManager from "@/components/admin/docs/DocsRedirectManager"
import { adminFetch, adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import type {
  AdminDocsAnalyticsResponse,
  AdminDocsArticleSummary,
  AdminDocsContentResponse,
} from "@/lib/admin-docs"

interface ReindexResult {
  configured: boolean
  articleCount: number
  chunkCount: number
  warnings?: string[]
  error?: string
}

interface SavedDocsView {
  id: string
  label: string
  categoryFilter: string
  statusFilter: string
  docTypeFilter: string
  readinessFilter: string
  searchQuery: string
}

const SAVED_VIEWS_STORAGE_KEY = "admin_docs_saved_views"

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value)
}

function getStatusTone(status: string) {
  if (status === "published") return "border-emerald-100 bg-emerald-50 text-emerald-700"
  if (status === "review") return "border-amber-100 bg-amber-50 text-amber-700"
  if (status === "archived") return "border-[#e8e8e4] bg-[#f5f5f2] text-[#1a1a1a]/45"
  if (status === "static") return "border-sky-100 bg-sky-50 text-sky-700"
  return "border-[#e8e8e4] bg-white text-[#1a1a1a]/50"
}

const DOC_TYPE_LABELS: Record<string, string> = {
  guide: "가이드",
  manual: "매뉴얼",
  faq: "FAQ",
  troubleshooting: "문제 해결",
  release_note: "업데이트",
  reference: "레퍼런스",
}

const STATUS_FILTERS = [
  { value: "all", label: "전체 상태" },
  { value: "draft", label: "초안" },
  { value: "review", label: "리뷰" },
  { value: "published", label: "게시됨" },
  { value: "archived", label: "보관" },
  { value: "static", label: "정적 문서" },
]

const DOC_TYPE_FILTERS = [
  { value: "all", label: "전체 유형" },
  { value: "guide", label: "가이드" },
  { value: "manual", label: "매뉴얼" },
  { value: "faq", label: "FAQ" },
  { value: "troubleshooting", label: "문제 해결" },
  { value: "release_note", label: "업데이트" },
  { value: "reference", label: "레퍼런스" },
]

const ARTICLE_STATUS_OPTIONS = [
  { value: "draft", label: "초안" },
  { value: "review", label: "리뷰" },
  { value: "published", label: "게시됨" },
  { value: "archived", label: "보관" },
]

const ARTICLE_VISIBILITY_OPTIONS = [
  { value: "public", label: "공개" },
  { value: "unlisted", label: "링크 공개" },
  { value: "internal", label: "내부" },
]

const READINESS_FILTERS = [
  { value: "all", label: "전체 준비 상태" },
  { value: "ai-issues", label: "AI 보강 필요" },
  { value: "stale", label: "검수 주기 초과" },
  { value: "featured", label: "대표 문서" },
]

const DOCS_TABS = [
  { value: "documents", label: "문서", icon: FileText },
  { value: "recommended", label: "추천 질문", icon: MessageSquareText },
  { value: "categories", label: "카테고리", icon: FolderTree },
  { value: "redirects", label: "리디렉트", icon: ExternalLink },
  { value: "backlog", label: "질문 백로그", icon: Bot },
] as const

type DocsTab = (typeof DOCS_TABS)[number]["value"]

function getSourceLabel(content: AdminDocsContentResponse | null) {
  if (!content) return "연결 확인 중"
  if (content.status === "live") return "Supabase live"
  if (content.status === "unconfigured") return "환경 미설정"
  return "정적 폴백"
}

function StatusBadge({ label, tone }: { label: string; tone?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone ?? "border-[#e8e8e4] bg-white text-[#1a1a1a]/45"}`}
    >
      {label}
    </span>
  )
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="inline-flex rounded-xl bg-[#f0f0ec] p-2 text-[#1a1a1a]/55">{icon}</div>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[#111110]">{value}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-[#1a1a1a]/42">{hint}</p>
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-5 py-12 text-center">
      <p className="text-[14px] font-semibold text-[#111110]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/42">
        {description}
      </p>
    </div>
  )
}

function ArticleStatus({ article }: { article: AdminDocsArticleSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatusBadge label={article.status} tone={getStatusTone(article.status)} />
      <StatusBadge label={article.visibility} />
      {article.featured ? (
        <StatusBadge label="featured" tone="border-emerald-100 bg-emerald-50 text-emerald-700" />
      ) : null}
    </div>
  )
}

export default function AdminDocsPage() {
  const router = useRouter()
  const [content, setContent] = useState<AdminDocsContentResponse | null>(null)
  const [analytics, setAnalytics] = useState<AdminDocsAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [docTypeFilter, setDocTypeFilter] = useState("all")
  const [readinessFilter, setReadinessFilter] = useState("all")
  const [reindexing, setReindexing] = useState(false)
  const [reindexNotice, setReindexNotice] = useState<{
    tone: "success" | "warning"
    message: string
  } | null>(null)
  const [articleSavingId, setArticleSavingId] = useState<string | null>(null)
  const [articleNotice, setArticleNotice] = useState<string | null>(null)
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([])
  const [bulkStatus, setBulkStatus] = useState("unchanged")
  const [bulkVisibility, setBulkVisibility] = useState("unchanged")
  const [bulkCategoryId, setBulkCategoryId] = useState("unchanged")
  const [bulkFeatured, setBulkFeatured] = useState("unchanged")
  const [bulkSaving, setBulkSaving] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedDocsView[]>([])
  const [activeTab, setActiveTab] = useState<DocsTab>("documents")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [contentData, analyticsData] = await Promise.all([
        adminFetchJsonCached<AdminDocsContentResponse>("/api/admin/docs", undefined, { ttlMs: 60_000 }),
        adminFetchJsonCached<AdminDocsAnalyticsResponse>("/api/admin/docs/analytics?days=30", undefined, { ttlMs: 60_000 }),
      ])

      setContent(contentData)
      setAnalytics(analyticsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 관리 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SavedDocsView[]
      if (Array.isArray(parsed)) setSavedViews(parsed)
    } catch {
      window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY)
    }
  }, [])

  function persistSavedViews(next: SavedDocsView[]) {
    setSavedViews(next)
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(next))
  }

  function saveCurrentView() {
    const label = window.prompt("저장할 뷰 이름을 입력하세요:")
    if (!label?.trim()) return
    const view: SavedDocsView = {
      id: `${Date.now()}`,
      label: label.trim(),
      categoryFilter,
      statusFilter,
      docTypeFilter,
      readinessFilter,
      searchQuery,
    }
    persistSavedViews([view, ...savedViews].slice(0, 8))
  }

  function applySavedView(view: SavedDocsView) {
    setCategoryFilter(view.categoryFilter)
    setStatusFilter(view.statusFilter)
    setDocTypeFilter(view.docTypeFilter)
    setReadinessFilter(view.readinessFilter)
    setSearchQuery(view.searchQuery)
  }

  const handleReindex = useCallback(async () => {
    setReindexing(true)
    setReindexNotice(null)
    setError(null)

    try {
      const response = await adminFetch("/api/admin/docs/reindex", {
        method: "POST",
      })

      if (response.status === 401) {
        router.replace("/admin/login")
        return
      }

      const result = (await response.json()) as ReindexResult
      if (!response.ok) {
        throw new Error(result.error ?? "문서 검색 인덱스를 재생성하지 못했습니다.")
      }

      if (!result.configured) {
        setReindexNotice({
          tone: "warning",
          message: result.warnings?.[0] ?? "Supabase 환경이 없어 인덱스를 재생성하지 않았습니다.",
        })
        return
      }

      setReindexNotice({
        tone: result.warnings?.length ? "warning" : "success",
        message: `문서 ${formatNumber(result.articleCount)}개에서 검색 chunk ${formatNumber(result.chunkCount)}개를 재생성했습니다.${
          result.warnings?.length ? ` ${result.warnings[0]}` : ""
        }`,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 검색 인덱스를 재생성하지 못했습니다.")
    } finally {
      setReindexing(false)
    }
  }, [load, router])

  const handleArticlePatch = useCallback(
    async (article: AdminDocsArticleSummary, patch: Record<string, unknown>) => {
      setArticleSavingId(article.id)
      setArticleNotice(null)
      setError(null)

      try {
        await adminFetchJson(`/api/admin/docs/articles/${article.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        })

        if (patch.status === "published" || article.status === "published") {
          await adminFetch("/api/admin/docs/reindex", {
            method: "POST",
            body: JSON.stringify({ articleId: article.id }),
          }).catch(() => null)
        }

        setArticleNotice("문서 설정을 저장했습니다.")
        window.setTimeout(() => setArticleNotice(null), 2500)
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : "문서 설정을 저장하지 못했습니다.")
      } finally {
        setArticleSavingId(null)
      }
    },
    [load]
  )

  const handleBulkPatch = useCallback(async () => {
    if (selectedArticleIds.length === 0) return

    const patch: Record<string, unknown> = {}
    if (bulkStatus !== "unchanged") patch.status = bulkStatus
    if (bulkVisibility !== "unchanged") patch.visibility = bulkVisibility
    if (bulkCategoryId !== "unchanged") patch.categoryId = bulkCategoryId
    if (bulkFeatured !== "unchanged") patch.featured = bulkFeatured === "true"

    if (Object.keys(patch).length === 0) {
      setError("일괄 수정할 값을 선택해 주세요.")
      return
    }

    setBulkSaving(true)
    setError(null)
    try {
      const result = await adminFetchJson<{ updatedCount: number }>("/api/admin/docs/articles/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids: selectedArticleIds, ...patch }),
      })

      if (patch.status === "published") {
        await adminFetch("/api/admin/docs/reindex", { method: "POST" }).catch(() => null)
      }

      setSelectedArticleIds([])
      setArticleNotice(`문서 ${formatNumber(result.updatedCount)}개를 일괄 수정했습니다.`)
      window.setTimeout(() => setArticleNotice(null), 2500)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서를 일괄 수정하지 못했습니다.")
    } finally {
      setBulkSaving(false)
    }
  }, [bulkCategoryId, bulkFeatured, bulkStatus, bulkVisibility, load, selectedArticleIds])

  function toggleSelectedArticle(id: string) {
    setSelectedArticleIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    )
  }

  const categoryTitleById = useMemo(() => {
    return new Map((content?.categories ?? []).map((category) => [category.id, category.title]))
  }, [content])

  const filteredArticles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return (content?.articles ?? []).filter((article) => {
      const matchesCategory =
        categoryFilter === "all" || article.categoryId === categoryFilter
      const matchesStatus = statusFilter === "all" || article.status === statusFilter
      const matchesType = docTypeFilter === "all" || article.docType === docTypeFilter
      const matchesReadiness =
        readinessFilter === "all" ||
        (readinessFilter === "ai-issues" && article.aiIssues.length > 0) ||
        (readinessFilter === "stale" && article.stale) ||
        (readinessFilter === "featured" && article.featured)
      const matchesQuery =
        !query ||
        article.title.toLowerCase().includes(query) ||
        article.description.toLowerCase().includes(query) ||
        article.slug.toLowerCase().includes(query) ||
        article.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        article.keywords.some((keyword) => keyword.toLowerCase().includes(query))

      return matchesCategory && matchesStatus && matchesType && matchesReadiness && matchesQuery
    })
  }, [categoryFilter, content, docTypeFilter, readinessFilter, searchQuery, statusFilter])

  const warnings = [...(content?.warnings ?? []), ...(analytics?.warnings ?? [])]
  const summary = analytics?.summary
  const canMutateDocs = content?.status === "live"
  const showBulkActions = activeTab === "documents" && selectedArticleIds.length > 0

  return (
    <div
      className={`px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8 ${
        showBulkActions ? "pb-44 sm:pb-32" : "pb-16 sm:pb-20"
      }`}
    >
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
              Admin
            </p>
            <StatusBadge
              label={getSourceLabel(content)}
              tone={
                content?.status === "live"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                  : "border-amber-100 bg-amber-50 text-amber-700"
              }
            />
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">
            문서 센터 관리
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            공개 문서 카테고리와 문서 상태, 검색·피드백·챗봇 질문 흐름을 확인합니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {canMutateDocs ? (
            <Link
              href="/admin/docs/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              <Plus className="h-4 w-4" />
              새 문서
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-[#084734] px-3 text-[13px] font-semibold text-white opacity-45"
              title="Supabase 문서 원본이 연결되면 새 문서를 만들 수 있습니다."
            >
              <Plus className="h-4 w-4" />
              새 문서
            </button>
          )}
          <Link
            href="/docs"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <ExternalLink className="h-4 w-4" />
            공개 문서
          </Link>
          <button
            type="button"
            onClick={() => void handleReindex()}
            disabled={loading || reindexing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Database className="h-4 w-4" />
            {reindexing ? "인덱싱 중" : "검색 인덱스 재생성"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#111110] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2a28] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {reindexNotice ? (
        <div
          className={`mb-6 rounded-2xl border px-4 py-3 text-[13px] ${
            reindexNotice.tone === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-amber-100 bg-amber-50 text-amber-800"
          }`}
        >
          {reindexNotice.message}
        </div>
      ) : null}

      {articleNotice ? (
        <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          {articleNotice}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
          <div className="flex gap-2 text-[13px] text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<FolderTree className="h-5 w-5" />}
          label="카테고리"
          value={formatNumber(content?.categories.length ?? 0)}
          hint={`${formatNumber(content?.articles.length ?? 0)}개 문서 연결`}
        />
        <MetricCard
          icon={<ThumbsUp className="h-5 w-5" />}
          label="문서 피드백"
          value={formatNumber(summary?.feedbackTotal ?? 0)}
          hint={
            summary?.helpfulRate == null
              ? "최근 30일 피드백 없음"
              : `도움됨 ${summary.helpfulRate}% · 부정 ${formatNumber(summary.notHelpfulTotal)}건`
          }
        />
        <MetricCard
          icon={<Search className="h-5 w-5" />}
          label="검색 이벤트"
          value={formatNumber(summary?.searchTotal ?? 0)}
          hint={`결과 없음 ${formatNumber(summary?.zeroResultSearches ?? 0)}건`}
        />
        <MetricCard
          icon={<Bot className="h-5 w-5" />}
          label="챗봇 질문"
          value={formatNumber(summary?.chatbotQuestions ?? 0)}
          hint={`미해결 ${formatNumber(summary?.chatbotUnresolved ?? 0)}건 · 상담 연결 ${formatNumber(summary?.chatbotHandoffs ?? 0)}건`}
        />
      </section>

      <div className="mb-6 overflow-x-auto" role="tablist" aria-label="문서 관리 섹션">
        <div className="inline-flex min-w-full rounded-xl border border-[#e8e8e4] bg-white p-1 sm:min-w-0">
          {DOCS_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors sm:flex-none ${
                  isActive
                    ? "bg-[#111110] text-white"
                    : "text-[#1a1a1a]/45 hover:bg-[#f5f5f2] hover:text-[#111110]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === "documents" ? (
        <>
          <section className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[#111110]">문서 목록</h2>
              <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                {formatNumber(filteredArticles.length)}개 표시
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="문서 검색"
                  className="h-9 w-full rounded-lg border border-[#e8e8e4] bg-white pr-3 pl-9 text-[13px] outline-none transition-colors placeholder:text-[#1a1a1a]/25 focus:border-[#084734] sm:w-56"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#084734]"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#084734]"
              >
                <option value="all">전체 카테고리</option>
                {(content?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
              <select
                value={docTypeFilter}
                onChange={(event) => setDocTypeFilter(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#084734]"
              >
                {DOC_TYPE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={readinessFilter}
                onChange={(event) => setReadinessFilter(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#084734]"
              >
                {READINESS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-[#e8e8e4] bg-[#FAFAF8] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveCurrentView}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
              >
                <Bookmark className="h-3.5 w-3.5" />
                현재 뷰 저장
              </button>
              {savedViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => applySavedView(view)}
                  className="h-8 rounded-full border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#084734]/30 hover:text-[#084734]"
                >
                  {view.label}
                </button>
              ))}
            </div>

          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full text-left">
              <thead className="bg-[#fafaf8] text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={filteredArticles.length > 0 && filteredArticles.every((article) => selectedArticleIds.includes(article.id))}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedArticleIds(Array.from(new Set([...selectedArticleIds, ...filteredArticles.map((article) => article.id)])))
                        } else {
                          const visibleIds = new Set(filteredArticles.map((article) => article.id))
                          setSelectedArticleIds((previous) => previous.filter((id) => !visibleIds.has(id)))
                        }
                      }}
                      aria-label="현재 목록 전체 선택"
                      className="h-4 w-4 rounded border-[#d6d6d0]"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">문서</th>
                  <th className="px-4 py-3 font-semibold">카테고리</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">업데이트</th>
                  <th className="px-4 py-3 font-semibold">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-[#1a1a1a]/35">
                      문서 목록을 불러오는 중입니다.
                    </td>
                  </tr>
                ) : filteredArticles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8">
                      <EmptyState title="표시할 문서가 없습니다" description="검색어나 카테고리 필터를 조정해 보세요." />
                    </td>
                  </tr>
                ) : (
                  filteredArticles.map((article) => {
                    const editHref = `/admin/docs/${article.id}/edit`
                    return (
                    <tr key={article.id} className="align-top transition-colors hover:bg-[#fafaf8]">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedArticleIds.includes(article.id)}
                          onChange={() => toggleSelectedArticle(article.id)}
                          aria-label={`${article.title} 선택`}
                          className="h-4 w-4 rounded border-[#d6d6d0]"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="max-w-lg">
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/30" />
                            <div>
                              {canMutateDocs ? (
                                <Link
                                  href={editHref}
                                  className="text-[13px] font-semibold text-[#111110] transition-colors hover:text-[#084734]"
                                >
                                  {article.title}
                                </Link>
                              ) : (
                                <Link
                                  href={article.publicPath}
                                  className="text-[13px] font-semibold text-[#111110] transition-colors hover:text-[#084734]"
                                >
                                  {article.title}
                                </Link>
                              )}
                              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#1a1a1a]/42">
                                {article.description}
                              </p>
                              <p className="mt-1 font-mono text-[11px] text-[#1a1a1a]/30">
                                {article.slug}
                              </p>
                              {article.aiIssues.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {article.aiIssues.slice(0, 3).map((issue) => (
                                    <StatusBadge
                                      key={issue}
                                      label={issue}
                                      tone="border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-[#1a1a1a]/55">
                        {categoryTitleById.get(article.categoryId) ?? article.categoryId}
                      </td>
                      <td className="px-4 py-4">
                        <ArticleStatus article={article} />
                      </td>
                      <td className="px-4 py-4 text-[12px] text-[#1a1a1a]/55">
                        <div>{DOC_TYPE_LABELS[article.docType] ?? article.docType}</div>
                        <div className="mt-1 text-[#1a1a1a]/30">{article.productArea}</div>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-[#1a1a1a]/55">
                        {formatDate(article.updatedAt ?? article.lastReviewedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {canMutateDocs ? (
                            <>
                              <select
                                aria-label={`${article.title} 상태 변경`}
                                value={article.status}
                                disabled={articleSavingId === article.id}
                                onChange={(event) =>
                                  void handleArticlePatch(article, { status: event.target.value })
                                }
                                className="h-8 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none transition-colors focus:border-[#084734] disabled:cursor-not-allowed disabled:opacity-55"
                              >
                                {ARTICLE_STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label={`${article.title} 가시성 변경`}
                                value={article.visibility}
                                disabled={articleSavingId === article.id}
                                onChange={(event) =>
                                  void handleArticlePatch(article, { visibility: event.target.value })
                                }
                                className="h-8 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none transition-colors focus:border-[#084734] disabled:cursor-not-allowed disabled:opacity-55"
                              >
                                {ARTICLE_VISIBILITY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                title={article.featured ? "대표 문서 해제" : "대표 문서로 지정"}
                                aria-pressed={article.featured}
                                disabled={articleSavingId === article.id}
                                onClick={() =>
                                  void handleArticlePatch(article, { featured: !article.featured })
                                }
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                                  article.featured
                                    ? "border-amber-100 bg-amber-50 text-amber-600"
                                    : "border-[#e8e8e4] bg-white text-[#1a1a1a]/35 hover:bg-[#f5f5f2]"
                                }`}
                              >
                                <Star className={`h-3.5 w-3.5 ${article.featured ? "fill-current" : ""}`} />
                                <span className="sr-only">
                                  {article.featured ? "대표 문서 해제" : "대표 문서로 지정"}
                                </span>
                              </button>
                            </>
                          ) : null}
                          {canMutateDocs ? (
                            <Link
                              href={editHref}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              편집
                            </Link>
                          ) : null}
                          <Link
                            href={article.publicPath}
                            target="_blank"
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            보기
                          </Link>
                        </div>
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
            <div className="border-b border-[#e8e8e4] px-4 py-4">
              <h2 className="text-[14px] font-semibold text-[#111110]">카테고리</h2>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {loading ? (
                <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">
                  카테고리를 불러오는 중입니다.
                </p>
              ) : (content?.categories.length ?? 0) === 0 ? (
                <div className="p-4">
                  <EmptyState title="카테고리 없음" description="문서 카테고리 데이터가 아직 없습니다." />
                </div>
              ) : (
                content?.categories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    onClick={() => setCategoryFilter(category.id)}
                    className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[#fafaf8]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-[#111110]">{category.title}</p>
                        {!category.isVisible ? <StatusBadge label="hidden" /> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#1a1a1a]/42">
                        {category.description}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-[#f0f0ec] px-2 py-1 text-[12px] font-semibold text-[#1a1a1a]/55">
                      {category.articleCount}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
            <div className="border-b border-[#e8e8e4] px-4 py-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#1a1a1a]/35" />
                <h2 className="text-[14px] font-semibold text-[#111110]">검색 상위</h2>
              </div>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {(analytics?.topSearchQueries.length ?? 0) === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">
                  최근 30일 검색 데이터가 없습니다.
                </p>
              ) : (
                analytics?.topSearchQueries.map((item) => (
                  <div key={item.query} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#111110]">{item.query}</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                        결과 없음 {formatNumber(item.zeroResultCount)}건 · {formatDateTime(item.latestAt)}
                      </p>
                    </div>
                    <span className="text-[13px] font-bold tabular-nums text-[#111110]">
                      {formatNumber(item.count)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>

          <section className="mb-8">
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="border-b border-[#e8e8e4] px-4 py-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-[#1a1a1a]/35" />
              <h2 className="text-[14px] font-semibold text-[#111110]">최근 문서 피드백</h2>
            </div>
          </div>
          <div className="divide-y divide-[#f0f0ec]">
            {(analytics?.recentFeedback.length ?? 0) === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">
                최근 30일 문서 피드백이 없습니다.
              </p>
            ) : (
              analytics?.recentFeedback.map((item) => (
                <div key={item.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={item.helpful ? "helpful" : "not helpful"}
                      tone={
                        item.helpful
                          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                          : "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
                      }
                    />
                    <p className="text-[12px] text-[#1a1a1a]/35">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-[#111110]">{item.articleTitle}</p>
                  {item.reason ? (
                    <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">{item.reason}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
          </section>
        </>
      ) : null}

      {activeTab === "recommended" ? (
        <section className="mb-8">
          <DocsRecommendedQuestionsManager articles={content?.articles ?? []} />
        </section>
      ) : null}

      {activeTab === "categories" ? (
        <section className="mb-8">
          <DocsCategoryManager />
        </section>
      ) : null}

      {activeTab === "redirects" ? (
        <section className="mb-8">
          <DocsRedirectManager articles={content?.articles ?? []} />
        </section>
      ) : null}

      {activeTab === "backlog" ? (
        <section className="mb-8">
          <DocsQuestionClusterBacklog />
        </section>
      ) : null}

      {showBulkActions ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e8e8e4] bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(17,17,16,0.08)] backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#111110]">
              <CheckSquare className="h-4 w-4 text-[#084734]" />
              {formatNumber(selectedArticleIds.length)}개 문서 선택됨
            </span>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <select
                value={bulkStatus}
                onChange={(event) => setBulkStatus(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] outline-none focus:border-[#084734]"
              >
                <option value="unchanged">상태 유지</option>
                {ARTICLE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={bulkVisibility}
                onChange={(event) => setBulkVisibility(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] outline-none focus:border-[#084734]"
              >
                <option value="unchanged">가시성 유지</option>
                {ARTICLE_VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={bulkCategoryId}
                onChange={(event) => setBulkCategoryId(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] outline-none focus:border-[#084734]"
              >
                <option value="unchanged">카테고리 유지</option>
                {(content?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>{category.title}</option>
                ))}
              </select>
              <select
                value={bulkFeatured}
                onChange={(event) => setBulkFeatured(event.target.value)}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2 text-[12px] outline-none focus:border-[#084734]"
              >
                <option value="unchanged">대표 유지</option>
                <option value="true">대표 지정</option>
                <option value="false">대표 해제</option>
              </select>
              <button
                type="button"
                onClick={() => void handleBulkPatch()}
                disabled={bulkSaving}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkSaving ? "적용 중" : "일괄 적용"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedArticleIds([])}
                className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2]"
              >
                선택 해제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
