"use client"

/**
 * 자료 퍼널(/admin/lead-magnets) — 2026-11 A안 확정(시안 「A안 진행」).
 * 위: 기간 합계(노출→전환) · 이번 주 손볼 곳(추천) · 거르기
 * 아래: 자료 표 + 오른쪽 패널(편집 · 성과 · 추천) — 편집은 공개 화면 그대로 글자를 눌러 고친다.
 * 「전체 편집」은 자료 페이지·블로그 상자·PDF 를 넓게 펼쳐 고치는 화면(FullEditor)이다.
 * 저장은 예전과 같은 API(PUT/POST /api/admin/lead-magnets)로 하고, 초안은 한 벌만 둔다.
 */
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Plus, RefreshCw, Search } from "lucide-react"

import FullEditor from "@/components/admin/lead-magnets/FullEditor"
import SidePanel, { type PanelSurface, type PanelTab } from "@/components/admin/lead-magnets/SidePanel"
import {
  EMPTY_METRIC_ROW,
  buildTrackedResourceUrl,
  changedFields,
  cloneLeadMagnet,
  emptyLeadMagnet,
  finalizeDraft,
  formatPercent,
  rate,
  slugify,
  type LeadMagnetMetricRow,
  type LeadMagnetMetricsResponse,
} from "@/components/admin/lead-magnets/model"
import {
  RECOMMENDATION_KIND_LABEL,
  blogViewsFromTop,
  buildRecommendations,
  type Recommendation,
  type RecommendationBlogPost,
} from "@/components/admin/lead-magnets/recommendations"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import type { BlogPost } from "@/lib/blog-types"
import type { LeadMagnet, LeadMagnetCategory, LeadMagnetStatus } from "@/lib/lead-magnets"
import { getLeadMagnetQualityIssues, type LeadMagnetQualityArea } from "@/lib/lead-magnet-quality"
import { getLeadMagnetCategoryLabel, getLeadMagnetItemCount, getLeadMagnetTierLabel } from "@/lib/lead-magnets-helpers"
import type { LeadMagnetStorageState } from "@/lib/repositories/lead-magnets"

interface Props {
  initialLeadMagnets: LeadMagnet[]
  initialStorage: LeadMagnetStorageState
}

interface LeadMagnetsResponse {
  leadMagnets: LeadMagnet[]
  storage: LeadMagnetStorageState
}

type SortKey = "views" | "rate" | "todo" | "name"
const PERIODS = [7, 14, 30, 90] as const
const CATEGORY_FILTERS: Array<{ value: "all" | LeadMagnetCategory; label: string }> = [
  { value: "all", label: "전체" },
  { value: "operations", label: "운영" },
  { value: "hardware", label: "하드웨어" },
  { value: "software", label: "소프트웨어" },
  { value: "case-study", label: "사례" },
  { value: "security", label: "보안" },
]
const FUNNEL: Array<[keyof LeadMagnetMetricsResponse["totals"], string]> = [
  ["impressions", "노출"],
  ["views", "조회"],
  ["submissions", "신청"],
  ["downloads", "열람"],
  ["leads", "리드"],
  ["convertedLeads", "전환"],
]

function segmentCls(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors ${
    active ? "bg-white text-[#111110] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"
  }`
}

export default function LeadMagnetsAdminClient({ initialLeadMagnets, initialStorage }: Props) {
  const first = initialLeadMagnets[0] ?? null
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>(initialLeadMagnets)
  const [storage, setStorage] = useState(initialStorage)
  const [selectedSlug, setSelectedSlug] = useState(first?.slug ?? "")
  const [originalSlug, setOriginalSlug] = useState(first?.slug ?? "")
  const [baseline, setBaseline] = useState<LeadMagnet>(() => (first ? cloneLeadMagnet(first) : emptyLeadMagnet()))
  const [draft, setDraft] = useState<LeadMagnet>(() => (first ? cloneLeadMagnet(first) : emptyLeadMagnet()))
  const [resetVersion, setResetVersion] = useState(0)

  const [panelTab, setPanelTab] = useState<PanelTab>("edit")
  const [panelSurface, setPanelSurface] = useState<PanelSurface>("blog")
  const [focus, setFocus] = useState<string | null>(null)
  const [fullOpen, setFullOpen] = useState(false)
  const [fullArea, setFullArea] = useState<LeadMagnetQualityArea | null>(null)
  const [fullKey, setFullKey] = useState(0)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const [days, setDays] = useState<number>(30)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [metrics, setMetrics] = useState<LeadMagnetMetricsResponse | null>(null)
  const [metricsFailed, setMetricsFailed] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [blogPosts, setBlogPosts] = useState<RecommendationBlogPost[] | null>(null)
  const [blogViews, setBlogViews] = useState<Map<string, number> | null>(null)

  const [category, setCategory] = useState<"all" | LeadMagnetCategory>("all")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("views")
  const [todoAll, setTodoAll] = useState(false)
  const [later, setLater] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    adminFetchJsonCached<LeadMagnetMetricsResponse>(`/api/admin/lead-magnets/metrics?days=${days}`, undefined, {
      ttlMs: 60_000,
      force: refreshNonce > 0,
      staleIfError: refreshNonce === 0,
    })
      .then((data) => {
        if (cancelled) return
        setMetrics(data)
        setMetricsFailed(false)
      })
      .catch(() => {
        if (cancelled) return
        setMetrics(null)
        setMetricsFailed(true)
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days, refreshNonce])

  useEffect(() => {
    let cancelled = false
    adminFetchJsonCached<{ posts: BlogPost[] }>("/api/admin/blog", undefined, { ttlMs: 60_000 })
      .then((data) => {
        if (cancelled) return
        setBlogPosts(
          data.posts.map((post) => ({
            id: post._uuid ?? String(post.id),
            slug: post.slug,
            title: post.title,
            published: post.status === "published",
            leadMagnetSlug: post.leadMagnetSlug,
            category: post.category,
            tags: post.tags,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setBlogPosts(null)
      })
    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  useEffect(() => {
    if (!blogPosts) return
    let cancelled = false
    const slugs = new Set(blogPosts.map((post) => post.slug))
    adminFetchJsonCached<{ top: Array<{ page: string; count: number }> }>(
      `/api/admin/content/page-views?prefix=%2Fblog%2F&days=${days}&limit=50`,
      undefined,
      { ttlMs: 300_000 }
    )
      .then((data) => {
        if (!cancelled) setBlogViews(blogViewsFromTop(data.top, slugs))
      })
      .catch(() => {
        if (!cancelled) setBlogViews(null)
      })
    return () => {
      cancelled = true
    }
  }, [blogPosts, days])

  const knownSlugs = useMemo(() => new Set(leadMagnets.map((magnet) => magnet.slug)), [leadMagnets])
  const qualityBySlug = useMemo(
    () => new Map(leadMagnets.map((magnet) => [magnet.slug, getLeadMagnetQualityIssues(magnet, { knownSlugs })])),
    [leadMagnets, knownSlugs]
  )
  const draftQuality = useMemo(() => getLeadMagnetQualityIssues(finalizeDraft(draft), { knownSlugs }), [draft, knownSlugs])
  const recommendations = useMemo(
    () => buildRecommendations({ magnets: leadMagnets, metrics, qualityBySlug, blogPosts, blogViews }),
    [leadMagnets, metrics, qualityBySlug, blogPosts, blogViews]
  )
  const metricBySlug = useMemo(() => new Map((metrics?.byLeadMagnet ?? []).map((row) => [row.slug, row])), [metrics])
  const todoBySlug = useMemo(() => {
    const counts = new Map<string, number>()
    for (const rec of recommendations) counts.set(rec.slug, (counts.get(rec.slug) ?? 0) + 1)
    return counts
  }, [recommendations])

  const changed = changedFields(draft, baseline)
  const changedCount = changed.length
  const avgRate = metrics && metrics.totals.views > 0 ? metrics.totals.submissions / metrics.totals.views : null

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = leadMagnets.filter(
      (magnet) =>
        (category === "all" || magnet.category === category) &&
        (!q || [magnet.title, magnet.audience, magnet.slug, magnet.summary].join(" ").toLowerCase().includes(q))
    )
    const metric = (magnet: LeadMagnet): LeadMagnetMetricRow => metricBySlug.get(magnet.slug) ?? { slug: magnet.slug, ...EMPTY_METRIC_ROW }
    const value = (magnet: LeadMagnet) => {
      const row = metric(magnet)
      if (sort === "views") return row.views
      if (sort === "rate") return rate(row.submissions, row.views) ?? -1
      if (sort === "todo") return todoBySlug.get(magnet.slug) ?? 0
      return 0
    }
    return [...list].sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title, "ko") : value(b) - value(a)))
  }, [leadMagnets, category, query, sort, metricBySlug, todoBySlug])

  const visibleTodos = recommendations.filter((rec) => !later.includes(rec.id))
  const shownTodos = todoAll ? visibleTodos : visibleTodos.slice(0, 3)

  // ── 동작 ──────────────────────────────────────────────────────

  function loadIntoEditor(magnet: LeadMagnet, nextOriginalSlug = magnet.slug) {
    setBaseline(cloneLeadMagnet(magnet))
    setDraft(cloneLeadMagnet(magnet))
    setSelectedSlug(magnet.slug)
    setOriginalSlug(nextOriginalSlug)
    setFocus(null)
    setResetVersion((value) => value + 1)
  }

  function confirmDiscard() {
    return changedCount === 0 || window.confirm("저장하지 않은 변경이 있습니다. 버리고 다른 자료로 갈까요?")
  }

  function selectMagnet(slug: string) {
    if (slug === selectedSlug) return true
    const magnet = leadMagnets.find((item) => item.slug === slug)
    if (!magnet || !confirmDiscard()) return false
    loadIntoEditor(magnet)
    setNotice("")
    setError("")
    return true
  }

  function openFull(area: LeadMagnetQualityArea | null = null) {
    setFullArea(area)
    setFullKey((value) => value + 1)
    setFullOpen(true)
  }

  function onRecommendation(rec: Recommendation) {
    if (rec.target.kind === "blog") {
      window.location.assign(rec.target.href)
      return
    }
    if (!selectMagnet(rec.slug)) return
    if (rec.target.kind === "full") {
      openFull(rec.target.area)
      return
    }
    setPanelTab(rec.target.tab)
    if (rec.target.surface) setPanelSurface(rec.target.surface)
    if (rec.target.focus) setFocus(rec.target.focus)
  }

  async function refresh() {
    setLoading(true)
    setMetricsLoading(true)
    setRefreshNonce((value) => value + 1)
    try {
      const data = await adminFetchJsonCached<LeadMagnetsResponse>("/api/admin/lead-magnets", undefined, { ttlMs: 30_000, force: true })
      setLeadMagnets(data.leadMagnets)
      setStorage(data.storage)
    } catch {
      setError("자료 목록을 새로 불러오지 못했습니다. 보이는 목록이 최신이 아닐 수 있습니다.")
    } finally {
      setLoading(false)
    }
  }

  function createNew() {
    if (!storage.writable || !confirmDiscard()) return
    loadIntoEditor(emptyLeadMagnet(), "")
    setNotice("새 자료 초안입니다. 채운 뒤 저장하세요.")
    setError("")
    openFull("page")
  }

  function duplicateCurrent() {
    if (!storage.writable) return
    const slug = slugify(`${draft.slug}-copy`)
    const next: LeadMagnet = {
      ...cloneLeadMagnet(draft),
      slug,
      title: `${draft.title} 복사본`,
      status: "draft" as LeadMagnetStatus,
      published: false,
      sourceDetail: `lead_magnet:${slug}`,
      resourceUrl: `/resources/${slug}`,
    }
    loadIntoEditor(next, "")
    setNotice("복사본을 만들었습니다. 저장하면 새 자료로 추가됩니다.")
    setError("")
  }

  async function save() {
    if (!storage.writable) return
    setSaving(true)
    setNotice("")
    setError("")
    try {
      const payload = finalizeDraft(draft)
      const url = originalSlug ? `/api/admin/lead-magnets/${encodeURIComponent(originalSlug)}` : "/api/admin/lead-magnets"
      const data = await adminFetchJson<{ leadMagnet: LeadMagnet }>(url, {
        method: originalSlug ? "PUT" : "POST",
        body: JSON.stringify(payload),
      })
      setLeadMagnets((prev) =>
        prev.some((item) => item.slug === originalSlug)
          ? prev.map((item) => (item.slug === originalSlug ? data.leadMagnet : item))
          : [...prev, data.leadMagnet]
      )
      loadIntoEditor(data.leadMagnet)
      setNotice("저장했습니다. 자료실·블로그 신청 상자에 바로, PDF에는 몇 분 안에 반영됩니다.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!storage.writable) return
    if (!originalSlug) {
      if (first) loadIntoEditor(leadMagnets[0] ?? first)
      setFullOpen(false)
      return
    }
    if (!window.confirm("이 자료를 삭제할까요? 블로그에 붙어 있는 자료라면 먼저 연결을 풀어야 합니다.")) return
    setSaving(true)
    setError("")
    setNotice("")
    try {
      await adminFetchJson<{ ok: boolean }>(`/api/admin/lead-magnets/${encodeURIComponent(originalSlug)}`, { method: "DELETE" })
      const next = leadMagnets.filter((item) => item.slug !== originalSlug)
      setLeadMagnets(next)
      loadIntoEditor(next[0] ?? emptyLeadMagnet(), next[0]?.slug ?? "")
      setFullOpen(false)
      setNotice("삭제했습니다.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "삭제하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(message)
      setError("")
    } catch {
      setError("클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.")
    }
  }

  const update = (fn: (current: LeadMagnet) => LeadMagnet) => {
    setDraft((current) => fn(current))
    setNotice("")
  }
  const revert = () => {
    setDraft(cloneLeadMagnet(baseline))
    setResetVersion((value) => value + 1)
  }

  const selectedRecs = recommendations.filter((rec) => rec.slug === draft.slug && rec.kind !== "quality")
  const linkedPosts = (blogPosts ?? [])
    .filter((post) => post.leadMagnetSlug === draft.slug)
    .map((post) => ({ title: post.title, href: `/admin/blog/${encodeURIComponent(post.id)}/edit`, views: blogViews?.get(post.slug) ?? null }))
  const titleBySlug = new Map(leadMagnets.map((magnet) => [magnet.slug, magnet.title]))
  const relatedMagnets = (draft.pdfGuide?.relatedMagnets ?? [])
    .filter((slug) => titleBySlug.has(slug))
    .map((slug) => ({ slug, title: titleBySlug.get(slug) ?? slug }))
  const resourceUrl = draft.resourceUrl?.trim() || `/resources/${draft.slug}`

  return (
    <div className="px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-5">
        {storage.source !== "supabase" ? (
          <div
            role={storage.writable ? "status" : "alert"}
            className={`flex gap-3 rounded-xl border p-4 text-[13px] leading-5 ${
              storage.writable ? "border-[#084734]/15 bg-[#ECFDF5] text-[#084734]" : "border-[#B85C33]/20 bg-[#FFF7ED] text-[#8A4526]"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">{storage.writable ? "로컬 개발 저장소" : "읽기 전용 폴백"}</p>
              <p className="mt-1">
                {storage.writable
                  ? "현재 data/lead-magnets.json에 저장합니다. 이 변경은 배포 데이터베이스와 자동 동기화되지 않습니다."
                  : storage.reason === "table-missing"
                    ? "운영 lead_magnets 테이블이 없어 번들 JSON을 표시 중입니다. 마이그레이션과 초기 데이터 이관 전에는 생성·수정·삭제할 수 없습니다."
                    : "운영 lead_magnets 테이블이 비어 있어 번들 JSON을 표시 중입니다. 초기 데이터 이관 전에는 생성·수정·삭제할 수 없습니다."}
              </p>
            </div>
          </div>
        ) : null}

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-[#615D59]">마케팅·분석</p>
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.625px] text-[#111110]">자료 퍼널</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="기간" className="inline-flex gap-0.5 rounded-lg bg-[#F0EFEC] p-[3px]">
              {PERIODS.map((value) => (
                <button key={value} type="button" aria-pressed={days === value} onClick={() => { setMetricsLoading(true); setDays(value) }} className={`h-[34px] ${segmentCls(days === value)}`}>
                  {value}일
                </button>
              ))}
            </div>
            <button type="button" aria-label="새로고침" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E8E8E4] bg-white text-[#31302E] disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={createNew} disabled={!storage.writable} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#084734] px-[18px] text-[14px] font-semibold text-white hover:bg-[#065c41] disabled:opacity-50">
              <Plus className="h-4 w-4" />
              새 자료
            </button>
          </div>
        </header>

        <section aria-label="자료 퍼널 합계" className="flex flex-wrap rounded-xl border border-[#E8E8E4] bg-white">
          {FUNNEL.map(([key, label], index) => {
            const value = metrics?.totals[key] ?? 0
            const previous = index > 0 ? metrics?.totals[FUNNEL[index - 1][0]] ?? 0 : 0
            const stepRate = index > 0 ? rate(value, previous) : null
            return (
              <div key={key} className={`flex min-w-[140px] flex-1 flex-col gap-px px-5 py-3.5 ${index > 0 ? "border-l border-[#E8E8E4]" : ""}`}>
                <span className="text-[12px] text-[#615D59]">{label}</span>
                {metricsLoading && !metrics ? (
                  <span className="my-1 h-6 w-16 animate-pulse rounded bg-[#F0F0EC]" />
                ) : (
                  <span className="text-[21px] font-bold tabular-nums tracking-[-0.3px] text-[#111110]">{metrics ? value.toLocaleString("ko-KR") : "-"}</span>
                )}
                <span className="text-[12px] tabular-nums text-[#615D59]">
                  {index === 0 ? "자료 카드가 보인 횟수" : stepRate === null ? " " : `앞 단계의 ${formatPercent(stepRate)}`}
                </span>
              </div>
            )
          })}
        </section>
        {metricsFailed ? (
          <p role="alert" className="-mt-2 text-[13px] text-[#B43E3E]">
            성과를 불러오지 못했습니다. 이벤트 표 설정이나 관리자 권한을 확인하세요.
          </p>
        ) : metrics?.warning || metrics?.truncated ? (
          <p className="-mt-2 text-[12px] text-[#A8741A]">
            {metrics.warning ? `성과 일부를 불러오지 못했습니다: ${metrics.warning}` : "이 기간 이벤트가 50,000건을 넘어 최근 이벤트 기준으로 셌습니다."}
          </p>
        ) : null}

        <section aria-label="이번 주 손볼 곳" className="rounded-xl border border-[#E8E8E4] bg-white">
          <div className="flex items-center justify-between gap-3 px-5 pb-1.5 pt-3.5">
            <h2 className="text-[15px] font-bold text-[#111110]">
              이번 주 손볼 곳 <span className="text-[13px] font-semibold tabular-nums text-[#615D59]">{visibleTodos.length}</span>
            </h2>
            {visibleTodos.length > 3 ? (
              <button type="button" aria-expanded={todoAll} onClick={() => setTodoAll((value) => !value)} className="h-8 rounded-md px-2.5 text-[13px] font-semibold text-[#084734]">
                {todoAll ? "접기" : `${visibleTodos.length - 3}개 더 보기`}
              </button>
            ) : null}
          </div>
          {shownTodos.length === 0 ? (
            <p className="px-5 pb-4 pt-1 text-[13px] text-[#615D59]">{metrics || !metricsLoading ? "지금은 손볼 곳이 없습니다." : "성과를 불러오는 중입니다."}</p>
          ) : (
            shownTodos.map((rec, index) => (
              <div key={rec.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5 ${index > 0 ? "border-t border-[#E8E8E4]" : ""}`}>
                <span className={`w-[72px] shrink-0 text-[12px] font-bold ${rec.kind === "link" ? "text-[#084734]" : rec.kind === "quality" ? "text-[#B43E3E]" : "text-[#A8741A]"}`}>
                  {RECOMMENDATION_KIND_LABEL[rec.kind]}
                </span>
                <span className="flex min-w-0 flex-[999_1_360px] flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <span className="text-[14px] font-semibold text-[#111110]">{rec.text}</span>
                  <span className="text-[12px] tabular-nums text-[#615D59]">{rec.why}</span>
                </span>
                <span className="flex flex-1 justify-end gap-1">
                  <button type="button" onClick={() => onRecommendation(rec)} className="h-8 whitespace-nowrap rounded-md border border-[#084734] bg-white px-3 text-[13px] font-semibold text-[#084734]">
                    {rec.actionLabel}
                  </button>
                  <button type="button" onClick={() => setLater((prev) => [...prev, rec.id])} className="h-8 whitespace-nowrap rounded-md px-2.5 text-[13px] font-semibold text-[#615D59]">
                    나중에
                  </button>
                </span>
              </div>
            ))
          )}
          <div className="h-1.5" />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="분류" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-[#F0EFEC] p-[3px]">
            {CATEGORY_FILTERS.filter((item) => item.value === "all" || leadMagnets.some((magnet) => magnet.category === item.value)).map((item) => (
              <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)} className={`h-8 ${segmentCls(category === item.value)}`}>
                {item.label}
                <span className="text-[12px] font-medium text-[#615D59]">
                  {item.value === "all" ? leadMagnets.length : leadMagnets.filter((magnet) => magnet.category === item.value).length}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative inline-flex items-center">
              <Search aria-hidden="true" className="absolute left-3 h-3.5 w-3.5 text-[#615D59]" />
              <span className="sr-only">자료 검색</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="자료 이름·추천 대상" className="h-[38px] w-60 rounded-md border border-[#E5E5E0] bg-white pl-9 pr-3 text-[13px] text-[#111110] outline-none focus:border-[#084734]" />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-[#615D59]">
              정렬
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="h-[38px] rounded-md border border-[#E5E5E0] bg-white px-2.5 text-[13px] text-[#111110]">
                <option value="views">조회 많은 순</option>
                <option value="rate">신청률 높은 순</option>
                <option value="todo">할 일 많은 순</option>
                <option value="name">이름순</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="자료 목록" className="min-w-0 flex-[999_1_520px] overflow-hidden rounded-xl border border-[#E8E8E4] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] border-collapse text-[14px]">
                <thead>
                  <tr className="bg-[#FAFAF8] text-left text-[12px] text-[#615D59]">
                    <th scope="col" className="px-5 py-2.5 font-medium">자료</th>
                    <th scope="col" className="w-16 px-3 py-2.5 text-right font-medium">조회</th>
                    <th scope="col" className="w-14 px-3 py-2.5 text-right font-medium">신청</th>
                    <th scope="col" className="w-16 px-3 py-2.5 text-right font-medium">신청률</th>
                    <th scope="col" className="w-14 px-3 py-2.5 text-right font-medium">리드</th>
                    <th scope="col" className="w-14 py-2.5 pl-3 pr-5 text-right font-medium">할 일</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className="border-t border-[#E8E8E4]">
                      <td colSpan={6} className="px-5 py-12 text-center text-[13px] text-[#615D59]">
                        조건에 맞는 자료가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    rows.map((magnet) => {
                      const row = metricBySlug.get(magnet.slug) ?? { slug: magnet.slug, ...EMPTY_METRIC_ROW }
                      const selected = magnet.slug === selectedSlug
                      const subRate = rate(row.submissions, row.views)
                      const low = subRate !== null && avgRate !== null && row.views >= 30 && subRate / 100 < avgRate / 2
                      const todo = todoBySlug.get(magnet.slug) ?? 0
                      return (
                        <tr key={magnet.slug} className={`border-t border-[#E8E8E4] ${selected ? "bg-[#F3F2EF]" : "bg-white"}`}>
                          <td className="p-0">
                            <button type="button" aria-pressed={selected} onClick={() => selectMagnet(magnet.slug)} className="flex min-h-[60px] w-full flex-col justify-center gap-px py-2.5 pl-5 pr-3 text-left">
                              <span className={`max-w-full truncate text-[#111110] ${selected ? "font-bold" : "font-semibold"}`}>
                                {selected && changedCount > 0 ? `${draft.title} · 저장 전` : magnet.title}
                              </span>
                              <span className="text-[12px] text-[#615D59]">
                                {getLeadMagnetCategoryLabel(magnet.category)} · {getLeadMagnetTierLabel(magnet.tier)} · {getLeadMagnetItemCount(magnet)}문항
                                {magnet.published ? "" : " · 비공개"}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{metrics ? row.views.toLocaleString("ko-KR") : "-"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{metrics ? row.submissions.toLocaleString("ko-KR") : "-"}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${low ? "text-[#A8741A]" : "text-[#111110]"}`}>
                            {subRate === null ? "-" : formatPercent(subRate)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{metrics ? row.leads.toLocaleString("ko-KR") : "-"}</td>
                          <td className={`py-2.5 pl-3 pr-5 text-right font-semibold tabular-nums ${todo > 0 ? "text-[#A8741A]" : "text-[#615D59]"}`}>{todo > 0 ? todo : "-"}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="min-w-0 flex-[1_1_440px] lg:max-w-[500px]">
            <SidePanel
              draft={draft}
              baseline={baseline}
              update={update}
              tab={panelTab}
              onTabChange={setPanelTab}
              surface={panelSurface}
              onSurfaceChange={(surface) => {
                setPanelSurface(surface)
                setFocus(null)
              }}
              focus={focus}
              onFocusField={setFocus}
              changedCount={changedCount}
              saving={saving}
              writable={storage.writable}
              notice={fullOpen ? "" : notice}
              error={fullOpen ? "" : error}
              metricRow={metrics ? metricBySlug.get(draft.slug) ?? { slug: draft.slug, ...EMPTY_METRIC_ROW } : null}
              metrics={metrics}
              linkedPosts={linkedPosts}
              recommendations={selectedRecs}
              quality={draftQuality}
              relatedMagnets={relatedMagnets}
              onSelectRelated={(slug) => void selectMagnet(slug)}
              onSave={() => void save()}
              onRevert={revert}
              onOpenFull={() => openFull(null)}
              onRecommendation={onRecommendation}
              onCopyTracked={() => void copy(buildTrackedResourceUrl(resourceUrl, draft.slug), "CTA 배치용 추적 링크를 복사했습니다.")}
            />
          </div>
        </div>
      </div>

      <FullEditor
        key={fullKey}
        open={fullOpen}
        draft={draft}
        baseline={baseline}
        update={update}
        resetKey={`${selectedSlug}:${resetVersion}`}
        changedCount={changedCount}
        saving={saving}
        writable={storage.writable}
        isNew={!originalSlug}
        quality={draftQuality}
        magnets={leadMagnets}
        initialArea={fullArea}
        notice={notice}
        error={error}
        onClose={() => setFullOpen(false)}
        onSave={() => void save()}
        onRevert={revert}
        onDelete={() => void remove()}
        onDuplicate={duplicateCurrent}
        onCopy={(value, message) => void copy(value, message)}
      />
    </div>
  )
}
