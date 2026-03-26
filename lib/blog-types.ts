export type BlogPostStatus = "draft" | "published" | "archived"

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
  buttonHref: "#demo",
}

export const BLOG_STATUS_OPTIONS: { label: string; value: BlogPostStatus }[] = [
  { label: "초안 (Draft)", value: "draft" },
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
  featured: boolean
  benefitItems: string[]
  targetReader: string
  contentMarkdown: string
  seoTitle: string
  seoDescription: string
  relatedPostIds: number[]
  cta: BlogPostCTA
  status: BlogPostStatus
  published?: boolean
  deletedAt?: string
}

export type BlogPostInput = Omit<BlogPost, "id">

export const CATEGORIES = [
  "전체", "인사이트", "제품 업데이트", "성공 사례",
  "교육 트렌드", "데이터 분석", "원장 인터뷰",
] as const
