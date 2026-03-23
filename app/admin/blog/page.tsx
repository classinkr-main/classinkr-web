"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, RefreshCw, Trash2, RotateCcw, AlertTriangle } from "lucide-react"
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
import type { BlogPost } from "@/lib/blog-types"

type Tab = "all" | "private" | "trash"

function getToken() {
    return sessionStorage.getItem("admin_password") ?? ""
}

function adminFetch(url: string, options?: RequestInit) {
    return fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
            ...options?.headers,
        },
    })
}

export default function AdminBlogPage() {
    const router = useRouter()
    const [tab, setTab] = useState<Tab>("all")
    const [posts, setPosts] = useState<BlogPost[]>([])
    const [trashedPosts, setTrashedPosts] = useState<BlogPost[]>([])
    const [loading, setLoading] = useState(false)
    const [formLoading, setFormLoading] = useState(false)

    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingPost, setEditingPost] = useState<BlogPost | undefined>(undefined)
    const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null)
    const [permanentTarget, setPermanentTarget] = useState<BlogPost | null>(null)

    const fetchPosts = useCallback(async () => {
        setLoading(true)
        try {
            const [res, trashRes] = await Promise.all([
                fetch("/api/admin/blog"),
                fetch("/api/admin/blog?trash=1"),
            ])
            if (res.ok) {
                const data = await res.json()
                setPosts(data.posts)
            }
            if (trashRes.ok) {
                const data = await trashRes.json()
                setTrashedPosts(data.posts)
            }
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPosts()
    }, [fetchPosts])

    const handleUnauthorized = () => {
        router.replace("/admin/login")
    }

    const handleCreate = () => {
        setEditingPost(undefined)
        setIsFormOpen(true)
    }

    const handleEdit = (post: BlogPost) => {
        setEditingPost(post)
        setIsFormOpen(true)
    }

    const handleSave = async (data: Omit<BlogPost, "id">) => {
        setFormLoading(true)
        try {
            if (editingPost) {
                const res = await adminFetch(`/api/admin/blog/${editingPost.id}`, {
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
            const res = await adminFetch(`/api/admin/blog/${deleteTarget.id}`, {
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
            const res = await adminFetch(`/api/admin/blog/${permanentTarget.id}?permanent=true`, {
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
        await adminFetch(`/api/admin/blog/${post.id}`, {
            method: "PUT",
            body: JSON.stringify({ restore: true }),
        })
        await fetchPosts()
    }

    const handleToggleFeatured = async (post: BlogPost) => {
        await adminFetch(`/api/admin/blog/${post.id}`, {
            method: "PUT",
            body: JSON.stringify({ featured: !post.featured }),
        })
        await fetchPosts()
    }

    const handleTogglePublished = async (post: BlogPost) => {
        await adminFetch(`/api/admin/blog/${post.id}`, {
            method: "PUT",
            body: JSON.stringify({ published: post.published === false }),
        })
        await fetchPosts()
    }

    const displayedPosts =
        tab === "trash" ? trashedPosts :
        tab === "private" ? posts.filter((p) => p.published === false) :
        posts

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: "all", label: "전체", count: posts.length },
        { key: "private", label: "비공개", count: posts.filter((p) => p.published === false).length },
        { key: "trash", label: "휴지통", count: trashedPosts.length },
    ]

    return (
        <div className="px-8 pt-12 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest">Admin</p>
                        <a href="/admin/marketing" className="text-[11px] text-[#084734] hover:underline">
                            마케팅 관리 →
                        </a>
                    </div>
                    <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">콘텐츠 관리</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchPosts} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                        새로고침
                    </Button>
                    {tab !== "trash" && (
                        <Button size="sm" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-1.5" />
                            새 글 작성
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-4">
                {TABS.map(({ key, label, count }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
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
                                        ? "bg-red-100 text-red-500"
                                        : "bg-[#e8e8e4] text-[#1a1a1a]/60"
                            }`}>
                                {count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Trash warning banner */}
            {tab === "trash" && trashedPosts.length > 0 && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-[13px] text-red-600">
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
                        onToggleFeatured={handleToggleFeatured}
                        onTogglePublished={handleTogglePublished}
                    />
                )}
            </div>

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
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
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
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
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
                                        className="h-7 text-[12px] text-red-400 hover:text-red-500 hover:bg-red-50"
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
