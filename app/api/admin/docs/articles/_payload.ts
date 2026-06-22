import type {
  DocsArticleDifficulty,
  DocsArticleDocType,
  DocsArticlePatchInput,
  DocsArticleProductArea,
  DocsArticleStatus,
  DocsArticleVisibility,
} from "@/lib/repositories/docs-articles"
import { validatePublicMarkdownContent } from "@/lib/admin/public-content-validation"

const ALLOWED_STATUS: DocsArticleStatus[] = ["draft", "review", "published", "archived"]
const ALLOWED_VISIBILITY: DocsArticleVisibility[] = ["public", "unlisted", "internal"]
const ALLOWED_DOC_TYPE: DocsArticleDocType[] = [
  "guide",
  "manual",
  "faq",
  "troubleshooting",
  "release_note",
  "reference",
]
const ALLOWED_PRODUCT_AREA: DocsArticleProductArea[] = [
  "general",
  "software",
  "hardware",
  "billing",
  "onboarding",
  "classroom",
  "admin",
  "partner",
]
const ALLOWED_DIFFICULTY: DocsArticleDifficulty[] = ["beginner", "intermediate", "advanced"]

function pickEnum<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : undefined
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const filtered = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(filtered))
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function pickNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return pickString(value)
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function pickJson(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

export function normalizeDocsArticlePatchPayload(
  payload: Record<string, unknown>
): DocsArticlePatchInput {
  const patch: DocsArticlePatchInput = {}

  if ("categoryId" in payload) patch.categoryId = pickString(payload.categoryId)
  if ("slug" in payload) patch.slug = pickString(payload.slug)
  if ("title" in payload) patch.title = pickString(payload.title)
  if ("description" in payload) patch.description = pickString(payload.description)
  if ("audience" in payload) patch.audience = pickStringArray(payload.audience)
  if ("productArea" in payload) patch.productArea = pickEnum(payload.productArea, ALLOWED_PRODUCT_AREA)
  if ("docType" in payload) patch.docType = pickEnum(payload.docType, ALLOWED_DOC_TYPE)
  if ("difficulty" in payload) patch.difficulty = pickEnum(payload.difficulty, ALLOWED_DIFFICULTY)
  if ("status" in payload) patch.status = pickEnum(payload.status, ALLOWED_STATUS)
  if ("visibility" in payload) patch.visibility = pickEnum(payload.visibility, ALLOWED_VISIBILITY)
  if ("noindex" in payload) patch.noindex = pickBoolean(payload.noindex)
  if ("featured" in payload) patch.featured = pickBoolean(payload.featured)
  if ("orderIndex" in payload) patch.orderIndex = pickNumber(payload.orderIndex)
  if ("tags" in payload) patch.tags = pickStringArray(payload.tags)
  if ("keywords" in payload) patch.keywords = pickStringArray(payload.keywords)
  if ("symptoms" in payload) patch.symptoms = pickStringArray(payload.symptoms)
  if ("chatbotSummary" in payload) {
    patch.chatbotSummary = payload.chatbotSummary === null ? null : pickString(payload.chatbotSummary) ?? null
  }
  if ("contentMarkdown" in payload) patch.contentMarkdown = pickString(payload.contentMarkdown)
  if ("contentJson" in payload) patch.contentJson = pickJson(payload.contentJson)
  if ("seoTitle" in payload) {
    patch.seoTitle = payload.seoTitle === null ? null : pickString(payload.seoTitle) ?? null
  }
  if ("seoDescription" in payload) {
    patch.seoDescription =
      payload.seoDescription === null ? null : pickString(payload.seoDescription) ?? null
  }
  if ("publishedAt" in payload) {
    patch.publishedAt = pickNullableString(payload.publishedAt) ?? null
  }

  return patch
}

export function validateDocsArticlePatchForPublish(
  patch: DocsArticlePatchInput,
  fallback: {
    categoryId: string
    slug: string
    title: string
    description: string
    status: DocsArticleStatus
    contentMarkdown: string
  }
): string | null {
  const title = patch.title ?? fallback.title
  const description = patch.description ?? fallback.description
  const slug = patch.slug ?? fallback.slug
  const categoryId = patch.categoryId ?? fallback.categoryId
  const status = patch.status ?? fallback.status
  const contentMarkdown = patch.contentMarkdown ?? fallback.contentMarkdown
  const contentError = validateDocsArticlePatchContent(patch)

  if (!title.trim()) return "제목은 필수입니다."
  if (!description.trim()) return "설명은 필수입니다."
  if (!slug.trim()) return "slug는 필수입니다."
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "slug는 소문자·숫자·하이픈만 허용합니다."
  }
  if (!categoryId) return "카테고리를 선택하세요."
  if (status === "published" && !contentMarkdown.trim()) return "게시 문서는 본문이 필요합니다."
  if (contentError) return contentError

  return null
}

export function validateDocsArticlePatchContent(patch: DocsArticlePatchInput): string | null {
  return validatePublicMarkdownContent(patch.contentMarkdown)
}
