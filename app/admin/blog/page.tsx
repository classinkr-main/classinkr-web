"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
    AlertTriangle,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Trash2,
    X,
} from "lucide-react"
import { CATEGORIES } from "@/lib/blog-types"
import { Button } from "@/components/ui/button"
import BlogPostTable from "@/components/admin/BlogPostTable"
import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import ContentHub, { ContentHubSegmented } from "@/components/admin/blog/ContentHub"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import { CONTENT_HUB_PERIODS, isContentHubPeriod, type ContentHubPeriod } from "@/lib/admin/content-hub"
import type { BlogPost } from "@/lib/blog-types"
import { useUrlState } from "@/lib/use-url-state"

// 「한눈에」(블로그·인스타 성과, 기본)와 「글 관리」(목록·휴지통) 두 보기 — 주소의 view 로 고른다.
type ContentView = "hub" | "posts"
type BlogTab = "all" | "published" | "private" | "trash"
const BLOG_TABS: readonly BlogTab[] = ["all", "published", "private", "trash"]

export default function AdminBlogPage() {
    const router = useRouter()
    // 상태 탭·검색·카테고리·라벨은 URL 에 둔다 — 글을 편집하고 뒤로 오면 보던 필터 그대로 돌아온다.
    const [tabParam, setTab] = useUrlState("tab", "all")
    const tab: BlogTab = BLOG_TABS.includes(tabParam as BlogTab) ? (tabParam as BlogTab) : "all"
    const [searchQuery, setSearchQuery] = useUrlState("q", "")
    const [categoryFilter, setCategoryFilter] = useUrlState("cat", "전체")
    const [labelFilter, setLabelFilter] = useUrlState("label", "")
    // view 가 없으면 「한눈에」. 단 글 관리 필터가 실린 옛 주소(?tab=trash 등)는 글 관리로 연다.
    const [viewParam, setViewParam] = useUrlState("view", "")
    const hasManageParams = tabParam !== "all" || searchQuery !== "" || categoryFilter !== "전체" || labelFilter !== ""
    const contentView: ContentView =
        viewParam === "posts" || viewParam === "hub" ? viewParam : hasManageParams ? "posts" : "hub"
    const [periodParam, setPeriodParam] = useUrlState("period", "last_30d")
    const period: ContentHubPeriod = isContentHubPeriod(periodParam) ? periodParam : "last_30d"
    // 새로고침 — 한눈에의 조회수·인스타 요청은 다음 한 번 캐시를 건너뛰고, '오늘'도 다시 잡는다.
    const [refresh, setRefresh] = useState(() => ({ token: 0, at: Date.now() }))
    const [posts, setPosts] = useState<BlogPost[]>([])
    const [trashedPosts, setTrashedPosts] = useState<BlogPost[]>([])
    const [loading, setLoading] = useState(true)
    const [formLoading, setFormLoading] = useState(false)

    const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null)
    const [permanentTarget, setPermanentTarget] = useState<BlogPost | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [listError, setListError] = useState<string | null>(null)

    const fetchPosts = useCallback(async (force = false) => {
        setLoading(true)
        try {
            const [data, trashData] = await Promise.all([
                adminFetchJsonCached<{ posts: BlogPost[] }>("/api/admin/blog", undefined, { ttlMs: 60_000, force }),
                adminFetchJsonCached<{ posts: BlogPost[] }>("/api/admin/blog?trash=1", undefined, { ttlMs: 60_000, force }),
            ])
            setPosts(data.posts)
            setTrashedPosts(trashData.posts)
            setListError(null)
        } catch {
            // 무음 실패는 빈 목록("등록된 글이 없습니다")으로 위장된다 — 실패를 배너로 구분한다
            // (2026-08-18, 실패≠빈상태).
            setListError("글 목록을 불러오지 못했습니다. 표시된 목록이 최신이 아닐 수 있습니다.")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPosts()
    }, [fetchPosts])

    const handleRefresh = () => {
        setRefresh((prev) => ({ token: prev.token + 1, at: Date.now() }))
        void fetchPosts(true)
    }

    const openManage = (nextTab: BlogTab) => {
        setTab(nextTab)
        setViewParam("posts")
    }

    const handleUnauthorized = () => {
        router.replace("/admin/login")
    }

    const handleCreate = () => {
        router.push("/admin/blog/new")
    }

    const handleEdit = (post: BlogPost) => {
        router.push(`/admin/blog/${post._uuid ?? post.id}/edit`)
    }

    // Soft delete → trash
    const handleDelete = async () => {
        if (!deleteTarget) return
        setFormLoading(true)
        try {
            const res = await adminFetch(`/api/admin/blog/${deleteTarget._uuid ?? deleteTarget.id}`, {
                method: "DELETE",
            })
            if (res.status === 401) { handleUnauthorized(); return }
            setDeleteTarget(null)
            await fetchPosts()
        } catch {
            // silent
        } finally {
            setFormLoading(false)
        }
    }

    // Permanent delete from trash
    const handlePermanentDelete = async () => {
        if (!permanentTarget) return
        setFormLoading(true)
        try {
            const res = await adminFetch(`/api/admin/blog/${permanentTarget._uuid ?? permanentTarget.id}?permanent=true`, {
                method: "DELETE",
            })
            if (res.status === 401) { handleUnauthorized(); return }
            setPermanentTarget(null)
            await fetchPosts()
        } catch {
            // silent
        } finally {
            setFormLoading(false)
        }
    }

    // 목록 액션(복원/대표/공개/복제) 공용 실행기 — 401은 로그인으로, 실패는 배너로 노출.
    // 이전에는 응답을 확인하지 않아 401·서버 오류가 조용히 삼켜졌다.
    const runPostAction = async (action: () => Promise<Response>) => {
        setActionError(null)
        try {
            const res = await action()
            if (res.status === 401) { handleUnauthorized(); return }
            if (!res.ok) {
                setActionError("작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
                return
            }
            await fetchPosts()
        } catch {
            setActionError("작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        }
    }

    // Restore from trash
    const handleRestore = (post: BlogPost) =>
        runPostAction(() =>
            adminFetch(`/api/admin/blog/${post._uuid ?? post.id}`, {
                method: "PUT",
                body: JSON.stringify({ restore: true }),
            })
        )

    const handleToggleFeatured = (post: BlogPost) =>
        runPostAction(() =>
            adminFetch(`/api/admin/blog/${post._uuid ?? post.id}`, {
                method: "PUT",
                body: JSON.stringify({ featured: !post.featured }),
            })
        )

    const handleTogglePublished = (post: BlogPost) =>
        runPostAction(() =>
            adminFetch(`/api/admin/blog/${post._uuid ?? post.id}`, {
                method: "PUT",
                body: JSON.stringify({
                    status: post.status === "published" ? "draft" : "published",
                }),
            })
        )

    const handleDuplicate = (post: BlogPost) =>
        runPostAction(() =>
            adminFetch("/api/admin/blog", {
                method: "POST",
                body: JSON.stringify({
                    ...post,
                    title: `${post.title} (복사)`,
                    slug: "",
                    status: "draft",
                    featured: false,
                    publishedAt: undefined,
                }),
            })
        )

    // 상태 탭이 먼저 범위를 정하고, 카테고리·라벨 개수는 그 범위 안에서 센다(공개 탭이면 공개 글 중 몇 편).
    const tabPosts = useMemo(() => {
        if (tab === "published") return posts.filter((p) => p.status === "published")
        if (tab === "private") return posts.filter((p) => p.status !== "published")
        return posts
    }, [posts, tab])

    const filteredPosts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        return tabPosts
            .filter((p) => categoryFilter === "전체" || p.category === categoryFilter)
            .filter((p) => !labelFilter || p.tags.includes(labelFilter))
            .filter((p) => {
                if (!q) return true
                return [p.title, p.excerpt, p.author, ...p.tags].join(" ").toLowerCase().includes(q)
            })
    }, [tabPosts, categoryFilter, labelFilter, searchQuery])

    // 목록 단계 렌더(2026-08-18) — 글이 수백 건이 돼도 전량 렌더하지 않는다. 필터가 바뀌면
    // useVisibleCount가 total로 클램프하므로 별도 리셋 이펙트가 필요 없다.
    const postsVisible = useVisibleCount(filteredPosts.length, 30)

    const publishedCount = posts.filter((p) => p.status === "published").length
    const privateCount = posts.length - publishedCount
    const TABS: { key: BlogTab; label: string; count: number }[] = [
        { key: "all", label: "전체", count: posts.length },
        { key: "published", label: "공개", count: publishedCount },
        { key: "private", label: "비공개", count: privateCount },
        { key: "trash", label: "휴지통", count: trashedPosts.length },
    ]

    const categoryOptions = useMemo(() => {
        const counts = new Map<string, number>()
        for (const p of tabPosts) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
        const known = CATEGORIES.slice(1).filter((c) => counts.has(c))
        const unknown = [...counts.keys()].filter((c) => !CATEGORIES.includes(c as typeof CATEGORIES[number]))
        return [
            { value: "전체", count: tabPosts.length },
            ...[...known, ...unknown].map((value) => ({ value, count: counts.get(value) ?? 0 })),
        ]
    }, [tabPosts])

    // 라벨(태그)은 60개가 넘어 칩 대신 많이 쓴 순 드롭다운으로 고른다.
    const labelOptions = useMemo(() => {
        const counts = new Map<string, number>()
        for (const p of tabPosts) for (const t of p.tags) if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    }, [tabPosts])

    const hasFilters = categoryFilter !== "전체" || labelFilter !== "" || searchQuery.trim() !== ""
    const resetFilters = () => {
        setCategoryFilter("전체")
        setLabelFilter("")
        setSearchQuery("")
    }

    const VIEWS: { key: ContentView; label: string; count?: number }[] = [
        { key: "hub", label: "한눈에" },
        { key: "posts", label: "글 관리", count: posts.length },
    ]

    return (
        <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
            {/* Header */}
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                        <p className="text-[12px] font-medium text-[#615D59]">마케팅·분석</p>
                        <a href="/admin/campaigns" className="text-[12px] text-[#084734] hover:underline">
                            마케팅 관리 →
                        </a>
                    </div>
                    <h1 className="text-[26px] font-bold leading-tight tracking-[-0.625px] text-[#111110]">콘텐츠</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {contentView === "hub" ? (
                        <ContentHubSegmented
                            label="기간"
                            options={CONTENT_HUB_PERIODS}
                            value={period}
                            onChange={setPeriodParam}
                        />
                    ) : null}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={loading}
                        aria-label="새로고침"
                        className="h-10 w-10 px-0"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                    {!(contentView === "posts" && tab === "trash") && (
                        <Button size="sm" onClick={handleCreate} className="h-10 px-[18px] text-[14px]">
                            <Plus className="mr-1.5 h-4 w-4" />
                            새 글 작성
                        </Button>
                    )}
                </div>
            </div>

            <nav aria-label="콘텐츠 보기" className="mb-5 flex gap-7 border-b border-[#e8e8e4]">
                {VIEWS.map((view) => {
                    const active = contentView === view.key
                    return (
                        <button
                            key={view.key}
                            type="button"
                            aria-current={active ? "page" : undefined}
                            onClick={() => setViewParam(view.key)}
                            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-[11px] pt-2.5 text-[15px] font-semibold transition-colors ${
                                active ? "border-[#084734] text-[#111110]" : "border-transparent text-[#615D59] hover:text-[#111110]"
                            }`}
                        >
                            {view.label}
                            {view.count !== undefined ? (
                                <span className="text-[12px] font-medium tabular-nums text-[#615D59]">{view.count}</span>
                            ) : null}
                        </button>
                    )
                })}
            </nav>

            {contentView === "posts" ? (
                <>
            {/* Tabs */}
            <div className="admin-scroll-snap-x no-scrollbar -mx-1 mb-4 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-1">
                {TABS.map(({ key, label, count }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                            tab === key
                                ? "bg-[#111110] text-white"
                                : "text-[#1a1a1a]/50 hover:text-[#1a1a1a] hover:bg-[#f0f0ec]"
                        }`}
                    >
                        {key === "trash" && <Trash2 className="w-3.5 h-3.5" />}
                        {label}
                        {count > 0 && (
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                                tab === key
                                    ? "bg-white/20 text-white"
                                    : key === "trash"
                                        ? "bg-[#FEF3EE] text-[#B85C33]"
                                        : "bg-[#e8e8e4] text-[#1a1a1a]/60"
                            }`}>
                                {count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* 검색 + 라벨 + 카테고리 필터 */}
            {tab !== "trash" && (
                <div className="mb-4 space-y-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#1a1a1a]/30" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="제목, 요약, 작성자, 라벨 검색"
                                aria-label="글 검색"
                                className="w-full rounded-lg border border-[#e8e8e4] bg-white py-2 pl-9 pr-8 text-[13px] outline-none placeholder:text-[#1a1a1a]/30 focus:border-[#084734]"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    aria-label="검색어 지우기"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        <select
                            value={labelFilter}
                            onChange={(e) => setLabelFilter(e.target.value)}
                            aria-label="라벨 필터"
                            className={`rounded-lg border bg-white py-2 pl-3 pr-8 text-[13px] outline-none focus:border-[#084734] sm:w-56 ${
                                labelFilter ? "border-[#084734] text-[#084734]" : "border-[#e8e8e4] text-[#1a1a1a]/60"
                            }`}
                        >
                            <option value="">라벨 전체</option>
                            {labelFilter && !labelOptions.some(([t]) => t === labelFilter) ? (
                                <option value={labelFilter}>{labelFilter} (0)</option>
                            ) : null}
                            {labelOptions.map(([label, count]) => (
                                <option key={label} value={label}>
                                    {label} ({count})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="카테고리 필터">
                        {categoryOptions.map(({ value, count }) => {
                            const active = categoryFilter === value
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setCategoryFilter(value)}
                                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                                        active
                                            ? "border-[#084734] bg-white text-[#084734]"
                                            : "border-[#e8e8e4] bg-white text-[#1a1a1a]/50 hover:bg-[#f6f5f4] hover:text-[#1a1a1a]"
                                    }`}
                                >
                                    {value}
                                    <span className={`tabular-nums ${active ? "text-[#084734]/70" : "text-[#1a1a1a]/30"}`}>{count}</span>
                                </button>
                            )
                        })}
                        {hasFilters ? (
                            <span className="ml-auto flex items-center gap-2 text-[12px] text-[#1a1a1a]/50">
                                <span aria-live="polite">{filteredPosts.length}편</span>
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="inline-flex items-center gap-1 font-semibold text-[#084734] hover:underline"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                    필터 초기화
                                </button>
                            </span>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Trash warning banner */}
            {tab === "trash" && trashedPosts.length > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[13px] text-[#B85C33]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    휴지통의 글은 복원하거나 완전히 삭제할 수 있습니다. 완전 삭제는 되돌릴 수 없습니다.
                </div>
            )}

            {/* 목록 조회 실패 배너 — 빈 상태와 구분(재시도 가능) */}
            {listError && (
                <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[13px] text-[#B85C33]">
                    <span className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {listError}
                    </span>
                    <button
                        type="button"
                        onClick={() => void fetchPosts()}
                        className="shrink-0 rounded-md border border-[#F6D5C5] bg-white px-2 py-0.5 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FEF3EE]"
                    >
                        다시 시도
                    </button>
                </div>
            )}

            {/* 목록 액션 실패 배너 */}
            {actionError && (
                <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[13px] text-[#B85C33]">
                    <span className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {actionError}
                    </span>
                    <button
                        type="button"
                        onClick={() => setActionError(null)}
                        className="shrink-0 text-[#B85C33]/60 transition-colors hover:text-[#B85C33]"
                        aria-label="오류 메시지 닫기"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
                {tab === "trash" ? (
                    <TrashTable
                        posts={trashedPosts}
                        onRestore={handleRestore}
                        onPermanentDelete={setPermanentTarget}
                    />
                ) : (
                    <BlogPostTable
                        posts={filteredPosts.slice(0, postsVisible.visible)}
                        onEdit={handleEdit}
                        onDelete={setDeleteTarget}
                        onDuplicate={handleDuplicate}
                        onToggleFeatured={handleToggleFeatured}
                        onTogglePublished={handleTogglePublished}
                        onLabelClick={setLabelFilter}
                        emptyMessage={hasFilters ? "조건에 맞는 글이 없습니다." : undefined}
                    />
                )}
            </div>

            {tab !== "trash" && (postsVisible.canMore || postsVisible.canCollapse) && (
                <div className="mt-3 flex justify-center">
                    <ShowMore
                        visible={postsVisible.visible}
                        total={filteredPosts.length}
                        step={30}
                        onMore={postsVisible.showMore}
                        onCollapse={postsVisible.canCollapse ? postsVisible.collapse : undefined}
                    />
                </div>
            )}
                </>
            ) : (
                <ContentHub
                    posts={posts}
                    postsLoading={loading}
                    period={period}
                    refreshToken={refresh.token}
                    nowMs={refresh.at}
                    draftCount={privateCount}
                    trashCount={trashedPosts.length}
                    onPeriodChange={setPeriodParam}
                    onOpenManage={openManage}
                    onEdit={handleEdit}
                />
            )}

            {/* Soft-delete confirm */}
            <DeleteConfirmDialog
                post={deleteTarget}
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                loading={formLoading}
            />

            {/* Permanent delete confirm */}
            {permanentTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-[#FEF3EE] flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-[#B85C33]" />
                            </div>
                            <div>
                                <p className="font-semibold text-[#111110]">완전 삭제</p>
                                <p className="text-[13px] text-[#1a1a1a]/50">되돌릴 수 없습니다</p>
                            </div>
                        </div>
                        <p className="text-[13px] text-[#1a1a1a]/70 mb-5 line-clamp-2">
                            <span className="font-medium text-[#111110]">&ldquo;{permanentTarget.title}&rdquo;</span>을 영구 삭제하시겠습니까?
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setPermanentTarget(null)}
                                disabled={formLoading}
                            >
                                취소
                            </Button>
                            <Button
                                className="flex-1 bg-[#B85C33] hover:bg-[#9A4A27] text-white"
                                onClick={handlePermanentDelete}
                                disabled={formLoading}
                            >
                                {formLoading ? "삭제 중..." : "완전 삭제"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Trash Table (inline) ─────────────────────────────────────────────────────
function TrashTable({
    posts,
    onRestore,
    onPermanentDelete,
}: {
    posts: BlogPost[]
    onRestore: (post: BlogPost) => void
    onPermanentDelete: (post: BlogPost) => void
}) {
    if (posts.length === 0) {
        return (
            <div className="py-20 text-center text-[#1a1a1a]/30 text-sm">
                휴지통이 비어 있습니다.
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-[#e8e8e4] text-left text-[#1a1a1a]/40">
                        <th className="py-3 px-3 font-medium w-10">ID</th>
                        <th className="py-3 px-3 font-medium">제목</th>
                        <th className="py-3 px-3 font-medium hidden md:table-cell">카테고리</th>
                        <th className="py-3 px-3 font-medium hidden md:table-cell">삭제일</th>
                        <th className="py-3 px-3 font-medium w-32 text-right">관리</th>
                    </tr>
                </thead>
                <tbody>
                    {posts.map((post) => (
                        <tr key={post.id} className="border-b border-[#f0f0ec] bg-[#fafaf8]">
                            <td className="py-3 px-3 text-[#1a1a1a]/25">{post.id}</td>
                            <td className="py-3 px-3">
                                <span className="font-medium text-[#1a1a1a]/40 line-clamp-1">{post.title}</span>
                            </td>
                            <td className="py-3 px-3 text-[#1a1a1a]/30 hidden md:table-cell">{post.category}</td>
                            <td className="py-3 px-3 text-[#1a1a1a]/30 hidden md:table-cell">
                                {post.deletedAt ? new Date(post.deletedAt).toLocaleDateString("ko-KR") : "-"}
                            </td>
                            <td className="py-3 px-3">
                                <div className="flex items-center justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-[12px] text-[#084734] hover:text-[#084734] hover:bg-[#084734]/10"
                                        onClick={() => onRestore(post)}
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                        복원
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-[12px] text-[#B85C33] hover:text-[#9A4A27] hover:bg-[#FEF3EE]"
                                        onClick={() => onPermanentDelete(post)}
                                    >
                                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                                        완전 삭제
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
