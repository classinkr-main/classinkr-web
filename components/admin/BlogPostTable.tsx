"use client"

import { Pencil, Trash2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { BlogPost } from "@/lib/blog-types"

interface BlogPostTableProps {
    posts: BlogPost[]
    onEdit: (post: BlogPost) => void
    onDelete: (post: BlogPost) => void
    onToggleFeatured: (post: BlogPost) => void
}

export default function BlogPostTable({ posts, onEdit, onDelete, onToggleFeatured }: BlogPostTableProps) {
    if (posts.length === 0) {
        return (
            <div className="py-20 text-center text-[#1a1a1a]/30 text-sm">
                등록된 블로그 글이 없습니다.
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
                        <th className="py-3 px-3 font-medium hidden md:table-cell">날짜</th>
                        <th className="py-3 px-3 font-medium hidden lg:table-cell">작성자</th>
                        <th className="py-3 px-3 font-medium w-24 text-right">관리</th>
                    </tr>
                </thead>
                <tbody>
                    {posts.map((post) => (
                        <tr key={post.id} className="border-b border-[#f0f0ec] hover:bg-[#f8f8f6] transition-colors">
                            <td className="py-3 px-3 text-[#1a1a1a]/30">{post.id}</td>
                            <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-[#111110] line-clamp-1">{post.title}</span>
                                    {post.featured && (
                                        <Badge variant="secondary" className="text-[10px] shrink-0">주요</Badge>
                                    )}
                                </div>
                            </td>
                            <td className="py-3 px-3 text-[#1a1a1a]/50 hidden md:table-cell">{post.category}</td>
                            <td className="py-3 px-3 text-[#1a1a1a]/40 hidden md:table-cell">{post.date}</td>
                            <td className="py-3 px-3 text-[#1a1a1a]/40 hidden lg:table-cell">{post.author}</td>
                            <td className="py-3 px-3">
                                <div className="flex items-center justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onToggleFeatured(post)}
                                        title={post.featured ? "주요 글 해제" : "주요 글 설정"}
                                    >
                                        <Star className={`w-4 h-4 ${post.featured ? "fill-yellow-400 text-yellow-400" : "text-[#1a1a1a]/20"}`} />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onEdit(post)}
                                        title="수정"
                                    >
                                        <Pencil className="w-4 h-4 text-[#1a1a1a]/40" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onDelete(post)}
                                        title="삭제"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-400" />
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
