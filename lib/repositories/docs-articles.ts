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

export interface DocsCategoryDetail {
  id: string
  title: string
  description: string
  orderIndex: number
  icon: string | null
  isVisible: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface DocsRedirectDetail {
  id: string
  fromPath: string
  toPath: string | null
  toArticleId: string | null
  httpStatus: 301 | 302 | 307 | 308
  createdAt: string
  updatedAt: string
}

export interface DocsArticleVersionDetail {
  id: string
  articleId: string
  versionNumber: number
  title: string
  description: string
  contentMarkdown: string
  contentJson: Record<string, unknown>
  changeNote: string | null
  createdBy: string | null
  createdAt: string
}

export interface DocsArticleAnalyticsDetail {
  articleId: string
  feedbackTotal: number
  helpfulTotal: number
  notHelpfulTotal: number
  helpfulRate: number | null
  searchClicks: number
  chatbotCitations: number
  recentFeedback: Array<{
    id: string
    helpful: boolean
    reason: string | null
    createdAt: string
  }>
  recentSearches: Array<{
    id: string
    query: string
    source: string
    createdAt: string
  }>
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

interface DocsCategoryRow {
  id: string
  title: string
  description: string | null
  order_index: number | null
  icon: string | null
  is_visible: boolean | null
  created_at: string | null
  updated_at: string | null
}

interface DocsRedirectRow {
  id: string
  from_path: string
  to_path: string | null
  to_article_id: string | null
  http_status: number
  created_at: string
  updated_at: string
}

interface DocsArticleVersionRow {
  id: string
  article_id: string
  version_number: number
  title: string
  description: string
  content_markdown: string | null
  content_json: unknown
  change_note: string | null
  created_by: string | null
  created_at: string
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

function rowToCategory(row: DocsCategoryRow): DocsCategoryDetail {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    orderIndex: row.order_index ?? 100,
    icon: row.icon,
    isVisible: row.is_visible ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToRedirect(row: DocsRedirectRow): DocsRedirectDetail {
  const status = [301, 302, 307, 308].includes(row.http_status)
    ? (row.http_status as 301 | 302 | 307 | 308)
    : 301

  return {
    id: row.id,
    fromPath: row.from_path,
    toPath: row.to_path,
    toArticleId: row.to_article_id,
    httpStatus: status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToVersion(row: DocsArticleVersionRow): DocsArticleVersionDetail {
  return {
    id: row.id,
    articleId: row.article_id,
    versionNumber: row.version_number,
    title: row.title,
    description: row.description,
    contentMarkdown: row.content_markdown ?? "",
    contentJson: getContentJson(row.content_json),
    changeNote: row.change_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function nextVersionNumber(latest: number | null | undefined) {
  return (latest ?? 0) + 1
}

export async function listDocsCategories(): Promise<DocsCategoryDetail[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("docs_categories")
    .select("id, title, description, order_index, icon, is_visible, created_at, updated_at")
    .order("order_index", { ascending: true })
  if (error) throw error

  return ((data ?? []) as DocsCategoryRow[]).map(rowToCategory)
}

export async function upsertDocsCategory(input: {
  id: string
  title: string
  description?: string | null
  orderIndex?: number
  icon?: string | null
  isVisible?: boolean
}): Promise<DocsCategoryDetail> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("docs_categories")
    .upsert(
      {
        id: input.id,
        title: input.title,
        description: input.description ?? null,
        order_index: input.orderIndex ?? 100,
        icon: input.icon ?? null,
        is_visible: input.isVisible ?? true,
      },
      { onConflict: "id" }
    )
    .select("id, title, description, order_index, icon, is_visible, created_at, updated_at")
    .single()
  if (error) throw error

  return rowToCategory(data as DocsCategoryRow)
}

export async function patchDocsCategory(
  id: string,
  patch: Partial<Omit<Parameters<typeof upsertDocsCategory>[0], "id">>
): Promise<DocsCategoryDetail | null> {
  const supabase = createSupabaseAdminClient()
  const dbPatch: Record<string, unknown> = {}

  if (patch.title !== undefined) dbPatch.title = patch.title
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.orderIndex !== undefined) dbPatch.order_index = patch.orderIndex
  if (patch.icon !== undefined) dbPatch.icon = patch.icon
  if (patch.isVisible !== undefined) dbPatch.is_visible = patch.isVisible

  if (Object.keys(dbPatch).length === 0) {
    const category = (await listDocsCategories()).find((item) => item.id === id)
    return category ?? null
  }

  const { data, error } = await supabase
    .from("docs_categories")
    .update(dbPatch)
    .eq("id", id)
    .select("id, title, description, order_index, icon, is_visible, created_at, updated_at")
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }

  return rowToCategory(data as DocsCategoryRow)
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
): Promise<DocsArticleVersionDetail> {
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

  const { data, error } = await supabase
    .from("docs_article_versions")
    .insert({
      article_id: detail.id,
      version_number: versionNumber,
      title: detail.title,
      description: detail.description,
      content_markdown: detail.contentMarkdown,
      content_json: detail.contentJson,
      change_note: changeNote,
      created_by: createdBy,
    })
    .select("id, article_id, version_number, title, description, content_markdown, content_json, change_note, created_by, created_at")
    .single()
  if (error) throw error

  return rowToVersion(data as DocsArticleVersionRow)
}

export async function createDocsArticleVersionSnapshot(
  articleId: string,
  changeNote: string,
  createdBy: string | null
): Promise<DocsArticleVersionDetail | null> {
  const detail = await getDocsArticleById(articleId)
  if (!detail) return null
  return writeVersionSnapshot(detail, changeNote, createdBy)
}

export async function listDocsArticleVersions(
  articleId: string
): Promise<DocsArticleVersionDetail[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("docs_article_versions")
    .select("id, article_id, version_number, title, description, content_markdown, content_json, change_note, created_by, created_at")
    .eq("article_id", articleId)
    .order("version_number", { ascending: false })
  if (error) throw error

  return ((data ?? []) as DocsArticleVersionRow[]).map(rowToVersion)
}

export async function rollbackDocsArticleToVersion(
  articleId: string,
  versionId: string,
  updatedBy: string | null
): Promise<DocsArticleDetail | null> {
  const existing = await getDocsArticleById(articleId)
  if (!existing) return null

  const supabase = createSupabaseAdminClient()
  const { data: versionRow, error: versionError } = await supabase
    .from("docs_article_versions")
    .select("id, article_id, version_number, title, description, content_markdown, content_json, change_note, created_by, created_at")
    .eq("article_id", articleId)
    .eq("id", versionId)
    .single()
  if (versionError) {
    if (versionError.code === "PGRST116") return null
    throw versionError
  }

  const version = rowToVersion(versionRow as DocsArticleVersionRow)
  await writeVersionSnapshot(existing, `Rollback backup before v${version.versionNumber}`, updatedBy)

  return patchDocsArticle(articleId, {
    title: version.title,
    description: version.description,
    contentMarkdown: version.contentMarkdown,
    contentJson: version.contentJson,
    updatedBy,
  })
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

export async function listDocsRedirects(): Promise<DocsRedirectDetail[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("docs_redirects")
    .select("id, from_path, to_path, to_article_id, http_status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500)
  if (error) throw error

  return ((data ?? []) as DocsRedirectRow[]).map(rowToRedirect)
}

export async function upsertDocsRedirect(input: {
  fromPath: string
  toPath?: string | null
  toArticleId?: string | null
  httpStatus?: 301 | 302 | 307 | 308
}): Promise<DocsRedirectDetail> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("docs_redirects")
    .upsert(
      {
        from_path: input.fromPath,
        to_path: input.toPath ?? null,
        to_article_id: input.toArticleId ?? null,
        http_status: input.httpStatus ?? 301,
      },
      { onConflict: "from_path" }
    )
    .select("id, from_path, to_path, to_article_id, http_status, created_at, updated_at")
    .single()
  if (error) throw error

  return rowToRedirect(data as DocsRedirectRow)
}

export async function patchDocsRedirect(
  id: string,
  patch: {
    fromPath?: string
    toPath?: string | null
    toArticleId?: string | null
    httpStatus?: 301 | 302 | 307 | 308
  }
): Promise<DocsRedirectDetail | null> {
  const supabase = createSupabaseAdminClient()
  const dbPatch: Record<string, unknown> = {}
  if (patch.fromPath !== undefined) dbPatch.from_path = patch.fromPath
  if (patch.toPath !== undefined) dbPatch.to_path = patch.toPath
  if (patch.toArticleId !== undefined) dbPatch.to_article_id = patch.toArticleId
  if (patch.httpStatus !== undefined) dbPatch.http_status = patch.httpStatus

  const { data, error } = await supabase
    .from("docs_redirects")
    .update(dbPatch)
    .eq("id", id)
    .select("id, from_path, to_path, to_article_id, http_status, created_at, updated_at")
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }

  return rowToRedirect(data as DocsRedirectRow)
}

export async function deleteDocsRedirect(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from("docs_redirects").delete().eq("id", id)
  if (error) throw error
}

export async function bulkPatchDocsArticles(
  ids: string[],
  patch: DocsArticlePatchInput
): Promise<{ updatedCount: number }> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
  if (uniqueIds.length === 0) return { updatedCount: 0 }

  const supabase = createSupabaseAdminClient()
  const dbPatch: Record<string, unknown> = {}

  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId
  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.visibility !== undefined) dbPatch.visibility = patch.visibility
  if (patch.noindex !== undefined) dbPatch.noindex = patch.noindex
  if (patch.featured !== undefined) dbPatch.featured = patch.featured
  if (patch.updatedBy !== undefined) dbPatch.updated_by = patch.updatedBy

  if (Object.keys(dbPatch).length === 0) return { updatedCount: 0 }

  const { data, error } = await supabase
    .from("docs_articles")
    .update(dbPatch)
    .in("id", uniqueIds)
    .select("id")
  if (error) throw error

  return { updatedCount: (data ?? []).length }
}

export async function getDocsArticleAnalytics(
  articleId: string,
  rangeDays = 90
): Promise<DocsArticleAnalyticsDetail> {
  const supabase = createSupabaseAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - Math.min(365, Math.max(1, rangeDays)))
  const sinceIso = since.toISOString()

  const [feedbackResult, searchResult, citationResult] = await Promise.all([
    supabase
      .from("docs_feedback")
      .select("id, helpful, reason, created_at")
      .eq("article_id", articleId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("docs_search_events")
      .select("id, query, source, created_at")
      .eq("clicked_article_id", articleId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("chatbot_answer_citations")
      .select("article_id")
      .eq("article_id", articleId)
      .limit(5000),
  ])

  if (feedbackResult.error) throw feedbackResult.error
  if (searchResult.error) throw searchResult.error
  if (citationResult.error) throw citationResult.error

  const feedbackRows = (feedbackResult.data ?? []) as Array<{
    id: string
    helpful: boolean
    reason: string | null
    created_at: string
  }>
  const searchRows = (searchResult.data ?? []) as Array<{
    id: string
    query: string
    source: string
    created_at: string
  }>

  const helpfulTotal = feedbackRows.filter((row) => row.helpful).length
  const notHelpfulTotal = feedbackRows.length - helpfulTotal

  return {
    articleId,
    feedbackTotal: feedbackRows.length,
    helpfulTotal,
    notHelpfulTotal,
    helpfulRate: feedbackRows.length > 0 ? Math.round((helpfulTotal / feedbackRows.length) * 100) : null,
    searchClicks: searchRows.length,
    chatbotCitations: (citationResult.data ?? []).length,
    recentFeedback: feedbackRows.slice(0, 10).map((row) => ({
      id: row.id,
      helpful: row.helpful,
      reason: row.reason,
      createdAt: row.created_at,
    })),
    recentSearches: searchRows.slice(0, 10).map((row) => ({
      id: row.id,
      query: row.query,
      source: row.source,
      createdAt: row.created_at,
    })),
  }
}
