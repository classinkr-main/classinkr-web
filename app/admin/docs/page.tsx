"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  BarChart3,
  Bot,
  Database,
  ExternalLink,
  FileText,
  FolderTree,
  MessageSquareText,
  RefreshCw,
  Search,
  ThumbsUp,
} from "lucide-react"

import type {
  AdminDocsAnalyticsResponse,
  AdminDocsArticleSummary,
  AdminDocsContentResponse,
} from "@/lib/admin-docs"

function getToken() {
  return (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
}

function adminFetch(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${getToken()}`)

  return fetch(url, {
    ...init,
    headers,
  })
}

interface ReindexResult {
  configured: boolean
  articleCount: number
  chunkCount: number
  warnings?: string[]
  error?: string
}

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
  const [reindexing, setReindexing] = useState(false)
  const [reindexNotice, setReindexNotice] = useState<{
    tone: "success" | "warning"
    message: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [contentResponse, analyticsResponse] = await Promise.all([
        adminFetch("/api/admin/docs"),
        adminFetch("/api/admin/docs/analytics?days=30"),
      ])

      if (contentResponse.status === 401 || analyticsResponse.status === 401) {
        router.replace("/admin/login")
        return
      }

      if (!contentResponse.ok) {
        throw new Error("문서 목록을 불러오지 못했습니다.")
      }

      if (!analyticsResponse.ok) {
        throw new Error("문서 분석 데이터를 불러오지 못했습니다.")
      }

      setContent((await contentResponse.json()) as AdminDocsContentResponse)
      setAnalytics((await analyticsResponse.json()) as AdminDocsAnalyticsResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 관리 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

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

  const categoryTitleById = useMemo(() => {
    return new Map((content?.categories ?? []).map((category) => [category.id, category.title]))
  }, [content])

  const filteredArticles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return (content?.articles ?? []).filter((article) => {
      const matchesCategory =
        categoryFilter === "all" || article.categoryId === categoryFilter
      const matchesQuery =
        !query ||
        article.title.toLowerCase().includes(query) ||
        article.description.toLowerCase().includes(query) ||
        article.slug.toLowerCase().includes(query)

      return matchesCategory && matchesQuery
    })
  }, [categoryFilter, content, searchQuery])

  const warnings = [...(content?.warnings ?? []), ...(analytics?.warnings ?? [])]
  const summary = analytics?.summary

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
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
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left">
              <thead className="bg-[#fafaf8] text-[11px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                <tr>
                  <th className="px-4 py-3 font-semibold">문서</th>
                  <th className="px-4 py-3 font-semibold">카테고리</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">업데이트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-[#1a1a1a]/35">
                      문서 목록을 불러오는 중입니다.
                    </td>
                  </tr>
                ) : filteredArticles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8">
                      <EmptyState title="표시할 문서가 없습니다" description="검색어나 카테고리 필터를 조정해 보세요." />
                    </td>
                  </tr>
                ) : (
                  filteredArticles.map((article) => (
                    <tr key={article.id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="max-w-lg">
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/30" />
                            <div>
                              <Link
                                href={article.publicPath}
                                className="text-[13px] font-semibold text-[#111110] transition-colors hover:text-[#084734]"
                              >
                                {article.title}
                              </Link>
                              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#1a1a1a]/42">
                                {article.description}
                              </p>
                              <p className="mt-1 font-mono text-[11px] text-[#1a1a1a]/30">
                                {article.slug}
                              </p>
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
                        <div>{article.docType}</div>
                        <div className="mt-1 text-[#1a1a1a]/30">{article.productArea}</div>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-[#1a1a1a]/55">
                        {formatDate(article.updatedAt ?? article.lastReviewedAt)}
                      </td>
                    </tr>
                  ))
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

      <section className="grid gap-6 xl:grid-cols-2">
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

        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
          <div className="border-b border-[#e8e8e4] px-4 py-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#1a1a1a]/35" />
              <h2 className="text-[14px] font-semibold text-[#111110]">챗봇 질문 상위</h2>
            </div>
          </div>
          <div className="divide-y divide-[#f0f0ec]">
            {(analytics?.topChatbotQuestions.length ?? 0) === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">
                최근 30일 챗봇 질문 데이터가 없습니다.
              </p>
            ) : (
              analytics?.topChatbotQuestions.map((item) => (
                <div key={`${item.question}:${item.category ?? "none"}`} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-semibold text-[#111110]">{item.question}</p>
                      <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                        {item.category ?? "카테고리 없음"} · {formatDateTime(item.latestAt)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-[#111110]">
                      {formatNumber(item.count)}
                    </span>
                  </div>
                  {item.unresolvedCount > 0 ? (
                    <p className="mt-2 text-[12px] text-[#B85C33]">
                      미해결 {formatNumber(item.unresolvedCount)}건
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
