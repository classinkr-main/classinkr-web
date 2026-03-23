"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import BlogPostTable from "@/components/admin/BlogPostTable"
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
  const [actionLoading, setActionLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null)

  const handleUnauthorized = useCallback(() => {
    router.replace("/admin/login")
  }, [router])

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminFetch("/api/admin/blog")
      if (response.status === 401) {
        handleUnauthorized()
        return
      }
      if (!response.ok) return
      const data = (await response.json()) as { posts: BlogPost[] }
      setPosts(data.posts)
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      const response = await adminFetch(`/api/admin/blog/${deleteTarget.id}`, {
        method: "DELETE",
      })
      if (response.status === 401) {
        handleUnauthorized()
        return
      }
      setDeleteTarget(null)
      await fetchPosts()
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleFeatured = async (post: BlogPost) => {
    setActionLoading(true)
    try {
      const response = await adminFetch(`/api/admin/blog/${post.id}`, {
        method: "PUT",
        body: JSON.stringify({ featured: !post.featured }),
      })
      if (response.status === 401) {
        handleUnauthorized()
        return
      }
      await fetchPosts()
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="px-8 pb-20 pt-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
              Admin
            </p>
            <a
              href="/admin/marketing"
              className="text-[11px] text-[#084734] hover:underline"
            >
              마케팅 관리
            </a>
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">
            콘텐츠 관리
          </h1>
          <p className="mt-2 text-[13px] text-[#1a1a1a]/40">
            상세 페이지와 연결되는 블로그 글을 작성하고 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPosts}
            disabled={loading || actionLoading}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
          <Button size="sm" onClick={() => router.push("/admin/blog/new")}>
            <Plus className="mr-1.5 h-4 w-4" />
            새 글 작성
          </Button>
        </div>
      </div>

      <div className="mb-4 text-[13px] text-[#1a1a1a]/40">
        총 {posts.length}개의 글
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
        <BlogPostTable
          posts={posts}
          onEdit={(post) => router.push(`/admin/blog/${post.id}/edit`)}
          onDelete={setDeleteTarget}
          onToggleFeatured={handleToggleFeatured}
        />
      </div>

      <DeleteConfirmDialog
        post={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={actionLoading}
      />
    </div>
  )
}
