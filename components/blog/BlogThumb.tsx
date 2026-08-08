"use client"

import { createElement } from "react"

import { SafeBlogImage } from "@/components/blog/SafeBlogImage"
import { getCategoryIcon } from "@/lib/blog-categories"
import { sanitizePublicImageUrl } from "@/lib/safe-public-url"

interface BlogThumbProps {
  src: string | null | undefined
  alt: string
  category: string
  sizes: string
  /** 폴백 스톡 썸네일 12장 중 하나를 고르는 결정 인덱스(런타임 404 시에만 쓰인다). */
  fallbackIndex: number
  priority?: boolean
  /** dark: 스크림이 덮이는 갤러리 카드용. light: 목록 썸네일용. */
  tone?: "light" | "dark"
  className?: string
}

/**
 * 이미지가 아예 없는 글은 무관한 스톡 사진 대신 카테고리 마크를 세운다.
 * 기존 폴백은 `post.id % 12`로 고른 스톡 12장이라 글 내용과 아무 관계가 없었다 —
 * 마크는 최소한 "이 글이 무엇인지"를 말한다.
 * (src가 있는데 런타임에 404 나는 경우는 SafeBlogImage의 스톡 폴백이 계속 받는다.)
 */
export function BlogThumb({
  src,
  alt,
  category,
  sizes,
  fallbackIndex,
  priority = false,
  tone = "light",
  className = "object-cover",
}: BlogThumbProps) {
  const hasImage = Boolean(sanitizePublicImageUrl(src, ""))

  if (hasImage) {
    return (
      <SafeBlogImage
        src={src}
        alt={alt}
        fill
        priority={priority}
        fetchPriority={priority ? "high" : undefined}
        sizes={sizes}
        className={className}
        fallbackIndex={fallbackIndex}
      />
    )
  }

  // getCategoryIcon은 모듈 스코프 맵의 고정 참조를 돌려준다(렌더마다 새로 만들지 않는다).
  // 대문자 지역변수로 받으면 lint가 "렌더 중 컴포넌트 생성"으로 오인하므로 createElement로 쓴다.
  return (
    <div
      role="img"
      aria-label={`${category} 카테고리 글`}
      className={`flex h-full w-full items-center justify-center ${
        tone === "dark" ? "bg-[#084734]" : "bg-[#ECFDF5]"
      }`}
    >
      {/* 상한을 슬롯 크기에 맞춰 나눈다 — 갤러리 카드(최대 730px)에 64px 상한을 걸면 마크가 붕 뜬다. */}
      {createElement(getCategoryIcon(category), {
        "aria-hidden": true,
        strokeWidth: 1.25,
        className: `h-[34%] w-[34%] ${
          tone === "dark"
            ? "max-h-28 max-w-28 text-white/25"
            : "max-h-14 max-w-14 text-[#084734]/30"
        }`,
      })}
    </div>
  )
}
