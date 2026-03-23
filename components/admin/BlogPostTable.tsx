"use client"

import { Pencil, Star, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BlogPost } from "@/lib/blog-types"

interface BlogPostTableProps {
  posts: BlogPost[]
  onEdit: (post: BlogPost) => void
  onDelete: (post: BlogPost) => void
  onToggleFeatured: (post: BlogPost) => void
}

function getStatusBadgeVariant(status: BlogPost["status"]) {
  switch (status) {
    case "published":
      return "bg-emerald-50 text-emerald-700 border-emerald-100"
    case "review":
      return "bg-amber-50 text-amber-700 border-amber-100"
    case "archived":
      return "bg-[#f5f5f2] text-[#1a1a1a]/55 border-[#ecece7]"
    default:
      return "bg-slate-50 text-slate-600 border-slate-100"
  }
}

export default function BlogPostTable({
  posts,
  onEdit,
  onDelete,
  onToggleFeatured,
}: BlogPostTableProps) {
  if (posts.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-[#1a1a1a]/30">
        등록된 블로그 글이 없습니다.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e8e8e4] text-left text-[#1a1a1a]/40">
            <th className="w-12 px-3 py-3 font-medium">ID</th>
            <th className="px-3 py-3 font-medium">제목</th>
            <th className="hidden px-3 py-3 font-medium md:table-cell">상태</th>
            <th className="hidden px-3 py-3 font-medium md:table-cell">카테고리</th>
            <th className="hidden px-3 py-3 font-medium lg:table-cell">작성자</th>
            <th className="w-28 px-3 py-3 text-right font-medium">관리</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr
              key={post.id}
              className="border-b border-[#f0f0ec] transition-colors hover:bg-[#f8f8f6]"
            >
              <td className="px-3 py-4 text-[#1a1a1a]/30">{post.id}</td>
              <td className="px-3 py-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-1 font-medium text-[#111110]">
                      {post.title}
                    </span>
                    {post.featured && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                      >
                        Featured
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#1a1a1a]/35">
                    <span>/blog/{post.slug}</span>
                    <span>•</span>
                    <span>{post.readTime}</span>
                  </div>
                </div>
              </td>
              <td className="hidden px-3 py-4 md:table-cell">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusBadgeVariant(post.status)}`}
                >
                  {post.status}
                </span>
              </td>
              <td className="hidden px-3 py-4 text-[#1a1a1a]/50 md:table-cell">
                {post.category}
              </td>
              <td className="hidden px-3 py-4 text-[#1a1a1a]/40 lg:table-cell">
                {post.author}
              </td>
              <td className="px-3 py-4">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleFeatured(post)}
                    title={post.featured ? "Featured 해제" : "Featured 설정"}
                  >
                    <Star
                      className={`h-4 w-4 ${
                        post.featured
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-[#1a1a1a]/20"
                      }`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(post)}
                    title="수정"
                  >
                    <Pencil className="h-4 w-4 text-[#1a1a1a]/40" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(post)}
                    title="삭제"
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
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
