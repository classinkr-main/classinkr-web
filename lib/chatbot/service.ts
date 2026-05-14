import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getDocPath, listDocs, type DocArticle } from "@/lib/docs"
import { getDocsContent } from "@/lib/docs-content"

const MAX_MESSAGE_LENGTH = 1000
const MAX_SOURCES = 3
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  for (const token of question.tokens) {
    if (haystacks.title.includes(token)) score += 5
    if (haystacks.heading.includes(token)) score += 4
    if (haystacks.excerpt.includes(token)) score += 2
    if (haystacks.category.includes(token)) score += 1
    if (haystacks.extras.includes(token)) score += 3
  }

  return score
}

function dedupeSourcesByPath(sources: ChatbotSource[]) {
  const seen = new Set<string>()
  const deduped: ChatbotSource[] = []

  for (const source of sources) {
    if (seen.has(source.urlPath)) continue
    seen.add(source.urlPath)
    deduped.push(source)
  }

  return deduped
}

function getDocCategory(doc: DocArticle) {
  if (doc.category === "start") return "onboarding"
  if (doc.category === "board") return "hardware"
  return "guide"
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

  return dedupeSourcesByPath(
    sources
      .filter((source) => source.score > 0)
      .sort((left, right) => right.score - left.score)
  ).slice(0, MAX_SOURCES)
}

async function searchSupabaseSources(question: NormalizedQuestion): Promise<ChatbotSource[]> {
  if (!hasSupabaseServerEnv()) return []

  const likeTokens = question.tokens.map(sanitizeLikeToken).filter(Boolean).slice(0, 6)
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
      .limit(30)

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
          category: article.category_id,
          excerpt: compactText(row.content),
        }

        return {
          ...source,
          score: Math.max(
            1,
            scoreText(question, source, getMetadataStrings(row.metadata))
          ),
        }
      })
      .filter((source): source is ChatbotSource => source != null)
      .sort((left, right) => right.score - left.score)

    return dedupeSourcesByPath(sources).slice(0, MAX_SOURCES)
  } catch (error) {
    console.warn(
      "[chatbot] Supabase search unavailable:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}

async function searchKnowledgeSources(
  question: NormalizedQuestion
): Promise<{ sources: ChatbotSource[]; warning?: string }> {
  const supabaseSources = await searchSupabaseSources(question)
  if (supabaseSources.length > 0) return { sources: supabaseSources, warning: undefined }

  const fallbackDocs = await getFallbackDocs()

  return {
    sources: buildStaticSources(question, fallbackDocs),
    warning: hasSupabaseServerEnv()
      ? "Supabase 문서 chunk 검색 결과가 없어 문서 원문 fallback을 사용했습니다."
      : "Supabase 환경변수가 없어 정적 문서 fallback을 사용했습니다.",
  }
}

function detectCategory(question: NormalizedQuestion, sources: ChatbotSource[]) {
  const text = `${question.redacted} ${sources.map((source) => source.category).join(" ")}`.toLowerCase()

  if (/결제|요금|가격|견적|영수증|세금|세금계산서|입금|청구|구독|환불|정산/.test(text)) return "billing"
  if (/하드웨어|전자칠판|보드|board|카메라|마이크|스피커|설치|납품|배송|as|a\/s|수리|고장/.test(text)) return "hardware"
  if (/접속|로그인|계정|비밀번호|소리|오류|에러|안됨|안 돼|권한|장애|끊김|로딩/.test(text)) return "troubleshooting"
  if (/도입|시작|초기|세팅|설정|초대|온보딩|첫 수업|준비|교육|전환/.test(text)) return "onboarding"
  if (/수업|출결|출석|보강|교사|학생|학부모|집중|운영|관리|리포트|숙제|과제/.test(text)) return "classroom"
  if (/상담|문의|데모|시연|컨설팅|연락|미팅|제안|상담사|담당자/.test(text)) return "consultation"

  return sources[0]?.category ?? "general"
}

function detectHandoffIntent(question: NormalizedQuestion, category: string): HandoffIntent {
  const text = question.redacted.toLowerCase()

  if (
    /컴플레인|불만|환불|취소|짜증|최악|별로|안됨|안 됨|안 되|장애|오류|에러|버그|끊김|느려|느리|기술\s*지원|이슈|고장|파손|계정|로그인|접속|소리|마이크|as|a\/s/.test(
      text
    )
  ) {
    return "support"
  }

  if (
    /데모|시연|도입\s*문의|도입\s*상담|도입\s*검토|견적|요금|비용|플랜|가격\s*문의|영업|구매\s*상담|체험|사용해\s*보고|연락|미팅|제안/.test(
      text
    )
  ) {
    return "demo"
  }

  if (category === "billing" || category === "hardware" || category === "troubleshooting") {
    return "support"
  }

  return "demo"
}

function detectIntent(category: string) {
  switch (category) {
    case "billing":
      return "billing_support"
    case "hardware":
      return "hardware_support"
    case "troubleshooting":
      return "troubleshooting"
    case "onboarding":
      return "onboarding"
    case "classroom":
      return "classroom_consulting"
    case "consultation":
      return "sales_consulting"
    default:
      return "docs_lookup"
  }
}

function buildSuggestedQuestions(sources: ChatbotSource[]) {
  const suggestions = sources.map((source) =>
    source.heading && source.heading !== "요약"
      ? `${source.heading} 내용을 더 알려주세요`
      : `${source.title} 내용을 더 알려주세요`
  )

  return Array.from(new Set([...suggestions, "담당자 상담으로 이어주세요"])).slice(0, 3)
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
      return "설치 장소, 장비 모델, 증상이나 필요한 수량을 알려주시면 확인 범위를 좁힐 수 있어요."
    case "troubleshooting":
      return "사용 중인 기기, 브라우저/앱, 오류가 발생한 화면을 알려주시면 해결 순서를 더 잘 잡을 수 있어요."
    case "onboarding":
      return "학생 수, 수업 방식, 희망 시작 시점을 알려주시면 도입 준비 순서를 맞춰드릴게요."
    case "classroom":
      return "현재 수업 운영에서 가장 막히는 지점을 알려주시면 기능과 운영 방법을 함께 제안드릴게요."
    default:
      return "조금 더 구체적인 상황을 알려주시면 필요한 문서와 상담 경로를 이어서 안내드릴게요."
  }
}

function composeAnswer(question: NormalizedQuestion, sources: ChatbotSource[]): Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent"> {
  if (sources.length === 0) {
    const needsConsultation = wantsHumanConsultation(question)
    const isVague = question.tokens.length < 2 && !needsConsultation

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

    return {
      answer:
        needsConsultation
          ? "상담이 필요한 내용으로 확인했습니다. 학원 규모, 희망 도입 시점, 현재 운영에서 가장 해결하고 싶은 문제를 남겨주시면 담당자가 이어서 안내드릴게요."
          : "확인 가능한 문서에서 바로 답을 찾지 못했습니다. 운영 환경이나 오류 상황을 조금 더 구체적으로 알려주시거나 상담으로 연결해 주세요.",
      answerMode: needsConsultation ? "handoff" : "fallback",
      confidence: needsConsultation ? 0.4 : 0.15,
      needsHandoff: true,
      sources: [],
      suggestedQuestions: ["도입 상담을 받고 싶어요", "요금과 견적이 궁금해요", "계정이나 수업 접속 문제가 있어요"],
      unresolved: true,
    }
  }

  const top = sources[0]
  const category = detectCategory(question, sources)
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

  const sourceLines = sources
    .map((source, index) => `${index + 1}. ${source.title} (${source.urlPath})`)
    .join("\n")

  const answer =
    answerMode === "handoff"
      ? `관련 기준은 찾았습니다. 다만 이 내용은 실제 계정, 계약, 장비 상태, 도입 조건에 따라 달라질 수 있어 상담으로 이어드리는 편이 안전합니다.\n\n문서 기준으로는 "${top.title}"${top.heading ? `의 ${top.heading}` : ""}에서 ${top.excerpt} 내용을 확인할 수 있습니다.\n\n다음 단계: ${getNextStepByCategory(category)}\n\n관련 문서:\n${sourceLines}`
      : `문서 기준으로 먼저 정리드리면, "${top.title}"${top.heading ? `의 ${top.heading}` : ""}에서 ${top.excerpt} 내용을 확인할 수 있습니다.\n\n다음 단계: ${getNextStepByCategory(category)}\n\n관련 문서:\n${sourceLines}`

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
      channel: normalizeString(context.channel) ?? "web",
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
  intent: string
) {
  if (!hasSupabaseServerEnv()) return {}

  try {
    const supabase = createSupabaseAdminClient()
    const sessionId = await ensureSession(input, meta)
    if (!sessionId) return {}

    const { data: userMessage, error: userMessageError } = await supabase
      .from("chat_messages")
      .insert({
        session_id: sessionId,
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
        session_id: sessionId,
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
        session_id: sessionId,
        user_message_id: userMessage.id,
        assistant_message_id: assistantMessage.id,
        normalized_question: question.redacted,
        detected_intent: intent,
        detected_category: category,
        answer_mode: response.answerMode,
        confidence: response.confidence,
        unresolved: response.unresolved,
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

    if (citations.length > 0) {
      const { error } = await supabase.from("chatbot_answer_citations").insert(citations)
      if (error) console.warn("[chatbot] failed to store citations:", error.message)
    }

    await upsertQuestionCluster(
      supabase,
      answerEvent.id as string,
      question,
      response,
      category
    )

    await supabase.from("docs_search_events").insert({
      query: question.redacted,
      normalized_query: question.redacted,
      result_count: response.sources.length,
      visitor_id: normalizeString(input.anonymousId) ?? null,
      session_id: sessionId,
      source: "chatbot",
    })

    return {
      answerEventId: answerEvent.id as string,
      sessionId,
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

export async function handleChatbotQuery(
  input: ChatbotQueryRequest,
  meta: ChatbotRequestMeta = {}
): Promise<ChatbotQueryResponse> {
  const question = normalizeQuestion(input.message)
  const { sources, warning } = await searchKnowledgeSources(question)
  const category = detectCategory(question, sources)
  const intent = detectIntent(category)
  const handoffIntent = detectHandoffIntent(question, category)
  const response = composeAnswer(question, sources)
  const persisted = await persistExchange(input, question, response, meta, category, intent)

  return {
    ...response,
    ...persisted,
    handoffIntent,
    warning,
  }
}

export async function saveChatbotFeedback(raw: unknown) {
  const body = getContextObject(raw)
  const answerEventId = normalizeOptionalUuid(body.answerEventId)
  const rating = normalizeString(body.rating)
  const comment = normalizeString(body.comment)

  if (!answerEventId) {
    throw new ChatbotInputError("answerEventId가 올바르지 않습니다.")
  }

  if (rating !== "helpful" && rating !== "not_helpful") {
    throw new ChatbotInputError("rating은 helpful 또는 not_helpful이어야 합니다.")
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: false,
      stored: false,
      warning: "Supabase 환경변수가 없어 피드백을 저장하지 않았습니다.",
    }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from("chatbot_feedback").insert({
    answer_event_id: answerEventId,
    rating,
    comment: comment ?? null,
  })

  if (error) throw new Error(error.message)

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

function aggregateQuestionRows(rows: DailyStatsRow[]) {
  const map = new Map<string, {
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

  const [{ data: dailyRows, error: dailyError }, { data: feedbackRows, error: feedbackError }] =
    await Promise.all([
      dailyQuery,
      supabase
        .from("v_chatbot_feedback_stats")
        .select("*")
        .order("feedback_count", { ascending: false })
        .limit(50),
    ])

  if (dailyError) throw new Error(dailyError.message)
  if (feedbackError) throw new Error(feedbackError.message)

  const rows = (dailyRows ?? []) as DailyStatsRow[]
  const aggregated = aggregateQuestionRows(rows)
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

  if (Object.keys(patch).length === 0) {
    throw new ChatbotInputError("수정할 필드가 없습니다.")
  }

  const supabase = createSupabaseAdminClient()
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
