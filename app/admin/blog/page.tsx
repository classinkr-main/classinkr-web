"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, RefreshCw } from "lucide-react"
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
    const [posts, setPosts] = useState<BlogPost[]>([])
    const [loading, setLoading] = useState(false)
    const [formLoading, setFormLoading] = useState(false)

    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingPost, setEditingPost] = useState<BlogPost | undefined>(undefined)
    const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null)

    const fetchPosts = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/admin/blog")
            if (res.ok) {
                const data = await res.json()
                setPosts(data.posts)
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

    const handleToggleFeatured = async (post: BlogPost) => {
        await adminFetch(`/api/admin/blog/${post.id}`, {
            method: "PUT",
            body: JSON.stringify({ featured: !post.featured }),
        })
        await fetchPosts()
    }

    return (
        <div className="px-8 pt-12 pb-20">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest">Admin</p>
                        {/* [NOTE-21] 블로그 ↔ 마케팅 관리 네비게이션 */}
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
                    <Button size="sm" onClick={handleCreate}>
                        <Plus className="w-4 h-4 mr-1.5" />
                        새 글 작성
                    </Button>
                </div>
            </div>

            <div className="text-[13px] text-[#1a1a1a]/40 mb-4">
                총 {posts.length}개의 글
            </div>

            <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
                <BlogPostTable
                    posts={posts}
                    onEdit={handleEdit}
                    onDelete={setDeleteTarget}
                    onToggleFeatured={handleToggleFeatured}
                />
            </div>

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

            <DeleteConfirmDialog
                post={deleteTarget}
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                loading={formLoading}
            />
        </div>
    )
}
