import fs from "fs"
import path from "path"

export type { BlogPost, BlogPostCTA, BlogPostInput, BlogPostStatus } from "./blog-types"
export {
  BLOG_STATUS_OPTIONS,
  CATEGORIES,
  DEFAULT_BLOG_CTA,
} from "./blog-types"

import type { BlogPost, BlogPostInput } from "./blog-types"
import { DEFAULT_BLOG_CTA } from "./blog-types"
import { estimateReadTime, slugify } from "./blog-markdown"

const DATA_PATH = path.join(process.cwd(), "data", "blog-posts.json")

type RawBlogPost = Partial<BlogPost> & {
  tag?: string
  tags?: string[] | string
  imageUrl?: string
  heroImageUrl?: string
  thumbnailAlt?: string
  heroImageAlt?: string
  authorBio?: string
  benefitItems?: string[]
  contentMarkdown?: string
  seoTitle?: string
  seoDescription?: string
  relatedPostIds?: number[]
  status?: BlogPost["status"]
  cta?: BlogPost["cta"]
}

function readRawPosts(): RawBlogPost[] {
  const raw = fs.readFileSync(DATA_PATH, "utf-8")
  return JSON.parse(raw) as RawBlogPost[]
}

function writePosts(posts: BlogPost[]): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(posts, null, 2), "utf-8")
}

function formatToday(): string {
  return new Date()
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\./g, ". ")
    .trim()
}

function normalizeTags(tags?: string[] | string, fallback?: string): string[] {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean)
  }

  if (typeof tags === "string" && tags.trim()) {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  if (fallback?.trim()) {
    return [fallback.trim()]
  }

  return []
}

function ensureUniqueSlug(baseSlug: string, usedSlugs: Set<string>, fallbackId?: number) {
  const safeBase = baseSlug || (fallbackId ? `post-${fallbackId}` : "untitled-post")
  let candidate = safeBase
  let index = 2

  while (usedSlugs.has(candidate)) {
    candidate = `${safeBase}-${index}`
    index += 1
  }

  usedSlugs.add(candidate)
  return candidate
}

function getDefaultBenefits(title: string, excerpt: string): string[] {
  const cleanedExcerpt = excerpt.trim()
  return [
    cleanedExcerpt || `${title}의 핵심 포인트를 빠르게 파악할 수 있습니다.`,
    "현장에서 바로 적용할 수 있는 실무 포인트를 정리할 수 있습니다.",
    "다음 액션을 분명하게 잡을 수 있습니다.",
  ]
}

function getDefaultMarkdown(title: string, excerpt: string, author: string) {
  return [
    `## 왜 이 이야기가 중요한가`,
    "",
    excerpt.trim() || `${title}에 대한 핵심 배경을 정리합니다.`,
    "",
    "## 현장에서 먼저 볼 포인트",
    "",
    "- 지금 상황에서 가장 먼저 점검해야 할 지점을 확인합니다.",
    "- 바로 실행 가능한 체크포인트를 짚어봅니다.",
    "- 다음 단계로 연결되는 운영 포인트를 정리합니다.",
    "",
    "## 팀에 바로 적용하는 방법",
    "",
    `${author || "Classin 팀"}이 현장에서 정리한 관점으로, 실행 순서를 단순하게 가져갈 수 있도록 구성했습니다.`,
    "",
    "> 핵심은 복잡한 기능을 늘리는 것이 아니라, 운영자가 바로 움직일 수 있는 흐름을 만드는 것입니다.",
  ].join("\n")
}

function normalizePost(raw: RawBlogPost, usedSlugs: Set<string>): BlogPost {
  const title = raw.title?.trim() || "제목 없는 글"
  const excerpt = raw.excerpt?.trim() || "요약이 아직 입력되지 않았습니다."
  const tags = normalizeTags(raw.tags, raw.tag)
  const imageUrl = raw.imageUrl?.trim() || raw.heroImageUrl?.trim() || "/images/blog/thumb-01.png"
  const heroImageUrl = raw.heroImageUrl?.trim() || imageUrl
  const contentMarkdown = raw.contentMarkdown?.trim() || getDefaultMarkdown(title, excerpt, raw.author?.trim() || "Classin")
  const computedReadTime = estimateReadTime(contentMarkdown)

  return {
    id: typeof raw.id === "number" ? raw.id : 0,
    slug: ensureUniqueSlug(slugify(raw.slug?.trim() || title), usedSlugs, raw.id),
    title,
    excerpt,
    category: raw.category?.trim() || "인사이트",
    tags,
    tag: raw.tag?.trim() || tags[0] || "",
    date: raw.date?.trim() || formatToday(),
    publishedAt: raw.publishedAt,
    updatedAt: raw.updatedAt,
    author: raw.author?.trim() || "Classin 팀",
    authorRole: raw.authorRole?.trim() || "에디터",
    authorBio:
      raw.authorBio?.trim() ||
      `${raw.author?.trim() || "Classin 팀"}은 교육 운영과 전환 경험을 글로 정리합니다.`,
    authorAvatarUrl: raw.authorAvatarUrl?.trim(),
    readTime: raw.readTime?.trim() || computedReadTime,
    imageUrl,
    thumbnailAlt: raw.thumbnailAlt?.trim() || `${title} 썸네일`,
    heroImageUrl,
    heroImageAlt: raw.heroImageAlt?.trim() || `${title} 배너 이미지`,
    featured: raw.featured ?? false,
    benefitItems:
      raw.benefitItems?.filter((item) => item.trim()).slice(0, 3) || getDefaultBenefits(title, excerpt),
    targetReader: raw.targetReader?.trim() || "",
    contentMarkdown,
    seoTitle: raw.seoTitle?.trim() || title,
    seoDescription: raw.seoDescription?.trim() || excerpt,
    relatedPostIds: Array.isArray(raw.relatedPostIds) ? raw.relatedPostIds : [],
    cta: {
      eyebrow: raw.cta?.eyebrow?.trim() || DEFAULT_BLOG_CTA.eyebrow,
      title: raw.cta?.title?.trim() || DEFAULT_BLOG_CTA.title,
      description: raw.cta?.description?.trim() || DEFAULT_BLOG_CTA.description,
      buttonLabel: raw.cta?.buttonLabel?.trim() || DEFAULT_BLOG_CTA.buttonLabel,
      buttonHref: raw.cta?.buttonHref?.trim() || DEFAULT_BLOG_CTA.buttonHref,
    },
    status: raw.status || "published",
  }
}

function normalizeInput(data: Partial<BlogPostInput>, existingId?: number): BlogPostInput {
  const normalized = normalizePost({ id: existingId ?? 0, ...data }, new Set())
  const { id: _id, ...post } = normalized
  return post
}

function readPosts(): BlogPost[] {
  const usedSlugs = new Set<string>()
  return readRawPosts().map((post) => normalizePost(post, usedSlugs))
}

export function createEmptyPost(): BlogPostInput {
  const today = formatToday()
  const emptyMarkdown = [
    "## 문제",
    "",
    "지금 독자가 겪는 문제를 한 문단으로 정리해보세요.",
    "",
    "## 핵심 인사이트",
    "",
    "- 바로 실행할 수 있는 포인트를 정리합니다.",
    "- 데이터나 사례를 한두 개 넣어보세요.",
    "",
    "## 다음 액션",
    "",
    "글을 읽은 뒤 독자가 어떤 행동을 해야 하는지 적어보세요.",
  ].join("\n")

  return {
    slug: "",
    title: "",
    excerpt: "",
    category: "인사이트",
    tags: [],
    tag: "",
    date: today,
    author: "",
    authorRole: "",
    authorBio: "",
    authorAvatarUrl: "",
    readTime: estimateReadTime(emptyMarkdown),
    imageUrl: "",
    thumbnailAlt: "",
    heroImageUrl: "",
    heroImageAlt: "",
    featured: false,
    benefitItems: ["", "", ""],
    targetReader: "",
    contentMarkdown: emptyMarkdown,
    seoTitle: "",
    seoDescription: "",
    relatedPostIds: [],
    cta: { ...DEFAULT_BLOG_CTA },
    status: "draft",
  }
}

export async function getAllPosts(): Promise<BlogPost[]> {
  return readPosts()
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  return readPosts().filter((post) => post.status === "published")
}

export async function getPostById(id: number): Promise<BlogPost | undefined> {
  return readPosts().find((post) => post.id === id)
}

export async function getPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = readPosts()
  return posts.find((post) => post.slug === slug || String(post.id) === slug)
}

export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getPublishedPosts()
  return posts.find((post) => post.slug === slug || String(post.id) === slug)
}

export async function getRelatedPosts(post: BlogPost, limit = 3): Promise<BlogPost[]> {
  const posts = await getPublishedPosts()
  const selectedByIds = posts.filter(
    (candidate) => candidate.id !== post.id && post.relatedPostIds.includes(candidate.id)
  )

  const fallback = posts.filter(
    (candidate) => candidate.id !== post.id && candidate.category === post.category
  )

  return [...selectedByIds, ...fallback]
    .filter((candidate, index, array) => array.findIndex((item) => item.id === candidate.id) === index)
    .slice(0, limit)
}

export async function createPost(data: Partial<BlogPostInput>): Promise<BlogPost> {
  const posts = readPosts()
  const maxId = posts.length > 0 ? Math.max(...posts.map((post) => post.id)) : 0
  const usedSlugs = new Set(posts.map((post) => post.slug))
  const normalized = normalizeInput(data, maxId + 1)
  const nextPost: BlogPost = {
    id: maxId + 1,
    ...normalized,
    slug: ensureUniqueSlug(slugify(normalized.slug || normalized.title), usedSlugs, maxId + 1),
    updatedAt: new Date().toISOString(),
    date: normalized.status === "published" ? normalized.date || formatToday() : normalized.date,
  }

  posts.unshift(nextPost)
  writePosts(posts)
  return nextPost
}

export async function updatePost(id: number, data: Partial<BlogPostInput>): Promise<BlogPost | null> {
  const posts = readPosts()
  const index = posts.findIndex((post) => post.id === id)
  if (index === -1) return null

  const usedSlugs = new Set(posts.filter((post) => post.id !== id).map((post) => post.slug))
  const normalized = normalizeInput({ ...posts[index], ...data }, id)
  posts[index] = {
    id,
    ...normalized,
    slug: ensureUniqueSlug(slugify(normalized.slug || normalized.title), usedSlugs, id),
    updatedAt: new Date().toISOString(),
  }

  writePosts(posts)
  return posts[index]
}

export async function deletePost(id: number): Promise<boolean> {
  const posts = readPosts()
  const filtered = posts.filter((post) => post.id !== id)
  if (filtered.length === posts.length) return false
  writePosts(filtered)
  return true
}
