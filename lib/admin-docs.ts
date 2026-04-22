import "server-only"

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
  docType: string
  productArea: string
  featured: boolean
  orderIndex: number
  publicPath: string
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
  doc_type: string
  product_area: string
  featured: boolean | null
  order_index: number | null
  updated_at: string | null
  published_at: string | null
  last_reviewed_at: string | null
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
    articles: staticArticles.map((article) => ({
      id: `${article.category}:${article.slug}`,
      categoryId: article.category,
      slug: article.slug,
      title: article.title,
      description: article.description,
      status: "static",
      visibility: "public",
      docType: "guide",
      productArea: "general",
      featured: Boolean(article.featured),
      orderIndex: 100,
      publicPath: getDocPath(article),
      updatedAt: article.updatedAt,
      publishedAt: null,
      lastReviewedAt: article.updatedAt,
    })),
    warnings,
  }
}

function getPublicPath(article: Pick<DocsArticleRow, "category_id" | "slug">) {
  return `/docs/${article.category_id}/${article.slug}`
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
            "id, category_id, slug, title, description, status, visibility, doc_type, product_area, featured, order_index, updated_at, published_at, last_reviewed_at"
          )
          .order("updated_at", { ascending: false }),
      ])

    if (categoryError) throw categoryError
    if (articleError) throw articleError

    const rows = (articleRows ?? []) as DocsArticleRow[]
    const articleCounts = new Map<string, number>()

    for (const article of rows) {
      articleCounts.set(article.category_id, (articleCounts.get(article.category_id) ?? 0) + 1)
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
      articles: rows.map((article) => ({
        id: article.id,
        categoryId: article.category_id,
        slug: article.slug,
        title: article.title,
        description: article.description,
        status: article.status,
        visibility: article.visibility,
        docType: article.doc_type,
        productArea: article.product_area,
        featured: Boolean(article.featured),
        orderIndex: article.order_index ?? 100,
        publicPath: getPublicPath(article),
        updatedAt: article.updated_at,
        publishedAt: article.published_at,
        lastReviewedAt: article.last_reviewed_at,
      })),
      warnings: [],
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
