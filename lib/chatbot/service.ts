import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getDocPath, listDocs, type DocArticle } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import {
  classifyChatbotQuestion,
  type ChatbotIntent,
} from "@/lib/chatbot/classification"
import { generateGeminiAnswer, embedText, type ChatbotModelTier } from "@/lib/chatbot/llm"
import {
  buildClientVectorSources,
  type VectorFallbackChunkRow,
} from "@/lib/chatbot/vector-fallback"
import {
  maybeCreateChannelTalkFeedbackHandoff,
  maybeCreateChannelTalkHandoff,
} from "@/lib/chatbot/channel-handoff"

const MAX_MESSAGE_LENGTH = 1000
const MAX_FEEDBACK_COMMENT_LENGTH = 500
const MAX_SOURCES = 4
const MAX_SOURCES_PER_DOC = 1
const MAX_RETRIEVAL_CANDIDATES = 24
const MAX_RETRIEVAL_CANDIDATES_PER_DOC = 3
const RETRIEVAL_CACHE_TTL_MS = 5 * 60 * 1000
const RETRIEVAL_CACHE_MAX = 200
const RETRIEVAL_CACHE_VERSION = "rag-rerank-20260617-v2"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHAT_SESSION_CHANNELS = new Set(["web", "admin_preview", "partner_portal", "manual_import"])

type AnswerMode =
  | "direct_answer"
  | "doc_suggestion"
  | "clarifying_question"
  | "handoff"
  | "fallback"

export interface ChatbotQueryRequest {
  message?: unknown
  sessionId?: unknown
  anonymousId?: unknown
  context?: unknown
}

export interface ChatbotRequestMeta {
  userAgent?: string | null
  referrer?: string | null
}

export interface ChatbotSource {
  articleId?: string
  chunkId?: string
  title: string
  heading?: string
  urlPath: string
  category: string
  excerpt: string
  score: number
}

export type HandoffIntent = "demo" | "support"

export interface ChatbotQueryResponse {
  answer: string
  answerMode: AnswerMode
  answerEventId?: string
  confidence: number
  needsHandoff: boolean
  handoffIntent: HandoffIntent
  sessionId?: string
  sources: ChatbotSource[]
  suggestedQuestions: string[]
  unresolved: boolean
  warning?: string
}

interface NormalizedQuestion {
  original: string
  normalized: string
  redacted: string
  piiRedacted: boolean
  tokens: string[]
}

interface KnowledgeSearchResult {
  sources: ChatbotSource[]
  warning?: string
  cacheHit?: boolean
}

interface SupabaseDocsArticle {
  id: string
  category_id: string
  slug: string
  title: string
  description: string
  canonical_path: string | null
  noindex: boolean
}

interface SupabaseChunkRow {
  id: string
  article_id: string
  heading: string | null
  content: string
  metadata: Record<string, unknown> | null
  docs_articles: SupabaseDocsArticle | SupabaseDocsArticle[] | null
}

const QUERY_EXPANSIONS: Record<string, string[]> = {
  as: ["a/s", "수리", "고장", "하드웨어"],
  "a/s": ["as", "수리", "고장", "하드웨어"],
  결제: ["영수증", "세금계산서", "증빙", "청구", "정산"],
  견적: ["도입", "비용", "가격", "요금", "플랜"],
  계정: ["로그인", "접속", "비밀번호", "권한"],
  과제: ["숙제", "학습", "복습"],
  녹화: ["다시보기", "playback", "라이브", "저장"],
  도입: ["온보딩", "시작", "세팅", "교육", "전환"],
  로그인: ["계정", "접속", "비밀번호", "권한"],
  보드: ["전자칠판", "classin board", "하드웨어", "설치"],
  비용: ["가격", "요금", "견적", "플랜"],
  세금계산서: ["영수증", "증빙", "결제", "사업자"],
  수업: ["교실", "classroom", "녹화", "과제", "출결"],
  숙제: ["과제", "학습", "복습"],
  오류: ["에러", "장애", "안됨", "문제"],
  요금: ["가격", "비용", "견적", "플랜"],
  영수증: ["세금계산서", "증빙", "결제", "사업자"],
  전자칠판: ["보드", "classin board", "하드웨어", "설치"],
  접속: ["로그인", "계정", "비밀번호", "권한"],
  출결: ["출석", "수업", "관리"],
  출석: ["출결", "수업", "관리"],
}

const retrievalCache = new Map<string, { expiresAt: number; value: KnowledgeSearchResult }>()

export class ChatbotInputError extends Error {
  status = 400
}

function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function redactPii(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g, "[business_number]")
    .replace(/\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[phone]")
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 || (token.length === 1 && /[\uac00-\ud7a3\u3130-\u318f\u4e00-\u9fff\u3040-\u30ff]/.test(token)))
        .slice(0, 12)
    )
  )
}

function getRetrievalTokens(question: NormalizedQuestion) {
  const expanded = question.tokens.flatMap((token) => QUERY_EXPANSIONS[token] ?? [])
  return Array.from(new Set([...question.tokens, ...expanded.flatMap(tokenize)])).slice(0, 24)
}

function getExpansionTokens(question: NormalizedQuestion) {
  const base = new Set(question.tokens)
  return getRetrievalTokens(question).filter((token) => !base.has(token))
}

function buildRetrievalQueryText(question: NormalizedQuestion) {
  const expansion = getExpansionTokens(question)
  return expansion.length > 0
    ? `${question.redacted} ${expansion.join(" ")}`
    : question.redacted
}

function getRetrievalCacheKey(question: NormalizedQuestion) {
  const backend = hasSupabaseServerEnv() ? "supabase" : "static"
  return `${RETRIEVAL_CACHE_VERSION}:${backend}:${buildRetrievalQueryText(question).toLowerCase()}`
}

function getCachedRetrieval(question: NormalizedQuestion): KnowledgeSearchResult | null {
  const key = getRetrievalCacheKey(question)
  const cached = retrievalCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    retrievalCache.delete(key)
    return null
  }

  return {
    ...cached.value,
    sources: cached.value.sources.map((source) => ({ ...source })),
    cacheHit: true,
  }
}

function setCachedRetrieval(question: NormalizedQuestion, value: KnowledgeSearchResult) {
  const key = getRetrievalCacheKey(question)
  if (retrievalCache.size >= RETRIEVAL_CACHE_MAX) {
    const firstKey = retrievalCache.keys().next().value
    if (firstKey) retrievalCache.delete(firstKey)
  }
  retrievalCache.set(key, {
    expiresAt: Date.now() + RETRIEVAL_CACHE_TTL_MS,
    value: {
      ...value,
      sources: value.sources.map((source) => ({ ...source })),
      cacheHit: false,
    },
  })
}

function elapsedSince(startedAt: number) {
  return Math.max(0, Date.now() - startedAt)
}

function normalizeQuestion(raw: unknown): NormalizedQuestion {
  const original = normalizeString(raw)
  if (!original) {
    throw new ChatbotInputError("상담받고 싶은 내용을 입력해 주세요.")
  }

  if (original.length > MAX_MESSAGE_LENGTH) {
    throw new ChatbotInputError(`문의 내용은 ${MAX_MESSAGE_LENGTH}자 이내로 입력해 주세요.`)
  }

  const normalized = original.replace(/\s+/g, " ").trim()
  const redacted = redactPii(normalized)
  const tokens = tokenize(redacted)

  return {
    original,
    normalized,
    redacted,
    piiRedacted: redacted !== normalized,
    tokens,
  }
}

function isGreetingOnly(question: NormalizedQuestion) {
  return /^(안녕|안녕하세요|하이|hello|hi)[.!?\s]*$/i.test(question.normalized)
}

function sanitizeLikeToken(token: string) {
  return token.replace(/[%_,()]/g, "").slice(0, 40)
}

function compactText(value: string, maxLength = 220) {
  const compacted = value
    .replace(/^#+\s*/gm, "")
    .replace(/[-*]\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (compacted.length <= maxLength) return compacted
  return `${compacted.slice(0, maxLength).trim()}...`
}

function isPositioningQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|줌|화상회의|뭐가\s*달라|차이|비교|일반\s*전자칠판|기존\s*전자칠판|왜\s*전자칠판|edb|칠판\s*파일|가격\s*부담|비싸|api|sdk|연동|데이터\s*구독|도구.*흩어|녹화.*관리/.test(text)
}

function isApiIntegrationQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /api|sdk|연동|데이터\s*구독|가상계정|수업\s*중계|코스\s*정보|수업\s*정보|crm|lms/.test(text)
}

function isComparisonQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /zoom|줌|화상회의|뭐가\s*달라|차이|비교|일반\s*전자칠판|기존\s*전자칠판/.test(text)
}

function isApiSource(source: Pick<ChatbotSource, "title" | "heading" | "excerpt" | "category">) {
  const text = `${source.title} ${source.heading ?? ""} ${source.excerpt} ${source.category}`.toLowerCase()
  return /api|sdk|데이터\s*활용|api\s*도킹|연동\s*범위|crm|학사관리/.test(text)
}

function buildPositioningSource(question: NormalizedQuestion): ChatbotSource | null {
  if (!isPositioningQuestion(question)) return null
  const text = question.redacted.toLowerCase()
  const isEdbQuestion = /edb|칠판\s*파일|교안/.test(text)
  const isApiQuestion = isApiIntegrationQuestion(question)
  const heading = isEdbQuestion
    ? "EDB와 교안 표준화"
    : isApiQuestion
      ? "API와 정직한 연동 범위"
      : "핵심 포지셔닝"
  const excerpt = isEdbQuestion
    ? CLASSIN_POSITIONING.edbSummary
    : isApiQuestion
      ? `${CLASSIN_POSITIONING.honestLimit} ${CLASSIN_POSITIONING.apiStages.join(" ")}`
      : CLASSIN_POSITIONING.chatbot.identitySummary

  return {
    title: "Classin을 학원 시스템 OS로 이해하기",
    heading,
    urlPath: "/docs/start/academy-system-os-positioning",
    category: "onboarding",
    excerpt: compactText(excerpt),
    score: 260,
  }
}

function buildStaticDocSource(
  category: DocArticle["category"],
  slug: string,
  heading: string,
  excerpt: string,
  score = 250
): ChatbotSource | null {
  const doc = listDocs().find((candidate) => candidate.category === category && candidate.slug === slug)
  if (!doc) return null

  return {
    title: doc.title,
    heading,
    urlPath: getDocPath(doc),
    category: getSourceCategoryFromDocCategory(doc.category),
    excerpt: compactText(excerpt || doc.chatbotSummary || doc.description),
    score,
  }
}

function buildCuratedSources(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  const sources: ChatbotSource[] = []
  const positioningSource = buildPositioningSource(question)
  if (positioningSource) sources.push(positioningSource)

  if (/수업\s*(정보|데이터).*api|api.*(수업|데이터|연동)|데이터\s*구독|자체\s*관리\s*시스템/.test(text)) {
    const source = buildStaticDocSource(
      "start",
      "academy-system-os-positioning",
      "API와 정직한 연동 범위",
      `${CLASSIN_POSITIONING.honestLimit} ${CLASSIN_POSITIONING.apiStages.join(" ")}`,
      280
    )
    if (source) sources.push(source)
  }

  if (/수업\s*녹화.*현장\s*녹화|현장\s*녹화|온스테이지|하이브리드\s*수업|개인\s*칠판|트래킹\s*뷰/.test(text)) {
    const source = buildStaticDocSource(
      "teacher",
      "lesson-option-concepts",
      "수업 옵션 개념",
      "수업 녹화, 현장 녹화, 온스테이지, 학생 자동 온스테이지, 하이브리드 수업, 개인 칠판은 수업 운영 목적에 따라 구분해 설정합니다.",
      280
    )
    if (source) sources.push(source)
  }

  if (/omr|오엠알|녹화\s*수업.*(시청|제한|플레이바|횟수)|일일\s*과제|요일\s*반복|ai\s*(자동\s*)?(채점|출제)|자동\s*채점/.test(text)) {
    const source = buildStaticDocSource(
      "teacher",
      "course-activities",
      "학습 활동 추가",
      "수업, 숙제, 시험, 녹화 수업, 일일 과제, OMR 카드, AI 활동은 코스의 활동 게시 흐름에서 추가하고 제출/채점/시청 옵션을 설정합니다.",
      280
    )
    if (source) sources.push(source)
  }

  if (/관리자.*(api\s*도킹|라이브\s*&?\s*플레이백|자동\s*동기화)|api\s*도킹|관리자\s*콘솔.*(코스|학생).*동기화/.test(text)) {
    const source = buildStaticDocSource(
      "admin",
      "admin-operation-standardization",
      "관리자 운영 표준화",
      "관리자 콘솔의 코스, 학생, 웹 라이브와 플레이백, API 도킹은 운영 표준과 권한 범위를 분리해 확인해야 합니다.",
      280
    )
    if (source) sources.push(source)
  }

  return sources
}

function getMetadataStrings(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return []

  return Object.values(metadata)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string")
}

function scoreText(question: NormalizedQuestion, source: Omit<ChatbotSource, "score">, extras: string[] = []) {
  const haystacks = {
    title: source.title.toLowerCase(),
    heading: (source.heading ?? "").toLowerCase(),
    excerpt: source.excerpt.toLowerCase(),
    category: source.category.toLowerCase(),
    extras: extras.join(" ").toLowerCase(),
  }

  let score = 0
  let matchesAll = true

  const scoreToken = (token: string, weight = 1) => {
    let tokenMatched = false

    if (haystacks.title.includes(token)) {
      score += 15 * weight
      tokenMatched = true
    }
    if (haystacks.heading.includes(token)) {
      score += 10 * weight
      tokenMatched = true
    }
    if (haystacks.excerpt.includes(token)) {
      score += 5 * weight
      tokenMatched = true
    }
    if (haystacks.category.includes(token)) {
      score += 2 * weight
      tokenMatched = true
    }
    if (haystacks.extras.includes(token)) {
      score += 8 * weight
      tokenMatched = true
    }

    return tokenMatched
  }

  for (const token of question.tokens) {
    if (!scoreToken(token)) matchesAll = false
  }

  for (const token of getExpansionTokens(question)) {
    scoreToken(token, 0.45)
  }

  // Bonus for matching all tokens (AND-match gets high priority)
  if (matchesAll && question.tokens.length > 1) {
    score += 50
  }

  return score
}

function rerankSources(question: NormalizedQuestion, sources: ChatbotSource[]) {
  const suppressApiForComparison =
    isComparisonQuestion(question) && !isApiIntegrationQuestion(question)

  return sources.map((source) => {
    const apiPenalty = suppressApiForComparison && isApiSource(source) ? 140 : 0
    const positioningBonus =
      isComparisonQuestion(question) &&
      source.urlPath.includes("/docs/start/academy-system-os-positioning")
        ? 45
        : 0

    return {
      ...source,
      score: source.score + Math.min(35, scoreText(question, source) * 0.35) + positioningBonus - apiPenalty,
    }
  })
}

function mergeScoredSources(sources: ChatbotSource[]) {
  const merged = new Map<string, ChatbotSource>()

  for (const source of sources) {
    const key = source.chunkId ?? `${source.urlPath}:${source.heading ?? ""}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...source })
      continue
    }

    existing.score = Math.max(existing.score, source.score) + Math.min(20, source.score * 0.2)
  }

  return Array.from(merged.values())
}

function selectDiverseSources(
  sources: ChatbotSource[],
  limit = MAX_SOURCES,
  maxSourcesPerDoc = MAX_SOURCES_PER_DOC
) {
  const seenChunks = new Set<string>()
  const perPath = new Map<string, number>()
  const selected: ChatbotSource[] = []

  for (const source of sources.sort((left, right) => right.score - left.score)) {
    if (source.score <= 0) continue
    const chunkKey = source.chunkId ?? `${source.urlPath}:${source.heading ?? ""}`
    if (seenChunks.has(chunkKey)) continue

    const pathCount = perPath.get(source.urlPath) ?? 0
    if (pathCount >= maxSourcesPerDoc) continue

    seenChunks.add(chunkKey)
    perPath.set(source.urlPath, pathCount + 1)
    selected.push(source)
    if (selected.length >= limit) break
  }

  return selected
}

function mergeCuratedSources(question: NormalizedQuestion, sources: ChatbotSource[]) {
  const curatedSources = buildCuratedSources(question)
  if (curatedSources.length === 0) return selectDiverseSources(rerankSources(question, sources))
  return selectDiverseSources(rerankSources(question, mergeScoredSources([...curatedSources, ...sources])))
}

function getSourceCategoryFromDocCategory(category: string) {
  if (category === "start") return "onboarding"
  if (category === "hardware" || category === "board") return "hardware"
  if (category === "admin") return "admin"
  if (category === "software" || category === "teacher" || category === "student") {
    return "classroom"
  }
  return "guide"
}

function getDocCategory(doc: DocArticle) {
  return getSourceCategoryFromDocCategory(doc.category)
}

function getFallbackDocsFromStatic() {
  return listDocs().filter((doc) => !doc.noindex && (doc.visibility ?? "public") !== "internal")
}

async function getFallbackDocs() {
  try {
    const content = await getDocsContent()
    return content.docs.filter(
      (doc) => !doc.noindex && (doc.visibility ?? "public") !== "internal"
    )
  } catch {
    return getFallbackDocsFromStatic()
  }
}

function buildStaticSources(question: NormalizedQuestion, docs: DocArticle[]): ChatbotSource[] {
  const sources = docs.flatMap((doc) => {
    const summarySource = {
      title: doc.title,
      heading: "요약",
      urlPath: getDocPath(doc),
      category: getDocCategory(doc),
      excerpt: compactText([doc.description, doc.chatbotSummary].join(" ")),
    }

    const summaryScore = scoreText(question, summarySource, [
      ...doc.tags,
      ...doc.keywords,
      doc.audience,
    ])

    const sectionSources = doc.sections.map((section) => {
      const source = {
        title: doc.title,
        heading: section.heading,
        urlPath: getDocPath(doc),
        category: getDocCategory(doc),
        excerpt: compactText(
          [section.body, ...(section.steps ?? [])].join(" "),
        ),
      }

      return {
        ...source,
        score: scoreText(question, source, [...doc.tags, ...doc.keywords]),
      }
    })

    return [
      { ...summarySource, score: summaryScore },
      ...sectionSources,
    ]
  })

  return selectDiverseSources(
    sources
      .filter((source) => source.score > 0)
      .sort((left, right) => right.score - left.score)
  )
}

async function keywordSearchSupabaseSources(question: NormalizedQuestion): Promise<ChatbotSource[]> {
  if (!hasSupabaseServerEnv()) return []

  const likeTokens = getRetrievalTokens(question).map(sanitizeLikeToken).filter(Boolean).slice(0, 10)
  if (likeTokens.length === 0) return []

  const orFilter = likeTokens
    .flatMap((token) => [`content.ilike.%${token}%`, `heading.ilike.%${token}%`])
    .join(",")

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("docs_ai_chunks")
      .select(
        "id, article_id, heading, content, metadata, docs_articles!inner(id, category_id, slug, title, description, canonical_path, status, visibility, noindex)"
      )
      .eq("docs_articles.status", "published")
      .in("docs_articles.visibility", ["public", "unlisted"])
      .eq("docs_articles.noindex", false)
      .or(orFilter)
      .limit(MAX_RETRIEVAL_CANDIDATES * 2)

    if (error) {
      console.warn("[chatbot] docs chunk search failed:", error.message)
      return []
    }

    const sources = ((data ?? []) as SupabaseChunkRow[])
      .map((row) => {
        const article = Array.isArray(row.docs_articles)
          ? row.docs_articles[0]
          : row.docs_articles
        if (!article) return null

        const source: Omit<ChatbotSource, "score"> = {
          articleId: article.id,
          chunkId: row.id,
          title: article.title,
          heading: row.heading ?? undefined,
          urlPath: article.canonical_path ?? `/docs/${article.category_id}/${article.slug}`,
          category: getSourceCategoryFromDocCategory(article.category_id),
          excerpt: compactText(row.content),
        }

        return {
          ...source,
          score: Math.max(
            1,
            scoreText(question, source, [
              row.content,
              ...getMetadataStrings(row.metadata),
            ])
          ),
        }
      })
      .filter((source): source is ChatbotSource => source != null)
      .sort((left, right) => right.score - left.score)

    return selectDiverseSources(
      rerankSources(question, sources),
      MAX_RETRIEVAL_CANDIDATES,
      MAX_RETRIEVAL_CANDIDATES_PER_DOC
    )
  } catch (error) {
    console.warn(
      "[chatbot] Supabase search unavailable:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}

const VECTOR_MATCH_COUNT = MAX_RETRIEVAL_CANDIDATES
const VECTOR_SIMILARITY_FLOOR = 0.28
const CLIENT_VECTOR_SIMILARITY_FLOOR = 0.7

interface MatchChunkRow {
  id: string
  article_id: string
  heading: string | null
  content: string
  metadata: Record<string, unknown> | null
  category_id: string
  slug: string
  title: string
  canonical_path: string | null
  similarity: number
}

// Gemini 임베딩 기반 시맨틱 검색. 키·임베딩이 없거나 결과가 없으면 [] → 키워드 검색으로 폴백.
async function vectorSearchSupabaseSources(
  question: NormalizedQuestion,
  embedding: number[]
): Promise<ChatbotSource[]> {
  if (!hasSupabaseServerEnv()) return []

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc("match_docs_ai_chunks", {
      // pgvector 컬럼/인자는 "[..]" 문자열로 넘긴다 (배열 직접 전달 시 Postgres 배열로 직렬화돼 거부됨).
      query_embedding: JSON.stringify(embedding),
      match_count: VECTOR_MATCH_COUNT,
    })

    if (error) {
      console.warn("[chatbot] vector search failed:", error.message)
      return []
    }

    const sources = ((data ?? []) as MatchChunkRow[])
      .filter((row) => row.similarity >= VECTOR_SIMILARITY_FLOOR)
      .map((row) => ({
        articleId: row.article_id,
        chunkId: row.id,
        title: row.title,
        heading: row.heading ?? undefined,
        urlPath: row.canonical_path ?? `/docs/${row.category_id}/${row.slug}`,
        category: getSourceCategoryFromDocCategory(row.category_id),
        excerpt: compactText(row.content),
        score: Math.max(1, row.similarity * 80),
      }))
      .sort((left, right) => right.score - left.score)

    return selectDiverseSources(
      rerankSources(question, sources),
      MAX_RETRIEVAL_CANDIDATES,
      MAX_RETRIEVAL_CANDIDATES_PER_DOC
    )
  } catch (error) {
    console.warn(
      "[chatbot] vector search unavailable:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}

async function clientVectorSearchSupabaseSources(embedding: number[]): Promise<ChatbotSource[]> {
  if (!hasSupabaseServerEnv()) return []

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("docs_ai_chunks")
      .select(
        "id, article_id, heading, content, embedding, docs_articles!inner(id, category_id, slug, title, description, canonical_path, status, visibility, noindex)"
      )
      .eq("docs_articles.status", "published")
      .in("docs_articles.visibility", ["public", "unlisted"])
      .eq("docs_articles.noindex", false)
      .not("embedding", "is", null)
      .limit(500)

    if (error) {
      console.warn("[chatbot] client vector fallback failed:", error.message)
      return []
    }

    return buildClientVectorSources(
      embedding,
      (data ?? []) as VectorFallbackChunkRow[],
      {
        maxSources: MAX_RETRIEVAL_CANDIDATES,
        similarityFloor: CLIENT_VECTOR_SIMILARITY_FLOOR,
      }
    )
  } catch (error) {
    console.warn(
      "[chatbot] client vector fallback unavailable:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}

// 벡터·키워드 후보를 함께 수집해 재랭킹한다. 벡터는 recall, 키워드는 정확 match를 보완한다.
async function searchSupabaseSources(question: NormalizedQuestion): Promise<ChatbotSource[]> {
  const keywordPromise = keywordSearchSupabaseSources(question)
  const embedding = await embedText(buildRetrievalQueryText(question), "RETRIEVAL_QUERY")
  const vectorSources = embedding ? await vectorSearchSupabaseSources(question, embedding) : []
  const keywordSources = await keywordPromise
  const combined = selectDiverseSources(
    rerankSources(question, mergeScoredSources([...vectorSources, ...keywordSources]))
  )

  if (combined.length > 0) return combined

  if (!embedding) return []

  return selectDiverseSources(
    rerankSources(question, await clientVectorSearchSupabaseSources(embedding))
  )
}

async function searchKnowledgeSources(
  question: NormalizedQuestion
): Promise<KnowledgeSearchResult> {
  const cached = getCachedRetrieval(question)
  if (cached) return cached

  const supabaseSources = await searchSupabaseSources(question)
  if (supabaseSources.length > 0) {
    const result = { sources: mergeCuratedSources(question, supabaseSources), warning: undefined }
    setCachedRetrieval(question, result)
    return result
  }

  const fallbackDocs = await getFallbackDocs()
  const staticSources = buildStaticSources(question, fallbackDocs)

  const result = {
    sources: mergeCuratedSources(question, staticSources),
    warning: hasSupabaseServerEnv()
      ? "Supabase 문서 chunk 검색 결과가 없어 문서 원문 fallback을 사용했습니다."
      : "Supabase 환경변수가 없어 정적 문서 fallback을 사용했습니다.",
  }
  setCachedRetrieval(question, result)
  return result
}

function buildSuggestedQuestions(sources: ChatbotSource[]) {
  const suggestions = sources.map((source) =>
    source.heading && source.heading !== "요약"
      ? `${source.heading} 내용을 더 알려주세요`
      : `${source.title} 내용을 더 알려주세요`
  )

  return Array.from(
    new Set([
      ...suggestions,
      ...CLASSIN_POSITIONING.chatbot.fallbackQuestions,
      "담당자 상담으로 이어주세요",
    ])
  ).slice(0, 3)
}

function wantsHumanConsultation(question: NormalizedQuestion) {
  return /상담|문의|연락|견적|데모|시연|미팅|제안|담당자|통화|구매|도입\s*검토|도입\s*상담/.test(
    question.redacted.toLowerCase()
  )
}

function getNextStepByCategory(category: string) {
  switch (category) {
    case "billing":
      return "결제 수단, 사업자 정보, 필요한 증빙 종류를 함께 알려주시면 처리 경로를 더 정확히 안내할 수 있어요."
    case "hardware":
      return "설치 장소, 희망 대수, 스탠드/벽걸이 여부, 기존 전자칠판 사용 경험을 알려주시면 Classin Board 패키지 범위를 좁힐 수 있어요."
    case "troubleshooting":
      return "사용 중인 기기, 브라우저/앱, 오류가 발생한 화면을 알려주시면 해결 순서를 더 잘 잡을 수 있어요."
    case "onboarding":
      return "대표 수업 1개, 설치 예정 교실, 희망 도입 시점, 현재 쓰는 전자칠판·녹화·LMS 도구를 알려주시면 90일 도입 순서를 맞춰드릴게요."
    case "admin":
      return "관리자 권한 범위, 보고 싶은 수업 데이터, API 연동 여부, 결제·출석처럼 별도 시스템이 필요한 업무를 알려주시면 운영 설정 흐름으로 좁혀드릴게요."
    case "classroom":
      return "현재 수업 운영에서 가장 막히는 지점을 알려주시면 기능과 운영 방법을 함께 제안드릴게요."
    default:
      return "조금 더 구체적인 상황을 알려주시면 필요한 문서와 상담 경로를 이어서 안내드릴게요."
  }
}

function getStepCriteriaByCategory(category: string) {
  switch (category) {
    case "billing":
      return {
        steps: [
          "결제 수단, 사업자 정보, 필요한 증빙 종류를 먼저 확인해 주세요.",
          "견적·세금계산서·환불처럼 계정별 확인이 필요한 항목은 상담으로 넘겨 주세요.",
        ],
        success: "담당자가 결제/증빙 처리에 필요한 식별 정보와 요청 범위를 확인할 수 있으면 다음 단계로 넘어갈 수 있습니다.",
      }
    case "hardware":
      return {
        steps: [
          "설치 장소, 대수, 스탠드/벽걸이 여부를 먼저 정리해 주세요.",
          "카메라·마이크·전자칠판 문제는 증상 화면과 사용 기기를 함께 확인해 주세요.",
        ],
        success: "설치 조건이나 장애 증상이 구체화되면 견적/AS/설치 상담으로 바로 이어갈 수 있습니다.",
      }
    case "troubleshooting":
      return {
        steps: [
          "발생 화면, 기기, 브라우저/앱, 계정 상태를 먼저 확인해 주세요.",
          "반복 오류나 수업 영향이 있으면 상담으로 넘겨 담당자가 로그와 계정 상태를 함께 확인하게 해 주세요.",
        ],
        success: "재현 조건과 영향 범위가 확인되면 해결 순서를 정확히 잡을 수 있습니다.",
      }
    case "onboarding":
      return {
        steps: [
          "대표 수업 1개를 기준으로 현재 운영 흐름과 막히는 지점을 정리해 주세요.",
          "설치 교실, 희망 도입 시점, 기존 도구를 함께 놓고 90일 전환 순서를 잡아 주세요.",
        ],
        success: "도입 범위와 첫 수업 기준이 정해지면 세팅/교육/운영 전환 계획을 만들 수 있습니다.",
      }
    case "admin":
      return {
        steps: [
          "관리자 권한 범위와 변경하려는 메뉴를 먼저 확인해 주세요.",
          "코스·교사·학생·통계·API처럼 영향을 받는 운영 영역을 함께 점검해 주세요.",
        ],
        success: "설정 변경이 어떤 코스/수업/구성원에게 적용되는지 설명할 수 있으면 안전하게 진행할 수 있습니다.",
      }
    case "classroom":
      return {
        steps: [
          "수업 전, 수업 중, 수업 후 중 어디에서 문제가 생기는지 먼저 나눠 주세요.",
          "숙제·녹화·리포트·채팅처럼 연결된 학습 활동을 함께 확인해 주세요.",
        ],
        success: "막히는 수업 단계와 관련 기능이 특정되면 필요한 문서나 상담 흐름으로 좁힐 수 있습니다.",
      }
    default:
      return {
        steps: [
          "질문의 목적이 도입, 운영, 계정/오류, 결제 중 어디에 가까운지 먼저 확인해 주세요.",
          "관련 화면이나 현재 하고 싶은 작업을 한 문장 더 알려 주세요.",
        ],
        success: "상황과 목표가 분리되면 문서 답변 또는 상담 연결 중 알맞은 경로를 선택할 수 있습니다.",
      }
  }
}

function formatStructuredAnswer({
  answerMode,
  category,
  top,
}: {
  answerMode: AnswerMode
  category: string
  top: ChatbotSource
}) {
  const criteria = getStepCriteriaByCategory(category)
  const caution =
    answerMode === "handoff"
      ? "\n\n주의: 이 내용은 실제 계정, 계약, 장비 상태, 도입 조건에 따라 달라질 수 있어 상담으로 이어드리는 편이 안전합니다."
      : ""

  return [
    `요약: "${top.title}"${top.heading ? ` (${top.heading})` : ""} 기준으로 보면 ${top.excerpt}`,
    caution.trim(),
    "권장 순서:",
    ...criteria.steps.map((step, index) => `${index + 1}. ${step}`),
    `확인 기준: ${criteria.success}`,
    `다음 단계: ${getNextStepByCategory(category)}`,
  ].filter(Boolean).join("\n\n")
}

function isUsableGeneratedAnswer(answer: string) {
  const trimmed = answer.trim()
  if (trimmed.length < 80) return false
  if (/[,\u3131-\u314e]$/.test(trimmed)) return false
  return /(?:[.!?]|\u3002|요|니다|습니다|합니다|세요)$/.test(trimmed)
}

function composeAnswer(
  question: NormalizedQuestion,
  sources: ChatbotSource[],
  category: string
): Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> {
  if (sources.length === 0) {
    const needsConsultation = wantsHumanConsultation(question)
    const isVague = question.tokens.length < 2 && !needsConsultation
    const needsSupportHandoff = ["billing", "hardware", "troubleshooting"].includes(category)
    const needsHandoff = needsConsultation || needsSupportHandoff

    if (isVague) {
      return {
        answer:
          "상황을 조금만 더 알려주시면 더 정확히 안내드릴 수 있어요. 예를 들어 도입 상담, 수업 운영, 결제/영수증, 계정 오류 중 어떤 내용인지 적어주세요.",
        answerMode: "clarifying_question",
        confidence: 0.25,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: ["도입 상담을 받고 싶어요", "수업 운영 문제를 해결하고 싶어요", "결제나 영수증 문의가 있어요"],
        unresolved: true,
      }
    }

    const fallbackCriteria = getStepCriteriaByCategory(category)
    return {
      answer: [
        needsConsultation
          ? "요약: 상담이 필요한 내용으로 확인했습니다."
          : needsSupportHandoff
            ? "요약: 확인 가능한 문서에서 바로 답을 찾지 못했습니다. 담당자가 안전하게 확인할 수 있도록 상담으로 이어드릴게요."
            : "요약: 확인 가능한 문서에서 바로 답을 찾지 못했습니다. 운영 환경이나 오류 상황을 조금 더 구체적으로 알려주세요.",
        "권장 순서:",
        ...fallbackCriteria.steps.map((step, index) => `${index + 1}. ${step}`),
        `확인 기준: ${fallbackCriteria.success}`,
      ].join("\n\n"),
      answerMode: needsHandoff ? "handoff" : "fallback",
      confidence: needsHandoff ? 0.4 : 0.15,
      needsHandoff: true,
      sources: [],
      suggestedQuestions: ["도입 상담을 받고 싶어요", "요금과 견적이 궁금해요", "계정이나 수업 접속 문제가 있어요"],
      unresolved: true,
    }
  }

  const top = sources[0]
  const confidence = Math.min(0.92, Math.max(0.35, 0.45 + top.score / 25))
  const lowConfidence = confidence < 0.58
  const sensitiveLowConfidence =
    lowConfidence && ["billing", "hardware", "troubleshooting"].includes(category)
  const explicitConsultation = wantsHumanConsultation(question)
  const answerMode: AnswerMode = explicitConsultation || sensitiveLowConfidence
    ? "handoff"
    : top.score >= 4
      ? "direct_answer"
      : "doc_suggestion"

  const answer = formatStructuredAnswer({ answerMode, category, top })

  return {
    answer,
    answerMode,
    confidence,
    needsHandoff: answerMode === "handoff",
    sources,
    suggestedQuestions: buildSuggestedQuestions(sources),
    unresolved: answerMode === "handoff" || answerMode === "doc_suggestion",
  }
}

function normalizeOptionalUuid(value: unknown) {
  const candidate = normalizeString(value)
  return candidate && UUID_RE.test(candidate) ? candidate : undefined
}

function getContextObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeChatSessionChannel(value: unknown) {
  const channel = normalizeString(value)
  return channel && CHAT_SESSION_CHANNELS.has(channel) ? channel : "web"
}

async function ensureSession(
  input: ChatbotQueryRequest,
  meta: ChatbotRequestMeta
) {
  if (!hasSupabaseServerEnv()) return undefined

  const supabase = createSupabaseAdminClient()
  const requestedSessionId = normalizeOptionalUuid(input.sessionId)

  if (requestedSessionId) {
    const { data } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", requestedSessionId)
      .maybeSingle()

    if (data?.id) return data.id as string
  }

  const context = getContextObject(input.context)
  const utm = getContextObject(context.utm)
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      channel: normalizeChatSessionChannel(context.channel),
      anonymous_id: normalizeString(input.anonymousId) ?? null,
      user_agent: meta.userAgent ?? null,
      referrer: meta.referrer ?? null,
      utm,
    })
    .select("id")
    .single()

  if (error) {
    console.warn("[chatbot] failed to create session:", error.message)
    return undefined
  }

  return data.id as string
}

async function persistExchange(
  input: ChatbotQueryRequest,
  question: NormalizedQuestion,
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "handoffIntent">,
  meta: ChatbotRequestMeta,
  category: string,
  intent: string,
  handoffIntent: HandoffIntent,
  latencyMs?: number,
  sessionId?: string
) {
  if (!hasSupabaseServerEnv()) return {}

  try {
    const supabase = createSupabaseAdminClient()
    const resolvedSessionId = sessionId || await ensureSession(input, meta)
    if (!resolvedSessionId) return {}

    const { data: userMessage, error: userMessageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id: resolvedSessionId,
        role: "user",
        content: question.redacted,
        normalized_content: question.redacted,
        pii_redacted: question.piiRedacted,
        language: "ko",
      })
      .select("id")
      .single()

    if (userMessageError) throw userMessageError

    const { data: assistantMessage, error: assistantMessageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id: resolvedSessionId,
        role: "assistant",
        content: response.answer,
        normalized_content: response.answer,
        pii_redacted: false,
        language: "ko",
      })
      .select("id")
      .single()

    if (assistantMessageError) throw assistantMessageError

    const { data: answerEvent, error: answerEventError } = await supabase
      .from("chatbot_answer_events")
      .insert({
        session_id: resolvedSessionId,
        user_message_id: userMessage.id,
        assistant_message_id: assistantMessage.id,
        normalized_question: question.redacted,
        detected_intent: intent,
        detected_category: category,
        answer_mode: response.answerMode,
        confidence: response.confidence,
        unresolved: response.unresolved,
        latency_ms: latencyMs ?? null,
      })
      .select("id")
      .single()

    if (answerEventError) throw answerEventError

    const citations = response.sources
      .map((source, index) => ({
        answer_event_id: answerEvent.id,
        article_id: source.articleId ?? null,
        chunk_id: source.chunkId ?? null,
        rank: index + 1,
        score: source.score,
        citation_kind: "retrieval",
      }))
      .filter((citation) => citation.article_id || citation.chunk_id)

    const context = getContextObject(input.context)
    const sideEffects = [
      citations.length > 0
        ? supabase.from("chatbot_answer_citations").insert(citations).then(({ error }) => {
            if (error) throw error
          })
        : Promise.resolve(),
      upsertQuestionCluster(
        supabase,
        answerEvent.id as string,
        question,
        response,
        category
      ),
      supabase.from("docs_search_events").insert({
        query: question.redacted,
        normalized_query: buildRetrievalQueryText(question),
        result_count: response.sources.length,
        visitor_id: normalizeString(input.anonymousId) ?? null,
        session_id: resolvedSessionId,
        source: "chatbot",
      }).then(({ error }) => {
        if (error) throw error
      }),
      maybeCreateChannelTalkHandoff({
        answerEventId: answerEvent.id as string,
        sessionId: resolvedSessionId,
        anonymousId: normalizeString(input.anonymousId) ?? null,
        referrer: meta.referrer ?? null,
        pageUrl: normalizeString(context.pageUrl) ?? null,
        path: normalizeString(context.path) ?? null,
        question: question.redacted,
        answer: response.answer,
        answerMode: response.answerMode,
        confidence: response.confidence,
        unresolved: response.unresolved,
        needsHandoff: response.needsHandoff,
        detectedCategory: category,
        detectedIntent: intent,
        handoffIntent,
        sources: response.sources,
      }),
    ]

    const sideEffectResults = await Promise.allSettled(sideEffects)
    for (const result of sideEffectResults) {
      if (result.status === "rejected") {
        console.warn(
          "[chatbot] failed to persist exchange side effect:",
          result.reason instanceof Error ? result.reason.message : result.reason
        )
      }
    }

    return {
      answerEventId: answerEvent.id as string,
      sessionId: resolvedSessionId,
    }
  } catch (error) {
    console.warn(
      "[chatbot] failed to persist exchange:",
      error instanceof Error ? error.message : error
    )
    return {}
  }
}

async function upsertQuestionCluster(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  answerEventId: string,
  question: NormalizedQuestion,
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "handoffIntent">,
  category: string
) {
  const topSource = response.sources[0]

  try {
    const { data: existing, error: existingError } = await supabase
      .from("question_clusters")
      .select("id, sample_questions")
      .eq("canonical_question", question.redacted)
      .maybeSingle()

    if (existingError) throw existingError

    const existingCluster = existing as { id: string; sample_questions: string[] | null } | null
    let clusterId = existingCluster?.id

    if (existingCluster && clusterId) {
      const sampleQuestions = Array.from(
        new Set([question.redacted, ...(existingCluster.sample_questions ?? [])])
      ).slice(0, 5)

      const { error } = await supabase
        .from("question_clusters")
        .update({
          category,
          last_seen_at: new Date().toISOString(),
          sample_questions: sampleQuestions,
        })
        .eq("id", clusterId)

      if (error) throw error
    } else {
      const { data: inserted, error } = await supabase
        .from("question_clusters")
        .insert({
          label: question.redacted.slice(0, 120),
          canonical_question: question.redacted,
          category,
          mapped_article_id: topSource?.articleId ?? null,
          mapped_chunk_id: topSource?.chunkId ?? null,
          sample_questions: [question.redacted],
          status: "candidate",
          metadata: {
            source: "chatbot_mvp_exact_match",
            answerMode: response.answerMode,
          },
        })
        .select("id")
        .single()

      if (error) throw error
      clusterId = inserted.id as string
    }

    const { error: linkError } = await supabase
      .from("question_cluster_events")
      .insert({
        cluster_id: clusterId,
        answer_event_id: answerEventId,
        similarity: 1,
      })

    if (linkError) throw linkError
  } catch (error) {
    console.warn(
      "[chatbot] failed to upsert question cluster:",
      error instanceof Error ? error.message : error
    )
  }
}

interface ChatbotCore {
  question: NormalizedQuestion
  response: ReturnType<typeof composeAnswer>
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  warning?: string
  latencyMs: number
  retrievalCacheHit?: boolean
}

interface BuildChatbotCoreOptions {
  sessionId?: string
  generateAnswer?: boolean
}

function determineModelTier(category: string): ChatbotModelTier {
  // 문제 해결(troubleshooting) 및 하드웨어(hardware) 장애/설정은 추론 모델 적용
  if (category === "troubleshooting" || category === "hardware") {
    return "reasoning"
  }
  
  // 결제(billing) 및 도입/상담(consultation) 등 비즈니스 중요 문의는 심화 모델 적용
  if (category === "billing" || category === "consultation") {
    return "advanced"
  }

  // 일반 안내, 온보딩, 교실 운영 등은 기본 모델 적용
  return "basic"
}

function shouldUseFastStructuredAnswer(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
) {
  const top = response.sources[0]
  if (!top) return false
  if (response.answerMode !== "direct_answer" && response.answerMode !== "doc_suggestion") return false

  // Scores above this threshold come from curated sources, not ordinary vector hits.
  // They are already structured and grounded, so skipping LLM rewriting materially lowers latency.
  return response.confidence >= 0.9 && top.score >= 240
}

// 검색 → 답변 구성 → 필요 시 Gemini 답변 생성까지의 코어. 영속화(persistExchange)는 포함하지 않는다.
// handleChatbotQuery(실서비스)와 evaluateChatbotQuery(품질 평가)가 공유한다.
async function buildChatbotCore(
  message: unknown,
  options: BuildChatbotCoreOptions = {}
): Promise<ChatbotCore> {
  const startedAt = Date.now()
  const shouldGenerateAnswer = options.generateAnswer !== false
  const question = normalizeQuestion(message)
  if (isGreetingOnly(question)) {
    return {
      question,
      response: {
        answer:
          "안녕하세요. 도입 상담, 수업 운영, 계정/오류, 결제/영수증 중 어떤 내용이 필요한지 알려주시면 바로 이어서 안내드릴게요.",
        answerMode: "clarifying_question",
        confidence: 0.3,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: ["도입 상담을 받고 싶어요", "수업 운영 문제를 해결하고 싶어요", "결제나 영수증 문의가 있어요"],
        unresolved: true,
      },
      category: "general",
      intent: "docs_lookup",
      handoffIntent: "demo",
      latencyMs: elapsedSince(startedAt),
    }
  }
  const { sources, warning, cacheHit } = await searchKnowledgeSources(question)
  const { category, intent, handoffIntent } = classifyChatbotQuestion(
    question.redacted,
    sources.map((source) => source.category)
  )
  const response = composeAnswer(question, sources, category)

  // 대화 기록 (History) 조회 및 가공
  let history: { role: "user" | "model"; parts: { text: string }[] }[] = []
  if (shouldGenerateAnswer && options.sessionId && hasSupabaseServerEnv()) {
    try {
      const supabase = createSupabaseAdminClient()
      const { data, error } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", options.sessionId)
        .order("created_at", { ascending: true })
        .limit(10) // 최근 10개 메세지 (사용자 5, 어시스턴트 5)

      if (!error && data) {
        const mapped = data.map((msg) => ({
          role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
          parts: [{ text: msg.content }],
        }))

        // 교차 대화 필터링 (user, model, user, model 순서 유지)
        const cleanHistory = []
        let expectedRole: "user" | "model" = "user"
        for (const msg of mapped) {
          if (msg.role === expectedRole) {
            cleanHistory.push(msg)
            expectedRole = expectedRole === "user" ? "model" : "user"
          }
        }
        if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === "user") {
          cleanHistory.pop()
        }
        history = cleanHistory
      }
    } catch (e) {
      console.warn("[chatbot] failed to load session history:", e)
    }
  }

  // 근거 문서가 있는 답변 모드에서만 Gemini로 답변 문장을 생성한다.
  // (handoff·clarifying·fallback 등 안전/에스컬레이션 경로는 템플릿 유지)
  if (
    shouldGenerateAnswer &&
    !shouldUseFastStructuredAnswer(response) &&
    (response.answerMode === "direct_answer" || response.answerMode === "doc_suggestion")
  ) {
    const tier = determineModelTier(category)
    const llmAnswer = await generateGeminiAnswer({
      question: question.redacted,
      sources: response.sources,
      tier,
      history,
    })
    if (llmAnswer && isUsableGeneratedAnswer(llmAnswer)) {
      response.answer = llmAnswer
    }
  }

  return {
    question,
    response,
    category,
    intent,
    handoffIntent,
    warning,
    latencyMs: elapsedSince(startedAt),
    retrievalCacheHit: cacheHit,
  }
}

export async function handleChatbotQuery(
  input: ChatbotQueryRequest,
  meta: ChatbotRequestMeta = {}
): Promise<ChatbotQueryResponse> {
  const sessionId = await ensureSession(input, meta)
  const core = await buildChatbotCore(input.message, { sessionId })
  const persisted = await persistExchange(
    input,
    core.question,
    core.response,
    meta,
    core.category,
    core.intent,
    core.handoffIntent,
    core.latencyMs,
    sessionId
  )

  return {
    ...core.response,
    ...persisted,
    handoffIntent: core.handoffIntent,
    warning: core.warning,
  }
}

/**
 * 품질 평가용 진입점. 실제 검색·답변 파이프라인을 그대로 타되 분석 로그에 저장하지 않는다.
 * 골든셋 평가([scripts/eval-chatbot.ts])가 분석 데이터를 오염시키지 않도록 한다.
 */
export async function evaluateChatbotQuery(
  message: string,
  options: { generateAnswer?: boolean } = {}
): Promise<ChatbotQueryResponse & { detectedCategory: string }> {
  const core = await buildChatbotCore(message, { generateAnswer: options.generateAnswer })
  return {
    ...core.response,
    handoffIntent: core.handoffIntent,
    warning: core.warning,
    detectedCategory: core.category,
  }
}

export async function saveChatbotFeedback(raw: unknown) {
  const body = getContextObject(raw)
  const answerEventId = normalizeOptionalUuid(body.answerEventId)
  const sessionId = normalizeOptionalUuid(body.sessionId)
  const rating = normalizeString(body.rating)
  const comment = normalizeString(body.comment)

  if (!answerEventId) {
    throw new ChatbotInputError("answerEventId가 올바르지 않습니다.")
  }
  if (!sessionId) {
    throw new ChatbotInputError("sessionId가 올바르지 않습니다.")
  }

  if (rating !== "helpful" && rating !== "not_helpful") {
    throw new ChatbotInputError("rating은 helpful 또는 not_helpful이어야 합니다.")
  }
  if (comment && comment.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    throw new ChatbotInputError(`comment는 ${MAX_FEEDBACK_COMMENT_LENGTH}자 이내여야 합니다.`)
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      stored: false,
      warning: "Supabase 환경변수가 없어 피드백을 저장하지 않았습니다.",
    }
  }

  const supabase = createSupabaseAdminClient()
  const { data: answerEvent, error: answerEventError } = await supabase
    .from("chatbot_answer_events")
    .select("id")
    .eq("id", answerEventId)
    .eq("session_id", sessionId)
    .maybeSingle()

  if (answerEventError) throw new Error(answerEventError.message)
  if (!answerEvent) {
    throw new ChatbotInputError("피드백 대상 답변을 찾지 못했습니다.")
  }

  const { error } = await supabase.from("chatbot_feedback").insert({
    answer_event_id: answerEventId,
    rating,
    comment: comment ? redactPii(comment.replace(/\s+/g, " ").trim()) : null,
  })

  if (error) throw new Error(error.message)

  await maybeCreateChannelTalkFeedbackHandoff(answerEventId, {
    rating,
    comment: comment ? redactPii(comment.replace(/\s+/g, " ").trim()) : null,
  })

  return { ok: true, stored: true }
}

function getDefaultFromDate() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().slice(0, 10)
}

function toDateOnlyParam(value: string | null) {
  if (!value) return undefined
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

interface DailyStatsRow {
  day: string
  cluster_id: string
  question_label: string
  detected_category: string | null
  question_count: number
  unresolved_count: number
  handoff_count: number
  direct_answer_count: number
  avg_confidence: number | null
}

interface FeedbackStatsRow {
  detected_category: string | null
  question_label: string
  feedback_count: number
  helpful_count: number
  not_helpful_count: number
}

interface AnswerEventStatsRow {
  detected_category: string | null
  answer_mode: string | null
  confidence: number | null
  latency_ms: number | null
}

interface ChannelHandoffStatsRow {
  status: string | null
  payload: Record<string, unknown> | null
}

interface QuestionClusterMetadataRow {
  id: string
  metadata: Record<string, unknown> | null
}

interface QuestionClusterEvalRow {
  id: string
  label: string
  canonical_question: string
  category: string | null
  metadata: Record<string, unknown> | null
}

const EVAL_ANSWER_MODES = new Set([
  "direct_answer",
  "doc_suggestion",
  "clarifying_question",
  "handoff",
  "fallback",
])

function normalizeExpectedModes(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  const modes = values
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item && EVAL_ANSWER_MODES.has(item)))

  return modes.length > 0 ? Array.from(new Set(modes)) : undefined
}

function getRegressionCandidateMetadata(metadata: Record<string, unknown> | null | undefined) {
  const candidate = getContextObject(metadata?.regressionCandidate)
  return candidate.enabled === true ? candidate : null
}

function averageMetric(values: number[]) {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function averageRatio(values: number[]) {
  if (values.length === 0) return null
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
}

function percentileMetric(values: number[], percentile: number) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1))
  return sorted[index]
}

function summarizeDistribution(values: string[]) {
  const total = values.length
  const counts = new Map<string, number>()

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      count,
      rate: total === 0 ? 0 : Number((count / total).toFixed(4)),
    }))
    .sort((left, right) => right.count - left.count)
}

function summarizeChannelHandoffs(rows: ChannelHandoffStatsRow[]) {
  const statuses = summarizeDistribution(rows.map((row) => row.status ?? "unknown"))
  const statusCount = (status: string) =>
    statuses.find((item) => item.key === status)?.count ?? 0
  const intents = summarizeDistribution(
    rows.map((row) => normalizeString(getContextObject(row.payload).handoffIntent) ?? "unknown")
  )
  const intentCount = (intent: string) =>
    intents.find((item) => item.key === intent)?.count ?? 0

  return {
    total: rows.length,
    sent: statusCount("sent"),
    pending: statusCount("pending"),
    failed: statusCount("failed"),
    skipped: statusCount("skipped"),
    support: intentCount("support"),
    demo: intentCount("demo"),
    statuses,
    intents,
  }
}

function aggregateQuestionRows(rows: DailyStatsRow[], regressionCandidateClusterIds = new Set<string>()) {
  const map = new Map<string, {
    clusterId: string
    questionLabel: string
    category: string | null
    questionCount: number
    unresolvedCount: number
    handoffCount: number
    directAnswerCount: number
    confidenceTotal: number
    confidenceRows: number
  }>()

  for (const row of rows) {
    const key = `${row.cluster_id}:${row.question_label}`
    const current = map.get(key) ?? {
      clusterId: row.cluster_id,
      questionLabel: row.question_label,
      category: row.detected_category,
      questionCount: 0,
      unresolvedCount: 0,
      handoffCount: 0,
      directAnswerCount: 0,
      confidenceTotal: 0,
      confidenceRows: 0,
    }

    current.questionCount += Number(row.question_count ?? 0)
    current.unresolvedCount += Number(row.unresolved_count ?? 0)
    current.handoffCount += Number(row.handoff_count ?? 0)
    current.directAnswerCount += Number(row.direct_answer_count ?? 0)

    if (row.avg_confidence != null) {
      current.confidenceTotal += Number(row.avg_confidence)
      current.confidenceRows += 1
    }

    map.set(key, current)
  }

  return Array.from(map.values()).map((item) => ({
    clusterId: item.clusterId,
    questionLabel: item.questionLabel,
    category: item.category,
    questionCount: item.questionCount,
    unresolvedCount: item.unresolvedCount,
    handoffCount: item.handoffCount,
    directAnswerCount: item.directAnswerCount,
    avgConfidence:
      item.confidenceRows > 0
        ? Number((item.confidenceTotal / item.confidenceRows).toFixed(4))
        : null,
    regressionCandidate: regressionCandidateClusterIds.has(item.clusterId),
  }))
}

export async function getChatbotStats(params: URLSearchParams) {
  const from = toDateOnlyParam(params.get("from")) ?? getDefaultFromDate()
  const to = toDateOnlyParam(params.get("to"))

  if (!hasSupabaseServerEnv()) {
    return {
      range: { from, to: to ?? null },
      totals: {
        questionCount: 0,
        unresolvedCount: 0,
        handoffCount: 0,
        directAnswerCount: 0,
      },
      topQuestions: [],
      unresolvedQuestions: [],
      feedbackStats: [],
      latency: {
        avgMs: null,
        p95Ms: null,
        sampleCount: 0,
      },
      answerModes: [],
      categories: [],
      channelHandoffs: summarizeChannelHandoffs([]),
      avgConfidence: null,
      warning: "Supabase 환경변수가 없어 챗봇 통계를 조회하지 않았습니다.",
    }
  }

  const supabase = createSupabaseAdminClient()
  let dailyQuery = supabase
    .from("v_chatbot_daily_question_stats")
    .select("*")
    .gte("day", from)
    .order("day", { ascending: false })

  if (to) dailyQuery = dailyQuery.lte("day", to)

  let answerQuery = supabase
    .from("chatbot_answer_events")
    .select("detected_category, answer_mode, confidence, latency_ms")
    .gte("created_at", `${from}T00:00:00.000Z`)
    .order("created_at", { ascending: false })
    .limit(1000)

  if (to) answerQuery = answerQuery.lte("created_at", `${to}T23:59:59.999Z`)

  const [
    { data: dailyRows, error: dailyError },
    { data: feedbackRows, error: feedbackError },
    { data: answerRows, error: answerError },
  ] = await Promise.all([
    dailyQuery,
    supabase
      .from("v_chatbot_feedback_stats")
      .select("*")
      .order("feedback_count", { ascending: false })
      .limit(50),
    answerQuery,
  ])

  if (dailyError) throw new Error(dailyError.message)
  if (feedbackError) throw new Error(feedbackError.message)
  if (answerError) throw new Error(answerError.message)

  const rows = (dailyRows ?? []) as DailyStatsRow[]
  const answerEventRows = (answerRows ?? []) as AnswerEventStatsRow[]
  let handoffRows: ChannelHandoffStatsRow[] = []

  try {
    let handoffQuery = supabase
      .from("chatbot_channel_handoffs")
      .select("status, payload")
      .gte("created_at", `${from}T00:00:00.000Z`)
      .order("created_at", { ascending: false })
      .limit(1000)

    if (to) handoffQuery = handoffQuery.lte("created_at", `${to}T23:59:59.999Z`)

    const { data, error } = await handoffQuery
    if (error) throw new Error(error.message)
    handoffRows = (data ?? []) as ChannelHandoffStatsRow[]
  } catch (error) {
    console.warn(
      "[chatbot] failed to load channel handoff stats:",
      error instanceof Error ? error.message : error
    )
  }

  const clusterIds = Array.from(new Set(rows.map((row) => row.cluster_id).filter((id) => UUID_RE.test(id))))
  const regressionCandidateClusterIds = new Set<string>()

  if (clusterIds.length > 0) {
    const { data: clusterRows, error: clusterError } = await supabase
      .from("question_clusters")
      .select("id, metadata")
      .in("id", clusterIds)

    if (clusterError) throw new Error(clusterError.message)

    for (const row of (clusterRows ?? []) as QuestionClusterMetadataRow[]) {
      if (getRegressionCandidateMetadata(row.metadata)) {
        regressionCandidateClusterIds.add(row.id)
      }
    }
  }

  const aggregated = aggregateQuestionRows(rows, regressionCandidateClusterIds)
  const totals = aggregated.reduce(
    (acc, item) => ({
      questionCount: acc.questionCount + item.questionCount,
      unresolvedCount: acc.unresolvedCount + item.unresolvedCount,
      handoffCount: acc.handoffCount + item.handoffCount,
      directAnswerCount: acc.directAnswerCount + item.directAnswerCount,
    }),
    {
      questionCount: 0,
      unresolvedCount: 0,
      handoffCount: 0,
      directAnswerCount: 0,
    }
  )
  const latencies = answerEventRows
    .map((row) => Number(row.latency_ms))
    .filter((value) => Number.isFinite(value) && value > 0)
  const confidences = answerEventRows
    .map((row) => Number(row.confidence))
    .filter((value) => Number.isFinite(value) && value >= 0)

  return {
    range: { from, to: to ?? null },
    totals,
    topQuestions: [...aggregated]
      .sort((left, right) => right.questionCount - left.questionCount)
      .slice(0, 10),
    unresolvedQuestions: [...aggregated]
      .filter((item) => item.unresolvedCount > 0)
      .sort((left, right) => right.unresolvedCount - left.unresolvedCount)
      .slice(0, 10),
    feedbackStats: ((feedbackRows ?? []) as FeedbackStatsRow[]).slice(0, 20),
    latency: {
      avgMs: averageMetric(latencies),
      p95Ms: percentileMetric(latencies, 0.95),
      sampleCount: latencies.length,
    },
    answerModes: summarizeDistribution(
      answerEventRows.map((row) => row.answer_mode ?? "unknown")
    ),
    categories: summarizeDistribution(
      answerEventRows.map((row) => row.detected_category ?? "uncategorized")
    ),
    channelHandoffs: summarizeChannelHandoffs(handoffRows),
    avgConfidence: averageRatio(confidences),
  }
}

const QUESTION_CLUSTER_STATUSES = new Set([
  "candidate",
  "approved",
  "published",
  "ignored",
])

function parseLimit(value: string | null, fallback = 50) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(1, parsed))
}

export async function listQuestionClusters(params: URLSearchParams) {
  const status = normalizeString(params.get("status"))
  const limit = parseLimit(params.get("limit"))

  if (!hasSupabaseServerEnv()) {
    return {
      clusters: [],
      warning: "Supabase 환경변수가 없어 질문 클러스터를 조회하지 않았습니다.",
    }
  }

  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from("question_clusters")
    .select(
      "id, label, canonical_question, category, mapped_article_id, mapped_chunk_id, status, first_seen_at, last_seen_at, sample_questions, metadata, created_at, updated_at"
    )
    .order("last_seen_at", { ascending: false })
    .limit(limit)

  if (status && QUESTION_CLUSTER_STATUSES.has(status)) {
    query = query.eq("status", status)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return { clusters: data ?? [] }
}

export async function updateQuestionCluster(id: string, raw: unknown) {
  if (!UUID_RE.test(id)) {
    throw new ChatbotInputError("질문 클러스터 ID가 올바르지 않습니다.")
  }

  if (!hasSupabaseServerEnv()) {
    return {
      cluster: null,
      warning: "Supabase 환경변수가 없어 질문 클러스터를 수정하지 않았습니다.",
    }
  }

  const body = getContextObject(raw)
  const status = normalizeString(body.status)
  const mappedArticleId = normalizeOptionalUuid(body.mappedArticleId)
  const mappedChunkId = normalizeOptionalUuid(body.mappedChunkId)
  const hasRegressionCandidatePatch = Object.prototype.hasOwnProperty.call(body, "regressionCandidate")

  const patch: Record<string, unknown> = {}

  const label = normalizeString(body.label)
  if (label) patch.label = label

  const canonicalQuestion = normalizeString(body.canonicalQuestion)
  if (canonicalQuestion) patch.canonical_question = canonicalQuestion

  const category = normalizeString(body.category)
  if (category) patch.category = category

  if (status) {
    if (!QUESTION_CLUSTER_STATUSES.has(status)) {
      throw new ChatbotInputError("지원하지 않는 질문 클러스터 상태입니다.")
    }
    patch.status = status
  }

  if (Object.prototype.hasOwnProperty.call(body, "mappedArticleId")) {
    patch.mapped_article_id = mappedArticleId ?? null
  }

  if (Object.prototype.hasOwnProperty.call(body, "mappedChunkId")) {
    patch.mapped_chunk_id = mappedChunkId ?? null
  }

  const supabase = createSupabaseAdminClient()

  if (hasRegressionCandidatePatch) {
    const regressionCandidateInput = getContextObject(body.regressionCandidate)
    const { data: current, error: currentError } = await supabase
      .from("question_clusters")
      .select("canonical_question, category, metadata")
      .eq("id", id)
      .single()

    if (currentError) throw new Error(currentError.message)

    const currentMetadata = getContextObject(current?.metadata)
    const enabled =
      typeof regressionCandidateInput.enabled === "boolean"
        ? regressionCandidateInput.enabled
        : true

    if (enabled) {
      currentMetadata.regressionCandidate = {
        enabled: true,
        expectedCategory:
          normalizeString(regressionCandidateInput.expectedCategory) ??
          category ??
          normalizeString(current?.category) ??
          "general",
        expectedModes: normalizeExpectedModes(regressionCandidateInput.expectedModes) ?? [
          "direct_answer",
          "doc_suggestion",
          "handoff",
        ],
        expectedPathIncludes: normalizeString(regressionCandidateInput.expectedPathIncludes) ?? null,
        reason: normalizeString(regressionCandidateInput.reason) ?? "admin_pattern_analysis",
        addedAt: new Date().toISOString(),
      }
    } else {
      currentMetadata.regressionCandidate = {
        ...getContextObject(currentMetadata.regressionCandidate),
        enabled: false,
        disabledAt: new Date().toISOString(),
      }
    }

    patch.metadata = currentMetadata
  }

  if (Object.keys(patch).length === 0) {
    throw new ChatbotInputError("수정할 필드가 없습니다.")
  }

  const { data, error } = await supabase
    .from("question_clusters")
    .update(patch)
    .eq("id", id)
    .select(
      "id, label, canonical_question, category, mapped_article_id, mapped_chunk_id, status, first_seen_at, last_seen_at, sample_questions, metadata, created_at, updated_at"
    )
    .single()

  if (error) throw new Error(error.message)

  return { cluster: data }
}

export async function listChatbotRegressionEvalCases(limit = 50) {
  if (!hasSupabaseServerEnv()) return []

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("question_clusters")
      .select("id, label, canonical_question, category, metadata")
      .order("updated_at", { ascending: false })
      .limit(Math.min(200, Math.max(1, limit * 4)))

    if (error) throw new Error(error.message)

    return ((data ?? []) as QuestionClusterEvalRow[])
      .map((row) => {
        const candidate = getRegressionCandidateMetadata(row.metadata)
        if (!candidate) return null

        return {
          id: `db:${row.id}`,
          question: row.canonical_question || row.label,
          expectCategory:
            normalizeString(candidate.expectedCategory) ??
            normalizeString(row.category) ??
            "general",
          expectMode: normalizeExpectedModes(candidate.expectedModes) ?? [
            "direct_answer",
            "doc_suggestion",
            "handoff",
          ],
          expectPathIncludes: normalizeString(candidate.expectedPathIncludes),
        }
      })
      .filter((item): item is {
        id: string
        question: string
        expectCategory: string
        expectMode: string[]
        expectPathIncludes: string | undefined
      } => Boolean(item?.question))
      .slice(0, limit)
  } catch (error) {
    console.warn(
      "[chatbot] failed to load regression eval candidates:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}
