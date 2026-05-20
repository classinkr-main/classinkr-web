"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
    AlertTriangle,
    BarChart3,
    Bookmark,
    CheckCircle2,
    ExternalLink,
    Eye,
    Heart,
    Instagram,
    MessageCircle,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Trash2,
    Users,
    X,
} from "lucide-react"
import { CATEGORIES } from "@/lib/blog-types"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import BlogPostTable from "@/components/admin/BlogPostTable"
import BlogPostForm from "@/components/admin/BlogPostForm"
import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import { adminFetch, adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import type { BlogPost, BlogPostInput } from "@/lib/blog-types"

type ContentView = "blog" | "instagram"
type BlogTab = "all" | "private" | "trash"
type InstagramDatePreset = "last_7d" | "last_30d" | "last_90d" | "this_month"

interface InstagramDashboard {
    account: {
        id: string
        username?: string
        name?: string
        followersCount: number
        followsCount: number
        mediaCount: number
        profilePictureUrl?: string
    }
    datePreset: string
    media: Array<{
        id: string
        caption?: string
        mediaType?: string
        mediaProductType?: string
        permalink?: string
        timestamp?: string
        thumbnailUrl?: string
        mediaUrl?: string
        likeCount: number
        commentsCount: number
        insights: {
            views: number
            reach: number
            likes: number
            comments: number
            shares: number
            saved: number
            totalInteractions: number
        }
        insightsError?: string
    }>
    followerGrowth: Array<{ date: string; value: number }>
    summary: {
        mediaCount: number
        totalViews: number
        totalReach: number
        totalInteractions: number
        averageViews: number
        topMediaId: string | null
        topMediaViews: number
        followerDelta: number
        insightsErrorCount: number
    }
}

const KRW = new Intl.NumberFormat("ko-KR")
const COMPACT = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })
const CONTENT_VIEWS: Array<{ key: ContentView; label: string; sub: string }> = [
    { key: "blog", label: "블로그", sub: "글 목록 · 공개 상태 · 휴지통" },
    { key: "instagram", label: "인스타 게시물", sub: "조회수 · 팔로워 · 상호작용" },
]
const INSTAGRAM_DATE_OPTIONS: Array<{ value: InstagramDatePreset; label: string }> = [
    { value: "last_7d", label: "7일" },
    { value: "last_30d", label: "30일" },
    { value: "last_90d", label: "90일" },
    { value: "this_month", label: "이번 달" },
]

function formatMetric(value: number | null | undefined) {
    return KRW.format(value ?? 0)
}

function formatCompact(value: number | null | undefined) {
    return COMPACT.format(value ?? 0)
}

function formatDateTime(value?: string) {
    if (!value) return "날짜 없음"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "날짜 없음"
    return new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date)
}

function formatDateShort(value?: string) {
    if (!value) return "날짜 없음"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "날짜 없음"
    return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date)
}

function previewText(value?: string, maxLength = 92) {
    const text = value?.replace(/\s+/g, " ").trim()
    if (!text) return "캡션 없음"
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function mediaTypeLabel(value?: string) {
    switch (value) {
        case "VIDEO":
            return "영상"
        case "CAROUSEL_ALBUM":
            return "캐러셀"
        case "IMAGE":
            return "이미지"
        default:
            return value ?? "게시물"
    }
}

function getInstagramErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("META_INSTAGRAM_BUSINESS_ACCOUNT_ID")) {
        return "Instagram Business 계정 ID가 아직 설정되지 않았습니다. META_INSTAGRAM_BUSINESS_ACCOUNT_ID 또는 연결된 META_PAGE_ID를 설정해주세요."
    }
    if (message.includes("Missing META_ACCESS_TOKEN") || message.includes("META_PAGE_ACCESS_TOKEN")) {
        return "Instagram 인사이트를 읽을 Meta 액세스 토큰이 설정되지 않았습니다."
    }
    return message || "인스타그램 데이터를 불러오지 못했습니다."
}

export default function AdminBlogPage() {
    const router = useRouter()
    const [contentView, setContentView] = useState<ContentView>("blog")
    const [tab, setTab] = useState<BlogTab>("all")
    const [posts, setPosts] = useState<BlogPost[]>([])
    const [trashedPosts, setTrashedPosts] = useState<BlogPost[]>([])
    const [loading, setLoading] = useState(false)
    const [instagramDashboard, setInstagramDashboard] = useState<InstagramDashboard | null>(null)
    const [instagramLoading, setInstagramLoading] = useState(false)
    const [instagramError, setInstagramError] = useState<string | null>(null)
    const [instagramDatePreset, setInstagramDatePreset] = useState<InstagramDatePreset>("last_30d")
    const [formLoading, setFormLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [categoryFilter, setCategoryFilter] = useState<string>("전체")

    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingPost, setEditingPost] = useState<BlogPost | undefined>(undefined)
    const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null)
    const [permanentTarget, setPermanentTarget] = useState<BlogPost | null>(null)

    const fetchPosts = useCallback(async () => {
        setLoading(true)
        try {
            const [data, trashData] = await Promise.all([
                adminFetchJsonCached<{ posts: BlogPost[] }>("/api/admin/blog", undefined, { ttlMs: 60_000 }),
                adminFetchJsonCached<{ posts: BlogPost[] }>("/api/admin/blog?trash=1", undefined, { ttlMs: 60_000 }),
            ])
            setPosts(data.posts)
            setTrashedPosts(trashData.posts)
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPosts()
    }, [fetchPosts])

    const fetchInstagram = useCallback(async () => {
        setInstagramLoading(true)
        setInstagramError(null)
        try {
            const data = await adminFetchJson<InstagramDashboard & { ok: boolean }>(
                `/api/admin/meta/instagram?datePreset=${instagramDatePreset}&limit=25`
            )
            setInstagramDashboard(data)
        } catch (error) {
            setInstagramError(getInstagramErrorMessage(error))
        } finally {
            setInstagramLoading(false)
        }
    }, [instagramDatePreset])

    useEffect(() => {
        if (contentView === "instagram") {
            fetchInstagram()
        }
    }, [contentView, fetchInstagram])

    const handleUnauthorized = () => {
        router.replace("/admin/login")
    }

    const handleCreate = () => {
        setEditingPost(undefined)
        router.push("/admin/blog/new")
    }

    const handleEdit = (post: BlogPost) => {
        router.push(`/admin/blog/${post.id}/edit`)
    }

    const handleSave = async (data: Partial<BlogPostInput>) => {
        setFormLoading(true)
        try {
            if (editingPost) {
                const res = await adminFetch(`/api/admin/blog/${editingPost._uuid ?? editingPost.id}`, {
                    method: "PUT",
                    body: JSON.stringify(data),
                })
                if (res.status === 401) { handleUnauthorized(); return }
            } else {
                const res = await adminFetch("/api/admin/blog", {
                    method: "POST",
                    body: JSON.stringify(data),
                })
                if (res.status === 401) { handleUnauthorized(); return }
            }
            setIsFormOpen(false)
            await fetchPosts()
        } catch {
            // silent
        } finally {
            setFormLoading(false)
        }
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

    // Restore from trash
    const handleRestore = async (post: BlogPost) => {
        await adminFetch(`/api/admin/blog/${post._uuid ?? post.id}`, {
            method: "PUT",
            body: JSON.stringify({ restore: true }),
        })
        await fetchPosts()
    }

    const handleToggleFeatured = async (post: BlogPost) => {
        await adminFetch(`/api/admin/blog/${post._uuid ?? post.id}`, {
            method: "PUT",
            body: JSON.stringify({ featured: !post.featured }),
        })
        await fetchPosts()
    }

    const handleTogglePublished = async (post: BlogPost) => {
        const nextStatus = post.status === "published" ? "draft" : "published"
        await adminFetch(`/api/admin/blog/${post._uuid ?? post.id}`, {
            method: "PUT",
            body: JSON.stringify({ status: nextStatus }),
        })
        await fetchPosts()
    }

    const handleDuplicate = async (post: BlogPost) => {
        await adminFetch("/api/admin/blog", {
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
        await fetchPosts()
    }

    const filteredPosts = useMemo(() => {
        const base =
            tab === "private" ? posts.filter((p) => p.status !== "published") : posts
        return base
            .filter((p) => categoryFilter === "전체" || p.category === categoryFilter)
            .filter((p) => {
                if (!searchQuery.trim()) return true
                const q = searchQuery.toLowerCase()
                return (
                    p.title.toLowerCase().includes(q) ||
                    p.excerpt?.toLowerCase().includes(q) ||
                    p.author?.toLowerCase().includes(q)
                )
            })
    }, [posts, tab, categoryFilter, searchQuery])

    const displayedPosts = tab === "trash" ? trashedPosts : filteredPosts

    const TABS: { key: BlogTab; label: string; count: number }[] = [
        { key: "all", label: "전체", count: posts.length },
        { key: "private", label: "비공개", count: posts.filter((p) => p.status !== "published").length },
        { key: "trash", label: "휴지통", count: trashedPosts.length },
    ]

    const usedCategories = useMemo(() => {
        const cats = Array.from(new Set(posts.map((p) => p.category).filter(Boolean)))
        return ["전체", ...CATEGORIES.slice(1).filter((c) => cats.includes(c)), ...cats.filter((c) => !CATEGORIES.includes(c as typeof CATEGORIES[number]))]
    }, [posts])

    return (
        <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest">Admin</p>
                        <a href="/admin/campaigns" className="text-[11px] text-[#084734] hover:underline">
                            마케팅 관리 →
                        </a>
                    </div>
                    <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">콘텐츠 관리</h1>
                    <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
                        새 글 작성은 전체 에디터로 연결되며, 에디터 안에서 임시저장 자동 복원과 이어쓰기 기능을 사용할 수 있습니다.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={contentView === "instagram" ? fetchInstagram : fetchPosts}
                        disabled={contentView === "instagram" ? instagramLoading : loading}
                        className="w-full sm:w-auto"
                    >
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${(contentView === "instagram" ? instagramLoading : loading) ? "animate-spin" : ""}`} />
                        새로고침
                    </Button>
                    {contentView === "blog" && tab !== "trash" && (
                        <Button size="sm" onClick={handleCreate} className="w-full sm:w-auto">
                            <Plus className="w-4 h-4 mr-1.5" />
                            새 글 작성
                        </Button>
                    )}
                </div>
            </div>

            {contentView === "blog" && (
            <div className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-[12px] font-semibold text-[#111110]">에디터 사용 흐름</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">
                            목록에서는 상태를 보고, 실제 작성과 임시저장 복원은 전용 에디터에서 이어갑니다.
                        </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => router.push("/admin/blog/new")} className="w-full md:w-auto">
                        에디터 바로 열기
                    </Button>
                </div>
            </div>
            )}

            <div className="mb-5 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-1.5">
                <div className="admin-scroll-snap-x no-scrollbar flex flex-nowrap gap-1 overflow-x-auto" role="tablist" aria-label="콘텐츠 보기">
                    {CONTENT_VIEWS.map((view) => {
                        const active = contentView === view.key
                        return (
                            <button
                                key={view.key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setContentView(view.key)}
                                className={`min-w-[170px] shrink-0 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                    active
                                        ? "bg-white text-[#111110] shadow-[0_1px_4px_rgba(17,17,16,0.06)]"
                                        : "text-[#1a1a1a]/50 hover:bg-white/70 hover:text-[#111110]"
                                }`}
                            >
                                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                                    {view.key === "instagram" && <Instagram className="h-3.5 w-3.5" />}
                                    {view.label}
                                </span>
                                <span className="mt-0.5 block text-[10.5px] font-medium text-[#1a1a1a]/40">{view.sub}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {contentView === "blog" ? (
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

            {/* 검색 + 카테고리 필터 */}
            {tab !== "trash" && (
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#1a1a1a]/30" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="제목, 요약, 작성자 검색"
                            className="w-full rounded-lg border border-[#e8e8e4] bg-white py-2 pl-9 pr-8 text-[13px] outline-none placeholder:text-[#1a1a1a]/30 focus:border-[#084734]"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {usedCategories.map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setCategoryFilter(cat)}
                                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                                    categoryFilter === cat
                                        ? "bg-[#084734] text-white"
                                        : "border border-[#e8e8e4] bg-white text-[#1a1a1a]/50 hover:text-[#1a1a1a] hover:bg-[#f0f0ec]"
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
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
                        posts={displayedPosts}
                        onEdit={handleEdit}
                        onDelete={setDeleteTarget}
                        onDuplicate={handleDuplicate}
                        onToggleFeatured={handleToggleFeatured}
                        onTogglePublished={handleTogglePublished}
                    />
                )}
            </div>
                </>
            ) : (
                <InstagramContentPanel
                    dashboard={instagramDashboard}
                    loading={instagramLoading}
                    error={instagramError}
                    datePreset={instagramDatePreset}
                    onDatePresetChange={setInstagramDatePreset}
                    onRefresh={fetchInstagram}
                />
            )}

            {/* Edit Dialog */}
            <Dialog open={isFormOpen} onOpenChange={(v) => !v && setIsFormOpen(false)}>
                <DialogContent className="sm:max-w-lg bg-white">
                    <DialogHeader>
                        <DialogTitle>{editingPost ? "글 수정" : "새 글 작성"}</DialogTitle>
                    </DialogHeader>
                    <BlogPostForm
                        post={editingPost}
                        onSave={handleSave}
                        onCancel={() => setIsFormOpen(false)}
                        loading={formLoading}
                    />
                </DialogContent>
            </Dialog>

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

function InstagramMetricCard({
    icon,
    label,
    value,
    hint,
    tone = "neutral",
}: {
    icon: ReactNode
    label: string
    value: string
    hint?: string
    tone?: "neutral" | "success" | "warn"
}) {
    const accent =
        tone === "success"
            ? "bg-[#ECFDF5] text-[#084734]"
            : tone === "warn"
                ? "bg-[#FEF3EE] text-[#B85C33]"
                : "bg-[#f0f0ec] text-[#1a1a1a]/55"

    return (
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <span className={`inline-flex rounded-xl p-2 ${accent}`}>{icon}</span>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-widest text-[#1a1a1a]/35">{label}</p>
            <p className="mt-1.5 text-[22px] font-bold leading-none text-[#111110]">{value}</p>
            {hint && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</p>}
        </div>
    )
}

function InstagramContentPanel({
    dashboard,
    loading,
    error,
    datePreset,
    onDatePresetChange,
    onRefresh,
}: {
    dashboard: InstagramDashboard | null
    loading: boolean
    error: string | null
    datePreset: InstagramDatePreset
    onDatePresetChange: (value: InstagramDatePreset) => void
    onRefresh: () => void
}) {
    const media = dashboard?.media ?? []
    const summary = dashboard?.summary
    const followerGrowth = dashboard?.followerGrowth ?? []
    const maxFollowerMove = Math.max(1, ...followerGrowth.map((point) => Math.abs(point.value)))

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex shrink-0 rounded-xl bg-[#FEF3EE] p-2 text-[#B85C33]">
                            <Instagram className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-[15px] font-bold text-[#111110]">
                                    {dashboard?.account.username ? `@${dashboard.account.username}` : "Instagram 콘텐츠"}
                                </h2>
                                {dashboard && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                        <CheckCircle2 className="h-3 w-3" />
                                        연결됨
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/45">
                                {dashboard
                                    ? `게시물 ${formatMetric(dashboard.account.mediaCount)}개 · 최근 ${formatMetric(summary?.mediaCount)}개 게시물 기준`
                                    : "Instagram Business 계정의 게시물 조회수와 팔로워 현황을 불러옵니다."}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-lg border border-[#e8e8e4] bg-[#F6F5F4] p-[3px]" role="group" aria-label="인스타그램 팔로워 기간">
                            {INSTAGRAM_DATE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onDatePresetChange(option.value)}
                                    className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                                        datePreset === option.value
                                            ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                                            : "text-[#615D59]"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                            동기화
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {loading && !dashboard ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-[132px] animate-pulse rounded-2xl border border-[#e8e8e4] bg-white" />
                    ))}
                </div>
            ) : dashboard ? (
                <>
                    {summary?.insightsErrorCount ? (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>일부 게시물의 인사이트 권한을 확인하지 못했습니다. 표시된 합계는 가져온 데이터 기준입니다.</span>
                        </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InstagramMetricCard
                            icon={<Eye className="h-3.5 w-3.5" />}
                            label="총 조회수"
                            value={formatCompact(summary?.totalViews)}
                            hint={`최근 게시물 ${formatMetric(summary?.mediaCount)}개 합산`}
                            tone="success"
                        />
                        <InstagramMetricCard
                            icon={<BarChart3 className="h-3.5 w-3.5" />}
                            label="도달"
                            value={formatCompact(summary?.totalReach)}
                            hint={`평균 조회수 ${formatMetric(summary?.averageViews)}`}
                        />
                        <InstagramMetricCard
                            icon={<Users className="h-3.5 w-3.5" />}
                            label="팔로워"
                            value={formatMetric(dashboard.account.followersCount)}
                            hint={`기간 신규 ${summary && summary.followerDelta >= 0 ? "+" : ""}${formatMetric(summary?.followerDelta)}`}
                        />
                        <InstagramMetricCard
                            icon={<Heart className="h-3.5 w-3.5" />}
                            label="상호작용"
                            value={formatCompact(summary?.totalInteractions)}
                            hint={`최고 조회수 ${formatMetric(summary?.topMediaViews)}`}
                        />
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
                        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-[14px] font-semibold text-[#111110]">팔로워 현황</h2>
                                    <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">선택 기간의 일별 신규 팔로워입니다.</p>
                                </div>
                                <span className="rounded-full bg-[#f0f0ec] px-2.5 py-1 text-[10px] font-bold text-[#1a1a1a]/45">
                                    {datePreset}
                                </span>
                            </div>

                            {followerGrowth.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-8 text-center text-[12px] text-[#1a1a1a]/35">
                                    팔로워 추이 데이터가 아직 없습니다.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {followerGrowth.slice(-10).map((point) => {
                                        const width = Math.max(6, Math.round((Math.abs(point.value) / maxFollowerMove) * 100))
                                        return (
                                            <div key={point.date} className="grid grid-cols-[54px_minmax(0,1fr)_42px] items-center gap-2">
                                                <span className="text-[11px] text-[#1a1a1a]/40">{formatDateShort(point.date)}</span>
                                                <div className="h-2 overflow-hidden rounded-full bg-[#f0f0ec]">
                                                    <div
                                                        className={`h-full rounded-full ${point.value >= 0 ? "bg-[#084734]" : "bg-[#B85C33]"}`}
                                                        style={{ width: `${width}%` }}
                                                    />
                                                </div>
                                                <span className="text-right text-[11px] font-semibold text-[#111110]">
                                                    {point.value >= 0 ? "+" : ""}
                                                    {formatMetric(point.value)}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
                            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
                                <div>
                                    <h2 className="text-[14px] font-semibold text-[#111110]">최근 인스타 게시물</h2>
                                    <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">조회수, 도달, 저장, 댓글을 게시물별로 확인합니다.</p>
                                </div>
                            </div>

                            {media.length === 0 ? (
                                <div className="py-14 text-center text-[12px] text-[#1a1a1a]/30">표시할 인스타 게시물이 없습니다.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-[#f0f0ec] text-left text-[12px]">
                                        <thead className="bg-[#fafaf8] text-[#1a1a1a]/45">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">게시물</th>
                                                <th className="px-4 py-3 text-right font-semibold">조회수</th>
                                                <th className="px-4 py-3 text-right font-semibold">도달</th>
                                                <th className="px-4 py-3 text-right font-semibold">저장</th>
                                                <th className="px-4 py-3 text-right font-semibold">댓글</th>
                                                <th className="px-4 py-3 text-right font-semibold">링크</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#f0f0ec]">
                                            {media.map((item) => {
                                                const previewUrl = item.thumbnailUrl ?? item.mediaUrl
                                                return (
                                                    <tr key={item.id} className="align-middle">
                                                        <td className="max-w-[360px] px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div
                                                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#e8e8e4] bg-[#f0f0ec] bg-cover bg-center text-[#1a1a1a]/35"
                                                                    style={previewUrl ? { backgroundImage: `url("${previewUrl}")` } : undefined}
                                                                >
                                                                    {!previewUrl && <Instagram className="h-4 w-4" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="rounded-full bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-bold text-[#1a1a1a]/45">
                                                                            {mediaTypeLabel(item.mediaType)}
                                                                        </span>
                                                                        <span className="text-[10.5px] text-[#1a1a1a]/35">{formatDateTime(item.timestamp)}</span>
                                                                    </div>
                                                                    <p className="mt-1 truncate text-[12px] font-medium text-[#111110]">{previewText(item.caption)}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#111110]">{formatMetric(item.insights.views)}</td>
                                                        <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{formatMetric(item.insights.reach)}</td>
                                                        <td className="px-4 py-3 text-right tabular-nums text-[#111110]">
                                                            <span className="inline-flex items-center justify-end gap-1">
                                                                <Bookmark className="h-3 w-3 text-[#1a1a1a]/25" />
                                                                {formatMetric(item.insights.saved)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right tabular-nums text-[#111110]">
                                                            <span className="inline-flex items-center justify-end gap-1">
                                                                <MessageCircle className="h-3 w-3 text-[#1a1a1a]/25" />
                                                                {formatMetric(item.commentsCount || item.insights.comments)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            {item.permalink ? (
                                                                <a
                                                                    href={item.permalink}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#111110] transition hover:bg-[#F6F5F4]"
                                                                >
                                                                    열기
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            ) : (
                                                                <span className="text-[11px] text-[#1a1a1a]/25">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                </>
            ) : (
                <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-white px-4 py-14 text-center">
                    <Instagram className="mx-auto h-7 w-7 text-[#1a1a1a]/25" />
                    <p className="mt-3 text-[14px] font-semibold text-[#111110]">Instagram 연결이 필요합니다.</p>
                    <p className="mt-1 text-[12px] text-[#1a1a1a]/40">Meta Instagram Business 계정 ID 또는 연결된 Page ID를 설정하면 게시물 성과가 표시됩니다.</p>
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
