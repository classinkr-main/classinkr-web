import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getDocPath, listDocs, type DocArticle } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import {
  classifyChatbotQuestion,
  type ChatbotIntent,
} from "@/lib/chatbot/classification"
import { findChatbotSelfKnowledgeEntry } from "@/lib/chatbot/self-knowledge"
import {
  generateGeminiFinalAnswer,
  streamGeminiFinalAnswer,
  clampAnswerToLength,
  embedText,
  sanitizePublicAnswerText,
  type ChatbotModelTier,
} from "@/lib/chatbot/llm"
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
  formatCsFigmaGuideAnswer,
  getCsFigmaGuideDocPath,
  isCsFigmaSymptomQuestion,
  sanitizeGuideStep,
} from "@/lib/cs-figma-guides"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"

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
const RETRIEVAL_CACHE_VERSION = "rag-rerank-20260629-v5"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHAT_SESSION_CHANNELS = new Set(["web", "admin_preview", "partner_portal", "manual_import"])
const PROGRESSIVE_MODEL_TIERS: ChatbotModelTier[] = ["basic", "reasoning", "advanced"]

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

function redactPii(value: string) {
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

// 답변 레벨 캐시 — 세션(대화 이력)이 없는 동일 질문은 검색·Gemini를 통째로 건너뛴다.
interface CachedAnswerEntry {
  response: ReturnType<typeof composeAnswer>
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  warning?: string
}

const ANSWER_CACHE_VERSION = "answer-20260629-v6"
const ANSWER_CACHE_TTL_MS = 5 * 60 * 1000
const ANSWER_CACHE_MAX = 200
const answerCache = new Map<string, { expiresAt: number; value: CachedAnswerEntry }>()

function getAnswerCacheKey(question: NormalizedQuestion) {
  const backend = hasSupabaseServerEnv() ? "supabase" : "static"
  return `${ANSWER_CACHE_VERSION}:${backend}:${buildRetrievalQueryText(question).toLowerCase()}`
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

function getCachedAnswer(question: NormalizedQuestion): CachedAnswerEntry | null {
  const key = getAnswerCacheKey(question)
  const cached = answerCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    answerCache.delete(key)
    return null
  }
  return cloneCachedAnswer(cached.value)
}

function setCachedAnswer(question: NormalizedQuestion, value: CachedAnswerEntry) {
  if (answerCache.size >= ANSWER_CACHE_MAX) {
    const firstKey = answerCache.keys().next().value
    if (firstKey) answerCache.delete(firstKey)
  }
  answerCache.set(getAnswerCacheKey(question), {
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

export function validateChatbotQueryInput(input: ChatbotQueryRequest): void {
  normalizeQuestion(input.message)
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
  /sql\s*injection|sqli|union\s+select|drop\s+table|or\s+1\s*=\s*1|information_schema|xp_cmdshell|xss|csrf|ssrf|rce|프롬프트\s*인젝션|system\s*prompt|developer\s*(?:message|instruction)|시스템\s*프롬프트|개발자\s*메시지|(?:개발자|시스템|숨겨진|비공개).{0,12}(?:지침|규칙|지시|명령어?|명령문).{0,16}(?:원문|보여|출력|공개|알려|노출|그대로)|(?:개발자|시스템).{0,10}(?:준|받은).{0,10}(?:지침|규칙|지시|명령어?|명령문).{0,16}(?:원문|보여|출력|공개|알려|노출|그대로)|내부\s*(?:프롬프트|규칙|지시|명령어?|명령문)|(?:프롬프트|prompt|지시문).{0,16}(?:보여|출력|공개|알려|노출|그대로)|(?:보여|출력|공개|알려|노출).{0,16}(?:프롬프트|prompt|지시문)|(?:이전|위|앞선).{0,12}(?:지시|규칙|프롬프트).{0,12}(?:무시|잊어|삭제)|보안.{0,12}(?:뚫|우회|공격)|취약점.{0,12}(?:공격|악용|우회)|해킹.{0,12}(?:방법|공격|뚫|탈취|우회)|(?:비밀번호|토큰|api\s*key|관리자).{0,12}(?:탈취|훔|우회|크랙)/i
const CRIMINAL_ABUSE_RE =
  /(?:범죄|불법|사기|피싱|스미싱|절도|도둑|마약|폭탄|무기|살인|폭행).{0,18}(?:방법|하는\s*법|계획|도와|만들|제조|우회|탈취|공격|훔|숨기|피하)|(?:방법|하는\s*법|계획).{0,18}(?:범죄|불법|사기|피싱|스미싱|절도|마약|폭탄|무기|살인|폭행)/i
const TOKEN_WASTE_RE =
  /토큰.{0,12}(?:낭비|소모|다\s*써|태워)|(?:무한|계속).{0,8}반복|(?:1000|10000|10,000|만\s*번).{0,12}(?:반복|써|출력)|(?:반복|출력).{0,12}(?:1000|10000|10,000|만\s*번)/i

function isUnsupportedAcademyPaymentFeatureQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return (
    ACADEMY_PAYMENT_ACTION_RE.test(text) &&
    ACADEMY_PAYMENT_SUBJECT_RE.test(text) &&
    CAPABILITY_REQUEST_RE.test(text)
  )
}

function buildPolicyGuardResponse(question: NormalizedQuestion): {
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
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
    }
  }

  if (PROMPT_OR_SECURITY_ABUSE_RE.test(text)) {
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

  const selfKnowledgeEntry = findChatbotSelfKnowledgeEntry(question.redacted)
  if (selfKnowledgeEntry) {
    return {
      response: {
        answer: selfKnowledgeEntry.answer.join("\n\n"),
        answerMode: "direct_answer",
        confidence: 0.92,
        needsHandoff: false,
        sources: [],
        suggestedQuestions: selfKnowledgeEntry.suggestedQuestions,
        unresolved: false,
      },
      category: "general",
      intent: "self_knowledge",
      handoffIntent: "demo",
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
  /학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|줌|화상회의|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차이|비교|차별|차별점|장점|왜\s*(써|쓰|필요|도입)|일반\s*전자칠판|기존\s*전자칠판|왜\s*전자칠판|edb|이\s*디\s*비|칠판\s*파일|가격\s*부담|비싸|api|sdk|연동|데이터\s*구독|도구.*흩어|녹화.*관리/

const PRE_ADOPTION_CHECK_RE =
  /도입\s*전.*(22|질문|체크리스트|확인)|22\s*가지\s*질문|22.*도입|구매\s*전.*(질문|체크리스트|확인)|상담\s*전.*(질문|체크리스트|확인)/
const PRE_ADOPTION_RECORDING_PERMISSION_RE =
  /(수업\s*녹화|현장\s*녹화|녹화).{0,18}(누가|권한|관리|저장|확인|볼|다운로드)|(누가|권한).{0,18}(수업\s*녹화|현장\s*녹화|녹화)/i
const PRE_ADOPTION_SIGNUP_INFO_RE =
  /(회원\s*가입|가입).{0,20}(개인정보|전화번호|이메일|메일|휴대폰|핸드폰|정보|뭐|무엇)|(개인정보|전화번호|이메일|메일|휴대폰|핸드폰).{0,20}(회원\s*가입|가입)/i
const PRE_ADOPTION_OFFLINE_BOARD_RE =
  /(오프라인|인터넷\s*없|네트워크\s*없|와이파이\s*없).{0,18}(칠판|판서|전자칠판|보드)|(칠판|판서|전자칠판|보드).{0,18}(오프라인|인터넷\s*없|네트워크\s*없|와이파이\s*없)/i
const PRE_ADOPTION_POLICY_CONFIRM_RE =
  /무료\s*관리자|유료\s*관리자|관리자.{0,12}(권한|무료|유료)|유료\s*전환|사용\s*기간|계약\s*기간|언제까지\s*(사용|쓸)|정기\s*결제|결제.{0,10}포함|포함\s*항목|콘텐츠\s*소유권|소유권|개인정보\s*(처리|보관|관리|방침)|서버(?:는|가|의)?\s*(위치|지역|어디)|메인\s*서버(?:는|가|의)?\s*(위치|지역|어디)?|스토리지.{0,12}(용량|단가|추가|가격)|클라우드.{0,12}(용량|저장|단가|추가)|저장\s*(용량|공간)|펜\s*팁|전용\s*펜|소모품.{0,12}(가격|구매|재고)|팁.{0,12}(가격|구매|재고)/i
const PRE_ADOPTION_HARDWARE_CONDITIONAL_RE =
  /카메라.{0,18}(화각|추적|트래킹|조정|전경|클로즈업)|마이크.{0,18}(성능|외부|세팅|설정|가능)|외부\s*(pc|컴퓨터|노트북)|따로\s*(pc|컴퓨터|노트북)|ops|컴퓨터.{0,12}(연결|따로|없이)/i
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
  /zoom|줌|화상회의|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차이|비교|차별|차별점|장점|왜\s*(써|쓰|필요|도입)|일반\s*전자칠판|기존\s*전자칠판/

// 시중 경쟁 전자칠판 브랜드를 콕 집어 묻는 비교 질문 인식용.
// 정책: 트리거로 비교 의도만 인식하고, 답변에서는 브랜드명을 노출하거나 타사 사양·우열을 단정하지 않는다.
// 대신 '일반 전자칠판 대비' Classin Board 차별점(내장 OPS·EDB·녹화/복습/LMS·관리자 데이터)으로 전환한다.
const COMPETITOR_BOARD_RE =
  /넥소|nexo|삼성\s*플립|samsung\s*flip|뷰소닉|viewsonic|프로메테안|promethean|맥스허브|maxhub|아하\s*(보드|칠판)|시중\s*(전자\s*)?칠판|타사\s*(전자\s*)?칠판|다른\s*(회사|브랜드|업체)\s*(의\s*)?(전자\s*)?칠판|(삼성|lg|엘지)\s*(전자칠판|칠판|보드|플립|패널)/i

const IDENTITY_RE =
  /(classin|클래스인).*(뭐야|뭐예요|뭐에요|무엇|뭔가요|뭔데|뭐임|뭐\s*하는|어떤\s*(서비스|제품|솔루션|도구|플랫폼)|소개|설명)|(뭐야|뭐예요|뭐에요|무엇|뭔가요|뭔데|뭐임|뭐\s*하는|어떤\s*(서비스|제품|솔루션|도구|플랫폼)|소개|설명).*(classin|클래스인)/

const IDENTITY_EXCLUSION_RE =
  /가격|요금|견적|결제|환불|취소|영수증|세금|계산서|청구|구독|하드웨어|전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|설치|납품|배송|\bas\b|a\/s|수리|고장|파손|오류|에러|안됨|안\s*돼|로그인|계정|비밀번호|접속|권한|장애|끊김/

// 명시적 보드 단어(전자칠판/보드/칠판/모델명)는 무조건 하드웨어 타깃으로 본다.
const HARDWARE_TARGET_RE =
  /classin\s*board|클래스인\s*보드|classin.*하드웨어|클래스인.*하드웨어|전자칠판|하드웨어|\bboard\b|보드|칠판|s65|s75|s86|s98|s110|bs65|bs75|bs86|bscp98|bs110/i

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
  /스펙|사양|규격|크기|사이즈|인치|두께|가로|세로|치수|외형|\d\s*mm|해상도|화면|ops|터치|주사율|밝기|시야각|마이크|스피커|무선|nfc|무게|중량|소비\s*전력|전력|유리|인증|부속|비교/i

// 대형 공간·특정 대형 모델을 명시적으로 물을 때만 98/110을 공개한다.
const HARDWARE_BIG_MODEL_RE =
  /s\s*98|s98|s\s*110|s110|98\s*인치|110\s*인치|대형|큰\s*(강의실|화면|교실|공간|곳|거|것|모델|사이즈)|제일\s*큰|가장\s*큰|강당|설명회|넓은\s*(강의실|교실|공간)/i

const HARDWARE_TROUBLE_RE =
  /안\s*(켜|켜져|켜지|나와|나오|보여|보이|됨|돼)|꺼져|꺼짐|켜지지|나오지|보이지|먹통|고장|수리|\bas\b|a\/s|오류|에러|문제|장애|전원|검은\s*화면|화면이\s*안|화면\s*(꺼짐|안|나오지|나옴|안\s*나)|소리\s*안|터치\s*안|끊김|끊겨|깜빡|연기|냄새|액체|파손|깨짐|금감|감전|화재/i

const HARDWARE_UNCONFIRMED_DETAIL_RE =
  /색상|색깔|컬러|마감|화이트|블랙|검정|흰색|보증\s*기간|보증기간|무상\s*(as|a\/s|수리)|유상\s*(as|a\/s|수리)|원산지|제조사/i

const HARDWARE_SPECS_EXCERPT =
  "Classin Board는 모델별로 S75, S86, S98 Pro, S110 사양을 우선 확인합니다. 공통으로 4K 해상도, 16:9 화면, 178도 시야각, 밝기 350cd/m² 이상, 50점 적외선 터치, 내장 OPS(Windows OS), Wi-Fi ax/BT5.0, 2×15W 스피커를 기준으로 봅니다. 주요 차이는 화면 크기, 주사율, OPS 구성, 마이크 기재 여부, 무게와 소비전력입니다. S65는 라인업에는 있으나 현재 상세 규격서 확인이 필요합니다."

const HARDWARE_BOARD_LINEUP_EXCERPT =
  "Classin 칠판은 보통 Classin Board 전자칠판 라인업을 뜻합니다. 현재 안내 가능한 주요 모델은 S75, S86, S98 Pro, S110이며, 교실 크기와 맨 뒷자리 시야, 이동형 스탠드/벽걸이, 카메라·마이크 필요 여부로 고릅니다. 75·86인치는 일반 강의실, 98·110인치는 대형 강의실이나 설명회 공간에 더 잘 맞습니다. S65는 라인업에는 있으나 상세 규격 확인이 필요합니다."

const HARDWARE_BOARD_LINEUP_STANDARD_EXCERPT =
  "Classin Board 전자칠판은 보통 75인치(S75)와 86인치(S86)를 표준으로 가장 많이 선택합니다. 일반 강의실 대부분은 이 두 모델로 시작하며, 학생 수와 맨 뒷자리 시야, 이동형 스탠드/벽걸이, 카메라·마이크 필요 여부로 고릅니다. 대형 강의실·강당·설명회처럼 더 큰 공간이라면 추가 라인업도 있으니 상담에서 공간에 맞춰 안내해 드립니다."
const HARDWARE_SPECS_STANDARD_EXCERPT =
  "Classin Board는 75인치(S75)와 86인치(S86)가 표준 모델입니다. 두 모델 모두 4K(3840×2160) 해상도, 16:9 화면, 178도 시야각, 밝기 350cd/m² 이상, 50점 적외선 터치, 내장 OPS(Windows OS), Wi-Fi ax/BT5.0, 2×15W 스피커를 기준으로 봅니다. 외형 치수(가로×세로×두께)는 S75가 1,730.63×1,015.22×95.5mm, S86이 1,976.63×1,153.31×95.5mm이고 베젤은 22mm 슬림입니다. 더 큰 공간을 위한 추가 라인업은 상담에서 공간·예산에 맞춰 안내해 드립니다."

const HARDWARE_TROUBLE_EXCERPT =
  "전자칠판 화면이 안 나오면 전원 플러그와 멀티탭, 오른쪽 측면 하단 전원 버튼, 대기 모드, 입력 소스(OPS/HDMI), HDMI 케이블과 외부 기기 화면 출력을 순서대로 확인합니다. 연기, 냄새, 액체 유입, 파손이 있으면 전원을 분리하고 A/S로 연결합니다."

const HARDWARE_UNCONFIRMED_DETAIL_EXCERPT =
  "공개 스펙 기준으로는 모델별 화면 크기, OPS, 터치, 전력 같은 핵심 사양을 우선 안내할 수 있습니다. 색상, 마감, 보증 기간, 제조·재고 조건처럼 공급 조건에 따라 달라질 수 있는 세부 옵션은 최신 견적·납품 기준 확인이 필요합니다."

const LOGIN_TROUBLE_RE =
  /로그인|접속|비밀번호|패스워드|인증\s*코드|인증코드|아이디|계정.*(안|오류|에러|문제)|안\s*(들어가|돼|됨|되|됩니다)|재설정/i

const LIVE_CLASS_TROUBLE_RE =
  /수업.*(나가|나감|튕김|튕겨|끊김|끊겨|입장\s*안|접속\s*안)|화면\s*공유.*(끊김|끊겨|오류|에러|안\s*됨|안\s*돼)|소리.*(안\s*들|끊김|끊겨)|마이크.*(안\s*됨|안\s*돼|끊김)/i
const PARENT_REPORT_OR_NOTIFICATION_RE =
  /학부모.{0,18}(알림|문자|메시지|푸시|리포트|보고서|상담|피드백)|(?:알림|문자|메시지|푸시|리포트|보고서|상담|피드백).{0,18}학부모/i

function isPositioningQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return POSITIONING_RE.test(text) || COMPETITOR_BOARD_RE.test(text) || isIdentityQuestion(question)
}

function isPreAdoptionCheckQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return PRE_ADOPTION_CHECK_RE.test(text)
}

function isPreAdoptionRecordingPermissionQuestion(question: NormalizedQuestion) {
  return PRE_ADOPTION_RECORDING_PERMISSION_RE.test(question.redacted)
}

function isPreAdoptionSignupInfoQuestion(question: NormalizedQuestion) {
  return PRE_ADOPTION_SIGNUP_INFO_RE.test(question.redacted)
}

function isPreAdoptionOfflineBoardQuestion(question: NormalizedQuestion) {
  return PRE_ADOPTION_OFFLINE_BOARD_RE.test(question.redacted)
}

function isPreAdoptionPolicyConfirmQuestion(question: NormalizedQuestion) {
  return PRE_ADOPTION_POLICY_CONFIRM_RE.test(question.redacted)
}

function isPreAdoptionHardwareConditionalQuestion(question: NormalizedQuestion) {
  return PRE_ADOPTION_HARDWARE_CONDITIONAL_RE.test(question.redacted)
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
  return COMPARISON_RE.test(text) || COMPETITOR_BOARD_RE.test(text)
}

function isIdentityQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return IDENTITY_RE.test(text) && !IDENTITY_EXCLUSION_RE.test(text)
}

function isHardwareSpecsQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return (
    isBoardTargeted(text) &&
    HARDWARE_SPECS_RE.test(text) &&
    !HARDWARE_TROUBLE_RE.test(text) &&
    !isHardwareUnconfirmedDetailQuestion(question)
  )
}

function isHardwareBoardLineupQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
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
  return LOGIN_TROUBLE_RE.test(text)
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
const PRICING_EXCLUDE_RE = /환불|취소|세금|계산서|영수증|청구|정산|미납|연체/i
// "얼마나 걸려요"(기간)는 가격이 아니다 — 돈 단어가 없으면 가격에서 뺀다.
const PRICING_DURATION_RE = /얼마나?\s*(걸리|걸려|걸릴|오래|소요|기간|시간|일|주|개월)/i
const SOFTWARE_ONLY_BUYER_RE =
  /소프트웨어만|프로그램만|앱만|하드웨어\s*없이|전자칠판\s*없이|보드\s*없이|계정당|계정\s*당|플랜|standard|plus|enterprise/i
const SUBSCRIPTION_OR_CONSUMPTION_RE =
  /구독형|충전형|충전제|subscription|consumption|사용량\s*기준|월\s*구독|월구독/i
const TRIAL_OR_PILOT_RE =
  /무료\s*체험|체험판|무료\s*사용|trial|파일럿|pilot|데모.{0,12}(무료|체험)|먼저\s*써/i
function isPricingInfoQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (PRICING_EXCLUDE_RE.test(text)) return false
  if (isWebLiveBillingQuestion(question)) return false
  if (!PRICING_MONEY_RE.test(text) && PRICING_DURATION_RE.test(text)) return false
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
  return TRIAL_OR_PILOT_RE.test(question.redacted.toLowerCase())
}

// 설치 형태(스탠드/벽걸이)와 설치 가능/기간. 하드웨어 장애와는 분리한다.
const INSTALL_FORM_RE = /스탠드|벽걸이|벽\s*부착|벽\s*설치|이동형|거치(대|형)?/i
const INSTALL_HW_CONTEXT_RE = /전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|보드|칠판|하드웨어|교실|벽면|s\s*(?:65|75|86|98|110)\b/i
const INSTALL_INTENT_RE = /가능|돼|되나|될까|할\s*수|하나요|해야|방식|유형|형태|환경|기간|일정|얼마|어떻게|어디/i
function isInstallFormQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (HARDWARE_TROUBLE_RE.test(text)) return false
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
    category: "onboarding",
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
        ? "소프트웨어는 운영 규모에 따라 Standard, Plus, Enterprise처럼 단계가 나뉘고, 구독형·충전형 조건은 기능 범위와 계약에 따라 달라질 수 있습니다. 정확한 금액과 조건은 계정 수, 코스 규모, 필요한 기능 기준으로 확인합니다."
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

  if (/세금\s*계산서|세금계산서|영수증|증빙|청구서|계산서\s*발급/.test(text)) {
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
    isCameraConflictQuestion(question)
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

  const initialCategory = classifyChatbotQuestion(question.redacted).category
  if (initialCategory === "general" && !isDomainRelatedQuestion(question, "general")) {
    const result = { sources: [], warning: undefined }
    setCachedRetrieval(question, result)
    return result
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
    ((isComparisonQuestion(question) || isIdentityQuestion(question)) && !isApiIntegrationQuestion(question))
  ) {
    const curatedSources = buildCuratedSources(question)
    if (curatedSources.length > 0) {
      const result = {
        sources: selectDiverseSources(rerankSources(question, curatedSources), 1),
        warning: undefined,
      }
      setCachedRetrieval(question, result)
      return result
    }
  }

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

function getTimedOutKnowledgeFallback(question: NormalizedQuestion): KnowledgeSearchResult {
  const staticSources = buildStaticSources(question, getFallbackDocsFromStatic())
  const result = {
    sources: mergeCuratedSources(question, staticSources),
    warning: "문서 검색 응답이 지연되어 정적 문서 fallback을 사용했습니다.",
  }
  setCachedRetrieval(question, result)
  return result
}

function searchKnowledgeSourcesWithinBudget(question: NormalizedQuestion) {
  return withTimeoutFallback({
    promise: searchKnowledgeSources(question),
    timeoutMs: getKnowledgeSearchTimeoutMs(),
    fallback: () => getTimedOutKnowledgeFallback(question),
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

function wantsImmediateHumanHandoff(question: NormalizedQuestion) {
  if (isHardwareSpecsQuestion(question)) return false
  if (isHardwareBoardLineupQuestion(question)) return false

  const text = question.redacted.toLowerCase()
  const explicitHandoff =
    /상담\s*(?:받|받고|하고|하고\s*싶|할래|신청|연결|이어|부탁|필요|문의|원해|원함)|상담받|상담할래|상담하고\s*싶|상담\s*(?:원|사)|담당자.{0,10}(?:상담|연결|연락|통화|배정|문의)|매니저.{0,10}(?:상담|연결|연락|통화|문의)|(?:상담|연결|연락|통화|문의).{0,10}(?:담당자|매니저)|전담\s*매니저|연락\s*(?:주세요|받고|하고|원해|원함|가능)|전화\s*(?:주세요|받고|하고|원해|원함|가능)|통화\s*(?:하고|원해|원함|가능)|미팅\s*(?:잡|하고|원해|원함)|데모\s*(?:신청|보고|연결|원해|원함)|시연\s*(?:신청|보고|연결|원해|원함)|구매\s*상담|도입\s*(?:상담|문의|검토)/.test(text)
  const contextualInquiry =
    /문의/.test(text) && /담당자|매니저|연락|전화|통화|구매|도입|시연|데모/.test(text)

  return explicitHandoff || contextualInquiry
}

function wantsHumanConsultation(question: NormalizedQuestion) {
  if (wantsImmediateHumanHandoff(question)) return true

  const text = question.redacted.toLowerCase()
  return /견적|데모|시연|미팅|제안|구매|도입\s*검토|도입\s*상담/.test(text)
}

function buildImmediateHandoffResponse(
  category: string,
  handoffIntent: HandoffIntent
): Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> {
  const isSupport = handoffIntent === "support"
  return {
    answer: [
      isSupport
        ? "상담 연결이 필요한 내용으로 확인했습니다."
        : "담당자 상담으로 이어드릴게요.",
      isSupport
        ? "담당자가 바로 확인할 수 있게 계정/오류 화면, 결제 상태, 장비 증상처럼 현재 상황을 함께 남겨주세요."
        : "담당자가 도입 목적, 희망 일정, 수업 운영 방식부터 빠르게 확인할 수 있게 연결 정보를 남겨주세요.",
    ].join("\n\n"),
    answerMode: "handoff",
    confidence: 0.72,
    needsHandoff: true,
    sources: [],
    suggestedQuestions: buildSuggestedQuestions(category),
    unresolved: true,
  }
}

function isDomainRelatedQuestion(question: NormalizedQuestion, category: string) {
  if (category !== "general") return true

  const text = question.redacted.toLowerCase()
  return /classin|클래스인|학원|수업|교실|학생|교사|강사|원장|전자칠판|칠판|하드웨어|보드|board|모델|사이즈|크기|인치|라인업|ops|카메라|마이크|미러링|edb|이\s*디\s*비|lms|녹화|복습|과제|운영|도입|관리자|온라인|화상|교안|토론|플립러닝|하이브리드|소프트웨어|프로그램|앱|플랜|구독형|충전형|체험|파일럿|학부모|리포트|보고서|문자|알림/.test(text)
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

function getConciseNextStep(category: string) {
  switch (category) {
    case "billing":
      return "계정별 조건이 달라질 수 있어요. 결제 수단, 사업자 정보, 필요한 증빙 종류를 알려주시면 더 정확히 이어드릴게요."
    case "hardware":
      return "설치 장소, 희망 대수, 스탠드/벽걸이 여부를 알려주시면 패키지 범위를 좁혀드릴게요."
    case "troubleshooting":
      return "오류 화면, 사용 기기, 앱/브라우저, 발생 시점을 알려주시면 해결 순서를 더 정확히 잡을 수 있어요."
    case "onboarding":
      return "현재 쓰는 전자칠판, 녹화, LMS 도구와 도입 희망 시점을 알려주시면 90일 도입 순서로 좁혀드릴게요."
    case "admin":
      return "보고 싶은 데이터와 관리자 권한 범위를 알려주시면 설정/연동 흐름으로 정리해드릴게요."
    case "classroom":
      return "수업 전, 수업 중, 수업 후 중 어디가 가장 불편한지 알려주시면 기능 기준으로 좁혀드릴게요."
    default:
      return "원하시면 도입, 수업 운영, 계정/오류, 결제 중 어느 쪽인지부터 빠르게 좁혀드릴게요."
  }
}

function getComparisonAnswer(question: NormalizedQuestion, top: ChatbotSource) {
  const text = question.redacted.toLowerCase()
  const zoomFocused = /zoom|줌|화상회의/.test(text)
  // 시중 전자칠판(넥소 등) 또는 전자칠판/보드 비교는 하드웨어 차별점을 더 강하게 짚는다.
  // 정책: 경쟁사 브랜드명은 노출하지 않고 타사 사양·우열은 단정하지 않는다.
  const boardFocused =
    !zoomFocused && (COMPETITOR_BOARD_RE.test(text) || /전자칠판|칠판|보드|board/.test(text))

  if (boardFocused) {
    return [
      "네, 좋은 질문이에요. 같은 '전자칠판'처럼 보여도 Classin Board는 화면·판서에서 끝나지 않고 수업 운영 흐름 전체로 이어지는 게 가장 큰 차이예요.",
      "일반 전자칠판이 화면 출력과 판서 중심이라면, Classin Board는 이렇게 달라요.\n- 윈도우 OPS 내장이라 외부 PC·노트북 없이 보드 하나로 수업을 구동해요\n- EDB 칠판 파일로 판서·이미지·자료를 최대 50페이지까지 저장하고 다음 수업에 그대로 재사용해요\n- 녹화·복습·LMS·관리자 데이터까지 한 흐름으로 이어져요",
      "카메라·마이크도 내장이라 따로 장비를 붙일 필요가 줄어요. 어떤 점이 제일 궁금하신지 알려주시면 그 기준으로 더 좁혀 비교해드릴게요.",
    ].join("\n\n")
  }

  return [
    "네, 좋은 질문이에요. Classin은 Zoom이나 일반 전자칠판과 달리 '수업 운영 흐름' 전체에 초점이 있어요.",
    "Zoom이 회의 중심이라면 Classin은 판서·녹화·복습·LMS를 하나로 연결하고,\n일반 전자칠판이 화면·판서에 머무는 것과 달리 EDB 교안과 관리자 데이터까지 이어줘요.",
    top.heading === "핵심 포지셔닝"
      ? "Zoom, 전자칠판, LMS 중 어떤 기준으로 비교 중이신지 알려주시면 그 부분만 더 좁혀드릴게요."
      : null,
  ].filter(Boolean).join("\n\n")
}

function getIdentityAnswer() {
  return [
    "네, Classin은 학원 수업을 준비·진행·녹화·복습·과제(LMS)·관리자 데이터까지 한 흐름으로 묶는 수업 운영 솔루션이에요.",
    "쉽게 말해 Zoom처럼 수업만 여는 도구가 아니라, 전자칠판·EDB 교안·녹화·관리자 운영까지 연결해 수업 품질을 표준화하는 시스템에 가까워요.",
    "전자칠판, 온라인 수업, LMS/관리자 중 어떤 쪽이 궁금하신지 알려주시면 그 부분만 콕 짚어 정리해드릴게요.",
  ].join("\n\n")
}

function getEdbAnswer() {
  return [
    "EDB, 이디비는 Classin에서 쓰는 칠판 파일이에요.",
    "판서, 이미지, 텍스트를 상호작용 가능한 상태로 저장해 두고 다시 불러올 수 있어서, 선생님이 만든 교안이나 활동 자료를 다음 수업에서도 그대로 재사용할 수 있습니다.",
    "쉽게 말하면 한 번 만든 칠판 수업 자료를 파일처럼 저장하고, 불러오고, 공유하는 구조예요.",
  ].join("\n\n")
}

function getHardwareSpecsAnswer(revealBig: boolean) {
  if (!revealBig) {
    return [
      "네, Classin Board 사양 정리해드릴게요.",
      "표준 모델은 75인치(S75)와 86인치(S86)예요. 공통 기준은 4K · 16:9 · 178도 시야각 · 밝기 350cd/m² 이상 · 50점 적외선 터치 · 내장 OPS(Windows OS)입니다.",
      "외형 치수(가로×세로×두께)는 이렇게 봐요.\n- S75 — 1,730.63 × 1,015.22mm · 두께 95.5mm · 54kg\n- S86 — 1,976.63 × 1,153.31mm · 두께 95.5mm · 69.5kg",
      "두께 95.5mm에 베젤 22mm 슬림이라 벽걸이든 이동형 스탠드든 공간 부담이 적어요. 더 큰 공간을 위한 추가 라인업은 교실 크기랑 설치 방식만 알려주시면 상담에서 맞춰 안내해 드릴게요.",
    ].join("\n\n")
  }
  return [
    "네, Classin Board 사양 정리해드릴게요.",
    "공통 기준은 4K · 16:9 · 178도 시야각 · 밝기 350cd/m² 이상 · 50점 적외선 터치 · 내장 OPS(Windows OS)예요.",
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

function getPricingAnswer() {
  return [
    "네, 요금은 고정가표보다 '구성 기준'으로 봐요. 보통 이렇게 묶여요.",
    "- 전자칠판 + OPS(윈도우 컴퓨팅)\n- 카메라·마이크·스탠드/벽걸이 구성\n- 소프트웨어 사용 범위(녹화·LMS 등)\n- 설치·온보딩",
    "교실 수랑 원하는 구성만 알려주시면 견적 범위를 잡아드릴게요.",
  ].join("\n\n")
}

function getSoftwarePricingAnswer() {
  return [
    "소프트웨어만 검토하시는 경우에는 전자칠판 패키지와 분리해서 계정 수와 운영 규모 기준으로 보면 됩니다.",
    "Standard, Plus, Enterprise처럼 필요한 기능과 팀 규모에 따라 단계가 나뉘고, 구독형·충전형 조건은 사용 기능과 계약 방식에 따라 달라질 수 있어요.",
    "정확한 금액은 단정하지 않고, 강사 수·학생 수·코스 규모·필요 기능을 기준으로 견적에서 확인하는 게 안전합니다.",
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
    "출결, 과제, 성적, 복습 기록, 학습 보고서처럼 상담에 쓸 데이터는 권한 범위 안에서 확인할 수 있어요. 다만 학부모 문자·푸시·상담 리포트가 자동 발송된다고 기본 기능처럼 단정하면 안 됩니다.",
    "자동 알림이 필요하면 SMS 알림, API, 외부 학원관리 시스템 연동 범위로 따로 확인하는 게 맞습니다.",
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

function getRecordingPermissionAnswer() {
  return [
    "수업 녹화와 현장 녹화는 목적이 달라서 먼저 구분해서 봐야 해요.",
    "수업 녹화는 ClassIn 수업 안의 화면·판서·자료 중심이고, 현장 녹화는 카메라 구성이 설정된 경우 교실 뷰나 트래킹 뷰를 다룹니다.",
    "저장·확인·다운로드는 관리자 또는 권한 받은 계정이 계약·기관 설정 범위 안에서 관리하는 기준으로 안내해야 합니다. 실제 권한 범위는 현재 계정과 계약 조건으로 확인하는 게 맞습니다.",
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

  if (/서버|데이터\s*(처리|보관|지역)/.test(text)) {
    return [
      "서버 위치나 데이터 처리 지역은 추정으로 답하면 안 되는 항목입니다.",
      "공식 정책, 계약 조건, 개인정보 처리 기준으로 확인해야 하고, 상담에서는 어떤 데이터가 어디에 저장·처리되는지 확인 요청 항목으로 분리하는 게 맞습니다.",
      "도입 검토 중이라면 서버 위치, 데이터 처리 지역, 보관·삭제 기준을 한 묶음으로 담당자에게 확인하세요.",
    ].join("\n\n")
  }

  if (/콘텐츠\s*소유권|소유권|저작권/.test(text)) {
    return [
      "콘텐츠 소유권은 약관·계약 기준으로 확인해야 하는 항목입니다.",
      "공개 답변에서는 기관 자료와 접근 권한을 분리 관리한다고 안내하고, 소유권과 서비스 제공을 위한 이용 권한은 최신 계약·정책으로 확인하는 게 안전합니다.",
      "상담에서는 녹화본, EDB 교안, 업로드 자료, 공유 드라이브 자료를 각각 누가 볼 수 있고 어떻게 보관되는지 함께 확인하세요.",
    ].join("\n\n")
  }

  if (/스토리지|클라우드|저장\s*(용량|공간)|용량|단가|추가/.test(text)) {
    return [
      "스토리지는 사용량 확인과 계약 조건을 나눠 봐야 합니다.",
      "관리자는 권한 범위 안에서 녹화본, 스크린샷, 칠판 파일, 공유 드라이브 등 스토리지 사용량을 확인할 수 있습니다.",
      "기본 제공 용량, 추가 용량, 1GB당 단가, 장기 보관 조건은 최신 계약 기준으로 확인해야 하므로 숫자를 단정하지 않는 게 맞습니다.",
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
      "공개 답변에서 금액을 단정하지 말고, 모델명과 필요한 수량을 기준으로 구매 경로와 단가를 확인 요청하는 게 안전합니다.",
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
    "이 항목은 최신 계약·정책 확인이 필요한 질문입니다.",
    "공개 답변에서는 가능한 기능과 확인 필요 범위를 분리하고, 금액·서버·소유권·권한처럼 조건이 바뀔 수 있는 내용은 단정하지 않는 게 맞습니다.",
    "상담에서는 현재 계정, 계약 조건, 필요한 장비 구성, 보관·권한 기준을 같이 확인하세요.",
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
    "자사 사이트의 입장 버튼에서 ClassIn 수업으로 연결하는 건 가능성은 열어두되, 기본 제공 기능처럼 단정하면 안 됩니다.",
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

function getCoreFeatureYesNoAnswer(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
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

function formatConsumerAnswer({
  answerMode,
  category,
  question,
  top,
}: {
  answerMode: AnswerMode
  category: string
  question: NormalizedQuestion
  top: ChatbotSource
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
    return getHardwareSpecsAnswer(HARDWARE_BIG_MODEL_RE.test(question.redacted.toLowerCase()))
  }
  if (isComparisonQuestion(question) && top.urlPath.includes("/docs/start/academy-system-os-positioning")) {
    return getComparisonAnswer(question, top)
  }
  if (top.heading === "EDB와 교안 표준화") {
    return getEdbAnswer()
  }
  if (isIdentityQuestion(question) && top.urlPath.includes("/docs/start/academy-system-os-positioning")) {
    return getIdentityAnswer()
  }
  if (isPricingInfoQuestion(question) && top.heading === "요금·견적 구성 안내") {
    return getPricingAnswer()
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
  if (top.heading === "녹화 저장과 권한 기준") {
    return getRecordingPermissionAnswer()
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

  const caution =
    answerMode === "handoff"
      ? "이 내용은 실제 계정, 계약, 장비 상태, 도입 조건에 따라 달라질 수 있어 상담으로 확인하는 편이 안전합니다."
      : ""
  // 문서 섹션의 메타성 제목(예: "이 문서는 지도입니다")이 답변 앞에 새지 않게 거른다.
  const isMetaHeading = /^이\s*문서|지도입니다|^목차|개요만\s*보기/.test(top.heading ?? "")
  const headingText = top.heading?.trim() ?? ""
  // 청크 본문이 이미 제목 문구로 시작하면(동기화 단계에서 heading 이 content 에도 포함됨)
  // 제목을 또 앞에 붙이지 않는다 — "유료 계정 전환: 유료 계정 전환 …" 같은 제목 메아리 방지.
  const normalizedExcerpt = top.excerpt.replace(/\s+/g, " ").trim().toLowerCase()
  const excerptStartsWithHeading =
    headingText.length > 0 && normalizedExcerpt.startsWith(headingText.replace(/\s+/g, " ").toLowerCase())
  const heading =
    headingText && headingText !== "요약" && !isMetaHeading && !excerptStartsWithHeading
      ? `${headingText}: `
      : ""
  // doc_suggestion(약한 출처) 폴백만 따뜻하게 재구성한다. direct_answer/handoff 는 기존 그대로 둔다.
  const summary =
    answerMode === "doc_suggestion"
      ? buildDocSuggestionSummary(top.excerpt, headingText, { isMetaHeading, excerptStartsWithHeading })
      : `${heading}${top.excerpt}`
  const nextStep = getConciseNextStep(category)

  return [
    summary,
    caution,
    `다음으로는 ${nextStep}`,
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

function composeAnswer(
  question: NormalizedQuestion,
  sources: ChatbotSource[],
  category: string
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

    const fallbackCriteria = getStepCriteriaByCategory(category)
    return {
      answer: [
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

  const answer = formatConsumerAnswer({ answerMode, category, question, top })

  return {
    answer,
    answerMode,
    confidence,
    needsHandoff: answerMode === "handoff",
    sources,
    suggestedQuestions: buildSuggestedQuestions(category),
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
  // 세션 소유권 검증용 — 이력 로드 시 세션 owner 와 대조한다.
  anonymousId?: string | null
  generateAnswer?: boolean
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
    ((isComparisonQuestion(question) || isIdentityQuestion(question)) && !isApiIntegrationQuestion(question))
  )
}

function shouldUseAiFinalAnswer(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  category: string
) {
  if (category === "general" && !isDomainRelatedQuestion(question, category)) return false
  if (wantsImmediateHumanHandoff(question)) return false
  if (response.answerMode === "clarifying_question" && question.tokens.length < 2) return false
  if (response.answerMode === "direct_answer" && isCsFigmaGuideResponse(response)) return false
  // 큐레이션 직답은 이미 최종본 — Gemini 재작성(0.8~4.5s)을 건너뛰고 그대로 내보낸다.
  if (response.answerMode === "direct_answer" && isCuratedTemplateQuestion(question)) return false
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
    return {
      question,
      response: policyGuard.response,
      category: policyGuard.category,
      intent: policyGuard.intent,
      handoffIntent: policyGuard.handoffIntent,
      latencyMs: elapsedSince(startedAt),
    }
  }

  if (wantsImmediateHumanHandoff(question)) {
    const { category, intent, handoffIntent } = classifyChatbotQuestion(question.redacted)
    return {
      question,
      response: buildImmediateHandoffResponse(category, handoffIntent),
      category,
      intent,
      handoffIntent,
      latencyMs: elapsedSince(startedAt),
    }
  }

  const csFigmaGuide = findCsFigmaGuideForQuestion(question.redacted)
  if (csFigmaGuide) {
    const { category, intent, handoffIntent } = classifyChatbotQuestion(question.redacted, [
      csFigmaGuide.category,
      csFigmaGuide.docCategory,
    ])
    // 증상형 질문이면 how-to 단계와 함께 상담 연결을 제안한다(자가해결 + 안전망).
    const isSymptom = isCsFigmaSymptomQuestion(question.redacted)
    const guideAnswer = isSymptom
      ? `${formatCsFigmaGuideAnswer(csFigmaGuide)}\n\n위 순서로도 해결되지 않으면 담당자 상담으로 연결해 드릴 수 있어요.`
      : formatCsFigmaGuideAnswer(csFigmaGuide)
    return {
      question,
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
      latencyMs: elapsedSince(startedAt),
    }
  }

  // 세션(대화 이력)이 없는 동일 질문은 캐시된 답변으로 즉시 응답 — 검색·Gemini를 통째로 건너뛴다.
  if (shouldGenerateAnswer && !options.sessionId) {
    const cached = getCachedAnswer(question)
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
  const historyPromise: Promise<{ role: "user" | "model"; parts: { text: string }[] }[]> =
    shouldGenerateAnswer && options.sessionId
      ? loadSessionHistory(options.sessionId, options.anonymousId)
      : Promise.resolve([])

  const { sources, warning, cacheHit } = await searchKnowledgeSourcesWithinBudget(question)
  const classificationSources = sources.filter((source) => source.score >= MIN_DIRECT_SOURCE_SCORE)
  const { category, intent, handoffIntent } = classifyChatbotQuestion(
    question.redacted,
    classificationSources.map((source) => source.category)
  )
  const response = composeAnswer(question, sources, category)

  if (shouldGenerateAnswer && shouldUseAiFinalAnswer(response, question, category)) {
    const history = await historyPromise
    const finalAnswer = await withTimeoutFallback({
      promise: generateUsableAnswerWithProgressiveModels((tier) =>
        generateGeminiFinalAnswer({
          question: question.redacted,
          category,
          answerMode: response.answerMode,
          draftAnswer: response.answer,
          sources: response.sources,
          tier,
          history,
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

  finalizeAnswer(response)

  // 세션(이력)이 없는 질문만 캐시 — 이력에 의존한 답이 캐시에 섞이지 않게.
  if (shouldGenerateAnswer && !options.sessionId) {
    setCachedAnswer(question, { response, category, intent, handoffIntent, warning })
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
  const requestedSessionId = normalizeOptionalUuid(input.sessionId)
  const sessionId = requestedSessionId ?? (hasSupabaseServerEnv() ? crypto.randomUUID() : undefined)
  const answerEventId = hasSupabaseServerEnv() ? crypto.randomUUID() : undefined
  const core = await buildChatbotCore(input.message, {
    sessionId: requestedSessionId,
    anonymousId: normalizeString(input.anonymousId) ?? null,
  })

  void persistExchange(
    input,
    core.question,
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
  options: { generateAnswer?: boolean } = {}
): Promise<ChatbotQueryResponse & { detectedCategory: string; detectedIntent: ChatbotIntent }> {
  const core = await buildChatbotCore(message, { generateAnswer: options.generateAnswer })
  return {
    ...core.response,
    handoffIntent: core.handoffIntent,
    warning: core.warning,
    detectedCategory: core.category,
    detectedIntent: core.intent,
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
  response,
  historyPromise,
  emit,
}: {
  question: NormalizedQuestion
  category: string
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">
  historyPromise: Promise<{ role: "user" | "model"; parts: { text: string }[] }[]>
  emit: (event: ChatbotStreamEvent) => void
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
      for await (const chunk of streamGeminiFinalAnswer({
        question: question.redacted,
        category,
        answerMode: response.answerMode,
        draftAnswer: response.answer,
        sources: response.sources,
        tier: "basic",
        history,
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

  // 세션이 없는(보통 첫 턴) 동일 질문은 캐시된 답변을 즉시 확정해 검색·생성을 통째로 건너뛴다.
  if (!requestedSessionId) {
    const cachedQuestion = normalizeQuestion(input.message)
    const cached = getCachedAnswer(cachedQuestion)
    if (cached) {
      emit({ type: "replace", answer: cached.response.answer })
      emitMeta(cached.response, cached.category, cached.intent, cached.handoffIntent, cached.warning)
      void persistExchange(
        input,
        cachedQuestion,
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
  const historyPromise = requestedSessionId
    ? loadSessionHistory(requestedSessionId, normalizeString(input.anonymousId) ?? null)
    : Promise.resolve([])

  // 검색·분류·결정형 초안까지는 기존 코어를 그대로 재사용(중복 방지). Gemini 호출만 스트리밍으로 대체.
  const core = await buildChatbotCore(input.message, { generateAnswer: false })
  const { question, response, category, intent, handoffIntent, warning } = core

  // 인사·정책 가드 응답은 buildChatbotCore 가 조기 반환한 '최종 답변'이다(정책 가드는 보안 거절 등).
  // 이 경우 AI 재작성을 적용하면 안 된다 — handleChatbotQuery 의 조기 반환 의미와 동일하게 맞춘다.
  const isShortCircuited = isGreetingOnly(question) || Boolean(buildPolicyGuardResponse(question))
  if (!isShortCircuited && shouldUseAiFinalAnswer(response, question, category)) {
    await streamAndApplyFinalAnswer({ question, category, response, historyPromise, emit })
  }

  finalizeAnswer(response)

  // 스트림 델타가 끝난 뒤(또는 AI 미사용 시) 정제된 최종본을 권위 있는 replace 로 확정한다.
  emit({ type: "replace", answer: response.answer })

  // no-session 질문만 캐시(이력 의존 답이 캐시에 섞이지 않게) — handleChatbotQuery 와 동일 규칙.
  if (!requestedSessionId) {
    setCachedAnswer(question, { response, category, intent, handoffIntent, warning })
  }

  emitMeta(response, category, intent, handoffIntent, warning)

  void persistExchange(
    input,
    question,
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
