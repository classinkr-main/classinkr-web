"server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type DocsArticleStatus = "draft" | "review" | "published" | "archived"
export type DocsArticleVisibility = "public" | "unlisted" | "internal"
export type DocsArticleDocType =
  | "guide"
  | "manual"
  | "faq"
  | "troubleshooting"
  | "release_note"
  | "reference"
export type DocsArticleProductArea =
  | "general"
  | "software"
  | "hardware"
  | "billing"
  | "onboarding"
  | "classroom"
  | "admin"
  | "partner"
export type DocsArticleDifficulty = "beginner" | "intermediate" | "advanced"

export interface DocsArticleDetail {
  id: string
  categoryId: string
  slug: string
  title: string
  description: string
  audience: string[]
  productArea: DocsArticleProductArea
  docType: DocsArticleDocType
  difficulty: DocsArticleDifficulty
  status: DocsArticleStatus
  visibility: DocsArticleVisibility
  noindex: boolean
  featured: boolean
  orderIndex: number
  tags: string[]
  keywords: string[]
  symptoms: string[]
  chatbotSummary: string | null
  contentMarkdown: string
  contentJson: Record<string, unknown>
  seoTitle: string | null
  seoDescription: string | null
  canonicalPath: string | null
  publishedAt: string | null
  lastReviewedAt: string | null
  createdAt: string
  updatedAt: string
  updatedBy: string | null
  publicPath: string
}

export interface DocsArticleCreateInput {
  categoryId: string
  slug: string
  title: string
  description: string
  audience?: string[]
  productArea?: DocsArticleProductArea
  docType?: DocsArticleDocType
  difficulty?: DocsArticleDifficulty
  status?: DocsArticleStatus
  visibility?: DocsArticleVisibility
  noindex?: boolean
  featured?: boolean
  orderIndex?: number
  tags?: string[]
  keywords?: string[]
  symptoms?: string[]
  chatbotSummary?: string | null
  contentMarkdown?: string
  contentJson?: Record<string, unknown>
  seoTitle?: string | null
  seoDescription?: string | null
  updatedBy?: string | null
}

export type DocsArticlePatchInput = Partial<DocsArticleCreateInput>

interface DocsArticleRow {
  id: string
  category_id: string
  slug: string
  title: string
  description: string
  audience: string[] | null
  product_area: string
  doc_type: string
  difficulty: string
  status: string
  visibility: string
  noindex: boolean
  featured: boolean
  order_index: number
  tags: string[] | null
  keywords: string[] | null
  symptoms: string[] | null
  chatbot_summary: string | null
  content_markdown: string | null
  content_json: unknown
  seo_title: string | null
  seo_description: string | null
  canonical_path: string | null
  published_at: string | null
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

const SELECT_COLUMNS =
  "id, category_id, slug, title, description, audience, product_area, doc_type, difficulty, status, visibility, noindex, featured, order_index, tags, keywords, symptoms, chatbot_summary, content_markdown, content_json, seo_title, seo_description, canonical_path, published_at, last_reviewed_at, created_at, updated_at, updated_by"

function getContentJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function rowToDetail(row: DocsArticleRow): DocsArticleDetail {
  return {
    id: row.id,
    categoryId: row.category_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    audience: row.audience ?? [],
    productArea: row.product_area as DocsArticleProductArea,
    docType: row.doc_type as DocsArticleDocType,
    difficulty: row.difficulty as DocsArticleDifficulty,
    status: row.status as DocsArticleStatus,
    visibility: row.visibility as DocsArticleVisibility,
    noindex: row.noindex,
    featured: row.featured,
    orderIndex: row.order_index,
    tags: row.tags ?? [],
    keywords: row.keywords ?? [],
    symptoms: row.symptoms ?? [],
    chatbotSummary: row.chatbot_summary,
    contentMarkdown: row.content_markdown ?? "",
    contentJson: getContentJson(row.content_json),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    canonicalPath: row.canonical_path,
    publishedAt: row.published_at,
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    publicPath: `/docs/${row.category_id}/${row.slug}`,
  }
}

function nextVersionNumber(latest: number | null | undefined) {
  return (latest ?? 0) + 1
}

export async function getDocsArticleById(id: string): Promise<DocsArticleDetail | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("docs_articles")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  return rowToDetail(data as DocsArticleRow)
}

export async function createDocsArticle(
  input: DocsArticleCreateInput
): Promise<DocsArticleDetail> {
  const supabase = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const status: DocsArticleStatus = input.status ?? "draft"

  const insertPayload = {
    category_id: input.categoryId,
    slug: input.slug,
    title: input.title,
    description: input.description,
    audience: input.audience ?? [],
    product_area: input.productArea ?? "general",
    doc_type: input.docType ?? "guide",
    difficulty: input.difficulty ?? "beginner",
    status,
    visibility: input.visibility ?? "public",
    noindex: input.noindex ?? false,
    featured: input.featured ?? false,
    order_index: input.orderIndex ?? 100,
    tags: input.tags ?? [],
    keywords: input.keywords ?? [],
    symptoms: input.symptoms ?? [],
    chatbot_summary: input.chatbotSummary ?? null,
    content_markdown: input.contentMarkdown ?? "",
    content_json: input.contentJson ?? {},
    seo_title: input.seoTitle ?? null,
    seo_description: input.seoDescription ?? null,
    canonical_path: `/docs/${input.categoryId}/${input.slug}`,
    published_at: status === "published" ? now : null,
    last_reviewed_at: status === "published" ? now : null,
    updated_by: input.updatedBy ?? null,
    created_by: input.updatedBy ?? null,
  }

  const { data, error } = await supabase
    .from("docs_articles")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()
  if (error) throw error

  const detail = rowToDetail(data as DocsArticleRow)

  if (status === "published") {
    await writeVersionSnapshot(detail, "Initial publish", input.updatedBy ?? null)
  }

  return detail
}

export async function patchDocsArticle(
  id: string,
  patch: DocsArticlePatchInput
): Promise<DocsArticleDetail | null> {
  const existing = await getDocsArticleById(id)
  if (!existing) return null

  const supabase = createSupabaseAdminClient()
  const dbPatch: Record<string, unknown> = {}

  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId
  if (patch.slug !== undefined) dbPatch.slug = patch.slug
  if (patch.title !== undefined) dbPatch.title = patch.title
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.audience !== undefined) dbPatch.audience = patch.audience
  if (patch.productArea !== undefined) dbPatch.product_area = patch.productArea
  if (patch.docType !== undefined) dbPatch.doc_type = patch.docType
  if (patch.difficulty !== undefined) dbPatch.difficulty = patch.difficulty
  if (patch.visibility !== undefined) dbPatch.visibility = patch.visibility
  if (patch.noindex !== undefined) dbPatch.noindex = patch.noindex
  if (patch.featured !== undefined) dbPatch.featured = patch.featured
  if (patch.orderIndex !== undefined) dbPatch.order_index = patch.orderIndex
  if (patch.tags !== undefined) dbPatch.tags = patch.tags
  if (patch.keywords !== undefined) dbPatch.keywords = patch.keywords
  if (patch.symptoms !== undefined) dbPatch.symptoms = patch.symptoms
  if (patch.chatbotSummary !== undefined) dbPatch.chatbot_summary = patch.chatbotSummary
  if (patch.contentMarkdown !== undefined) dbPatch.content_markdown = patch.contentMarkdown
  if (patch.contentJson !== undefined) dbPatch.content_json = patch.contentJson
  if (patch.seoTitle !== undefined) dbPatch.seo_title = patch.seoTitle
  if (patch.seoDescription !== undefined) dbPatch.seo_description = patch.seoDescription
  if (patch.updatedBy !== undefined) dbPatch.updated_by = patch.updatedBy

  const nextCategoryId = patch.categoryId ?? existing.categoryId
  const nextSlug = patch.slug ?? existing.slug
  if (patch.categoryId !== undefined || patch.slug !== undefined) {
    dbPatch.canonical_path = `/docs/${nextCategoryId}/${nextSlug}`
  }

  const now = new Date().toISOString()
  const willPublish =
    patch.status !== undefined &&
    patch.status === "published" &&
    existing.status !== "published"
  const willTransitionStatus = patch.status !== undefined && patch.status !== existing.status

  if (willTransitionStatus) {
    dbPatch.status = patch.status
  }

  if (willPublish) {
    dbPatch.published_at = now
    dbPatch.last_reviewed_at = now
  }

  if (Object.keys(dbPatch).length === 0) return existing

  const { data, error } = await supabase
    .from("docs_articles")
    .update(dbPatch)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }

  const detail = rowToDetail(data as DocsArticleRow)

  if (willPublish) {
    await writeVersionSnapshot(detail, "Publish", patch.updatedBy ?? detail.updatedBy ?? null)
  }

  return detail
}

export async function deleteDocsArticle(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from("docs_articles").delete().eq("id", id)
  if (error) throw error
}

async function writeVersionSnapshot(
  detail: DocsArticleDetail,
  changeNote: string,
  createdBy: string | null
) {
  const supabase = createSupabaseAdminClient()
  const { data: latest, error: latestError } = await supabase
    .from("docs_article_versions")
    .select("version_number")
    .eq("article_id", detail.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError && latestError.code !== "PGRST116") throw latestError

  const versionNumber = nextVersionNumber(
    (latest as { version_number: number } | null)?.version_number ?? null
  )

  const { error } = await supabase.from("docs_article_versions").insert({
    article_id: detail.id,
    version_number: versionNumber,
    title: detail.title,
    description: detail.description,
    content_markdown: detail.contentMarkdown,
    content_json: detail.contentJson,
    change_note: changeNote,
    created_by: createdBy,
  })
  if (error) throw error
}

export interface DocsArticleRelationInput {
  relatedArticleId: string
  relationType?: "related" | "next_step" | "prerequisite" | "replaces"
  orderIndex?: number
  note?: string | null
}

export interface DocsArticleRelationDetail extends DocsArticleRelationInput {
  relatedSlug: string
  relatedTitle: string
  relatedCategoryId: string
}

export async function listDocsArticleRelations(
  articleId: string
): Promise<DocsArticleRelationDetail[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("docs_article_relations")
    .select(
      "related_article_id, relation_type, order_index, note, related:related_article_id (slug, title, category_id)"
    )
    .eq("article_id", articleId)
    .order("order_index", { ascending: true })
  if (error) throw error

  type RelationJoinRow = {
    related_article_id: string
    relation_type: string
    order_index: number
    note: string | null
    related:
      | { slug: string; title: string; category_id: string }
      | Array<{ slug: string; title: string; category_id: string }>
      | null
  }

  return ((data ?? []) as unknown as RelationJoinRow[]).map((row) => {
    const related = Array.isArray(row.related) ? row.related[0] : row.related
    return {
      relatedArticleId: row.related_article_id,
      relationType: row.relation_type as DocsArticleRelationInput["relationType"],
      orderIndex: row.order_index,
      note: row.note,
      relatedSlug: related?.slug ?? "",
      relatedTitle: related?.title ?? "",
      relatedCategoryId: related?.category_id ?? "",
    }
  })
}

export async function replaceDocsArticleRelations(
  articleId: string,
  relations: DocsArticleRelationInput[]
): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error: deleteError } = await supabase
    .from("docs_article_relations")
    .delete()
    .eq("article_id", articleId)
  if (deleteError) throw deleteError

  if (relations.length === 0) return

  const rows = relations
    .filter((relation) => relation.relatedArticleId !== articleId)
    .map((relation, index) => ({
      article_id: articleId,
      related_article_id: relation.relatedArticleId,
      relation_type: relation.relationType ?? "related",
      order_index: relation.orderIndex ?? (index + 1) * 10,
      note: relation.note ?? null,
    }))

  if (rows.length === 0) return

  const { error } = await supabase.from("docs_article_relations").insert(rows)
  if (error) throw error
}
