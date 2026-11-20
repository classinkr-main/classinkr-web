import "server-only"

import { stripLeadSubmitTokens } from "@/lib/chatbot/lead-token"
import {
  generateChatbotFinalAnswer,
  streamChatbotFinalAnswer,
  type ChatbotAnswerUsage,
} from "@/lib/chatbot/answer-provider"
import { maybeLabelChatbotExchange } from "@/lib/chatbot/claude/labeling"
import { unstable_cache, revalidateTag } from "next/cache"
import { after } from "next/server"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { CHATBOT_STATS_CACHE_TAG, DOC_GAP_BACKLOG_CACHE_TAG } from "@/lib/chatbot/cache-tags"
import { getDocPath, listDocs, type DocArticle } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import {
  classifyChatbotQuestion,
  isSubjectlessClassinIdentityQuestion,
  isTrialOrPilotText,
  type ChatbotIntent,
} from "@/lib/chatbot/classification"
import {
  CONVERSATIONAL_SELF_KNOWLEDGE_KEYS,
  findChatbotSelfKnowledgeEntry,
  hasQuestionSignal,
} from "@/lib/chatbot/self-knowledge"
import {
  asksAboutThirdPartyAdoption,
  clampAnswerToLength,
  embedText,
  isModelCircuitOpen,
  pickOutlineSectionIds,
  sanitizePublicAnswerText,
  selectAnsweringSentenceIds,
  type ChatbotModelTier,
} from "@/lib/chatbot/llm"
import { DOC_OUTLINE_SUMMARY_HEADING, getPublicDocOutline, isPublicChatbotDoc } from "@/lib/chatbot/doc-outline"
import {
  buildClientVectorSources,
  type VectorFallbackChunkRow,
} from "@/lib/chatbot/vector-fallback"
import {
  maybeCreateChannelTalkFeedbackHandoff,
  maybeCreateChannelTalkHandoff,
} from "@/lib/chatbot/channel-handoff"
import {
  buildCsFigmaGuideSuggestedQuestions,
  findCsFigmaGuideForQuestion,
  findCsFigmaKnownIntentSlug,
  formatCsFigmaGuideAnswer,
  getCsFigmaGuideDocPath,
  isCsFigmaSymptomQuestion,
  sanitizeGuideStep,
  type CsFigmaGuide,
} from "@/lib/cs-figma-guides"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"
import { appendFollowUp, buildFollowUp } from "@/lib/chatbot/follow-up"
import { findBasicQuickAnswers } from "@/lib/chatbot/quick-answers-basics"
import { SHOWROOM_MIN_LEAD_BUSINESS_DAYS, SHOWROOM_SLOT_DURATION_MINUTES } from "@/lib/showroom/slots"
import { attachGroundingText, buildEvidenceSentences, type EvidenceSentence } from "@/lib/chatbot/source-grounding"
import { findFieldQuickAnswer } from "@/lib/chatbot/quick-answers-field"
import { checkPreparedAnswer, type AnswerGateTrace } from "@/lib/chatbot/answer-gate"
import { resolveSymptomTriage, type SymptomTriageResult } from "@/lib/chatbot/symptom-triage"
import {
  ENGLISH_SUPPORT_ANSWER,
  PRIOR_INQUIRY_LINE,
  applyToneToAnswer,
  detectConversationTone,
  glossForRouting,
  isEnglishSupportRequest,
} from "@/lib/chatbot/tone"
import {
  answerIndexDataDir,
  answerIndexVersion,
  answerIndexVersionOf,
  getAnswerRouter,
  getRouterAnswerIndex,
  logShadowDecision,
  preIndexTrace,
  routeAnswerIndex,
} from "@/lib/chatbot/answer-index"
import { collectLegacyVotes } from "@/lib/chatbot/answer-index/legacy-votes"
import { groupSentenceParagraphs } from "@/lib/chatbot/answer-index/paragraphs"
import {
  buildAnswerIndexCore,
  type AnswerIndexCoreParts,
  type AnswerIndexHost,
} from "@/lib/chatbot/answer-index/respond"
import { isCompiledScope } from "@/lib/chatbot/answer-index/scope"
import type { AnswerIndexDecision, AnswerIndexRouter, AnswerIndexTrace } from "@/lib/chatbot/answer-index/types"
import type { ChatbotSelfKnowledgeEntry } from "@/lib/chatbot/self-knowledge"
import {
  parseDocPagePath,
  parsePreviousTurnInput,
  resolveConversationTurn,
  type ConversationTurn,
  type ConversationTurnReason,
  type DocPageRef,
  type PreviousTurn,
} from "@/lib/chatbot/conversation-context"

// CS 사용 가이드 직답의 출처 식별용 내부 헤딩(피그마/CS 표현 미노출)
const CS_FIGMA_GUIDE_SOURCE_HEADING = "사용 순서 안내"

const MAX_MESSAGE_LENGTH = 1000
const MAX_FEEDBACK_COMMENT_LENGTH = 500
const MAX_SOURCES = 2
const MAX_SOURCES_PER_DOC = 1
const MAX_RETRIEVAL_CANDIDATES = 24
const MAX_RETRIEVAL_CANDIDATES_PER_DOC = 3
const MIN_DIRECT_SOURCE_SCORE = 18
const DEFAULT_KNOWLEDGE_SEARCH_TIMEOUT_MS = 2_800
const DEFAULT_FINAL_ANSWER_TIMEOUT_MS = 6_000
// 스트리밍은 첫 토큰이 일찍 보여 체감 지연이 낮으므로 본문 완성까지 조금 더 기다린다.
const DEFAULT_FINAL_ANSWER_STREAM_TIMEOUT_MS = 8_000
const RETRIEVAL_CACHE_TTL_MS = 5 * 60 * 1000
const RETRIEVAL_CACHE_MAX = 200
const RETRIEVAL_CACHE_VERSION = "rag-rerank-20261118-v9"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHAT_SESSION_CHANNELS = new Set(["web", "admin_preview", "partner_portal", "manual_import"])
const PROGRESSIVE_MODEL_TIERS: ChatbotModelTier[] = ["basic", "reasoning", "advanced"]

type AnswerMode =
  | "direct_answer"
  | "doc_suggestion"
  | "clarifying_question"
  | "handoff"
  | "fallback"

const ANSWER_MODES: readonly AnswerMode[] = ["direct_answer", "doc_suggestion", "clarifying_question", "handoff", "fallback"]

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

export type ChatbotSourceVisibility = "public" | "unlisted" | "internal"

export interface ChatbotSource {
  articleId?: string
  chunkId?: string
  title: string
  heading?: string
  urlPath: string
  category: string
  excerpt: string
  score: number
  /**
   * 문서 가시성. internal 은 내부 코파일럿(include_internal) 경로로만 들어온다 — 공개 경로 응답에는 값이 실리지 않는다.
   * 내부 코파일럿은 이 값으로 "공개 가이드"와 "내부 전용 근거"를 갈라 외부 사용 경계를 적용한다.
   */
  visibility?: ChatbotSourceVisibility
}

export type HandoffIntent = "demo" | "support"

export interface SuggestedContent {
  type: "blog" | "resource" | "case"
  slug: string
  title: string
  url: string
}

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
  suggestedContent?: SuggestedContent[]
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
  /**
   * 근거 선별용 후보. sources 는 답·출처 카드용으로 2개(문서당 1개)만 남기지만,
   * 답이 같은 문서의 다른 섹션이나 3~8위 문서에 있는 경우가 많아 선별에는 더 넓게 넘긴다.
   */
  evidencePool?: ChatbotSource[]
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
  이디비: ["edb", "칠판", "교안", "판서"],
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
  차이: ["비교", "다른점", "차별점", "zoom", "전자칠판"],
  차별점: ["차이", "비교", "다른점", "운영", "시스템"],
  장점: ["차별점", "차이", "비교", "운영", "시스템"],
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

// 내부 CS 유입(lib/internal-cs-chat/gap-ingest.ts)도 같은 redaction 을 거쳐야 하므로 export 한다.
export function redactPii(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g, "[business_number]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[payment_number]")
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
        .filter((token) => token.length >= 2)
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

// 검색 옵션. includeInternalDocs 는 내부 CS 코파일럿 전용(계약 6) — 공개 챗봇 경로는 항상 기본(false).
// 캐시 키에 scope 로 반영해 internal 결과가 공개 캐시로 절대 새지 않게 격리한다.
export interface RetrievalOptions {
  includeInternalDocs?: boolean
}

function retrievalScope(options: RetrievalOptions | undefined) {
  return options?.includeInternalDocs ? "internal" : "public"
}

/**
 * 질문 임베딩(벡터 검색)을 쓴 결과인지. 정적 문서 검색은 임베딩을 만들지 않아 언제나 off 다.
 * Supabase 검색에서 임베딩이 막혀(키 없음·차단기·호출 실패) 키워드만으로 만든 결과는 off 로 따로 둔다. 장애가 지난 뒤에도
 * 벡터 없는 약한 결과를 5분 동안 꺼내지 않게 한다(2026-11-20 조사 G16).
 */
type RetrievalVectorState = "on" | "off"

/** 이번 요청에서 질문 임베딩을 만들 수 있을 것으로 보이는지(캐시 조회용). 실제 결과는 검색 뒤 searchSupabaseSources 가 알린다. */
function expectedRetrievalVectorState(): RetrievalVectorState {
  return hasSupabaseServerEnv() && Boolean(process.env.GEMINI_API_KEY?.trim()) && !isModelCircuitOpen() ? "on" : "off"
}

function retrievalCacheKeyOf(question: NormalizedQuestion, options: RetrievalOptions | undefined, supabase: boolean, vector: RetrievalVectorState) {
  const backend = supabase ? `supabase:vector-${vector}` : "static"
  return `${RETRIEVAL_CACHE_VERSION}:${backend}:${retrievalScope(options)}:${buildRetrievalQueryText(question).toLowerCase()}`
}

function getRetrievalCacheKey(question: NormalizedQuestion, options?: RetrievalOptions, vector: RetrievalVectorState = "off") {
  return retrievalCacheKeyOf(question, options, hasSupabaseServerEnv(), vector)
}

/** 시험 전용: 검색 캐시 열쇠. Supabase 검색이면 질문 임베딩을 썼는지(vector)가 열쇠에 들어간다. */
export function __retrievalCacheKeyForTests(text: string, backend: { supabase: boolean; vector: RetrievalVectorState }) {
  return retrievalCacheKeyOf(normalizeQuestion(text), undefined, backend.supabase, backend.vector)
}

function getCachedRetrieval(
  question: NormalizedQuestion,
  options?: RetrievalOptions,
  vector: RetrievalVectorState = expectedRetrievalVectorState()
): KnowledgeSearchResult | null {
  const key = getRetrievalCacheKey(question, options, vector)
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

function setCachedRetrieval(
  question: NormalizedQuestion,
  value: KnowledgeSearchResult,
  options: RetrievalOptions | undefined,
  vector: RetrievalVectorState
) {
  const key = getRetrievalCacheKey(question, options, vector)
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

// 답변 레벨 캐시 — 세션(대화 이력)이 없는 동일 질문은 검색·Gemini를 통째로 건너뛴다.
interface CachedAnswerEntry {
  response: ReturnType<typeof composeAnswer>
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  warning?: string
}

const ANSWER_CACHE_VERSION = "answer-20261113-v9"
const ANSWER_CACHE_TTL_MS = 5 * 60 * 1000
const ANSWER_CACHE_MAX = 200
const answerCache = new Map<string, { expiresAt: number; value: CachedAnswerEntry }>()

/** 테스트 전용: 앞 테스트가 남긴 답 캐시를 비운다. */
export function __clearAnswerCacheForTests() {
  answerCache.clear()
}

// 답 라우터(CHATBOT_ANSWER_ROUTER), 답 색인 판(answerIndexVersion)과 자료 폴더(ANSWER_INDEX_DATA_DIR)도 키에 넣는다. 라우터·자료 폴더를
// 바꾸거나 색인 자료·계산 규칙이 바뀌면 다른 라우터·다른 판에서 만든 답을 꺼내지 않는다(답 색인 사양 §3.2·§3.7). 폴더는 manifest 를
// 다시 쓰지 않은 작업 폴더 사본(같은 판 이름)도 가르려고 넣는다. 내부 CS 경로는 라우터를 쓰지 않아 legacy 로 적는다.
//
// 열쇠의 질문은 대화 맥락으로 넓힌 검색용 질문(routingText)이다. 같은 검색용 질문이면 같은 답이 나오고, 말투 층은 캐시 뒤에 입힌다.
// 문서 페이지 맥락을 쓴 답(그 문서 절을 후보 맨 앞에 둔 답)만 열쇠에 경로를 넣는다(pageKey).
function getAnswerCacheKey(question: NormalizedQuestion, options?: RetrievalOptions, pageKey?: string | null) {
  const backend = hasSupabaseServerEnv() ? "supabase" : "static"
  const router = options?.includeInternalDocs ? "legacy" : getAnswerRouter()
  const page = pageKey ? `:page=${pageKey}` : ""
  return `${ANSWER_CACHE_VERSION}:${backend}:${retrievalScope(options)}:${router}@${answerIndexVersion()}@${answerIndexDataDir()}${page}:${buildRetrievalQueryText(question).toLowerCase()}`
}

/**
 * 답 캐시를 쓸 수 있는지. 세션 이력은 generate 모드의 답 다시 쓰기에만 들어가므로, select·off 모드는 세션이 있어도 캐시를 쓴다
 * (2026-11-20 조사 G1·novice-11). 모델 없이 초안만 만드는 평가 호출(generateAnswer=false)은 쓰지 않는다.
 */
function isAnswerCacheAllowed(options: Pick<BuildChatbotCoreOptions, "generateAnswer" | "sessionId">) {
  return options.generateAnswer !== false && (!options.sessionId || getFinalAnswerLlmMode() !== "generate")
}

function cloneCachedAnswer(value: CachedAnswerEntry): CachedAnswerEntry {
  return {
    ...value,
    response: {
      ...value.response,
      sources: value.response.sources.map((source) => ({ ...source })),
      suggestedQuestions: [...value.response.suggestedQuestions],
    },
  }
}

function getCachedAnswer(
  question: NormalizedQuestion,
  options?: RetrievalOptions,
  pageKey?: string | null
): CachedAnswerEntry | null {
  const key = getAnswerCacheKey(question, options, pageKey)
  const cached = answerCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    answerCache.delete(key)
    return null
  }
  return cloneCachedAnswer(cached.value)
}

function setCachedAnswer(
  question: NormalizedQuestion,
  value: CachedAnswerEntry,
  options?: RetrievalOptions,
  pageKey?: string | null
) {
  if (answerCache.size >= ANSWER_CACHE_MAX) {
    const firstKey = answerCache.keys().next().value
    if (firstKey) answerCache.delete(firstKey)
  }
  answerCache.set(getAnswerCacheKey(question, options, pageKey), {
    expiresAt: Date.now() + ANSWER_CACHE_TTL_MS,
    value: cloneCachedAnswer(value),
  })
}

function elapsedSince(startedAt: number) {
  return Math.max(0, Date.now() - startedAt)
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getKnowledgeSearchTimeoutMs() {
  return getPositiveIntegerEnv("CHATBOT_KNOWLEDGE_SEARCH_TIMEOUT_MS", DEFAULT_KNOWLEDGE_SEARCH_TIMEOUT_MS)
}

function getFinalAnswerTimeoutMs() {
  return getPositiveIntegerEnv("CHATBOT_FINAL_ANSWER_TIMEOUT_MS", DEFAULT_FINAL_ANSWER_TIMEOUT_MS)
}

function getFinalAnswerStreamTimeoutMs() {
  return getPositiveIntegerEnv("CHATBOT_FINAL_ANSWER_STREAM_TIMEOUT_MS", DEFAULT_FINAL_ANSWER_STREAM_TIMEOUT_MS)
}

/**
 * 응답을 보낸 뒤에도 끝까지 돌아야 하는 작업 — next/server after 로 넘긴다(라우트 핸들러 요청 안에서만 쓸 수 있다).
 * 요청 밖(테스트·스크립트)에서는 after 가 바로 throw 하므로 그냥 돌린다. task 는 스스로 오류를 삼켜야 한다.
 */
function runAfterResponse(task: () => Promise<void>) {
  try {
    after(task)
  } catch {
    void task()
  }
}

async function withTimeoutFallback<T>({
  promise,
  timeoutMs,
  fallback,
  onTimeout,
}: {
  promise: Promise<T>
  timeoutMs: number
  fallback: () => T
  onTimeout: () => void
}) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      onTimeout()
      resolve(fallback())
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
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

/** 대화 맥락으로 넓힌 검색용 질문. 직전 질문은 받을 때 가렸고, 합친 글도 한 번 더 가린다. */
function buildRoutingQuestion(routingText: string, utterance: NormalizedQuestion): NormalizedQuestion {
  const normalized = routingText.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH)
  const redacted = redactPii(normalized)
  return {
    original: normalized,
    normalized,
    redacted,
    piiRedacted: utterance.piiRedacted || redacted !== normalized,
    tokens: tokenize(redacted),
  }
}

/** 요청이 함께 보낸 대화 맥락(직전 한 턴·문서 페이지). 꼴이 틀린 직전 턴은 400(ChatbotInputError)이다. */
export interface ChatbotConversationInput {
  previousTurn: PreviousTurn | null
  pagePath: DocPageRef | null
}

/**
 * 직전 턴(context.previousTurn: question 200자 이하·askedSlot·answerMode)과 문서 페이지 경로(context.pagePath, 없으면 context.path)를
 * 검사한다. 직전 질문은 이번 질문과 같은 정규화·개인정보 가리기를 한다. 경로는 공개 문서 /docs/<분류>/<slug> 일 때만 쓴다.
 */
function parseConversationInput(previousTurnRaw: unknown, pagePathRaw: unknown): ChatbotConversationInput {
  const parsed = parsePreviousTurnInput(previousTurnRaw, ANSWER_MODES)
  if (!parsed.ok) throw new ChatbotInputError(parsed.error)
  const previousTurn = parsed.value ? { ...parsed.value, question: redactPii(parsed.value.question) } : null
  const doc = parseDocPagePath(pagePathRaw)
  return { previousTurn, pagePath: doc && findPublicDocForPage(doc) ? doc : null }
}

function conversationInputFromRequest(input: ChatbotQueryRequest): ChatbotConversationInput {
  const context = getContextObject(input.context)
  return parseConversationInput(context.previousTurn, typeof context.pagePath === "string" ? context.pagePath : context.path)
}

export function validateChatbotQueryInput(input: ChatbotQueryRequest): void {
  normalizeQuestion(input.message)
  conversationInputFromRequest(input)
}

function isGreetingOnly(question: NormalizedQuestion) {
  return /^(안녕|안녕하세요|하이|hello|hi)[.!?\s]*$/i.test(question.normalized)
}

const ACADEMY_PAYMENT_ACTION_RE = /결제|수납|납부|정산|pg|카드\s*결제|가상\s*계좌|계좌\s*이체/i
const ACADEMY_PAYMENT_SUBJECT_RE =
  /학원\s*결제|학원비|원비|수강료|수업료|회비|학생.{0,8}(결제|납부|수납)|학부모.{0,8}(결제|납부|수납)|수납.{0,8}(관리|자동|처리|기능|시스템)|정산.{0,8}(관리|자동|처리|기능|시스템)|pg|결제\s*(기능|모듈|시스템)|자동\s*(결제|수납|정산)/i
const CAPABILITY_REQUEST_RE =
  /되나요|돼요|가능|지원|제공|처리|관리|기능|자동|연동|만들|추가|하려고|하고\s*싶|쓸\s*수|사용할\s*수/i

const PROMPT_OR_SECURITY_ABUSE_RE =
  /sql\s*injection|\bsqli\b|union\s+select|drop\s+table|\bor\s+1\s*=\s*1|information_schema|xp_cmdshell|\bxss\b|\bcsrf\b|\bssrf\b|\brce\b|프롬프트\s*인젝션|system\s*prompt|developer\s*(?:message|instruction)|시스템\s*프롬프트|개발자\s*메시지|(?:개발자|시스템|숨겨진|비공개).{0,12}(?:지침|규칙|지시|명령어?|명령문).{0,16}(?:원문|보여|출력|공개|알려|노출|그대로)|(?:개발자|시스템).{0,10}(?:준|받은).{0,10}(?:지침|규칙|지시|명령어?|명령문).{0,16}(?:원문|보여|출력|공개|알려|노출|그대로)|내부\s*(?:프롬프트|규칙|지시|명령어?|명령문)|(?:프롬프트|prompt|지시문).{0,16}(?:보여|출력|공개|알려|노출|그대로)|(?:보여|출력|공개|알려|노출).{0,16}(?:프롬프트|prompt|지시문)|(?:이전|위|앞선).{0,12}(?:지시|규칙|프롬프트).{0,12}(?:무시|잊어|삭제)|보안.{0,12}(?:뚫|우회|공격)|취약점.{0,12}(?:공격|악용|우회)|해킹.{0,12}(?:방법|공격|뚫|탈취|우회)|(?:비밀번호|토큰|api\s*key|관리자).{0,12}(?:탈취|훔|우회|크랙)/i
// 공격 낱말 없이 "무슨 기준으로 답하는지 알아야 믿고 견적 얘기를 하죠"처럼 답변 기준을 묻는 말.
// 거절 문구 대신 정해 둔 답(chatbot-system-prompt-request)이 지시문은 보여 주지 않고 근거와 상담 경로를 알려 준다.
const SINCERE_ANSWER_BASIS_RE = /견적|믿고|신뢰|무슨\s*기준|어떤\s*기준/
const PROMPT_ATTACK_WORD_RE = /sql|injection|인젝션|xss|csrf|ssrf|\brce\b|무시하고|무시해|우회|탈옥|jailbreak|원문|출력해|그대로\s*출력/i

function isPromptOrSecurityAbuse(text: string) {
  if (!PROMPT_OR_SECURITY_ABUSE_RE.test(text)) return false
  return !(SINCERE_ANSWER_BASIS_RE.test(text) && !PROMPT_ATTACK_WORD_RE.test(text))
}

const CRIMINAL_ABUSE_RE =
  /(?:범죄|불법|사기|피싱|스미싱|절도|도둑|마약|폭탄|무기|살인|폭행).{0,18}(?:방법|하는\s*법|계획|도와|만들|제조|우회|탈취|공격|훔|숨기|피하)|(?:방법|하는\s*법|계획).{0,18}(?:범죄|불법|사기|피싱|스미싱|절도|마약|폭탄|무기|살인|폭행)/i
const TOKEN_WASTE_RE =
  /토큰.{0,12}(?:낭비|소모|다\s*써|태워)|(?:무한|계속).{0,8}반복|(?:1000|10000|10,000|만\s*번).{0,12}(?:반복|써|출력)|(?:반복|출력).{0,12}(?:1000|10000|10,000|만\s*번)/i

function isUnsupportedAcademyPaymentFeatureQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  // 체험·구독 요금의 자동 결제처럼 클래스인 자체 결제를 묻는 말은 학원비 결제 기능 문의가 아니다.
  // 카드 명세서에 찍힌 낯선 결제를 묻는 말도 클래스인 쪽 결제 확인이다.
  if (/체험|구독|요금제|해지|카드\s*등록|(?:내|제)\s*카드|웹\s*라이브|라이브|특강|시청|명세서|빠져나|기억에?\s*없|정기\s*결제|자동\s*결제/.test(text)) return false
  return (
    ACADEMY_PAYMENT_ACTION_RE.test(text) &&
    ACADEMY_PAYMENT_SUBJECT_RE.test(text) &&
    CAPABILITY_REQUEST_RE.test(text)
  )
}

// 챗봇 자기소개 답(정해 둔 답). 정책 가드와 답 색인(curatedRef self 카드)이 같은 답을 쓴다.
function buildSelfKnowledgeAnswer(entry: ChatbotSelfKnowledgeEntry): {
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
} {
  const isConcern = entry.key === "emotional_concern"
  const isEvent = entry.key === "event_inquiry" || entry.key === "event_apply_assist"
  const isApplyAssist = entry.key === "event_apply_assist"
  const isTutorPricing = entry.key === "tutor_pricing_recommend"
  const isFeatureLimit = entry.key === "feature_limit_consulting"
  return {
    response: {
      answer: entry.answer.join("\n\n"),
      answerMode: "direct_answer",
      confidence: 0.92,
      needsHandoff: false,
      sources: [],
      suggestedQuestions: entry.suggestedQuestions,
      unresolved: false,
    },
    category: isConcern ? "concern" : isEvent ? "event" : isTutorPricing ? "billing" : isFeatureLimit ? "admin" : "general",
    intent: isConcern
      ? "emotional_consulting"
      : isApplyAssist
      ? "event_apply_assist"
      : isEvent
      ? "event_inquiry"
      : isTutorPricing
      ? "tutor_pricing_recommend"
      : isFeatureLimit
      ? "feature_limit_consulting"
      : "self_knowledge",
    handoffIntent: "demo",
  }
}

function buildPolicyGuardResponse(question: NormalizedQuestion): {
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  /**
   * 정해 둔 답 확인 관문의 대상이면 그 답의 출처 이름. 보안 공격·범죄·토큰 낭비를 막는 거절 답은 대상이 아니다(없음).
   * 학원 결제 기능 안내와 챗봇 자기소개 답은 거절이 아니라 정규식이 고른 정해 둔 답이라 관문을 거친다.
   */
  gateOriginal?: string
} | null {
  const text = question.redacted.toLowerCase()

  if (isUnsupportedAcademyPaymentFeatureQuestion(question)) {
    return {
      response: {
        answer: [
          "학원 결제 기능은 제공하지 않습니다.",
          "Classin은 수업, 전자칠판, 녹화, EDB, LMS, 관리자 데이터를 중심으로 쓰는 수업 시스템 OS이고, 학원비 결제·수납·정산은 기존 학원 관리 시스템이나 별도 결제/정산 연동 범위로 분리해 설계하는 편이 맞습니다.",
          "요금/견적은 전자칠판, OPS, 카메라, 스탠드/벽걸이, 소프트웨어, 설치·온보딩 구성 기준으로 안내할 수 있어요.",
        ].join("\n\n"),
        answerMode: "direct_answer",
        confidence: 0.96,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: [
          "요금/견적은 어떤 항목으로 구성되나요?",
          "기존 학원 관리 시스템과 연동 범위가 궁금해요",
          "수업 운영 기능을 보고 싶어요",
        ],
        unresolved: false,
      },
      category: "billing",
      intent: "billing_support",
      handoffIntent: "demo",
      gateOriginal: "policy:academy-payment",
    }
  }

  if (isPromptOrSecurityAbuse(text)) {
    return {
      response: {
        answer:
          "보안 공격, SQL injection, 내부 프롬프트 확인, 우회 방법 요청은 도와드리지 않습니다.\n\nClassin 도입이나 운영 보안 기준이 궁금하시면 개인정보 처리, 관리자 권한, API 연동 범위처럼 검토 가능한 항목으로 정리해드릴게요.",
        answerMode: "direct_answer",
        confidence: 0.95,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: [
          "개인정보 처리 기준이 궁금해요",
          "관리자 권한과 보안 범위를 알고 싶어요",
          "API/CRM 연동은 어디까지 가능한가요?",
        ],
        unresolved: false,
      },
      category: "general",
      intent: "docs_lookup",
      handoffIntent: "support",
    }
  }

  if (CRIMINAL_ABUSE_RE.test(text)) {
    return {
      response: {
        answer:
          "범죄나 불법 행위를 돕는 방법은 도와드리지 않습니다.\n\nClassin 제품 도입, 수업 운영, 전자칠판, 계정 문제처럼 정상적인 상담 범위로 질문해 주세요.",
        answerMode: "direct_answer",
        confidence: 0.95,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: [
          "Classin이 어떤 서비스인지 알려주세요",
          "도입 전 확인 질문을 알려주세요",
          "전자칠판 패키지를 보고 싶어요",
        ],
        unresolved: false,
      },
      category: "general",
      intent: "docs_lookup",
      handoffIntent: "support",
    }
  }

  if (TOKEN_WASTE_RE.test(text)) {
    return {
      response: {
        answer:
          "토큰을 소모시키기 위한 반복 출력이나 무의미한 장문 생성은 도와드리지 않습니다.\n\n필요한 Classin 상담 주제를 한 문장으로 적어주시면 짧게 정리해드릴게요.",
        answerMode: "direct_answer",
        confidence: 0.95,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: [
          "도입 상담을 받고 싶어요",
          "수업 운영 문제를 해결하고 싶어요",
          "요금/견적은 어떤 항목으로 구성되나요?",
        ],
        unresolved: false,
      },
      category: "general",
      intent: "docs_lookup",
      handoffIntent: "support",
    }
  }

  // "챗봇 말고 사람 연결해 주세요"는 자기소개가 아니라 상담 연결로 보낸다.
  // ("너 사람 상담원 맞아?"처럼 상담원을 언급만 한 정체성 질문은 그대로 자기소개로 답한다.)
  const selfKnowledgeEntry = EXPLICIT_HUMAN_CONNECTION_RE.test(text)
    ? null
    : findChatbotSelfKnowledgeEntry(question.redacted)
  if (selfKnowledgeEntry) {
    return {
      ...buildSelfKnowledgeAnswer(selfKnowledgeEntry),
      // 어떤 모델로 도는지 같은 내부 기술 정보를 묻는 말에 답을 돌리는 안내(model_boundary)는 내부 정보를 막는 거절 답이라 관문 대상이 아니다.
      // 잡담에 공감으로 받아 주는 답(small_talk)도 정보를 전하는 답이 아니라 관문 대상이 아니다(CONVERSATIONAL_SELF_KNOWLEDGE_KEYS).
      // 다만 '앱 설치하기 싫은데 웹으로 들어갈 수 있나요?'처럼 투정 뒤에 묻는 말이 붙으면 기능 질문일 수 있어 관문을 거친다.
      gateOriginal:
        selfKnowledgeEntry.key === "model_boundary" ||
        (CONVERSATIONAL_SELF_KNOWLEDGE_KEYS.has(selfKnowledgeEntry.key) && !hasQuestionSignal(question.redacted))
          ? undefined
          : `self:${selfKnowledgeEntry.key}`,
    }
  }

  return null
}

function sanitizeLikeToken(token: string) {
  return token.replace(/[%_,()\\]/g, "").slice(0, 40)
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

function isWeakBrandToken(token: string) {
  return /^(classin|클래스인)(은|는|이|가|을|를|과|와|도|의|으로|로|에서|에게|에는|에는요)?$/i.test(token)
}

function isWeakQueryToken(token: string) {
  return /^(가능|가능해|가능한가요|되나요|돼요|되요|알려|알려줘|문의|문의드립니다|궁금|궁금해|어때|어떻게|오늘|내일|추천|해주세요|해줘)$/i.test(token)
}

function getScoringTokens(question: NormalizedQuestion) {
  return question.tokens.filter((token) => !isWeakBrandToken(token) && !isWeakQueryToken(token))
}

const EDB_QUERY_RE = /edb|이\s*디\s*비/i
const POSITIONING_RE =
  /학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|(?<![가-힣])줌|화상회의|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차이|비교|차별|차별점|장점|왜\s*(써|쓰|필요|도입)|일반\s*전자칠판|기존\s*전자칠판|왜\s*전자칠판|edb|이\s*디\s*비|칠판\s*파일|가격\s*부담|비싸|api|sdk|연동|데이터\s*구독|도구.*흩어|녹화.*관리/

const PRE_ADOPTION_CHECK_RE =
  /도입\s*전.*(22|질문|체크리스트|확인)|22\s*가지\s*질문|22.*도입|구매\s*전.*(질문|체크리스트|확인)|상담\s*전.*(질문|체크리스트|확인)/
const PRE_ADOPTION_RECORDING_PERMISSION_RE =
  /(수업\s*녹화|현장\s*녹화|녹화).{0,18}(누가|권한|관리|저장|확인|볼|다운로드|보여|공유|유출|다른\s*사람)|(누가|권한|다른\s*사람).{0,18}(수업\s*녹화|현장\s*녹화|녹화)/i
const PRE_ADOPTION_SIGNUP_INFO_RE =
  /(회원\s*가입|가입).{0,20}(개인정보|전화번호|이메일|메일|휴대폰|핸드폰|정보|뭐|무엇)|(개인정보|전화번호|이메일|메일|휴대폰|핸드폰).{0,20}(회원\s*가입|가입)/i
const PRE_ADOPTION_OFFLINE_BOARD_RE =
  /(오프라인|인터넷\s*없|네트워크\s*없|와이파이\s*없).{0,18}(칠판|판서|전자칠판|보드)|(칠판|판서|전자칠판|보드).{0,18}(오프라인|인터넷\s*없|네트워크\s*없|와이파이\s*없)/i
const PRE_ADOPTION_POLICY_CONFIRM_RE =
  /무료\s*관리자|유료\s*관리자|관리자.{0,12}(권한|무료|유료)|유료\s*전환|사용\s*기간|계약\s*기간|언제까지\s*(사용|쓸)|정기\s*결제|결제.{0,10}포함|포함\s*항목|콘텐츠\s*소유권|소유권|개인정보\s*(처리|보관|관리|방침)|서버(?:는|가|의)?\s*(위치|지역|어디)|메인\s*서버(?:는|가|의)?\s*(위치|지역|어디)?|스토리지.{0,12}(용량|단가|추가|가격)|클라우드.{0,12}(용량|저장|단가|추가)|저장\s*(용량|공간)|펜\s*팁|전용\s*펜|소모품.{0,12}(가격|구매|재고)|팁.{0,12}(가격|구매|재고)/i
const PRE_ADOPTION_HARDWARE_CONDITIONAL_RE =
  /카메라.{0,18}(화각|추적|트래킹|조정|전경|클로즈업)|마이크.{0,18}(성능|외부|세팅|설정|가능)|외부\s*(pc|컴퓨터|노트북)|따로\s*(pc|컴퓨터|노트북)|ops|컴퓨터.{0,12}(연결|따로|없이)/i
// 보관 기간을 묻는 말: 몇 달·며칠·언제까지·얼마나 저장·사라지나·자동 삭제·연장.
const RECORDING_RETENTION_PERIOD_RE =
  /몇\s*(?:달|개월|일|주|년)|며칠|얼마나\s*(?:오래|저장|보관|남)|얼마\s*동안|언제까지|\d+\s*(?:년|개월|달)\s*(?:뒤|후|지나)|보관\s*기간|저장\s*기간|사라지|없어지|자동\s*삭제|연장/
// 장비의 원가·가격을 묻는 말.
const HARDWARE_COST_QUESTION_RE = /원가|마진|공급가|도매|납품가|단가|얼마|가격|비용|값/
const GOOGLE_CLASSROOM_RE =
  /구글\s*클래스룸|google\s*classroom|수업반\s*생성|반\s*(생성|개설).{0,12}(100|백|대형)|100\s*개.{0,8}반|자료\s*업로드|과제\s*점수|과제\s*체크/i
const SITE_ENTRY_INTEGRATION_RE =
  /사이트.{0,24}(입장|버튼|적용|연동)|입장\s*버튼.{0,24}(classin|클래스인|수업)|자사\s*사이트|홈페이지.{0,24}(수업|입장|연동)/i
const S65_QUOTE_RE = /s\s*65|s65|65\s*인치/i
const BOARD_ONLY_OR_PLATFORM_RE =
  /전자칠판만|보드만|단품\s*(판매|구매)|플랫폼.{0,12}(내장|내재)|내장된\s*전자칠판|전자칠판.{0,18}(플랫폼|소프트웨어)/i
const CAMERA_CONFLICT_RE =
  /카메라.{0,18}(안\s*켜|꺼|꺼져|권한|한\s*명|한명|1명|문제|오류)|(한\s*명|한명|1명).{0,18}카메라/i

const COMPARISON_RE =
  /zoom|(?<![가-힣])줌|화상회의|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차이|비교|차별점|차별화|장점|왜\s*(써|쓰|필요|도입)|일반\s*전자칠판|기존\s*전자칠판/

// 시중 경쟁 전자칠판 브랜드를 콕 집어 묻는 비교 질문 인식용.
// 정책: 트리거로 비교 의도만 인식하고, 답변에서는 브랜드명을 노출하거나 타사 사양·우열을 단정하지 않는다.
// 대신 '일반 전자칠판 대비' Classin Board 차별점(내장 OPS·EDB·녹화/복습/LMS·관리자 데이터)으로 전환한다.
const COMPETITOR_BOARD_RE =
  /다른\s*(?:회사|브랜드|업체|제품).{0,16}(?:전자\s*)?(?:칠판|보드)|왜\s*(?:이렇게\s*)?비싸|넥소|nexo|삼성\s*플립|samsung\s*flip|뷰소닉|viewsonic|프로메테안|promethean|맥스허브|maxhub|아하\s*(보드|칠판)|시중\s*(전자\s*)?칠판|타사\s*(전자\s*)?칠판|다른\s*(회사|브랜드|업체)\s*(의\s*)?(전자\s*)?칠판|(삼성|lg|엘지)\s*(전자칠판|칠판|보드|플립|패널)/i

const IDENTITY_RE =
  /(classin|클래스인).*(뭐야|뭐예요|뭐에요|무엇|뭔가요|뭔데|뭐임|뭐\s*하는|어떤\s*(서비스|제품|솔루션|도구|플랫폼)|소개|설명)|(뭐야|뭐예요|뭐에요|무엇|뭔가요|뭔데|뭐임|뭐\s*하는|어떤\s*(서비스|제품|솔루션|도구|플랫폼)|소개|설명).*(classin|클래스인)/

const IDENTITY_EXCLUSION_RE =
  /가격|요금|견적|결제|환불|취소|영수증|세금|계산서|청구|구독|하드웨어|전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|설치|납품|배송|\bas\b|a\/s|수리|고장|파손|오류|에러|안됨|안\s*돼|로그인|계정|비밀번호|접속|권한|장애|끊김/

// 명시적 보드 단어(전자칠판/보드/칠판/모델명)는 무조건 하드웨어 타깃으로 본다.
// '대시보드'의 '보드'는 전자칠판이 아니다 — "관리자 대시보드에 인증 메시지가 떠요"가 보드 스펙으로 새던 원인.
const HARDWARE_TARGET_RE =
  /classin\s*board|클래스인\s*보드|classin.*하드웨어|클래스인.*하드웨어|전자칠판|하드웨어|\bboard\b|(?<!대시\s?)보드|칠판|s65|s75|s86|s98|s110|bs65|bs75|bs86|bscp98|bs110/i

// 모델·사이즈처럼 일반적인 제품 단어는 결제/계정 같은 다른 도메인 신호가 없을 때만 보드 질문으로 본다.
const GENERIC_PRODUCT_RE = /모델|라인업|사이즈|인치|크기/i

const NON_HARDWARE_CONTEXT_RE =
  /결제|요금|가격|견적|영수증|세금|청구|구독|환불|정산|로그인|비밀번호|아이디|계정|출결|출석|숙제|과제|리포트|메타버스|아바타|채점|출제/i

// 짧은 "어떤 모델 있어?"류 질문도 보드 라인업으로 인식시키되, 다른 도메인 단어가 섞이면 제외한다.
function isBoardTargeted(text: string) {
  if (HARDWARE_TARGET_RE.test(text)) return true
  return GENERIC_PRODUCT_RE.test(text) && !NON_HARDWARE_CONTEXT_RE.test(text)
}

const HARDWARE_BOARD_LINEUP_INTENT_RE =
  /어떤|뭐|무엇|종류|라인업|모델|추천|있지|있어|고르|선택|구성|제품/i

const SOFTWARE_BOARD_FEATURE_RE =
  /개인\s*칠판|보조\s*칠판|ai\s*칠판|칠판\s*파일|edb|이\s*디\s*비|판서\s*도구|매직펜|업데이트|릴리즈|버전|6\.0/i

// 상세 사양을 콕 집어 묻는 신호. 모델·라인업·추천 같은 '넓은 라인업' 단어는 여기서 제외한다.
const HARDWARE_SPECS_RE =
  /스펙|사양|규격|크기|사이즈|인치|두께|가로|세로|치수|외형|\d\s*mm|해상도|화면|ops|터치(?!\s*펜)|주사율|밝기|시야각|마이크|스피커|무선|nfc|무게|중량|소비\s*전력|전력|유리|인증|부속|비교/i

// 대형 공간·특정 대형 모델을 명시적으로 물을 때만 98/110을 공개한다.
const HARDWARE_BIG_MODEL_RE =
  /s\s*98|s98|s\s*110|s110|98\s*인치|110\s*인치|대형|큰\s*(강의실|화면|교실|공간|곳|거|것|모델|사이즈)|제일\s*큰|가장\s*큰|강당|설명회|넓은\s*(강의실|교실|공간)/i

const HARDWARE_TROUBLE_RE =
  /안\s*(켜|켜져|켜지|나와|나오|보여|보이|됨|돼)|꺼져|꺼짐|켜지지|나오지|보이지|먹통|고장|수리|\bas\b|a\/s|오류|에러|문제|장애|전원|검은\s*화면|화면이\s*안|화면\s*(꺼짐|안|나오지|나옴|안\s*나)|소리\s*안|터치\s*안|끊김|끊겨|깜빡|연기|냄새|액체|파손|깨짐|금감|감전|화재/i

const HARDWARE_UNCONFIRMED_DETAIL_RE =
  /색상|색깔|컬러|마감|화이트|블랙|검정|흰색|보증\s*기간|보증기간|무상\s*(as|a\/s|수리)|유상\s*(as|a\/s|수리)|원산지|제조사/i

const HARDWARE_SPECS_EXCERPT =
  "Classin Board는 모델별로 S75, S86, S98 Pro, S110 사양을 우선 확인합니다. 공통으로 4K 해상도, 16:9 화면, 178도 시야각, 밝기 350cd/m² 이상, 50점 적외선 터치, 내장 OPS(Windows, 16GB 메모리·256GB SSD), Wi-Fi ax/BT5.0, 2×15W 스피커를 기준으로 봅니다. 주요 차이는 화면 크기, 주사율, OPS CPU, 마이크 기재 여부, 무게와 소비전력입니다. S65는 라인업에는 있으나 현재 상세 규격서 확인이 필요합니다."

const HARDWARE_BOARD_LINEUP_EXCERPT =
  "Classin 칠판은 보통 Classin Board 전자칠판 라인업을 뜻합니다. 현재 안내 가능한 주요 모델은 S75, S86, S98 Pro, S110이며, 교실 크기와 맨 뒷자리 시야, 이동형 스탠드/벽걸이, 카메라·마이크 필요 여부로 고릅니다. 75·86인치는 일반 강의실, 98·110인치는 대형 강의실이나 설명회 공간에 더 잘 맞습니다. S65는 라인업에는 있으나 상세 규격 확인이 필요합니다."

const HARDWARE_BOARD_LINEUP_STANDARD_EXCERPT =
  "Classin Board 전자칠판은 보통 75인치(S75)와 86인치(S86)를 표준으로 가장 많이 선택합니다. 일반 강의실 대부분은 이 두 모델로 시작하며, 학생 수와 맨 뒷자리 시야, 이동형 스탠드/벽걸이, 카메라·마이크 필요 여부로 고릅니다. 대형 강의실·강당·설명회처럼 더 큰 공간이라면 추가 라인업도 있으니 상담에서 공간에 맞춰 안내해 드립니다."
const HARDWARE_SPECS_STANDARD_EXCERPT =
  "Classin Board는 75인치(S75)와 86인치(S86)가 표준 모델입니다. 두 모델 모두 4K(3840×2160) 해상도, 16:9 화면, 178도 시야각, 밝기 350cd/m² 이상, 50점 적외선 터치, 내장 OPS(Windows, 16GB 메모리·256GB SSD), Wi-Fi ax/BT5.0, 2×15W 스피커를 기준으로 봅니다. 본체 치수(가로×세로×두께, 규격서 기준)는 S75가 1,718.18×1,000.2×113.1mm(54kg), S86이 1,964.08×1,139.02×113.1mm(69.5kg)입니다. 더 큰 공간을 위한 추가 라인업은 상담에서 공간·예산에 맞춰 안내해 드립니다."

const HARDWARE_TROUBLE_EXCERPT =
  "전자칠판 화면이 안 나오면 전원 플러그와 멀티탭, 오른쪽 측면 하단 전원 버튼, 대기 모드, 입력 소스(OPS/HDMI), HDMI 케이블과 외부 기기 화면 출력을 순서대로 확인합니다. 연기, 냄새, 액체 유입, 파손이 있으면 전원을 분리하고 A/S로 연결합니다."

const HARDWARE_UNCONFIRMED_DETAIL_EXCERPT =
  "공개 스펙 기준으로는 모델별 화면 크기, OPS, 터치, 전력 같은 핵심 사양을 우선 안내할 수 있습니다. 색상, 마감, 보증 기간, 제조·재고 조건처럼 공급 조건에 따라 달라질 수 있는 세부 옵션은 최신 견적·납품 기준 확인이 필요합니다."

// "안 돼/안됨"만으로는 로그인 문제로 보지 않는다 — "기관 등록 안됨", "녹화 안 돼요"가 로그인 답변으로 새던 원인.
const LOGIN_TROUBLE_RE =
  /로그인|접속|비밀번호|패스워드|인증\s*코드|인증코드|아이디|계정(?!\s*(?:인증|삭제|탈퇴)).{0,12}(안|오류|에러|문제)|재설정/i

// '접속' 말고 로그인 주제임을 직접 드러내는 낱말.
const LOGIN_EXPLICIT_TOPIC_RE = /로그인|비밀번호|패스워드|인증\s*코드|인증코드|아이디|계정|재설정/i
// 문제 신호: 안 됨, 오류, 분실, 재설정·변경 요청. "~하면 안 되나요?"는 허락을 묻는 말이라 문제 신호가 아니다.
const LOGIN_TROUBLE_SIGNAL_RE =
  /(?<!면\s?)안\s*(?:돼|되|됨|됐|됩|와|옴|열|들어가)|(?<!면\s?)안돼|(?<!면\s?)안되|안됨|못\s*(?:하|해|들어)|오류|에러|문제|실패|틀렸|틀리|잊|까먹|모르겠|막혔|막혀|잠겼|잠김|차단|재설정|변경|바꾸|바꿔|찾기|찾고|해결|초기화|분실/
// 접속·로그인이 들어가도 인원·요금·속도·방식을 묻는 사실 질문.
const LOGIN_FACT_QUESTION_RE =
  /몇\s*명|최대|인원|정원|동시\s*접속|비용|요금|가격|무료|유료|느려|속도|방식|종류/

const LIVE_CLASS_TROUBLE_RE =
  /수업.*(나가(?!면|도\s|기|려|게|야|라|는\s*(?:법|방법))|나감|튕김|튕겨|끊김|끊겨|입장\s*안|접속\s*안)|화면\s*공유.*(끊김|끊겨|오류|에러|안\s*됨|안\s*돼)|소리.*(안\s*들|끊김|끊겨)|마이크.*(안\s*됨|안\s*돼|끊김)/i
const PARENT_REPORT_OR_NOTIFICATION_RE =
  /학부모.{0,18}(알림|문자|메시지|푸시|리포트|보고서|상담|피드백)|(?:알림|문자|메시지|푸시|리포트|보고서|상담|피드백).{0,18}학부모/i

function isPositioningQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (isOtherBoardInstallText(text) && !COMPARISON_RE.test(text)) return false
  return POSITIONING_RE.test(text) || COMPETITOR_BOARD_RE.test(text) || isIdentityQuestion(question)
}

function isPreAdoptionCheckQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return PRE_ADOPTION_CHECK_RE.test(text)
}

function isPreAdoptionRecordingPermissionQuestion(question: NormalizedQuestion) {
  if (!PRE_ADOPTION_RECORDING_PERMISSION_RE.test(question.redacted)) return false
  // "녹화본은 몇 달 저장되나요", "언제까지 볼 수 있어요"는 권한이 아니라 보관 기간을 묻는 말이다.
  // 권한 안내("수업 녹화와 현장 녹화는 목적이 달라서…")로 답하면 기간 질문에 답이 되지 않는다.
  return !RECORDING_RETENTION_PERIOD_RE.test(question.redacted)
}

function isPreAdoptionSignupInfoQuestion(question: NormalizedQuestion) {
  return PRE_ADOPTION_SIGNUP_INFO_RE.test(question.redacted)
}

function isPreAdoptionOfflineBoardQuestion(question: NormalizedQuestion) {
  return PRE_ADOPTION_OFFLINE_BOARD_RE.test(question.redacted)
}

function isPreAdoptionPolicyConfirmQuestion(question: NormalizedQuestion) {
  if (!PRE_ADOPTION_POLICY_CONFIRM_RE.test(question.redacted)) return false
  // "유료 전환하면 한 달에 얼마예요"는 권한 정책이 아니라 가격 질문이다.
  const withoutPaidSwitch = question.redacted.replace(/유료\s*전환/g, "")
  if (/얼마|가격|요금|비용/.test(question.redacted) && !PRE_ADOPTION_POLICY_CONFIRM_RE.test(withoutPaidSwitch)) return false
  return true
}

function isPreAdoptionHardwareConditionalQuestion(question: NormalizedQuestion) {
  if (!PRE_ADOPTION_HARDWARE_CONDITIONAL_RE.test(question.redacted)) return false
  // "OPS 원가는?", "OPS 따로 사면 얼마예요"는 구성 조건이 아니라 가격·원가를 묻는 말이다.
  return !HARDWARE_COST_QUESTION_RE.test(question.redacted)
}

function isPreAdoptionSpecificQuestion(question: NormalizedQuestion) {
  return (
    isPreAdoptionRecordingPermissionQuestion(question) ||
    isPreAdoptionSignupInfoQuestion(question) ||
    isPreAdoptionOfflineBoardQuestion(question) ||
    isPreAdoptionPolicyConfirmQuestion(question) ||
    isPreAdoptionHardwareConditionalQuestion(question)
  )
}

const RECEIPT_RE = /세금\s*계산서|세금계산서|영수증|증빙|청구서|계산서\s*발급/

function isReceiptQuestion(question: NormalizedQuestion) {
  return RECEIPT_RE.test(question.redacted.toLowerCase())
}

function getReceiptAnswer(question?: NormalizedQuestion) {
  const text = question?.redacted.toLowerCase() ?? ""
  // 학부모의 수업료 영수증은 학원이 발급한다. 클래스인 결제 증빙과 섞지 않는다.
  if (/수업료|교육비|학원비|원비/.test(text) && /학부모|아이|자녀|연말정산|교육비\s*공제/.test(text)) {
    return [
      "학원 수업료를 어떻게 내는지와 교육비 영수증(교육비 납입 증명)은 학원이 정하고 발급해요. 공개 안내 기준으로 학원비 결제·정산은 클래스인의 기본 기능이 아니라서, 앱으로 결제하라는 안내가 어떤 앱과 화면을 말하는지 학원에 먼저 확인해 주세요.",
      "연말정산용 교육비 공제 서류도 학원에 요청하시면 돼요.",
    ].join("\n\n")
  }
  return [
    "학원(기관) 계정의 결제 영수증은 관리자 콘솔 [결제] > [영수증 관리]에서 확인할 수 있어요. 개인 요금제로 직접 결제하셨거나 세금계산서 같은 다른 증빙이 필요하다면, 받을 수 있는지와 방법은 결제한 계정을 보고 결제 담당이 확인해 드려요. 상담 채널(홈페이지 하단 채팅)이나 담당 매니저에게 필요한 증빙과 기간을 알려 주세요. 결제 방법도 같은 곳에서 확인할 수 있어요.",
    /경비|종합소득세|세무|공제|소득세|부가세\s*신고/.test(text)
      ? "카드 영수증만으로 경비 처리가 되는지 같은 세무 판단은 제가 단정할 수 없어요. 신고 전에 세무사나 국세청 안내로 확인해 주세요."
      : "아직 결제 전이라면 결제하기 전에 상담 채널에서 발급 방법을 먼저 정해 두시는 게 좋아요. 결제 뒤에 찾다가 학원 회계와 어긋나는 경우가 많습니다.",
    "사업자 정보는 이 채팅창에 적지 마시고 상담 채널에서 담당자에게 전달해 주세요.",
  ].join("\n\n")
}

const TRIAL_LIMIT_RE =
  /체험.{0,24}(?:제한|막혀|막힘|못\s*(?:넣|만들|써|쓰)|안\s*(?:돼|되)|몇\s*명|인원|기능\s*(?:제한|차이)|끝났|끝나|종료|만료|짧|기간)/
const ACCOUNT_PLAN_RE =
  /(?:지금|현재|우리\s*학원|저희\s*학원|저희가|우리가).{0,20}(?:요금제|플랜|계약|라이선스).{0,24}(?:몇\s*명|한도|인원|최대|확인|남았|언제까지)/

function isAccountPlanOrTrialLimitQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return TRIAL_LIMIT_RE.test(text) || ACCOUNT_PLAN_RE.test(text)
}

function getAccountPlanOrTrialLimitAnswer(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (TRIAL_LIMIT_RE.test(text) && /끝났|끝나|종료|만료|짧|기간/.test(text)) {
    return [
      "공식 안내 기준으로 무료 체험은 2주예요. 신청한 지 얼마 안 됐는데 체험이 끝났다고 나온다면, 계정 상태를 담당자가 확인해 드려야 해요.",
      "아래 [도입 상담 남기기]로 학원명과 체험을 신청한 날짜를 남겨 주세요. 계정 정보는 채팅창에 적지 않으셔도 돼요. 체험 기간을 확인하고 이어서 쓸 수 있는 방법을 안내드립니다.",
    ].join("\n\n")
  }
  if (TRIAL_LIMIT_RE.test(text)) {
    return [
      "체험 계정에서 넣을 수 있는 인원과 쓸 수 있는 기능은 체험 조건에 따라 달라서, 담당자가 계정을 보고 확인해 드려요.",
      "도입 검토 중이시라면 아래 [도입 상담 남기기]로 학원 규모와 확인하고 싶은 기능(학생 수, 녹화 등)을 남겨 주세요. 체험 범위를 늘리거나 데모로 보여 드릴 수 있는지 함께 안내드립니다.",
    ].join("\n\n")
  }
  return [
    "지금 쓰시는 요금제의 학생·강사 한도는 계정과 계약마다 달라 담당자가 확인해 드려요.",
    "관리자 대시보드 [결제] > [결제 개요]에서 지금까지의 결제·비용 내역은 바로 볼 수 있어요. 정확한 한도와 남은 기간은 상담 채널(홈페이지 하단 채팅)이나 담당 매니저에게 학원명과 함께 요청해 주세요.",
  ].join("\n\n")
}

function isRefundQuestion(question: NormalizedQuestion) {
  return /환불|해지|위약금/.test(question.redacted.toLowerCase())
}

function isCourseCreationQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /코스|클래스/.test(text) && /생성|만들|개설|추가/.test(text)
}

// "숙제를 어떻게 내요?"처럼 강사가 과제를 만드는 질문에만 강사용 안내를 붙인다.
// 학생·학부모의 늦은 제출·다시 내기·제출 오류("마감 지났는데 내도 돼요?")는 학생용 문서로 보낸다.
const STUDENT_SUBMISSION_RE =
  /늦게|마감|못\s*(?:냈|내)|다시\s*(?:내|제출|해서)|재제출|제출이?\s*안|안\s*(?:올라|내져)|내도\s*(?:돼|되)|받아\s*줌|날아|사라|우리\s*아이|아이가|애가/

// 기능이 있는지를 묻는 말("숙제 제출받는 기능 있나요"). 조작 순서(교사의 숙제 게시, 학생 모바일 제출 가이드)로 답하지 않는다.
const FEATURE_EXISTENCE_RE = /기능\s*(?:이|은|도|좀)?\s*(?:있|없|되|돼|지원|제공)/
// 기능이 있는지와 함께 하는 방법까지 묻는 말("숙제 기능 있는데 어떻게 내요?")은 조작 순서로 답한다.
const HOWTO_SIGNAL_RE = /어떻게|방법|순서|하려면/
function asksOnlyFeatureExistence(text: string) {
  return FEATURE_EXISTENCE_RE.test(text) && !HOWTO_SIGNAL_RE.test(text)
}
// 학생이 주어인 제출 질문("숙제 파일 학생이 여기서 제출할 수 있어요?")은 교사의 숙제 게시 안내가 아니다.
const STUDENT_SUBJECT_SUBMISSION_RE = /학생(?:이|은|도|들이|들은|들도)\s*.{0,16}(?:제출|내|올리|올려)/

function isAssignmentQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (STUDENT_SUBMISSION_RE.test(text)) return false
  if (asksOnlyFeatureExistence(text) || STUDENT_SUBJECT_SUBMISSION_RE.test(text)) return false
  return /과제|숙제|시험/.test(text) && /내는|내려면|낼\s*수|어떻게\s*내|제출|부여|등록|만들|방법|출제/.test(text)
}

const AI_DATA_POLICY_RE = /\bai\b.{0,30}(?:학습|훈련|데이터|외부).{0,16}(?:쓰|사용|활용|보내|전송|들어)|(?:음성|영상).{0,20}(?:ai|인공지능).{0,16}(?:학습|훈련)/i

function isPrivacyProcessingQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /개인정보.*(처리|보관|관리|방침|유출|보호|보안)|데이터.*(처리|보관|지역|유출|보안)/.test(text) || AI_DATA_POLICY_RE.test(text)
}

function isRecordingOptionComparisonQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /수업\s*녹화/.test(text) && /현장\s*녹화/.test(text)
}

function isRecordedLessonOptionQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /녹화\s*수업/.test(text) && /학생\s*시청|시청\s*제한/.test(text)
}

function isDailyAssignmentRepeatQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /일일\s*과제|과제\s*반복|요일\s*반복/.test(text)
}

function isAdminDashboardMenuMapQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /대시보드|dashboard/.test(text) && /메뉴|라이브.*플레이백|api\s*도킹|위치|어디/.test(text)
}

function isCompanyIntroQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /회사\s*소개|회사소개|기업\s*소개|기업소개/.test(text)
}

function isGoogleClassroomQuestion(question: NormalizedQuestion) {
  return GOOGLE_CLASSROOM_RE.test(question.redacted)
}

function isSiteEntryIntegrationQuestion(question: NormalizedQuestion) {
  return SITE_ENTRY_INTEGRATION_RE.test(question.redacted)
}

function isS65QuoteQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return S65_QUOTE_RE.test(text) && /견적|가격|비용|구매|판매|가능|있나요|받을/i.test(text)
}

function isBoardOnlyOrPlatformQuestion(question: NormalizedQuestion) {
  return BOARD_ONLY_OR_PLATFORM_RE.test(question.redacted)
}

function isCameraConflictQuestion(question: NormalizedQuestion) {
  return CAMERA_CONFLICT_RE.test(question.redacted)
}

function isApiIntegrationQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /api|sdk|연동|데이터\s*구독|가상계정|수업\s*중계|코스\s*정보|수업\s*정보|crm|lms/.test(text)
}

function isComparisonQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  // "엘지 전자칠판에도 설치돼요"는 비교가 아니라 다른 회사 칠판에 클래스인을 설치하는지 묻는 말이다.
  if (isOtherBoardInstallText(text) && !COMPARISON_RE.test(text)) return false
  return COMPARISON_RE.test(text) || COMPETITOR_BOARD_RE.test(text)
}

// 다른 회사·이미 가진 칠판(TV·모니터)에 클래스인을 설치·실행하는지 묻는 말("엘지 전자칠판에도 설치돼요",
// "삼성 전자칠판에 클래스인 깔 수 있어요?"). 비교·라인업·설치 형태(스탠드·벽걸이) 답으로 가로채지 않는다.
const OTHER_BOARD_INSTALL_RE =
  /(?:전자\s*칠판|칠판|보드|tv|티비|모니터|패널)(?:에|에도|에서)\s*(?:\S+\s*)?(?:설치|깔|까|돌아가|돌려|실행|호환|쓸\s*수|써도)/
const OTHER_BOARD_OWNER_RE = /기존|원래|이미|쓰던|쓰고\s*있는|갖고\s*있는|가지고\s*있는|우리|저희|다른|타사|일반|삼성|lg|엘지/

function isOtherBoardInstallText(text: string) {
  return OTHER_BOARD_INSTALL_RE.test(text) && (COMPETITOR_BOARD_RE.test(text) || OTHER_BOARD_OWNER_RE.test(text))
}

function isIdentityQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (IDENTITY_EXCLUSION_RE.test(text)) return false
  if (IDENTITY_RE.test(text)) return true
  // 주어 없이 묻는 "뭐하는 회사야", "무슨 서비스예요?"도 위젯 안에서는 클래스인을 묻는 말이다.
  return isSubjectlessClassinIdentityQuestion(text)
}

function isCompanyIdentityQuestion(question: NormalizedQuestion) {
  return /회사|기업|업체|만든\s*곳|어디\s*거/.test(question.redacted)
}

// "칠판 티비 밝기 줄이고 싶어요", "화면에 줄이 생겼어요"처럼 쓰는 법·증상을 묻는 말은 스펙 질문이 아니다.
const BOARD_USAGE_OR_SYMPTOM_RE =
  /하고\s*싶|하려면|어떻게\s*(?:해|하|줄|바꾸|끄|켜|나눠)|방법|나눠|보내|공유|저장|생겼|생기|줄이|낮추|켜져\s*있|혼자|녹음|녹화|걸어|세워|이사|벽이|안\s*(?:돼|되|나|먹)|안돼|안되|느려|버벅|늘어|뚱뚱|이상해|이상하|눌러도|반응|낙서|닦|지워|아세톤|기사|접수|수리|고치|소개|혜택|이벤트|프로모션|할부|분할|나눠\s*내|매달|\bmac\b|802|내부망|와이파이|wi-?fi|권한|판서|학생|매직|업데이트|usb|한글|파일|보증|대체\s*기기|몇\s*년\s*쓰/

const BOARD_ACCESSORY_QUESTION_RE =
  /(?:펜|리모컨|케이블|구성품|부속품).{0,12}(?:같이|함께|포함|딸려|들어\s*있|기본\s*(?:으로|제공)|와요|오나요|오나|주나요|줘요|줘\?|챙겨)/

function isHardwareSpecsQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (COMPETITOR_BOARD_RE.test(text)) return false
  if (BOARD_USAGE_OR_SYMPTOM_RE.test(text)) return false
  // "터치펜 같이 와요?"는 사양이 아니라 받는 구성품을 묻는 말이다. 모델 사양표로 답하지 않는다.
  if (BOARD_ACCESSORY_QUESTION_RE.test(text) || isOtherBoardInstallText(text)) return false
  return (
    isBoardTargeted(text) &&
    HARDWARE_SPECS_RE.test(text) &&
    !HARDWARE_TROUBLE_RE.test(text) &&
    !isHardwareUnconfirmedDetailQuestion(question)
  )
}

function isHardwareBoardLineupQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (INSTALL_FORM_RE.test(text)) return false
  if (BOARD_USAGE_OR_SYMPTOM_RE.test(text)) return false
  if (isOtherBoardInstallText(text)) return false
  return (
    isBoardTargeted(text) &&
    HARDWARE_BOARD_LINEUP_INTENT_RE.test(text) &&
    !SOFTWARE_BOARD_FEATURE_RE.test(text) &&
    !HARDWARE_TROUBLE_RE.test(text) &&
    !isHardwareUnconfirmedDetailQuestion(question) &&
    // 사양을 콕 집어 물으면(예: '사이즈') 넓은 라인업 대신 상세 사양 답변으로 보낸다.
    !HARDWARE_SPECS_RE.test(text)
  )
}

function isHardwareTroubleQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return isBoardTargeted(text) && HARDWARE_TROUBLE_RE.test(text)
}

function isHardwareUnconfirmedDetailQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return isBoardTargeted(text) && HARDWARE_UNCONFIRMED_DETAIL_RE.test(text) && !HARDWARE_TROUBLE_RE.test(text)
}

function isLoginTroubleQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (!LOGIN_TROUBLE_RE.test(text)) return false
  const hasTroubleSignal = LOGIN_TROUBLE_SIGNAL_RE.test(text)
  // "한 교실에 최대 몇 명까지 접속할 수 있나요", "접속하려면 비용 드나요", "로그인 방식은 뭐가 있어요"처럼
  // 접속·로그인을 지나가며 말한 사실 질문(인원·요금·속도·방식)은 로그인 문제가 아니다.
  if (LOGIN_FACT_QUESTION_RE.test(text) && !hasTroubleSignal) return false
  // '접속'만으로는 로그인 문제로 보지 않는다. 안 됨·오류·분실 같은 문제 신호가 함께 있을 때만 본다.
  if (!LOGIN_EXPLICIT_TOPIC_RE.test(text)) return hasTroubleSignal
  return true
}

function isLiveClassTroubleQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return LIVE_CLASS_TROUBLE_RE.test(text)
}

function isParentReportOrNotificationQuestion(question: NormalizedQuestion) {
  return PARENT_REPORT_OR_NOTIFICATION_RE.test(question.redacted)
}

function isWebLiveBillingQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /웹\s*라이브|web\s*live|라이브\s*&?\s*플레이백/.test(text) && /요금|요금제|플랜|비용|가격|가능|되나요|지원/.test(text)
}

// 가격/요금 정보성 질문. 웹라이브·환불·세금계산서는 각자 핸들러가 있으니 제외한다.
const PRICING_MONEY_RE = /요금|가격|비용|금액|가격대/i
const PRICING_INFO_RE = /요금|가격|비용|금액|가격대|얼마/i
const PRICING_EXCLUDE_RE = /환불|취소|위약금|세금|계산서|영수증|청구|정산|미납|연체/i
// "얼마나 걸려요"(기간)는 가격이 아니다 — 돈 단어가 없으면 가격에서 뺀다.
const PRICING_DURATION_RE = /얼마나?\s*(걸리|걸려|걸릴|오래|소요|기간|시간|일|주|개월)/i
// '얼마'가 돈이 아니라 양·빈도·성능을 묻는 말("용량 얼마에요", "업로드 속도는 얼마나 있어야 해요", "업데이트 얼마나 자주").
// 돈 단어(요금·가격·비용)가 없고 이런 양을 가리키는 말이 있으면 가격 질문으로 보지 않는다.
const PRICING_NON_MONEY_AMOUNT_RE =
  /용량|속도|해상도|화질|대역폭|mbps|기가|\bgb\b|\bmb\b|메가|크기|사이즈|인치|무게|길이|거리|자주|빈도|주기|간격|횟수|번\s*(?:정도|씩)|오래|기간|시간|걸리|걸려|지연|딜레이|배터리|저장\s*공간|사양|스펙|성능|버전|높아야|낮아야|이상이어야/i
const PRICING_HEADCOUNT_RE = /인원|몇\s*명|\d+\s*명/
const SOFTWARE_ONLY_BUYER_RE =
  /소프트웨어만|프로그램만|앱만|하드웨어\s*없이|전자칠판\s*없이|(?<!대시\s?)보드\s*없이|계정당|계정\s*당|플랜|standard|plus|enterprise/i
const SUBSCRIPTION_OR_CONSUMPTION_RE =
  /구독형|충전형|충전제|subscription|consumption|사용량\s*기준|월\s*구독|월구독/i
const SUPPORT_SERVICE_FEE_RE = /원격\s*(?:지원|제어|상담)|상담\s*(?:받|비|료|자체|하는\s*데|하는데)|상담료/

function isPricingInfoQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (PRICING_EXCLUDE_RE.test(text)) return false
  if (isComparisonQuestion(question)) return false
  if (ACCOUNT_PLAN_RE.test(text) || TRIAL_LIMIT_RE.test(text)) return false
  if (isWebLiveBillingQuestion(question)) return false
  if (!PRICING_MONEY_RE.test(text) && PRICING_DURATION_RE.test(text)) return false
  if (!PRICING_MONEY_RE.test(text) && PRICING_NON_MONEY_AMOUNT_RE.test(text)) return false
  // 인원은 값을 매기는 기준으로도 쓰인다("30명이면 얼마예요"). '얼마나'(몇 명 들어가나)로만 물을 때만 가격 질문이 아니다.
  if (!PRICING_MONEY_RE.test(text) && PRICING_HEADCOUNT_RE.test(text) && !/얼마(?!나)/.test(text)) return false
  // "원격 지원은 비용 따로 받나요", "상담받는 데 돈 드나요"는 제품 견적 구성이 아니라 지원·상담 서비스의 비용을 묻는 말이다.
  if (SUPPORT_SERVICE_FEE_RE.test(text)) return false
  return PRICING_INFO_RE.test(text)
}

function isSoftwarePricingQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return (
    SOFTWARE_ONLY_BUYER_RE.test(text) ||
    SUBSCRIPTION_OR_CONSUMPTION_RE.test(text) ||
    (isPricingInfoQuestion(question) &&
      /소프트웨어|앱|계정|플랜|구독|충전|standard|plus|enterprise/.test(text))
  )
}

function isTrialOrPilotQuestion(question: NormalizedQuestion) {
  return isTrialOrPilotText(question.redacted)
}

// 설치 형태(스탠드/벽걸이)와 설치 가능/기간. 하드웨어 장애와는 분리한다.
const INSTALL_FORM_RE = /스탠드|벽걸이|벽\s*부착|벽\s*설치|벽에\s*(?:거는|걸|다는|달)|바퀴\s*(?:달린|있는)|이동형|이동식|거치(대|형)?/i
const INSTALL_HW_CONTEXT_RE = /전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|(?<!대시\s?)보드|칠판|하드웨어|교실|벽면|s\s*(?:65|75|86|98|110)\b/i
const INSTALL_INTENT_RE = /가능|돼|되나|될까|할\s*수|하나요|해야|방식|유형|형태|환경|기간|일정|얼마|어떻게|어디/i
const OTHER_BOARD_TARGET_RE =
  /(?:기존|원래|이미|쓰던|쓰고\s*있는|갖고\s*있는|가지고\s*있는|우리|저희|다른\s*(?:회사|브랜드|업체)|타사|삼성|lg|엘지)\s*(?:\S+\s*)?(?:전자\s*칠판|칠판|보드|tv|티비|모니터)(?:에|에도|에서)/

function isInstallFormQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (HARDWARE_TROUBLE_RE.test(text)) return false
  // "엘지 전자칠판에도 설치돼요", "기존 칠판에 깔 수 있어요"는 클래스인 보드의 설치 형태가 아니라
  // 다른 회사·이미 가진 칠판에 클래스인을 설치하는지 묻는 말이다.
  if (!INSTALL_FORM_RE.test(text) && (COMPETITOR_BOARD_RE.test(text) || OTHER_BOARD_TARGET_RE.test(text) || isOtherBoardInstallText(text))) return false
  if (INSTALL_FORM_RE.test(text)) return true
  return /설치/.test(text) && INSTALL_HW_CONTEXT_RE.test(text) && INSTALL_INTENT_RE.test(text)
}

// 핵심 기능 yes/no — 문서에 명확히 있는 기능만. 약한 영역(결제/정산/학부모 자동 알림/고급 리포트)·AI 채점은 제외해 과장하지 않는다.
const CORE_FEATURE_RE = /녹화|다시\s*보기|출결|출석|숙제|과제|복습|시험|퀴즈|화면\s*공유|미러링|판서/i
const FEATURE_YESNO_RE = /되나요|되나|돼요|돼나요|되니|되는지|가능(해|한가요|할까요|해요|함|한지)?|있나요|있어요|있는지|지원(\s*(해|하나요|되나요|됨|함))?/i
const FEATURE_WEAK_AREA_RE = /결제|수납|정산|환불|학부모\s*(알림|문자|푸시|메시지)|자동\s*(수납|정산|알림)|고급\s*리포트|성적\s*분석|ai\s*(채점|출제)/i
function isCoreFeatureYesNoQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (FEATURE_WEAK_AREA_RE.test(text)) return false
  if (HARDWARE_TROUBLE_RE.test(text) || isLiveClassTroubleQuestion(question)) return false
  if (isComparisonQuestion(question)) return false
  return CORE_FEATURE_RE.test(text) && FEATURE_YESNO_RE.test(text)
}

function isApiSource(source: Pick<ChatbotSource, "title" | "heading" | "excerpt" | "category">) {
  const text = `${source.title} ${source.heading ?? ""} ${source.excerpt} ${source.category}`.toLowerCase()
  return /api|sdk|데이터\s*활용|api\s*도킹|연동\s*범위|crm|학사관리/.test(text)
}

function buildPositioningSource(question: NormalizedQuestion): ChatbotSource | null {
  if (!isPositioningQuestion(question)) return null
  const text = question.redacted.toLowerCase()
  const isEdbQuestion = EDB_QUERY_RE.test(text) || /칠판\s*파일|교안/.test(text)
  const isApiQuestion = isApiIntegrationQuestion(question)
  const isIdentity = isIdentityQuestion(question) && !isComparisonQuestion(question)
  const heading = isEdbQuestion
    ? "EDB와 교안 표준화"
    : isApiQuestion
      ? "API와 정직한 연동 범위"
      : isIdentity
        ? "Classin 한 줄 소개"
        : "핵심 포지셔닝"
  const excerpt = isEdbQuestion
    ? CLASSIN_POSITIONING.edbSummary
    : isApiQuestion
      ? `${CLASSIN_POSITIONING.honestLimit} ${CLASSIN_POSITIONING.apiStages.join(" ")}`
      : isIdentity
        ? `${CLASSIN_POSITIONING.oneLine} ${CLASSIN_POSITIONING.localReality}`
        : CLASSIN_POSITIONING.chatbot.identitySummary

  return {
    title: "Classin을 수업 시스템 OS로 이해하기",
    heading,
    urlPath: "/docs/start/academy-system-os-positioning",
    category: isEdbQuestion ? "classroom" : "onboarding",
    excerpt: compactText(excerpt),
    score: isIdentity ? 270 : 260,
  }
}

function buildStaticDocSource(
  category: DocArticle["category"],
  slug: string,
  heading: string,
  excerpt: string,
  score = 250,
  sourceCategory?: string
): ChatbotSource | null {
  const doc = listDocs().find((candidate) => candidate.category === category && candidate.slug === slug)
  if (!doc) return null

  return {
    title: doc.title,
    heading,
    urlPath: getDocPath(doc),
    category: sourceCategory ?? getSourceCategoryFromDocCategory(doc.category),
    excerpt: compactText(excerpt || doc.chatbotSummary || doc.description),
    score,
  }
}

function getPreAdoptionSourceCategory(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (/요금|가격|비용|견적|결제|정기|단가|유료|환불|계약/.test(text)) return "billing"
  if (/카메라|마이크|ops|외부\s*(pc|컴퓨터|노트북)|오프라인|칠판|판서|보드|펜|소모품/.test(text)) return "hardware"
  if (/녹화|현장\s*녹화|수업\s*녹화|과제|숙제|시험|출결|출석/.test(text)) return "classroom"
  if (/회원\s*가입|가입|도입|교육|온보딩|언제까지|사용\s*기간/.test(text)) return "onboarding"
  return "admin"
}

function buildPreAdoptionSpecificSource(question: NormalizedQuestion): ChatbotSource | null {
  if (!isPreAdoptionSpecificQuestion(question)) return null

  const heading = isPreAdoptionRecordingPermissionQuestion(question)
    ? "녹화 저장과 권한 기준"
    : isPreAdoptionSignupInfoQuestion(question)
      ? "가입과 개인정보"
      : isPreAdoptionOfflineBoardQuestion(question)
        ? "오프라인 칠판 사용"
        : isPreAdoptionHardwareConditionalQuestion(question)
          ? "하드웨어 조건부 확인 항목"
          : "확인 필요한 정책·계약 항목"

  const excerpt = isPreAdoptionRecordingPermissionQuestion(question)
    ? "수업 녹화와 현장 녹화는 목적이 다르며, 녹화 기능과 카메라 구성이 설정된 경우 관리자 또는 권한 받은 계정이 계약·권한 범위 안에서 확인합니다."
    : isPreAdoptionSignupInfoQuestion(question)
      ? "학생·교사 계정은 기관 안내 또는 API 연동 방식에 따라 전화번호 또는 이메일 기반으로 등록·초대할 수 있는지 확인합니다. 개인정보 처리 방식과 보관 기준은 공식 개인정보처리방침과 기관 권한 정책에 맞춰 확인해야 합니다."
      : isPreAdoptionOfflineBoardQuestion(question)
        ? "기본 칠판 필기는 오프라인에서도 사용할 수 있습니다. 다만 클라우드 동기화, 온라인 수업, 녹화 업로드, LMS 배포는 네트워크가 필요합니다."
        : isPreAdoptionHardwareConditionalQuestion(question)
          ? "카메라·마이크·OPS·외부 PC 연결은 기능 가능성과 설치 조건을 분리해 봅니다. T1/S1 카메라, 외부 마이크, HDMI 연결, OPS 포함 여부는 모델·견적·교실 환경 기준으로 확인합니다."
          : "무료/유료 관리자 권한, 유료 전환, 사용 기간, 정기 결제 포함 항목, 콘텐츠 소유권, 개인정보 처리, 서버 위치, 스토리지 용량·단가, 펜 팁 가격은 최신 계약·정책·공급 조건 기준으로 확인해야 합니다."

  return buildStaticDocSource(
    "start",
    "pre-adoption-faq-22-questions",
    heading,
    excerpt,
    330,
    getPreAdoptionSourceCategory(question)
  )
}

function buildCuratedSources(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  const sources: ChatbotSource[] = []
  const positioningSource = buildPositioningSource(question)
  if (positioningSource) sources.push(positioningSource)

  if (isAccountPlanOrTrialLimitQuestion(question)) {
    const source = buildStaticDocSource(
      "admin",
      "billing-upgrade",
      "요금제 한도·체험 범위 확인",
      "현재 요금제의 학생·강사 한도와 체험 계정의 인원·기능 범위는 계정과 계약 조건에 따라 달라 담당자가 확인합니다.",
      320,
      "billing"
    )
    if (source) sources.push(source)
  }

  if (isRefundQuestion(question)) {
    const source = buildStaticDocSource(
      "start",
      "pre-adoption-faq-22-questions",
      "확인 필요한 정책·계약 항목",
      "환불 가능 여부와 절차는 학원 계정의 계약 내용을 보고 담당자가 확인해 안내합니다.",
      310,
      "billing"
    )
    if (source) sources.push(source)
  }

  if (isCourseCreationQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "course-activities",
      "코스 생성과 구성원 관리",
      "교사는 앱에서 코스를 만들고 학습 활동을 추가하며, 관리자는 웹 대시보드에서 코스·수업·교사·학생을 관리합니다.",
      320,
      "classroom"
    )
    if (source) sources.push(source)
  }

  if (isAssignmentQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "course-activities",
      "과제 및 평가 관리",
      "코스에서 [새로 만들기] > [숙제]를 누르고 제목과 본문을 쓴 뒤 파일을 붙여 게시하면 학생들에게 숙제가 나갑니다.",
      320,
      "classroom"
    )
    if (source) sources.push(source)
  }

  if (isPrivacyProcessingQuestion(question)) {
    const source = buildStaticDocSource(
      "start",
      "pre-adoption-faq-22-questions",
      "확인 필요한 정책·계약 항목",
      "ClassIn은 개인정보 보호법령에 따라 개인정보를 철저히 관리하며, 인가받은 관리자 외에는 개인정보 데이터에 임의 접근할 수 없도록 격리 보안을 유지합니다.",
      330,
      "admin"
    )
    if (source) sources.push(source)
  }

  if (isRecordingOptionComparisonQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "lesson-option-concepts",
      "수업 옵션과 녹화 방식",
      "수업 녹화는 온라인 교실 전체를 클라우드에 녹화하는 방식이며, 현장 녹화(1V0)는 교실 내 강사와 판서 화면을 위주로 촬영하는 현장 최적화 녹화 방식입니다.",
      325,
      "classroom"
    )
    if (source) sources.push(source)
  }

  if (isRecordedLessonOptionQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "course-activities",
      "학습 활동 - 수업과 녹화 설정",
      "녹화 수업 생성 시 편집 화면에서 다시보기/시청 제한 옵션을 설정하여 학생들의 동영상 시청 권한과 횟수를 제한할 수 있습니다.",
      320,
      "classroom"
    )
    if (source) sources.push(source)
  }

  if (isDailyAssignmentRepeatQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "course-activities",
      "학습 활동 - 과제 관리",
      "일일 과제나 숙제 생성 시 요일별 반복 게시 옵션을 제공하며, 날짜와 반복 주기를 설정해 게시할 수 있습니다.",
      320,
      "classroom"
    )
    if (source) sources.push(source)
  }

  if (isAdminDashboardMenuMapQuestion(question)) {
    const source = buildStaticDocSource(
      "admin",
      "admin-operation-standardization",
      "대시보드 주요 메뉴 맵",
      "ClassIn 관리자 대시보드 로그인 후 좌측 사이드바에서 [기관 관리] > [코스 관리] 혹은 [LMS 설정]을 통해 라이브&플레이백과 API 도킹 메뉴에 진입할 수 있습니다.",
      320,
      "admin"
    )
    if (source) sources.push(source)
  }

  if (isCompanyIntroQuestion(question)) {
    const source = buildStaticDocSource(
      "start",
      "company-overview",
      "클래스인 회사 개요",
      "ClassIn은 교육 테크놀로지 기업으로서, 글로벌 교육 기관과 파트너십을 맺고 온라인/하이브리드 수업을 위한 올인원 교육 OS 플랫폼을 개발하고 공급합니다.",
      320,
      "onboarding"
    )
    if (source) sources.push(source)
  }

  if (isPreAdoptionCheckQuestion(question)) {
    const source = buildStaticDocSource(
      "start",
      "pre-adoption-faq-22-questions",
      "도입 전 22가지 질문",
      "ClassIn 도입 전에는 관리자 권한, 녹화 저장, 스토리지, 개인정보, 서버, OPS, 오프라인 칠판 사용을 답변 가능 범위와 확인 필요 범위로 나누어 점검합니다.",
      335,
      "onboarding"
    )
    if (source) sources.push(source)
  }

  const preAdoptionSpecificSource = buildPreAdoptionSpecificSource(question)
  if (preAdoptionSpecificSource) sources.push(preAdoptionSpecificSource)

  if (isGoogleClassroomQuestion(question)) {
    const source = buildStaticDocSource(
      "software",
      "app-capabilities-map",
      "LMS와 과제 운영 범위",
      "ClassIn은 코스·수업 생성, 학생 초대, 수업 자료 업로드, 과제·시험, 성적·리포트 같은 LMS 흐름을 지원합니다. 다만 Google Classroom을 완전히 대체할 수 있는지는 현재 운영 방식, 반 수, 학생 수, 필요한 연동과 권한 기준을 놓고 확인해야 합니다.",
      320,
      "classroom"
    )
    if (source) sources.push(source)
  }

  if (isSiteEntryIntegrationQuestion(question)) {
    const source = buildStaticDocSource(
      "admin",
      "admin-operation-standardization",
      "사이트 입장 버튼 연동 확인",
      "자사 사이트의 입장 버튼에서 ClassIn 수업으로 연결하려면 링크, 로그인, 권한, 수업 생성 방식, API 또는 운영 자동화 범위를 분리해 설계해야 합니다. 계약 없이 바로 되는 기본 기능처럼 단정하면 안 됩니다.",
      318,
      "admin"
    )
    if (source) sources.push(source)
  }

  if (isS65QuoteQuestion(question)) {
    const source = buildStaticDocSource(
      "hardware",
      "board-lineup-specs",
      "S65 견적 확인 필요",
      "S65는 라인업에는 있으나 현재 상세 규격서 확인이 필요합니다. 공개 안내는 S75·S86을 표준 모델로 먼저 잡고, S65 견적 가능 여부·재고·사양·가격은 최신 공급 조건으로 확인해야 합니다.",
      325,
      "hardware"
    )
    if (source) sources.push(source)
  }

  if (isBoardOnlyOrPlatformQuestion(question)) {
    const source = buildStaticDocSource(
      "hardware",
      "board-overview",
      "전자칠판 단품과 시스템 구성",
      "Classin Board는 단순 터치 모니터가 아니라 OPS와 ClassIn 소프트웨어, 판서, 녹화, EDB, LMS 흐름을 함께 보는 수업 시스템입니다. 전자칠판 단품 판매나 보드만 구매 가능 여부는 견적·공급 조건으로 확인해야 합니다.",
      322,
      "hardware"
    )
    if (source) sources.push(source)
  }

  if (isCameraConflictQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "lesson-option-concepts",
      "수업 카메라 충돌 점검",
      "같은 수업에서 일부 사용자만 카메라가 켜지지 않으면 계정 역할, 온스테이지 설정, 기기 카메라 권한, 같은 기기 중복 접속 여부, 브라우저·앱 권한을 순서대로 확인합니다.",
      320,
      "troubleshooting"
    )
    if (source) sources.push(source)
  }

  if (isHardwareUnconfirmedDetailQuestion(question)) {
    const source = buildStaticDocSource(
      "hardware",
      "board-lineup-specs",
      "확인 필요한 하드웨어 세부 옵션",
      HARDWARE_UNCONFIRMED_DETAIL_EXCERPT,
      300,
      "hardware"
    )
    if (source) sources.push(source)
  }

  if (isHardwareBoardLineupQuestion(question)) {
    const source = buildStaticDocSource(
      "hardware",
      "board-lineup-specs",
      "Classin Board 모델 선택",
      HARDWARE_BIG_MODEL_RE.test(text) ? HARDWARE_BOARD_LINEUP_EXCERPT : HARDWARE_BOARD_LINEUP_STANDARD_EXCERPT,
      315,
      "hardware"
    )
    if (source) sources.push(source)
  }

  if (isHardwareSpecsQuestion(question)) {
    const source = buildStaticDocSource(
      "hardware",
      "board-lineup-specs",
      "Classin Board 스펙 요약",
      HARDWARE_BIG_MODEL_RE.test(text) ? HARDWARE_SPECS_EXCERPT : HARDWARE_SPECS_STANDARD_EXCERPT,
      310,
      "hardware"
    )
    if (source) sources.push(source)
  }

  if (isHardwareTroubleQuestion(question)) {
    const source = buildStaticDocSource(
      "hardware",
      "board-basic-operation",
      "화면/전원 기본 점검",
      HARDWARE_TROUBLE_EXCERPT,
      305,
      "hardware"
    )
    if (source) sources.push(source)
  }

  if (isLoginTroubleQuestion(question)) {
    const source = buildStaticDocSource(
      "start",
      "password-change-pc",
      "로그인/비밀번호 기본 점검",
      "로그인이 안 될 때는 아이디가 이메일/휴대폰 중 무엇인지 확인하고, PC 로그인 화면 하단의 비밀번호 변경에서 인증코드를 받아 새 비밀번호로 다시 로그인합니다. 인증코드 수신이 어렵다면 공식 채팅으로 인증코드를 요청할 수 있습니다.",
      305,
      "troubleshooting"
    )
    if (source) sources.push(source)
  }

  if (isLiveClassTroubleQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "classroom-basic-setup",
      "수업 중 끊김·소리·마이크 기본 점검",
      "수업 중 화면 공유, 소리, 마이크, 접속이 불안정하면 먼저 앱/브라우저와 기기 권한, 카메라·마이크·스피커 장비 테스트, 네트워크와 수업 입장 시점을 나눠 확인합니다. 반복되면 오류 문구와 기기 정보를 받아 기술지원으로 넘깁니다.",
      310,
      "troubleshooting"
    )
    if (source) sources.push(source)
  }

  if (isWebLiveBillingQuestion(question)) {
    const source = buildStaticDocSource(
      "teacher",
      "lesson-web-live",
      "웹 라이브 요금과 사용 조건",
      "웹 라이브 & 플레이백은 앱 설치 없이 웹 링크로 수업을 생중계하고 플레이백을 제공하는 기능입니다. 사용 가능 요금제와 과금 방식은 구독/충전제 조건에 따라 달라지므로 모든 요금제 기본 제공으로 안내하면 안 됩니다.",
      300,
      "billing"
    )
    if (source) sources.push(source)
  }

  if (isPricingInfoQuestion(question)) {
    const isSoftwarePricing = isSoftwarePricingQuestion(question)
    const source = buildStaticDocSource(
      "start",
      "value-and-cost-framing",
      isSoftwarePricing ? "소프트웨어 요금과 플랜 안내" : "요금·견적 구성 안내",
      isSoftwarePricing
        ? "공식 안내 기준으로 Pro 요금제는 1인 강사용이고, 강사가 두 명 이상인 학원은 비즈니스 요금제를 권합니다. Enterprise는 대형 기관과 전자칠판을 함께 들이는 기관을 위한 맞춤 계약입니다. 정확한 금액과 할인은 강사 수·운영 규모에 따라 견적으로 안내합니다."
        : "클래스인 비용은 고정가표가 아니라 전자칠판+OPS, 카메라·스탠드/벽걸이 구성, 소프트웨어 사용 범위, 설치·온보딩까지 묶어 구성 기준으로 산정합니다. 정확한 금액은 학원 규모와 구성에 따라 달라집니다.",
      295,
      "billing"
    )
    if (source) sources.push(source)
  }

  if (isSoftwarePricingQuestion(question) && !isPricingInfoQuestion(question)) {
    const source = buildStaticDocSource(
      "start",
      "value-and-cost-framing",
      "소프트웨어 요금과 플랜 안내",
      "소프트웨어만 검토할 때는 하드웨어 견적과 분리해 계정 수, 코스 규모, 필요한 기능, 구독형·충전형 조건을 먼저 확인합니다. 정확한 금액과 계약 조건은 견적 상담에서 확정합니다.",
      296,
      "billing"
    )
    if (source) sources.push(source)
  }

  if (isTrialOrPilotQuestion(question)) {
    const source = buildStaticDocSource(
      "start",
      "adoption-journey-90days",
      "체험·파일럿 확인",
      "무료 체험 여부를 단정하기보다 목동 쇼룸, 온라인 데모, 대표 수업 파일럿 범위로 확인합니다. 첫 교실, 대표 강사, EDB 교안, 녹화·복습 루틴을 정하면 30/60/90일 기준으로 도입 판단을 할 수 있습니다.",
      296,
      "onboarding"
    )
    if (source) sources.push(source)
  }

  if (isParentReportOrNotificationQuestion(question)) {
    const source = buildStaticDocSource(
      "software",
      "admin-monitoring-analytics",
      "학부모 리포트·알림 확인",
      "Classin 안에서는 출결, 과제, 성적, 복습, 학습 보고서처럼 학부모 상담에 활용할 데이터를 확인할 수 있습니다. 다만 학부모 자동 문자·푸시·상담 리포트 발송은 기본 제공처럼 단정하지 않고 SMS 알림, API, 외부 학원관리 시스템 연동 범위로 확인합니다.",
      296,
      "admin"
    )
    if (source) sources.push(source)
  }

  if (isInstallFormQuestion(question)) {
    const source = buildStaticDocSource(
      "hardware",
      "board-install-readiness",
      "설치 형태와 현장 점검",
      "Classin Board는 이동형 스탠드와 벽걸이 모두 설치할 수 있고, 교실 이동 필요·공간·벽면 보강·시야 거리에 따라 고릅니다. 전원·네트워크·벽면 상태는 현장 실측에서 먼저 확인합니다.",
      300,
      "hardware"
    )
    if (source) sources.push(source)
  }

  if (isCoreFeatureYesNoQuestion(question)) {
    const source = buildStaticDocSource(
      "software",
      "app-capabilities-map",
      "수업 기능 사용 안내",
      "녹화, 출결, 숙제·과제, 복습, 시험·퀴즈, 화면 공유·미러링, 판서는 클래스인 수업 운영 흐름에 포함되는 기능입니다. 정확한 설정 위치와 범위는 화면 기준으로 안내합니다.",
      295,
      "classroom"
    )
    if (source) sources.push(source)
  }

  if (isReceiptQuestion(question)) {
    const source = buildStaticDocSource(
      "admin",
      "billing-upgrade",
      "영수증과 결제 증빙 확인",
      "세금계산서, 영수증, 결제 증빙은 학원 계정의 결제 상태와 계약 조건에 따라 확인이 필요합니다. 결제 완료 내역과 사업자 정보를 준비한 뒤 담당자에게 증빙 발급 가능 여부를 확인하세요.",
      285,
      "billing"
    )
    if (source) sources.push(source)
  }

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

  const scoringTokens = getScoringTokens(question)

  if (scoringTokens.length === 0) return 0

  for (const token of scoringTokens) {
    if (!scoreToken(token)) matchesAll = false
  }

  for (const token of getExpansionTokens(question)) {
    scoreToken(token, 0.45)
  }

  // Bonus for matching all tokens (AND-match gets high priority)
  if (matchesAll && scoringTokens.length > 1) {
    score += 50
  }

  return score
}

// metadata.symptoms(사용자가 실제로 쓰는 증상 표현)는 getMetadataStrings 로 extras 에 섞여 다른 메타와 같은 가중치만
// 받았다. 증상 문구와 질문이 맞으면 작은 가산점을 더한다 — 증상 하나당 SYMPTOM_MATCH_BOOST, 최대 SYMPTOM_MATCH_MAX 개.
// symptoms 가 없거나 비어 있는 행은 0 이라 기존 점수와 같다. 벡터 검색 경로는 건드리지 않는다.
const SYMPTOM_MATCH_BOOST = 6
const SYMPTOM_MATCH_MAX = 3

// 증상 하나의 낱말(2자 이상) 중 질문 토큰과 맞는 것이 min(2, 낱말 수) 개 이상이면 그 증상이 맞은 것으로 본다.
// 한국어 조사("소리가" ↔ "소리")를 받으려고 앞부분 일치(양방향 startsWith)로 비교한다.
export function scoreSymptomMatches(
  queryTokens: readonly string[],
  metadata: Record<string, unknown> | null | undefined
): number {
  const symptoms = metadata?.symptoms
  if (!Array.isArray(symptoms) || symptoms.length === 0 || queryTokens.length === 0) return 0

  const seen = new Set<string>()
  let matched = 0

  for (const symptom of symptoms) {
    if (typeof symptom !== "string") continue
    const words = tokenize(symptom)
    const key = words.join(" ")
    if (!key || seen.has(key)) continue
    seen.add(key)

    const hits = words.filter((word) =>
      queryTokens.some((token) => token.startsWith(word) || word.startsWith(token))
    ).length
    if (hits >= Math.min(2, words.length)) {
      matched += 1
      if (matched >= SYMPTOM_MATCH_MAX) break
    }
  }

  return matched * SYMPTOM_MATCH_BOOST
}

function scoreDocsChunkKeywords(
  question: NormalizedQuestion,
  source: Omit<ChatbotSource, "score">,
  row: Pick<SupabaseChunkRow, "content" | "metadata">
) {
  const textScore = scoreText(question, source, [row.content, ...getMetadataStrings(row.metadata)])
  return Math.max(1, textScore + scoreSymptomMatches(getScoringTokens(question), row.metadata))
}

export function __scoreDocsChunkKeywordsForTests(
  rawQuestion: string,
  source: Omit<ChatbotSource, "score">,
  row: Pick<SupabaseChunkRow, "content" | "metadata">
) {
  return scoreDocsChunkKeywords(normalizeQuestion(rawQuestion), source, row)
}

function rerankSources(question: NormalizedQuestion, sources: ChatbotSource[]) {
  const suppressApiForComparison =
    isComparisonQuestion(question) && !isApiIntegrationQuestion(question)
  const prioritizePositioning =
    (isComparisonQuestion(question) || isIdentityQuestion(question)) &&
    !isApiIntegrationQuestion(question)
  const expectedCategory = classifyChatbotQuestion(question.redacted).category

  return sources.map((source) => {
    const apiPenalty = suppressApiForComparison && isApiSource(source) ? 140 : 0
    const positioningBonus =
      prioritizePositioning && source.urlPath.includes("/docs/start/academy-system-os-positioning")
        ? 45
        : 0
    const categoryBonus =
      expectedCategory !== "general" && expectedCategory !== "consultation" && source.category === expectedCategory
        ? 18
        : 0
    const categoryPenalty =
      expectedCategory !== "general" &&
      expectedCategory !== "consultation" &&
      source.category !== expectedCategory &&
      source.category !== "guide"
        ? 18
        : 0

    return {
      ...source,
      score:
        source.score +
        Math.min(35, scoreText(question, source) * 0.35) +
        positioningBonus +
        categoryBonus -
        apiPenalty -
        categoryPenalty,
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

// 같은 주제를 다룬 서로 다른 문서(예: 채널톡 동기화본 ↔ 기존 큐레이션본)가 동시에 노출되는 것을
// 막기 위한 정규화 키. 보수적으로 '정확히 일치'할 때만 같은 주제로 본다(서로 다른 주제를 잘못 병합하지 않도록).
function normalizeTopicTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s()（）[\]·,./\-_~&]+/g, "")
    .replace(/작성중|작업중|관리자|가이드/g, "")
    .trim()
}

export function selectDiverseSources(
  sources: ChatbotSource[],
  limit = MAX_SOURCES,
  maxSourcesPerDoc = MAX_SOURCES_PER_DOC
) {
  const seenChunks = new Set<string>()
  const perPath = new Map<string, number>()
  const topicOwner = new Map<string, string>()
  const selected: ChatbotSource[] = []

  for (const source of sources.sort((left, right) => right.score - left.score)) {
    if (source.score <= 0) continue
    const chunkKey = source.chunkId ?? `${source.urlPath}:${source.heading ?? ""}`
    if (seenChunks.has(chunkKey)) continue

    // 주제 중복 제거: 같은 주제를 다른 문서가 이미 선점했으면 건너뛴다. 점수 내림차순 순회라
    // 질의에 더 적합한(유사도 높은) 출처가 그 주제를 차지하고, 중복 사본은 제외된다.
    const topicKey = normalizeTopicTitle(source.title)
    if (topicKey) {
      const owner = topicOwner.get(topicKey)
      if (owner && owner !== source.urlPath) continue
    }

    const pathCount = perPath.get(source.urlPath) ?? 0
    if (pathCount >= maxSourcesPerDoc) continue

    if (topicKey && !topicOwner.has(topicKey)) topicOwner.set(topicKey, source.urlPath)
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

  if (
    (isComparisonQuestion(question) || isIdentityQuestion(question)) &&
    !isApiIntegrationQuestion(question)
  ) {
    return selectDiverseSources(rerankSources(question, curatedSources), 1)
  }

  if (
    isHardwareSpecsQuestion(question) ||
    isHardwareBoardLineupQuestion(question) ||
    isHardwareTroubleQuestion(question) ||
    isHardwareUnconfirmedDetailQuestion(question) ||
    isWebLiveBillingQuestion(question) ||
    isLoginTroubleQuestion(question) ||
    isPricingInfoQuestion(question) ||
    isSoftwarePricingQuestion(question) ||
    isTrialOrPilotQuestion(question) ||
    isInstallFormQuestion(question) ||
    isCoreFeatureYesNoQuestion(question) ||
    isLiveClassTroubleQuestion(question) ||
    isParentReportOrNotificationQuestion(question) ||
    isPreAdoptionSpecificQuestion(question) ||
    isGoogleClassroomQuestion(question) ||
    isSiteEntryIntegrationQuestion(question) ||
    isS65QuoteQuestion(question) ||
    isBoardOnlyOrPlatformQuestion(question) ||
    isCameraConflictQuestion(question) ||
    isRefundQuestion(question) ||
    isReceiptQuestion(question) ||
    isAccountPlanOrTrialLimitQuestion(question) ||
    isCourseCreationQuestion(question) ||
    isAssignmentQuestion(question) ||
    isPrivacyProcessingQuestion(question) ||
    isRecordingOptionComparisonQuestion(question) ||
    isRecordedLessonOptionQuestion(question) ||
    isDailyAssignmentRepeatQuestion(question) ||
    isAdminDashboardMenuMapQuestion(question) ||
    isCompanyIntroQuestion(question)
  ) {
    return selectDiverseSources(rerankSources(question, curatedSources), 1)
  }

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

// 공개 범위 필터는 목차(두 번째 검색, lib/chatbot/doc-outline.ts)와 같은 함수를 쓴다.
function getFallbackDocsFromStatic() {
  return listDocs().filter(isPublicChatbotDoc)
}

async function getFallbackDocs() {
  try {
    const content = await getDocsContent()
    return content.docs.filter(isPublicChatbotDoc)
  } catch {
    return getFallbackDocsFromStatic()
  }
}

// 정적 문서의 요약(sectionIndex=null) 또는 섹션 하나를 출처로 만든다. 점수는 부르는 쪽이 붙인다.
// excerpt 는 220자 요약이고, 모델 근거로는 문장이 온전한 본문을 따로 붙인다(source-grounding.ts).
function buildDocSectionSource(doc: DocArticle, sectionIndex: number | null): Omit<ChatbotSource, "score"> {
  const section = sectionIndex === null ? null : doc.sections[sectionIndex]
  const text = section
    ? [section.body, ...(section.steps ?? [])].join(" ")
    : [doc.description, doc.chatbotSummary].join(" ")
  return attachGroundingText(
    {
      title: doc.title,
      heading: section ? section.heading : DOC_OUTLINE_SUMMARY_HEADING,
      urlPath: getDocPath(doc),
      category: getDocCategory(doc),
      excerpt: compactText(text),
    },
    text
  )
}

// 정적 문서의 요약·섹션을 점수순으로 늘어놓는다(점수 0 제외). 최종 출처와 근거 선별 후보가 이 목록을 함께 쓴다.
function scoreStaticSources(question: NormalizedQuestion, docs: DocArticle[]): ChatbotSource[] {
  const sources = docs.flatMap((doc) => {
    const summarySource = buildDocSectionSource(doc, null)

    const summaryScore = scoreText(question, summarySource, [
      ...doc.tags,
      ...doc.keywords,
      doc.audience,
    ])

    const sectionSources = doc.sections.map((_, sectionIndex) => {
      const source = buildDocSectionSource(doc, sectionIndex)

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

  return sources
    .filter((source) => source.score > 0)
    .sort((left, right) => right.score - left.score)
}

// 근거 선별 후보: 점수순 상위 8개, 문서당 3개까지(최종 출처 2개를 앞에 붙인 뒤 8개로 자른다. 문장은 source-grounding.ts 에서 48개까지).
// 5개·문서당 2개였을 때는 점수가 같은 섹션이 앞을 채우면 답이 든 섹션이 잘렸다(2026-11-18 holdout: "구글 드라이브 연동되나요"에서
// '공유 드라이브 관리 / Google Drive 연동' 섹션이 같은 문서 3번째라 빠졌다). 6개로는 최종 출처가 한 칸을 차지해 여전히 빠진다.
const EVIDENCE_POOL_SIZE = 8
const EVIDENCE_POOL_PER_DOC = 3

function buildEvidencePool(rankedSources: ChatbotSource[]) {
  return selectDiverseSources(rankedSources, EVIDENCE_POOL_SIZE, EVIDENCE_POOL_PER_DOC)
}

async function keywordSearchSupabaseSources(
  question: NormalizedQuestion,
  options?: RetrievalOptions
): Promise<ChatbotSource[]> {
  if (!hasSupabaseServerEnv()) return []

  const likeTokens = getRetrievalTokens(question).map(sanitizeLikeToken).filter(Boolean).slice(0, 10)
  if (likeTokens.length === 0) return []

  const orFilter = likeTokens
    .flatMap((token) => [`content.ilike.%${token}%`, `heading.ilike.%${token}%`])
    .join(",")

  const visibilities = options?.includeInternalDocs
    ? ["public", "unlisted", "internal"]
    : ["public", "unlisted"]

  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from("docs_ai_chunks")
      .select(
        "id, article_id, heading, content, metadata, docs_articles!inner(id, category_id, slug, title, description, canonical_path, status, visibility, noindex)"
      )
      .eq("docs_articles.status", "published")
      .in("docs_articles.visibility", visibilities)
      .or(orFilter)
      .limit(MAX_RETRIEVAL_CANDIDATES * 2)

    if (!options?.includeInternalDocs) {
      query = query.eq("docs_articles.noindex", false)
    }

    const { data, error } = await query

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

        const source: Omit<ChatbotSource, "score"> = attachGroundingText(
          {
            articleId: article.id,
            chunkId: row.id,
            title: article.title,
            heading: row.heading ?? undefined,
            urlPath: article.canonical_path ?? `/docs/${article.category_id}/${article.slug}`,
            category: getSourceCategoryFromDocCategory(article.category_id),
            excerpt: compactText(row.content),
          },
          row.content
        )

        return {
          ...source,
          score: scoreDocsChunkKeywords(question, source, row),
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
// 골든셋 56개 질의 측정(2026-06-18): 정답 문서 top-1 유사도 min 0.675 / median 0.766.
// 0.28 은 노이즈 대역(0.28~0.6)을 자신있는 direct_answer 로 승격시켰다. 0.5 는 그 노이즈를
// 전부 걸러내면서도 골든셋 적중을 0건도 잃지 않는다(최저 정답 0.675 대비 0.175 마진).
const VECTOR_SIMILARITY_FLOOR = 0.5
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

// 내부 전용 문서 범주 — DB 트리거(20260717_docs_articles_internal_lock)가 visibility=internal 을 강제한다.
const INTERNAL_ONLY_DOC_CATEGORIES = new Set(["internal-canon", "cs-knowledge"])

// RPC 는 docs_articles.visibility 를 돌려주지 않는다. 청크 metadata.visibility(내부 적재 경로가 기록)와
// 내부 잠금 범주로 internal 만 판정한다. 공개 문서는 undefined 로 둔다 — 공개 경로 응답(sources) 모양을 바꾸지 않기 위해서다.
// 공개 RPC(include_internal=false)는 internal 행을 돌려주지 않으므로 공개 응답에 이 값이 실릴 일은 없다.
export function resolveMatchChunkVisibility(
  row: Pick<MatchChunkRow, "metadata" | "category_id">
): ChatbotSourceVisibility | undefined {
  if (row.metadata?.visibility === "internal") return "internal"
  if (INTERNAL_ONLY_DOC_CATEGORIES.has(row.category_id)) return "internal"
  return undefined
}

// Gemini 임베딩 기반 시맨틱 검색. 키·임베딩이 없거나 결과가 없으면 [] → 키워드 검색으로 폴백.
async function vectorSearchSupabaseSources(
  question: NormalizedQuestion,
  embedding: number[],
  options?: RetrievalOptions
): Promise<ChatbotSource[]> {
  if (!hasSupabaseServerEnv()) return []

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc("match_docs_ai_chunks", {
      // pgvector 컬럼/인자는 "[..]" 문자열로 넘긴다 (배열 직접 전달 시 Postgres 배열로 직렬화돼 거부됨).
      query_embedding: JSON.stringify(embedding),
      match_count: VECTOR_MATCH_COUNT,
      // 공개 경로는 include_internal 을 아예 넘기지 않는다(RPC 기본 false = 기존과 동일). 내부 코파일럿만 true.
      ...(options?.includeInternalDocs ? { include_internal: true } : {}),
    })

    if (error) {
      console.warn("[chatbot] vector search failed:", error.message)
      return []
    }

    const sources = ((data ?? []) as MatchChunkRow[])
      .filter((row) => row.similarity >= VECTOR_SIMILARITY_FLOOR)
      .map((row) => {
        const visibility = resolveMatchChunkVisibility(row)
        return attachGroundingText(
          {
            articleId: row.article_id,
            chunkId: row.id,
            title: row.title,
            heading: row.heading ?? undefined,
            urlPath: row.canonical_path ?? `/docs/${row.category_id}/${row.slug}`,
            category: getSourceCategoryFromDocCategory(row.category_id),
            excerpt: compactText(row.content),
            score: Math.max(1, row.similarity * 80),
            ...(visibility ? { visibility } : {}),
          },
          row.content
        )
      })
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
// internal 문서(계약 6)는 벡터 RPC(match_docs_ai_chunks include_internal) 경로로만 유입된다.
async function searchSupabaseSources(
  question: NormalizedQuestion,
  options?: RetrievalOptions
): Promise<{ sources: ChatbotSource[]; evidencePool: ChatbotSource[]; vector: RetrievalVectorState }> {
  // 문서 DB 가 설정되지 않았으면 키워드·벡터 검색이 모두 빈 결과라, 질문 임베딩(embedText, 모델 API 호출)을 만들지 않는다.
  // 답은 같다(정적 문서 검색으로 넘어간다). 모델 없는 측정에서 임베딩 호출이 남아 측정이 무효가 되던 것을 없앤다.
  if (!hasSupabaseServerEnv()) return { sources: [], evidencePool: [], vector: "off" }
  const keywordPromise = keywordSearchSupabaseSources(question, options)
  const embedding = await embedText(buildRetrievalQueryText(question), "RETRIEVAL_QUERY")
  const vector: RetrievalVectorState = embedding ? "on" : "off"
  const vectorSources = embedding
    ? await vectorSearchSupabaseSources(question, embedding, options)
    : []
  const keywordSources = await keywordPromise
  const ranked = rerankSources(question, mergeScoredSources([...vectorSources, ...keywordSources]))
  const combined = selectDiverseSources(ranked)

  if (combined.length > 0) return { sources: combined, evidencePool: buildEvidencePool(ranked), vector }

  if (!embedding) return { sources: [], evidencePool: [], vector }

  const clientRanked = rerankSources(question, await clientVectorSearchSupabaseSources(embedding))
  return { sources: selectDiverseSources(clientRanked), evidencePool: buildEvidencePool(clientRanked), vector }
}

// 공개 위젯 방문자는 이미 클래스인 홈페이지에 있다. 낱말 목록(isDomainRelatedQuestion)에 없는 질문이라도
// "웹캠 해상도 얼마나 돼야 하나요", "업데이트 자동으로 되나요", "고객센터 몇시까지 해요"처럼 대부분 클래스인에 대한 질문이라,
// 낱말 목록에 없다는 이유로 검색을 건너뛰면 처음 보는 기본 질문이 모두 되묻기로 나갔다(2026-11 실측 180문항 중 13건).
// 공개 경로에서는 명백한 잡담·서비스 밖 질문만 검색을 건너뛰고, 나머지는 검색하되 강한 근거(직답 점수 이상)가 있을 때만 쓴다.
const OFF_TOPIC_RE =
  /날씨|기온|미세\s*먼지|우산|맛집|메뉴\s*추천|점심|저녁\s*(?:메뉴|뭐)|치킨|피자|떡볶이|배달\s*음식|레시피|요리법|주식|코인|비트코인|환율|로또|운세|사주|별자리|타로|연예인|아이돌|드라마|영화\s*추천|노래\s*추천|게임\s*추천|축구|야구|농구|경기\s*결과|농담|심심|놀아\s*줘|사랑해|애인|연애|여행지|관광지|비행기\s*표|호텔\s*추천/

function isOutsideKnownVocabulary(question: NormalizedQuestion) {
  return classifyChatbotQuestion(question.redacted).category === "general" && !isDomainRelatedQuestion(question, "general")
}

async function searchKnowledgeSources(
  question: NormalizedQuestion,
  options?: RetrievalOptions
): Promise<KnowledgeSearchResult> {
  if (!isOutsideKnownVocabulary(question)) return searchKnowledgeSourcesForDomain(question, options)

  // 내부 CS 코파일럿 경로와 잡담·서비스 밖 질문은 지금처럼 검색하지 않는다.
  const text = question.redacted.toLowerCase()
  if (options?.includeInternalDocs || OFF_TOPIC_RE.test(text) || question.tokens.length < 2) {
    return { sources: [], warning: undefined }
  }
  const result = await searchKnowledgeSourcesForDomain(question, options)
  // 낱말 목록 밖 질문은 약한 문서 조각을 붙이지 않는다. 직답 점수에 못 미치면 출처 없음으로 보고
  // composeAnswer 가 사실 질문이면 못 찾았다고, 모호한 입력이면 되묻게 한다.
  if ((result.sources[0]?.score ?? 0) < MIN_DIRECT_SOURCE_SCORE) {
    return { sources: [], warning: result.warning }
  }
  return result
}

async function searchKnowledgeSourcesForDomain(
  question: NormalizedQuestion,
  options?: RetrievalOptions
): Promise<KnowledgeSearchResult> {
  const expectedVector = expectedRetrievalVectorState()
  const cached = getCachedRetrieval(question, options, expectedVector)
  if (cached) return cached

  if (
    isHardwareSpecsQuestion(question) ||
    isHardwareBoardLineupQuestion(question) ||
    isHardwareTroubleQuestion(question) ||
    isHardwareUnconfirmedDetailQuestion(question) ||
    isWebLiveBillingQuestion(question) ||
    isLoginTroubleQuestion(question) ||
    isPricingInfoQuestion(question) ||
    isSoftwarePricingQuestion(question) ||
    isTrialOrPilotQuestion(question) ||
    isInstallFormQuestion(question) ||
    isCoreFeatureYesNoQuestion(question) ||
    isLiveClassTroubleQuestion(question) ||
    isParentReportOrNotificationQuestion(question) ||
    isPreAdoptionSpecificQuestion(question) ||
    isGoogleClassroomQuestion(question) ||
    isSiteEntryIntegrationQuestion(question) ||
    isS65QuoteQuestion(question) ||
    isBoardOnlyOrPlatformQuestion(question) ||
    isCameraConflictQuestion(question) ||
    ((isComparisonQuestion(question) || isIdentityQuestion(question)) && !isApiIntegrationQuestion(question))
  ) {
    const curatedSources = buildCuratedSources(question)
    if (curatedSources.length > 0) {
      const result = {
        sources: selectDiverseSources(rerankSources(question, curatedSources), 1),
        warning: undefined,
      }
      // 큐레이션 출처는 임베딩을 쓰지 않아, 조회한 키 그대로 둔다.
      setCachedRetrieval(question, result, options, expectedVector)
      return result
    }
  }

  const supabaseResult = await searchSupabaseSources(question, options)
  if (supabaseResult.sources.length > 0) {
    const result = {
      sources: mergeCuratedSources(question, supabaseResult.sources),
      evidencePool: supabaseResult.evidencePool,
      warning: undefined,
    }
    setCachedRetrieval(question, result, options, supabaseResult.vector)
    return result
  }

  const fallbackDocs = await getFallbackDocs()
  const scoredStaticSources = scoreStaticSources(question, fallbackDocs)
  const staticSources = selectDiverseSources(scoredStaticSources)

  const result = {
    sources: mergeCuratedSources(question, staticSources),
    evidencePool: buildEvidencePool(scoredStaticSources),
    warning: hasSupabaseServerEnv()
      ? "Supabase 문서 chunk 검색 결과가 없어 문서 원문 fallback을 사용했습니다."
      : "Supabase 환경변수가 없어 정적 문서 fallback을 사용했습니다.",
  }
  setCachedRetrieval(question, result, options, supabaseResult.vector)
  return result
}

// 검색이 시간 안에 끝나지 않았을 때의 정적 문서 대체 결과. 캐시하지 않는다(지연이 지나간 뒤에도 같은 첫 질문에 약한 근거가
// 5분 동안 나가지 않게, 2026-11-20 조사 G16). 늦게 끝난 본 검색은 자기 결과를 캐시한다.
function getTimedOutKnowledgeFallback(question: NormalizedQuestion): KnowledgeSearchResult {
  const scoredStaticSources = scoreStaticSources(question, getFallbackDocsFromStatic())
  const staticSources = selectDiverseSources(scoredStaticSources)
  return {
    sources: mergeCuratedSources(question, staticSources),
    evidencePool: buildEvidencePool(scoredStaticSources),
    warning: "문서 검색 응답이 지연되어 정적 문서 fallback을 사용했습니다.",
  }
}

function searchKnowledgeSourcesWithinBudget(
  question: NormalizedQuestion,
  options?: RetrievalOptions
) {
  return withTimeoutFallback({
    promise: searchKnowledgeSources(question, options),
    timeoutMs: getKnowledgeSearchTimeoutMs(),
    fallback: () => {
      const fallback = getTimedOutKnowledgeFallback(question)
      // 낱말 목록 밖 질문은 검색 본 경로와 같이 강한 근거만 쓴다(잡담·서비스 밖 질문은 출처 없음).
      if (!isOutsideKnownVocabulary(question)) return fallback
      const usable =
        !options?.includeInternalDocs &&
        !OFF_TOPIC_RE.test(question.redacted.toLowerCase()) &&
        (fallback.sources[0]?.score ?? 0) >= MIN_DIRECT_SOURCE_SCORE
      return usable ? fallback : { sources: [], warning: fallback.warning }
    },
    onTimeout: () => {
      console.warn("[chatbot] knowledge search timed out; using static fallback.")
    },
  })
}

function buildSuggestedQuestions(category: string) {
  const categorySuggestions: Record<string, string[]> = {
    billing: [
      "요금/견적은 어떤 항목으로 구성되나요?",
      "전자칠판 포함 패키지 범위를 알고 싶어요",
      "세금계산서나 영수증 발급이 궁금해요",
    ],
    hardware: [
      "75/86인치 중 어떤 모델이 맞나요?",
      "스탠드형과 벽걸이 설치 차이를 알고 싶어요",
      "전자칠판 설치 전 체크할 것을 알려주세요",
    ],
    troubleshooting: [
      "로그인/비밀번호 문제를 해결하고 싶어요",
      "수업 중 끊김 상황을 정리하고 싶어요",
      "전자칠판 화면이 안 나올 때 점검 순서를 알려주세요",
    ],
    onboarding: [
      "우리 학원 90일 도입 순서를 잡고 싶어요",
      "도입 전 확인해야 할 질문을 알려주세요",
      "Zoom/전자칠판과 차이를 더 알고 싶어요",
    ],
    admin: [
      "관리자 대시보드에서 볼 수 있는 데이터를 알려주세요",
      "API/CRM 연동은 어디까지 가능한가요?",
      "녹화 저장/스토리지 관리를 알고 싶어요",
    ],
    classroom: [
      "수업 녹화와 복습 흐름을 알고 싶어요",
      "과제/시험 운영 방법이 궁금해요",
      "EDB 교안 재사용 방법을 알려주세요",
    ],
    general: [
      "Classin이 어떤 서비스인지 알려주세요",
      "도입 전 확인 질문을 알려주세요",
      "전자칠판 패키지를 보고 싶어요",
    ],
  }
  return Array.from(
    new Set([
      ...(categorySuggestions[category] ?? []),
      "담당자 상담으로 이어주세요",
    ])
  ).slice(0, 3)
}

// 상담 채널 자체에 대한 사실 질문. "상담받는 데 돈 드나요", "원격 지원은 비용 따로 받나요", "전화 상담 번호가 어떻게 되나요",
// "도입 상담 전화로도 받나요", "개인정보 보호책임자 지정돼 있어요?"는 사람을 불러 달라는 말이 아니라 비용·연락 수단·운영 시간·
// 담당 책임자를 묻는 말이다. 즉시 상담 연결로 보내면 묻는 사실에는 답하지 않고 "네, 연결해 드릴게요"만 나간다.
// 연결해 달라는 말(연결·바꿔·불러·주세요·원해·하고 싶어)이 함께 있으면 지금처럼 상담 연결이 맡는다.
const CONTACT_CHANNEL_FACT_TOPIC_RE =
  /돈|비용|무료|유료|요금|공짜|과금|따로\s*(?:받|내|들)|개인정보\s*(?:보호\s*)?책임자|번호(?:가|는)?\s*(?:어떻게|뭐|몇|있)|몇\s*시|운영\s*시간|상담\s*시간|언제까지|주말|평일|(?:전화|카톡|카카오톡?|이메일|메일|채팅)(?:로|으로)?도?\s*(?:받|되|돼|가능|할\s*수|하나|있)/
const CONTACT_CHANNEL_FACT_ASK_RE =
  /[?？]|(?:나요|가요|까요|어요|에요|예요|돼요|되요|되나|드나요|드나|있나|인가|는지|궁금|뭐예요|뭐에요|어디)\s*[.!~]*$/
const HANDOFF_REQUEST_WORD_RE =
  /연결|이어\s*(?:줘|주|주세요|주시)|바꿔|불러|주세요|해\s*줘|원해|원함|원하|하고\s*싶|받고\s*싶|싶어|부탁|할래|급해|급합|연락\s*(?:주|줘)|화나|짜증|답답|몇\s*번째|계속|또\s/

// 사람(담당자·상담원)과 연락 수단(전화·통화·채팅·연락)을 함께 말하면 그 사람에게 닿고 싶다는 말이다("담당자 전화 가능해요?").
const CONTACT_PERSON_CHANNEL_RE = /(?:담당자|매니저|상담원|상담사|직원).{0,12}(?:전화|통화|채팅|연락)|(?:전화|통화|채팅|연락).{0,12}(?:담당자|매니저|상담원|상담사|직원)/

function isContactChannelFactQuestion(text: string) {
  if (CONTACT_PERSON_CHANNEL_RE.test(text)) return false
  return (
    CONTACT_CHANNEL_FACT_TOPIC_RE.test(text) &&
    CONTACT_CHANNEL_FACT_ASK_RE.test(text) &&
    !HANDOFF_REQUEST_WORD_RE.test(text)
  )
}

function wantsImmediateHumanHandoff(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  const explicitHandoff =
    /상담\s*(?:받|받고|하고|하고\s*싶|할래|신청|연결|이어|부탁|필요|문의|원해|원함)|상담받|상담할래|상담하고\s*싶|상담\s*(?:원|사)|담당자.{0,10}(?:상담|연결|연락|통화|배정|문의)|매니저.{0,10}(?:상담|연결|연락|통화|문의)|상담원.{0,10}(?:상담|연결|연락|통화|문의)|(?:상담|연결|연락|통화|문의).{0,10}(?:담당자|매니저|상담원)|전담\s*매니저|연락\s*(?:주세요|받고|하고|원해|원함|가능)|전화\s*(?:주세요|받고|하고|원해|원함|가능)|통화\s*(?:하고|원해|원함|가능)|미팅\s*(?:잡|하고|원해|원함)|데모\s*(?:신청|보고|받|연결|원해|원함|요청)|데모.{0,10}신청|시연.{0,10}신청|시연\s*(?:신청|보고|연결|원해|원함)|쇼룸\s*(?:방문|데모|신청|예약|연결|체험|보|보러)|채널톡\s*(?:연결|상담|문의)|구매\s*상담|도입\s*(?:상담|문의|검토)|사람\s*(?:이랑|하고|한테|과)\s*(?:연결|통화|이야기|얘기|대화|상담)|사람\s*(?:연결|이랑\s*얘기)|(?:진짜|실제|살아\s*있는)\s*사람|사람\s*(?:바꿔|불러|연결)|직원\s*(?:연결|분|이랑|하고)|상담사\s*(?:연결|분|님)|상담원\s*(?:분|님|이랑|하고)|챗봇\s*말고|봇\s*말고|책임자|윗사람|상급자|대표\s*(?:바꿔|연결|나와|불러)|보상\s*(?:어떻게|해\s*주|받|요구|안\s*해)|통화\s*(?:할\s*수|할수|가능|되|돼)|전화\s*(?:로\s*(?:상담|설명|도와|해결)|상담|해\s*주실|해줄)|원격\s*(?:지원|제어|상담|으로)|화면\s*(?:을\s*)?(?:보면서|같이\s*보)|담당자\s*(?:번호|연락처|전화번호)|(?:번호|연락처)\s*(?:좀\s*)?(?:줘|주세요|알려)|(?:누구|사람|담당자)(?:랑|와|하고)\s*직접\s*(?:얘기|이야기|통화|상담)|사람이\s*답하는|사람(?:은|이)\s*(?:아예\s*)?(?:없|있)/.test(text)
  const contextualInquiry =
    /문의/.test(text) && /담당자|매니저|상담원|채널톡|쇼룸|연락|전화|통화|구매|도입|시연|데모/.test(text)

  if ((explicitHandoff || contextualInquiry) && isContactChannelFactQuestion(text)) return false
  if (explicitHandoff || contextualInquiry) return true

  if (isHardwareSpecsQuestion(question)) return false
  if (isHardwareBoardLineupQuestion(question)) return false

  return false
}

const EXPLICIT_HUMAN_CONNECTION_RE =
  /(?:사람|상담원|상담사|직원|담당자|매니저).{0,12}(?:연결|바꿔|불러|통화|이어\s*(?:줘|주세요|주시)|대화하고|얘기하고)|챗봇\s*말고|봇\s*말고|사람\s*(?:이랑|하고|한테|과)\s*(?:이야기|얘기|대화|상담)/

function wantsHumanConsultation(question: NormalizedQuestion) {
  if (wantsImmediateHumanHandoff(question)) return true
  if (isRefundQuestion(question)) return true
  if (isAccountPlanOrTrialLimitQuestion(question)) return true

  const text = question.redacted.toLowerCase()
  // "도입 상담 전화로도 받나요"처럼 상담 채널에 대한 사실 질문은 상담 요청이 아니다.
  if (isContactChannelFactQuestion(text)) return false
  return /견적|데모|시연|미팅|제안|구매|도입\s*검토|도입\s*상담/.test(text)
}

function buildImmediateHandoffResponse(
  category: string,
  handoffIntent: HandoffIntent,
  text = ""
): Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> {
  const isSupport = handoffIntent === "support"
  return {
    answer: [
      isSupport
        ? "네, 담당자 상담으로 바로 연결해 드릴게요. 아래 [실시간 상담 연결]을 누르시면 상담원이 지금까지의 대화를 보고 이어서 도와드립니다."
        : "네, 담당자 상담으로 이어 드릴게요. 아래 [도입 상담 남기기]로 연락받을 방법을 남기시면 담당자가 연락드립니다.",
      /보상|배상|환불/.test(text)
        ? "보상이나 환불은 제가 채팅에서 약속드릴 수 없어요. 담당자가 이번 상황을 확인한 뒤 직접 안내드립니다."
        : null,
      // 원격으로 도와주는지 묻는 말: 공개 안내(PC 설치 문서)가 말하는 원격 설치 도움까지만 말하고, 그 밖의 범위는 상담원에게 넘긴다.
      /(?:원격|화면\s*(?:을\s*)?(?:보면서|같이)).{0,16}(?:도와|도움|해\s*주|해\s*줄|해줘|지원|설치|설정|되나|돼)/.test(text) &&
      !/문자|받았|학생|듣는|수업/.test(text)
        ? `${/죄송|잘\s*못하|서툴|모르겠/.test(text) ? "설명이 서툴러도 괜찮아요. " : ""}PC에 클래스인 설치가 어려우면 상담 채널에 원격 설치 도움을 요청하실 수 있어요. 설치 외의 설정을 어디까지 원격으로 도와드리는지는 상담원이 상황을 보고 안내해 드려요. 원격 지원 프로그램은 상담 채널이 보낸 링크로만 설치해 주세요.`
        : /통화\s*(?:할\s*수|할수|가능|하고\s*싶|원해|부탁)|전화\s*(?:로\s*해결|로\s*(?:상담|설명)|상담|해\s*주)|원격|화면\s*(?:을\s*)?(?:보면서|같이)/.test(text)
          ? `${/죄송|잘\s*못하|서툴|모르겠/.test(text) ? "설명이 서툴러도 괜찮아요. " : ""}전화나 화면을 함께 보는 원격 지원이 되는지는 상담원이 상황을 보고 안내해 드려요.`
          : null,
      /번호|연락처/.test(text)
        ? "담당자 개인 연락처는 채팅에서 드릴 수 없어요. 대신 아래 버튼으로 연결하시면 상담원이 물어보실 내용을 한 번에 받아 이어서 도와드려요. 물어볼 내용을 목록으로 적어 두시면 더 빨라요."
        : null,
      /(?:챗봇|봇).{0,20}(?:같은|똑같|매번|왜\s*만들)|사람이\s*답하는|사람(?:은|이)\s*(?:아예\s*)?없/.test(text)
        ? "같은 답만 되풀이해 답답하셨을 텐데 죄송해요. 사람이 직접 답하는 상담도 있어요."
        : null,
      /(?:조건|내용|금액).{0,20}(?:다르|달라)/.test(text)
        ? "어느 조건이 맞는지는 제가 단정할 수 없어요. 통화로 들으신 조건과 메일 내용 중 다른 부분을 정리해 남겨 주시면 담당자가 확인해 드립니다."
        : null,
      /학원을?\s*옮|그만\s*(?:쓰|다니)|직접\s*(?:얘기|이야기)/.test(text) && !/(?:챗봇|봇)/.test(text)
        ? "계속 문제가 생겨 지치셨을 것 같아요. 상담원과 남은 문제를 하나씩 같이 풀어 보시면 좋겠어요."
        : null,
      /몇\s*시(?:까지|부터)?|운영\s*시간|상담\s*시간|언제까지|주말/.test(text)
        ? "상담 운영 시간은 공개 안내에 정리돼 있지 않아 단정하지 않을게요. 연결되면 상담원이 바로 안내해 드립니다."
        : null,
      isSupport
        ? "기다리시는 동안 문제가 생긴 화면, 쓰는 기기, 생긴 시각을 정리해 두시면 더 빨리 확인합니다. 비밀번호는 보내지 않으셔도 돼요."
        : "데모와 쇼룸 방문은 홈페이지 문의 페이지(/contact)나 쇼룸 예약(/showroom)에서도 바로 신청할 수 있어요. 여러 분이 함께 보실 예정이면 신청할 때 인원을 적어 주세요.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    answerMode: "handoff",
    confidence: 0.72,
    needsHandoff: true,
    sources: [],
    suggestedQuestions: buildSuggestedQuestions(category),
    unresolved: true,
  }
}

// 첫 방문자가 쓰는 낱말. 제품 용어(수업·녹화·전자칠판)를 모르는 방문자는 "맥북에도 깔리나요?", "본사가 어디예요?",
// "인터넷 속도 얼마나 필요해요?"처럼 묻는데, 이런 질문이 '클래스인과 무관'으로 분류돼 문서 검색도 모델 답변도
// 건너뛰고 되묻기만 나갔다. 회사·기기·설치·비용·사례·한도를 묻는 낱말을 클래스인 질문으로 본다.
const FIRST_CONTACT_VOCAB_RE =
  /회사|기업|본사|법인|지사|대표|사장|ceo|창업|설립|나라|국적|제품|서비스|서버|저장|보관|영상|맥북|macbook|macos|\bmac\b|맥\s*(?:지원|용|에서|으로|os)|윈도우|windows|아이패드|ipad|아이폰|iphone|갤럭시|안드로이드|android|\bios\b|태블릿|노트북|컴퓨터|\bpc\b|스마트폰|휴대폰|핸드폰|크롬|브라우저|웹으로|설치|다운로드|깔리|깔아|인터넷|와이파이|wi-?fi|무료|유료|원가|마진|할인|도매|공급가|납품|기능|사례|후기|레퍼런스|인원|몇\s*명|최대|제한|용량|zoom|(?<![가-힣])줌|구글\s*미트|google\s*meet|팀즈|teams|웨일|비교|차이|공부방|과외|교습소|학교|대학|초등|중등|고등|성인|암호화|프로젝터|스마트\s*tv|\btv\b|티비|모니터|속도|사양|스펙/

function isDomainRelatedQuestion(question: NormalizedQuestion, category: string) {
  if (category !== "general") return true

  const text = question.redacted.toLowerCase()
  if (FIRST_CONTACT_VOCAB_RE.test(text)) return true
  return /classin|클래스인|학원|수업|교실|학생|교사|강사|원장|전자칠판|칠판|하드웨어|보드|board|모델|사이즈|크기|인치|라인업|ops|카메라|마이크|미러링|edb|이\s*디\s*비|lms|녹화|복습|과제|운영|도입|관리자|온라인|화상|교안|토론|플립러닝|하이브리드|소프트웨어|프로그램|앱|플랜|구독형|충전형|체험|파일럿|학부모|리포트|보고서|문자|알림|개인정보|보안|데이터|계정|로그인|비밀번호/.test(text)
}

function isSensitiveOrAccountSpecificQuestion(question: NormalizedQuestion, category: string) {
  const text = question.redacted.toLowerCase()
  if (category === "billing" || category === "troubleshooting" || category === "consultation") {
    return true
  }

  return /가격|요금|견적|계약|환불|취소|결제|영수증|세금|계산서|청구|구독|개인정보|보안|법적|저작권|\bas\b|a\/s|수리|고장|파손|장애|오류|에러|안됨|안\s*돼|안\s*켜|꺼져|끊김|로그인|계정|비밀번호|접속|권한|설치\s*(가능|불가|조건|일정|시간)|벽걸이|스탠드|전원|접지|연기|냄새|액체|누수|분해|감전|화재|무게|중량|소비\s*전력|정확한\s*사양|재고/.test(text)
}

function shouldUseInferredAnswerFallback(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  category: string
) {
  const topScore = response.sources[0]?.score ?? 0
  const hasNoUsableSource =
    response.sources.length === 0 ||
    (response.answerMode === "doc_suggestion" && topScore < MIN_DIRECT_SOURCE_SCORE)

  if (!hasNoUsableSource) return false
  if (
    response.answerMode !== "fallback" &&
    response.answerMode !== "clarifying_question" &&
    response.answerMode !== "doc_suggestion"
  ) {
    return false
  }
  if (wantsHumanConsultation(question)) return false
  if (isSensitiveOrAccountSpecificQuestion(question, category)) return false
  if (question.tokens.length < 2) return false
  return isDomainRelatedQuestion(question, category)
}

function getStepCriteriaByCategory(category: string) {
  switch (category) {
    case "billing":
      return {
        steps: [
          "결제 수단, 사업자 정보, 필요한 증빙 종류를 먼저 확인해 주세요.",
          "견적·세금계산서·환불처럼 계정별 확인이 필요한 항목은 담당자 확인이 필요합니다.",
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
          "반복 오류나 수업 영향이 있으면 담당자가 로그와 계정 상태를 함께 확인해야 합니다.",
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

function trimExcerptToSentence(excerpt: string) {
  const withoutEllipsis = excerpt.replace(/\s*(?:\.\.\.|…)\s*$/, "").trim()
  if (withoutEllipsis === excerpt.trim()) return withoutEllipsis
  const sentences = withoutEllipsis.match(/[^.!?。]*[.!?。]/g)
  return sentences && sentences.length > 0 ? sentences.join("").trim() : withoutEllipsis
}

// getStepCriteriaByCategory가 범주별 단계를 따로 갖고 있는 범주. 나머지는 일반 되묻기를 쓴다.
const STEP_CRITERIA_CATEGORIES = new Set(["troubleshooting", "billing", "hardware", "onboarding", "admin", "classroom"])

// 일반 되묻기(buildGeneralClarify)의 첫 문장. 분류와 무관하다.
export const GENERAL_CLARIFY_LEADS = [
  "말씀하신 '그거'가 무엇인지 한 가지만 알려 주시면 바로 도와드릴게요.",
  "어떤 상황인지 한 가지만 더 알려 주시면 바로 도와드릴게요.",
] as const

// 짧거나 대상이 모호한 질문("그거 받았는데 안 열림")에 되물을 말. 묻는 사람(학생·학부모 / 학원)에 맞는 예를 든다.
function buildGeneralClarify(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  // 긴 질문 속 '이거'는 대개 앞에서 이미 말한 것을 가리키므로 '그거가 뭐냐'고 되묻지 않는다.
  const vagueRef = /그거|그게|그걸|그것|이거|저거|그\s*(?:파일|링크|앱)/.test(text) && text.replace(/\s+/g, "").length <= 40
  const lead = vagueRef ? GENERAL_CLARIFY_LEADS[0] : GENERAL_CLARIFY_LEADS[1]
  const example = LEARNER_VOICE_RE.test(text) || /학생|애들|친구|수업\s*듣|쌤/.test(text)
    ? "예를 들면 수업 들어가기, 다시보기, 숙제 내기, 앱 설치·로그인, 선생님이 보낸 파일 열기 가운데 어느 쪽인가요?"
    : /샘들|선생님들|강사|원장|학원|관리자|직원|실장|경리|세무|정산|마감/.test(text)
      ? "예를 들면 강사·학생 등록, 수업·녹화 설정, 저장 공간, 결제·요금, 전자칠판 가운데 어느 쪽인가요?"
      : "예를 들면 수업 입장·소리·화면 같은 사용 문제, 녹화·숙제 같은 기능, 결제·요금, 도입 상담 가운데 어느 쪽인가요?"
  return [lead, example]
}

// 학생·학부모 목소리의 질문. 이런 질문에는 영업형 되묻기("설치 장소, 희망 대수", "수업 전·중·후")를 붙이지 않는다.
const LEARNER_VOICE_RE =
  /우리\s*(?:아이|애)|아이가|애가|딸이|아들이|학생인데|저\s*학생|쌤이|선생님이\s*(?:내|저|우리)|엄마가|엄마한테|숙제|과제|시험|다시\s*보기|다보기/

// 질문 성격(증상·사용법·구매)에 맞는 다음 행동. 카테고리별 고정 문구는 구매·도입 질문에만 쓴다
// (터치 문제에 "설치 장소, 희망 대수를 알려주세요"처럼 엉뚱한 되묻기를 붙이지 않는다).
function getContextualNextStep(question: NormalizedQuestion, category: string): string | null {
  const text = question.redacted.toLowerCase()
  // 영업 질문의 끝 질문(규모·교실 수·도입 시기)은 질문 주도 계층(follow-up.ts)이 고른다. 결제 증빙 안내만 남긴다.
  if (/견적|가격|요금|비용|도입|구매|체험|데모|상담/.test(text)) return category === "billing" ? BILLING_NEXT_STEP : null
  if (/안\s*(?:돼|되|됨|됐|나|들|보|켜|떠|와)|안돼|안되|안됨|오류|에러|끊|튕|멈|이상|못\s*(?:하|해|들|보|봐)/.test(text)) {
    return "화면에 뜬 문구와 쓰는 기기(PC·휴대폰·전자칠판)를 알려 주시면 더 정확히 안내드릴게요. 급하면 \"상담원 연결\"이라고 남겨 주세요."
  }
  if (/어떻게|방법|어디|하는\s*법|순서/.test(text)) {
    return "막히는 화면이나 메뉴 이름을 알려 주시면 그 단계부터 더 자세히 안내드릴게요."
  }
  // 범주별 일반 되묻기("오류 화면·브라우저를 알려 주세요", "90일 도입 순서로…")는 질문과 상관없는 군더더기가 되기 쉽다.
  // 끝 질문은 질문 주도 계층이 정하고, 여기서는 결제 증빙 안내만 남긴다.
  return category === "billing" && !LEARNER_VOICE_RE.test(text) ? BILLING_NEXT_STEP : null
}

const BILLING_NEXT_STEP =
  "결제·증빙은 계정마다 조건이 달라 담당자가 확인해요. 상담 채널(홈페이지 하단 채팅)이나 담당 매니저에게 필요한 증빙 종류를 말씀해 주세요."

// 받침이 있으면 '을', 없으면 '를'.
function withObjectParticle(word: string) {
  const last = word.charCodeAt(word.length - 1)
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0
  return `${word}${hasFinal ? "을" : "를"}`
}

const COMPARISON_ATTRIBUTE_RE =
  /음질|화질|소리|화면\s*공유(?:\s*방식)?|공유\s*방식|속도|지연|딜레이|끊김|안정성|보안|해상도|용량|동시\s*접속/

function getComparisonAnswer(question: NormalizedQuestion, top: ChatbotSource) {
  const text = question.redacted.toLowerCase()
  const zoomFocused = /zoom|(?<![가-힣])줌|화상회의/.test(text)
  // 시중 전자칠판(넥소 등) 또는 전자칠판/보드 비교는 하드웨어 차별점을 더 강하게 짚는다.
  // 정책: 경쟁사 브랜드명은 노출하지 않고 타사 사양·우열은 단정하지 않는다.
  const boardFocused =
    !zoomFocused && (COMPETITOR_BOARD_RE.test(text) || /전자칠판|칠판|보드|board/.test(text))

  if (boardFocused) {
    return [
      "네, 좋은 질문이에요. 같은 '전자칠판'처럼 보여도 Classin Board는 화면·판서에서 끝나지 않고 수업 운영 흐름 전체로 이어지는 게 가장 큰 차이예요.",
      "일반 전자칠판이 화면 출력과 판서 중심이라면, Classin Board는 이렇게 달라요.\n- 윈도우 OPS 내장이라 외부 PC·노트북 없이 보드 하나로 수업을 구동해요\n- EDB 칠판 파일로 판서·이미지·자료를 최대 50페이지까지 저장하고 다음 수업에 그대로 재사용해요\n- 녹화·복습·LMS·관리자 데이터까지 한 흐름으로 이어져요",
      "어떤 점이 제일 궁금하신지 알려주시면 그 기준으로 더 좁혀 비교해드릴게요.",
    ].join("\n\n")
  }

  // "줌보다 음질 좋아요?", "줌이랑 화면공유 방식 같아요?"처럼 특정 속성을 견주는 질문. 타사와의 우열·동일 여부는
  // 단정하지 않는다는 점을 먼저 밝히고, "네, 좋은 질문이에요"로 시작해 긍정처럼 읽히지 않게 한다.
  const attribute = zoomFocused ? COMPARISON_ATTRIBUTE_RE.exec(text)?.[0] : undefined
  return [
    attribute
      ? `Zoom과 ${withObjectParticle(attribute.replace(/\s+/g, " "))} 같은 조건에서 견준 공개 자료는 없어서, 어느 쪽이 낫다거나 같다고 말씀드리지 않을게요. 대신 Classin이 Zoom과 다른 점은 '수업 운영 흐름' 전체에 초점이 있다는 거예요.`
      : "네, 좋은 질문이에요. Classin은 Zoom이나 일반 전자칠판과 달리 '수업 운영 흐름' 전체에 초점이 있어요.",
    "Zoom이 회의 중심이라면 Classin은 판서·녹화·복습·LMS를 하나로 연결하고,\n일반 전자칠판이 화면·판서에 머무는 것과 달리 EDB 교안과 관리자 데이터까지 이어줘요.",
    /할인|깎|네고/.test(text)
      ? "할인은 채팅에서 약속드리지 않고, 교실 수와 구성(전자칠판 대수·설치 형태·소프트웨어)을 보고 견적에서 안내드려요. 문의 페이지(/contact)에서 견적을 요청해 주세요."
      : null,
    PRICING_INFO_RE.test(text) || /비싸|원대|만\s*원/.test(text)
      ? "가격은 Zoom처럼 계정 요금만 놓고 비교하기보다, 녹화·숙제·복습·관리를 따로 쓰던 도구 비용까지 같이 놓고 봐야 정확해요. 금액은 규모에 따라 견적으로 안내드리고, 문의 페이지(/contact)에서 신청하시면 됩니다."
      : null,
    top.heading === "핵심 포지셔닝"
      ? "Zoom, 전자칠판, LMS 중 어떤 기준으로 비교 중이신지 알려주시면 그 부분만 더 좁혀드릴게요."
      : null,
  ].filter(Boolean).join("\n\n")
}

function getIdentityAnswer(question: NormalizedQuestion) {
  const askedCompany = isCompanyIdentityQuestion(question)
  return [
    askedCompany
      ? "클래스인(ClassIn)은 글로벌 에듀테크 기업 EEO가 만든 교육용 수업 플랫폼이고, 한국에서는 이이오클래스인코리아가 학원·교육기관 도입과 운영을 돕고 있어요."
      : null,
    askedCompany
      ? "Classin은 학원 수업을 준비·진행·녹화·복습·과제(LMS)·관리자 데이터까지 한 흐름으로 묶는 수업 운영 솔루션이에요."
      : "네, Classin은 학원 수업을 준비·진행·녹화·복습·과제(LMS)·관리자 데이터까지 한 흐름으로 묶는 수업 운영 솔루션이에요.",
    "쉽게 말해 Zoom처럼 수업만 여는 도구가 아니라, 전자칠판·EDB 교안·녹화·관리자 운영까지 연결해 수업 품질을 표준화하는 시스템에 가까워요.",
    "전자칠판, 온라인 수업, LMS/관리자 중 어떤 쪽이 궁금하신지 알려주시면 그 부분만 콕 짚어 정리해드릴게요.",
  ].filter(Boolean).join("\n\n")
}

function getEdbAnswer() {
  return [
    "EDB, 이디비는 Classin에서 쓰는 칠판 파일이에요.",
    "판서, 이미지, 텍스트를 상호작용 가능한 상태로 저장해 두고 다시 불러올 수 있어서, 선생님이 만든 교안이나 활동 자료를 다음 수업에서도 그대로 재사용할 수 있습니다.",
    "쉽게 말하면 한 번 만든 칠판 수업 자료를 파일처럼 저장하고, 불러오고, 공유하는 구조예요.",
  ].join("\n\n")
}

// "S75랑 S86 기능 차이"처럼 표준 두 모델을 견주는 질문.
const BOARD_MODEL_COMPARE_RE = /(?=.*s\s*75)(?=.*s\s*86)(?=.*(?:차이|비교|다른|다르|뭐가\s*달))/

function getBoardModelCompareAnswer() {
  return [
    "S75와 S86은 화면 크기, 본체 크기·무게, 소비 전력이 달라요. 규격서 기준으로 4K 해상도, 16:9 화면, 60Hz, 명암비 4000:1, 3mm AG/AF 유리, 50점 적외선 터치, 내장 OPS(Windows) 같은 기능 사양은 같습니다.",
    "- S75 — 75인치 · 본체 1,718.18 × 1,000.2 × 113.1mm · 54kg · 315W\n- S86 — 86인치 · 본체 1,964.08 × 1,139.02 × 113.1mm · 69.5kg · 390W",
    "그래서 고르는 기준은 기능보다 교실 크기와 맨 뒷자리까지의 거리예요. 교실 넓이와 학생 수를 알려 주시면 맞는 모델을 같이 좁혀 드리고, 상세 규격서가 필요하시면 상담에서 보내 드릴게요.",
  ].join("\n\n")
}

function getHardwareSpecsAnswer(revealBig: boolean) {
  if (!revealBig) {
    return [
      "네, Classin Board 사양 정리해드릴게요.",
      "표준 모델은 75인치(S75)와 86인치(S86)예요. 공통 기준은 4K · 16:9 · 178도 시야각 · 밝기 350cd/m² 이상 · 50점 적외선 터치 · 내장 OPS(Windows, 16GB 메모리·256GB SSD)입니다.",
      "본체 치수(가로×세로×두께, 규격서 기준)는 이렇게 봐요.\n- S75 — 1,718.18 × 1,000.2mm · 두께 113.1mm · 54kg\n- S86 — 1,964.08 × 1,139.02mm · 두께 113.1mm · 69.5kg",
      "벽걸이 브래킷과 이동형 스탠드 중 무엇이 견적에 들어가는지는 설치 형태에 따라 정해요. 더 큰 공간을 위한 추가 라인업은 교실 크기랑 설치 방식만 알려주시면 상담에서 맞춰 안내해 드릴게요.",
    ].join("\n\n")
  }
  return [
    "네, Classin Board 사양 정리해드릴게요.",
    "공통 기준은 4K · 16:9 · 178도 시야각 · 밝기 350cd/m² 이상 · 50점 적외선 터치 · 내장 OPS(Windows, 16GB 메모리·256GB SSD)예요. 수업은 이 OPS의 윈도우에서 해요.",
    "모델별 핵심 차이예요.",
    "- S75 — 75인치 · 54kg · 315W\n- S86 — 86인치 · 69.5kg · 390W\n- S98 Pro — 98인치 · 89kg · 740W · NFC\n- S110 — 110인치 · 137kg · 850W · 120Hz",
    "교실 크기랑 설치 방식만 알려주시면 어느 모델이 맞을지 같이 좁혀드릴게요. S65는 상세 규격 확인이 필요해요.",
  ].join("\n\n")
}

function getHardwareBoardLineupAnswer(revealBig: boolean) {
  if (!revealBig) {
    return [
      "네, 전자칠판 모델 보고 계시는군요.",
      "Classin Board는 보통 75인치(S75)와 86인치(S86)를 표준으로 가장 많이 선택해요. 일반 강의실은 이 두 모델로 시작하면 충분한 경우가 많습니다.",
      "대형 강의실·강당·설명회처럼 더 큰 공간이라면 추가 라인업도 있으니, 교실 크기랑 설치 방식만 알려주시면 상담에서 딱 맞는 모델로 좁혀드릴게요.",
    ].join("\n\n")
  }
  return [
    "네, 전자칠판 모델 보고 계시는군요.",
    "Classin Board는 S75 · S86 · S98 Pro · S110 네 가지예요.\n일반 강의실은 75·86인치, 대형 강의실·설명회는 98·110인치를 많이 보세요.",
    "교실 크기나 설치 방식만 알려주시면 딱 맞는 모델로 좁혀드릴게요. 사양이나 가격도 바로 정리해드릴까요?",
  ].join("\n\n")
}

function getHardwareTroubleAnswer() {
  return [
    "전자칠판 화면이 안 나오면 먼저 전원 문제인지, 입력 소스 문제인지 나눠서 보면 빨라요.",
    "전원 플러그·멀티탭, 오른쪽 측면 하단 전원 버튼, 대기 모드를 확인하고,\n입력(소스) 메뉴에서 OPS 또는 연결한 HDMI가 선택돼 있는지 보세요. HDMI라면 케이블과 노트북 화면 출력 설정도 함께요.",
    "혹시 연기·냄새·액체 유입·파손이 있으면 바로 전원을 분리하고 A/S로 넘기는 게 안전해요. 계속 안 나오면 모델명·전원 LED 상태·현재 입력 소스를 알려주시면 다음 조치로 좁혀드릴게요.",
  ].join("\n\n")
}

function getHardwareUnconfirmedDetailAnswer() {
  return [
    "아, 그 부분은 지금 공개된 Classin Board 스펙만으로는 색상·마감·보증 기간 같은 세부 옵션을 확정해서 안내하기 어렵습니다.",
    "대신 확정된 기준은 S75 · S86 · S98 Pro · S110의 화면 크기, 4K 해상도, 터치, OPS, 무게, 소비전력 같은 핵심 사양이에요.",
    "세부 옵션은 공급 시점·재고·계약 조건에 따라 달라질 수 있어서, 필요한 옵션명을 알려주시면 확인해야 할 항목만 짧게 정리해드릴게요.",
  ].join("\n\n")
}

function getLoginTroubleAnswer() {
  return [
    "로그인이 안 되시는군요. 먼저 아이디가 이메일인지 휴대폰 번호인지 확인하고, 비밀번호 재설정부터 해보세요.",
    "PC는 로그인 화면 하단 [비밀번호 변경], 모바일은 [비밀번호를 잊으셨나요?]에서\n인증코드를 받아 새 비밀번호로 다시 로그인하시면 돼요.",
    "인증코드가 안 오거나 계정이 기관에 묶여 있다면, 사용 기기·아이디 종류·오류 문구를 알려주시면 다음 조치로 좁혀드릴게요.",
  ].join("\n\n")
}

function getLiveClassTroubleAnswer() {
  return [
    "수업 중 끊김이나 소리·마이크 문제는 먼저 기기 문제인지, 권한 문제인지, 네트워크 문제인지 나눠 보면 빨라요.",
    "1. 사용 중인 앱/브라우저와 기기를 확인하고 최신 상태로 다시 입장해 보세요.\n2. 입장 전 장비 테스트에서 카메라·마이크·스피커 입력/출력 장치를 다시 선택해 주세요.\n3. 같은 시간대 반복 끊김이면 네트워크 상태, 수업 입장 시점, 오류 문구를 함께 기록해 주세요.",
    "반복되면 사용 기기, 앱/브라우저, 오류 화면, 발생 시간을 알려주시면 기술지원 확인 항목으로 바로 좁혀드릴게요.",
  ].join("\n\n")
}

function getWebLiveBillingAnswer() {
  return [
    "웹 라이브는 모든 요금제에서 기본 제공된다고 보기는 어려워요.",
    "구독형은 Enterprise, 충전형은 Business Consumption 조건에서 쓰는 기능으로 안내되고, 실제 적용 여부와 비용은 계약·요금제 기준을 확인해야 해요.",
    "앱 설치 없이 웹 링크로 설명회·강연을 보여주려는 거라면, 먼저 지금 요금제와 라이브+플레이백 필요 여부부터 확인하면 됩니다.",
  ].join("\n\n")
}

// 가격표·요금표·가격 안내 페이지가 어디 있는지 묻는 말. 금액(얼마)을 묻는 말은 아래 구성 기준 답이 맡는다.
const PRICE_TABLE_RE =
  /(?:가격|요금)\s*(?:표|안내\s*페이지|페이지|정리)|(?:가격|요금)\s*(?:은|는|을|를)?\s*어디서\s*(?:봐|보|확인)|요금제\s*(?:가\s*)?정리된/

function getPricingAnswer(question?: NormalizedQuestion) {
  if (question && PRICE_TABLE_RE.test(question.redacted.toLowerCase()) && !/얼마/.test(question.redacted)) {
    return [
      "요금은 요금 안내 페이지(/pricing)에서 소프트웨어 플랜을 살펴보고 체크아웃으로 이어서 확인하실 수 있어요. 채팅에서는 금액을 숫자로 말씀드리지 않아요.",
      "전자칠판·설치까지 포함하면 맞춤 견적으로 안내해요. 견적은 전자칠판(OPS 기본 포함), 카메라·마이크, 스탠드나 벽걸이, 설치, 소프트웨어 라이선스, 온보딩 가운데 필요한 것을 묶어 만들어요.",
      "견적은 문의 페이지(/contact)에 학원명, 이름, 연락처를 남기고 교실 수는 문의 내용에 적어 주시면 상담에서 안내해 드려요.",
    ].join("\n\n")
  }
  return [
    "네, 요금은 고정가표보다 '구성 기준'으로 봐요. 보통 이렇게 묶여요.",
    "- 전자칠판 + OPS(윈도우 컴퓨팅)\n- 카메라·마이크·스탠드/벽걸이 구성\n- 소프트웨어 사용 범위(녹화·LMS 등)\n- 설치·온보딩",
    "소프트웨어만 쓰신다면 1인 강사는 Pro, 강사 두 명 이상은 비즈니스 요금제가 기준이에요(공식 안내 기준). 정확한 금액은 규모에 따라 견적으로 드려요.",
    "견적은 홈페이지 문의 페이지(/contact)에서 교실 수와 원하는 구성을 남겨 주시면 담당자가 안내드려요.",
  ].join("\n\n")
}

function getSoftwarePricingAnswer() {
  return [
    "소프트웨어 요금제는 강사 계정 수와 학원 규모로 고릅니다. 공식 안내 기준으로 Pro는 1인 강사용, 강사가 두 명 이상인 학원은 비즈니스를 권하고, Enterprise는 대형 기관이나 전자칠판을 함께 들이는 기관을 위한 맞춤 계약이에요.",
    "월 금액과 할인은 강사 수와 운영 규모에 따라 달라 정확한 금액은 단정하지 않고 견적으로 안내드려요. 전자칠판을 함께 들이면 장비·설치까지 묶어 견적을 냅니다.",
    "견적과 2주 무료 체험은 홈페이지 문의 페이지(/contact)에서 신청하시면 담당자가 규모에 맞춰 안내드려요. 신청할 때 전자칠판 대수, 강사·학생 수, 교실 수, 설치 형태(벽걸이·스탠드)를 적어 주시면 견적이 빨라집니다.",
  ].join("\n\n")
}

function getTrialOrPilotAnswer() {
  return [
    "무료 체험 가능 여부를 여기서 단정하기보다는 데모와 파일럿 범위로 확인하는 게 안전합니다.",
    "보통은 목동 쇼룸이나 온라인 데모에서 대표 수업 흐름을 먼저 보고, 첫 교실·대표 강사·EDB 교안·녹화/복습 루틴을 정해 30/60/90일 기준으로 판단합니다.",
    "원하시면 현재 수업 방식 기준으로 데모에서 꼭 볼 장면 3가지를 먼저 정리해드릴게요.",
  ].join("\n\n")
}

function getParentReportOrNotificationAnswer() {
  return [
    "학부모 커뮤니케이션은 'Classin 안에서 확인할 수 있는 데이터'와 '자동 발송'을 나눠 봐야 합니다.",
    "출결, 과제, 성적, 복습 기록, 학습 보고서처럼 상담에 쓸 데이터는 권한 범위 안에서 확인할 수 있어요. 학습 보고서는 링크를 복사해 학부모님께 보낼 수 있어요.",
    "다만 학부모님께 문자·상담 리포트를 자동으로 보내는 건 기본 화면 기능으로 안내돼 있지 않아요. 수업 알림 문자(SMS)는 [일반 설정] > [부가가치 서비스]의 유료 서비스 '스마트 담임 교사'로 학생과 교사에게 자동으로 보낼 수 있으니, 학부모 번호로도 받을 수 있는지는 담당 매니저에게 확인해 보세요. 그 밖의 자동 알림은 공식 API로 클래스인 앱 푸시를 자동화하거나 외부 학원관리 시스템과 연동하는 방식을 상담에서 확인해 보세요.",
  ].join("\n\n")
}

function getInstallFormAnswer() {
  return [
    "네, 설치는 이동형 스탠드와 벽걸이 둘 다 가능해요. 이렇게 고르시면 돼요.",
    "- 교실 간 이동이 필요하면 → 이동형 스탠드\n- 자리가 고정이고 공간을 아끼려면 → 벽걸이(벽면 보강 확인)",
    "전원·네트워크·벽면 상태는 현장 실측에서 먼저 확인해요. 교실 환경만 알려주시면 맞는 형태로 안내해드릴게요.",
  ].join("\n\n")
}

function getPreAdoptionOverviewAnswer() {
  return [
    "ClassIn 도입 전 22가지 질문은 기능표라기보다 리스크 점검표로 보는 게 좋습니다.",
    "바로 답할 수 있는 항목은 웹 기반 관리자 콘솔, 리포트, 온보딩, 녹화 관리 권한, 과제, 전화번호 또는 이메일 가입, OPS 구성, 오프라인 칠판 필기예요.",
    "무료/유료 권한, 계약 기간, 정기 결제 포함 항목, 스토리지 용량·단가, 콘텐츠 소유권, 개인정보 처리, 서버 위치, 펜 팁 가격은 최신 계약·정책 확인 항목으로 분리해 상담에서 확인하는 게 안전합니다.",
  ].join("\n\n")
}

// 녹화본을 누가 볼 수 있는지(열람 권한) 묻는 말. 저장·관리 권한을 묻는 말은 아래 구분 답이 맡는다.
const RECORDING_VIEWER_RE = /누가\s*(?:볼|봐|보|접근|열람)|열람\s*권한|(?:볼|보는)\s*수\s*있는\s*사람/

function getRecordingPermissionAnswer(question?: NormalizedQuestion) {
  if (question && RECORDING_VIEWER_RE.test(question.redacted)) {
    return [
      "녹화본은 앱에서 교사와 학생이 보고, 학원 관리자는 관리자 콘솔에서 열람하거나 내려받아요. 녹화는 유료 결제와 계정 인증을 마친 학원에서, 교사로 등록된 계정만 켤 수 있어요.",
      "누가 다시 볼 수 있는지는 관리자 대시보드 [일반 설정] > [수업 다시보기]에서, 학생이 볼 수 있는 기간은 코스 [설정]의 [다시 보기 유효 기간]에서 학원이 정해요.",
      "구체적으로 어떤 설정인지는 다니는 학원에 먼저 확인해 주세요.",
    ].join("\n\n")
  }
  return [
    "수업 녹화와 현장 녹화는 목적이 달라서 먼저 구분해서 봐야 해요.",
    "수업 녹화는 ClassIn 수업 안의 화면·판서·자료 중심이고, 현장 녹화는 카메라 구성이 설정된 경우 교실 뷰나 트래킹 뷰를 다룹니다.",
    "녹화 여부와 녹화본 보관·다운로드는 학원의 관리자 또는 권한 받은 계정이 관리해요. 수업이 녹화되는지, 누가 녹화본을 볼 수 있는지는 수업을 운영하는 학원에 먼저 확인해 주세요.",
    "학생이 보는 다시보기는 그 코스에 등록된 학생에게 학원이 정한 기간 동안 열립니다. 더 자세한 보관·삭제 기준은 공식 개인정보처리방침과 담당자 확인으로 안내드려요.",
  ].join("\n\n")
}

function getSignupInfoAnswer() {
  return [
    "회원가입은 전화번호 또는 이메일 기반으로 안내할 수 있습니다.",
    "인증 후 비밀번호와 기본 프로필을 설정하고, 기관 안내에 따라 학생·교사 계정을 코스나 수업에 연결합니다.",
    "다만 개인정보 처리 방식, 보관 기준, 접근 권한은 공식 개인정보처리방침과 기관 권한 정책 기준으로 확인해야 합니다. 학생 학습 데이터와 마케팅 추적 데이터도 섞어 설명하지 않는 게 원칙입니다.",
  ].join("\n\n")
}

function getOfflineBoardAnswer() {
  return [
    "네, 기본 칠판 필기는 오프라인 상태에서도 사용할 수 있습니다.",
    "다만 클라우드 동기화, 온라인 수업, 녹화 업로드, LMS 배포, 학생에게 자료를 공유하는 흐름은 네트워크가 필요해요.",
    "데모에서는 OPS 단독 구동, 오프라인 판서, 다시 온라인 연결 후 동기화가 필요한 기능을 나눠 확인하는 게 좋습니다.",
  ].join("\n\n")
}

function getHardwareConditionalPreAdoptionAnswer(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (/카메라/.test(text)) {
    return [
      "카메라 화각·추적·조정은 가능 여부와 현장 조건을 나눠 봐야 합니다.",
      "T1/S1 같은 구성은 교사 추적, 전경, 클로즈업, CMS 설정을 지원하지만 교실 크기, 설치 위치, 네트워크, 모델 구성에 따라 달라집니다.",
      "데모나 실측 때 교사 이동 범위, 맨 뒷자리 시야, 녹화·송출 목적을 같이 확인하면 맞는 카메라 구성을 좁힐 수 있어요.",
    ].join("\n\n")
  }

  if (/마이크/.test(text)) {
    return [
      "마이크는 교실 크기와 하이브리드 수업 여부에 따라 구성이 달라집니다.",
      "보드 내장 마이크로 충분한 교실도 있지만, 대형 교실이나 온라인 송출이 중요한 경우에는 DT2 Pro 같은 외부 마이크 구성을 검토합니다.",
      "수음 범위, 천장 높이, 배경 소음, 스피커 구성은 설치 상담에서 같이 확인하는 게 안전합니다.",
    ].join("\n\n")
  }

  return [
    "OPS 포함 구성에서는 외장 PC 없이 ClassIn 수업 환경을 구동할 수 있습니다.",
    "다만 실제 OPS 포함 여부와 스펙은 모델·견적 기준으로 확인해야 하고, 필요하면 HDMI 등으로 외부 PC나 노트북 연결도 검토할 수 있어요.",
    "교실에서 외장 PC를 꼭 써야 하는 프로그램이 있는지, 보드 단독으로 충분한지 데모에서 나눠 확인하는 게 좋습니다.",
  ].join("\n\n")
}

function getPolicyConfirmationAnswer(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()

  if (isRefundQuestion(question)) {
    return [
      "환불 가능 여부와 절차는 학원 계정의 계약 내용을 보고 담당자가 확인해 안내드려요. 채팅에서 바로 환불 여부나 금액을 약속드릴 수는 없어 죄송합니다.",
      /(?:처리|진행)\s*(?:상태|상황|현황)|지났|아직|언제\s*(?:돼|되|처리|들어)/.test(text)
        ? "이미 요청하신 환불의 처리 상태는 이 채팅에서 조회할 수 없어요. 아래 [실시간 상담 연결]을 누르시면 상담원이 요청 내역을 찾아 진행 상황을 확인해 드립니다."
        : "아래 [실시간 상담 연결]을 누르시면 상담원에게 바로 환불 요청을 접수할 수 있어요. 결제한 학원명과 결제 시기를 함께 말씀해 주시면 더 빨리 확인합니다.",
    ].join("\n\n")
  }

  if (AI_DATA_POLICY_RE.test(text)) {
    return [
      "AI 기능을 켰을 때 수업 음성·영상이 어떻게 처리되는지는 채팅에서 추측으로 말씀드리지 않고, 공식 정책(개인정보처리방침)과 계약 문서로 확인해 드려요.",
      "조항 근거가 필요하시면 상담 채널(홈페이지 하단 채팅)이나 담당 매니저에게 문서로 요청해 주세요. AI 기능은 관리자 대시보드 일반 설정의 [부가가치 서비스]에서 켜고 끌 수 있어요.",
    ].join("\n\n")
  }

  if (/서버|데이터\s*(처리|보관|지역)/.test(text)) {
    return [
      "서버 위치와 데이터 처리 지역은 채팅에서 추측으로 말씀드리지 않고, 공식 정책(개인정보처리방침)과 계약 문서로 확인해 드려요.",
      "교육청 점검처럼 근거 문서가 필요하시면 상담 채널(홈페이지 하단 채팅)이나 담당 매니저에게 '서버 위치, 데이터 처리 지역, 보관·삭제 기준'을 문서로 요청해 주세요. 계약 학원이라면 담당 매니저가 확인 자료를 안내드립니다.",
    ].join("\n\n")
  }

  if (/콘텐츠\s*소유권|소유권|저작권/.test(text)) {
    return [
      "콘텐츠 소유권은 약관·계약 기준으로 확인해야 하는 항목입니다.",
      "학원이 올린 자료와 접근 권한은 기관 단위로 따로 관리되고, 소유권과 서비스 제공을 위한 이용 범위는 최신 약관·계약서로 확인해 드려요.",
      "상담에서는 녹화본, EDB 교안, 업로드 자료, 공유 드라이브 자료를 각각 누가 볼 수 있고 어떻게 보관되는지 함께 확인하세요.",
    ].join("\n\n")
  }

  if (/스토리지|클라우드|저장\s*(용량|공간)|용량|단가|추가/.test(text)) {
    return [
      "스토리지는 사용량 확인과 계약 조건을 나눠 봐야 합니다.",
      "관리자는 권한 범위 안에서 녹화본, 스크린샷, 칠판 파일, 공유 드라이브 등 스토리지 사용량을 확인할 수 있습니다.",
      "기본 제공 용량, 추가 용량 단가, 장기 보관 조건은 계약마다 달라 채팅에서 숫자를 단정하지 않고, 담당자가 최신 계약 기준으로 안내드려요.",
    ].join("\n\n")
  }

  if (/무료|유료|권한|전환/.test(text)) {
    return [
      "관리자 권한은 기능 목록과 과금 정책을 분리해서 봐야 합니다.",
      "관리자 콘솔에는 기관 관리, 스토리지, 학습 관리, 관리자 기능, 결제, 계정 정보 같은 영역이 있지만 무료/유료 권한 차이와 향후 유료 전환 여부는 계약·계정 정책 확인이 필요합니다.",
      "상담에서는 현재 계정 기준으로 누가 어떤 메뉴를 볼 수 있는지, 추가 관리자 계정이 필요한지부터 확인하세요.",
    ].join("\n\n")
  }

  if (/언제까지|사용\s*기간|계약\s*기간/.test(text)) {
    return [
      "사용 기간은 계약 기간, 계정 상태, 스토리지 보관 정책을 나눠 확인해야 합니다.",
      "서비스를 언제까지 쓸 수 있는지와 녹화·자료가 언제까지 보관되는지는 서로 다른 질문일 수 있어요.",
      "상담에서는 계약 만료일, 계정 접근 가능 기간, 녹화본·자료 보관 기간을 각각 확인하는 게 안전합니다.",
    ].join("\n\n")
  }

  if (/정기\s*결제|결제.{0,10}포함|포함\s*항목/.test(text)) {
    return [
      "정기 결제나 견적 포함 항목은 고정 답변보다 구성 기준으로 확인해야 합니다.",
      "보통 전자칠판, OPS, 카메라·마이크, 스탠드/벽걸이, 소프트웨어, 설치, 온보딩 범위를 함께 놓고 봅니다.",
      "정확히 무엇이 포함되는지는 학원 규모, 교실 수, 장비 구성, 계약 조건에 따라 달라져서 상담에서 견적 범위로 확인하는 게 맞습니다.",
    ].join("\n\n")
  }

  if (/펜|소모품|팁/.test(text)) {
    return [
      "전용 펜 팁이나 소모품은 구매 가능 여부, 재고, 가격을 최신 공급 조건으로 확인해야 합니다.",
      "채팅에서 금액을 단정하지 않고, 모델명과 필요한 수량을 알려 주시면 담당자가 구매 경로와 단가를 안내드려요.",
      "파손이 잦다면 여분 보관 위치와 교실별 관리 기준도 함께 정해두세요.",
    ].join("\n\n")
  }

  if (/개인정보/.test(text)) {
    return [
      "개인정보 처리 방식은 공식 개인정보처리방침과 기관 권한 정책 기준으로 확인해야 합니다.",
      "가입에 필요한 전화번호 또는 이메일 같은 정보와, 수업 참여·녹화·학습 데이터 접근 권한은 분리해서 설명해야 해요.",
      "상담에서는 보관 기준, 접근 권한, 삭제 요청 절차, 학원 내부 동의 절차를 함께 확인하세요.",
    ].join("\n\n")
  }

  return [
    "이 내용은 계약과 계정 상태에 따라 달라서 담당자가 확인해 안내드려야 해요.",
    "아래 상담 연결로 남겨 주시면 현재 계정과 계약 기준으로 확인해 드립니다.",
  ].join("\n\n")
}

function getGoogleClassroomAnswer() {
  return [
    "Google Classroom을 대체할 수 있는지는 현재 쓰는 기능을 나눠 봐야 합니다.",
    "ClassIn은 코스·수업 생성, 학생 초대, 자료 업로드, 과제·시험, 성적·리포트 같은 LMS 흐름을 운영할 수 있어요. 실시간 수업을 Zoom으로 계속 쓰더라도 과제와 자료 운영부터 검토할 수 있습니다.",
    "다만 100개 이상 반, 반별 최대 인원, 일괄 생성, 기존 계정 연동은 기관 설정·요금제·API 범위 확인이 필요합니다. 현재 반 수, 학생 수, 필요한 자료/과제 흐름을 알려주시면 검토 항목으로 정리해드릴게요.",
  ].join("\n\n")
}

function getSiteEntryIntegrationAnswer() {
  return [
    "자사 사이트의 입장 버튼에서 ClassIn 수업으로 바로 연결하는 건 기본 제공 기능으로 안내돼 있지 않아요. 공식 API로 연결하는 개발 작업이 필요할 수 있어요.",
    "수업 링크, 로그인 방식, 학생 권한, 수업 생성 주체, 반복 시간표, API 또는 운영 자동화 범위를 같이 봐야 해요.",
    "현재 사이트에서 회원 인증을 어떻게 하고 있는지, 수업이 매번 수동 생성인지 반복 일정인지, 충전형/구독형 중 어떤 계약을 검토 중인지 알려주시면 연동 확인 항목으로 좁혀드릴게요.",
  ].join("\n\n")
}

function getS65QuoteAnswer() {
  return [
    "65인치 모델은 견적 전에 최신 공급 조건 확인이 필요합니다.",
    "현재 공개 스펙 기준으로는 S75와 S86을 표준 모델로 먼저 안내하고, S65는 라인업에는 있으나 상세 규격서·재고·가격을 단정하지 않습니다.",
    "65인치가 꼭 필요한 이유가 교실 크기인지, 예산인지, 설치 공간인지 알려주시면 S65 가능 여부와 75인치 대안까지 같이 확인하는 쪽으로 안내할게요.",
  ].join("\n\n")
}

function getBoardOnlyOrPlatformAnswer() {
  return [
    "Classin Board는 단순 전자칠판이라기보다 OPS와 ClassIn 소프트웨어가 연결된 수업 시스템으로 보는 게 맞습니다.",
    "보드 위에서 판서, EDB 교안, 녹화, LMS, 복습 자료 흐름을 함께 쓰는 구조라서 '전자칠판만 단품 구매'나 '플랫폼만 내장 여부'는 견적·공급 조건으로 확인해야 해요.",
    "원하시는 게 순수 전자칠판 구매인지, 보드에서 ClassIn 수업 플랫폼까지 쓰려는 것인지 알려주시면 구성 범위를 나눠드릴게요.",
  ].join("\n\n")
}

function getCameraConflictAnswer() {
  return [
    "두 명이 같은 수업에 들어왔는데 한 명만 카메라가 켜진다면, 먼저 계정과 기기 권한을 나눠 확인해야 합니다.",
    "계정 역할, 온스테이지 또는 카메라 설정, 브라우저·앱의 카메라 권한, 같은 기기 중복 접속 여부, 다른 앱이 카메라를 점유하고 있는지 순서대로 보세요.",
    "수업 진행에 영향이 있으면 계정 종류, 사용 기기, 앱/브라우저, 오류 화면을 받아 기술지원으로 넘기는 게 안전합니다.",
  ].join("\n\n")
}

// 핵심 기능 질문 가운데 세부 사항(숙제 마감·채점, 출결 내려받기, 학생 화면 공유)을 묻는 말은 "네, ~할 수 있어요"
// 일반 답으로는 물은 것에 답하지 못한다. 공개 문서 문장으로 만든 세부 답을 먼저 본다.
const HOMEWORK_DEADLINE_ANSWER =
  "네, 숙제를 만들 때 시작 시간과 마감 시간을 함께 정해요. 시작·마감 시간, 게시 대상, 연결할 단원, 선행 학습 조건은 활동 종류와 관계없이 공통 설정이에요. 숙제는 코스의 [과정] 탭 > [새로 만들기]에서 만들어요."
const HOMEWORK_GRADING_ANSWER =
  "네, 숙제 채점도 클래스인에서 해요. AI 채점을 켠 숙제는 채점 화면에 점수와 총평 초안이 먼저 채워지고, 확인한 뒤 [게시 후 다음 학생]으로 공개하거나 [저장 후 다음 학생]으로 초안을 남기며 이어서 채점해요. 시험과 OMR 카드는 객관식처럼 답이 정해진 문항을 자동으로 채점하고, 주관식은 교사가 직접 채점해요."
const ATTENDANCE_EXPORT_ANSWER =
  "네, 관리자 대시보드 > [결제] > [통계 다운로드]에서 수업별 출결 내역을 [출결 통계]로 받을 수 있어요. 파일은 Excel로 받고, 기간은 한 번에 최대 6개월치까지 정할 수 있어요. 받은 기록은 [계정 정보] > [통계 이력]에 남아요."
const STUDENT_SCREEN_SHARE_ANSWER =
  "학생이 자기 화면을 공유할 수 있는지는 공개 안내에서 확인되지 않아 제가 된다고 말씀드리기 어려워요. 클래스인 수업 도구에는 화면 공유와 미러링이 있고, 교재 뷰어, 외부 프로그램, 실습 화면을 보여 줄 때 써요. 확인이 필요하시면 \"상담원 연결\"이라고 남겨 주세요."

function getCoreFeatureDetailAnswer(text: string): string | null {
  if (/숙제|과제/.test(text)) {
    if (/마감|기한|시작\s*시간/.test(text) && !/지난|지나|알림|문자/.test(text)) return HOMEWORK_DEADLINE_ANSWER
    if (/채점|점수/.test(text) && !/성적표|시험|omr/.test(text)) return HOMEWORK_GRADING_ANSWER
  }
  if (/출결|출석/.test(text) && /엑셀|excel|내려\s*받|다운|뽑|추출/.test(text)) return ATTENDANCE_EXPORT_ANSWER
  if (/화면\s*공유|미러링/.test(text) && /(?<![가-힣])(?:학생|수강생|애들|아이들)/.test(text)) return STUDENT_SCREEN_SHARE_ANSWER
  return null
}

function getCoreFeatureYesNoAnswer(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  const detail = getCoreFeatureDetailAnswer(text)
  if (detail) return detail
  const lead = /녹화|다시\s*보기/.test(text)
    ? "네, 수업 녹화는 클래스인 기본 흐름에 있어요. 수업을 녹화해 복습·결석 보강용으로 다시 보여줄 수 있고, 영상은 자동으로 정리돼요."
    : /출결|출석/.test(text)
      ? "네, 출결은 클래스인에서 확인·관리할 수 있어요. 수업 참여 기록을 바탕으로 정리하고 관리자에서 모아 볼 수 있어요."
      : /숙제|과제/.test(text)
        ? "네, 과제(숙제)는 클래스인에서 낼 수 있어요. 한 번 제출받는 숙제와 요일 반복형 일일 과제로 나눠 운영할 수 있어요."
        : /복습/.test(text)
          ? "네, 복습은 녹화 영상과 수업 자료로 이어져요. 수업이 끝나면 영상·판서가 복습용으로 정리돼 학생이 다시 볼 수 있어요."
          : /시험|퀴즈/.test(text)
            ? "네, 시험·퀴즈 활동을 만들 수 있어요. 객관식·선착순 퀴즈, 시험 활동 등을 수업이나 코스에 추가할 수 있어요."
            : /화면\s*공유|미러링/.test(text)
              ? "네, 화면 공유와 미러링 모두 수업 중 도구로 지원돼요. 자료 화면을 공유하거나 기기 화면을 보드에 미러링할 수 있어요."
              : "네, 판서는 클래스인 핵심 기능이에요. 보드에서 한 판서를 저장·공유하고 복습 자료(EDB 교안)로 이어갈 수 있어요."
  return `${lead} 자세한 설정 위치는 화면 기준으로 안내해드릴게요.`
}

// 문서 발췌를 최대 maxSentences 문장까지만 남긴다. 문장 종결(. ! ? 。)이 없으면 빈 문자열을 반환해
// 호출부가 원문을 그대로 쓰도록 한다.
function trimToSentences(text: string, maxSentences: number): string {
  const parts = text.match(/[^.!?。]*[.!?。]/g)
  if (!parts || parts.length === 0) return ""
  return parts.slice(0, maxSentences).join("").trim()
}

// doc_suggestion 직답(주로 LLM 재작성이 실패·타임아웃했을 때의 폴백)에서 "제목: 발췌" 식 차가운
// 문서 덤프 대신 부드러운 도입부 + 다듬은 발췌로 답한다. direct_answer/handoff 경로는 건드리지 않는다.
export function buildDocSuggestionSummary(
  excerpt: string,
  headingText: string,
  options: { isMetaHeading: boolean; excerptStartsWithHeading: boolean }
): string {
  const trimmedExcerpt = trimToSentences(excerpt, 2) || excerpt.trim()
  const showHeading =
    headingText.length > 0 &&
    headingText !== "요약" &&
    !options.isMetaHeading &&
    !options.excerptStartsWithHeading
  const body = showHeading ? `${headingText}: ${trimmedExcerpt}` : trimmedExcerpt
  return `관련 안내를 정리해드리면,\n${body}`
}

// 사실을 묻는 질문(무엇·어디·언제·얼마나·되나요·있나요)인데 공개 문서에서 근거를 찾지 못했을 때의 답.
// 예전에는 "지금 바로 확정하기 어려워요. 현재 상황을 한 문장만 더 알려주세요"처럼 되물었는데, 상황을 더 알려 줘도
// 없는 문서가 생기지는 않는다(2026-11 실측 180문항 중 29건). 못 찾았다고 밝히고 사람에게 잇는 길만 알려 준다.
// unresolved 로 남겨 문서 공백 집계에 잡히게 한다.
export const NO_SOURCE_FACT_ANSWER = [
  "이 질문에 대한 내용은 공개 안내에서 찾지 못했어요. 확인되지 않은 내용을 추측해 말씀드리지 않을게요.",
  "정확한 답이 필요하시면 \"상담원 연결\"이라고 남겨 주세요. 담당자가 확인해 이어서 도와드려요.",
].join("\n\n")

// 증상 신고 신호. "~하면 안 되나요?"는 허락을 묻는 말이라 증상이 아니다.
const SYMPTOM_REPORT_RE =
  /(?<!면\s?)안\s*(?:돼|되|됨|됐|됩|나와|나옴|나오|들려|들리|보여|보이|켜|떠|열려|열리|먹|와|옴)|(?<!면\s?)안돼|(?<!면\s?)안되|안됨|못\s*(?:하|해|들어|보|봐|열|찾)|오류|에러|끊겨|끊김|끊어져|튕겨|튕김|튕기|멈춰|멈춤|멈췄|먹통|고장|이상해|이상하|실패|막혔|막혀|비활성|회색|눌러도|눌렀더니|뜹니다|떠요|라고\s*(?:떠|뜨|나와|나옵)|지원되지\s*않|했는데도|해\s*봐도|사라졌|없어졌|느려|버벅|깨져|0\s*kb/
// 묻는 말. 의문사가 있거나, 묻는 어미(되나요·있어요?·인가요·궁금)로 끝난다.
const FACT_QUESTION_CUE_RE =
  /[?？]|뭐|무엇|무슨|어디|언제|얼마|몇|어떻게\s*(?:되|돼)|어떤|누가|누구|(?:나요|가요|까요|는지|인지|던가|되나|돼요|되요|됨|돼|드나|드나요|있어요|있음|없어요|없음|해요|하나|예요|에요|이에요|인가|일까|맞나|맞아요|궁금|궁금해요|가능|가능해요|가능한가요)\s*[.!~]*$/

/** 증상 신고가 아니라 사실을 묻는 질문인지 본다. 한두 낱말이나 '그거'처럼 무엇을 묻는지 모르는 입력은 아니다. */
function isFactSeekingQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase().trim()
  const compact = text.replace(/\s+/g, "")
  if (question.tokens.length < 2 || compact.length < 6) return false
  // 앞 턴을 가리키는 지시어(그거·그건·이건·저건·거기)로 시작하는 짧은 후속 질문은 무엇을 묻는지 이 턴만으로는 모른다.
  if (/그거|그게|그걸|그것|그건|이거|이건|저거|저건|거기|그\s*(?:파일|링크|앱)/.test(text) && compact.length <= 40) return false
  if (SYMPTOM_REPORT_RE.test(text)) return false
  // 잡담·서비스 밖 질문("오늘 날씨 어때?")은 문서를 못 찾은 게 아니라 다룰 범위가 아니다. 지금처럼 되묻는다.
  if (OFF_TOPIC_RE.test(text)) return false
  return FACT_QUESTION_CUE_RE.test(text)
}

// 약한 근거(검색 점수가 낮은 문서)만 있을 때 공개 챗봇이 내보내는 초안.
// 예전에는 "관련 안내를 정리해드리면," 뒤에 그 문서 조각을 그대로 붙였는데, 근거가 약하다는 것은 질문과
// 상관없는 조각일 가능성이 높다는 뜻이다("어느 나라 제품인가요?"에 드라이브 사용법이 나간 원인).
// 모델이 답을 다시 쓰지 못한 경우에도 엉뚱한 조각이 나가지 않도록, 못 찾았다고 밝히고 다음 행동만 안내한다.
export const WEAK_SOURCE_DRAFT_ANSWER = [
  "이 질문에 딱 맞는 안내는 아직 찾지 못했어요. 엉뚱한 내용을 붙여 드리기보다 정확히 확인해 드릴게요.",
  "궁금한 점을 조금만 더 구체적으로 적어 주시거나, \"상담원 연결\"이라고 남겨 주시면 담당자가 이어서 도와드려요.",
].join("\n\n")

function formatConsumerAnswer({
  answerMode,
  category,
  question,
  top,
  internal,
  meta,
}: {
  answerMode: AnswerMode
  category: string
  question: NormalizedQuestion
  top: ChatbotSource
  /** 내부 CS 코파일럿 경로. 초안이 담당자에게 근거로 전달되므로 약한 문서 조각도 그대로 요약해 준다. */
  internal?: boolean
  /** 정해 둔 문장이 아니라 검색 조각(발췌)으로 초안을 만들었으면 fromExcerpt 를 켠다. */
  meta?: { fromExcerpt: boolean }
}) {
  if (
    isHardwareUnconfirmedDetailQuestion(question) &&
    top.urlPath.includes("/docs/hardware/board-lineup-specs")
  ) {
    return getHardwareUnconfirmedDetailAnswer()
  }
  if (isLoginTroubleQuestion(question) && top.heading === "로그인/비밀번호 기본 점검") {
    return getLoginTroubleAnswer()
  }
  if (isLiveClassTroubleQuestion(question) && top.heading === "수업 중 끊김·소리·마이크 기본 점검") {
    return getLiveClassTroubleAnswer()
  }
  if (top.heading === "웹 라이브 요금과 사용 조건") {
    return getWebLiveBillingAnswer()
  }
  if (isHardwareTroubleQuestion(question) && top.urlPath.includes("/docs/hardware/board-basic-operation")) {
    return getHardwareTroubleAnswer()
  }
  if (isHardwareBoardLineupQuestion(question) && top.urlPath.includes("/docs/hardware/board-lineup-specs")) {
    return getHardwareBoardLineupAnswer(HARDWARE_BIG_MODEL_RE.test(question.redacted.toLowerCase()))
  }
  if (isHardwareSpecsQuestion(question) && top.urlPath.includes("/docs/hardware/board-lineup-specs")) {
    if (BOARD_MODEL_COMPARE_RE.test(question.redacted.toLowerCase())) return getBoardModelCompareAnswer()
    return getHardwareSpecsAnswer(HARDWARE_BIG_MODEL_RE.test(question.redacted.toLowerCase()))
  }
  if (isComparisonQuestion(question) && top.urlPath.includes("/docs/start/academy-system-os-positioning")) {
    return getComparisonAnswer(question, top)
  }
  if (top.heading === "EDB와 교안 표준화") {
    return getEdbAnswer()
  }
  if (isIdentityQuestion(question) && top.urlPath.includes("/docs/start/academy-system-os-positioning")) {
    return getIdentityAnswer(question)
  }
  if (isPricingInfoQuestion(question) && top.heading === "요금·견적 구성 안내") {
    return getPricingAnswer(question)
  }
  if (top.heading === "소프트웨어 요금과 플랜 안내") {
    return getSoftwarePricingAnswer()
  }
  if (top.heading === "체험·파일럿 확인") {
    return getTrialOrPilotAnswer()
  }
  if (top.heading === "학부모 리포트·알림 확인") {
    return getParentReportOrNotificationAnswer()
  }
  if (isInstallFormQuestion(question) && top.heading === "설치 형태와 현장 점검") {
    return getInstallFormAnswer()
  }
  if (top.heading === "요금제 한도·체험 범위 확인") {
    return getAccountPlanOrTrialLimitAnswer(question)
  }
  if (top.heading === "영수증과 결제 증빙 확인") {
    return getReceiptAnswer(question)
  }
  if (top.heading === "녹화 저장과 권한 기준") {
    return getRecordingPermissionAnswer(question)
  }
  if (top.heading === "가입과 개인정보") {
    return getSignupInfoAnswer()
  }
  if (top.heading === "오프라인 칠판 사용") {
    return getOfflineBoardAnswer()
  }
  if (top.heading === "하드웨어 조건부 확인 항목") {
    return getHardwareConditionalPreAdoptionAnswer(question)
  }
  if (top.heading === "확인 필요한 정책·계약 항목") {
    return getPolicyConfirmationAnswer(question)
  }
  if (top.heading === "LMS와 과제 운영 범위") {
    return getGoogleClassroomAnswer()
  }
  if (top.heading === "사이트 입장 버튼 연동 확인") {
    return getSiteEntryIntegrationAnswer()
  }
  if (top.heading === "S65 견적 확인 필요") {
    return getS65QuoteAnswer()
  }
  if (top.heading === "전자칠판 단품과 시스템 구성") {
    return getBoardOnlyOrPlatformAnswer()
  }
  if (top.heading === "수업 카메라 충돌 점검") {
    return getCameraConflictAnswer()
  }
  if (
    isPreAdoptionCheckQuestion(question) &&
    top.urlPath.includes("/docs/start/pre-adoption-faq-22-questions")
  ) {
    return getPreAdoptionOverviewAnswer()
  }
  if (isCoreFeatureYesNoQuestion(question) && top.heading === "수업 기능 사용 안내") {
    return getCoreFeatureYesNoAnswer(question)
  }

  const caution = answerMode === "handoff" ? HANDOFF_CAUTION_LINE : ""
  // 문서 섹션의 메타성 제목(예: "이 문서는 지도입니다")이 답변 앞에 새지 않게 거른다.
  const isMetaHeading = /^이\s*문서|지도입니다|^목차|개요만\s*보기/.test(top.heading ?? "")
  const headingText = top.heading?.trim() ?? ""
  // 청크 본문이 이미 제목 문구로 시작하면(동기화 단계에서 heading 이 content 에도 포함됨)
  // 제목을 또 앞에 붙이지 않는다 — "유료 계정 전환: 유료 계정 전환 …" 같은 제목 메아리 방지.
  const normalizedExcerpt = top.excerpt.replace(/\s+/g, " ").trim().toLowerCase()
  const excerptStartsWithHeading =
    headingText.length > 0 && normalizedExcerpt.startsWith(headingText.replace(/\s+/g, " ").toLowerCase())
  // 검색 발췌는 220자에서 잘려 "..."로 끝날 수 있다 — 문장 끝까지만 쓰고, "제목: " 접두어는 붙이지 않는다.
  const sentenceSafeExcerpt = trimExcerptToSentence(top.excerpt)
  // 여기부터는 정해 둔 문장이 아니라 검색 조각으로 만드는 초안이다. 근거 선별이 이 초안만 바꿔 쓴다.
  if (meta) meta.fromExcerpt = true
  // 약한 출처(doc_suggestion): 공개 경로는 조각을 붙이지 않고 못 찾았다고 밝힌다. 내부 코파일럿만 조각을 요약해 넘긴다.
  if (answerMode === "doc_suggestion" && !internal) return WEAK_SOURCE_DRAFT_ANSWER
  // direct_answer/handoff 는 발췌를 그대로 쓴다.
  const summary =
    answerMode === "doc_suggestion"
      ? buildDocSuggestionSummary(sentenceSafeExcerpt, headingText, { isMetaHeading, excerptStartsWithHeading })
      : sentenceSafeExcerpt
  const nextStep = getContextualNextStep(question, category)

  return [
    summary,
    caution,
    nextStep ? `다음으로는 ${nextStep}` : null,
  ].filter(Boolean).join("\n\n")
}

function isUsableGeneratedAnswer(answer: string) {
  const trimmed = answer.trim()
  if (trimmed.length < 24) return false
  if (/[,\u3131-\u314e]$/.test(trimmed)) return false
  if (!hasConcreteClassinAnchor(trimmed)) return false
  if (isVagueGeneratedAnswer(trimmed)) return false
  return /(?:[.!?]|\u3002|요|니다|습니다|합니다|세요)$/.test(trimmed)
}

function hasConcreteClassinAnchor(answer: string) {
  return /classin|클래스인|전자칠판|보드|수업|교실|녹화|복습|lms|edb|이\s*디\s*비|관리자|학생|교사|강사|과제|출결|도입|운영|판서/i.test(answer)
}

function isVagueGeneratedAnswer(answer: string) {
  const normalized = answer.replace(/\s+/g, " ").trim()
  const vaguePatterns = [
    /상황에\s*따라\s*다릅니다\.?$/i,
    /도움이\s*될\s*수\s*있습니다\.?$/i,
    /효과적으로\s*활용할\s*수\s*있습니다\.?$/i,
    /자세한\s*내용은\s*(담당자|상담|문의)/i,
    /문의해\s*주시면\s*(안내|답변)/i,
    /최적의\s*(솔루션|방법)/i,
  ]

  return vaguePatterns.some((pattern) => pattern.test(normalized))
}

// 정해 둔 문장이 아니라 검색 조각(발췌)으로 만든 초안. 근거 선별은 이 초안만 바꿔 쓴다.
const excerptDraftResponses = new WeakSet<object>()

const HANDOFF_CAUTION_LINE =
  "이 내용은 실제 계정, 계약, 장비 상태, 도입 조건에 따라 달라질 수 있어 상담으로 확인하는 편이 안전합니다."

function composeAnswer(
  question: NormalizedQuestion,
  sources: ChatbotSource[],
  category: string,
  options: { internal?: boolean } = {}
): Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> {
  if (sources.length === 0) {
    const needsConsultation = wantsHumanConsultation(question)
    const isVague = question.tokens.length < 2 && !needsConsultation
    const needsHandoff = needsConsultation

    if (isVague) {
      return {
        answer:
          "무엇을 도와드릴까요?\n\n도입 상담, 수업 운영, 계정/오류, 결제/영수증 중 하나로 물어보시면 바로 안내드릴게요.",
        answerMode: "clarifying_question",
        confidence: 0.25,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: [
          "도입 전 확인 질문을 알려주세요",
          "수업 운영 문제를 해결하고 싶어요",
          "요금/견적은 어떤 항목으로 구성되나요?",
        ],
        unresolved: true,
      }
    }

    // 사실을 묻는 질문이면 되묻지 않고 못 찾았다고 답한다. 정말 모호한 입력만 아래처럼 되묻는다.
    if (!needsConsultation && !options.internal && isFactSeekingQuestion(question)) {
      return {
        answer: NO_SOURCE_FACT_ANSWER,
        answerMode: "fallback",
        confidence: 0.2,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: buildSuggestedQuestions(category),
        unresolved: true,
      }
    }

    const fallbackCriteria = getStepCriteriaByCategory(category)
    // 분류가 안 된 질문에 "도입·운영·계정·결제 중 어디냐"를 되묻지 않는다. 묻는 사람에 맞는 예를 들어 하나만 묻는다.
    const generalClarify = !needsConsultation && !STEP_CRITERIA_CATEGORIES.has(category) ? buildGeneralClarify(question) : null
    return {
      answer: generalClarify
        ? generalClarify.join("\n\n")
        : [
            needsConsultation
              ? "상담이 필요한 내용으로 확인했습니다."
              : category === "troubleshooting"
                ? "원인을 바로 단정하기보다 상황을 조금만 더 좁히는 게 좋겠습니다."
                : category === "billing" || category === "hardware"
                  ? "계약, 결제, 장비 상태에 따라 달라질 수 있어 지금은 확정해서 말하기 어렵습니다."
                  : "지금 바로 확정하기 어려워요. 현재 상황을 한 문장만 더 알려주세요.",
            fallbackCriteria.steps.slice(0, 2).map((step, index) => `${index + 1}. ${step}`).join("\n"),
          ].join("\n\n"),
      answerMode: needsHandoff ? "handoff" : "fallback",
      confidence: needsHandoff ? 0.4 : 0.15,
      needsHandoff,
      sources: [],
      suggestedQuestions: [
        "도입 전 확인 질문을 알려주세요",
        "요금/견적은 어떤 항목으로 구성되나요?",
        "계정이나 수업 접속 문제가 있어요",
      ],
      unresolved: true,
    }
  }

  const top = sources[0]
  const confidence = top.score >= 240
    ? 0.9
    : Math.min(0.84, Math.max(0.35, 0.45 + top.score / 80))
  const explicitConsultation = wantsHumanConsultation(question)
  const answerMode: AnswerMode = explicitConsultation
    ? "handoff"
    : top.score >= MIN_DIRECT_SOURCE_SCORE
      ? "direct_answer"
      : "doc_suggestion"

  const draftMeta = { fromExcerpt: false }
  const answer = formatConsumerAnswer({ answerMode, category, question, top, internal: options.internal, meta: draftMeta })

  const response = {
    answer,
    answerMode,
    confidence,
    needsHandoff: answerMode === "handoff",
    sources,
    suggestedQuestions: buildSuggestedQuestions(category),
    unresolved: answerMode === "handoff" || answerMode === "doc_suggestion",
  }
  if (draftMeta.fromExcerpt) excerptDraftResponses.add(response)
  return response
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
  meta: ChatbotRequestMeta,
  sessionId?: string
) {
  if (!hasSupabaseServerEnv()) return undefined

  const supabase = createSupabaseAdminClient()
  const requestedSessionId = sessionId ?? normalizeOptionalUuid(input.sessionId)
  const callerAnonymousId = normalizeString(input.anonymousId) ?? null

  // 보안: 세션은 anonymous_id(브라우저별 익명 식별자)에 소유권이 묶인다.
  // 호출자가 기존 sessionId를 제시하면 그 세션의 저장된 owner와 현재 호출자의
  // anonymous_id가 일치할 때만 이어 쓴다. 불일치(또는 null-owner 규칙 위반)면
  // 남의 세션에 절대 붙지 못하도록 새 세션을 발급한다.
  //
  // null-owner 규칙(보수적/fail-safe): owner와 caller가 둘 다 동일한 non-null 값일
  // 때만 소유로 인정한다. 즉
  //  - owner=null  세션은 누구도(non-null caller 포함) 이어 쓸 수 없다.
  //  - caller=null 호출자는 어떤(이전에 owner가 있던) 세션도 claim할 수 없다.
  //  - owner=null & caller=null 도 일치로 보지 않는다(공유 익명 풀이 서로 섞이는 것 방지).
  const isOwner = (sessionOwner: string | null) =>
    callerAnonymousId !== null && sessionOwner !== null && sessionOwner === callerAnonymousId

  let resumableSessionId: string | undefined

  if (requestedSessionId) {
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, anonymous_id")
      .eq("id", requestedSessionId)
      .maybeSingle()

    if (data?.id) {
      // 기존 세션이 존재할 때만 소유권을 확인한다. 일치하면 이어 쓰고,
      // 불일치면 절대 붙지 않고(아래에서 새 세션 발급) 제시된 id도 버린다.
      if (isOwner((data.anonymous_id as string | null) ?? null)) {
        return data.id as string
      }
    } else {
      // 아직 존재하지 않는 id면 호출자가 처음 만드는 세션이므로 그대로 그 id로 생성한다.
      resumableSessionId = requestedSessionId
    }
  }

  const context = getContextObject(input.context)
  const utm = getContextObject(context.utm)
  const sessionInsert: Record<string, unknown> = {
    channel: normalizeChatSessionChannel(context.channel),
    anonymous_id: callerAnonymousId,
    user_agent: meta.userAgent ?? null,
    referrer: meta.referrer ?? null,
    utm,
  }

  // 소유권이 확인된 신규 세션(아직 row 없음)만 제시된 id를 재사용한다.
  // 남의 세션 id였던 경우 resumableSessionId 가 undefined 이므로 새 id가 발급된다.
  if (resumableSessionId) sessionInsert.id = resumableSessionId

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert(sessionInsert)
    .select("id")
    .single()

  if (error) {
    // 같은 id로 동시 생성 경쟁(23505)이 난 경우에만 그 id를 신뢰한다.
    // 이 분기는 우리가 직접 id를 지정해 insert한 신규 세션에서만 발생한다.
    if (resumableSessionId && error.code === "23505") return resumableSessionId
    console.warn("[chatbot] failed to create session:", error.message)
    return undefined
  }

  return data.id as string
}

// Claude 로 답한 응답의 모델·토큰 — chatbot_answer_events.model_name·prompt_tokens·completion_tokens 를 채운다.
// 응답 객체(클라이언트로 나가는 JSON)에 필드를 더하지 않으려고 WeakMap 에 둔다. Gemini 답변은 비워 둔다(기존 그대로).
const answerUsageByResponse = new WeakMap<object, ChatbotAnswerUsage>()
function rememberAnswerUsage(response: object, usage: ChatbotAnswerUsage) {
  answerUsageByResponse.set(response, usage)
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
  sessionId?: string,
  answerEventId?: string
) {
  if (!hasSupabaseServerEnv()) return {}

  try {
    const supabase = createSupabaseAdminClient()
    const resolvedSessionId = await ensureSession(input, meta, sessionId)
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

    const answerEventInsert: Record<string, unknown> = {
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
    }

    if (answerEventId) answerEventInsert.id = answerEventId
    const answerUsage = answerUsageByResponse.get(response)
    if (answerUsage) {
      answerEventInsert.model_name = answerUsage.model
      answerEventInsert.prompt_tokens =
        answerUsage.inputTokens + (answerUsage.cacheReadInputTokens ?? 0) + (answerUsage.cacheCreationInputTokens ?? 0)
      answerEventInsert.completion_tokens = answerUsage.outputTokens
    }

    const { data: answerEvent, error: answerEventError } = await supabase
      .from("chatbot_answer_events")
      .insert(answerEventInsert)
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

    // 대화 라벨(의도·기관·단계·온도) — CHATBOT_LABELING_ENABLED + Anthropic 키일 때만, 테이블이 없으면 조용히 건너뛴다.
    // Claude 호출(최대 수 초)이라 응답 뒤에 돈다 — 위 부수효과처럼 void 로 두면 Vercel 함수가 응답 직후 멈춰 라벨이 빠진다.
    runAfterResponse(() =>
      maybeLabelChatbotExchange(supabase as never, {
        sessionId: resolvedSessionId,
        answerEventId: answerEvent.id as string,
        question: question.redacted,
        answer: response.answer,
        category,
        intent,
        handoffIntent,
      })
    )

    void Promise.allSettled(sideEffects).then((sideEffectResults) => {
      for (const result of sideEffectResults) {
        if (result.status === "rejected") {
          console.warn(
            "[chatbot] failed to persist exchange side effect:",
            result.reason instanceof Error ? result.reason.message : result.reason
          )
        }
      }
    })

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

// question_clusters.metadata.internalCs 참조는 최신 우선 최대 10개만 유지한다 (계약 2).
const QUESTION_CLUSTER_INTERNAL_CS_REF_CAP = 10

interface QuestionClusterInternalCsRef {
  conversationId: string
  messageId: string
}

function mergeInternalCsRefs(existing: unknown, ref: QuestionClusterInternalCsRef) {
  const prior = Array.isArray(existing)
    ? existing.filter((entry): entry is QuestionClusterInternalCsRef => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false
        const candidate = entry as Record<string, unknown>
        return (
          typeof candidate.conversationId === "string" && typeof candidate.messageId === "string"
        )
      })
    : []

  return [ref, ...prior.filter((entry) => entry.messageId !== ref.messageId)].slice(
    0,
    QUESTION_CLUSTER_INTERNAL_CS_REF_CAP
  )
}

/**
 * 질문을 보강 큐(question_clusters)에 upsert 한다. 공개 챗봇 응답 저장 경로가 기본 호출자이며,
 * 내부 CS 유입(gap-ingest)은 answerEventId/response/category 없이 options 로 출처와 참조만 싣는다.
 * - 기존 행이 ignored/published 상태여도 status 를 되돌리지 않는다 (의도적 억제 존중 — update 는 status 미포함).
 * - metadata.source 는 최초 유입 경로를 보존한다 (기존 값이 있으면 덮어쓰지 않음).
 */
export async function upsertQuestionCluster(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  answerEventId: string | null,
  question: Pick<NormalizedQuestion, "redacted">,
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "handoffIntent"> | null,
  category: string | null,
  options?: {
    source?: string
    internalCsRef?: QuestionClusterInternalCsRef
  }
) {
  const topSource = response?.sources[0]
  const source = options?.source ?? "chatbot_mvp_exact_match"
  const internalCsRef = options?.internalCsRef

  try {
    // 동시성 하드닝: (1) 신규 insert 가 canonical_question unique 경합에서 지면 승자 행에
    // 재병합하고, (2) metadata.internalCs 병합(read-modify-write)은 읽은 스냅샷을 낙관적
    // 가드로 걸어 끼어든 쓰기를 감지한다. 두 경우 모두 재조회→재병합 재시도 1회로 흡수하며,
    // 최종 시도는 가드 없이 커밋해 종료를 보장한다.
    const maxAttempts = 2
    let clusterId: string | undefined

    for (let attempt = 0; attempt < maxAttempts && !clusterId; attempt++) {
      const finalAttempt = attempt === maxAttempts - 1

      const { data: existing, error: existingError } = await supabase
        .from("question_clusters")
        .select("id, sample_questions, metadata")
        .eq("canonical_question", question.redacted)
        .maybeSingle()

      if (existingError) throw existingError

      const existingCluster = existing as {
        id: string
        sample_questions: string[] | null
        metadata: Record<string, unknown> | null
      } | null

      if (existingCluster?.id) {
        const sampleQuestions = Array.from(
          new Set([question.redacted, ...(existingCluster.sample_questions ?? [])])
        ).slice(0, 5)

        const patch: Record<string, unknown> = {
          last_seen_at: new Date().toISOString(),
          sample_questions: sampleQuestions,
        }
        if (category) patch.category = category

        const originalMetadata = getContextObject(existingCluster.metadata)
        if (internalCsRef) {
          // 원본 스냅샷은 낙관적 가드 값으로 써야 하므로 병합은 복사본에만 한다.
          const mergedMetadata: Record<string, unknown> = { ...originalMetadata }
          mergedMetadata.internalCs = mergeInternalCsRefs(originalMetadata.internalCs, internalCsRef)
          if (!normalizeString(mergedMetadata.source)) mergedMetadata.source = source
          patch.metadata = mergedMetadata
        }

        let updateQuery = supabase
          .from("question_clusters")
          .update(patch)
          .eq("id", existingCluster.id)
        if (internalCsRef && !finalAttempt) {
          // jsonb 동등 필터 — postgrest 는 객체를 문자열로 직렬화하지 않으므로 직접 stringify 한다.
          updateQuery = updateQuery.eq("metadata", JSON.stringify(originalMetadata))
        }

        const { data: updatedRows, error } = await updateQuery.select("id")
        if (error) throw error
        if (!updatedRows || (updatedRows as unknown[]).length === 0) {
          // 가드 불일치(다른 병합이 먼저 커밋) 또는 행 소실 — 재조회해 최신 상태에 재병합한다.
          if (finalAttempt) throw new Error("question cluster update matched no rows")
          continue
        }
        clusterId = existingCluster.id
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
              source,
              ...(response ? { answerMode: response.answerMode } : {}),
              ...(internalCsRef ? { internalCs: [internalCsRef] } : {}),
            },
          })
          .select("id")
          .single()

        if (error) {
          // 동시 insert 가 canonical_question unique 를 먼저 차지한 경우 — 승자 행에 재병합한다.
          if ((error as { code?: string }).code === "23505" && !finalAttempt) continue
          throw error
        }
        clusterId = inserted.id as string
      }
    }

    if (!clusterId) return

    // 내부 CS 유입에는 공개 챗봇 answer event 가 없다 — 링크는 있을 때만 남긴다.
    if (!answerEventId) return

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
  // 증상 트리아지가 고른 주제의 영어 한 줄 요약(영어 질문에만 붙인다).
  englishSummary?: string
  // 사용법·점검표 답이면 화난 말투여도 상담 연결부터 앞세우지 않는다.
  howtoAnswer?: boolean
  // 증상 주제가 정해 둔 확인 질문과 주제 id(질문 주도 층이 쓴다).
  topicFollowUp?: string
  topicId?: string
  /** 정해 둔 답이 이미 필요한 것을 묻거나 안내하면 영업용 되묻기(규모·도입 시기)를 붙이지 않는다. */
  suppressSalesFollowUp?: boolean
  /** 근거 선별용 후보 출처(스트리밍 경로가 코어 뒤에서 선별할 때 쓴다). 응답에는 싣지 않는다. */
  evidencePool?: ChatbotSource[]
  /** 정해 둔 답 확인 관문의 대상이면 그 답의 출처 이름(예: field:logo-usage). 정해 둔 답을 만드는 쪽이 채운다. */
  gateOriginal?: string
  /** 관문 대상이 아닌 정해 둔 답(악용을 막는 거절 답). */
  gateExempt?: boolean
  /** 정해 둔 답 확인 관문의 결과(측정·로그용). 응답에는 싣지 않는다. */
  answerGate?: AnswerGateTrace
  /** 못 찾았을 때 목차에서 다시 고르는 두 번째 검색의 결과(측정·로그용). 응답에는 싣지 않는다. */
  secondChance?: SecondChanceTrace
  /** 답 색인 흔적(compiled 라우터, 측정·로그용, 답 색인 사양 §3.7). 응답에는 싣지 않는다. */
  answerIndex?: AnswerIndexTrace
  /** 대화 맥락으로 넓히기 전의 이번 말(넓혔을 때만). 말투·대화 저장은 이 말로 한다. question 은 넓힌 검색용 질문이다. */
  utterance?: NormalizedQuestion
  /** 대화 맥락 흔적(측정·로그용, 2026-11-20 조사 G1). 응답에는 싣지 않는다. */
  conversation?: ConversationTrace
}

interface ConversationTrace {
  reason: ConversationTurnReason
  /** 검색용 질문을 직전 질문으로 넓혔는지. */
  expanded: boolean
  /** 문서 페이지 맥락을 쓴 답이면 그 경로(답 캐시 열쇠에 넣는다). */
  pagePath?: string
}

interface BuildChatbotCoreOptions {
  sessionId?: string
  // 세션 소유권 검증용 — 이력 로드 시 세션 owner 와 대조한다.
  anonymousId?: string | null
  generateAnswer?: boolean
  // 내부 CS 코파일럿 전용(계약 6). 공개 경로는 절대 true 를 넘기지 않는다 — 검색/답변 캐시가 scope 로 격리된다.
  includeInternalDocs?: boolean
  // 스트리밍 경로처럼 근거 선별을 코어 밖에서 이어서 하는 호출. 코어가 초안을 확정하지 않는다.
  deferEvidenceSelection?: boolean
  // 정해 둔 답 확인 관문을 돌릴지. 비우면 generateAnswer 를 따른다(모델 없이 초안만 만드는 평가 호출은 돌리지 않는다).
  // 스트리밍 경로는 generateAnswer=false 로 코어를 부르지만 관문은 일반 경로와 같이 돌려야 하므로 true 를 넘긴다.
  answerGate?: boolean
  // 위젯이 보낸 직전 한 턴(검사·가리기를 마친 값). 짧은 대답·지시어 후속 질문을 직전 질문으로 넓힌다(conversation-context.ts).
  previousTurn?: PreviousTurn | null
  // 문서 페이지 경로(공개 문서만). "방금 본 내용" 같은 질문이면 그 문서 절을 검색 후보 맨 앞에 둔다.
  pagePath?: DocPageRef | null
}

function determineModelTier(): ChatbotModelTier {
  // Public chat starts from the cheapest fast model. The caller escalates to
  // deeper tiers only when the fast response is missing or unusable.
  return "basic"
}

function getEnabledModelTiers() {
  const startTier = determineModelTier()
  const startIndex = Math.max(0, PROGRESSIVE_MODEL_TIERS.indexOf(startTier))
  const tiers = PROGRESSIVE_MODEL_TIERS.slice(startIndex)
  return process.env.CHATBOT_ENABLE_DEEP_FALLBACK === "1" ? tiers : tiers.slice(0, 1)
}

async function generateUsableAnswerWithProgressiveModels(
  generate: (tier: ChatbotModelTier) => Promise<string | null>
) {
  const tiers = getEnabledModelTiers()

  for (const tier of tiers) {
    const answer = await generate(tier)
    const sanitized = answer ? sanitizePublicAnswerText(answer) : null
    if (sanitized && isUsableGeneratedAnswer(sanitized)) return sanitized
  }

  return null
}

// 이미 손으로 다듬은 큐레이션 템플릿 직답은 Gemini 재작성을 건너뛴다(즉시 응답·드리프트 방지).
const SITE_ISSUE_RE =
  /(?:홈페이지|사이트|웹사이트|문의\s*페이지|예약\s*(?:폼|페이지)|신청\s*(?:폼|양식)|폼|양식).{0,24}(?:영상|동영상|폼|양식|버튼|페이지|신청|제출)?.{0,16}(?:안\s*(?:돼|되|나|열|눌|넘어)|재생\s*(?:이\s*)?안|반응\s*(?:이\s*)?없|아무\s*반응|오류|에러|멈)/
const SHOWROOM_RE =
  /쇼룸|실물.{0,10}(?:보|볼|확인)|직접\s*(?:보고|보러|볼|만져|체험)|보러\s*갈|어디\s*가면\s*(?:볼|보)|가서\s*(?:직접\s*)?(?:써|체험|보)|체험\s*방문|방문\s*(?:신청|상담|예약)|(?<!도입\s?)상담\s*예약/
// 쇼룸 질문 가운데 위치를 묻는 말과 방문(상담) 예약을 묻는 말. 주차·운영 시간·가까운 역은 일반 쇼룸 답에 둔다.
const SHOWROOM_LOCATION_RE = /위치|주소|오시는\s*길|어디\s*(?:있|에\s*있|쯤|예요|에요|야|인가)|어디쯤/
const SHOWROOM_BOOKING_RE = /예약|신청|방문|가서|체험|잡/
const SHOWROOM_OTHER_DETAIL_RE = /주차|지하철|역\s|역이|버스|몇\s*시|운영\s*시간|본사/
// 공개 쇼룸 페이지(/showroom)와 회사 소개가 쓰는 data/offices.json 의 주소·운영 안내 그대로.
const SHOWROOM_LOCATION_ANSWER = "쇼룸은 서울 양천구 목동동로 233-1, 806호에 있어요. 평일에만 운영하고 주말과 공휴일은 쉬어요. 방문은 쇼룸 예약(/showroom)에서 날짜를 고르시면 되고, 정확한 호수는 확정 문자에도 적어 드려요."
// 최소 예약 기간과 상담 시간은 쇼룸 페이지가 화면에 그리는 상수를 그대로 쓴다(값이 바뀌면 답도 따라 바뀐다).
const SHOWROOM_BOOKING_ANSWER = `네, 목동 쇼룸 방문 상담을 예약하실 수 있어요. 쇼룸 예약(/showroom)에서 원하는 날짜와 시간을 고르고 연락처를 남기시면, 담당자가 일정을 확인해 확정되면 문자로 알려 드려요. 쇼룸은 평일만 운영하고, 예약은 최소 ${SHOWROOM_MIN_LEAD_BUSINESS_DAYS}영업일 전에 해 주셔야 하며, 상담은 1회 ${SHOWROOM_SLOT_DURATION_MINUTES}분이에요. 쇼룸에서는 EDB 교안, 판서, 녹화, 복습이 한 흐름으로 이어지는 실제 수업 운영을 확인하실 수 있어요.`
const QUOTE_FIX_RE = /견적서?.{0,24}(?:잘못|틀려|틀렸|다르게|다르|수정|오류|빠졌|빠져|대로\s*안)/
const EXAM_ANSWER_RE =
  /(?:시험|퀴즈|문제|숙제)\s*(?:의\s*)?(?:답|정답|답안)\s*(?:좀\s*)?(?:알려|가르쳐|보여|줘|주세요|주셈)|(?:^|\s)(?:정답|답)\s*(?:좀\s*)?(?:알려|가르쳐)\s*(?:줘|주세요|주셈)/
const ACCOUNT_DELETE_RE =
  /(?:계정|아이디).{0,20}(?:삭제|탈퇴|지워|없애)|회원\s*탈퇴|(?:영상|녹화|사진|기록|개인\s*정보).{0,30}(?:지워|삭제)\s*(?:달라|해\s*달|해\s*주|요청|가능|할\s*수)/
const INVOICE_MISSING_RE =
  /(?:세금\s*)?계산서.{0,24}(?:안\s*(?:왔|와|오)|안왔|안와|못\s*받|누락|언제\s*(?:와|오|나와)|찾)|(?:증빙|영수증).{0,12}(?:안\s*(?:왔|와)|못\s*받)/
const PAYMENT_FAIL_RE =
  /결제\s*(?:실패|오류|거절|승인\s*(?:안|실패))|결제\s*(?:가|이)?\s*안\s*(?:돼|되|됐)|카드\s*(?:를\s*)?(?:바꿨|바꿔|변경|교체|만료|정지).{0,30}(?:결제|자동|문자|실패)|결제\s*(?:수단|카드).{0,10}(?:바꾸|변경|교체)/
const VAT_RE = /(?=.*(?:부가세|부가가치세|\bvat\b))(?=.*(?:견적|가격|금액|포함|별도|요금))/
const DISCOUNT_RE =
  /(?:할인|깎|네고|약정).{0,30}(?:얼마|몇\s*%|퍼센트|까지|해\s*주|해줘|가능|되나|내려)|(?:경쟁사|타사|다른\s*(?:회사|업체)).{0,40}(?:할인|싸|저렴|%|맞춰|맞출|맞추)|(?:여러\s*대|대량|많이)\s*(?:사면|구매하면|구입하면).{0,20}(?:싸|할인|깎)/
const TRIAL_FEATURE_LOCK_RE =
  /체험.{0,30}(?:녹화|웹\s*라이브|라이브|기능|버튼).{0,24}(?:잠겨|잠김|잠금|막혀|막힘|안\s*(?:돼|되|보|눌|켜)|없|회색|못)/
const SHOWROOM_CONFIRM_RE =
  /(?:확정|예약).{0,20}(?:문자|연락|메일|알림|카톡).{0,12}(?:안\s*(?:와|왔|옴|오)|안와|안왔|없)|확정\s*(?:문자|연락)/
const INVOICE_AMOUNT_RE = /(?:계산서|청구|결제)\s*(?:금액|액수)?.{0,20}(?:금액|액수).{0,16}(?:다르|달라|차이|이상|늘)|(?:계산서|청구서).{0,20}(?:다르|달라)/
const STUDENT_COUNT_BILLING_RE =
  /(?:대시보드|등록된|목록)\s*(?:의\s*)?학생\s*수.{0,30}(?:안\s*맞|안맞|다르|달라|차이)|학생\s*수\s*(?:로|대로)\s*(?:돈|요금|비용|과금)/
const INSTALL_DIFFICULTY_RE = /(?:학생|애들|학부모|아이들).{0,20}(?:앱\s*)?설치.{0,20}(?:어려워|어렵|못\s*해|헤매|절반)|설치\s*(?:를|가)?\s*어려워/
const MIGRATION_RE =
  /(?:기존|원래)?\s*(?:학생|원생)\s*(?:명단|데이터)?.{0,12}\d+\s*명.{0,30}(?:옮기|이전|넘기|이관)|(?:명단|학생\s*데이터).{0,20}(?:옮기는\s*데|이전|이관).{0,30}(?:얼마나|해\s*줘|해\s*주|그쪽)/
const FREE_SCOPE_RE = /무료\s*(?:로)?.{0,20}(?:어디까지|범위|뭐까지|얼마나|몇\s*분|까지\s*돼)|(?:공짜|무료)\s*(?:로)?\s*(?:어디까지|뭐)/
const MULTI_SITE_BOARD_RE = /(?:다른\s*지점|지점).{0,30}(?:칠판|티비|tv|보드|전자칠판).{0,60}(?:연결|같은|호환|싸게|할인)/
const DOCS_FEEDBACK_RE = /(?:매뉴얼|설명서|기능\s*설명\s*자료|설명\s*자료|가이드).{0,20}(?:부족|없|링크|주세요)|기능\s*요청|피드백\s*(?:은|을|는)?\s*어디/
const IRREVERSIBLE_RE = /(?:되돌릴|복구할|돌이킬)\s*수\s*(?:있는|없는)\s*(?:것|거|작업)|실수로.{0,20}(?:지우거나|바꿔도).{0,20}(?:되돌|복구)/
// DPA(위탁 계약서) 양식·문서를 요청하는 말. "개인정보 처리 위탁업체는 어디인가요"처럼 수탁자가 누구인지만 묻는 말은
// 개인정보처리방침의 수탁자 표로 답할 일이라 여기서 가로채지 않는다.
const DPA_RE =
  /\bdpa\b|위탁\s*계약|(?:처리\s*위탁|수탁사|재위탁).{0,24}(?:계약서|양식|서류|문서|확인서|현황|목록|공개된)/
const DOUBLE_CHARGE_RE =
  /(?:결제|빠져|빠졌|출금|청구|돈).{0,10}(?:두\s*번|두번|2번|중복|이중)|(?:두\s*번|두번|2번|중복|이중)\s*(?:결제|빠|출금|청구)/
const EXPORT_MASK_RE =
  /(?:번호|휴대폰|전화|연락처).{0,24}(?:별표|\*|가려|마스킹)|(?:별표|마스킹).{0,20}(?:번호|명단|내보내|엑셀)/
const SECURITY_POLICY_RE = /2단계\s*인증|\b2fa\b|이중\s*인증|비밀번호\s*정책|비밀번호.{0,10}(?:길이|변경\s*주기|복잡도|만료\s*정책)/
const ONBOARDING_HELP_RE =
  /(?:누가|직접|와서|방문).{0,10}(?:세팅|설정|설치)\s*(?:좀\s*)?(?:해\s*주|해줘|도와)|세팅\s*(?:좀\s*)?(?:해\s*주|도와|대행)|(?:온보딩|운영\s*교육)\s*(?:지원|도와|받을\s*수)|우리만\s*복잡/
const ATTENDANCE_SMS_RE = /(?:출결|출석|등원|하원).{0,10}(?:문자|알림|메시지|카톡)/
const TRIAL_INVITE_RE =
  /체험.{0,40}(?:선생님|교사|강사).{0,30}(?:초대|등록|추가).{0,10}(?:안\s*(?:돼|되)|안돼|안되|못)/
const TRIAL_TO_PAID_RE =
  /체험.{0,30}(?:유료|정식).{0,20}(?:넘어|전환|바꾸)|유료\s*전환.{0,30}(?:데이터|코스|학생|그대로|유지|절차)/
const QUOTE_VS_PRICE_RE =
  /견적.{0,30}(?:홈페이지|사이트|가격표|요금표).{0,30}(?:다르|달라|차이)|(?:홈페이지|사이트).{0,20}(?:가격|요금).{0,30}견적.{0,10}(?:다르|달라)/
const SHOWROOM_DEVICE_RE = /(?:쇼룸|전시).{0,40}(?:데모|받은|우리).{0,40}(?:버벅|느려|느리|다르|같은\s*모델)/
const ZOOM_WEAKNESS_RE = /(?:zoom|줌).{0,30}(?:보다\s*)?(?:못한|단점|약점|부족|안\s*좋은)|(?:단점|약점|못한\s*게).{0,20}(?:솔직|뭐|말해)/
const PERSONAL_USE_RE =
  /(?:개인|혼자|private|과외).{0,24}(?:으로\s*)?(?:쓸\s*수|사용할|쓰고\s*싶|가입|이용)|(?:학원\s*(?:끝나|그만|나오|끝나면)).{0,30}(?:개인|혼자|private)/
const TRIED_ALREADY_RE =
  /다\s*해\s*봤|해\s*봤(?:다고|어요|는데|습니다)|소용\s*(?:없|이\s*없)|그래도\s*똑같|매번\s*(?:재부팅|인터넷|껐다)/
const FAR_REGION_RE = /부산|대구|광주|대전|울산|제주|강원|경남|경북|전남|전북|충남|충북|지방|멀어|먼\s*곳/

type QuickAnswer = Omit<ChatbotCore, "question" | "latencyMs">

// 영업·사이트 관련 자주 오는 요청을 공개 정보로 바로 답한다(쇼룸 예약, 견적서 수정, 사이트 오류).
function buildServiceQuickAnswer(question: NormalizedQuestion): QuickAnswer | null {
  const text = question.redacted.toLowerCase()
  const make = (
    answer: string[],
    handoffIntent: HandoffIntent,
    category: string,
    suggestedQuestions: string[],
    englishSummary?: string
  ): QuickAnswer => {
    const response = {
      answer: answer.join("\n\n"),
      answerMode: "handoff" as const,
      confidence: 0.82,
      needsHandoff: true,
      sources: [],
      suggestedQuestions,
      unresolved: false,
    }
    deterministicFinalResponses.add(response)
    return { response, category, intent: handoffIntent === "demo" ? "sales_consulting" : "troubleshooting", handoffIntent, englishSummary }
  }

  if (SITE_ISSUE_RE.test(text) && /홈페이지|사이트|웹사이트|폼|양식|예약|신청|데모\s*영상/.test(text)) {
    return make(
      [
        "홈페이지 화면이 제대로 움직이지 않는다면 먼저 이렇게 해 보세요.",
        "1. 페이지를 새로고침합니다.\n2. 다른 브라우저(크롬·엣지 등)나 시크릿 창으로 다시 열어 봅니다.\n3. 광고 차단 같은 브라우저 확장 프로그램을 잠시 끄고 다시 시도합니다.",
        "그래도 안 되면 신청은 아래 상담 연결로 바로 남기셔도 돼요. 담당자가 대신 접수하고 연락드립니다.",
      ],
      "demo",
      "onboarding",
      ["데모를 한번 보고 싶어요", "쇼룸 방문은 어떻게 예약해요?", "도입 상담을 받아보고 싶습니다"]
    )
  }
  const direct = (
    answer: string[],
    category: string,
    suggestedQuestions: string[],
    englishSummary?: string
  ): QuickAnswer => {
    const response = {
      answer: answer.join("\n\n"),
      answerMode: "direct_answer" as const,
      confidence: 0.82,
      needsHandoff: false,
      sources: [],
      suggestedQuestions,
      unresolved: false,
    }
    deterministicFinalResponses.add(response)
    return { response, category, intent: "docs_lookup", handoffIntent: "support", englishSummary }
  }

  // 현장 질문에서 모은 좁은 정해 둔 답(결제 사칭 문자, 해지 후 결제, 보안·개인정보 점검 등)을 먼저 본다.
  const field = findFieldQuickAnswer(text)
  if (field) {
    const quick = field.handoff
      ? make(field.answer, field.handoff, field.category, field.suggestedQuestions, field.en)
      : direct(field.answer, field.category, field.suggestedQuestions, field.en)
    return { ...quick, topicId: field.id, suppressSalesFollowUp: !field.salesFollowUp, gateOriginal: `field:${field.id}` }
  }

  if (EXAM_ANSWER_RE.test(text)) {
    // 시험 정답을 대신 알려 달라는 요청을 막는 거절 답이라 관문 대상이 아니다.
    const refusal = direct(
      [
        "시험 정답은 알려 드릴 수 없어요. 스스로 풀어 봐야 실력이 되니까요.",
        "대신 시험 화면이 안 열리거나, 제출이 안 되거나, 응시하다 화면이 멈추는 것처럼 막히는 문제는 바로 도와 드릴게요. 어떤 화면에서 막혔는지 짧게 알려 주세요.",
      ],
      "classroom",
      ["숙제 제출이 안 돼요", "앱이 자꾸 멈춰요", "다시보기는 어디서 봐요?"]
    )
    return { ...refusal, gateExempt: true }
  }
  if (
    ACCOUNT_DELETE_RE.test(text) &&
    /그만|탈퇴|아이(?!디|패드|폰)|자녀|우리\s*애|개인\s*정보|내\s*정보/.test(text) &&
    !/코스|클래스\s*탈퇴|반\s*탈퇴/.test(text)
  ) {
    if (!/아이(?!디|패드|폰)|자녀|우리\s*애|영상|녹화/.test(text)) {
      return make(
        [
          "탈퇴하면 그 계정으로는 학원 수업에 들어갈 수 없게 돼요. 학원을 계속 다닐 거라면 탈퇴는 한 번 더 생각해 보시는 게 좋아요.",
          "혹시 알림이 귀찮거나 특정 반 채팅이 부담되는 거라면 탈퇴 대신 코스 설정에서 알림만 끌 수 있어요. 어떤 점 때문에 탈퇴하고 싶은지 알려 주시면 맞는 방법을 찾아 드릴게요.",
          "그래도 탈퇴하려면 휴대폰·태블릿 앱에서 왼쪽 위 프로필 이미지 > [계정 및 보안] > [계정 삭제]로 들어가 안내를 끝까지 읽고, 동의 체크 뒤 본인 인증을 하면 됩니다. PC에는 계정 삭제 메뉴가 없어요. 지운 계정은 되돌리기 어려우니, 필요한 자료는 먼저 내려받고 학원에도 미리 알려 주세요.",
        ],
        "support",
        "admin",
        ["채팅 알림 끄는 법 알려줘", "로그인이 안 돼요", "담당자 상담으로 이어주세요"]
      )
    }
    return make(
      [
        "아이 계정과 지금까지 찍힌 녹화 영상은 관리하는 곳이 달라서 나눠서 확인하셔야 해요.",
        "녹화 영상은 학원 스토리지에 저장되고, 보관 기간과 삭제는 학원 관리자가 정해요. 지워 달라고 하시려면 학원에 먼저 요청해 주세요.",
        "아이 클래스인 계정을 없애려면 휴대폰·태블릿 앱에서 왼쪽 위 프로필 이미지 > [계정 및 보안] > [계정 삭제]로 들어가 안내를 끝까지 읽고, 동의 체크 뒤 본인 인증을 하면 됩니다. PC에는 계정 삭제 메뉴가 없어요. 지운 계정은 되돌리기 어려우니 필요한 자료는 먼저 내려받아 두세요.",
        "녹화 영상 삭제는 학원 확인이 필요해 바로 지워진다고 약속드리기는 어려워요. 진행이 막히면 아래 [실시간 상담 연결]로 도와 드릴게요.",
        "개인정보 처리 기준은 공식 개인정보처리방침을 따릅니다.",
      ],
      "support",
      "admin",
      ["다시보기는 어디서 봐요?", "로그인이 안 돼요", "담당자 상담으로 이어주세요"]
    )
  }
  if (INVOICE_AMOUNT_RE.test(text)) {
    return make(
      [
        "지난번과 똑같이 결제했는데 계산서 금액이 달라 의아하셨겠어요. 무엇이 붙었는지는 제가 단정할 수 없어서, 먼저 결제 내역부터 비교해 주세요.",
        "1. 관리자 대시보드 > [결제] > [결제 개요]에서 날짜별 비용 합계를 봅니다.\n2. 충전형이라면 [결제] > [주문 세부정보]에서 차감 내역을 봅니다.",
        "차이 나는 이유는 담당자가 계약과 결제 내역을 보고 확인해 드려요. 아래 [실시간 상담 연결]에 '계산서 금액 차이 확인'과 두 달의 결제월을 남겨 주세요.",
      ],
      "support",
      "billing",
      ["영수증은 어디서 받나요?", "이번 달 결제가 두 번 빠졌어요", "담당자 상담으로 이어주세요"]
    )
  }
  if (STUDENT_COUNT_BILLING_RE.test(text)) {
    return make(
      [
        "대시보드 학생 수와 실제 원생 수가 다르면, 그만둔 학생이 목록에 남아 있거나 한 학생이 계정 두 개로 등록된 경우일 수 있어요. [기관 관리] > [학생] 목록에서 먼저 맞춰 봐 주세요.",
        "요금이 학생 수 기준으로 나가는지는 요금제와 계약마다 달라 제가 단정하지 않을게요. 아래 [실시간 상담 연결]로 '학생 수와 과금 기준 확인'을 남겨 주시면 담당자가 계약 기준으로 안내해 드립니다.",
      ],
      "support",
      "billing",
      ["학생 추가가 안 돼요", "계정이 두 개가 됐어요", "담당자 상담으로 이어주세요"]
    )
  }
  if (INSTALL_DIFFICULTY_RE.test(text)) {
    return make(
      [
        "체험 중에 학생 절반이 못 들어오셨다면 걱정되시죠. 도입하면 민원이 없을 거라고 장담드리기는 어렵지만, 설치 단계에서 막히는 건 대부분 미리 줄일 수 있어요.",
        "- 학생에게는 '휴대폰은 앱 스토어·Play 스토어에서 ClassIn 검색 → [받기]/[설치]' 순서를 그대로 보내 주세요. PC는 공식 홈페이지 [다운로드]에서 받습니다.\n- 설치한 뒤에는 학원이 보낸 초대 링크나 QR로 코스에 바로 들어오게 하세요. 링크가 안 열리면 코스 ID로 검색해 들어옵니다.\n- 설명회처럼 듣기만 하는 수업은 앱 없이 링크로 보는 웹 라이브도 쓸 수 있어요.",
        "도입할 때 학생·학부모 안내와 강사 교육을 어떻게 도와드리는지는 아래 [도입 상담 남기기]로 남겨 주시면 담당자가 안내해 드립니다.",
      ],
      "demo",
      "onboarding",
      ["학생 계정은 어떻게 초대하나요?", "초대 링크를 눌러도 코스에 못 들어가요", "데모를 한번 보고 싶어요"]
    )
  }
  if (MIGRATION_RE.test(text)) {
    return make(
      [
        "기존 학생 명단은 엑셀로 한 번에 300명까지 올릴 수 있어요. 경로는 관리자 대시보드 [기관 관리] > [학생] > [학생 추가] > [Excel 가져오기]이고, [스텐실 다운로드]로 받은 양식에 이름과 휴대폰 번호(또는 이메일)를 채워 올립니다.",
        "아직 클래스인에 가입하지 않은 학생은 한 명씩 추가하거나 텍스트로 가져올 때 [학생 대리 등록]을 함께 체크해요. 걸리는 시간은 명단 정리 상태에 따라 달라 단정하지 않을게요.",
        "명단 이전을 대신 도와드리는지는 아래 [도입 상담 남기기]로 학생 수를 남겨 주시면 담당자가 확인해 드립니다.",
      ],
      "demo",
      "onboarding",
      ["엑셀로 올렸는데 일부만 들어갔어요", "학생 계정은 어떻게 초대하나요?", "데모를 한번 보고 싶어요"]
    )
  }
  if (FREE_SCOPE_RE.test(text)) {
    return make(
      [
        "딱 잘라 말씀드리면, 클래스인은 회원 가입을 마치면 무료 버전으로 시작하고, 2주 무료 체험도 신청할 수 있어요(/contact). 학원(기관)에서 쓰려면 유료 계정으로 전환해야 합니다.",
        "녹화와 웹 라이브는 유료 결제와 계정 인증을 마쳐야 열려요. 무료 버전에서 시간 제한이 몇 분인지 같은 세부 범위는 공개 안내에 정리돼 있지 않아 지어 말씀드리지 않을게요.",
        "정확한 무료·체험 범위는 아래 [도입 상담 남기기]로 확인해 드릴게요.",
      ],
      "demo",
      "billing",
      ["무료 체험판 있나요?", "프로와 비즈니스 차이가 뭐예요?", "견적 구성이 어떻게 되나요?"]
    )
  }
  if (MULTI_SITE_BOARD_RE.test(text)) {
    return make(
      [
        "다른 지점에도 넣으실 계획이시군요. 지점이 같은 학원(기관) 계정 안에서 운영되면 공유 드라이브와 코스 자료를 함께 쓸 수 있어요. 지금 보드와 다른 모델을 섞어 써도 되는지는 공개 안내에 정리돼 있지 않아 담당자가 확인해 드려요.",
        "여러 대를 사면 가격이 어떻게 되는지는 견적에서 정해지고, 할인을 약속드릴 수는 없어요. 아래 [도입 상담 남기기]로 지점 수와 교실 수를 남겨 주세요.",
      ],
      "demo",
      "hardware",
      ["전자칠판 스펙 알려줘", "견적 구성이 어떻게 되나요?", "쇼룸 방문은 어떻게 예약해요?"]
    )
  }
  if (DOCS_FEEDBACK_RE.test(text)) {
    return make(
      [
        "옵션 하나 확인하려고 여러 번 테스트하셨다니 번거로우셨겠어요. 말씀해 주신 의견은 개선에 꼭 필요한 내용이에요.",
        "지금 볼 수 있는 자료는 홈페이지 문서센터(/docs)의 기능별 안내와, 상담 채널(홈페이지 하단 채팅)에 요청하면 받을 수 있는 기관 교육 코스(녹화 강의)예요.",
        "기능 요청이나 자료 보완 의견은 아래 [실시간 상담 연결]에 '기능 요청'으로 남겨 주세요. 어떤 옵션을 확인하려다 막혔는지 적어 주시면 그대로 전달됩니다.",
      ],
      "support",
      "general",
      ["녹화가 안 돼요", "학생을 무대에 올리는 방법 알려줘", "담당자 상담으로 이어주세요"]
    )
  }
  if (IRREVERSIBLE_RE.test(text)) {
    return direct(
      [
        "처음엔 누구나 그래요. 미리 알아 두시면 훨씬 마음이 편해요. 공개 안내 기준으로 되돌리기 어려운 작업은 이것들이에요.",
        "- 코스 종료(폐강): 종료한 코스는 되살릴 수 없어요.\n- [스토리지]에서 지운 녹화 영상·스크린샷·칠판 내용: 복구되지 않아요.\n- 공유 드라이브에서 지운 파일: 되살릴 수 없어요.\n- 계정 삭제: 되돌리기 어려워요.\n- 학생이 숙제를 고쳐 다시 내면 그 전 점수와 피드백이 지워져요.",
        "이런 작업은 하기 전에 필요한 영상·자료를 먼저 내려받고, 남길 수업에는 보호 잠금을 걸어 두세요. 확실하지 않으면 실행 전에 원장님이나 상담 채널에 먼저 물어보시면 돼요.",
      ],
      "admin",
      ["코스를 실수로 종료했어요", "예전 녹화본이 사라졌어요", "공유 드라이브 권한 설정 방법 알려줘"]
    )
  }
  if (DPA_RE.test(text)) {
    return make(
      [
        "개인정보 처리 위탁 계약서(DPA) 양식이나 수탁사·재위탁 현황은 공개 문서에 따로 올라와 있지 않아서, 내용을 제가 지어 말씀드리지 않을게요.",
        "처리 기준은 공식 개인정보처리방침에서 먼저 확인해 주세요. 계약에 필요한 문서는 아래 [도입 상담 남기기]에 'DPA 양식·수탁사 현황 요청'이라고 남겨 주시면 담당자가 제공 가능한 문서를 안내해 드립니다.",
      ],
      "demo",
      "consultation",
      ["개인정보 처리 기준이 궁금해요", "도입 전 확인 질문을 알려주세요", "견적 구성이 어떻게 되나요?"]
    )
  }
  if (DOUBLE_CHARGE_RE.test(text)) {
    return make(
      [
        "이번 달 결제가 두 번 빠진 것처럼 보이면 놀라셨겠어요. 먼저 실제 결제 내역부터 확인해 주세요.",
        "1. 관리자 대시보드 > [결제] > [결제 개요]에서 날짜별 비용 합계를 봅니다.\n2. 충전형이라면 [결제] > [주문 세부정보]에서 차감 내역을 봅니다.",
        "중복 결제로 보이면 아래 [실시간 상담 연결]에 '중복 결제 확인'이라고 남겨 주세요. 담당자가 결제 내역을 확인해 안내해 드립니다. 환불 여부와 시점은 확인 전에 약속드리기 어려워요.",
      ],
      "support",
      "billing",
      ["영수증은 어디서 받나요?", "환불 규정이 어떻게 되나요?", "담당자 상담으로 이어주세요"]
    )
  }
  if (EXPORT_MASK_RE.test(text)) {
    return make(
      [
        "설정을 잘못 건드리셨다기보다, 개인정보 보호를 위해 번호가 가려져 나오는 경우일 수 있어요. 어떤 기준으로 가려지는지는 공개 안내에 없어 단정하지 않을게요.",
        "원장님(메인 관리자) 계정으로 받아도 같은지 먼저 확인해 보시고, 번호가 꼭 필요하면 아래 [실시간 상담 연결]로 어느 메뉴에서 내려받으셨는지 알려 주세요. 담당자가 확인해 드립니다.",
        "내려받은 파일에는 학생 정보가 들어 있으니 권한 있는 담당자만 보관해 주세요.",
      ],
      "support",
      "admin",
      ["학생 추가가 안 돼요", "통계 파일은 어디서 받아요?", "담당자 상담으로 이어주세요"]
    )
  }
  if (SECURITY_POLICY_RE.test(text)) {
    return make(
      [
        "교사 계정에 2단계 인증을 강제하거나 비밀번호 길이·변경 주기를 기관 단위로 정하는 설정은 공개 안내에 없어서, 있다고 말씀드리지 않을게요.",
        "지금 공개 안내로 할 수 있는 건 권한을 좁게 주는 쪽이에요. 하위 계정에는 꼭 필요한 메뉴만 주고, 그만둔 강사는 교사 비활성화와 하위 계정 삭제를 바로 해 주세요.",
        "보안 정책 요건이 있으면 아래 [실시간 상담 연결]로 필요한 항목을 알려 주세요. 담당자가 지원 범위를 확인해 드립니다.",
      ],
      "support",
      "admin",
      ["그만둔 선생님 계정 빼는 법 알려줘요", "실장님한테 관리자 권한 줄 수 있나요?", "담당자 상담으로 이어주세요"]
    )
  }
  if (ONBOARDING_HELP_RE.test(text)) {
    return make(
      [
        "다른 곳은 다 잘 쓰는 것 같은데 우리만 복잡하게 느껴지면 답답하시죠. 처음 세팅이 복잡하게 느껴지는 건 이상한 일이 아니에요.",
        "클래스인 도입 과정에는 강사 교육과 운영 세팅을 돕는 온보딩 단계가 있어요. 지금 학원 상황에 맞춰 어떤 지원이 되는지는 담당자가 안내해 드려요. 방문 세팅이 되는지는 여기서 약속드리기 어려워요.",
        "아래 [실시간 상담 연결]로 '운영 세팅 도움 요청'과 함께 가장 막히는 부분(강사 등록, 코스 만들기, 녹화 등)을 남겨 주세요.",
      ],
      "support",
      "onboarding",
      ["강사 한 명이 여러 반 맡을 수 있나요?", "학생 계정은 어떻게 초대하나요?", "녹화가 안 돼요"]
    )
  }
  if (ATTENDANCE_SMS_RE.test(text)) {
    return direct(
      [
        "출결 문자를 클래스인에서 학부모에게 자동으로 보내는 기능은 공개 안내에 없어서, 있다고 말씀드리지 않을게요.",
        "클래스인에서 바로 확인할 수 있는 건 수업별 출석 기록이에요. 관리자 대시보드 [결제] > [통계 다운로드]의 [출결 통계]로 수업별 출결 내역을 받고, 진행 중인 수업은 [관리자 기능] > [수업 모니터링]에서 출석을 봅니다.",
        "문자로 보내는 기능은 출결이 아니라 수업 알림 쪽에 있어요. [일반 설정] > [부가가치 서비스]의 스마트 담임 교사를 켜면 학생과 교사에게 수업 알림 문자를 보냅니다.",
        "다른 학원이 출결 문자를 어떻게 보내는지는 학원마다 달라 말씀드리기 어려워요. 쓰시는 문자 서비스와 연결이 필요하면 담당자에게 API 연동 범위를 물어봐 주세요.",
      ],
      "admin",
      ["통계 파일은 어디서 받아요?", "학생이 다시보기를 봤는지 어디서 봐요?", "담당자 상담으로 이어주세요"]
    )
  }
  if (TRIAL_INVITE_RE.test(text)) {
    return make(
      [
        "체험 중에 테스트가 막히면 답답하시죠. 강사는 먼저 클래스인에 가입해 있어야 [기관 관리] > [교사] > [교사 추가]로 등록돼요. 그 선생님이 아직 가입하지 않았을 수 있어요.",
        "그 선생님이 먼저 클래스인 앱에서 가입했는지, 가입한 아이디를 국가번호(+82)까지 그대로 넣었는지 확인해 주세요.",
        "체험 계정에서 넣을 수 있는 인원도 체험 조건에 따라 달라요. 아래 [도입 상담 남기기]로 테스트할 선생님 수를 남겨 주시면 담당자가 체험 범위를 확인해 드립니다.",
      ],
      "demo",
      "onboarding",
      ["무료 체험판 있나요?", "데모를 한번 보고 싶어요", "강사 한 명이 여러 반 맡을 수 있나요?"]
    )
  }
  if (TRIAL_TO_PAID_RE.test(text)) {
    return make(
      [
        "유료 전환은 클래스인 공식 홈페이지에서 메인 관리자로 쓸 아이디로 로그인해 요금제를 고르고, 학원 정보를 입력하는 순서예요. 전환이 끝나면 프로는 바로 정식 서비스가 시작되고, 비즈니스는 체험판으로 시작합니다.",
        "전환한 날 [계정 정보] > [인증 자료]에서 계정 인증까지 올려 주세요. 인증 전에는 녹화와 웹 라이브가 막혀 있어요.",
        "체험 때 만든 코스와 학생 데이터가 그대로 이어지는지는 공개 안내에 나와 있지 않아 단정하지 않을게요. 전환 전에 아래 [도입 상담 남기기]로 확인을 요청해 주세요.",
      ],
      "demo",
      "billing",
      ["프로와 비즈니스 차이가 뭐예요?", "기관 인증이 안 돼요", "견적 구성이 어떻게 되나요?"]
    )
  }
  if (QUOTE_VS_PRICE_RE.test(text)) {
    return make(
      [
        "견적과 홈페이지 가격이 달라 헷갈리셨겠어요. 견적은 실제 구성(전자칠판 대수, 설치 형태, 소프트웨어 범위, 계약 기간)을 반영해 만들기 때문에 홈페이지 기본 안내와 다를 수 있어요.",
        "어느 쪽이 맞다고 제가 단정할 수는 없어서, 견적을 보낸 담당 영업에 '홈페이지 가격과 차이 나는 항목'을 짚어 달라고 요청해 주세요. 아래 [도입 상담 남기기]로 남기셔도 됩니다.",
      ],
      "demo",
      "billing",
      ["견적 구성이 어떻게 되나요?", "데모를 한번 보고 싶어요", "전자칠판 스펙 알려줘"]
    )
  }
  if (SHOWROOM_DEVICE_RE.test(text)) {
    return make(
      [
        "쇼룸에서 써 본 것과 받은 기기의 반응이 다르면 걱정되시죠. 같은 모델이어도 앱 버전, 연결한 네트워크, 화면 테두리 상태 같은 사용 환경에 따라 반응이 달라질 수 있어요.",
        "먼저 화면 테두리(베젤)에 먼지나 물건이 닿아 있지 않은지 보고, 보드의 클래스인을 최신 버전으로 업데이트해 주세요.",
        "그래도 버벅이면 기기 점검이 필요해요. 아래 [실시간 상담 연결]로 받은 모델과 증상을 알려 주시면 담당자가 확인해 드립니다.",
      ],
      "support",
      "hardware",
      ["전자칠판 터치가 안 돼요", "전자칠판 스펙 알려줘", "전자칠판 보증 기간이 궁금해요"]
    )
  }
  if (ZOOM_WEAKNESS_RE.test(text)) {
    return direct(
      [
        "솔직하게 말씀드릴게요. 다른 서비스와 우열을 단정하기보다, 도입 전에 따져 보셔야 할 점을 공개 안내 기준으로 정리하면 이래요.",
        "- 기능이 많은 만큼 처음 익히는 데 시간이 걸려요. 강사 교육과 첫 몇 주의 세팅이 필요합니다.\n- 앱을 설치해서 쓰고, PC는 윈도우 7 이상·인터넷 2Mbps 이상이 최소 사양이에요. 수업을 녹화하는 강사는 인터넷 4Mbps 이상과 더 높은 사양이 필요합니다.\n- 녹화와 웹 라이브는 유료 요금제와 계정 인증을 마쳐야 열려요.\n- 결제, 오프라인 출석, 고급 리포트는 별도 시스템이나 API 연동으로 나눠 설계하는 편이에요.",
        "반대로 판서·녹화·과제·관리자 데이터를 한 흐름으로 묶어 학원 운영에 쓰려는 목적이라면 그 부분이 강점이에요. 수업 방식에 맞는지는 데모로 직접 보시길 권해요.",
      ],
      "consultation",
      ["데모를 한번 보고 싶어요", "도입하면 뭐부터 해요?", "견적 구성이 어떻게 되나요?"]
    )
  }
  if (PERSONAL_USE_RE.test(text)) {
    return make(
      [
        "네, 학원 소속이 아니어도 개인 과외 강사로 쓸 수 있어요. 공식 안내 기준으로 1인 강사는 프로(Pro) 요금제를 추천하고, 계정 인증 때 인증 방식에서 [개인 교사]를 고르는 방식이 따로 있습니다.",
        "가격은 쓰실 기능과 규모에 따라 달라 여기서 단정하지 않을게요. 아래 [도입 상담 남기기]로 개인 과외 용도와 학생 수를 남겨 주시면 맞는 요금제를 안내해 드려요.",
      ],
      "demo",
      "billing",
      ["무료 체험판 있나요?", "기관 인증이 안 돼요", "견적 구성이 어떻게 되나요?"],
      "Yes—solo tutors can use ClassIn; the Pro plan is the one recommended for a single teacher, and you pick [개인 교사] (individual teacher) during account verification. The price is quoted in a consultation, so leave a request below."
    )
  }
  if (INVOICE_MISSING_RE.test(text)) {
    return make(
      [
        "이번 달 계산서가 아직 안 보이시는군요. 발행됐는지는 이 채팅에서 바로 확인할 수 없어서, 먼저 이것부터 봐 주세요.",
        "1. 계산서를 받기로 한 이메일의 받은편지함과 스팸함을 확인합니다.\n2. 학원 회계 담당자분이 다른 메일 주소로 받기로 하셨는지 확인합니다.",
        "메일에도 없으면 아래 [실시간 상담 연결]에 '몇 월분 세금계산서 발행 확인'이라고 남겨 주세요. 담당자가 발행 상태를 확인해 안내해 드립니다. 사업자 정보는 채팅창에 적지 않으셔도 돼요.",
      ],
      "support",
      "billing",
      ["영수증은 어디서 받나요?", "환불 규정이 어떻게 되나요?", "담당자 상담으로 이어주세요"]
    )
  }
  if (PAYMENT_FAIL_RE.test(text)) {
    return make(
      [
        "결제 실패 문자를 받으셨다면 걱정되셨겠어요. 결제가 안 됐을 때 수업이 언제부터 어떻게 제한되는지는 계약과 결제 방식마다 달라서 여기서 단정하지 않을게요.",
        "결제 카드 변경은 학원 계정의 결제 정보를 담당자가 확인해야 해요. 아래 [실시간 상담 연결]에 '결제 카드 변경·결제 실패 확인'이라고 남겨 주세요. 수업 일정이 가까우면 그것도 함께 알려 주시면 먼저 확인해 드립니다.",
        "카드 번호 같은 결제 정보는 채팅창에 적지 마세요.",
      ],
      "support",
      "billing",
      ["영수증은 어디서 받나요?", "환불 규정이 어떻게 되나요?", "담당자 상담으로 이어주세요"]
    )
  }
  // 이 답은 견적서를 받았다는 전제로 쓴 답이다. "부가세 별도인가요?"처럼 견적을 말하지 않은 질문은 기본 사실 답이 맡는다.
  if (VAT_RE.test(text) && /견적/.test(text)) {
    return make(
      [
        "견적서에 부가세 포함인지 별도인지 적혀 있지 않았다니 헷갈리셨겠어요. 그 부분은 분명히 적혀 있어야 하는 게 맞습니다.",
        "부가세 포함 여부는 그 견적서를 만든 담당자가 확정해 드려야 해서 제가 단정하지 않을게요. 아래 [도입 상담 남기기]에 '견적서 부가세 포함 여부 확인'이라고 남겨 주시면, 담당자가 표기를 바로잡은 견적서로 다시 안내드립니다.",
      ],
      "demo",
      "billing",
      ["견적 구성이 어떻게 되나요?", "영수증은 어디서 받나요?", "데모를 한번 보고 싶어요"]
    )
  }
  if (DISCOUNT_RE.test(text)) {
    return make(
      [
        /맞춰|맞출|맞추/.test(text)
          ? "다른 회사 견적에 맞춰 드릴 수 있는지도, 할인율이나 약정 조건도 제가 채팅에서 정하거나 약속드릴 수 없어요. 가격은 학원 규모와 구성을 보고 영업 담당자가 견적 상담에서 정합니다."
          : "할인율이나 약정 조건은 제가 채팅에서 약속드릴 수 없어요. 학원 규모와 구성, 약정 기간을 보고 견적 상담에서 정해집니다.",
        "견적을 빨리 받으시려면 아래 [도입 상담 남기기]에 이것만 남겨 주세요.\n- 학생 수와 강사 수, 동시에 여는 수업 수\n- 전자칠판이 필요한 교실 수와 설치 형태(벽걸이·스탠드)\n- 검토 중인 약정 기간과 비교 중인 조건",
        "다른 회사 조건과 견줘 보시는 건 당연해요. 받으신 조건을 담당자에게 그대로 알려 주시면 그 기준으로 비교해 안내드립니다.",
      ],
      "demo",
      "billing",
      ["견적 구성이 어떻게 되나요?", "데모를 한번 보고 싶어요", "전자칠판 스펙 알려줘"]
    )
  }
  if (TRIAL_FEATURE_LOCK_RE.test(text)) {
    return make(
      [
        "체험해 보시는데 녹화 버튼이 잠겨 있으면 답답하셨겠어요. 녹화와 웹 라이브는 유료 요금제를 결제하고 계정 인증까지 마친 학원에서 열리는 기능이라, 체험 계정에서는 잠겨 보일 수 있어요.",
        "녹화까지 직접 보고 결정하실 수 있게 아래 [도입 상담 남기기]에 '체험 중 녹화 기능 확인 요청'이라고 남겨 주세요. 담당자가 데모로 녹화·다시보기 흐름을 보여 드리거나 체험 범위를 넓힐 수 있는지 안내드립니다.",
        "목동 쇼룸(/showroom)에서 녹화부터 다시보기까지 직접 해 보실 수도 있어요.",
      ],
      "demo",
      "onboarding",
      ["데모를 한번 보고 싶어요", "쇼룸 방문은 어떻게 예약해요?", "무료 체험판 있나요?"]
    )
  }
  if (SHOWROOM_RE.test(text) && SHOWROOM_CONFIRM_RE.test(text)) {
    return make(
      [
        "쇼룸 예약 확정 문자가 아직 안 오셨군요. 확정 연락이 없으면 예약이 아직 확정되지 않았을 수 있어서, 그냥 오셔도 된다고 말씀드리기는 어려워요.",
        "헛걸음하시지 않도록 방문 전에 아래 [실시간 상담 연결]에 '쇼룸 방문 예약 확인'이라고 남겨 주세요. 담당자가 예약 상태를 확인해 드립니다.",
      ],
      "support",
      "onboarding",
      ["쇼룸 방문은 어떻게 예약해요?", "데모를 한번 보고 싶어요", "전자칠판 스펙 알려줘"]
    )
  }
  if (QUOTE_FIX_RE.test(text)) {
    return make(
      [
        "견적서가 요청하신 내용과 다르게 왔다면 담당자가 바로 고쳐 다시 보내 드려요. 번거롭게 해 드려 죄송합니다.",
        "아래 [도입 상담 남기기]로 견적서를 받은 날짜와 바꿀 내용(예: 전자칠판 3대)을 남겨 주세요.",
      ],
      "demo",
      "billing",
      ["견적 구성이 어떻게 되나요?", "전자칠판 스펙 알려줘", "데모를 한번 보고 싶어요"]
    )
  }
  if (SHOWROOM_RE.test(text) && !/폼|양식|제출|버튼/.test(text)) {
    const showroomLead = SHOWROOM_OTHER_DETAIL_RE.test(text)
      ? null
      : SHOWROOM_LOCATION_RE.test(text)
        ? SHOWROOM_LOCATION_ANSWER
        : SHOWROOM_BOOKING_RE.test(text)
          ? SHOWROOM_BOOKING_ANSWER
          : null
    return make(
      [
        showroomLead ??
          "Classin Board는 목동 쇼룸에서 직접 보고 써 보실 수 있어요. 방문은 홈페이지 쇼룸 예약(/showroom)에서 날짜를 고르시면 됩니다.",
        FAR_REGION_RE.test(text)
          ? "목동까지 오시기 어려우시면 아래 [도입 상담 남기기]로 지역을 남겨 주세요. 담당자가 온라인 데모 등 볼 수 있는 방법을 안내드려요."
          : "여러 분이 함께 보실 예정이면 예약할 때 인원을 적어 주세요.",
        "도입 조건이나 견적이 궁금하시면 아래 [도입 상담 남기기]로 남겨 주세요. 담당자가 방문 전에 안내드립니다.",
      ],
      "demo",
      "onboarding",
      ["데모를 한번 보고 싶어요", "전자칠판 스펙 알려줘", "견적 구성이 어떻게 되나요?"]
    )
  }

  // 첫 방문자가 한 줄로 묻는 기본 사실 질문(회사·대표, 전자칠판 필수 여부, 지원 기기, 한도, 원가·고객사 등).
  // 위의 좁은 정해 둔 답이 모두 빗나갔을 때만 본다. 두 가지를 함께 물었으면 두 답을 이어 붙인다.
  // "본사랑 통화하고 싶어요"처럼 사람 연결을 바라는 말은 기본 사실 답이 아니라 상담 연결이 맡는다.
  const basics = wantsImmediateHumanHandoff(question) ? [] : findBasicQuickAnswers(text)
  if (basics.length > 0) {
    const [first, second] = basics
    const handoff = first.handoff ?? second?.handoff
    // 두 답을 이을 때 상담 연결 안내 문단이 두 번 나오지 않게, 앞 답의 마지막 안내 문단은 뺀다.
    // 둘째 답 첫머리의 "네, "·"아니요, "도 뺀다(답 한가운데에 대답 말이 다시 나오지 않게).
    const firstParagraphs =
      second && first.handoff && second.handoff && first.answer.length > 1 ? first.answer.slice(0, -1) : first.answer
    const secondParagraphs = second
      ? [second.answer[0].replace(/^(?:네|아니요),\s*/, ""), ...second.answer.slice(1)]
      : []
    const paragraphs = second ? [...firstParagraphs, ...secondParagraphs] : first.answer
    const suggestedQuestions = Array.from(
      new Set([...first.suggestedQuestions, ...(second?.suggestedQuestions ?? [])])
    ).slice(0, 3)
    const quick = handoff
      ? make(paragraphs, handoff, first.category, suggestedQuestions)
      : direct(paragraphs, first.category, suggestedQuestions)
    // 답이 기대는 공개 문서를 출처로 단다(답 ↔ 문서 데이터셋 연결).
    quick.response.sources = basics.flatMap((entry) => {
      const source = entry.docPath ? buildBasicsDocSource(entry.docPath, entry.docHeading) : null
      return source ? [source] : []
    })
    return { ...quick, topicId: first.id, suppressSalesFollowUp: !first.salesFollowUp, gateOriginal: `basics:${first.id}` }
  }
  return null
}

// 기본 사실 답의 근거 문서(/docs/<category>/<slug>)를 출처로 만든다. 문서가 공개 목록에 없으면 달지 않는다.
function buildBasicsDocSource(docPath: string, heading = "요약"): ChatbotSource | null {
  const doc = getFallbackDocsFromStatic().find((candidate) => getDocPath(candidate) === docPath)
  if (!doc) return null
  return {
    title: doc.title,
    heading,
    urlPath: docPath,
    category: getDocCategory(doc),
    excerpt: compactText(doc.chatbotSummary || doc.description),
    score: 300,
  }
}

// 증상 트리아지 답변처럼 이미 최종본인 결정형 응답. stream 경로에서도 Gemini 재작성을 건너뛴다.
const deterministicFinalResponses = new WeakSet<object>()

function resolveSymptomTriageForQuestion(
  routingText: string,
  csFigmaGuide: CsFigmaGuide | null
): SymptomTriageResult | null {
  const tone = detectConversationTone(routingText)
  // 짧게 묻거나 화가 난 사람에게는 단계 3개만(이미 여러 번 해 봤을 가능성이 크다).
  const triage = resolveSymptomTriage(routingText, {
    compact: (tone.terse || tone.angry || tone.repeated) && !tone.anxious,
    upset: tone.angry || tone.repeated,
  })
  if (!triage) return null
  const isKnownFigmaIntent =
    csFigmaGuide !== null && findCsFigmaKnownIntentSlug(routingText) === csFigmaGuide.slug
  if (isKnownFigmaIntent && !triage.overridesKnownIntent) return null
  return triage
}

const PRIOR_SUBJECT_HINTS: [RegExp, string, string][] = [
  [/카메라|camera/i, "카메라", "카메라가 안 켜져요"],
  [/마이크|mic/i, "마이크", "마이크가 안 돼요"],
  [/소리|sound|audio/i, "소리", "소리가 안 나요"],
  [/미러링|띄우|캐스트/, "미러링", "미러링이 안 돼요"],
  [/녹화|record/i, "녹화", "녹화가 안 돼요"],
  [/로그인|login/i, "로그인", "로그인이 안 돼요"],
  [/끊|튕|disconnect/i, "끊김", "수업 중에 계속 튕겨요"],
]

function buildPriorContextClarifyResponse(
  routingText: string
): Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> {
  const hint = PRIOR_SUBJECT_HINTS.find(([pattern]) => pattern.test(routingText))
  const hintTriage = hint ? resolveSymptomTriage(hint[2], { compact: true }) : null
  const hintSteps = hintTriage?.answer.split("\n").filter((line) => /^\d\. /.test(line)).slice(0, 3) ?? []
  const response = {
    answer: [
      PRIOR_INQUIRY_LINE,
      "어떤 문제가 다시 생겼는지 한 줄로만 알려 주시겠어요? 예: '카메라가 안 켜져요', '수업이 자꾸 끊겨요'.",
      hint && hintSteps.length > 0 ? `${hint[1]} 문제라면 먼저 이것부터 해 보세요.\n${hintSteps.join("\n")}` : null,
      "바로 사람과 이어서 보시려면 아래 [실시간 상담 연결]을 눌러 주세요.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    answerMode: "clarifying_question" as const,
    confidence: 0.55,
    needsHandoff: true,
    sources: [],
    suggestedQuestions: hint ? [hint[2], "담당자 상담으로 이어주세요", "에러나요"] : ["카메라가 안 켜져요", "수업 중에 계속 튕겨요", "담당자 상담으로 이어주세요"],
    unresolved: true,
  }
  deterministicFinalResponses.add(response)
  return response
}

function buildSymptomTriageResponse(
  triage: SymptomTriageResult
): Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> {
  const response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> = {
    answer: sanitizePublicAnswerText(triage.answer),
    answerMode: triage.answerMode,
    confidence: triage.confidence,
    needsHandoff: triage.needsHandoff,
    sources: triage.source ? [triage.source] : [],
    suggestedQuestions: triage.suggestedQuestions,
    unresolved: triage.answerMode !== "direct_answer",
  }
  deterministicFinalResponses.add(response)
  return response
}

function isCuratedTemplateQuestion(question: NormalizedQuestion) {
  return (
    isHardwareSpecsQuestion(question) ||
    isHardwareBoardLineupQuestion(question) ||
    isHardwareTroubleQuestion(question) ||
    isHardwareUnconfirmedDetailQuestion(question) ||
    isLoginTroubleQuestion(question) ||
    isLiveClassTroubleQuestion(question) ||
    isWebLiveBillingQuestion(question) ||
    isPricingInfoQuestion(question) ||
    isSoftwarePricingQuestion(question) ||
    isTrialOrPilotQuestion(question) ||
    isInstallFormQuestion(question) ||
    isCoreFeatureYesNoQuestion(question) ||
    isParentReportOrNotificationQuestion(question) ||
    isPreAdoptionSpecificQuestion(question) ||
    isPreAdoptionCheckQuestion(question) ||
    isGoogleClassroomQuestion(question) ||
    isSiteEntryIntegrationQuestion(question) ||
    isS65QuoteQuestion(question) ||
    isBoardOnlyOrPlatformQuestion(question) ||
    isCameraConflictQuestion(question) ||
    isReceiptQuestion(question) ||
    ((isComparisonQuestion(question) || isIdentityQuestion(question)) && !isApiIntegrationQuestion(question))
  )
}

// 최종 답변에 모델을 어떻게 쓸지 정하는 운영 스위치(CHATBOT_FINAL_ANSWER_LLM). 검색과 임베딩은 어느 값에서나 그대로 쓴다.
// - select(기본): 모델은 문서에서 답이 되는 문장만 고르고, 답은 그 문장 그대로 나간다. 답 문장이 없으면 못 찾았다고 답한다.
// - generate: 고른 문장을 근거로 모델이 답을 다시 쓴다(상담 말투). 근거 밖 내용이 섞일 수 있다.
// - off: 모델을 쓰지 않는다. 정해 둔 답과 문서 요약 초안만 나간다.
// 기본값을 select 로 둔 근거는 docs/active/chatbot-first-contact-audit-2026-11-13.md 의 측정 결과다.
// 정해 둔 답 확인 관문은 CHATBOT_ANSWER_GATE(기본 on, off 로 끔)와 CHATBOT_ANSWER_GATE_TIMEOUT_MS(기본 3000)로 조정한다.
// off 모드에서는 관문도 모델을 부르지 않는다(lib/chatbot/answer-gate.ts).
type FinalAnswerLlmMode = "select" | "generate" | "off"

function getFinalAnswerLlmMode(): FinalAnswerLlmMode {
  const value = process.env.CHATBOT_FINAL_ANSWER_LLM?.trim().toLowerCase()
  if (value === "off") return "off"
  if (value === "generate") return "generate"
  return "select"
}

type EvidenceSelectionOutcome =
  // skipped: 선별 대상이 아님(정해 둔 초안·상담 연결·출처 없음) / failed: 모델 호출 실패 / not_found: 답 문장 없음
  | { status: "skipped" | "failed" | "not_found" }
  | { status: "selected"; evidenceSources: ChatbotSource[] }

// 고른 문장을 그대로 이어 붙인 답의 길이 상한. 절차가 중간에 잘리지 않게 모델 답(520자)보다 넉넉히 둔다.
const MAX_SELECTED_ANSWER_LENGTH = 640
// generate 모드는 선별 뒤에 답 생성이 이어지므로, 라우트 예산(13초) 안에 들도록 선별 예산을 줄인다.
const GENERATE_MODE_SELECTION_TIMEOUT_MS = 2_000

function getSourceKey(source: ChatbotSource) {
  return source.chunkId ?? `${source.urlPath}:${source.heading ?? ""}`
}

// 최종 출처(답·초안의 근거)를 앞에 두고, 검색이 넘긴 후보를 겹치지 않게 뒤에 붙인다.
function buildEvidenceCandidates(sources: ChatbotSource[], evidencePool: ChatbotSource[] = []) {
  const seen = new Set<string>()
  const candidates: ChatbotSource[] = []
  for (const source of [...sources, ...evidencePool]) {
    const key = getSourceKey(source)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(source)
    if (candidates.length >= EVIDENCE_POOL_SIZE) break
  }
  return candidates
}

// 고른 문장을 문서에 있던 순서대로 잇는다. 같은 출처에서 바로 이어지는 문장은 한 문단으로 묶는다.
function formatSelectedEvidenceAnswer(
  picked: EvidenceSentence[],
  question: NormalizedQuestion,
  category: string,
  answerMode: AnswerMode
) {
  // 문단 묶기는 답 색인 doc 카드 답과 같은 규칙(lib/chatbot/answer-index/paragraphs.ts)이다.
  const paragraphs = groupSentenceParagraphs(
    picked.map((sentence) => ({ group: sentence.sourceIndex, id: sentence.id, text: sentence.text }))
  )

  const body = clampAnswerToLength(paragraphs.join("\n\n"), MAX_SELECTED_ANSWER_LENGTH)
  const nextStep = getContextualNextStep(question, category)
  return [body, answerMode === "handoff" ? HANDOFF_CAUTION_LINE : null, nextStep ? `다음으로는 ${nextStep}` : null]
    .filter(Boolean)
    .join("\n\n")
}

/**
 * 근거 선별. 검색 조각으로 만든 초안에만 적용한다.
 * - 답이 되는 문장이 있으면 그 문장으로 답을 바꾸고(문서 문장 그대로), 답에 쓴 문서만 출처로 남긴다.
 * - 없으면 엉뚱한 조각을 답으로 내보내지 않고 못 찾았다고 밝힌다(unresolved 로 남아 문서 보강 대상이 된다).
 * - 모델 호출이 실패하면 초안을 그대로 둔다.
 */
async function applyEvidenceSelection(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  category: string,
  evidencePool: ChatbotSource[] | undefined,
  timeoutMs?: number
): Promise<EvidenceSelectionOutcome> {
  if (!excerptDraftResponses.has(response)) return { status: "skipped" }
  const isHandoff = response.answerMode === "handoff"
  if (response.answerMode !== "direct_answer" && response.answerMode !== "doc_suggestion" && !isHandoff) {
    return { status: "skipped" }
  }

  const candidates = buildEvidenceCandidates(response.sources, evidencePool)
  const sentences = buildEvidenceSentences(candidates)
  if (sentences.length === 0) return { status: "skipped" }

  const ids = await selectAnsweringSentenceIds({ question: question.redacted, sentences, timeoutMs })
  if (ids === null) return { status: "failed" }

  if (ids.length === 0) {
    if (isHandoff) {
      // 상담을 청한 질문인데 붙일 문서 문장이 없으면, 엉뚱한 조각 대신 출처 없는 상담 연결 답으로 바꾼다.
      const withoutSources = composeAnswer(question, [], category)
      response.answer = withoutSources.answer
      response.confidence = withoutSources.confidence
      response.sources = []
      return { status: "not_found" }
    }
    response.answer = WEAK_SOURCE_DRAFT_ANSWER
    response.answerMode = "doc_suggestion"
    response.confidence = Math.min(response.confidence, 0.3)
    response.needsHandoff = false
    response.unresolved = true
    response.sources = []
    return { status: "not_found" }
  }

  const picked = sentences.filter((sentence) => ids.includes(sentence.id))
  const usedIndexes = Array.from(new Set(picked.map((sentence) => sentence.sourceIndex)))
  // generate 모드에서 모델에게 넘길 근거. 고른 문장만 담아, 고르지 않은 문장을 끌어다 쓰지 않게 한다.
  const evidenceSources = usedIndexes.map((index) =>
    attachGroundingText(
      { ...candidates[index] },
      picked
        .filter((sentence) => sentence.sourceIndex === index)
        .map((sentence) => sentence.text)
        .join(" ")
    )
  )

  response.answer = formatSelectedEvidenceAnswer(picked, question, category, response.answerMode)
  response.sources = usedIndexes.map((index) => candidates[index]).slice(0, MAX_SOURCES)
  // 상담 연결 답은 모드와 연결 표시를 그대로 두고 본문만 바꾼다.
  if (!isHandoff) {
    response.answerMode = "direct_answer"
    response.confidence = Math.max(response.confidence, 0.72)
    response.needsHandoff = false
    response.unresolved = false
  }
  return { status: "selected", evidenceSources }
}

// 낱말 목록 밖 질문(검색 관문을 새로 통과한 질문)은 근거 선별이 답 문장을 골라 준 경우에만 문서 문장을 쓴다.
// 선별이 꺼져 있으면(모델 끔·키 없음·모델 없는 평가) 검색 조각이 질문과 맞는지 알 수 없으므로 조각 대신 못 찾았다고 답한다.
// 모델이 켜져 있는데 선별 호출이 실패했으면 낱말 목록 안팎을 가리지 않고 조각을 내보내지 않는다(MODEL_UNAVAILABLE_ANSWER).
const CURATED_SOURCE_MIN_SCORE = 240

// 모델이 켜져 있는데(CHATBOT_FINAL_ANSWER_LLM 이 off 가 아니고 키가 있음) 근거 선별 호출이 실패했을 때의 답.
// 2026-11-18 Gemini 결제 크레딧이 떨어져 모든 호출이 402 로 실패하자, 처음 보는 질문 90개 중 46건이 확인되지 않은 검색 조각을
// 그대로 답으로 냈고 그중 38건이 엉뚱한 답이었다(로그인 번호 형식 안내 ← 'IP 대역 지정'). 모델이 죽은 것이지 문서에 없는 것이
// 아니므로 '못 찾음'(NO_SOURCE_FACT_ANSWER)과 구별하고, 상담 버튼을 띄운다(answerMode=handoff, needsHandoff).
export const MODEL_UNAVAILABLE_ANSWER = [
  "지금은 안내 문서에서 답을 확인하지 못했어요. 추측해서 답하지는 않을게요.",
  "잠시 뒤 다시 물어봐 주시거나, 아래 상담 버튼으로 남겨 주시면 담당자가 확인해 안내해 드려요.",
].join("\n\n")

// MODEL_UNAVAILABLE_ANSWER 로 바꾼 답. 두 번째 검색이 '못 찾음'으로 보고 모델을 또 부르지 않게 한다.
const modelUnavailableResponses = new WeakSet<object>()

/** 공개 경로에서 최종 답 모델(근거 선별)이 켜져 있는지. 꺼져 있으면 선별 결과가 'failed'여도 모델이 죽은 것이 아니다. */
function isFinalAnswerModelEnabled() {
  return getFinalAnswerLlmMode() !== "off" && Boolean(process.env.GEMINI_API_KEY?.trim())
}

/** 답을 확인하지 못해 추측하지 않겠다고 밝힌 고정 답인지. 말투 층이 앞에 첫마디를 붙여도 알아보게 첫 문단으로 본다. */
function isUnverifiedFixedAnswer(answer: string) {
  return [MODEL_UNAVAILABLE_ANSWER, SYMPTOM_AFTER_GATE_ANSWER].some((fixed) => answer.includes(fixed.split("\n\n")[0]))
}

function applyModelUnavailableAnswer(response: CoreResponse) {
  response.answer = MODEL_UNAVAILABLE_ANSWER
  response.answerMode = "handoff"
  response.confidence = Math.min(response.confidence, 0.2)
  response.needsHandoff = true
  response.unresolved = true
  response.sources = []
  modelUnavailableResponses.add(response)
  // 모델이 정상이면 다른 답이 나오므로 답 캐시에 넣지 않는다.
  selectionFailedResponses.add(response)
}

function withholdUnverifiedDraft(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  selectionStatus: EvidenceSelectionOutcome["status"] | undefined,
  internal: boolean,
  conversation?: ConversationTrace
): boolean {
  if (internal || selectionStatus === "selected" || selectionStatus === "not_found") return false
  // 관문이 정해 둔 답을 버리고 근거 선별까지 마친 답(문서 문장 또는 못 찾음)은 이미 확인된 최종본이다.
  if (gateDocumentResponses.has(response)) return false
  // 검색 조각 초안뿐 아니라, 점수가 낮은 검색 결과의 섹션 제목에 걸린 정해 둔 문장(예: '가입과 개인정보' → 가입 안내)도
  // 질문과 맞는지 확인되지 않았다. 큐레이션 출처(점수 240 이상)만 그대로 둔다.
  const topScore = response.sources[0]?.score
  const unverified = excerptDraftResponses.has(response) || (topScore !== undefined && topScore < CURATED_SOURCE_MIN_SCORE)
  if (!unverified) return false
  // 모델이 켜져 있는데 선별 호출이 실패(HTTP 오류·시간 초과·응답 해석 실패)했다: 상담 연결 초안이어도 조각을 내보내지 않는다.
  if (selectionStatus === "failed" && isFinalAnswerModelEnabled()) {
    applyModelUnavailableAnswer(response)
    return true
  }
  if (response.answerMode === "handoff") return false
  // 문서 페이지에서 그 문서를 가리킨 질문("방금 본 내용 정리해 줘")은 첫 출처가 고객이 가리킨 문서라 질문과 맞는지 알 수 있다.
  if (conversation?.pagePath && response.sources[0]?.urlPath === conversation.pagePath) return false
  if (!isOutsideKnownVocabulary(question)) return false
  response.answer = NO_SOURCE_FACT_ANSWER
  response.answerMode = "doc_suggestion"
  response.confidence = Math.min(response.confidence, 0.3)
  response.needsHandoff = false
  response.unresolved = true
  response.sources = []
  return true
}

// generate 모드에서만 모델이 답을 다시 쓴다. 답 문장을 못 찾았거나 선별 호출이 실패했으면 쓰지 않는다.
function shouldGenerateAfterSelection(mode: FinalAnswerLlmMode, selection: EvidenceSelectionOutcome) {
  return mode === "generate" && (selection.status === "selected" || selection.status === "skipped")
}

function shouldUseAiFinalAnswer(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  category: string
) {
  if (getFinalAnswerLlmMode() === "off") return false
  if (deterministicFinalResponses.has(response)) return false
  // 낱말 목록 밖 질문도 검색에서 강한 근거를 찾았으면 근거 선별을 거친다. 출처가 없으면 모델을 부르지 않는다.
  if (category === "general" && !isDomainRelatedQuestion(question, category) && response.sources.length === 0) return false
  if (wantsImmediateHumanHandoff(question)) return false
  if (response.answerMode === "clarifying_question" && question.tokens.length < 2) return false
  if (response.answerMode === "direct_answer" && isCsFigmaGuideResponse(response)) return false
  // 큐레이션 직답은 이미 최종본 — Gemini 재작성(0.8~4.5s)을 건너뛰고 그대로 내보낸다.
  if (response.answerMode === "direct_answer" && isCuratedTemplateQuestion(question)) return false
  if (isRefundQuestion(question) || isReceiptQuestion(question) || isAccountPlanOrTrialLimitQuestion(question)) return false
  return true
}

function applyGeneratedFinalAnswer(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  category: string,
  answer: string
) {
  const wasRecoverableFallback = shouldUseInferredAnswerFallback(response, question, category)
  response.answer = sanitizePublicAnswerText(answer)

  if (response.answerMode === "handoff") {
    response.unresolved = true
    response.needsHandoff = true
    response.confidence = Math.max(response.confidence, 0.5)
    return
  }

  if (response.answerMode === "doc_suggestion" || wasRecoverableFallback) {
    response.answerMode = "direct_answer"
    response.unresolved = false
    response.needsHandoff = false
    response.confidence = Math.max(response.confidence, response.sources.length > 0 ? 0.72 : 0.55)
    response.suggestedQuestions = buildSuggestedQuestions(category)
  }
}

function finalizeAnswer(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
) {
  response.answer = sanitizePublicAnswerText(response.answer)

  // `[LEAD_SUBMIT:...]` 토큰은 더 이상 리드를 만들지 않는다 — 본문에서 지우고 경고만 남긴다.
  // 챗봇 리드는 상담 연결 → /contact?source=chatbot → /api/lead(submitLeadCapture)로만 접수된다.
  const leadToken = stripLeadSubmitTokens(response.answer ?? "")
  if (leadToken.stripped) {
    response.answer = leadToken.answer
    console.warn("[chatbot] LEAD_SUBMIT token stripped from answer; leads go through /contact?source=chatbot only.")
  }

  // 콘텐츠 추천 토큰 처리 ([CONTENT_SUGGEST:type=...,slug=...,title=...])
  if (response.answer && response.answer.includes("[CONTENT_SUGGEST:")) {
    const suggestRegex = /\[CONTENT_SUGGEST:type=(blog|resource|case),slug=([^,\n\]]+),title=([^,\n\]]+)\]/gi
    let match;
    const suggested: SuggestedContent[] = []
    
    while ((match = suggestRegex.exec(response.answer)) !== null) {
      const [, type, slug, title] = match
      const cleanType = type.trim() as "blog" | "resource" | "case"
      const cleanSlug = slug.trim()
      const cleanTitle = title.trim()
      const url = cleanType === "blog" ? `/blog/${cleanSlug}` : cleanType === "resource" ? `/resources/${cleanSlug}` : `/events/${cleanSlug}`
      suggested.push({
        type: cleanType,
        slug: cleanSlug,
        title: cleanTitle,
        url,
      })
    }
    
    if (suggested.length > 0) {
      response.suggestedContent = suggested
    }
    
    // 사용자 답변 텍스트에서 토큰 삭제
    response.answer = response.answer.replace(suggestRegex, "").trim()
  }
}

function shouldExposeSources(input: ChatbotQueryRequest) {
  const context = getContextObject(input.context)
  return process.env.CHATBOT_SHOW_SOURCES === "1" || context.showSources === true
}

function isCsFigmaGuideResponse(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
) {
  return response.sources.some((source) => source.heading === CS_FIGMA_GUIDE_SOURCE_HEADING)
}

export function normalizeSessionHistoryForGemini(
  rows: Array<{ role: string; content: string }>
): { role: "user" | "model"; parts: { text: string }[] }[] {
  const mapped = rows.map((msg) => ({
    role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: msg.content }],
  }))

  // 교차 대화 필터링 (user, model, user, model 순서 유지)
  const cleanHistory: { role: "user" | "model"; parts: { text: string }[] }[] = []
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
  return cleanHistory
}

// 세션 대화 이력 로드 — 검색과 병렬로 돌릴 수 있게 분리. 실패해도 빈 배열로 안전 폴백.
//
// 보안(심층 방어): ensureSession 의 소유권 검사와 별개로, 이력 로드 자체도
// 호출자의 anonymous_id 가 세션 owner 와 일치할 때만 수행한다. 일치하지 않으면
// 빈 이력을 돌려 남의 대화가 Gemini 프롬프트로 새어 들어가지 못하게 막는다.
// null-owner 규칙은 ensureSession 과 동일(둘 다 동일한 non-null 값일 때만 소유 인정).
async function loadSessionHistory(
  sessionId: string,
  callerAnonymousId?: string | null
): Promise<{ role: "user" | "model"; parts: { text: string }[] }[]> {
  if (!hasSupabaseServerEnv()) return []
  try {
    const supabase = createSupabaseAdminClient()

    const owner = normalizeString(callerAnonymousId) ?? null
    // owner 가 없는(null) 호출자는 어떤 세션의 이력도 로드할 수 없다 — fail-safe.
    if (owner === null) return []

    const { data: session } = await supabase
      .from("chat_sessions")
      .select("anonymous_id")
      .eq("id", sessionId)
      .maybeSingle()

    // 세션이 없거나(owner 미확인) owner 가 불일치하면 이력을 노출하지 않는다.
    const sessionOwner = (session?.anonymous_id as string | null) ?? null
    if (sessionOwner === null || sessionOwner !== owner) return []

    const { data, error } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(10) // 최근 10개 메세지 (사용자 5, 어시스턴트 5)

    if (error || !data) return []

    return normalizeSessionHistoryForGemini([...data].reverse())
  } catch (e) {
    console.warn("[chatbot] failed to load session history:", e)
    return []
  }
}

// 검색 → 답변 구성 → 필요 시 Gemini 답변 생성까지의 코어. 영속화(persistExchange)는 포함하지 않는다.
// handleChatbotQuery(실서비스)와 evaluateChatbotQuery(품질 평가)가 공유한다.
// 질문의 감정·형식 신호에 맞춰 공감 한마디·영어 요약·상담 연결을 붙인다. 여러 번 불러도 결과가 같다.
// 보안·남용 거절 답변에는 붙이지 않는다.
function applyConversationTone(core: ChatbotCore) {
  // 말투(감정·형식 신호)는 이번 말로 본다. 대화 맥락으로 넓힌 검색용 질문(core.question)에는 직전 질문의 신호가 섞여 있다.
  const said = core.utterance ?? core.question
  const text = said.redacted.toLowerCase()
  if (isPromptOrSecurityAbuse(text) || CRIMINAL_ABUSE_RE.test(text) || TOKEN_WASTE_RE.test(text)) return
  if (isGreetingOnly(said)) return
  const tone = detectConversationTone(said.redacted)
  // 같은 대화의 앞 턴을 가리킨 말("아까 그거", "또 안 돼요")이고 직전 턴으로 답했으면 "지난 대화는 볼 수 없어요"를 붙이지 않는다.
  if (core.conversation?.expanded && tone.priorKind === "same_chat") {
    tone.priorContext = null
    tone.priorKind = null
  }
  // 지난 문의를 전제로 한 질문은 "볼 수 없다"는 줄만 붙이고, 상담 연결은 화난·반복 문의일 때만 앞세운다.
  // 이미 상담원 대기 중이라고 항의하는 사람에게 "지금 바로 연결해 드릴게요"를 또 약속하지 않는다.
  const waitingForAgent = /대기\s*(?:순번|번호|중)|순번|상담원\s*연결을?\s*(?:눌렀|했는데|했더니)/.test(text)
  const offerHandoff = !waitingForAgent && ((tone.angry && !core.howtoAnswer) || tone.repeated)
  core.response.answer = applyToneToAnswer(core.response.answer, tone, {
    englishSummary: core.englishSummary,
    offerHandoff,
    mentionsRefund: /환불|보상|배상/.test(text),
  })
  if (offerHandoff) {
    core.response.needsHandoff = true
    core.handoffIntent = "support"
  }
  // 지난 문의·통화를 이어 가려는 사람에게는 상담 연결 버튼을 띄운다(답에서 그 버튼을 가리킨다).
  if (tone.priorContext === "inquiry") core.response.needsHandoff = true
  // 답을 확인하지 못했다고 밝힌 고정 답(모델 호출 실패 등)에는 규모·도입 시기 같은 끝 질문을 붙이지 않는다.
  if (isUnverifiedFixedAnswer(core.response.answer)) return
  // 질문 주도: 정보가 부족하거나 오해 여지가 있거나 영업 상담을 이어 갈 때 끝에 질문 하나를 붙인다.
  core.response.answer = appendFollowUp(
    core.response.answer,
    buildFollowUp({
      question: core.question.redacted,
      answer: core.response.answer,
      category: core.category,
      intent: core.intent,
      handoffIntent: core.handoffIntent,
      answerMode: core.response.answerMode,
      tone,
      topicFollowUp: core.topicFollowUp,
      topicId: core.topicId,
      allowSalesFollowUp: !core.suppressSalesFollowUp,
    })
  )
}

// ── 정해 둔 답 확인 관문 ──────────────────────────────────────────────────────────────────────────
// 정규식이 고른 정해 둔 답은 내보내기 전에 모델이 "이 질문에 대한 답인지"만 판정한다(lib/chatbot/answer-gate.ts).
// 대상: 필드·기본 사실 답, service.ts 안의 정규식 분기 답, 증상 안내, CS 운영 가이드 답, composeAnswer 의 분류별·제목 틀 답,
//       학원 결제 기능 안내·챗봇 자기소개 답, 약한 신호로 걸린 상담 연결(쇼룸 안내는 정규식 분기 답에 들어 있다).
// 대상 아님: 인사, 잡담에 공감으로 받아 주는 답(small_talk), 보안 공격·범죄·토큰 낭비·시험 정답·모델 정보 요청을 막는 거절 답, 화난·반복 문의와 연결을 직접 청한 말의
//       상담 연결, 이미 해 봤다는 화난 고객의 상담 연결, 지난 대화 되묻기, 영어 안내, 못 찾음·되묻기, 근거 선별이 고른 답,
//       답 캐시 적중, 내부 CS 경로(includeInternalDocs).
// off_target 이면 그 답을 버리고 문서 경로(검색 → 근거 선별)로만 답한다. 정해 둔 답·분류별 틀·되묻기 문구로는 되돌아가지 않고,
// 문서 문장을 못 고르면 고정 문구(못 찾음·증상용·정책 주제·일반 되묻기·모델 실패) 가운데 하나를 낸다(answerFromDocumentsAfterGate).

type CoreResponse = Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">

// 관문이 정해 둔 답을 버린 뒤 문서 경로로 만든 최종 답. 스트림 경로가 선별·재작성·보류를 다시 하지 않게 표시한다.
const gateDocumentResponses = new WeakSet<object>()

// 관문이 켜져 있었는데 판정을 못 받은 경우(호출 실패·시간 초과). 이 답은 답 캐시에 넣지 않는다.
function isAnswerGateFailure(trace: AnswerGateTrace | undefined) {
  return (
    trace?.gate === "skipped" &&
    (trace.skipReason === "error" || trace.skipReason === "timeout" || trace.skipReason === "model_unavailable")
  )
}

function shouldRunAnswerGate(options: BuildChatbotCoreOptions) {
  if (options.includeInternalDocs) return false
  return options.answerGate ?? options.generateAnswer !== false
}

// composeAnswer 가 만든 답 가운데 관문 대상(분류별·제목 틀 답, 출처 없이 견적·데모 낱말로 상담 연결한 답)의 이름.
// 검색 조각 초안(근거 선별이 맡는다), 되묻기, 못 찾음 안내는 대상이 아니다(null).
function getComposedTemplateOriginal(response: CoreResponse): string | null {
  if (excerptDraftResponses.has(response)) return null
  const top = response.sources[0]
  if (top) return `template:${top.heading ?? top.urlPath}`
  if (response.answerMode === "handoff") return "template:consultation"
  return null
}

// 상담 연결이 약한 신호로 걸렸는지. 화난·반복 문의이거나 연결·요청하는 말("연결해 주세요", "상담받고 싶어요")이 있으면 강한 신호다.
// "선생님이 아이 마이크를 원격으로 끌 수 있나요"처럼 '원격' 낱말만으로 걸린 질문이 약한 신호다.
const HANDOFF_STRONG_REQUEST_RE =
  /연결|이어\s*(?:줘|주)|바꿔|불러|주세요|줘|원해|원합|원함|하고\s*싶|싶어|싶습|싶은|싶네|부탁|할래|급해|급합|연락\s*(?:주|줘|바랍|부탁)|신청|예약|잡아|잡고/
// 사람·통화를 찾는 말("상담원 있나요?", "사람이 답하는 거예요?", "통화 가능해요?")은 묻는 꼴이어도 사람을 찾는 신호다.
// 관문이 '정보를 묻는데 연결만 약속한 답'으로 버리면 연결 버튼이 사라지므로 강한 신호로 본다.
const HANDOFF_PERSON_WORD_RE = /상담원|상담사|사람|담당자|직원|매니저|통화|전화/

function isWeakHandoffSignal(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  const tone = detectConversationTone(question.redacted)
  if (tone.angry || tone.repeated) return false
  if (
    EXPLICIT_HUMAN_CONNECTION_RE.test(text) ||
    HANDOFF_REQUEST_WORD_RE.test(text) ||
    HANDOFF_STRONG_REQUEST_RE.test(text) ||
    HANDOFF_PERSON_WORD_RE.test(text)
  ) {
    return false
  }
  return true
}

// ── 못 찾았을 때 목차에서 다시 고르는 두 번째 검색 ──────────────────────────────────────────────────────
// 낱말 검색은 묻는 낱말과 문서 낱말이 다르면("학생 채팅만 막을 수 있나요" ↔ 문서의 "채팅 금지") 답이 든 절을 후보에 올리지 못한다.
// 정적 문서 경로에는 벡터 검색이 없다. 첫 검색 + 근거 선별이 못 찾은 사실 질문에서만, 공개 도움말 목차(문서·절 제목,
// lib/chatbot/doc-outline.ts)를 모델에게 보여 주고 답이 있을 만한 절을 최대 3개 고르게 한 뒤, 그 절의 문장으로 근거 선별을 다시 돌린다.
// 모델은 번호만 고르고 나가는 글은 문서 문장 그대로다. 목차에서 고른 절이 없거나 선별이 못 고르면 못 찾음 답을 그대로 둔다.
// 고른 문장으로 만든 답은 정해 둔 답 확인 관문(answer-gate.ts)으로 한 번 더 판정해, 질문과 비슷한 주제일 뿐인 문장이면 버린다.
// 운영(Supabase 검색)에서도 같은 정적 목차·정적 본문을 쓴다. DB 문서와 정적 문서는 다를 수 있다(DB 를 새로 조회하지 않는다).
// 스위치: CHATBOT_SECOND_CHANCE=off 로 끈다(기본 on). CHATBOT_FINAL_ANSWER_LLM=off 이거나 GEMINI_API_KEY 가 없어도 돌지 않는다.

export interface SecondChanceTrace {
  /** hit=목차에서 고른 절의 문장으로 답함, miss=돌렸지만 못 찾음 답 유지, none=대상 아님·꺼짐 */
  secondChance: "hit" | "miss" | "none"
  /** 두 번째 검색에 쓴 시간(ms). 돌리지 않았으면 없다. */
  secondChanceMs?: number
  /** miss·none 의 이유(no_section·no_sentence·off_target·error·timeout·model_unavailable·off·llm_off·no_key·budget·policy_topic). */
  reason?: string
}

// 두 번째 검색 전체(목차 고르기 → 근거 선별 → 답 확인) 예산과 단계별 상한.
// 2026-11-18 실측(정적 문서, lite 우선): 목차 고르기 0.7~1.0초, 선별 약 1초, 확인 약 0.9초.
const SECOND_CHANCE_TIMEOUT_MS = 6_000
const SECOND_CHANCE_OUTLINE_TIMEOUT_MS = 2_200
const SECOND_CHANCE_SELECTION_TIMEOUT_MS = 2_500
const SECOND_CHANCE_MIN_STEP_MS = 800
// 라우트 예산(13초) 안에서 끝나도록, 요청 시작부터 이 시간 안에 끝날 만큼만 돌린다.
const SECOND_CHANCE_ROUTE_BUDGET_MS = 11_000

// 한 응답에 두 번째 검색을 두 번 돌리지 않는다(관문 문서 경로에서 이미 돌린 답을 스트림 경로가 다시 돌리지 않게).
const secondChanceTriedResponses = new WeakSet<object>()

function getSecondChanceDisabledReason(): string | null {
  if (process.env.CHATBOT_SECOND_CHANCE?.trim().toLowerCase() === "off") return "off"
  if (getFinalAnswerLlmMode() === "off") return "llm_off"
  if (!process.env.GEMINI_API_KEY?.trim()) return "no_key"
  return null
}

function firstParagraph(text: string) {
  return text.split("\n\n")[0]
}

// 못 찾음 답(출처 없음 사실 질문 답, 근거 선별이 답 문장을 못 찾은 답). 말투 층이 앞뒤에 문장을 붙여도 알아보게 첫 문단으로 본다.
function isNotFoundResponse(response: CoreResponse) {
  return (
    response.answer.includes(firstParagraph(NO_SOURCE_FACT_ANSWER)) ||
    response.answer.includes(firstParagraph(WEAK_SOURCE_DRAFT_ANSWER))
  )
}

// 사람이 공개 범위를 정한 주제(금액·내부 원가·요금제 이름·무료 체험·회사 국적·특정 학원 사용 여부·최대/무대 인원·전자칠판 크기).
// 문서 문장이 이 기준과 어긋나는 곳이 있어(예: 무료 체험은 유보 답을 유지하는데 일부 문서는 기간을 적는다) 두 번째 검색으로 새 문장을
// 붙이지 않는다. 기준: docs/active/chatbot-first-contact-audit-2026-11-13.md "정해 둔 답의 기준".
const CAPACITY_TOPIC_RE =
  /(?:최대|몇\s*명|인원|정원).{0,12}(?:수업|교실|들어|참여|무대|스테이지|온\s*스테이지|카메라)|(?:수업|교실|무대|스테이지|온\s*스테이지).{0,12}(?:최대|몇\s*명|인원|정원)/
const INTERNAL_COST_TOPIC_RE = /원가|마진|공급가|납품가|도매가/
const NATIONALITY_TOPIC_RE = /(?:어느|어디|무슨)\s*나라|국적|중국\s*(?:회사|기업|업체|거|꺼|제품)|본사\s*(?:가|는|위치)?\s*어디/

function isPolicyGovernedTopic(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return (
    isPricingInfoQuestion(question) ||
    isSoftwarePricingQuestion(question) ||
    isTrialOrPilotQuestion(question) ||
    isAccountPlanOrTrialLimitQuestion(question) ||
    isHardwareSpecsQuestion(question) ||
    isHardwareBoardLineupQuestion(question) ||
    isHardwareUnconfirmedDetailQuestion(question) ||
    asksAboutThirdPartyAdoption(question.redacted) ||
    CAPACITY_TOPIC_RE.test(text) ||
    INTERNAL_COST_TOPIC_RE.test(text) ||
    NATIONALITY_TOPIC_RE.test(text)
  )
}

// 두 번째 검색 결과 가운데 판정을 못 받은 것(호출 실패·시간 초과, 앞 단계가 느려 시간이 모자라 건너뛴 것). 이 답은 답 캐시에 넣지 않는다.
function isSecondChanceFailure(trace: SecondChanceTrace | undefined) {
  if (trace?.secondChance === "none") return trace.reason === "budget"
  return (
    trace?.secondChance === "miss" &&
    (trace.reason === "error" || trace.reason === "timeout" || trace.reason === "model_unavailable")
  )
}

// 근거 선별 호출이 실패(오류·시간 초과)한 뒤 만든 답(못 찾음·되묻기·보류). 모델이 정상이면 다른 답이 나올 수 있어 답 캐시에 넣지 않는다.
const selectionFailedResponses = new WeakSet<object>()

/**
 * 못 찾음 답이 나가려는 공개 사실 질문에 두 번째 기회를 준다. 찾으면 response 를 문서 문장 답으로 바꾼다(제자리 수정).
 * 대상: 못 찾음 답 + 사실 질문(isFactSeekingQuestion: 잡담·주제 밖·증상 신고·한 낱말 입력 제외). 내부 CS 경로는 부르지 않는다.
 * 사람이 공개 범위를 정한 주제(isPolicyGovernedTopic)는 돌리지 않는다.
 * 이 함수는 예외를 던지지 않는다. 실패하면 못 찾음 답을 그대로 둔다. 다만 차단기 때문에 못 돌렸으면(model_unavailable)
 * '못 찾음'을 단정하지 않고 MODEL_UNAVAILABLE_ANSWER(상담 버튼)로 바꾼다.
 */
async function applySecondChanceRetrieval(
  response: CoreResponse,
  question: NormalizedQuestion,
  category: string,
  startedAt: number
): Promise<SecondChanceTrace> {
  if (secondChanceTriedResponses.has(response)) return { secondChance: "none" }
  // 선별 호출이 실패해 낸 답은 '못 찾음'이 아니다. 모델이 죽은 상태에서 목차 고르기를 또 부르지 않는다.
  if (modelUnavailableResponses.has(response)) return { secondChance: "none", reason: "model_unavailable" }
  if (!isNotFoundResponse(response) || !isFactSeekingQuestion(question)) return { secondChance: "none" }
  secondChanceTriedResponses.add(response)
  if (isPolicyGovernedTopic(question)) return { secondChance: "none", reason: "policy_topic" }

  const disabled = getSecondChanceDisabledReason()
  if (disabled) return { secondChance: "none", reason: disabled }
  const budgetMs = Math.min(SECOND_CHANCE_TIMEOUT_MS, SECOND_CHANCE_ROUTE_BUDGET_MS - elapsedSince(startedAt))
  if (budgetMs < SECOND_CHANCE_MIN_STEP_MS * 3) return { secondChance: "none", reason: "budget" }

  const t0 = Date.now()
  const miss = (failure: string): SecondChanceTrace => {
    const secondChanceMs = Date.now() - t0
    // 결제·인증 실패로 모델 호출을 멈춘 상태(llm.ts 차단기)에서 끝난 실패는 따로 센다.
    const reason = (failure === "error" || failure === "timeout") && isModelCircuitOpen() ? "model_unavailable" : failure
    if ((reason === "error" || reason === "timeout") && process.env.NODE_ENV !== "test") {
      console.warn("[chatbot] second-chance retrieval failed; keeping not-found answer.", { reason, secondChanceMs })
    }
    // 차단기 때문에 두 번째 검색을 돌리지 못했으면 '문서에 없음'을 단정하지 않는다. 문서에 있지만 낱말이 안 겹치는 질문을
    // 살리려고 둔 단계라, 모델이 죽은 동안의 '못 찾음'은 근거 선별 실패와 같이 '지금 확인 못 함'(상담 버튼)으로 낸다.
    // 차단기가 닫힌 상태의 일시 실패(오류·시간 초과)는 첫 검색이 정상으로 끝난 '못 찾음'이라 그대로 둔다.
    if (reason === "model_unavailable") applyModelUnavailableAnswer(response)
    return { secondChance: "miss", secondChanceMs, reason }
  }

  try {
    const outline = getPublicDocOutline()
    const remaining = () => budgetMs - (Date.now() - t0)
    const outlineBudget = Math.min(SECOND_CHANCE_OUTLINE_TIMEOUT_MS, budgetMs - SECOND_CHANCE_MIN_STEP_MS * 2)
    const picked = await pickOutlineSectionIds({
      question: question.redacted,
      outlineText: outline.text,
      entryCount: outline.entries.size,
      timeoutMs: outlineBudget,
    })
    if (!picked) return miss(Date.now() - t0 >= outlineBudget ? "timeout" : "error")
    if (picked.ids.length === 0) return miss("no_section")

    const candidates: ChatbotSource[] = []
    for (const id of picked.ids) {
      const entry = outline.entries.get(id)
      if (!entry) continue
      candidates.push({ ...buildDocSectionSource(entry.doc, entry.sectionIndex), score: MIN_DIRECT_SOURCE_SCORE })
    }
    const sentences = buildEvidenceSentences(candidates)
    if (sentences.length === 0) return miss("no_sentence")

    const selectionBudget = Math.min(SECOND_CHANCE_SELECTION_TIMEOUT_MS, remaining() - SECOND_CHANCE_MIN_STEP_MS)
    if (selectionBudget < SECOND_CHANCE_MIN_STEP_MS) return miss("timeout")
    const ids = await selectAnsweringSentenceIds({ question: question.redacted, sentences, timeoutMs: selectionBudget })
    if (ids === null) return miss(remaining() <= SECOND_CHANCE_MIN_STEP_MS ? "timeout" : "error")
    const chosen = sentences.filter((sentence) => ids.includes(sentence.id))
    if (chosen.length === 0) return miss("no_sentence")

    // 목차가 고른 절은 질문과 낱말이 겹치지 않는 절이라 선별이 비슷한 주제의 문장을 고르기 쉽다. 정해 둔 답과 같은 관문으로
    // "이 질문에 대한 답인지"를 한 번 더 판정하고, 아니라고 하거나 판정을 못 받으면(호출 실패·시간 초과) 못 찾음 답을 둔다.
    const answer = formatSelectedEvidenceAnswer(chosen, question, category, "direct_answer")
    const verifyBudget = remaining()
    if (verifyBudget < SECOND_CHANCE_MIN_STEP_MS) return miss("timeout")
    const verdict = await checkPreparedAnswer({
      question: question.redacted,
      answer,
      original: "second-chance",
      timeoutMs: verifyBudget,
    })
    if (verdict.gate === "rejected") return miss("off_target")
    // 관문을 운영자가 끈 경우(CHATBOT_ANSWER_GATE=off)만 확인 없이 쓴다.
    if (verdict.gate !== "kept" && verdict.skipReason !== "off") {
      return miss(verdict.skipReason === "timeout" ? "timeout" : "error")
    }

    const usedIndexes = Array.from(new Set(chosen.map((sentence) => sentence.sourceIndex)))
    response.answer = answer
    response.answerMode = "direct_answer"
    response.confidence = 0.72
    response.needsHandoff = false
    response.unresolved = false
    response.sources = usedIndexes.map((index) => candidates[index]).slice(0, MAX_SOURCES)
    response.suggestedQuestions = buildSuggestedQuestions(category)
    return { secondChance: "hit", secondChanceMs: Date.now() - t0 }
  } catch {
    return miss("error")
  }
}

/**
 * 관문이 정해 둔 답을 버린 뒤 쓸 문서 근거 후보. 큐레이션 출처(정해 둔 답이 기대는 출처)는 빼고 문서 조각만 남긴다.
 * 이미 검색해 둔 후보가 있으면 다시 검색하지 않는다.
 */
async function findDocumentEvidenceAfterGate(
  question: NormalizedQuestion,
  options: BuildChatbotCoreOptions,
  prior?: KnowledgeSearchResult
): Promise<ChatbotSource[]> {
  const curatedKeys = new Set(buildCuratedSources(question).map(getSourceKey))
  const isDocumentSource = (source: ChatbotSource) => !curatedKeys.has(getSourceKey(source))
  if (prior?.evidencePool && prior.evidencePool.length > 0) {
    return buildEvidenceCandidates(prior.sources.filter(isDocumentSource), prior.evidencePool.filter(isDocumentSource))
  }
  const retrievalOptions = { includeInternalDocs: options.includeInternalDocs }
  return withTimeoutFallback({
    promise: (async () => {
      if (hasSupabaseServerEnv()) {
        const searched = await searchSupabaseSources(question, retrievalOptions)
        if (searched.sources.length > 0) {
          return buildEvidenceCandidates(searched.sources.filter(isDocumentSource), searched.evidencePool.filter(isDocumentSource))
        }
      }
      return buildEvidencePool(scoreStaticSources(question, await getFallbackDocs()))
    })(),
    timeoutMs: getKnowledgeSearchTimeoutMs(),
    fallback: () => buildEvidencePool(scoreStaticSources(question, getFallbackDocsFromStatic())),
    onTimeout: () => console.warn("[chatbot] knowledge search after answer gate timed out; using static fallback."),
  })
}

// 공개 범위를 사람이 정한 주제에서 관문이 정해 둔 답을 버렸을 때의 답. 문서 문장을 붙이지 않고 담당자 확인으로 잇는다.
export const POLICY_TOPIC_AFTER_GATE_ANSWER = [
  "이 질문은 채팅에서 확정해 말씀드리기 어려운 내용이라, 추측해 답하지 않을게요.",
  "아래 상담 버튼으로 남겨 주시면 담당자가 확인해 정확히 안내해 드려요.",
].join("\n\n")

// 증상·고장 신고에서 관문이 정해 둔 안내를 버렸고 문서에서도 해결 문장을 못 고른 경우의 답. 상담 버튼(기술지원)으로 잇는다.
// 예전에는 composeAnswer 의 분류별 되묻기·틀 문구가 나가, 엑셀 '형식 오류'에 "90일 전환 순서…", 칠판 밝기에
// "설치 장소, 대수…"를 묻는 식이었다(2026-11-18 기준 묶음에서 관문이 버린 15건 중 '둘 다 나쁨' 5건이 모두 이 틀 문구).
export const SYMPTOM_AFTER_GATE_ANSWER = [
  "딱 맞는 해결 안내를 아직 찾지 못했어요. 추측해서 안내하지는 않을게요.",
  "아래 상담 버튼으로 증상을 남겨 주시면 기술지원 담당자가 확인해 드려요.",
].join("\n\n")

/**
 * 관문이 off_target 으로 판정한 뒤의 문서 경로: 검색 → 근거 선별.
 * 고른 문장이 있으면 그 문장으로 답한다. 없으면 분류별 틀·되묻기 문구로 돌아가지 않고 고정 문구 가운데 하나를 낸다:
 * 사실 질문은 목차에서 다시 고르는 두 번째 검색을 거쳐 못 찾음(NO_SOURCE_FACT_ANSWER), 증상·고장 신고(또는 버린 답이 증상·가이드 답)는
 * SYMPTOM_AFTER_GATE_ANSWER, 그 밖(무엇을 묻는지 불분명)은 분류와 무관한 일반 되묻기(buildGeneralClarify).
 * 선별 호출이 실패하면 못 찾음을 단정하지 않고 MODEL_UNAVAILABLE_ANSWER 를 낸다. 버린 답으로는 돌아가지 않는다.
 */
async function answerFromDocumentsAfterGate(
  question: NormalizedQuestion,
  original: string,
  options: BuildChatbotCoreOptions,
  startedAt: number,
  prior?: KnowledgeSearchResult
): Promise<Pick<ChatbotCore, "response" | "category" | "intent" | "handoffIntent" | "secondChance">> {
  // 사람이 공개 범위를 정한 주제는 관문이 정해 둔 답을 버려도 문서 문장을 붙이지 않는다(두 번째 검색과 같은 기준).
  // 문서 문장이 정해 둔 기준과 어긋날 수 있어서다. 추측하지 않고 담당자 확인으로 잇는다.
  if (isPolicyGovernedTopic(question)) {
    const { category, intent, handoffIntent } = classifyChatbotQuestion(question.redacted)
    const response: CoreResponse = {
      answer: POLICY_TOPIC_AFTER_GATE_ANSWER,
      answerMode: "handoff",
      confidence: 0.4,
      needsHandoff: true,
      sources: [],
      suggestedQuestions: buildSuggestedQuestions(category),
      unresolved: true,
    }
    deterministicFinalResponses.add(response)
    gateDocumentResponses.add(response)
    return { response, category, intent, handoffIntent, secondChance: { secondChance: "none", reason: "policy_topic" } }
  }
  const candidates = await findDocumentEvidenceAfterGate(question, options, prior)
  const classified = classifyChatbotQuestion(
    question.redacted,
    candidates.filter((source) => source.score >= MIN_DIRECT_SOURCE_SCORE).map((source) => source.category)
  )
  const { category, intent } = classified
  let { handoffIntent } = classified
  const sentences = buildEvidenceSentences(candidates)
  const ids = sentences.length > 0 ? await selectAnsweringSentenceIds({ question: question.redacted, sentences }) : []
  const picked = ids && ids.length > 0 ? sentences.filter((sentence) => ids.includes(sentence.id)) : []

  let response: CoreResponse
  if (ids === null && isFinalAnswerModelEnabled()) {
    // 선별 호출이 실패했다(모델이 죽은 것이지 문서에 없는 것이 아니다). 못 찾음을 단정하지 않고 다시 묻거나 상담으로 잇게 한다.
    response = {
      answer: MODEL_UNAVAILABLE_ANSWER,
      answerMode: "handoff",
      confidence: 0.2,
      needsHandoff: true,
      sources: [],
      suggestedQuestions: buildSuggestedQuestions(category),
      unresolved: true,
    }
    modelUnavailableResponses.add(response)
  } else if (picked.length > 0) {
    const usedIndexes = Array.from(new Set(picked.map((sentence) => sentence.sourceIndex)))
    response = {
      answer: formatSelectedEvidenceAnswer(picked, question, category, "direct_answer"),
      answerMode: "direct_answer",
      confidence: 0.72,
      needsHandoff: false,
      sources: usedIndexes.map((index) => candidates[index]).slice(0, MAX_SOURCES),
      suggestedQuestions: buildSuggestedQuestions(category),
      unresolved: false,
    }
  } else if (isFactSeekingQuestion(question)) {
    response = {
      answer: NO_SOURCE_FACT_ANSWER,
      answerMode: "fallback",
      confidence: 0.2,
      needsHandoff: false,
      sources: [],
      suggestedQuestions: buildSuggestedQuestions(category),
      unresolved: true,
    }
  } else if (SYMPTOM_REPORT_RE.test(question.redacted.toLowerCase()) || /^(?:symptom|guide):/.test(original)) {
    response = {
      answer: SYMPTOM_AFTER_GATE_ANSWER,
      answerMode: "handoff",
      confidence: 0.3,
      needsHandoff: true,
      sources: [],
      suggestedQuestions: buildSuggestedQuestions(category),
      unresolved: true,
    }
    handoffIntent = "support"
  } else {
    response = {
      answer: buildGeneralClarify(question).join("\n\n"),
      answerMode: "clarifying_question",
      confidence: 0.2,
      needsHandoff: false,
      sources: [],
      suggestedQuestions: buildSuggestedQuestions(category),
      unresolved: true,
    }
  }
  if (ids === null) selectionFailedResponses.add(response)
  // 못 찾음이면 목차에서 다시 고르는 두 번째 검색을 한 번 돌린다(스트림·일반 경로 모두 이 코어 안에서 끝난다).
  const secondChance = await applySecondChanceRetrieval(response, question, category, startedAt)
  deterministicFinalResponses.add(response)
  gateDocumentResponses.add(response)
  return { response, category, intent, handoffIntent, secondChance }
}

/**
 * 정해 둔 답으로 끝나는 코어를 관문에 통과시킨다. 대상이 아니거나 관문이 꺼졌으면 그대로 돌려준다.
 * off_target 이면 문서 경로로 만든 코어로 바꾼다(정해 둔 답의 주제 확인 질문·영어 요약 등은 버린다).
 */
async function gatePreparedCore(
  core: ChatbotCore,
  original: string | null | undefined,
  options: BuildChatbotCoreOptions,
  startedAt: number,
  prior?: KnowledgeSearchResult
): Promise<ChatbotCore> {
  if (!original || !shouldRunAnswerGate(options)) return core
  const trace = await checkPreparedAnswer({ question: core.question.redacted, answer: core.response.answer, original })
  if (trace.gate !== "rejected") return { ...core, answerGate: trace }
  // 검색 전에 끝나는 경로(정해 둔 답·증상·가이드·상담 연결)는 답 캐시 조회보다 앞이라, 버린 뒤의 문서 경로 답을 여기서 캐시한다.
  // 검색 뒤의 틀 답(prior 있음)은 코어 끝에서 캐시한다. 스트림 경로(generateAnswer=false)는 자기 끝에서 캐시한다.
  const cacheHere = !prior && isAnswerCacheAllowed(options)
  const cached = cacheHere ? getCachedAnswer(core.question, options) : null
  if (cached) {
    return {
      question: core.question,
      response: cached.response,
      category: cached.category,
      intent: cached.intent,
      handoffIntent: cached.handoffIntent,
      warning: cached.warning,
      latencyMs: elapsedSince(startedAt),
      retrievalCacheHit: true,
      answerGate: trace,
    }
  }
  const documentCore = await answerFromDocumentsAfterGate(core.question, original, options, startedAt, prior)
  if (cacheHere && !isSecondChanceFailure(documentCore.secondChance) && !selectionFailedResponses.has(documentCore.response)) {
    const { response, category, intent, handoffIntent } = documentCore
    setCachedAnswer(core.question, { response, category, intent, handoffIntent, warning: core.warning }, options)
  }
  return {
    question: core.question,
    ...documentCore,
    warning: core.warning,
    latencyMs: elapsedSince(startedAt),
    retrievalCacheHit: core.retrievalCacheHit,
    answerGate: trace,
  }
}

async function buildChatbotCore(
  message: unknown,
  options: BuildChatbotCoreOptions = {}
): Promise<ChatbotCore> {
  const core = await buildChatbotCoreBase(message, options)
  // 말투 처리(공감 첫마디·상담 연결 앞세우기)는 공개 챗봇 답에만 붙인다. 내부 CS 코파일럿 근거에는 넣지 않는다.
  if (!options.includeInternalDocs) applyConversationTone(core)
  // shadow 라우터: 손님에게는 legacy 답을 내고, 답 색인 판정은 응답 뒤 로그에만 남긴다(답을 바꾸지 않는다).
  if (!options.includeInternalDocs && getAnswerRouter() === "shadow") scheduleShadowLog(core)
  return core
}

/**
 * 답 라우터(CHATBOT_ANSWER_ROUTER, 답 색인 사양 §3.2·§3.8)에 따라 코어를 만든다.
 * legacy(기본)·shadow: 지금 흐름 그대로. compiled: 공개 짧은 질문은 답 색인이 정하고(모델·네트워크 호출 없음),
 * 범위 밖 질문과 색인 앞 단계가 넘긴 질문(인사·거절 답)은 지금 흐름으로 간다. 내부 CS 경로는 언제나 지금 흐름이다.
 */
async function buildChatbotCoreBase(
  message: unknown,
  options: BuildChatbotCoreOptions = {}
): Promise<ChatbotCore> {
  const startedAt = Date.now()
  const prepared = prepareConversationTurn(message, options)
  const { question } = prepared
  const withTurn = (core: ChatbotCore): ChatbotCore => ({
    ...core,
    ...(prepared.turn.expanded ? { utterance: prepared.utterance } : {}),
    conversation: prepared.trace,
  })
  // 같은 대화에서 증상 안내를 받은 뒤 "해 봤는데 또 안 돼요": 같은 안내를 또 내지 않고 상담 연결로 잇는다(두 라우터 공통).
  if (prepared.triedAgain) return withTurn(buildTriedAlreadyCore(question, startedAt))
  if (!options.includeInternalDocs && getAnswerRouter() === "compiled") {
    const routed = routeCompiledQuestionSafely(question, startedAt)
    if (routed.core) return withTurn(routed.core)
    const legacyCore = await buildLegacyChatbotCoreBase(question, options, startedAt, prepared)
    return withTurn({ ...legacyCore, answerIndex: routed.trace })
  }
  return withTurn(await buildLegacyChatbotCoreBase(question, options, startedAt, prepared))
}

// ── 대화 맥락(직전 한 턴·문서 페이지) ──────────────────────────────────────────────────────────────

interface PreparedConversationTurn {
  /** 이번 말 그대로(정규화·가리기). */
  utterance: NormalizedQuestion
  /** 검색·분류·관문·답 색인에 넘기는 질문. 넓히지 않았으면 utterance 와 같은 객체다. */
  question: NormalizedQuestion
  turn: ConversationTurn
  /** 페이지 맥락을 쓰면 그 공개 문서. */
  pageDoc: DocArticle | null
  /** 증상 안내 뒤 "해 봤는데 또 안 돼요"(이미 해 본 조치 → 상담 연결). */
  triedAgain: boolean
  trace: ConversationTrace
}

function findPublicDocForPage(ref: Pick<DocPageRef, "category" | "slug">): DocArticle | null {
  return getFallbackDocsFromStatic().find((doc) => doc.category === ref.category && doc.slug === ref.slug) ?? null
}

/**
 * 짧은 말이 혼자서도 답이 서는지(대화 맥락으로 넓히지 않는다). 정해 둔 답·검수 틀 답·증상 안내·화면 가이드·상담 연결·인사·거절 답이
 * 바로 잡히는 말이다("요금은요?"). 모두 정규식 판정이라 모델·네트워크를 부르지 않는다.
 */
function standsAloneForTurn(text: string) {
  let candidate: NormalizedQuestion
  try {
    candidate = normalizeQuestion(text)
  } catch {
    return false
  }
  if (isGreetingOnly(candidate) || buildPolicyGuardResponse(candidate) || wantsImmediateHumanHandoff(candidate)) return true
  if (buildServiceQuickAnswer(candidate) || isCuratedTemplateQuestion(candidate)) return true
  const routing = glossForRouting(candidate.redacted)
  const guide = findCsFigmaGuideForQuestion(routing)
  return Boolean(guide || resolveSymptomTriageForQuestion(routing, guide))
}

/** 직전 질문이 증상 신고였는지(그 답이 증상 안내였는지). */
function isSymptomTurn(text: string) {
  const routing = glossForRouting(text)
  return SYMPTOM_REPORT_RE.test(text.toLowerCase()) || resolveSymptomTriageForQuestion(routing, findCsFigmaGuideForQuestion(routing)) !== null
}

/**
 * 이번 말을 직전 턴·문서 페이지에 비춰 검색용 질문으로 정한다(conversation-context.ts). 직전 턴·페이지가 없으면 질문은 그대로이고
 * (한 줄 질문의 답은 바뀌지 않는다) '대상 불명'만 표시될 수 있다. 내부 CS 코파일럿 경로는 맥락을 쓰지 않는다.
 */
function prepareConversationTurn(message: unknown, options: BuildChatbotCoreOptions): PreparedConversationTurn {
  const utterance = normalizeQuestion(message)
  const plain = (turn: ConversationTurn): PreparedConversationTurn => ({
    utterance,
    question: utterance,
    turn,
    pageDoc: null,
    triedAgain: false,
    trace: { reason: turn.reason, expanded: false },
  })
  if (options.includeInternalDocs) {
    return plain({ routingText: utterance.redacted, reason: "none", expanded: false, retryReport: false })
  }
  const turn = resolveConversationTurn(utterance.redacted, options.previousTurn ?? null, options.pagePath ?? null, {
    standsAlone: standsAloneForTurn,
  })
  if (!turn.expanded) {
    const pageDoc = turn.reason === "page_context" && turn.pageDoc ? findPublicDocForPage(turn.pageDoc) : null
    const prepared = plain(turn)
    if (!pageDoc) return prepared
    return { ...prepared, pageDoc, trace: { ...prepared.trace, pagePath: getDocPath(pageDoc) } }
  }
  const triedAgain = turn.retryReport && Boolean(options.previousTurn && isSymptomTurn(options.previousTurn.question))
  return {
    utterance,
    question: buildRoutingQuestion(turn.routingText, utterance),
    turn,
    pageDoc: null,
    triedAgain,
    trace: { reason: turn.reason, expanded: true },
  }
}

/**
 * 페이지 맥락: 그 문서의 정적 절(요약 + 절)을 검색 후보 맨 앞에 둔다. 답·출처 카드의 첫 출처도 그 문서다.
 * 근거 선별·보류·두 번째 검색은 그대로 거친다(문서 문장을 고른 경우에만 문서 문장이 답이 된다).
 */
function withPageDocFirst(searched: KnowledgeSearchResult, doc: DocArticle, question: NormalizedQuestion): KnowledgeSearchResult {
  const docPath = getDocPath(doc)
  const extras = [...doc.tags, ...doc.keywords]
  const docSources: ChatbotSource[] = [null, ...doc.sections.map((_, index) => index)].map((sectionIndex) => {
    const source = buildDocSectionSource(doc, sectionIndex)
    return { ...source, score: Math.max(MIN_DIRECT_SOURCE_SCORE, scoreText(question, source, extras)) }
  })
  const others = (list: ChatbotSource[] | undefined) => (list ?? []).filter((source) => source.urlPath !== docPath)
  return {
    ...searched,
    sources: [docSources[0], ...others(searched.sources)].slice(0, MAX_SOURCES),
    evidencePool: [...docSources, ...others(searched.evidencePool)].slice(0, EVIDENCE_POOL_SIZE),
  }
}

// ── 답 색인(compiled) 경로 ─────────────────────────────────────────────────────────────────────────
// 답 색인 사양 §3.2 순서: 인사 → 거절 답(정책 가드) → ① 관문 밖 정해 둔 답 → ② 영어 안내 → ③ 즉시 상담 연결(강한 신호)
// → ④ 이미 해 봤다는 화난 문의 → ⑤ 범위 관문(밖이면 지금 흐름) → ⑥ 옛 정규식 표 → ⑦ 판정 → ⑧ 답 조립.
// 정규식이 고른 정해 둔 답(자기소개·학원 결제 안내처럼 관문 대상인 정책 가드 답 포함)은 답을 정하지 않고 표로만 쓴다.
// 관문·근거 선별·보류·두 번째 검색·MODEL_UNAVAILABLE_ANSWER 는 부르지 않는다(결정형 답).

type CompiledRoutePlan =
  /** 지금 흐름이 답한다(인사·거절 답·범위 밖). */
  | { kind: "legacy"; trace: AnswerIndexTrace }
  /** 색인 앞 단계가 답한다(①~④). */
  | { kind: "pre"; trace: AnswerIndexTrace; build: () => ChatbotCore }
  /** 색인이 정한다. */
  | { kind: "index"; decision: AnswerIndexDecision; votes: string[] }

function planCompiledRoute(question: NormalizedQuestion, router: AnswerIndexRouter, startedAt: number): CompiledRoutePlan {
  const pre = (name: NonNullable<AnswerIndexTrace["pre"]>) => preIndexTrace(router, "in", name)
  if (isGreetingOnly(question)) return { kind: "legacy", trace: pre("greeting") }
  const inScope = isCompiledScope(question.redacted)
  const policyGuard = buildPolicyGuardResponse(question)
  // 거절 답(보안·범죄·토큰 낭비·모델 정보, 잡담 공감)은 그대로 둔다. 범위 밖 질문은 정책 가드를 포함해 지금 흐름 그대로다.
  if (policyGuard && !(inScope && policyGuard.gateOriginal)) {
    return { kind: "legacy", trace: inScope ? pre("policy_guard") : preIndexTrace(router, "out") }
  }
  const quick = buildServiceQuickAnswer(question)
  if (quick?.gateExempt) {
    return { kind: "pre", trace: pre("exempt"), build: () => ({ question, ...quick, latencyMs: elapsedSince(startedAt) }) }
  }
  if (isEnglishSupportRequest(question.redacted)) {
    return { kind: "pre", trace: pre("english"), build: () => buildEnglishSupportCore(question, startedAt) }
  }
  if (wantsImmediateHumanHandoff(question) && !isWeakHandoffSignal(question)) {
    return { kind: "pre", trace: pre("handoff"), build: () => buildImmediateHandoffCore(question, startedAt) }
  }
  if (isTriedAlreadyUpset(question)) {
    return { kind: "pre", trace: pre("tried"), build: () => buildTriedAlreadyCore(question, startedAt) }
  }
  if (!inScope) return { kind: "legacy", trace: preIndexTrace(router, "out") }
  const index = getRouterAnswerIndex()
  const legacySignals = [quick, policyGuard].filter((signal) => signal !== null).map((signal) => ({ gateOriginal: signal.gateOriginal }))
  if (wantsImmediateHumanHandoff(question)) legacySignals.push({ gateOriginal: "handoff:weak-signal" })
  const votes = collectLegacyVotes(question.redacted, legacySignals, index.legacyAlias)
  const decision = routeAnswerIndex(question.redacted, {
    index,
    votes,
    isSymptomReport: (text) => SYMPTOM_REPORT_RE.test(text.toLowerCase()),
  })
  return { kind: "index", decision, votes }
}

function routeCompiledQuestion(question: NormalizedQuestion, startedAt: number): { core: ChatbotCore | null; trace: AnswerIndexTrace } {
  const plan = planCompiledRoute(question, "compiled", startedAt)
  if (plan.kind === "legacy") return { core: null, trace: plan.trace }
  if (plan.kind === "pre") {
    const core = plan.build()
    // 스트림 경로는 내보내기 전에 finalizeAnswer 를 부른다. 일반 경로도 같은 정리(원본 URL·문서 경로 지우기)를 해 두 경로 답을 같게 둔다.
    finalizeAnswer(core.response)
    deterministicFinalResponses.add(core.response)
    return { core: { ...core, answerIndex: plan.trace }, trace: plan.trace }
  }
  const index = getRouterAnswerIndex()
  const built = buildAnswerIndexCore(plan.decision, question, startedAt, {
    index,
    host: answerIndexHost,
    router: "compiled",
    version: answerIndexVersionOf(index),
  })
  const core: ChatbotCore = { question, ...built, response: built.response as CoreResponse }
  // 문서 문장을 그대로 내므로 문장에 원본 URL·문서 경로가 있으면 공개 답에서 지운다(스트림 경로와 같은 정리, 제자리 수정).
  finalizeAnswer(core.response)
  return { core, trace: built.answerIndex }
}

const reportedAnswerIndexFailures = new Set<string>()

/**
 * compiled 경로에서 색인 읽기·컴파일·판정·답 조립이 예외를 내면 손님 답을 막지 않고 지금(legacy) 흐름으로 보낸다.
 * 라우터를 legacy 로 되돌린 것과 같은 상태다(사양 §3.9). 흔적에는 unavailable=index_error 를 남기고, 같은 오류는 한 번만 로그로 남긴다.
 */
function routeCompiledQuestionSafely(question: NormalizedQuestion, startedAt: number): { core: ChatbotCore | null; trace: AnswerIndexTrace } {
  try {
    return routeCompiledQuestion(question, startedAt)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!reportedAnswerIndexFailures.has(message) && reportedAnswerIndexFailures.size < 20) {
      reportedAnswerIndexFailures.add(message)
      console.error("[chatbot] answer-index failed; using the legacy flow:", message)
    }
    const scope = isCompiledScope(question.redacted) ? "in" : "out"
    return { core: null, trace: { ...preIndexTrace("compiled", scope), unavailable: "index_error" } }
  }
}

// 답 색인이 기존 답 만드는 함수·고정 문구를 쓰게 넘기는 것(respond.ts 가 service.ts 를 import 하지 않게).
const answerIndexHost: AnswerIndexHost = {
  noSourceAnswer: NO_SOURCE_FACT_ANSWER,
  symptomAbstainAnswer: SYMPTOM_AFTER_GATE_ANSWER,
  suggestedQuestions: (category) => buildSuggestedQuestions(category),
  sourceCategory: (docCategory) => getSourceCategoryFromDocCategory(docCategory),
  basicsSource: (docPath, heading) => buildBasicsDocSource(docPath, heading),
  handoff: (questionText, handoffIntent) => {
    const { category, intent } = classifyChatbotQuestion(questionText)
    return { response: buildImmediateHandoffResponse(category, handoffIntent, questionText.toLowerCase()), category, intent, handoffIntent }
  },
  symptom: (triage) => symptomCoreParts(triage),
  guide: (guide, questionText) => csFigmaGuideCoreParts(guide, questionText),
  selfKnowledge: (entry) => buildSelfKnowledgeAnswer(entry),
  markFinal: (response) => {
    deterministicFinalResponses.add(response)
  },
}

/** legacy 답이 어디서 나왔는지(shadow 로그용, 질문 글 없이). */
function legacyDecidedBy(core: ChatbotCore) {
  if (core.secondChance?.secondChance === "hit") return "second_chance"
  if (core.answerGate?.gate === "rejected") return core.response.sources.length > 0 ? "gate_evidence_select" : "gate_not_found"
  const original = core.gateOriginal ?? core.answerGate?.gateOriginal
  if (original) return original
  if (core.topicId) return `topic:${core.topicId}`
  if (isNotFoundResponse(core.response)) return "not_found"
  return `${core.response.sources.length > 0 ? "sources" : "no_source"}:${core.response.answerMode}`
}

function scheduleShadowLog(core: ChatbotCore) {
  const question = core.question
  const legacy = legacyDecidedBy(core)
  runAfterResponse(async () => {
    try {
      const plan = planCompiledRoute(question, "shadow", Date.now())
      if (plan.kind === "index") {
        logShadowDecision({ question: question.redacted, decision: plan.decision, legacyDecidedBy: legacy })
      } else {
        const skipped = plan.trace.scope === "out" ? "scope_out" : (plan.trace.pre ?? "skipped")
        logShadowDecision({ question: question.redacted, decision: null, skipped, legacyDecidedBy: legacy })
      }
    } catch (error) {
      console.warn("[chatbot] answer-index shadow failed:", error instanceof Error ? error.message : error)
    }
  })
}

function buildEnglishSupportCore(question: NormalizedQuestion, startedAt: number): ChatbotCore {
  return {
    question,
    response: {
      answer: ENGLISH_SUPPORT_ANSWER,
      answerMode: "direct_answer",
      confidence: 0.9,
      needsHandoff: false,
      sources: [],
      suggestedQuestions: ["login not working", "how to invite students", "상담원 연결해 주세요"],
      unresolved: false,
    },
    category: "general",
    intent: "self_knowledge",
    handoffIntent: "support",
    latencyMs: elapsedSince(startedAt),
  }
}

function buildImmediateHandoffCore(question: NormalizedQuestion, startedAt: number): ChatbotCore {
  const { category, intent, handoffIntent: classifiedHandoff } = classifyChatbotQuestion(question.redacted)
  // 사람 연결 요청·항의·회신 누락은 실시간 상담(지원)으로, 도입·데모·견적 요청만 도입 상담으로 보낸다.
  const tone = detectConversationTone(question.redacted)
  const text = question.redacted.toLowerCase()
  const salesRequest = /도입|데모|시연|견적|구매|쇼룸|체험\s*신청|미팅/.test(text)
  const supportContext =
    /연락이\s*없|감감무소식|답이\s*없|회신|오류|에러|안\s*(?:돼|되|됨)|환불|고장|문제|장애|불만|항의|보상|책임자|원격|화면\s*(?:을\s*)?(?:보면서|같이)/.test(text) ||
    (/사람|상담원|직원|챗봇\s*말고|봇\s*말고|번호|연락처|물어볼\s*게/.test(text) && !salesRequest)
  const handoffIntent: HandoffIntent = tone.angry || tone.repeated || supportContext ? "support" : classifiedHandoff
  return {
    question,
    response: buildImmediateHandoffResponse(category, handoffIntent, text),
    category,
    intent,
    handoffIntent,
    latencyMs: elapsedSince(startedAt),
  }
}

function isTriedAlreadyUpset(question: NormalizedQuestion) {
  const routingTone = detectConversationTone(question.redacted)
  return (routingTone.repeated || routingTone.angry) && TRIED_ALREADY_RE.test(question.redacted.toLowerCase())
}

function buildTriedAlreadyCore(question: NormalizedQuestion, startedAt: number): ChatbotCore {
  const response = {
    answer: [
      "기본 조치를 이미 다 해 보셨는데 같은 일이 반복됐다면, 같은 안내를 또 드리지 않을게요. 이제는 기술지원이 기록을 보고 원인을 찾아야 하는 단계예요.",
      "아래 [실시간 상담 연결]을 누르시고 끊긴 날짜와 시각(여러 번이면 모두), 수업 이름, 쓰는 기기와 네트워크(유선·와이파이·핫스팟)를 알려 주세요. 기술지원이 그 시간대 접속 기록을 보고 확인합니다.",
    ].join("\n\n"),
    answerMode: "handoff" as const,
    confidence: 0.8,
    needsHandoff: true,
    sources: [],
    suggestedQuestions: ["담당자 상담으로 이어주세요", "학원 네트워크에서만 접속이 안 돼요", "앱이 자꾸 멈춰요"],
    unresolved: false,
  }
  deterministicFinalResponses.add(response)
  return { question, response, category: "troubleshooting", intent: "troubleshooting", handoffIntent: "support", latencyMs: elapsedSince(startedAt) }
}

function symptomCoreParts(triage: SymptomTriageResult): AnswerIndexCoreParts & { response: CoreResponse } {
  return {
    response: buildSymptomTriageResponse(triage),
    category: triage.category,
    intent: triage.intent,
    handoffIntent: "support",
    englishSummary: triage.englishSummary,
    howtoAnswer: triage.howto === true,
    topicFollowUp: triage.followUp,
    topicId: triage.topicId,
  }
}

function csFigmaGuideCoreParts(csFigmaGuide: CsFigmaGuide, questionText: string): AnswerIndexCoreParts & { response: CoreResponse } {
  const { category, intent, handoffIntent } = classifyChatbotQuestion(questionText, [csFigmaGuide.category, csFigmaGuide.docCategory])
  // 증상형 질문이면 how-to 단계와 함께 상담 연결을 제안한다(자가해결 + 안전망).
  const isSymptom = isCsFigmaSymptomQuestion(questionText)
  const guideAnswer = isSymptom
    ? `${formatCsFigmaGuideAnswer(csFigmaGuide)}\n\n위 순서로도 해결되지 않으면 담당자 상담으로 연결해 드릴 수 있어요.`
    : formatCsFigmaGuideAnswer(csFigmaGuide)
  return {
    response: {
      answer: guideAnswer,
      answerMode: "direct_answer",
      confidence: isSymptom ? 0.82 : 0.88,
      needsHandoff: false,
      sources: [
        {
          title: csFigmaGuide.title,
          heading: CS_FIGMA_GUIDE_SOURCE_HEADING,
          urlPath: getCsFigmaGuideDocPath(csFigmaGuide),
          category: csFigmaGuide.category,
          excerpt:
            getCsFigmaEnrichment(csFigmaGuide.docSlug)?.intro ??
            sanitizeGuideStep(csFigmaGuide.summary),
          score: 420,
        },
      ],
      suggestedQuestions: buildCsFigmaGuideSuggestedQuestions(csFigmaGuide),
      unresolved: false,
    },
    category,
    intent,
    handoffIntent: isSymptom ? "support" : handoffIntent,
  }
}

async function buildLegacyChatbotCoreBase(
  question: NormalizedQuestion,
  options: BuildChatbotCoreOptions,
  startedAt: number,
  prepared: PreparedConversationTurn
): Promise<ChatbotCore> {
  const shouldGenerateAnswer = options.generateAnswer !== false
  const pageKey = prepared.trace.pagePath ?? null
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
        suggestedQuestions: [
          "도입 전 확인 질문을 알려주세요",
          "수업 운영 문제를 해결하고 싶어요",
          "요금/견적은 어떤 항목으로 구성되나요?",
        ],
        unresolved: true,
      },
      category: "general",
      intent: "docs_lookup",
      handoffIntent: "demo",
      latencyMs: elapsedSince(startedAt),
    }
  }

  const policyGuard = buildPolicyGuardResponse(question)
  if (policyGuard) {
    const policyCore: ChatbotCore = {
      question,
      response: policyGuard.response,
      category: policyGuard.category,
      intent: policyGuard.intent,
      handoffIntent: policyGuard.handoffIntent,
      latencyMs: elapsedSince(startedAt),
    }
    // 거절 답(보안·범죄·토큰 낭비·모델 정보)은 gateOriginal 이 없어 관문을 거치지 않는다.
    return gatePreparedCore(policyCore, policyGuard.gateOriginal, options, startedAt)
  }

  // 아래 공개 챗봇 전용 지름길(정해 둔 답·영어 안내·증상 트리아지·지난 대화 되묻기)은 검색을 건너뛴다.
  // 내부 CS 코파일럿(includeInternalDocs, 계약 6)은 내부 문서까지 검색해야 하므로 이 지름길을 쓰지 않는다.
  const publicShortcuts = !options.includeInternalDocs
  const quickAnswer = publicShortcuts ? buildServiceQuickAnswer(question) : null
  if (quickAnswer) {
    const quickCore: ChatbotCore = { question, ...quickAnswer, latencyMs: elapsedSince(startedAt) }
    return gatePreparedCore(quickCore, quickAnswer.gateExempt ? null : quickAnswer.gateOriginal ?? "service", options, startedAt)
  }

  if (publicShortcuts && isEnglishSupportRequest(question.redacted)) {
    return buildEnglishSupportCore(question, startedAt)
  }

  if (wantsImmediateHumanHandoff(question)) {
    // 화난·반복 문의나 연결을 직접 청한 말은 그대로 연결한다. 낱말만 걸린 약한 신호만 관문이 확인한다.
    return gatePreparedCore(
      buildImmediateHandoffCore(question, startedAt),
      publicShortcuts && isWeakHandoffSignal(question) ? "handoff:weak-signal" : null,
      options,
      startedAt
    )
  }

  const routingTone = detectConversationTone(question.redacted)
  if (publicShortcuts && isTriedAlreadyUpset(question)) {
    return buildTriedAlreadyCore(question, startedAt)
  }

  const routingText = glossForRouting(question.redacted)
  const csFigmaGuide = findCsFigmaGuideForQuestion(routingText)
  // 증상형 질문("녹화 안 돼요", "기관 등록 안됨", "에러나요")은 공개 문제 해결 문서 섹션으로 바로 답한다.
  // Figma 가이드의 알려진 의도(예: 늦게 가입한 학생 다시보기)가 맞으면 그 가이드를 먼저 쓴다.
  const symptomTriage = publicShortcuts ? resolveSymptomTriageForQuestion(routingText, csFigmaGuide) : null
  if (symptomTriage) {
    const symptomCore: ChatbotCore = { question, ...symptomCoreParts(symptomTriage), latencyMs: elapsedSince(startedAt) }
    return gatePreparedCore(symptomCore, `symptom:${symptomTriage.topicId ?? "triage"}`, options, startedAt)
  }

  // "저번에 말한 거 또 그래요"처럼 지난 대화를 전제로 한 짧은 질문: 볼 수 없다고 밝히고 한 줄만 되묻는다.
  // 같은 대화의 앞 턴을 가리키는 말("아까 그거", "또 안 돼요")이고 직전 턴을 받았으면 볼 수 있으므로 이 지름길을 타지 않는다
  // (검색용 질문을 직전 질문으로 넓혀 앞 턴 주제로 답한다, 2026-11-20 조사 G2). 다른 창·지난 문의는 지금처럼 답한다.
  const sameChatWithTurn =
    prepared.turn.expanded && detectConversationTone(prepared.utterance.redacted).priorKind === "same_chat"
  if (
    publicShortcuts &&
    routingTone.priorContext &&
    !sameChatWithTurn &&
    question.redacted.replace(/\s+/g, "").length <= 60
  ) {
    const response = buildPriorContextClarifyResponse(routingText)
    return {
      question,
      response,
      category: "troubleshooting",
      intent: "troubleshooting",
      handoffIntent: "support",
      latencyMs: elapsedSince(startedAt),
      englishSummary:
        "I can't see our earlier chat or past inquiries. Tell me in one line what happened again (e.g., 'camera not working'), or tap 상담원 연결 to talk to a person.",
    }
  }

  // 기능이 있는지를 묻는 공개 질문은 조작 가이드가 아니라 기능 안내·문서 검색으로 답한다.
  if (csFigmaGuide && !(publicShortcuts && asksOnlyFeatureExistence(question.redacted.toLowerCase()))) {
    const guideCore: ChatbotCore = {
      question,
      ...csFigmaGuideCoreParts(csFigmaGuide, question.redacted),
      latencyMs: elapsedSince(startedAt),
    }
    return gatePreparedCore(guideCore, `guide:${csFigmaGuide.slug}`, options, startedAt)
  }

  // 같은 검색용 질문은 캐시된 답변으로 즉시 응답 — 검색·Gemini를 통째로 건너뛴다. 세션 이력은 generate 모드에서만 답에 들어간다.
  if (isAnswerCacheAllowed(options)) {
    const cached = getCachedAnswer(question, options, pageKey)
    if (cached) {
      return {
        question,
        response: cached.response,
        category: cached.category,
        intent: cached.intent,
        handoffIntent: cached.handoffIntent,
        warning: cached.warning,
        latencyMs: elapsedSince(startedAt),
        retrievalCacheHit: true,
      }
    }
  }

  // history는 검색·분류와 무관하므로 검색과 병렬로 시작해 두고 Gemini 직전에만 await한다.
  // 이력은 generate 모드의 답 다시 쓰기에만 쓴다(select·off 모드는 읽지 않는다).
  const historyPromise: Promise<{ role: "user" | "model"; parts: { text: string }[] }[]> =
    shouldGenerateAnswer && options.sessionId && getFinalAnswerLlmMode() === "generate"
      ? loadSessionHistory(options.sessionId, options.anonymousId)
      : Promise.resolve([])

  const searchedRaw = await searchKnowledgeSourcesWithinBudget(question, options)
  // 문서 페이지에서 그 문서를 가리키는 질문이면 그 문서 절을 후보 맨 앞에 둔다(2026-11-20 조사 G10).
  const searched = prepared.pageDoc ? withPageDocFirst(searchedRaw, prepared.pageDoc, question) : searchedRaw
  const { sources, warning, cacheHit, evidencePool } = searched
  const classificationSources = sources.filter((source) => source.score >= MIN_DIRECT_SOURCE_SCORE)
  const classified = classifyChatbotQuestion(
    question.redacted,
    classificationSources.map((source) => source.category)
  )
  let category: string = classified.category
  let { intent, handoffIntent } = classified
  let response = composeAnswer(question, sources, category, { internal: options.includeInternalDocs === true })

  // 분류별·제목 틀 답도 정해 둔 답이다. 내보내기 전에 관문이 확인하고, 버리면 이미 검색한 결과로 문서 경로를 탄다.
  let answerGate: AnswerGateTrace | undefined
  let secondChance: SecondChanceTrace | undefined
  const templateOriginal = shouldRunAnswerGate(options) ? getComposedTemplateOriginal(response) : null
  if (templateOriginal) {
    const gated = await gatePreparedCore(
      { question, response, category, intent, handoffIntent, warning, latencyMs: 0 },
      templateOriginal,
      options,
      startedAt,
      searched
    )
    answerGate = gated.answerGate
    secondChance = gated.secondChance
    if (gated.response !== response) {
      ;({ response, category, intent, handoffIntent } = gated)
    }
  }

  let selectionStatus: EvidenceSelectionOutcome["status"] | undefined
  if (shouldGenerateAnswer && shouldUseAiFinalAnswer(response, question, category)) {
    const llmMode = getFinalAnswerLlmMode()
    const selection = await applyEvidenceSelection(
      response,
      question,
      category,
      evidencePool,
      llmMode === "generate" ? GENERATE_MODE_SELECTION_TIMEOUT_MS : undefined
    )
    selectionStatus = selection.status

    if (shouldGenerateAfterSelection(llmMode, selection)) {
      const history = await historyPromise
      const generationSources = selection.status === "selected" ? selection.evidenceSources : response.sources
      const finalAnswer = await withTimeoutFallback({
        promise: generateUsableAnswerWithProgressiveModels((tier) =>
          generateChatbotFinalAnswer({
            question: question.redacted,
            category,
            intent,
            answerMode: response.answerMode,
            draftAnswer: response.answer,
            sources: generationSources,
            tier,
            history,
            handoffIntent,
            sessionId: options.sessionId ?? null,
            onUsage: (usage) => rememberAnswerUsage(response, usage),
          })
        ),
        timeoutMs: getFinalAnswerTimeoutMs(),
        fallback: () => null,
        onTimeout: () => {
          console.warn("[chatbot] final answer generation timed out; using deterministic draft.")
        },
      })
      if (finalAnswer) {
        applyGeneratedFinalAnswer(response, question, category, finalAnswer)
      }
    }
  }

  // 근거 선별을 이 뒤에서 하는 스트리밍 경로만 초안을 그대로 넘긴다. 모델 없이 초안만 만드는 평가 호출도
  // 낱말 목록 밖 질문에 고르지 않은 검색 조각을 답으로 내지 않는다.
  if (!options.deferEvidenceSelection) {
    withholdUnverifiedDraft(response, question, selectionStatus, options.includeInternalDocs === true, prepared.trace)
  }
  if (selectionStatus === "failed") selectionFailedResponses.add(response)

  // 여기까지 못 찾음이면 목차에서 다시 고르는 두 번째 검색. 스트리밍 경로는 선별 뒤에 같은 함수를 부른다.
  // 모델 없이 초안만 만드는 평가 호출(generateAnswer=false)과 내부 CS 경로는 돌리지 않는다.
  if (shouldGenerateAnswer && !options.deferEvidenceSelection && !options.includeInternalDocs) {
    const trace = await applySecondChanceRetrieval(response, question, category, startedAt)
    if (!secondChance || trace.secondChance !== "none") secondChance = trace
  }

  finalizeAnswer(response)

  // 이력이 답에 들어가는 generate 모드의 세션 질문은 캐시하지 않는다(isAnswerCacheAllowed).
  // 관문 판정·두 번째 검색이 실패·시간 초과로 빠진 답은 캐시하지 않는다(다음 요청에서 다시 확인한다).
  if (
    isAnswerCacheAllowed(options) &&
    !isAnswerGateFailure(answerGate) &&
    !isSecondChanceFailure(secondChance) &&
    !selectionFailedResponses.has(response)
  ) {
    setCachedAnswer(question, { response, category, intent, handoffIntent, warning }, options, pageKey)
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
    evidencePool,
    answerGate,
    secondChance,
  }
}

export async function handleChatbotQuery(
  input: ChatbotQueryRequest,
  meta: ChatbotRequestMeta = {}
): Promise<ChatbotQueryResponse> {
  const requestedSessionId = normalizeOptionalUuid(input.sessionId)
  const sessionId = requestedSessionId ?? (hasSupabaseServerEnv() ? crypto.randomUUID() : undefined)
  const answerEventId = hasSupabaseServerEnv() ? crypto.randomUUID() : undefined
  const core = await buildChatbotCore(input.message, {
    sessionId: requestedSessionId,
    anonymousId: normalizeString(input.anonymousId) ?? null,
    ...conversationInputFromRequest(input),
  })

  void persistExchange(
    input,
    core.utterance ?? core.question,
    core.response,
    meta,
    core.category,
    core.intent,
    core.handoffIntent,
    core.latencyMs,
    sessionId,
    answerEventId
  )

  return {
    ...core.response,
    answerEventId,
    sessionId,
    handoffIntent: core.handoffIntent,
    sources: shouldExposeSources(input) ? core.response.sources : [],
    warning: core.warning,
  }
}

/**
 * 품질 평가용 진입점. 실제 검색·답변 파이프라인을 그대로 타되 분석 로그에 저장하지 않는다.
 * 골든셋 평가(lib/chatbot/eval.ts)가 분석 데이터를 오염시키지 않도록 한다.
 */
export async function evaluateChatbotQuery(
  message: string,
  options: {
    generateAnswer?: boolean
    includeInternalDocs?: boolean
    /** 직전 한 턴(위젯이 보내는 context.previousTurn 과 같은 꼴). 측정 스크립트가 대화 입력을 돌릴 때 넘긴다. */
    previousTurn?: unknown
    /** 문서 페이지 경로(위젯의 context.pagePath 와 같다). */
    pagePath?: string
  } = {}
): Promise<
  ChatbotQueryResponse & {
    detectedCategory: string
    detectedIntent: ChatbotIntent
    answerGate: AnswerGateTrace
    secondChance: SecondChanceTrace
    /** 답 색인 흔적(compiled 라우터일 때만, 답 색인 사양 §3.7). 측정 스크립트가 결과 줄에 싣는다. */
    answerIndex?: AnswerIndexTrace
    /** 검색용 질문을 직전 질문으로 넓혔는지(대화 맥락, 측정용). */
    contextExpanded: boolean
    /** 대화 맥락 판단(none·short_reply·slot_answer·choice·follow_up·page_context·target_unknown). */
    conversationReason: ConversationTurnReason
  }
> {
  const conversation = options.includeInternalDocs
    ? { previousTurn: null, pagePath: null }
    : parseConversationInput(options.previousTurn, options.pagePath)
  const core = await buildChatbotCore(message, {
    generateAnswer: options.generateAnswer,
    // 내부 CS 코파일럿(context.ts, T2)만 true 를 넘긴다 — 공개 챗봇 경로는 이 옵션을 쓰지 않는다(계약 6).
    includeInternalDocs: options.includeInternalDocs,
    ...conversation,
  })
  return {
    ...core.response,
    handoffIntent: core.handoffIntent,
    warning: core.warning,
    detectedCategory: core.category,
    detectedIntent: core.intent,
    answerGate: core.answerGate ?? { gate: "none" },
    secondChance: core.secondChance ?? { secondChance: "none" },
    ...(core.answerIndex ? { answerIndex: core.answerIndex } : {}),
    contextExpanded: core.conversation?.expanded ?? false,
    conversationReason: core.conversation?.reason ?? "none",
  }
}

export interface ChatbotStreamMeta {
  answerMode: AnswerMode
  confidence: number
  needsHandoff: boolean
  unresolved: boolean
  handoffIntent: HandoffIntent
  detectedCategory: string
  detectedIntent: ChatbotIntent
  sources: ChatbotSource[]
  suggestedQuestions: string[]
  sessionId?: string
  answerEventId?: string
  warning?: string
}

export type ChatbotStreamEvent =
  | { type: "delta"; text: string }
  | { type: "replace"; answer: string }
  | { type: "meta"; meta: ChatbotStreamMeta }
  | { type: "error"; error: string }

// 스트리밍 미리보기에서 단어 중간을 내보내지 않도록, 정제된 텍스트의 마지막 공백/개행 경계 위치를
// 돌려준다(그 인덱스까지만 안전하게 flush). 경계가 없으면 0 → 아직 아무것도 내보내지 않는다.
export function lastSafeBoundary(text: string): number {
  const match = text.match(/[\s\S]*\s/)
  return match ? match[0].length : 0
}

// Gemini 답변을 토큰 단위로 스트리밍하면서 정제된 델타를 emit 하고, 완성된 답변에 길이클램프+사용성
// 게이트를 적용해 response 에 반영한다. 사용 가능한 AI 답변을 만들었으면 true, 아니면 false(=결정형 초안 유지).
// tier 는 basic 고정(딥 폴백은 비스트리밍 기본과 동일하게 opt-in 유지).
async function streamAndApplyFinalAnswer({
  question,
  category,
  intent,
  response,
  historyPromise,
  emit,
  handoffIntent,
  sessionId,
  sources,
}: {
  question: NormalizedQuestion
  category: string
  intent: string
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
  historyPromise: Promise<{ role: "user" | "model"; parts: { text: string }[] }[]>
  emit: (event: ChatbotStreamEvent) => void
  handoffIntent?: HandoffIntent
  sessionId?: string
  /** 근거 선별이 고른 문장만 담은 출처. 없으면 응답의 출처를 그대로 쓴다. */
  sources?: ChatbotSource[]
}): Promise<boolean> {
  const history = await historyPromise
  let raw = ""
  let emittedLen = 0

  const onChunk = (chunk: string) => {
    raw += chunk
    const sanitized = sanitizePublicAnswerText(raw)
    const safeEnd = lastSafeBoundary(sanitized)
    if (safeEnd > emittedLen) {
      emit({ type: "delta", text: sanitized.slice(emittedLen, safeEnd) })
      emittedLen = safeEnd
    }
  }

  await withTimeoutFallback({
    promise: (async () => {
      for await (const chunk of streamChatbotFinalAnswer({
        question: question.redacted,
        category,
        intent,
        answerMode: response.answerMode,
        draftAnswer: response.answer,
        sources: sources ?? response.sources,
        tier: "basic",
        history,
        handoffIntent,
        sessionId: sessionId ?? null,
        onUsage: (usage) => rememberAnswerUsage(response, usage),
      })) {
        onChunk(chunk)
      }
      return true
    })(),
    timeoutMs: getFinalAnswerStreamTimeoutMs(),
    fallback: () => false,
    onTimeout: () => console.warn("[chatbot] streaming final answer timed out; using deterministic draft."),
  })

  const finalAnswer = clampAnswerToLength(sanitizePublicAnswerText(raw))
  if (!finalAnswer || !isUsableGeneratedAnswer(finalAnswer)) {
    return false
  }
  applyGeneratedFinalAnswer(response, question, category, finalAnswer)
  return true
}

/**
 * 스트리밍 진입점. handleChatbotQuery 와 동일한 검색·분류·결정형 초안 파이프라인(buildChatbotCore)을
 * 재사용하되, Gemini 최종 답변만 토큰 스트리밍으로 내보낸다.
 * 와이어 프로토콜(NDJSON): delta(텍스트 추가) → replace(정제된 최종본 확정) → meta(출처/제안/세션 등).
 * 모든 안전 게이트(정제·길이클램프·사용성 판정·결정형 폴백)는 비스트리밍 경로와 동일하게 유지한다.
 */
/** compiled 라우터가 범위 안에서 정한 코어(색인 판정·색인 앞 단계 답). 인사·거절 답·범위 밖 질문은 지금 흐름 코어라 아니다. */
function isCompiledFinalCore(core: ChatbotCore) {
  const trace = core.answerIndex
  if (!trace || trace.router !== "compiled" || trace.scope !== "in") return false
  return trace.decision !== null || (trace.pre !== null && trace.pre !== undefined && trace.pre !== "greeting" && trace.pre !== "policy_guard")
}

export async function streamChatbotQuery(
  input: ChatbotQueryRequest,
  meta: ChatbotRequestMeta,
  emit: (event: ChatbotStreamEvent) => void
): Promise<void> {
  const startedAt = Date.now()
  const requestedSessionId = normalizeOptionalUuid(input.sessionId)
  const sessionId = requestedSessionId ?? (hasSupabaseServerEnv() ? crypto.randomUUID() : undefined)
  const answerEventId = hasSupabaseServerEnv() ? crypto.randomUUID() : undefined

  const emitMeta = (
    response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
    category: string,
    intent: ChatbotIntent,
    handoffIntent: HandoffIntent,
    warning?: string
  ) => {
    emit({
      type: "meta",
      meta: {
        answerMode: response.answerMode,
        confidence: response.confidence,
        needsHandoff: response.needsHandoff,
        unresolved: response.unresolved,
        handoffIntent,
        detectedCategory: category,
        detectedIntent: intent,
        sources: shouldExposeSources(input) ? response.sources : [],
        suggestedQuestions: response.suggestedQuestions,
        sessionId,
        answerEventId,
        warning,
      },
    })
  }

  // 대화 맥락(직전 한 턴·문서 페이지). 일반 경로와 같은 검사·같은 넓히기를 한다.
  const coreOptions: BuildChatbotCoreOptions = {
    generateAnswer: false,
    deferEvidenceSelection: true,
    answerGate: true,
    ...conversationInputFromRequest(input),
  }

  // 같은 검색용 질문은 캐시된 답변을 즉시 확정해 검색·생성을 통째로 건너뛴다(generate 모드의 세션 질문만 빼고, 일반 경로와 같은 규칙).
  // 증상 안내 뒤 "또 안 돼요"(상담 연결로 잇는 답)는 캐시를 보지 않는다.
  const prepared = prepareConversationTurn(input.message, coreOptions)
  if (isAnswerCacheAllowed({ sessionId: requestedSessionId }) && !prepared.triedAgain) {
    const cachedQuestion = prepared.question
    const cached = getCachedAnswer(cachedQuestion, undefined, prepared.trace.pagePath ?? null)
    if (cached) {
      // 캐시는 말투 계층 적용 전 사본일 수 있다 — 비스트림과 같은 최종본이 되게 여기서도 적용한다.
      const cachedCore: ChatbotCore = {
        question: cachedQuestion,
        ...(prepared.turn.expanded ? { utterance: prepared.utterance } : {}),
        conversation: prepared.trace,
        response: cached.response,
        category: cached.category,
        intent: cached.intent,
        handoffIntent: cached.handoffIntent,
        warning: cached.warning,
        latencyMs: 0,
      }
      applyConversationTone(cachedCore)
      cached.handoffIntent = cachedCore.handoffIntent
      emit({ type: "replace", answer: cached.response.answer })
      emitMeta(cached.response, cached.category, cached.intent, cached.handoffIntent, cached.warning)
      void persistExchange(
        input,
        prepared.utterance,
        cached.response,
        meta,
        cached.category,
        cached.intent,
        cached.handoffIntent,
        elapsedSince(startedAt),
        sessionId,
        answerEventId
      )
      return
    }
  }

  // 이력은 검색·분류와 무관하므로 검색과 병렬로 시작해 두고 스트리밍 직전에만 await 한다.
  // compiled 라우터는 범위 안 질문을 이력 없이 정하므로(네트워크 호출 0, 답 색인 사양 §3.10) 이력이 필요해질 때만 읽는다.
  const loadHistory = () =>
    requestedSessionId
      ? loadSessionHistory(requestedSessionId, normalizeString(input.anonymousId) ?? null)
      : Promise.resolve([])
  // 이력은 generate 모드의 답 다시 쓰기에만 쓴다.
  const eagerHistoryPromise = getAnswerRouter() === "compiled" || getFinalAnswerLlmMode() !== "generate" ? null : loadHistory()

  // 검색·분류·결정형 초안까지는 기존 코어를 그대로 재사용(중복 방지). Gemini 호출만 스트리밍으로 대체.
  // 정해 둔 답 확인 관문은 코어 안에서 일반 경로와 같이 돈다. 판정이 날 때까지 아무것도 내보내지 않으므로 틀린 답이 잠깐 보였다 바뀌지 않는다.
  const core = await buildChatbotCore(input.message, coreOptions)
  const { question, response, category, intent, warning } = core

  // 인사·정책 가드 응답은 buildChatbotCore 가 조기 반환한 '최종 답변'이다(정책 가드는 보안 거절 등).
  // 이 경우 AI 재작성을 적용하면 안 된다 — handleChatbotQuery 의 조기 반환 의미와 동일하게 맞춘다.
  // 답 색인(compiled)이 범위 안에서 정한 답도 결정형 최종 답이다: 선별·보류·두 번째 검색을 돌리지 않고 한 번에 내보낸다
  // (일반 경로도 그 코어를 그대로 돌려준다 — stream 과 non-stream 의 답·상담 버튼이 같다).
  const isShortCircuited =
    isGreetingOnly(question) || Boolean(buildPolicyGuardResponse(question)) || isCompiledFinalCore(core)
  let selectionStatus: EvidenceSelectionOutcome["status"] | undefined
  if (!isShortCircuited && shouldUseAiFinalAnswer(response, question, category)) {
    const llmMode = getFinalAnswerLlmMode()
    const selection = await applyEvidenceSelection(
      response,
      question,
      category,
      core.evidencePool,
      llmMode === "generate" ? GENERATE_MODE_SELECTION_TIMEOUT_MS : undefined
    )
    selectionStatus = selection.status

    if (shouldGenerateAfterSelection(llmMode, selection)) {
      await streamAndApplyFinalAnswer({
        question,
        category,
        intent,
        response,
        historyPromise: eagerHistoryPromise ?? loadHistory(),
        emit,
        handoffIntent: core.handoffIntent,
        sessionId,
        sources: selection.status === "selected" ? selection.evidenceSources : undefined,
      })
      applyConversationTone(core)
    } else if (selection.status === "selected" || selection.status === "not_found") {
      // 선별이 답을 바꿨으면 말투·끝 질문 층을 새 답에 다시 입힌다.
      applyConversationTone(core)
    }
  }

  // 스트림 경로는 말투 층을 코어에서 이미 입혔다. 보류가 답을 못 찾음으로 갈아 끼웠으면 공감 첫마디·상담 연결을 다시 입혀
  // 일반 경로(보류 → 말투 순서)와 같은 답·같은 연결 표시를 낸다.
  const withheld = !isShortCircuited && withholdUnverifiedDraft(response, question, selectionStatus, false, core.conversation)
  if (selectionStatus === "failed") selectionFailedResponses.add(response)

  // 일반 경로와 같은 두 번째 검색(못 찾음 답일 때만). 관문 문서 경로에서 이미 돌린 답은 다시 돌리지 않는다.
  let secondChance = core.secondChance
  let secondChanceChangedAnswer = false
  if (!isShortCircuited) {
    const trace = await applySecondChanceRetrieval(response, question, category, startedAt)
    if (trace.secondChance !== "none") secondChance = trace
    // 찾았거나(hit), 차단기 때문에 못 돌려 고정 문구로 바꿨으면(miss·model_unavailable) 답이 바뀌었다.
    secondChanceChangedAnswer =
      trace.secondChance === "hit" || (trace.secondChance === "miss" && trace.reason === "model_unavailable")
  }
  // 답이 바뀌었으면 말투·끝 질문 층을 새 답에 다시 입힌다(일반 경로는 코어 뒤에서 한 번 입힌다).
  if (withheld || secondChanceChangedAnswer) applyConversationTone(core)
  const handoffIntent = core.handoffIntent

  finalizeAnswer(response)

  // 스트림 델타가 끝난 뒤(또는 AI 미사용 시) 정제된 최종본을 권위 있는 replace 로 확정한다.
  emit({ type: "replace", answer: response.answer })

  // 이력 의존 답(generate 모드의 세션 질문)은 캐시하지 않는다 — handleChatbotQuery 와 동일 규칙.
  if (
    isAnswerCacheAllowed({ sessionId: requestedSessionId }) &&
    !prepared.triedAgain &&
    !isAnswerGateFailure(core.answerGate) &&
    !isSecondChanceFailure(secondChance) &&
    !selectionFailedResponses.has(response)
  ) {
    setCachedAnswer(question, { response, category, intent, handoffIntent, warning }, undefined, core.conversation?.pagePath ?? null)
  }

  emitMeta(response, category, intent, handoffIntent, warning)

  void persistExchange(
    input,
    core.utterance ?? question,
    response,
    meta,
    category,
    intent,
    handoffIntent,
    elapsedSince(startedAt),
    sessionId,
    answerEventId
  )
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

  // 피드백 저장(=고객 응답 해소) 은 answer event 유입만큼 잦지 않고, 운영자가 방금 남긴
  // 피드백을 대시보드에서 바로 확인하고 싶어할 만한 이벤트라 캐시를 즉시 무효화한다.
  // 반면 매 질의마다 쌓이는 answer event 자체는 무효화하지 않고 60초 TTL에만 맡긴다
  // (getChatbotStats 캐시 정의부 주석 참고) — 그렇게 하지 않으면 트래픽마다 캐시가 무의미해진다.
  revalidateTag(CHATBOT_STATS_CACHE_TAG, "max")

  try {
    await maybeCreateChannelTalkFeedbackHandoff(answerEventId, {
      rating,
      comment: comment ? redactPii(comment.replace(/\s+/g, " ").trim()) : null,
    })
  } catch (error) {
    console.warn(
      "[chatbot] feedback handoff failed:",
      error instanceof Error ? error.message : error
    )
    return {
      ok: true,
      stored: true,
      warning: "피드백은 저장했지만 후속 전달은 처리하지 못했습니다.",
    }
  }

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

// getChatbotStats 는 기존에 서버 캐시가 전혀 없었다 — /admin/chatbot 을 열 때마다(콜드
// Fluid 인스턴스 포함) daily 통계·feedback 통계·chatbot_answer_events 1000행 읽기까지 매번
// 다시 실행됐다. unstable_cache(Next Data Cache)는 인스턴스 간 공유되고 stale-while-revalidate
// 로 응답하므로 60초 안에서는 재방문·다른 콜드 인스턴스 모두 DB 왕복 없이 같은 값을 받는다.
// from/to 는 URLSearchParams 자체가 아니라 이미 정규화한 문자열로 넘겨야 unstable_cache 의
// 인자 기반 캐시 키가 실제로 요청 범위별로 갈린다(URLSearchParams 인스턴스는 매번 새 객체라
// 키로 쓸 수 없다). 반환값은 숫자·문자열·배열로만 구성돼 JSON 직렬화 가능하고 크기도 작다.
async function computeChatbotStats(from: string, to: string | undefined) {
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

const getCachedChatbotStats = unstable_cache(
  async (from: string, to: string | undefined) =>
    assertJsonSafeInDev("chatbot-stats", await computeChatbotStats(from, to)),
  ["chatbot-stats-v1"],
  { revalidate: 60, tags: [CHATBOT_STATS_CACHE_TAG] }
)

export async function getChatbotStats(params: URLSearchParams) {
  const from = toDateOnlyParam(params.get("from")) ?? getDefaultFromDate()
  const to = toDateOnlyParam(params.get("to"))
  return getCachedChatbotStats(from, to)
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

  // 상태 변경/문서 매핑(merge)/회귀 후보 승격 — 문서 보강 큐(listDocGapBacklog)가 읽는
  // question_clusters 를 어드민이 직접 큐레이션하는 경로다. upsertQuestionCluster(공개 챗봇
  // 응답 저장 + 내부 CS 유입)는 훨씬 고빈도라 그대로 TTL(60초)에 맡기지만, 이 경로는 어드민의
  // 명시적 조작이라 즉시 반영이 운영자 눈에 자연스럽다 — "max"로 다음 조회부터 바로 신선화한다.
  revalidateTag(DOC_GAP_BACKLOG_CACHE_TAG, "max")

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
