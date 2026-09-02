import "server-only"

import { cache } from "react"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  docsCategories as staticDocsCategories,
  getDocPath,
  isDocCategoryId,
  listDocs as listStaticDocs,
  type DocArticle,
  type DocCategory,
  type DocCategoryId,
  type DocMedia,
  type DocResource,
  type DocSection,
} from "@/lib/docs"
import { sanitizePublicUrl } from "@/lib/safe-public-url"

export interface DocsContent {
  categories: DocCategory[]
  docs: DocArticle[]
}

interface DocsCategoryRow {
  id: string
  title: string
  description: string | null
  order_index: number
}

interface DocsArticleRow {
  id: string
  category_id: string
  slug: string
  title: string
  description: string
  audience: string[] | null
  tags: string[] | null
  keywords: string[] | null
  chatbot_summary: string | null
  content_markdown: string | null
  content_json: unknown
  featured: boolean
  visibility: "public" | "unlisted" | "internal"
  noindex: boolean
  seo_title: string | null
  seo_description: string | null
  canonical_path: string | null
  last_reviewed_at: string | null
  published_at: string | null
  updated_at: string
}

interface DocsRelationRow {
  article_id: string
  related_article_id: string
  order_index: number | null
}

const staticDocsContent: DocsContent = {
  categories: staticDocsCategories,
  docs: listStaticDocs(),
}

const PUBLISHED_DOC_STATUS_VALUES = ["published", "PUBLISHED"]

function shouldUseSupabaseDocs() {
  const mode = process.env.USE_SUPABASE_DOCS?.trim().toLowerCase()
  if (mode === "false") return false
  if (mode === "true") return true

  return Boolean(
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
}

function mergeDocsContent(base: DocsContent, incoming: DocsContent): DocsContent {
  const categoriesById = new Map(base.categories.map((category) => [category.id, category]))
  for (const category of incoming.categories) {
    categoriesById.set(category.id, category)
  }

  const docsByPath = new Map(base.docs.map((doc) => [getDocPath(doc), doc]))
  for (const doc of incoming.docs) {
    docsByPath.set(getDocPath(doc), doc)
  }

  const categories = Array.from(categoriesById.values()).sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.title.localeCompare(right.title, "ko-KR")
  })

  const orderByCategory = new Map(categories.map((category) => [category.id, category.order]))
  const docs = Array.from(docsByPath.values()).sort((left, right) => {
    const leftOrder = orderByCategory.get(left.category) ?? 999
    const rightOrder = orderByCategory.get(right.category) ?? 999
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return right.updatedAt.localeCompare(left.updatedAt)
  })

  return { categories, docs }
}

function toSafeDocSection(value: unknown): DocSection | null {
  if (!value || typeof value !== "object") return null

  const section = value as Partial<DocSection>
  const hasValidSteps =
    section.steps === undefined ||
    (Array.isArray(section.steps) && section.steps.every((step) => typeof step === "string"))
  if (typeof section.heading !== "string" || typeof section.body !== "string" || !hasValidSteps) {
    return null
  }

  const media = Array.isArray(section.media)
    ? section.media.map(toSafeDocMedia).filter((item): item is DocMedia => Boolean(item))
    : []

  return {
    heading: section.heading,
    body: section.body,
    ...(section.steps ? { steps: section.steps } : {}),
    ...(media.length > 0 ? { media } : {}),
  }
}

function toSafeDocMedia(value: unknown): DocMedia | null {
  if (!value || typeof value !== "object") return null

  const media = value as Partial<DocMedia>
  if (
    (media.type !== "image" && media.type !== "video") ||
    typeof media.src !== "string" ||
    typeof media.alt !== "string" ||
    (media.caption !== undefined && typeof media.caption !== "string") ||
    (media.width !== undefined && typeof media.width !== "number") ||
    (media.height !== undefined && typeof media.height !== "number")
  ) {
    return null
  }

  const safeSrc = sanitizePublicUrl(media.src, "")
  if (!safeSrc) return null

  return {
    type: media.type,
    src: safeSrc,
    alt: media.alt,
    ...(media.caption ? { caption: media.caption } : {}),
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
  }
}

function isDocResource(value: unknown): value is DocResource {
  if (!value || typeof value !== "object") return false

  const resource = value as Partial<DocResource>
  return (
    typeof resource.label === "string" &&
    typeof resource.href === "string" &&
    (resource.description === undefined || typeof resource.description === "string")
  )
}

function getContentJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getReadMinutes(contentJson: Record<string, unknown>, markdown: string | null) {
  const readMinutes = contentJson.readMinutes
  if (typeof readMinutes === "number" && Number.isFinite(readMinutes) && readMinutes > 0) {
    return Math.ceil(readMinutes)
  }

  const estimatedWords = (markdown ?? "").replace(/\s+/g, " ").trim().length / 4
  return Math.max(1, Math.ceil(estimatedWords / 450))
}

function getSections(contentJson: Record<string, unknown>, fallbackBody: string): DocSection[] {
  const sections = contentJson.sections
  if (Array.isArray(sections)) {
    const safeSections = sections
      .map(toSafeDocSection)
      .filter((section): section is DocSection => Boolean(section))
    if (safeSections.length > 0) return safeSections
  }

  return [
    {
      heading: "개요",
      body: fallbackBody,
    },
  ]
}

function getResources(contentJson: Record<string, unknown>): DocResource[] | undefined {
  const resources = contentJson.resources
  if (!Array.isArray(resources)) return undefined

  const validResources = resources.filter(isDocResource)
  return validResources.length > 0 ? validResources : undefined
}

function getDateOnly(value: string | null | undefined) {
  return value?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
}

async function fetchDocsContentFromSupabase(): Promise<DocsContent> {
  const supabase = createSupabaseAdminClient()

  const [{ data: categoryRows, error: categoryError }, { data: articleRows, error: articleError }] =
    await Promise.all([
      supabase
        .from("docs_categories")
        .select("id, title, description, order_index")
        .eq("is_visible", true)
        .order("order_index", { ascending: true }),
      supabase
        .from("docs_articles")
        .select(
          "id, category_id, slug, title, description, audience, tags, keywords, chatbot_summary, content_markdown, content_json, featured, visibility, noindex, seo_title, seo_description, canonical_path, last_reviewed_at, published_at, updated_at"
        )
        .in("status", PUBLISHED_DOC_STATUS_VALUES)
        .in("visibility", ["public", "unlisted"])
        .order("order_index", { ascending: true }),
    ])

  if (categoryError) throw categoryError
  if (articleError) throw articleError

  const categories = ((categoryRows ?? []) as DocsCategoryRow[])
    .filter((row) => isDocCategoryId(row.id))
    .map((row) => ({
      id: row.id as DocCategoryId,
      title: row.title,
      description: row.description ?? "",
      order: row.order_index,
    }))

  const rows = ((articleRows ?? []) as DocsArticleRow[]).filter((row) =>
    isDocCategoryId(row.category_id)
  )

  if (categories.length === 0 || rows.length === 0) {
    throw new Error("Supabase docs content is empty.")
  }

  const articleIds = rows.map((row) => row.id)
  const { data: relationRows, error: relationError } = await supabase
    .from("docs_article_relations")
    .select("article_id, related_article_id, order_index")
    .in("article_id", articleIds)
    .order("order_index", { ascending: true })

  if (relationError) throw relationError

  const slugById = new Map(rows.map((row) => [row.id, row.slug]))
  const relationsByArticleId = new Map<string, string[]>()

  for (const relation of (relationRows ?? []) as DocsRelationRow[]) {
    const relatedSlug = slugById.get(relation.related_article_id)
    if (!relatedSlug) continue

    const slugs = relationsByArticleId.get(relation.article_id) ?? []
    slugs.push(relatedSlug)
    relationsByArticleId.set(relation.article_id, slugs)
  }

  const docs = rows.map((row) => {
    const contentJson = getContentJson(row.content_json)

    return {
      slug: row.slug,
      category: row.category_id as DocCategoryId,
      title: row.title,
      description: row.description,
      audience: (row.audience ?? []).join(", "),
      updatedAt: getDateOnly(row.last_reviewed_at ?? row.published_at ?? row.updated_at),
      readMinutes: getReadMinutes(contentJson, row.content_markdown),
      featured: row.featured,
      visibility: row.visibility,
      noindex: row.noindex,
      seoTitle: row.seo_title ?? undefined,
      seoDescription: row.seo_description ?? undefined,
      canonicalPath: row.canonical_path ?? undefined,
      tags: row.tags ?? [],
      keywords: row.keywords ?? [],
      chatbotSummary: row.chatbot_summary ?? row.description,
      sections: getSections(contentJson, row.content_markdown ?? row.description),
      resources: getResources(contentJson),
      relatedSlugs: relationsByArticleId.get(row.id),
    } satisfies DocArticle
  })

  return { categories, docs }
}

// ── 서버 메모이제이션(인스턴스 단위) ──────────────────────────────────────────
// 아래 getDocsContent 의 React cache()는 요청 스코프라, 요청마다 발행 문서 전부(본문 포함)를
// 다시 읽었다 — 2026-09-02 프로덕션 pg_stat_statements 에서 이 로드가 12,359콜 × 138ms = 1,710초로
// 단일 문장 1위였다(콜당 1,696 블록). 문서·검색·사이트맵·/updates·챗봇 폴백이 전부 이 경로다.
// 인스턴스 메모(TTL 60초 + 진행 중 promise 공유)로 접는다. 공개 문서라 최대 60초 지연은 허용되고,
// 관리자 발행·수정 경로(app/api/admin/docs/articles/_revalidate.ts)는 invalidateDocsContentCache()로
// 같은 인스턴스의 값을 즉시 비운다(다른 인스턴스는 TTL 로 수렴).
// Data Cache(unstable_cache)를 쓰지 않는 이유: 발행 문서 본문 합계가 이미 1MB 를 넘어(실측 1,082kB)
// 항목당 2MB 한도의 절벽이 가깝다 — 그 캐시는 크기를 넘기면 조용히 캐시를 멈추지만 메모는 절벽이 없다.
// 실패(예외)는 캐시하지 않는다 — 폴백은 요청마다 정적 콘텐츠로 내려가고 다음 요청이 재시도한다.
const DOCS_CONTENT_MEMO_TTL_MS = 60_000

let docsContentMemo: { value: DocsContent; expiresAt: number } | null = null
let docsContentInflight: Promise<DocsContent> | null = null
// 무효화 세대 — 로드 중에 무효화되면 그 로드의 결과는 메모에 싣지 않는다(발행 직후 stale 방지).
let docsContentGeneration = 0

function loadDocsContentMemoized(): Promise<DocsContent> {
  if (docsContentMemo && docsContentMemo.expiresAt > Date.now()) {
    return Promise.resolve(docsContentMemo.value)
  }
  if (docsContentInflight) return docsContentInflight

  const generation = docsContentGeneration
  const pending = fetchDocsContentFromSupabase()
    .then((incoming) => {
      const merged = mergeDocsContent(staticDocsContent, incoming)
      if (generation === docsContentGeneration) {
        docsContentMemo = { value: merged, expiresAt: Date.now() + DOCS_CONTENT_MEMO_TTL_MS }
      }
      return merged
    })
    .finally(() => {
      if (docsContentInflight === pending) docsContentInflight = null
    })
  docsContentInflight = pending
  return pending
}

/** 관리자 발행·수정·삭제 뒤 같은 인스턴스의 메모를 즉시 비운다. */
export function invalidateDocsContentCache() {
  docsContentGeneration += 1
  docsContentMemo = null
  docsContentInflight = null
}

/** 테스트 전용 — 모듈 상태를 초기화한다. */
export function __resetDocsContentCacheForTests() {
  invalidateDocsContentCache()
}

// /docs/[category]·[slug] 등은 generateMetadata와 본문에서 같은 콘텐츠를 두 번 fetch한다.
// 요청 스코프 cache()로 요청당 1회로 합치고, 원격 로드 자체는 위 인스턴스 메모가 접는다
// (폴백/머지 동작은 그대로).
export const getDocsContent = cache(async (): Promise<DocsContent> => {
  if (!shouldUseSupabaseDocs()) {
    return staticDocsContent
  }

  try {
    return await loadDocsContentMemoized()
  } catch (error) {
    console.warn(
      "Falling back to static docs content:",
      error instanceof Error ? error.message : error
    )
    return staticDocsContent
  }
})

export function getStaticDocsContent(): DocsContent {
  return staticDocsContent
}

export function isListedDoc(doc: DocArticle) {
  return (doc.visibility ?? "public") === "public" && !doc.noindex
}

export function getDocFromContent(
  content: DocsContent,
  slug: string,
  categoryId?: DocCategoryId | string
) {
  return content.docs.find(
    (doc) => doc.slug === slug && (!categoryId || doc.category === categoryId)
  )
}

export function getDocCategoryFromContent(content: DocsContent, categoryId: string) {
  return content.categories.find((category) => category.id === categoryId)
}

export function getDocsByCategoryFromContent(content: DocsContent, categoryId: DocCategoryId) {
  return content.docs.filter((doc) => doc.category === categoryId && isListedDoc(doc))
}

export function getRelatedDocsFromContent(content: DocsContent, doc: DocArticle, limit = 3) {
  const related = (doc.relatedSlugs ?? [])
    .map((slug) => getDocFromContent(content, slug))
    .filter((item): item is DocArticle => Boolean(item))
    .filter(isListedDoc)

  if (related.length >= limit) return related.slice(0, limit)

  const fallback = content.docs.filter(
    (item) =>
      item.category === doc.category &&
      item.slug !== doc.slug &&
      isListedDoc(item) &&
      !related.some((relatedDoc) => relatedDoc.slug === item.slug)
  )

  return [...related, ...fallback].slice(0, limit)
}

export function listDocsFromContent(content: DocsContent) {
  return [...content.docs]
}

export function listListedDocsFromContent(content: DocsContent) {
  return content.docs.filter(isListedDoc)
}

export function getDocPathFromContent(doc: Pick<DocArticle, "category" | "slug">) {
  return getDocPath(doc)
}

interface DocsRedirectRow {
  to_path: string | null
  to_article_id: string | null
  http_status: number
}

interface DocsRedirectTarget {
  toPath: string
  httpStatus: 301 | 302 | 307 | 308
}

export async function resolveDocsRedirect(
  fromPath: string
): Promise<DocsRedirectTarget | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("docs_redirects")
      .select("to_path, to_article_id, http_status")
      .eq("from_path", fromPath)
      .maybeSingle()

    if (error || !data) return null
    const row = data as DocsRedirectRow

    let toPath = row.to_path
    if (!toPath && row.to_article_id) {
      const { data: articleRow } = await supabase
        .from("docs_articles")
        .select("category_id, slug")
        .eq("id", row.to_article_id)
        .maybeSingle()
      if (articleRow?.category_id && articleRow?.slug) {
        toPath = `/docs/${articleRow.category_id}/${articleRow.slug}`
      }
    }

    if (!toPath) return null
    const status = [301, 302, 307, 308].includes(row.http_status)
      ? (row.http_status as 301 | 302 | 307 | 308)
      : 301
    return { toPath, httpStatus: status }
  } catch {
    return null
  }
}
