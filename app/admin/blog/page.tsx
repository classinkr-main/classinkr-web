"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import AdminAuthGate from "@/components/admin/AdminAuthGate"
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
    const [isAuthed, setIsAuthed] = useState(false)
    const [posts, setPosts] = useState<BlogPost[]>([])
    const [loading, setLoading] = useState(false)
    const [formLoading, setFormLoading] = useState(false)

    // Dialog states
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
        if (typeof window !== "undefined" && sessionStorage.getItem("admin_password")) {
            setIsAuthed(true)
        }
    }, [])

    useEffect(() => {
        if (isAuthed) fetchPosts()
    }, [isAuthed, fetchPosts])

    const handleAuth = () => {
        setIsAuthed(true)
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
                if (res.status === 401) {
                    sessionStorage.removeItem("admin_password")
                    setIsAuthed(false)
                    return
                }
            } else {
                const res = await adminFetch("/api/admin/blog", {
                    method: "POST",
                    body: JSON.stringify(data),
                })
                if (res.status === 401) {
                    sessionStorage.removeItem("admin_password")
                    setIsAuthed(false)
                    return
                }
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
            if (res.status === 401) {
                sessionStorage.removeItem("admin_password")
                setIsAuthed(false)
                return
            }
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

    if (!isAuthed) {
        return <AdminAuthGate onAuth={handleAuth} />
    }

    return (
        <div className="min-h-screen bg-[#FAFAF8]">
            <div className="max-w-[1100px] mx-auto px-6 pt-32 pb-20">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <p className="text-[12px] font-medium text-[#1a1a1a]/30 uppercase tracking-wide mb-1">Admin</p>
                        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">블로그 관리</h1>
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

                {/* Post count */}
                <div className="text-[13px] text-[#1a1a1a]/40 mb-4">
                    총 {posts.length}개의 글
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
                    <BlogPostTable
                        posts={posts}
                        onEdit={handleEdit}
                        onDelete={setDeleteTarget}
                        onToggleFeatured={handleToggleFeatured}
                    />
                </div>
            </div>

            {/* Create/Edit Dialog */}
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

            {/* Delete Confirm */}
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
