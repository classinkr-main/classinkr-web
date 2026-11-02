export type BlogPostStatus = "draft" | "review" | "published" | "archived"

/**
 * AI 스트림 중간 실패 신호. 스트림은 이미 200 으로 시작돼 상태 코드를 못 바꾸므로, 이 표식 뒤에
 * 오류 메시지를 붙여 보낸다. 편집기는 표식을 보면 결과를 버리고 오류로 처리한다(본문에 섞지 않는다).
 */
export const BLOG_AI_STREAM_ERROR_MARKER = "\u0000[AI_STREAM_ERROR]"

export interface BlogPostCTA {
  eyebrow: string
  title: string
  description: string
  buttonLabel: string
  buttonHref: string
}

export const DEFAULT_BLOG_CTA: BlogPostCTA = {
  eyebrow: "도입 문의",
  title: "우리 학원에 맞는 플랜이 궁금하다면?",
  description: "수업 만족도를 높이는 가장 빠른 방법, 지금 컨설팅을 받아보세요.",
  buttonLabel: "무료 상담 신청하기",
  buttonHref: "/contact#contact-form",
}

export const BLOG_STATUS_OPTIONS: { label: string; value: BlogPostStatus }[] = [
  { label: "초안 (Draft)", value: "draft" },
  { label: "검수 (In Review)", value: "review" },
  { label: "발행됨 (Published)", value: "published" },
  { label: "보관됨 (Archived)", value: "archived" },
]

export interface BlogPost {
  id: number
  _uuid?: string
  slug: string
  title: string
  excerpt: string
  category: string
  tags: string[]
  tag: string
  date: string
  publishedAt?: string
  /** 내부용 — 대표 글·공개 토글 같은 모든 UPDATE 에 바뀐다. 공개 날짜 신호에는 resolveBlogContentModifiedAt 을 쓴다. */
  updatedAt?: string
  /**
   * 글 내용(제목·요약·본문·SEO·대표 이미지 등)이 실제로 바뀐 시각 — blog_posts.content_updated_at.
   * 마이그레이션(20261028_blog_posts_content_updated_at.sql) 미적용 DB 나 목록 조회에서는 비어 있다.
   */
  contentUpdatedAt?: string
  /**
   * 사이트맵·RSS 조회 경로(getPublishedPostsForStaticSitemap)와 공개 상세(getPublishedPostBySlug)에서만 채운다.
   * publishedAt 이 없는 레거시 글의 pubDate·datePublished 폴백용.
   */
  createdAt?: string
  author: string
  authorRole: string
  authorBio: string
  authorAvatarUrl?: string
  readTime: string
  imageUrl: string
  thumbnailAlt: string
  heroImageUrl: string
  heroImageAlt: string
  featured: boolean
  benefitItems: string[]
  targetReader: string
  contentMarkdown: string
  seoTitle: string
  seoDescription: string
  relatedPostIds: number[]
  /** 글 하단 게이트 블록으로 노출할 리드 마그넷 slug (lib/lead-magnets.ts) */
  leadMagnetSlug?: string
  pageLayout: "standard" | "minimal"
  cta: BlogPostCTA
  status: BlogPostStatus
  published?: boolean
  deletedAt?: string
}

export type BlogPostInput = Omit<BlogPost, "id">

export const CATEGORIES = [
  "전체", "인사이트", "제품", "성공 사례",
  "교육 트렌드", "데이터 분석", "원장 인터뷰",
] as const

// 2026-10-26 "제품 업데이트" → "제품"으로 개명. DB에 남은 옛 값(배포 전 저장분 포함)도 같은 칩에 모은다.
export function normalizeBlogCategory(category: string | null | undefined): string | null {
  return category === "제품 업데이트" ? "제품" : category ?? null
}

type BlogDateFields = Pick<BlogPost, "contentUpdatedAt" | "updatedAt" | "publishedAt" | "createdAt">

function latestIsoDate(values: Array<string | undefined>): string | undefined {
  let latest: { value: string; time: number } | undefined
  for (const value of values) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (!Number.isFinite(time)) continue
    if (!latest || time > latest.time) latest = { value, time }
  }
  return latest?.value
}

/**
 * 공개 표면(JSON-LD datePublished)의 발행 시각. 목록·상세 화면 날짜(resolveDisplayDateSource)와 같은 규칙이다.
 */
export function resolveBlogPublishedAt(post: Pick<BlogPost, "publishedAt" | "createdAt">): string | undefined {
  return post.publishedAt || post.createdAt || undefined
}

/**
 * 공개 표면(사이트맵 lastmod·JSON-LD dateModified·RSS lastBuildDate)이 쓰는 "글이 마지막으로 바뀐 시각".
 *
 * 우선순위: contentUpdatedAt → (마이그레이션 미적용 폴백) updatedAt → publishedAt → createdAt.
 * 단 발행 시각보다 앞서지 않게 publishedAt 과 비교해 늦은 쪽을 쓴다 — 초안에서 마지막으로 고친 뒤
 * 며칠 뒤 발행(예약 발행 포함)한 글이 dateModified < datePublished 로 나가지 않게 한다.
 */
export function resolveBlogContentModifiedAt(post: BlogDateFields): string | undefined {
  const modified = post.contentUpdatedAt || post.updatedAt || undefined
  return latestIsoDate([modified, post.publishedAt]) ?? (post.createdAt || undefined)
}
