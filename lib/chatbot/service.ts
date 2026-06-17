import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getDocPath, listDocs, type DocArticle } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import {
  classifyChatbotQuestion,
  type ChatbotIntent,
} from "@/lib/chatbot/classification"
import {
  generateGeminiFinalAnswer,
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

const MAX_MESSAGE_LENGTH = 1000
const MAX_FEEDBACK_COMMENT_LENGTH = 500
const MAX_SOURCES = 2
const MAX_SOURCES_PER_DOC = 1
const MAX_RETRIEVAL_CANDIDATES = 24
const MAX_RETRIEVAL_CANDIDATES_PER_DOC = 3
const MIN_DIRECT_SOURCE_SCORE = 18
const RETRIEVAL_CACHE_TTL_MS = 5 * 60 * 1000
const RETRIEVAL_CACHE_MAX = 200
const RETRIEVAL_CACHE_VERSION = "rag-rerank-20260617-v3"
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

function isWeakBrandToken(token: string) {
  return /^(classin|클래스인)(은|는|이|가|을|를|과|와|도|의|으로|로|에서|에게|에는|에는요)?$/i.test(token)
}

function isWeakQueryToken(token: string) {
  return /^(가능|가능해|가능한가요|되나요|돼요|되요|알려|알려줘|문의|문의드립니다|궁금|궁금해|어때|어떻게|오늘|내일|추천|해주세요|해줘)$/i.test(token)
}

function getScoringTokens(question: NormalizedQuestion) {
  return question.tokens.filter((token) => !isWeakBrandToken(token) && !isWeakQueryToken(token))
}

const POSITIONING_RE =
  /학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|줌|화상회의|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차이|비교|차별|차별점|장점|왜\s*(써|쓰|필요|도입)|일반\s*전자칠판|기존\s*전자칠판|왜\s*전자칠판|edb|칠판\s*파일|가격\s*부담|비싸|api|sdk|연동|데이터\s*구독|도구.*흩어|녹화.*관리/

const COMPARISON_RE =
  /zoom|줌|화상회의|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차이|비교|차별|차별점|장점|왜\s*(써|쓰|필요|도입)|일반\s*전자칠판|기존\s*전자칠판/

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
  /개인\s*칠판|보조\s*칠판|ai\s*칠판|칠판\s*파일|edb|판서\s*도구|매직펜|업데이트|릴리즈|버전|6\.0/i

// 상세 사양을 콕 집어 묻는 신호. 모델·라인업·추천 같은 '넓은 라인업' 단어는 여기서 제외한다.
const HARDWARE_SPECS_RE =
  /스펙|사양|규격|크기|사이즈|인치|해상도|화면|ops|터치|주사율|밝기|시야각|마이크|스피커|무선|nfc|무게|중량|소비\s*전력|전력|유리|인증|부속|비교/i

// 대형 공간·특정 대형 모델을 명시적으로 물을 때만 98/110을 공개한다.
const HARDWARE_BIG_MODEL_RE =
  /s\s*98|s98|s\s*110|s110|98\s*인치|110\s*인치|대형|큰\s*(강의실|화면|교실|공간|곳|거|것|모델|사이즈)|제일\s*큰|가장\s*큰|강당|설명회|넓은\s*(강의실|교실|공간)/i

const HARDWARE_TROUBLE_RE =
  /안\s*(켜|켜져|켜지|나와|나오|보여|보이|됨|돼)|꺼져|꺼짐|켜지지|나오지|보이지|먹통|고장|수리|\bas\b|a\/s|오류|에러|문제|장애|전원|검은\s*화면|화면이\s*안|화면\s*(꺼짐|안|나오지|나옴|안\s*나)|소리\s*안|터치\s*안|끊김|끊겨|깜빡|연기|냄새|액체|파손|깨짐|금감|감전|화재/i

const HARDWARE_UNCONFIRMED_DETAIL_RE =
  /색상|색깔|컬러|마감|화이트|블랙|검정|흰색|보증\s*기간|보증기간|무상\s*(as|a\/s|수리)|유상\s*(as|a\/s|수리)|원산지|제조사/i

const HARDWARE_SPECS_EXCERPT =
  "Classin Board는 모델별로 S75, S86, S98 Pro, S110 사양을 우선 확인합니다. 공통으로 4K 해상도, 16:9 화면, 178도 시야각, 밝기 350cd/m² 이상, 50점 적외선 터치, Android 11과 탈착식 OPS, Wi-Fi ax/BT5.0, 2×15W 스피커를 기준으로 봅니다. 주요 차이는 화면 크기, 주사율, OPS 구성, 마이크 기재 여부, 무게와 소비전력입니다. S65는 라인업에는 있으나 현재 상세 규격서 확인이 필요합니다."

const HARDWARE_BOARD_LINEUP_EXCERPT =
  "Classin 칠판은 보통 Classin Board 전자칠판 라인업을 뜻합니다. 현재 안내 가능한 주요 모델은 S75, S86, S98 Pro, S110이며, 교실 크기와 맨 뒷자리 시야, 이동형 스탠드/벽걸이, 카메라·마이크 필요 여부로 고릅니다. 75·86인치는 일반 강의실, 98·110인치는 대형 강의실이나 설명회 공간에 더 잘 맞습니다. S65는 라인업에는 있으나 상세 규격 확인이 필요합니다."

const HARDWARE_BOARD_LINEUP_STANDARD_EXCERPT =
  "Classin Board 전자칠판은 보통 75인치(S75)와 86인치(S86)를 표준으로 가장 많이 선택합니다. 일반 강의실 대부분은 이 두 모델로 시작하며, 학생 수와 맨 뒷자리 시야, 이동형 스탠드/벽걸이, 카메라·마이크 필요 여부로 고릅니다. 대형 강의실·강당·설명회처럼 더 큰 공간이라면 추가 라인업도 있으니 상담에서 공간에 맞춰 안내해 드립니다."
const HARDWARE_SPECS_STANDARD_EXCERPT =
  "Classin Board는 75인치(S75)와 86인치(S86)가 표준 모델입니다. 두 모델 모두 4K(3840×2160) 해상도, 16:9 화면, 178도 시야각, 밝기 350cd/m² 이상, 50점 적외선 터치, 탈착식 OPS, Wi-Fi ax/BT5.0, 2×15W 스피커를 기준으로 봅니다. 더 큰 공간을 위한 추가 라인업은 상담에서 공간·예산에 맞춰 안내해 드립니다."

const HARDWARE_TROUBLE_EXCERPT =
  "전자칠판 화면이 안 나오면 전원 플러그와 멀티탭, 오른쪽 측면 하단 전원 버튼, 대기 모드, 입력 소스(OPS/HDMI), HDMI 케이블과 외부 기기 화면 출력을 순서대로 확인합니다. 연기, 냄새, 액체 유입, 파손이 있으면 전원을 분리하고 A/S로 연결합니다."

const HARDWARE_UNCONFIRMED_DETAIL_EXCERPT =
  "공개 스펙 기준으로는 모델별 화면 크기, OPS, 터치, 전력 같은 핵심 사양을 우선 안내할 수 있습니다. 색상, 마감, 보증 기간, 제조·재고 조건처럼 공급 조건에 따라 달라질 수 있는 세부 옵션은 최신 견적·납품 기준 확인이 필요합니다."

const LOGIN_TROUBLE_RE =
  /로그인|접속|비밀번호|패스워드|인증\s*코드|인증코드|아이디|계정.*(안|오류|에러|문제)|안\s*(들어가|돼|됨|되|됩니다)|재설정/i

const LIVE_CLASS_TROUBLE_RE =
  /수업.*(나감|튕김|튕겨|끊김|끊겨|입장\s*안|접속\s*안)|화면\s*공유.*(끊김|끊겨|오류|에러|안\s*됨|안\s*돼)|소리.*(안\s*들|끊김|끊겨)|마이크.*(안\s*됨|안\s*돼|끊김)/i

function isPositioningQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return POSITIONING_RE.test(text) || isIdentityQuestion(question)
}

function isApiIntegrationQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return /api|sdk|연동|데이터\s*구독|가상계정|수업\s*중계|코스\s*정보|수업\s*정보|crm|lms/.test(text)
}

function isComparisonQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  return COMPARISON_RE.test(text)
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
function isPricingInfoQuestion(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  if (PRICING_EXCLUDE_RE.test(text)) return false
  if (isWebLiveBillingQuestion(question)) return false
  if (!PRICING_MONEY_RE.test(text) && PRICING_DURATION_RE.test(text)) return false
  return PRICING_INFO_RE.test(text)
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
  const isEdbQuestion = /edb|칠판\s*파일|교안/.test(text)
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
    title: "Classin을 학원 시스템 OS로 이해하기",
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

function buildCuratedSources(question: NormalizedQuestion) {
  const text = question.redacted.toLowerCase()
  const sources: ChatbotSource[] = []
  const positioningSource = buildPositioningSource(question)
  if (positioningSource) sources.push(positioningSource)

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
    const source = buildStaticDocSource(
      "start",
      "value-and-cost-framing",
      "요금·견적 구성 안내",
      "클래스인 비용은 고정가표가 아니라 전자칠판+OPS, 카메라·스탠드/벽걸이 구성, 소프트웨어 사용 범위, 설치·온보딩까지 묶어 구성 기준으로 산정합니다. 정확한 금액은 학원 규모와 구성에 따라 달라집니다.",
      295,
      "billing"
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
    isInstallFormQuestion(question) ||
    isCoreFeatureYesNoQuestion(question)
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

  const initialCategory = classifyChatbotQuestion(question.redacted).category
  if (initialCategory === "general" && !isDomainRelatedQuestion(question, "general")) {
    const result = { sources: [], warning: undefined }
    setCachedRetrieval(question, result)
    return result
  }

  if (isLiveClassTroubleQuestion(question)) {
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
    isInstallFormQuestion(question) ||
    isCoreFeatureYesNoQuestion(question) ||
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

function buildSuggestedQuestions(category: string) {
  const categorySuggestions: Record<string, string[]> = {
    billing: ["요금과 견적 기준이 궁금해요", "세금계산서나 영수증 발급이 궁금해요"],
    hardware: ["전자칠판 설치 범위를 알고 싶어요", "장비 문제를 상담으로 확인하고 싶어요"],
    troubleshooting: ["계정이나 접속 문제를 해결하고 싶어요", "수업 중 오류 상황을 설명할게요"],
    onboarding: ["우리 학원 도입 순서를 잡고 싶어요", "Zoom/전자칠판과 차이를 더 알고 싶어요"],
    admin: ["관리자 대시보드에서 볼 수 있는 데이터를 알려주세요", "API 연동 범위를 알고 싶어요"],
    classroom: ["수업 녹화와 복습 흐름을 알고 싶어요", "과제/시험 운영 방법이 궁금해요"],
  }
  return Array.from(
    new Set([
      ...(categorySuggestions[category] ?? []),
      "담당자 상담으로 이어주세요",
    ])
  ).slice(0, 3)
}

function wantsHumanConsultation(question: NormalizedQuestion) {
  if (isHardwareSpecsQuestion(question)) return false
  if (isHardwareBoardLineupQuestion(question)) return false

  const text = question.redacted.toLowerCase()
  const explicitHandoff =
    /상담|연락|견적|데모|시연|미팅|제안|담당자|통화|구매|도입\s*검토|도입\s*상담/.test(text)
  const contextualInquiry =
    /문의/.test(text) && /담당자|상담|연락|전화|통화|견적|구매|도입|시연|데모/.test(text)

  return explicitHandoff || contextualInquiry
}

function isDomainRelatedQuestion(question: NormalizedQuestion, category: string) {
  if (category !== "general") return true

  const text = question.redacted.toLowerCase()
  return /classin|클래스인|학원|수업|교실|학생|교사|강사|원장|전자칠판|칠판|하드웨어|보드|board|모델|사이즈|크기|인치|라인업|ops|카메라|마이크|미러링|edb|lms|녹화|복습|과제|운영|도입|관리자|온라인|화상|교안|토론|플립러닝|하이브리드/.test(text)
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

function getComparisonAnswer(top: ChatbotSource) {
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
    "네, Classin이 어떤 서비스인지 궁금하시군요.",
    "Classin은 학원 수업을 준비·진행·녹화·복습·과제(LMS)·관리자 데이터까지 한 흐름으로 묶는 수업 운영 솔루션이에요.",
    "쉽게 말해 Zoom처럼 수업만 여는 도구가 아니라, 전자칠판·EDB 교안·녹화·복습·관리자 운영까지 연결해 수업 품질을 표준화하는 시스템에 가까워요.",
    "전자칠판, 온라인 수업, LMS/관리자 중 어떤 쪽이 궁금하신지 알려주시면 그 부분만 콕 짚어 정리해드릴게요.",
  ].join("\n\n")
}

function getHardwareSpecsAnswer(revealBig: boolean) {
  if (!revealBig) {
    return [
      "네, Classin Board 사양 정리해드릴게요.",
      "표준 모델은 75인치(S75)와 86인치(S86)예요. 공통 기준은 4K · 16:9 · 178도 시야각 · 밝기 350cd/m² 이상 · 50점 적외선 터치 · Android 11 · 탈착식 OPS입니다.",
      "- S75 — 75인치 · 54kg · 315W\n- S86 — 86인치 · 69.5kg · 390W",
      "더 큰 공간을 위한 추가 라인업은 교실 크기랑 설치 방식만 알려주시면 상담에서 맞춰 안내해 드릴게요.",
    ].join("\n\n")
  }
  return [
    "네, Classin Board 사양 정리해드릴게요.",
    "공통 기준은 4K · 16:9 · 178도 시야각 · 밝기 350cd/m² 이상 · 50점 적외선 터치 · Android 11 · 탈착식 OPS예요.",
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

function getWebLiveBillingAnswer() {
  return [
    "웹 라이브는 모든 요금제에서 기본 제공된다고 보기는 어려워요.",
    "구독형은 Enterprise, 충전형은 Business Consumption 조건에서 쓰는 기능으로 안내되고, 실제 적용 여부와 비용은 계약·요금제 기준을 확인해야 해요.",
    "앱 설치 없이 웹 링크로 설명회·강연을 보여주려는 거라면, 먼저 지금 요금제와 라이브+플레이백 필요 여부부터 확인하면 됩니다.",
  ].join("\n\n")
}

function getPricingAnswer() {
  return [
    "네, 요금은 고정가표보다 '구성 기준'으로 보시는 게 정확해요.",
    "보통 이렇게 묶여요.",
    "- 전자칠판 + OPS(윈도우 컴퓨팅)\n- 카메라·마이크·스탠드/벽걸이 구성\n- 소프트웨어 사용 범위(녹화·LMS 등)\n- 설치·온보딩",
    "교실 수랑 원하는 구성만 알려주시면 견적 범위를 잡아드리거나 담당자 상담으로 바로 이어드릴게요.",
  ].join("\n\n")
}

function getInstallFormAnswer() {
  return [
    "네, 설치는 이동형 스탠드와 벽걸이 둘 다 가능해요.",
    "고르실 때 기준이에요.",
    "- 교실 간 이동이 필요하면 → 이동형 스탠드\n- 자리가 고정이고 공간을 아끼려면 → 벽걸이(벽면 보강 확인)",
    "전원·네트워크·벽면 상태·시야 거리는 현장 실측에서 먼저 확인해요. 교실 환경만 알려주시면 맞는 설치 형태로 안내해드릴게요.",
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
  return [lead, "정확한 설정 위치나 운영 방법은 화면 기준으로 더 짚어드릴까요?"].join("\n\n")
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
    return getComparisonAnswer(top)
  }
  if (isIdentityQuestion(question) && top.urlPath.includes("/docs/start/academy-system-os-positioning")) {
    return getIdentityAnswer()
  }
  if (isPricingInfoQuestion(question) && top.heading === "요금·견적 구성 안내") {
    return getPricingAnswer()
  }
  if (isInstallFormQuestion(question) && top.heading === "설치 형태와 현장 점검") {
    return getInstallFormAnswer()
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
  const heading = top.heading && top.heading !== "요약" && !isMetaHeading ? `${top.heading}: ` : ""
  const summary = `${heading}${top.excerpt}`
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
  return /classin|클래스인|전자칠판|보드|수업|교실|녹화|복습|lms|edb|관리자|학생|교사|강사|과제|출결|도입|운영|판서/i.test(answer)
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
        suggestedQuestions: ["도입 상담을 받고 싶어요", "수업 운영 문제를 해결하고 싶어요", "결제나 영수증 문의가 있어요"],
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
      suggestedQuestions: ["도입 상담을 받고 싶어요", "요금과 견적이 궁금해요", "계정이나 수업 접속 문제가 있어요"],
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
  const sessionInsert: Record<string, unknown> = {
    channel: normalizeChatSessionChannel(context.channel),
    anonymous_id: normalizeString(input.anonymousId) ?? null,
    user_agent: meta.userAgent ?? null,
    referrer: meta.referrer ?? null,
    utm,
  }

  if (requestedSessionId) sessionInsert.id = requestedSessionId

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert(sessionInsert)
    .select("id")
    .single()

  if (error) {
    if (requestedSessionId && error.code === "23505") return requestedSessionId
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

function shouldUseAiFinalAnswer(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  category: string
) {
  if (category === "general" && !isDomainRelatedQuestion(question, category)) return false
  if (response.answerMode === "clarifying_question" && question.tokens.length < 2) return false
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
  const classificationSources = sources.filter((source) => source.score >= MIN_DIRECT_SOURCE_SCORE)
  const { category, intent, handoffIntent } = classifyChatbotQuestion(
    question.redacted,
    classificationSources.map((source) => source.category)
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

  if (shouldGenerateAnswer && shouldUseAiFinalAnswer(response, question, category)) {
    const finalAnswer = await generateUsableAnswerWithProgressiveModels((tier) =>
      generateGeminiFinalAnswer({
        question: question.redacted,
        category,
        answerMode: response.answerMode,
        draftAnswer: response.answer,
        sources: response.sources,
        tier,
        history,
      })
    )
    if (finalAnswer) {
      applyGeneratedFinalAnswer(response, question, category, finalAnswer)
    }
  }

  finalizeAnswer(response)

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
  const core = await buildChatbotCore(input.message, { sessionId: requestedSessionId })

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
