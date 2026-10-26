import { createElement } from "react"
import Link from "next/link"

import { BlogThumb } from "@/components/blog/BlogThumb"
import { getCategoryIcon } from "@/lib/blog-categories"
import type { BlogPost } from "@/lib/blog-types"

type BlogPostCardPost = Pick<
  BlogPost,
  "id" | "slug" | "title" | "excerpt" | "category" | "date" | "imageUrl" | "thumbnailAlt"
>

interface BlogPostCardProps {
  post: BlogPostCardPost
  sizes: string
}

/**
 * 목록 그리드와 상세 하단 추천 글이 같이 쓰는 카드.
 * 썸네일 대부분이 큰 글자가 박힌 카드 이미지라, 제목은 이미지 위가 아니라 아래에 둔다.
 */
export function BlogPostCard({ post, sizes }: BlogPostCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-4 focus-visible:ring-offset-[#FAFAF8]"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#F0F0EC] ring-1 ring-black/[0.06]">
        <BlogThumb
          src={post.imageUrl}
          alt={post.thumbnailAlt || post.title}
          category={post.category}
          sizes={sizes}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          fallbackIndex={post.id}
        />
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-[#615D59]">
        {createElement(getCategoryIcon(post.category), {
          "aria-hidden": true,
          className: "h-3.5 w-3.5 text-[#A39E98] transition-colors group-hover:text-[#084734]",
        })}
        <span className="font-medium text-[#31302E]">{post.category}</span>
        <span aria-hidden className="text-[#A39E98]">·</span>
        <span>{post.date}</span>
      </p>
      <h3 className="mt-2 line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-[#111110] transition-colors group-hover:text-[#084734]">
        {post.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-[#615D59]">{post.excerpt}</p>
    </Link>
  )
}
