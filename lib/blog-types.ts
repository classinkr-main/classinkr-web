export type BlogPostStatus = "draft" | "review" | "published" | "archived"

export interface BlogPostCTA {
  eyebrow: string
  title: string
  description: string
  buttonLabel: string
  buttonHref: string
}

export interface BlogPost {
  id: number
  slug: string
  title: string
  excerpt: string
  category: string
  tags: string[]
  tag: string
  date: string
  publishedAt?: string
  updatedAt?: string
  author: string
  authorRole: string
  authorBio: string
  authorAvatarUrl?: string
  readTime: string
  imageUrl: string
  thumbnailAlt: string
  heroImageUrl: string
  heroImageAlt: string
  featured?: boolean
  benefitItems: string[]
  targetReader?: string
  contentMarkdown: string
  seoTitle: string
  seoDescription: string
  relatedPostIds: number[]
  cta: BlogPostCTA
  status: BlogPostStatus
}

export type BlogPostInput = Omit<BlogPost, "id">

export const CATEGORIES = [
  "전체",
  "인사이트",
  "제품 업데이트",
  "성공 사례",
  "교육 트렌드",
  "데이터 분석",
  "원장 인터뷰",
] as const

export const BLOG_STATUS_OPTIONS: BlogPostStatus[] = [
  "draft",
  "review",
  "published",
  "archived",
]

export const DEFAULT_BLOG_CTA: BlogPostCTA = {
  eyebrow: "Classin",
  title: "운영 전환이 필요한 순간이라면 Classin과 함께 정리해보세요.",
  description: "현장에 맞는 운영 플로우와 상담 전환 구조를 빠르게 설계할 수 있습니다.",
  buttonLabel: "문의하기",
  buttonHref: "/contact",
}
