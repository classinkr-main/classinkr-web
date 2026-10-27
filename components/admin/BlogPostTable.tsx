"use client"

import { Copy, Pencil, Trash2, Star, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BlogThumb } from "@/components/blog/BlogThumb"
import type { BlogPost, BlogPostStatus } from "@/lib/blog-types"

interface BlogPostTableProps {
    posts: BlogPost[]
    onEdit: (post: BlogPost) => void
    onDelete: (post: BlogPost) => void
    onDuplicate: (post: BlogPost) => void
    onToggleFeatured: (post: BlogPost) => void
    onTogglePublished: (post: BlogPost) => void
    /** 라벨을 누르면 그 라벨로 목록을 거른다. */
    onLabelClick?: (label: string) => void
    emptyMessage?: string
}

const STATUS_LABEL: Record<BlogPostStatus, string> = {
    published: "공개",
    draft: "초안",
    review: "검토 중",
    archived: "보관",
}

export default function BlogPostTable({
    posts,
    onEdit,
    onDelete,
    onDuplicate,
    onToggleFeatured,
    onTogglePublished,
    onLabelClick,
    emptyMessage = "등록된 블로그 글이 없습니다.",
}: BlogPostTableProps) {
    if (posts.length === 0) {
        return (
            <div className="py-20 text-center text-[#1a1a1a]/30 text-sm">
                {emptyMessage}
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-[#e8e8e4] text-left text-[#1a1a1a]/40">
                        <th className="py-3 pl-3 pr-1 font-medium w-[68px]"><span className="sr-only">썸네일</span></th>
                        <th className="py-3 px-3 font-medium">제목 · 라벨</th>
                        <th className="py-3 px-3 font-medium whitespace-nowrap hidden md:table-cell">카테고리</th>
                        <th className="py-3 px-3 font-medium whitespace-nowrap hidden md:table-cell">날짜</th>
                        <th className="py-3 px-3 font-medium whitespace-nowrap hidden xl:table-cell">작성자</th>
                        <th className="py-3 px-3 font-medium w-36 text-right">관리</th>
                    </tr>
                </thead>
                <tbody>
                    {posts.map((post) => {
                        const isPublished = post.status === "published"
                        const labels = post.tags.filter(Boolean).slice(0, 3)
                        return (
                            <tr
                                key={post.id}
                                className="border-b border-[#f0f0ec] hover:bg-[#f8f8f6] transition-colors cursor-pointer"
                                onClick={() => onEdit(post)}
                            >
                                <td className="py-2.5 pl-3 pr-1 align-top">
                                    <div className={`relative h-10 w-14 overflow-hidden rounded-md bg-[#F0F0EC] ring-1 ring-black/[0.06] ${isPublished ? "" : "opacity-50"}`}>
                                        <BlogThumb
                                            src={post.imageUrl}
                                            alt=""
                                            category={post.category}
                                            sizes="56px"
                                            fallbackIndex={post.id}
                                        />
                                    </div>
                                </td>
                                <td className="py-2.5 px-3 align-top">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-medium line-clamp-1 ${isPublished ? "text-[#111110]" : "text-[#1a1a1a]/45"}`}>
                                            {post.title}
                                        </span>
                                        {post.featured && (
                                            <span className="shrink-0 rounded border border-[#A8741A]/40 px-1.5 py-px text-[10px] font-semibold text-[#A8741A]">주요</span>
                                        )}
                                        {!isPublished && (
                                            <span className="shrink-0 rounded border border-[#1a1a1a]/20 px-1.5 py-px text-[10px] font-semibold text-[#1a1a1a]/50">
                                                {STATUS_LABEL[post.status] ?? "비공개"}
                                            </span>
                                        )}
                                    </div>
                                    {labels.length > 0 ? (
                                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                            {labels.map((label) =>
                                                onLabelClick ? (
                                                    <button
                                                        key={label}
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); onLabelClick(label) }}
                                                        title={`'${label}' 라벨로 거르기`}
                                                        className="text-[11.5px] text-[#1a1a1a]/40 transition-colors hover:text-[#084734] hover:underline"
                                                    >
                                                        #{label}
                                                    </button>
                                                ) : (
                                                    <span key={label} className="text-[11.5px] text-[#1a1a1a]/40">#{label}</span>
                                                )
                                            )}
                                        </div>
                                    ) : null}
                                </td>
                                <td className="py-2.5 px-3 align-top whitespace-nowrap text-[#1a1a1a]/50 hidden md:table-cell">{post.category}</td>
                                <td className="py-2.5 px-3 align-top whitespace-nowrap tabular-nums text-[#1a1a1a]/40 hidden md:table-cell">{post.date}</td>
                                <td className="py-2.5 px-3 align-top whitespace-nowrap text-[#1a1a1a]/40 hidden xl:table-cell">{post.author}</td>
                                <td className="py-2.5 px-3 align-top">
                                    <div className="flex items-center justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => { e.stopPropagation(); onTogglePublished(post) }}
                                            title={isPublished ? "비공개로 전환" : "공개로 전환"}
                                            className="active:scale-90 transition-transform duration-75"
                                        >
                                            {isPublished
                                                ? <Eye className="w-4 h-4 text-[#084734]" />
                                                : <EyeOff className="w-4 h-4 text-[#1a1a1a]/25" />
                                            }
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => { e.stopPropagation(); onToggleFeatured(post) }}
                                            title={post.featured ? "주요 글 해제" : "주요 글 설정"}
                                            className="active:scale-90 transition-transform duration-75"
                                        >
                                            <Star className={`w-4 h-4 ${post.featured ? "fill-yellow-400 text-yellow-400" : "text-[#1a1a1a]/20"}`} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => { e.stopPropagation(); onDuplicate(post) }}
                                            title="글 복제"
                                            className="active:scale-90 transition-transform duration-75"
                                        >
                                            <Copy className="w-4 h-4 text-[#1a1a1a]/30" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => { e.stopPropagation(); onEdit(post) }}
                                            title="수정"
                                            className="active:scale-90 transition-transform duration-75"
                                        >
                                            <Pencil className="w-4 h-4 text-[#1a1a1a]/40" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => { e.stopPropagation(); onDelete(post) }}
                                            title="휴지통으로 이동"
                                            className="active:scale-90 transition-transform duration-75"
                                        >
                                            <Trash2 className="w-4 h-4 text-[#B85C33]" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
