import "server-only"

import { SITE_URL } from "@/lib/seo"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  createUserChat,
  isChannelApiConfigured,
  upsertChannelUserByMemberId,
  writeUserChatMessage,
} from "@/lib/channel-talk-api"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"

type AnswerMode =
  | "direct_answer"
  | "doc_suggestion"
  | "clarifying_question"
  | "handoff"
  | "fallback"

type HandoffIntent = "demo" | "support"

interface HandoffSource {
  title: string
  heading?: string
  urlPath: string
  category: string
  excerpt: string
  score: number
}

export interface ChannelTalkHandoffCandidate {
  answerEventId: string
  sessionId: string
  anonymousId?: string | null
  referrer?: string | null
  pageUrl?: string | null
  path?: string | null
  question: string
  answer: string
  answerMode: AnswerMode
  confidence: number
  unresolved: boolean
  needsHandoff: boolean
  detectedCategory?: string | null
  detectedIntent?: string | null
  handoffIntent: HandoffIntent
  sources: HandoffSource[]
}

interface FeedbackHandoffOptions {
  rating: "helpful" | "not_helpful"
  comment?: string | null
}

interface ExistingHandoffRow {
  id: string
  answer_event_id: string
  session_id: string
  channel_member_id: string | null
  channel_user_id: string | null
  channel_user_chat_id: string | null
  status: string
  payload: Record<string, unknown> | null
  attempt_count: number | null
}

interface AnswerEventRow {
  id: string
  session_id: string
  user_message_id: string
  assistant_message_id: string | null
  normalized_question: string
  detected_intent: string | null
  detected_category: string | null
  answer_mode: AnswerMode
  confidence: number | null
  unresolved: boolean
}

interface SessionRow {
  id: string
  anonymous_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  referrer: string | null
}

interface MessageRow {
  id: string
  role: string
  content: string
}

const DEFAULT_MIN_CONFIDENCE = 0.55
const MAX_PROFILE_VALUE_LENGTH = 300
const MAX_MESSAGE_SECTION_LENGTH = 1400

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) return defaultValue
  return ["1", "true", "yes", "on"].includes(value)
}

function handoffMode() {
  const mode = firstNonEmpty(
    process.env.CHANNEL_TALK_HANDOFF_MODE,
    process.env.CHANNEL_CHATBOT_HANDOFF_MODE
  )?.toLowerCase()
  if (mode === "all" || mode === "off") return mode
  return "qualified"
}

function minConfidence() {
  const parsed = Number(process.env.CHANNEL_TALK_HANDOFF_MIN_CONFIDENCE)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return DEFAULT_MIN_CONFIDENCE
  return parsed
}

function isEnabled() {
  if (!isChannelApiConfigured()) return false
  if (handoffMode() === "off") return false
  return envFlag("CHANNEL_TALK_HANDOFF_ENABLED", true)
}

function isDryRun() {
  return envFlag("CHANNEL_TALK_HANDOFF_DRY_RUN", false)
}

function shouldReplaceUserTags() {
  return envFlag("CHANNEL_TALK_HANDOFF_REPLACE_TAGS", false)
}

function botName() {
  return firstNonEmpty(process.env.CHANNEL_TALK_HANDOFF_BOT_NAME) ?? "Classin AI"
}

function compact(value: string | null | undefined, max = MAX_MESSAGE_SECTION_LENGTH) {
  const text = (value ?? "").replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function compactMultiline(value: string | null | undefined, max = MAX_MESSAGE_SECTION_LENGTH) {
  const text = (value ?? "").replace(/\n{3,}/g, "\n\n").trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function toProfileValue(value: string | number | boolean | null | undefined) {
  if (value === undefined || value === null) return undefined
  if (typeof value === "boolean" || typeof value === "number") return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return compact(trimmed, MAX_PROFILE_VALUE_LENGTH)
}

function absolutePageUrl(candidate: ChannelTalkHandoffCandidate) {
  if (candidate.pageUrl) return candidate.pageUrl
  if (candidate.referrer) return candidate.referrer
  if (!candidate.path) return SITE_URL
  try {
    return new URL(candidate.path, SITE_URL).toString()
  } catch {
    return SITE_URL
  }
}

function buildMemberId(candidate: Pick<ChannelTalkHandoffCandidate, "sessionId" | "anonymousId">) {
  const source = candidate.anonymousId || candidate.sessionId
  return `classin:web:${source}`.replace(/[^\w:.-]/g, "_").slice(0, 160)
}

function categoryRequiresHandoff(category: string | null | undefined) {
  return ["billing", "hardware", "troubleshooting", "consultation"].includes(category ?? "")
}

function intentRequiresHandoff(intent: string | null | undefined) {
  return ["billing_support", "hardware_support", "troubleshooting", "sales_consulting"].includes(
    intent ?? ""
  )
}

function questionRequiresHandoff(question: string) {
  return /상담|견적|도입|전화|담당자|계약|결제|환불|오류|에러|장애|고장|안\s*됨|안\s*되|연락|미팅/.test(
    question
  )
}

function handoffReasons(candidate: ChannelTalkHandoffCandidate, forceReason?: string) {
  const reasons: string[] = []
  if (forceReason) reasons.push(forceReason)
  if (candidate.needsHandoff) reasons.push("needs_handoff")
  if (candidate.answerMode === "handoff" || candidate.answerMode === "fallback") {
    reasons.push(`answer_mode_${candidate.answerMode}`)
  }
  if (candidate.unresolved) reasons.push("unresolved")
  if (candidate.confidence < minConfidence()) reasons.push("low_confidence")
  if (categoryRequiresHandoff(candidate.detectedCategory)) {
    reasons.push(`category_${candidate.detectedCategory}`)
  }
  if (intentRequiresHandoff(candidate.detectedIntent)) {
    reasons.push(`intent_${candidate.detectedIntent}`)
  }
  if (questionRequiresHandoff(candidate.question)) reasons.push("question_keyword")
  return Array.from(new Set(reasons))
}

function shouldSend(candidate: ChannelTalkHandoffCandidate, forceReason?: string) {
  if (!isEnabled()) return false
  if (handoffMode() === "all") return true
  if (forceReason) return true
  const supportLikeCategory = categoryRequiresHandoff(candidate.detectedCategory)
  const supportLikeIntent = intentRequiresHandoff(candidate.detectedIntent)
  return (
    candidate.needsHandoff ||
    candidate.answerMode === "handoff" ||
    (candidate.answerMode === "fallback" && supportLikeCategory) ||
    (candidate.unresolved && supportLikeCategory) ||
    (candidate.confidence < minConfidence() && supportLikeIntent) ||
    questionRequiresHandoff(candidate.question)
  )
}

function sourceLines(sources: HandoffSource[]) {
  const lines = sources.slice(0, 3).map((source, index) => {
    const heading = source.heading ? ` / ${source.heading}` : ""
    const url = source.urlPath.startsWith("http")
      ? source.urlPath
      : new URL(source.urlPath, SITE_URL).toString()
    return `${index + 1}. ${source.title}${heading}\n   ${url}`
  })
  return lines.length > 0 ? lines.join("\n") : "없음"
}

function formatHandoffMessage(
  candidate: ChannelTalkHandoffCandidate,
  reasons: string[],
  feedback?: FeedbackHandoffOptions
) {
  const feedbackLines =
    feedback?.rating === "not_helpful"
      ? [
          "",
          "[사용자 피드백]",
          `평가: 도움 안 됨`,
          feedback.comment ? `코멘트: ${compact(feedback.comment, 500)}` : null,
        ].filter(Boolean)
      : []

  return [
    "[챗봇 상담 전환]",
    "",
    `전환 사유: ${reasons.join(", ")}`,
    `문의 유형: ${candidate.detectedCategory ?? "unknown"} / ${candidate.detectedIntent ?? "unknown"}`,
    `상담 목적: ${candidate.handoffIntent}`,
    `답변 모드: ${candidate.answerMode}`,
    `신뢰도: ${candidate.confidence.toFixed(2)}`,
    `페이지: ${absolutePageUrl(candidate)}`,
    `세션: ${candidate.sessionId}`,
    `답변 이벤트: ${candidate.answerEventId}`,
    "",
    "[고객 질문]",
    compactMultiline(candidate.question),
    "",
    "[AI 답변]",
    compactMultiline(candidate.answer),
    "",
    "[참고 문서]",
    sourceLines(candidate.sources),
    ...feedbackLines,
  ].join("\n")
}

function buildUserProfile(
  candidate: ChannelTalkHandoffCandidate,
  session?: SessionRow | null
) {
  return Object.fromEntries(
    Object.entries({
      name: toProfileValue(session?.customer_name ?? `웹 챗봇 ${candidate.sessionId.slice(0, 8)}`),
      email: toProfileValue(session?.customer_email),
      mobileNumber: toProfileValue(session?.customer_phone),
      chatbotHandoff: true,
      chatbotSessionId: toProfileValue(candidate.sessionId),
      chatbotAnswerEventId: toProfileValue(candidate.answerEventId),
      chatbotCategory: toProfileValue(candidate.detectedCategory),
      chatbotIntent: toProfileValue(candidate.detectedIntent),
      chatbotHandoffIntent: toProfileValue(candidate.handoffIntent),
      chatbotAnswerMode: toProfileValue(candidate.answerMode),
      chatbotConfidence: Number(candidate.confidence.toFixed(2)),
      lastQuestion: toProfileValue(candidate.question),
      lastPage: toProfileValue(absolutePageUrl(candidate)),
    }).filter(([, value]) => value !== undefined)
  )
}

function tagsFor(candidate: ChannelTalkHandoffCandidate) {
  return Array.from(
    new Set(
      [
        "chatbot-handoff",
        "classin-web",
        candidate.handoffIntent === "support" ? "support" : "demo",
        candidate.detectedCategory ?? null,
        ...(process.env.CHANNEL_TALK_HANDOFF_TAGS ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ].filter((tag): tag is string => Boolean(tag))
    )
  ).slice(0, 10)
}

async function getExistingHandoff(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  answerEventId: string
) {
  const { data, error } = await supabase
    .from("chatbot_channel_handoffs")
    .select(
      "id, answer_event_id, session_id, channel_member_id, channel_user_id, channel_user_chat_id, status, payload, attempt_count"
    )
    .eq("answer_event_id", answerEventId)
    .maybeSingle()

  if (error) throw error
  return data as ExistingHandoffRow | null
}

async function getReusableSessionChat(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  sessionId: string
) {
  const { data, error } = await supabase
    .from("chatbot_channel_handoffs")
    .select(
      "id, answer_event_id, session_id, channel_member_id, channel_user_id, channel_user_chat_id, status, payload, attempt_count"
    )
    .eq("session_id", sessionId)
    .eq("status", "sent")
    .not("channel_user_chat_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as ExistingHandoffRow | null
}

async function insertPendingHandoff(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  candidate: ChannelTalkHandoffCandidate,
  reasons: string[],
  message: string,
  dryRun: boolean
) {
  const memberId = buildMemberId(candidate)
  const payload = {
    question: candidate.question,
    answer: candidate.answer,
    sources: candidate.sources,
    reasons,
    answerMode: candidate.answerMode,
    confidence: candidate.confidence,
    unresolved: candidate.unresolved,
    needsHandoff: candidate.needsHandoff,
    detectedCategory: candidate.detectedCategory,
    detectedIntent: candidate.detectedIntent,
    handoffIntent: candidate.handoffIntent,
    pageUrl: absolutePageUrl(candidate),
    message,
  }

  const { data, error } = await supabase
    .from("chatbot_channel_handoffs")
    .insert({
      answer_event_id: candidate.answerEventId,
      session_id: candidate.sessionId,
      channel_member_id: memberId,
      status: dryRun ? "skipped" : "pending",
      reason: reasons.join(","),
      payload,
    })
    .select(
      "id, answer_event_id, session_id, channel_member_id, channel_user_id, channel_user_chat_id, status, payload, attempt_count"
    )
    .single()

  if (error) {
    if (error.code === "23505") return getExistingHandoff(supabase, candidate.answerEventId)
    throw error
  }

  return data as ExistingHandoffRow
}

async function updateHandoff(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabase
    .from("chatbot_channel_handoffs")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error
}

async function findSession(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  sessionId: string
) {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, anonymous_id, customer_name, customer_email, customer_phone, referrer")
    .eq("id", sessionId)
    .maybeSingle()
  if (error) throw error
  return data as SessionRow | null
}

async function sendHandoff(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: ExistingHandoffRow,
  candidate: ChannelTalkHandoffCandidate,
  message: string
) {
  const session = await findSession(supabase, candidate.sessionId)
  const reusable = await getReusableSessionChat(supabase, candidate.sessionId)
  const memberId = row.channel_member_id ?? buildMemberId(candidate)
  const user =
    reusable?.channel_user_id
      ? { id: reusable.channel_user_id }
      : await upsertChannelUserByMemberId({
          memberId,
          profile: buildUserProfile(candidate, session),
          tags: shouldReplaceUserTags() ? tagsFor(candidate) : undefined,
        })
  const userChat =
    reusable?.channel_user_chat_id
      ? { id: reusable.channel_user_chat_id }
      : await createUserChat(user.id)
  const channelMessage = await writeUserChatMessage(userChat.id, message, botName())

  await updateHandoff(supabase, row.id, {
    status: "sent",
    channel_member_id: memberId,
    channel_user_id: user.id,
    channel_user_chat_id: userChat.id,
    channel_message_id: channelMessage?.id ?? null,
    sent_at: new Date().toISOString(),
    last_error: null,
    attempt_count: (row.attempt_count ?? 0) + 1,
  })
}

async function sendHandoffWithFailureTracking(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: ExistingHandoffRow,
  candidate: ChannelTalkHandoffCandidate,
  message: string
) {
  try {
    await sendHandoff(supabase, row, candidate, message)
    await emitNotificationEvent({
      eventType: "chatbot.channel_talk_handoff",
      notificationType: "action_required",
      categoryTag: "lead",
      severity: candidate.handoffIntent === "support" ? "warning" : "info",
      scopeTag: "org_admin",
      title: "긴급 상담 요청",
      message: `${candidate.question.slice(0, 140)}${candidate.question.length > 140 ? "..." : ""}`,
      routeUrl: "/admin/channel-talk",
      source: "chatbot",
      sourceId: candidate.answerEventId,
      payload: {
        answerEventId: candidate.answerEventId,
        sessionId: candidate.sessionId,
        handoffIntent: candidate.handoffIntent,
        detectedCategory: candidate.detectedCategory,
        detectedIntent: candidate.detectedIntent,
        answerMode: candidate.answerMode,
        confidence: Number(candidate.confidence.toFixed(2)),
        question: candidate.question,
      },
      channels: ["wecom_cs_webhook"],
    }).catch((notificationError) => {
      console.warn(
        "[chatbot] channel talk handoff notification failed:",
        notificationError instanceof Error ? notificationError.message : notificationError
      )
    })
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    await updateHandoff(supabase, row.id, {
      status: "failed",
      last_error: messageText.slice(0, 1000),
      attempt_count: (row.attempt_count ?? 0) + 1,
    }).catch((updateError) => {
      console.warn(
        "[chatbot] failed to mark channel talk handoff as failed:",
        updateError instanceof Error ? updateError.message : updateError
      )
    })
    throw error
  }
}

export async function maybeCreateChannelTalkHandoff(
  candidate: ChannelTalkHandoffCandidate,
  forceReason?: string
) {
  const reasons = handoffReasons(candidate, forceReason)
  if (!shouldSend(candidate, forceReason)) return

  try {
    const supabase = createSupabaseAdminClient()
    const existing = await getExistingHandoff(supabase, candidate.answerEventId)
    const message = formatHandoffMessage(candidate, reasons)

    if (existing?.status === "sent" && existing.channel_user_chat_id) return

    const dryRun = isDryRun()
    const row = existing ?? await insertPendingHandoff(supabase, candidate, reasons, message, dryRun)
    if (!row || dryRun) return

    await sendHandoffWithFailureTracking(supabase, row, candidate, message)
  } catch (error) {
    console.warn(
      "[chatbot] channel talk handoff failed:",
      error instanceof Error ? error.message : error
    )
  }
}

async function fetchAnswerCandidate(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  answerEventId: string
): Promise<ChannelTalkHandoffCandidate | null> {
  const { data: event, error: eventError } = await supabase
    .from("chatbot_answer_events")
    .select(
      "id, session_id, user_message_id, assistant_message_id, normalized_question, detected_intent, detected_category, answer_mode, confidence, unresolved"
    )
    .eq("id", answerEventId)
    .maybeSingle()

  if (eventError) throw eventError
  if (!event) return null

  const answerEvent = event as AnswerEventRow
  const messageIds = [answerEvent.user_message_id, answerEvent.assistant_message_id].filter(
    (id): id is string => Boolean(id)
  )
  const { data: messages, error: messageError } = await supabase
    .from("chat_messages")
    .select("id, role, content")
    .in("id", messageIds)
  if (messageError) throw messageError

  const messageRows = (messages ?? []) as MessageRow[]
  const messageById = new Map(messageRows.map((row) => [row.id, row]))
  const session = await findSession(supabase, answerEvent.session_id)

  return {
    answerEventId: answerEvent.id,
    sessionId: answerEvent.session_id,
    anonymousId: session?.anonymous_id,
    referrer: session?.referrer,
    question:
      messageById.get(answerEvent.user_message_id)?.content ?? answerEvent.normalized_question,
    answer: answerEvent.assistant_message_id
      ? messageById.get(answerEvent.assistant_message_id)?.content ?? ""
      : "",
    answerMode: answerEvent.answer_mode,
    confidence: Number(answerEvent.confidence ?? 0),
    unresolved: answerEvent.unresolved,
    needsHandoff: answerEvent.answer_mode === "handoff" || answerEvent.unresolved,
    detectedCategory: answerEvent.detected_category,
    detectedIntent: answerEvent.detected_intent,
    handoffIntent:
      answerEvent.detected_category === "billing" ||
      answerEvent.detected_category === "hardware" ||
      answerEvent.detected_category === "troubleshooting"
        ? "support"
        : "demo",
    sources: [],
  }
}

export async function maybeCreateChannelTalkFeedbackHandoff(
  answerEventId: string,
  options: FeedbackHandoffOptions
) {
  if (options.rating !== "not_helpful" || !isEnabled()) return

  try {
    const supabase = createSupabaseAdminClient()
    const candidate = await fetchAnswerCandidate(supabase, answerEventId)
    if (!candidate) return

    const reasons = handoffReasons(candidate, "not_helpful_feedback")
    const message = formatHandoffMessage(candidate, reasons, options)
    const existing = await getExistingHandoff(supabase, answerEventId)

    if (existing?.status === "sent" && existing.channel_user_chat_id) {
      const channelMessage = await writeUserChatMessage(existing.channel_user_chat_id, message, botName())
      await updateHandoff(supabase, existing.id, {
        channel_message_id: channelMessage?.id ?? existing.payload?.channelMessageId ?? null,
        payload: {
          ...(existing.payload ?? {}),
          feedback: {
            rating: options.rating,
            comment: options.comment ?? null,
            appendedAt: new Date().toISOString(),
          },
        },
      })
      return
    }

    const dryRun = isDryRun()
    const row = existing ?? await insertPendingHandoff(supabase, candidate, reasons, message, dryRun)
    if (!row || dryRun) return
    await sendHandoffWithFailureTracking(supabase, row, candidate, message)
  } catch (error) {
    console.warn(
      "[chatbot] channel talk feedback handoff failed:",
      error instanceof Error ? error.message : error
    )
  }
}
