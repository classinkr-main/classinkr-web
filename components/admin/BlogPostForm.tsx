"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BlogPost } from "@/lib/blog-types"
import { CATEGORIES } from "@/lib/blog-types"

const EDITABLE_CATEGORIES = CATEGORIES.filter((c) => c !== "전체")

interface BlogPostFormProps {
    post?: BlogPost
    onSave: (data: Omit<BlogPost, "id">) => void
    onCancel: () => void
    loading?: boolean
}

export default function BlogPostForm({ post, onSave, onCancel, loading }: BlogPostFormProps) {
    const [form, setForm] = useState({
        title: post?.title ?? "",
        excerpt: post?.excerpt ?? "",
        category: post?.category ?? EDITABLE_CATEGORIES[0],
        tag: post?.tag ?? "",
        date: post?.date ?? new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\./g, ". ").trim(),
        author: post?.author ?? "",
        authorRole: post?.authorRole ?? "",
        readTime: post?.readTime ?? "",
        imageUrl: post?.imageUrl ?? "",
        featured: post?.featured ?? false,
        published: post?.published ?? true,
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(form)
    }

    const update = (field: string, value: string | boolean) => {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-2">
                <Label htmlFor="title">제목 *</Label>
                <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="블로그 글 제목"
                    required
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="excerpt">요약 *</Label>
                <textarea
                    id="excerpt"
                    value={form.excerpt}
                    onChange={(e) => update("excerpt", e.target.value)}
                    placeholder="글 요약 (2-3문장)"
                    required
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="category">카테고리 *</Label>
                    <select
                        id="category"
                        value={form.category}
                        onChange={(e) => update("category", e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        {EDITABLE_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="tag">태그</Label>
                    <Input
                        id="tag"
                        value={form.tag}
                        onChange={(e) => update("tag", e.target.value)}
                        placeholder="Deep Dive, Guide..."
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="date">날짜</Label>
                    <Input
                        id="date"
                        value={form.date}
                        onChange={(e) => update("date", e.target.value)}
                        placeholder="2024. 11. 15"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="readTime">읽기 시간</Label>
                    <Input
                        id="readTime"
                        value={form.readTime}
                        onChange={(e) => update("readTime", e.target.value)}
                        placeholder="5분"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="author">작성자</Label>
                    <Input
                        id="author"
                        value={form.author}
                        onChange={(e) => update("author", e.target.value)}
                        placeholder="홍길동"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="authorRole">직책</Label>
                    <Input
                        id="authorRole"
                        value={form.authorRole}
                        onChange={(e) => update("authorRole", e.target.value)}
                        placeholder="에디터"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="imageUrl">이미지 URL</Label>
                <Input
                    id="imageUrl"
                    value={form.imageUrl}
                    onChange={(e) => update("imageUrl", e.target.value)}
                    placeholder="/images/blog/thumb-01.png"
                />
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="featured"
                        checked={form.featured}
                        onChange={(e) => update("featured", e.target.checked)}
                        className="rounded border-input"
                    />
                    <Label htmlFor="featured" className="cursor-pointer">주요 글 (갤러리 표시)</Label>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="published"
                        checked={form.published}
                        onChange={(e) => update("published", e.target.checked)}
                        className="rounded border-input"
                    />
                    <Label htmlFor="published" className="cursor-pointer">공개</Label>
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    취소
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading ? "저장 중..." : post ? "수정" : "작성"}
                </Button>
            </div>
        </form>
    )
}
