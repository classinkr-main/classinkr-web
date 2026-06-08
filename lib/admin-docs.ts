import "server-only"

import crypto from "node:crypto"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  docsCategories as staticDocsCategories,
  getDocPath,
  listDocs as listStaticDocs,
} from "@/lib/docs"

export type AdminDocsDataStatus = "live" | "static-fallback" | "unconfigured"

export interface AdminDocsCategorySummary {
  id: string
  title: string
  description: string
  orderIndex: number
  icon: string | null
  isVisible: boolean
  updatedAt: string | null
  articleCount: number
}

export interface AdminDocsArticleSummary {
  id: string
  categoryId: string
  slug: string
  title: string
  description: string
  status: string
  visibility: string
  noindex: boolean
  docType: string
  productArea: string
  featured: boolean
  orderIndex: number
  publicPath: string
  tags: string[]
  keywords: string[]
  symptoms: string[]
  chatbotSummary: string | null
  chatbotIncluded: boolean
  aiChunkCount: number | null
  aiIndexed: boolean
  aiReady: boolean
  aiIssues: string[]
  contentLength: number
  stale: boolean
  updatedAt: string | null
  publishedAt: string | null
  lastReviewedAt: string | null
}

export interface AdminDocsContentResponse {
  configured: boolean
  status: AdminDocsDataStatus
  generatedAt: string
  categories: AdminDocsCategorySummary[]
  articles: AdminDocsArticleSummary[]
  warnings: string[]
}

export interface AdminDocsAnalyticsSummary {
  feedbackTotal: number
  helpfulTotal: number
  notHelpfulTotal: number
  helpfulRate: number | null
  searchTotal: number
  zeroResultSearches: number
  chatbotQuestions: number
  chatbotUnresolved: number
  chatbotHandoffs: number
  chatbotFeedbackTotal: number
  chatbotNotHelpful: number
}

export interface AdminDocsSearchQuerySummary {
  query: string
  count: number
  zeroResultCount: number
  latestAt: string | null
}

export interface AdminDocsFeedbackSummary {
  id: string
  articleId: string
  articleTitle: string
  helpful: boolean
  reason: string | null
  createdAt: string
}

export interface AdminDocsQuestionSummary {
  question: string
  category: string | null
  count: number
  unresolvedCount: number
  latestAt: string | null
}

export interface AdminDocsAnalyticsResponse {
  configured: boolean
  status: "live" | "unconfigured"
  generatedAt: string
  rangeDays: number
  summary: AdminDocsAnalyticsSummary
  topSearchQueries: AdminDocsSearchQuerySummary[]
  recentFeedback: AdminDocsFeedbackSummary[]
  topChatbotQuestions: AdminDocsQuestionSummary[]
  warnings: string[]
}

export interface AdminDocsReindexResponse {
  configured: boolean
  status: "live" | "unconfigured"
  generatedAt: string
  articleCount: number
  chunkCount: number
  warnings: string[]
}

interface DocsCategoryRow {
  id: string
  title: string
  description: string | null
  order_index: number | null
  icon: string | null
  is_visible: boolean | null
  updated_at: string | null
}

interface DocsArticleRow {
  id: string
  category_id: string
  slug: string
  title: string
  description: string
  status: string
  visibility: string
  noindex: boolean | null
  doc_type: string
  product_area: string
  featured: boolean | null
  order_index: number | null
  tags: string[] | null
  keywords: string[] | null
  symptoms: string[] | null
  chatbot_summary: string | null
  content_markdown: string | null
  updated_at: string | null
  published_at: string | null
  last_reviewed_at: string | null
}

interface DocsArticleForReindexRow extends DocsArticleRow {
  audience: string[] | null
  tags: string[] | null
  keywords: string[] | null
  symptoms: string[] | null
  chatbot_summary: string | null
  content_markdown: string | null
  content_json: unknown
  noindex: boolean | null
}

interface DocsArticleVersionRow {
  id: string
  article_id: string
  version_number: number
}

interface DocsChunkSection {
  heading: string
  body: string
  steps?: string[]
}

interface DocsFeedbackRow {
  id: string
  article_id: string
  helpful: boolean
  reason: string | null
  created_at: string
}

interface DocsSearchEventRow {
  query: string
  normalized_query: string | null
  result_count: number | null
  created_at: string
}

interface ChatbotAnswerEventRow {
  normalized_question: string
  detected_category: string | null
  answer_mode: string
  unresolved: boolean | null
  created_at: string
}

interface ChatbotFeedbackRow {
  rating: string
  created_at: string
}

const EMPTY_ANALYTICS_SUMMARY: AdminDocsAnalyticsSummary = {
  feedbackTotal: 0,
  helpfulTotal: 0,
  notHelpfulTotal: 0,
  helpfulRate: null,
  searchTotal: 0,
  zeroResultSearches: 0,
  chatbotQuestions: 0,
  chatbotUnresolved: 0,
  chatbotHandoffs: 0,
  chatbotFeedbackTotal: 0,
  chatbotNotHelpful: 0,
}

function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

function createStaticContentResponse(warnings: string[] = []): AdminDocsContentResponse {
  const staticArticles = listStaticDocs()
  const articleCounts = new Map<string, number>()

  for (const article of staticArticles) {
    articleCounts.set(article.category, (articleCounts.get(article.category) ?? 0) + 1)
  }

  return {
    configured: false,
    status: "static-fallback",
    generatedAt: new Date().toISOString(),
    categories: staticDocsCategories.map((category) => ({
      id: category.id,
      title: category.title,
      description: category.description,
      orderIndex: category.order,
      icon: null,
      isVisible: true,
      updatedAt: null,
      articleCount: articleCounts.get(category.id) ?? 0,
    })),
    articles: staticArticles.map((article) => {
      const contentLength = getStaticContentLength(article)
      const status = article.status ?? "published"
      const visibility = article.visibility ?? (status === "published" ? "public" : "unlisted")
      const noindex = article.noindex ?? (status !== "published" || visibility !== "public")
      const aiState = getArticleAiState({
        status,
        visibility,
        noindex,
        tags: article.tags,
        keywords: article.keywords,
        chatbotSummary: article.chatbotSummary,
        contentLength,
        aiChunkCount: null,
        updatedAt: article.updatedAt,
        lastReviewedAt: article.updatedAt,
      })

      return {
        id: `${article.category}:${article.slug}`,
        categoryId: article.category,
        slug: article.slug,
        title: article.title,
        description: article.description,
        status,
        visibility,
        noindex,
        docType: article.docType ?? "guide",
        productArea: article.productArea ?? "general",
        featured: Boolean(article.featured),
        orderIndex: 100,
        publicPath: getDocPath(article),
        tags: article.tags,
        keywords: article.keywords,
        symptoms: [],
        chatbotSummary: article.chatbotSummary,
        aiChunkCount: null,
        contentLength,
        ...aiState,
        updatedAt: article.updatedAt,
        publishedAt: null,
        lastReviewedAt: article.updatedAt,
      }
    }),
    warnings,
  }
}

function getPublicPath(article: Pick<DocsArticleRow, "category_id" | "slug">) {
  return `/docs/${article.category_id}/${article.slug}`
}

const REVIEW_STALE_DAYS = 60

interface ArticleAiInput {
  status: string
  visibility: string
  noindex: boolean
  tags: string[]
  keywords: string[]
  chatbotSummary: string | null
  contentLength: number
  aiChunkCount: number | null
  updatedAt: string | null
  lastReviewedAt: string | null
}

function getDaysSince(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function getArticleAiState(article: ArticleAiInput) {
  const chatbotIncluded =
    article.status === "published" && article.visibility !== "internal" && !article.noindex
  const reviewAge = getDaysSince(article.lastReviewedAt ?? article.updatedAt)
  const stale = article.status === "published" && reviewAge !== null && reviewAge > REVIEW_STALE_DAYS
  const aiIndexed = article.aiChunkCount !== null && article.aiChunkCount > 0
  const aiIssues: string[] = []

  if (chatbotIncluded && !article.chatbotSummary?.trim()) {
    aiIssues.push("챗봇 요약 없음")
  }
  if (chatbotIncluded && article.tags.length === 0 && article.keywords.length === 0) {
    aiIssues.push("검색 키워드 없음")
  }
  if (chatbotIncluded && article.contentLength < 120) {
    aiIssues.push("본문 보강 필요")
  }
  if (chatbotIncluded && article.aiChunkCount !== null && article.aiChunkCount === 0) {
    aiIssues.push("AI 인덱스 없음")
  }
  if (stale) {
    aiIssues.push("검토 주기 초과")
  }

  return {
    chatbotIncluded,
    aiIndexed,
    aiReady: chatbotIncluded && aiIssues.length === 0,
    aiIssues,
    stale,
  }
}

function getStaticContentLength(article: ReturnType<typeof listStaticDocs>[number]) {
  const sectionText = article.sections
    .flatMap((section) => [section.heading, section.body, ...(section.steps ?? [])])
    .join(" ")

  return [article.title, article.description, article.chatbotSummary, sectionText]
    .filter(Boolean)
    .join(" ")
    .trim().length
}

function clampRangeDays(value?: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 30
  return Math.min(90, Math.max(1, Math.floor(parsed)))
}

function getSinceIso(rangeDays: number) {
  const since = new Date()
  since.setDate(since.getDate() - rangeDays)
  return since.toISOString()
}

function compactQuery(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "검색어 없음"
}

function hashContent(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function getContentJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function isChunkSection(value: unknown): value is DocsChunkSection {
  if (!value || typeof value !== "object") return false

  const section = value as Partial<DocsChunkSection>
  const validSteps =
    section.steps === undefined ||
    (Array.isArray(section.steps) && section.steps.every((step) => typeof step === "string"))

  return typeof section.heading === "string" && typeof section.body === "string" && validSteps
}

function sectionToChunkContent(section: DocsChunkSection) {
  const steps = section.steps?.map((step) => `- ${step}`).join("\n")
  return [`## ${section.heading}`, section.body, steps].filter(Boolean).join("\n\n")
}

function getSectionsForChunking(article: DocsArticleForReindexRow): DocsChunkSection[] {
  const contentJson = getContentJson(article.content_json)
  const sections = contentJson.sections

  if (Array.isArray(sections) && sections.every(isChunkSection)) {
    return sections
  }

  if (article.content_markdown?.trim()) {
    return [
      {
        heading: "본문",
        body: article.content_markdown.trim(),
      },
    ]
  }

  return [
    {
      heading: "개요",
      body: article.description,
    },
  ]
}

function buildChunkRows(
  articles: DocsArticleForReindexRow[],
  versionByArticleId: Map<string, DocsArticleVersionRow>
) {
  return articles.flatMap((article) => {
    const version = versionByArticleId.get(article.id)
    const path = getPublicPath(article)
    const metadataBase = {
      source: "docs_articles",
      path,
      slug: article.slug,
      category: article.category_id,
      docType: article.doc_type,
      productArea: article.product_area,
      visibility: article.visibility,
      noindex: Boolean(article.noindex),
      tags: article.tags ?? [],
      keywords: article.keywords ?? [],
      symptoms: article.symptoms ?? [],
      audience: article.audience ?? [],
    }

    const summaryContent = [
      article.title,
      article.description,
      article.chatbot_summary,
      article.keywords?.length ? `키워드: ${article.keywords.join(", ")}` : null,
      article.audience?.length ? `대상: ${article.audience.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n\n")

    const summaryChunk = {
      article_id: article.id,
      article_version_id: version?.id ?? null,
      chunk_index: 0,
      heading: "요약",
      content: summaryContent,
      content_hash: hashContent(summaryContent),
      token_count: null,
      metadata: {
        ...metadataBase,
        chunkType: "summary",
      },
      embedding_model: null,
      embedding: null,
      embedding_updated_at: null,
    }

    const sectionChunks = getSectionsForChunking(article).map((section, index) => {
      const content = sectionToChunkContent(section)

      return {
        article_id: article.id,
        article_version_id: version?.id ?? null,
        chunk_index: index + 1,
        heading: section.heading,
        content,
        content_hash: hashContent(content),
        token_count: null,
        metadata: {
          ...metadataBase,
          chunkType: "section",
          sectionIndex: index,
        },
        embedding_model: null,
        embedding: null,
        embedding_updated_at: null,
      }
    })

    return [summaryChunk, ...sectionChunks]
  })
}

export async function listAdminDocsContent(): Promise<AdminDocsContentResponse> {
  if (!hasSupabaseServerEnv()) {
    return createStaticContentResponse(["Supabase 서버 환경 변수가 없어 정적 문서 목록을 표시합니다."])
  }

  try {
    const supabase = createSupabaseAdminClient()
    const [{ data: categoryRows, error: categoryError }, { data: articleRows, error: articleError }] =
      await Promise.all([
        supabase
          .from("docs_categories")
          .select("id, title, description, order_index, icon, is_visible, updated_at")
          .order("order_index", { ascending: true }),
        supabase
          .from("docs_articles")
          .select(
            "id, category_id, slug, title, description, status, visibility, noindex, doc_type, product_area, featured, order_index, tags, keywords, symptoms, chatbot_summary, content_markdown, updated_at, published_at, last_reviewed_at"
          )
          .order("updated_at", { ascending: false }),
      ])

    if (categoryError) throw categoryError
    if (articleError) throw articleError

    const rows = (articleRows ?? []) as DocsArticleRow[]
    const warnings: string[] = []
    const articleCounts = new Map<string, number>()

    for (const article of rows) {
      articleCounts.set(article.category_id, (articleCounts.get(article.category_id) ?? 0) + 1)
    }

    const aiChunkCounts = new Map<string, number>()
    const articleIds = rows.map((article) => article.id)
    if (articleIds.length > 0) {
      const { data: chunkRows, error: chunkError } = await supabase
        .from("docs_ai_chunks")
        .select("article_id")
        .in("article_id", articleIds)
        .limit(5000)

      if (chunkError) {
        warnings.push(`docs_ai_chunks: ${chunkError.message}`)
      } else {
        for (const chunk of (chunkRows ?? []) as Array<{ article_id: string | null }>) {
          if (!chunk.article_id) continue
          aiChunkCounts.set(chunk.article_id, (aiChunkCounts.get(chunk.article_id) ?? 0) + 1)
        }
      }
    }

    const categories = ((categoryRows ?? []) as DocsCategoryRow[]).map((category) => ({
      id: category.id,
      title: category.title,
      description: category.description ?? "",
      orderIndex: category.order_index ?? 100,
      icon: category.icon,
      isVisible: category.is_visible ?? true,
      updatedAt: category.updated_at,
      articleCount: articleCounts.get(category.id) ?? 0,
    }))

    if (categories.length === 0 && rows.length === 0) {
      return createStaticContentResponse(["Supabase 문서 테이블이 비어 있어 정적 문서 목록을 표시합니다."])
    }

    return {
      configured: true,
      status: "live",
      generatedAt: new Date().toISOString(),
      categories,
      articles: rows.map((article) => {
        const tags = article.tags ?? []
        const keywords = article.keywords ?? []
        const symptoms = article.symptoms ?? []
        const contentLength = article.content_markdown?.trim().length ?? 0
        const noindex = Boolean(article.noindex)
        const aiChunkCount = aiChunkCounts.get(article.id) ?? 0
        const aiState = getArticleAiState({
          status: article.status,
          visibility: article.visibility,
          noindex,
          tags,
          keywords,
          chatbotSummary: article.chatbot_summary,
          contentLength,
          aiChunkCount,
          updatedAt: article.updated_at,
          lastReviewedAt: article.last_reviewed_at,
        })

        return {
          id: article.id,
          categoryId: article.category_id,
          slug: article.slug,
          title: article.title,
          description: article.description,
          status: article.status,
          visibility: article.visibility,
          noindex,
          docType: article.doc_type,
          productArea: article.product_area,
          featured: Boolean(article.featured),
          orderIndex: article.order_index ?? 100,
          publicPath: getPublicPath(article),
          tags,
          keywords,
          symptoms,
          chatbotSummary: article.chatbot_summary,
          aiChunkCount,
          contentLength,
          ...aiState,
          updatedAt: article.updated_at,
          publishedAt: article.published_at,
          lastReviewedAt: article.last_reviewed_at,
        }
      }),
      warnings,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류"
    return createStaticContentResponse([`Supabase 문서 목록을 읽지 못해 정적 목록을 표시합니다: ${message}`])
  }
}

export async function getAdminDocsAnalytics(
  rangeDaysParam?: string | null
): Promise<AdminDocsAnalyticsResponse> {
  const rangeDays = clampRangeDays(rangeDaysParam)
  const generatedAt = new Date().toISOString()

  if (!hasSupabaseServerEnv()) {
    return {
      configured: false,
      status: "unconfigured",
      generatedAt,
      rangeDays,
      summary: EMPTY_ANALYTICS_SUMMARY,
      topSearchQueries: [],
      recentFeedback: [],
      topChatbotQuestions: [],
      warnings: ["Supabase 서버 환경 변수가 없어 분석 데이터를 빈 상태로 표시합니다."],
    }
  }

  const supabase = createSupabaseAdminClient()
  const sinceIso = getSinceIso(rangeDays)
  const warnings: string[] = []

  const [
    articleResult,
    feedbackResult,
    searchResult,
    chatbotAnswerResult,
    chatbotFeedbackResult,
  ] = await Promise.all([
    supabase.from("docs_articles").select("id, title").limit(1000),
    supabase
      .from("docs_feedback")
      .select("id, article_id, helpful, reason, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("docs_search_events")
      .select("query, normalized_query, result_count, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("chatbot_answer_events")
      .select("normalized_question, detected_category, answer_mode, unresolved, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("chatbot_feedback")
      .select("rating, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500),
  ])

  if (articleResult.error) warnings.push(`docs_articles: ${articleResult.error.message}`)
  if (feedbackResult.error) warnings.push(`docs_feedback: ${feedbackResult.error.message}`)
  if (searchResult.error) warnings.push(`docs_search_events: ${searchResult.error.message}`)
  if (chatbotAnswerResult.error) {
    warnings.push(`chatbot_answer_events: ${chatbotAnswerResult.error.message}`)
  }
  if (chatbotFeedbackResult.error) warnings.push(`chatbot_feedback: ${chatbotFeedbackResult.error.message}`)

  const titleByArticleId = new Map(
    (((articleResult.data ?? []) as Array<{ id: string; title: string }>)).map((article) => [
      article.id,
      article.title,
    ])
  )
  const feedbackRows = (feedbackResult.error ? [] : feedbackResult.data ?? []) as DocsFeedbackRow[]
  const searchRows = (searchResult.error ? [] : searchResult.data ?? []) as DocsSearchEventRow[]
  const chatbotAnswerRows = (chatbotAnswerResult.error ? [] : chatbotAnswerResult.data ?? []) as ChatbotAnswerEventRow[]
  const chatbotFeedbackRows = (chatbotFeedbackResult.error ? [] : chatbotFeedbackResult.data ?? []) as ChatbotFeedbackRow[]

  const helpfulTotal = feedbackRows.filter((row) => row.helpful).length
  const notHelpfulTotal = feedbackRows.length - helpfulTotal
  const helpfulRate =
    feedbackRows.length > 0 ? Math.round((helpfulTotal / feedbackRows.length) * 100) : null

  const queryMap = new Map<string, AdminDocsSearchQuerySummary>()
  for (const row of searchRows) {
    const query = compactQuery(row.normalized_query ?? row.query)
    const current = queryMap.get(query) ?? {
      query,
      count: 0,
      zeroResultCount: 0,
      latestAt: row.created_at,
    }

    current.count += 1
    if ((row.result_count ?? 0) === 0) current.zeroResultCount += 1
    if (!current.latestAt || row.created_at > current.latestAt) current.latestAt = row.created_at
    queryMap.set(query, current)
  }

  const questionMap = new Map<string, AdminDocsQuestionSummary>()
  for (const row of chatbotAnswerRows) {
    const question = compactQuery(row.normalized_question)
    const current = questionMap.get(question) ?? {
      question,
      category: row.detected_category,
      count: 0,
      unresolvedCount: 0,
      latestAt: row.created_at,
    }

    current.count += 1
    if (row.unresolved) current.unresolvedCount += 1
    if (!current.category && row.detected_category) current.category = row.detected_category
    if (!current.latestAt || row.created_at > current.latestAt) current.latestAt = row.created_at
    questionMap.set(question, current)
  }

  return {
    configured: true,
    status: "live",
    generatedAt,
    rangeDays,
    summary: {
      feedbackTotal: feedbackRows.length,
      helpfulTotal,
      notHelpfulTotal,
      helpfulRate,
      searchTotal: searchRows.length,
      zeroResultSearches: searchRows.filter((row) => (row.result_count ?? 0) === 0).length,
      chatbotQuestions: chatbotAnswerRows.length,
      chatbotUnresolved: chatbotAnswerRows.filter((row) => row.unresolved).length,
      chatbotHandoffs: chatbotAnswerRows.filter((row) => row.answer_mode === "handoff").length,
      chatbotFeedbackTotal: chatbotFeedbackRows.length,
      chatbotNotHelpful: chatbotFeedbackRows.filter((row) => row.rating === "not_helpful").length,
    },
    topSearchQueries: Array.from(queryMap.values())
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
    recentFeedback: feedbackRows.slice(0, 8).map((row) => ({
      id: row.id,
      articleId: row.article_id,
      articleTitle: titleByArticleId.get(row.article_id) ?? "알 수 없는 문서",
      helpful: row.helpful,
      reason: row.reason,
      createdAt: row.created_at,
    })),
    topChatbotQuestions: Array.from(questionMap.values())
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
    warnings,
  }
}

export async function reindexDocsAiChunks(articleId?: string | null): Promise<AdminDocsReindexResponse> {
  const generatedAt = new Date().toISOString()

  if (!hasSupabaseServerEnv()) {
    return {
      configured: false,
      status: "unconfigured",
      generatedAt,
      articleCount: 0,
      chunkCount: 0,
      warnings: ["Supabase 서버 환경 변수가 없어 문서 인덱스를 재생성하지 않았습니다."],
    }
  }

  const supabase = createSupabaseAdminClient()
  let articleQuery = supabase
    .from("docs_articles")
    .select(
      "id, category_id, slug, title, description, status, visibility, doc_type, product_area, featured, order_index, updated_at, published_at, last_reviewed_at, audience, tags, keywords, symptoms, chatbot_summary, content_markdown, content_json, noindex"
    )
    .eq("status", "published")
    .in("visibility", ["public", "unlisted"])
    .eq("noindex", false)
    .order("updated_at", { ascending: false })

  if (articleId) {
    articleQuery = articleQuery.eq("id", articleId)
  }

  const { data: articleRows, error: articleError } = await articleQuery

  if (articleError) throw articleError

  const articles = (articleRows ?? []) as DocsArticleForReindexRow[]
  if (articles.length === 0) {
    if (articleId) {
      const { error: deleteError } = await supabase
        .from("docs_ai_chunks")
        .delete()
        .eq("article_id", articleId)
      if (deleteError) throw deleteError
    }

    return {
      configured: true,
      status: "live",
      generatedAt,
      articleCount: 0,
      chunkCount: 0,
      warnings: [
        articleId
          ? "해당 문서가 게시/공개/색인 허용 상태가 아니어서 기존 chunk만 정리했습니다."
          : "게시된 공개 문서가 없어 재생성할 chunk가 없습니다.",
      ],
    }
  }

  const articleIds = articles.map((article) => article.id)
  const { data: versionRows, error: versionError } = await supabase
    .from("docs_article_versions")
    .select("id, article_id, version_number")
    .in("article_id", articleIds)
    .order("version_number", { ascending: false })

  if (versionError) throw versionError

  const versionByArticleId = new Map<string, DocsArticleVersionRow>()
  for (const version of (versionRows ?? []) as DocsArticleVersionRow[]) {
    if (!versionByArticleId.has(version.article_id)) {
      versionByArticleId.set(version.article_id, version)
    }
  }

  const chunks = buildChunkRows(articles, versionByArticleId)
  const { error: deleteError } = await supabase
    .from("docs_ai_chunks")
    .delete()
    .in("article_id", articleIds)

  if (deleteError) throw deleteError

  const { error: insertError } = await supabase.from("docs_ai_chunks").insert(chunks)
  if (insertError) throw insertError

  return {
    configured: true,
    status: "live",
    generatedAt,
    articleCount: articles.length,
    chunkCount: chunks.length,
    warnings: versionByArticleId.size < articles.length
      ? ["일부 문서에는 버전 스냅샷이 없어 article_version_id 없이 chunk를 생성했습니다."]
      : [],
  }
}
