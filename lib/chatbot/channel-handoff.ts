import "server-only"

import { SITE_URL } from "@/lib/seo"
import { redactPii, sanitizeChatbotPageUrl } from "@/lib/chatbot/pii"
import {
  HANDOFF_MESSAGE_MARKER,
  HANDOFF_QUESTION_HEADER,
  HANDOFF_ROUTING_QUESTION_PREFIX,
  describeHandoffIntent,
  describeHandoffReasons,
} from "@/lib/chatbot/handoff-message"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  createUserChat,
  isChannelApiConfigured,
  upsertChannelUserByMemberId,
  writeUserChatMessage,
} from "@/lib/channel-talk-api"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"

export {
  extractHandoffCustomerQuestion,
  isHandoffMessage,
} from "@/lib/chatbot/handoff-message"

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

/** 상담 전환 본문 [앞서 물은 내용]에 싣는 직전 대화 한 줄. 내용은 저장된 가림본(redacted)이어야 한다. */
export interface HandoffTurn {
  role: "user" | "assistant"
  content: string
}

export interface ChannelTalkHandoffCandidate {
  answerEventId: string
  sessionId: string
  anonymousId?: string | null
  referrer?: string | null
  pageUrl?: string | null
  path?: string | null
  question: string
  /** 대화 맥락(직전 한 턴)으로 넓힌 검색용 질문. 넓혔을 때만 있다("휴대폰이요" → "카메라가 안 켜져요 휴대폰이요"). */
  routingQuestion?: string | null
  answer: string
  answerMode: AnswerMode
  confidence: number
  unresolved: boolean
  needsHandoff: boolean
  detectedCategory?: string | null
  detectedIntent?: string | null
  handoffIntent: HandoffIntent
  sources: HandoffSource[]
  /**
   * 이번 질문 앞의 대화(오래된 것 → 최근, 가림본). 선택 인자 — 호출하는 쪽(service.ts persistExchange)이 넘기면 그대로 쓰고,
   * 없으면(undefined) 이 모듈이 chat_messages 에서 이번 답 이전 대화를 읽어 채운다. 빈 배열이면 "앞서 물은 내용 없음"으로 본다.
   */
  recentTurns?: HandoffTurn[] | null
}

interface FeedbackHandoffOptions {
  rating: "helpful" | "not_helpful"
  comment?: string | null
}

/** 세션에 남긴 연락 수단(값이 아니라 있는지만). 값은 채널톡 고객 프로필로만 간다 — 상담 글 본문에는 싣지 않는다. */
export interface HandoffContact {
  email: boolean
  phone: boolean
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
  last_error?: string | null
  updated_at?: string | null
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

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>

const HANDOFF_TABLE = "chatbot_channel_handoffs"
const HANDOFF_COLUMNS =
  "id, answer_event_id, session_id, channel_member_id, channel_user_id, channel_user_chat_id, status, payload, attempt_count, last_error, updated_at"
/** 보내기 전에 선점할 수 있는 상태. 'sending'·'abandoned' 는 20261125_chatbot_handoff_claim_retry.sql 이 더한다. */
const CLAIMABLE_STATUSES: readonly string[] = ["pending", "failed"]
/**
 * 선점 표시. 마이그레이션 뒤에는 status='sending' 과 함께, 마이그레이션 전(check 제약에 'sending' 이 없을 때)에는 이것만으로
 * last_error 에 "누가 보내는 중이거나, 보냈지만 결과를 못 적었다"를 남긴다. 이 표시가 있는 행은 누구도 다시 보내지 않는다.
 */
const SENDING_MARKER = "sending:"
const CHECK_VIOLATION_CODE = "23514"

/** 재전송 cron: 마지막 손질 뒤 이만큼 지난 pending·failed 만 다시 보낸다. */
export const HANDOFF_RETRY_AFTER_MS = 15 * 60_000
/** 보내기 시도(처음 포함) 상한. 이만큼 시도하고도 못 보냈으면 포기 표시하고 알림 한 번. */
export const HANDOFF_MAX_SEND_ATTEMPTS = 3
const RETRY_BATCH_LIMIT = 20
const RECENT_TURN_LIMIT = 6
const RECENT_TURN_MAX_LENGTH = 200
const RECENT_MESSAGE_WINDOW = 30

const DEFAULT_MIN_CONFIDENCE = 0.55
const MAX_PROFILE_VALUE_LENGTH = 300
const MAX_MESSAGE_SECTION_LENGTH = 1400
const MAX_ANSWER_SUMMARY_LENGTH = 700

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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

function isCheckViolation(error: unknown) {
  if (!error || typeof error !== "object") return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return (
    code === CHECK_VIOLATION_CODE ||
    (typeof message === "string" && /violates check constraint/i.test(message))
  )
}

function isSendingMarker(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(SENDING_MARKER)
}

function isClaimable(row: Pick<ExistingHandoffRow, "status" | "last_error">) {
  return CLAIMABLE_STATUSES.includes(row.status) && !isSendingMarker(row.last_error)
}

/**
 * 상담 전환 본문 '페이지:' 줄·lastPage 프로필·저장 payload 에 싣는 주소. 위젯이 보낸 pageUrl·요청 리퍼러·경로 어느 것이든
 * 서버에서 한 번 더 정화한다(CX-04): origin + 경로 + 광고 귀속 쿼리만 남기고, 추적 제외 경로(/unsubscribe·/share·/account 등)는
 * 경로만 남긴다. 옛 위젯이나 직접 호출이 쿼리째 보내도 수신거부 토큰·이메일이 상담 수신함에 평문으로 남지 않는다.
 */
export function absolutePageUrl(candidate: Pick<ChannelTalkHandoffCandidate, "pageUrl" | "referrer" | "path">) {
  for (const raw of [candidate.pageUrl, candidate.referrer, candidate.path]) {
    const cleaned = sanitizeChatbotPageUrl(raw, SITE_URL)
    if (cleaned) return cleaned
  }
  return SITE_URL
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

function recentTurnLines(turns: HandoffTurn[] | null | undefined) {
  return (turns ?? [])
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && turn.content?.trim())
    .slice(-RECENT_TURN_LIMIT)
    .map((turn) => {
      // 저장본은 이미 가림본이지만 호출하는 쪽이 원문을 넘겨도 연락처가 상담 글로 새지 않게 한 번 더 가린다.
      const text = compact(redactPii(turn.content), RECENT_TURN_MAX_LENGTH)
      return `${turn.role === "user" ? "고객" : "챗봇"}: ${text}`
    })
}

function contactLine(contact: HandoffContact | null | undefined) {
  if (contact === undefined) return "남긴 연락처: 확인하지 못했어요 — 채널톡 고객 정보를 확인해 주세요."
  const methods = [contact?.email ? "이메일" : null, contact?.phone ? "전화" : null].filter(Boolean)
  if (methods.length === 0) return "남긴 연락처: 없음 — 이 상담방으로 답해 주세요."
  return `남긴 연락처: ${methods.join("·")} (값은 채널톡 고객 정보에 있어요)`
}

export interface HandoffMessageExtras {
  /** 세션에 남긴 연락 수단. 키가 없거나 undefined 면 "확인하지 못함", null 이면 "없음". */
  contact?: HandoffContact | null
  /** candidate.recentTurns 보다 우선한다. */
  recentTurns?: HandoffTurn[] | null
}

/**
 * 상담원이 채널톡에서 보는 전환 글. 상담원에게 필요한 순서로 쓴다:
 * 머리말(목적·쉬운 말 사유) → [고객 질문] → [앞서 물은 내용](있으면) → [연락 방법] → [챗봇 답 요약]
 * → [사용자 피드백](있으면) → [참고 문서] → 맨 끝 [기술 정보](코드 값·세션·페이지).
 * 읽는 쪽(lib/chatbot/handoff-message.ts extractHandoffCustomerQuestion)은 이 형식과 옛 형식을 둘 다 읽는다.
 */
export function formatHandoffMessage(
  candidate: ChannelTalkHandoffCandidate,
  reasons: string[],
  feedback?: FeedbackHandoffOptions,
  extras: HandoffMessageExtras = {}
) {
  const feedbackLines =
    feedback?.rating === "not_helpful"
      ? [
          "",
          "[사용자 피드백]",
          "평가: 별로예요(도움 안 됨)",
          ...(feedback.comment ? [`코멘트: ${compact(feedback.comment, 500)}`] : []),
        ]
      : []

  const turns = recentTurnLines(
    extras.recentTurns !== undefined ? extras.recentTurns : candidate.recentTurns
  )

  return [
    `${HANDOFF_MESSAGE_MARKER} ${describeHandoffIntent(candidate.handoffIntent)} — ${describeHandoffReasons(reasons)}`,
    "",
    HANDOFF_QUESTION_HEADER,
    compactMultiline(candidate.question),
    ...(candidate.routingQuestion && candidate.routingQuestion !== candidate.question
      ? [`${HANDOFF_ROUTING_QUESTION_PREFIX} ${compactMultiline(candidate.routingQuestion)}`]
      : []),
    ...(turns.length > 0 ? ["", "[앞서 물은 내용]", ...turns] : []),
    "",
    "[연락 방법]",
    contactLine(extras.contact),
    "",
    "[챗봇 답 요약]",
    compactMultiline(candidate.answer, MAX_ANSWER_SUMMARY_LENGTH) || "(답 없음)",
    ...feedbackLines,
    "",
    "[참고 문서]",
    sourceLines(candidate.sources),
    "",
    "[기술 정보 — 상담에는 필요 없어요]",
    `전환 사유 코드: ${reasons.join(", ")}`,
    `문의 유형: ${candidate.detectedCategory ?? "unknown"} / ${candidate.detectedIntent ?? "unknown"}`,
    `상담 목적: ${candidate.handoffIntent}`,
    `답변 모드: ${candidate.answerMode}`,
    `신뢰도: ${candidate.confidence.toFixed(2)}`,
    `페이지: ${absolutePageUrl(candidate)}`,
    `세션: ${candidate.sessionId}`,
    `답변 이벤트: ${candidate.answerEventId}`,
  ].join("\n")
}

function contactOf(session: SessionRow | null | undefined): HandoffContact | null | undefined {
  if (session === undefined) return undefined
  if (session === null) return null
  return {
    email: Boolean(session.customer_email?.trim()),
    phone: Boolean(session.customer_phone?.trim()),
  }
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

async function getExistingHandoff(supabase: SupabaseAdmin, answerEventId: string) {
  const { data, error } = await supabase
    .from(HANDOFF_TABLE)
    .select(HANDOFF_COLUMNS)
    .eq("answer_event_id", answerEventId)
    .maybeSingle()

  if (error) throw error
  return data as ExistingHandoffRow | null
}

async function getReusableSessionChat(supabase: SupabaseAdmin, sessionId: string) {
  const { data, error } = await supabase
    .from(HANDOFF_TABLE)
    .select(HANDOFF_COLUMNS)
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
  supabase: SupabaseAdmin,
  candidate: ChannelTalkHandoffCandidate,
  reasons: string[],
  message: string,
  dryRun: boolean,
  extraPayload: Record<string, unknown> = {}
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
    ...extraPayload,
  }

  const { data, error } = await supabase
    .from(HANDOFF_TABLE)
    .insert({
      answer_event_id: candidate.answerEventId,
      session_id: candidate.sessionId,
      channel_member_id: memberId,
      status: dryRun ? "skipped" : "pending",
      reason: reasons.join(","),
      payload,
    })
    .select(HANDOFF_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") return getExistingHandoff(supabase, candidate.answerEventId)
    throw error
  }

  return data as ExistingHandoffRow
}

async function updateHandoff(supabase: SupabaseAdmin, id: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from(HANDOFF_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) throw error
}

/**
 * 보내기 전 선점(R11). pending·failed 이고 선점 표시가 없으며 attempt_count 가 읽은 값 그대로인 행만 바꾼다 —
 * 같은 건을 두 요청이 동시에 읽어도 조건부 갱신은 한 요청만 통과하므로 채널톡 전송은 한 번이다.
 * 'sending' 이 아직 check 제약에 없으면(마이그레이션 전) 상태는 그대로 두고 attempt_count·last_error 표시만으로 선점한다.
 * 선점한 행(갱신 뒤 값)을 돌려주고, 다른 요청이 먼저 가져갔으면 null.
 */
async function claimHandoff(
  supabase: SupabaseAdmin,
  row: ExistingHandoffRow,
  extraPatch: Record<string, unknown> = {}
): Promise<ExistingHandoffRow | null> {
  if (!isClaimable(row)) return null

  const attempts = row.attempt_count ?? 0
  const now = new Date().toISOString()
  const basePatch = {
    ...extraPatch,
    attempt_count: attempts + 1,
    last_error: `${SENDING_MARKER}${now}`,
    updated_at: now,
  }
  const run = (patch: Record<string, unknown>) =>
    supabase
      .from(HANDOFF_TABLE)
      .update(patch)
      .eq("id", row.id)
      .in("status", [...CLAIMABLE_STATUSES])
      .eq("attempt_count", attempts)
      .select(HANDOFF_COLUMNS)
      .maybeSingle()

  let { data, error } = await run({ ...basePatch, status: "sending" })
  if (error && isCheckViolation(error)) {
    ;({ data, error } = await run(basePatch))
  }
  if (error) throw error
  return (data as ExistingHandoffRow | null) ?? null
}

async function findSession(supabase: SupabaseAdmin, sessionId: string) {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, anonymous_id, customer_name, customer_email, customer_phone, referrer")
    .eq("id", sessionId)
    .maybeSingle()
  if (error) throw error
  return data as SessionRow | null
}

async function findSessionSafely(
  supabase: SupabaseAdmin,
  sessionId: string
): Promise<SessionRow | null | undefined> {
  try {
    return await findSession(supabase, sessionId)
  } catch (error) {
    console.warn("[chatbot] channel talk handoff session lookup failed:", errorMessage(error))
    return undefined
  }
}

/**
 * 이번 답(user_message_id) 앞에 같은 세션에서 오간 대화(가림본)를 오래된 것부터 돌려준다.
 * 이번 질문이 창 안에 없으면 어디까지가 "앞"인지 알 수 없으므로 빈 배열. 조회 실패도 빈 배열(전환 자체를 막지 않는다).
 */
async function loadRecentTurns(
  supabase: SupabaseAdmin,
  sessionId: string,
  userMessageId: string | null | undefined
): Promise<HandoffTurn[]> {
  if (!userMessageId) return []
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(RECENT_MESSAGE_WINDOW)
    if (error) throw error
    const rows = [...((data ?? []) as MessageRow[])].reverse()
    const index = rows.findIndex((row) => row.id === userMessageId)
    if (index < 0) return []
    return rows
      .slice(0, index)
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({ role: row.role as HandoffTurn["role"], content: row.content }))
      .slice(-RECENT_TURN_LIMIT)
  } catch (error) {
    console.warn("[chatbot] channel talk handoff recent turns lookup failed:", errorMessage(error))
    return []
  }
}

async function loadRecentTurnsForAnswerEvent(
  supabase: SupabaseAdmin,
  candidate: ChannelTalkHandoffCandidate
) {
  try {
    const { data, error } = await supabase
      .from("chatbot_answer_events")
      .select("user_message_id")
      .eq("id", candidate.answerEventId)
      .maybeSingle()
    if (error) throw error
    const userMessageId = (data as { user_message_id?: string | null } | null)?.user_message_id
    return loadRecentTurns(supabase, candidate.sessionId, userMessageId)
  } catch (error) {
    console.warn("[chatbot] channel talk handoff answer event lookup failed:", errorMessage(error))
    return []
  }
}

/**
 * 선점한 행을 채널톡으로 보낸다. 보내기 단계(사용자·상담방·글 쓰기)가 실패하면 failed 로 적고 던진다 — cron 이 다시 보낸다.
 * 보내기는 성공했는데 sent 기록이 실패하면 한 번 더 적어 보고, 그래도 실패하면 선점 표시를 그대로 둔다 —
 * 그 행은 cron 이 다시 보내지 않고 "보냈는지 확인 필요"로 포기 표시한다(이중 전송보다 확인 요청이 낫다).
 */
async function sendClaimedHandoff(
  supabase: SupabaseAdmin,
  row: ExistingHandoffRow,
  candidate: ChannelTalkHandoffCandidate,
  message: string,
  knownSession?: SessionRow | null
) {
  const memberId = row.channel_member_id ?? buildMemberId(candidate)
  let user: { id: string }
  let userChat: { id: string }
  let channelMessageId: string | null
  try {
    const session =
      knownSession === undefined ? await findSession(supabase, candidate.sessionId) : knownSession
    const reusable = await getReusableSessionChat(supabase, candidate.sessionId)
    user =
      reusable?.channel_user_id
        ? { id: reusable.channel_user_id }
        : await upsertChannelUserByMemberId({
            memberId,
            profile: buildUserProfile(candidate, session),
            tags: shouldReplaceUserTags() ? tagsFor(candidate) : undefined,
          })
    userChat =
      reusable?.channel_user_chat_id
        ? { id: reusable.channel_user_chat_id }
        : await createUserChat(user.id)
    const channelMessage = await writeUserChatMessage(userChat.id, message, botName())
    channelMessageId = channelMessage?.id ?? null
  } catch (error) {
    await updateHandoff(supabase, row.id, {
      status: "failed",
      last_error: errorMessage(error).slice(0, 1000),
    }).catch((updateError) => {
      console.warn("[chatbot] failed to mark channel talk handoff as failed:", errorMessage(updateError))
    })
    throw error
  }

  const sentPatch = {
    status: "sent",
    channel_member_id: memberId,
    channel_user_id: user.id,
    channel_user_chat_id: userChat.id,
    channel_message_id: channelMessageId,
    sent_at: new Date().toISOString(),
    last_error: null,
  }
  try {
    await updateHandoff(supabase, row.id, sentPatch)
  } catch {
    try {
      await updateHandoff(supabase, row.id, sentPatch)
    } catch (secondError) {
      console.warn(
        "[chatbot] channel talk handoff was sent but its status could not be recorded (will not resend):",
        errorMessage(secondError)
      )
    }
  }
}

async function deliverClaimedHandoff(
  supabase: SupabaseAdmin,
  row: ExistingHandoffRow,
  candidate: ChannelTalkHandoffCandidate,
  message: string,
  knownSession?: SessionRow | null
) {
  await sendClaimedHandoff(supabase, row, candidate, message, knownSession)
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
    console.warn("[chatbot] channel talk handoff notification failed:", errorMessage(notificationError))
  })
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
    // 이미 보냈거나(sent) 누가 보내는 중이거나(sending) 건너뛰었거나 포기한 건은 다시 만들지 않는다.
    if (existing && !isClaimable(existing)) return

    const session = await findSessionSafely(supabase, candidate.sessionId)
    const recentTurns =
      candidate.recentTurns !== undefined
        ? candidate.recentTurns ?? []
        : await loadRecentTurnsForAnswerEvent(supabase, candidate)
    const message = formatHandoffMessage(candidate, reasons, undefined, {
      contact: contactOf(session),
      recentTurns,
    })

    const dryRun = isDryRun()
    const row = existing ?? await insertPendingHandoff(supabase, candidate, reasons, message, dryRun)
    if (!row || dryRun) return

    const claimed = await claimHandoff(supabase, row, { payload: { ...(row.payload ?? {}), message } })
    if (!claimed) return
    await deliverClaimedHandoff(supabase, claimed, candidate, message, session)
  } catch (error) {
    console.warn("[chatbot] channel talk handoff failed:", errorMessage(error))
  }
}

async function fetchAnswerCandidate(
  supabase: SupabaseAdmin,
  answerEventId: string,
  { withRecentTurns = true }: { withRecentTurns?: boolean } = {}
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
  const recentTurns = withRecentTurns
    ? await loadRecentTurns(supabase, answerEvent.session_id, answerEvent.user_message_id)
    : []

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
    recentTurns,
  }
}

function hasFeedbackMark(payload: Record<string, unknown> | null | undefined) {
  const feedback = payload?.feedback
  return Boolean(feedback && typeof feedback === "object")
}

/**
 * 이미 보낸 상담방에 '별로예요' 글을 이어 붙이기 전 선점. payload.feedback 이 아직 없는 행만 바꾼다 —
 * 같은 답에 '별로예요'를 여러 번(동시에) 눌러도 채널톡 글은 한 번이다(R11).
 */
async function claimFeedbackRelay(
  supabase: SupabaseAdmin,
  row: ExistingHandoffRow,
  feedbackMark: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from(HANDOFF_TABLE)
    .update({
      payload: { ...(row.payload ?? {}), feedback: feedbackMark },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .is("payload->feedback", null)
    .select(HANDOFF_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return (data as ExistingHandoffRow | null) ?? null
}

export async function maybeCreateChannelTalkFeedbackHandoff(
  answerEventId: string,
  options: FeedbackHandoffOptions
) {
  if (options.rating !== "not_helpful" || !isEnabled()) return

  try {
    const supabase = createSupabaseAdminClient()
    const existing = await getExistingHandoff(supabase, answerEventId)
    // 같은 답의 '별로예요'는 한 번만 채널톡으로 간다.
    if (existing && hasFeedbackMark(existing.payload)) return
    if (existing && existing.status !== "sent" && !isClaimable(existing)) return

    const candidate = await fetchAnswerCandidate(supabase, answerEventId)
    if (!candidate) return

    const session = await findSessionSafely(supabase, candidate.sessionId)
    const reasons = handoffReasons(candidate, "not_helpful_feedback")
    const message = formatHandoffMessage(candidate, reasons, options, { contact: contactOf(session) })
    const feedbackMark = {
      rating: options.rating,
      comment: options.comment ?? null,
      appendedAt: new Date().toISOString(),
    }

    if (existing?.status === "sent") {
      if (!existing.channel_user_chat_id) return
      const claimed = await claimFeedbackRelay(supabase, existing, feedbackMark)
      if (!claimed) return
      let channelMessageId: string | null = null
      try {
        const channelMessage = await writeUserChatMessage(existing.channel_user_chat_id, message, botName())
        channelMessageId = channelMessage?.id ?? null
      } catch (sendError) {
        // 선점은 이미 했다 — 다시 누른다고 또 보내지 않는다. 실패 사유만 남긴다.
        await updateHandoff(supabase, existing.id, {
          payload: {
            ...(claimed.payload ?? {}),
            feedback: { ...feedbackMark, error: errorMessage(sendError).slice(0, 500) },
          },
        }).catch(() => undefined)
        throw sendError
      }
      await updateHandoff(supabase, existing.id, {
        channel_message_id: channelMessageId ?? existing.payload?.channelMessageId ?? null,
        payload: { ...(claimed.payload ?? {}), feedback: { ...feedbackMark, channelMessageId } },
      }).catch((updateError) => {
        console.warn("[chatbot] feedback relay sent but not recorded:", errorMessage(updateError))
      })
      return
    }

    const dryRun = isDryRun()
    const row =
      existing ??
      (await insertPendingHandoff(supabase, candidate, reasons, message, dryRun, { feedback: feedbackMark }))
    if (!row || dryRun) return

    const claimed = await claimHandoff(supabase, row, {
      payload: { ...(row.payload ?? {}), message, feedback: feedbackMark },
    })
    if (!claimed) return
    await deliverClaimedHandoff(supabase, claimed, candidate, message, session)
  } catch (error) {
    console.warn("[chatbot] channel talk feedback handoff failed:", errorMessage(error))
  }
}

/* ─────────────────────────────────────────────────────────────
 * 피드백 행 — 답 하나에 한 행(R11)
 * ───────────────────────────────────────────────────────────── */

type FeedbackRating = "helpful" | "not_helpful"

export interface SaveChatbotFeedbackOnceResult {
  created: boolean
  changed: boolean
  previousRating: FeedbackRating | null
}

/**
 * chatbot_feedback 를 답(answer_event_id) 하나에 한 행으로 저장한다. 이미 있으면 같은 값이면 그대로, 다르면(평가를 바꿈) 고친다.
 * 동시 저장이 20261125_chatbot_feedback_answer_unique.sql 의 유니크에 걸리면(23505) 다시 읽어 고친다.
 * service.ts saveChatbotFeedback 의 insert 를 이 함수로 바꾸는 한 줄이 필요하다(이 묶음은 service.ts 를 고치지 않는다).
 */
export async function saveChatbotFeedbackOnce(
  supabase: SupabaseAdmin,
  input: { answerEventId: string; rating: FeedbackRating; comment: string | null }
): Promise<SaveChatbotFeedbackOnceResult> {
  type FeedbackRow = { id: string; rating: FeedbackRating; comment: string | null }
  const readExisting = async () => {
    const { data, error } = await supabase
      .from("chatbot_feedback")
      .select("id, rating, comment")
      .eq("answer_event_id", input.answerEventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data as FeedbackRow | null
  }

  const applyTo = async (existing: FeedbackRow): Promise<SaveChatbotFeedbackOnceResult> => {
    if (existing.rating === input.rating && (existing.comment ?? null) === (input.comment ?? null)) {
      return { created: false, changed: false, previousRating: existing.rating }
    }
    const { error } = await supabase
      .from("chatbot_feedback")
      .update({ rating: input.rating, comment: input.comment })
      .eq("id", existing.id)
    if (error) throw new Error(error.message)
    return { created: false, changed: true, previousRating: existing.rating }
  }

  const existing = await readExisting()
  if (existing) return applyTo(existing)

  const { error } = await supabase.from("chatbot_feedback").insert({
    answer_event_id: input.answerEventId,
    rating: input.rating,
    comment: input.comment,
  })
  if (error) {
    if (error.code === "23505") {
      const concurrent = await readExisting()
      if (concurrent) return applyTo(concurrent)
    }
    throw new Error(error.message)
  }
  return { created: true, changed: true, previousRating: null }
}

/* ─────────────────────────────────────────────────────────────
 * 재전송 cron — pending·failed 로 남은 인계를 다시 보낸다
 * ───────────────────────────────────────────────────────────── */

export interface ChannelTalkHandoffRetryResult {
  ok: boolean
  enabled: boolean
  dryRun?: boolean
  scanned: number
  retried: number
  sent: number
  failed: number
  skipped: number
  gaveUp: number
  notified: boolean
}

function payloadString(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

function hasGaveUpMark(payload: Record<string, unknown> | null | undefined) {
  const retry = payload?.retry
  return Boolean(retry && typeof retry === "object" && (retry as Record<string, unknown>).gaveUpAt)
}

async function buildRetryCandidate(
  supabase: SupabaseAdmin,
  row: ExistingHandoffRow
): Promise<ChannelTalkHandoffCandidate | null> {
  const base = await fetchAnswerCandidate(supabase, row.answer_event_id, { withRecentTurns: false })
  if (!base) return null
  const payload = row.payload ?? {}
  const handoffIntent =
    payload.handoffIntent === "support" || payload.handoffIntent === "demo"
      ? payload.handoffIntent
      : base.handoffIntent
  return {
    ...base,
    question: payloadString(payload, "question") ?? base.question,
    answer: payloadString(payload, "answer") ?? base.answer,
    pageUrl: payloadString(payload, "pageUrl") ?? null,
    detectedCategory: payloadString(payload, "detectedCategory") ?? base.detectedCategory,
    detectedIntent: payloadString(payload, "detectedIntent") ?? base.detectedIntent,
    handoffIntent,
    sources: Array.isArray(payload.sources) ? (payload.sources as HandoffSource[]) : [],
  }
}

/** 포기 표시. payload.retry.gaveUpAt 이 없는 행만 바꾼다 — 같은 건에 알림이 두 번 가지 않는다. */
async function markGaveUp(
  supabase: SupabaseAdmin,
  row: ExistingHandoffRow,
  reason: "max_attempts" | "unknown_delivery"
) {
  const now = new Date().toISOString()
  const patch = {
    payload: { ...(row.payload ?? {}), retry: { gaveUpAt: now, reason } },
    last_error:
      reason === "unknown_delivery"
        ? "보냈는지 확인하지 못함(보내는 중 멈췄거나 보낸 뒤 기록 실패) — 채널톡에서 확인해 주세요."
        : row.last_error && !isSendingMarker(row.last_error)
          ? row.last_error
          : "재전송 상한에 닿아 포기",
    updated_at: now,
  }
  const run = (value: Record<string, unknown>) =>
    supabase
      .from(HANDOFF_TABLE)
      .update(value)
      .eq("id", row.id)
      .in("status", ["pending", "failed", "sending"])
      .is("payload->retry->gaveUpAt", null)
      .select(HANDOFF_COLUMNS)
      .maybeSingle()
  let { data, error } = await run({ ...patch, status: "abandoned" })
  if (error && isCheckViolation(error)) {
    ;({ data, error } = await run(patch))
  }
  if (error) throw error
  return (data as ExistingHandoffRow | null) ?? null
}

/**
 * cron 한 번: 마지막 손질 뒤 15분 넘은 pending·failed 를 다시 보낸다(보내기 전 선점을 똑같이 거친다).
 * 보내기 시도가 HANDOFF_MAX_SEND_ATTEMPTS 에 닿았거나, 선점 표시(sending)가 15분 넘게 남은 건(보냈는지 모름)은
 * 다시 보내지 않고 포기 표시한 뒤, 이번 실행에서 새로 포기한 건을 묶어 알림을 한 번 보낸다.
 */
export async function retryChannelTalkHandoffs(
  options: { now?: Date; limit?: number } = {}
): Promise<ChannelTalkHandoffRetryResult> {
  const result: ChannelTalkHandoffRetryResult = {
    ok: true,
    enabled: isEnabled(),
    scanned: 0,
    retried: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    gaveUp: 0,
    notified: false,
  }
  if (!result.enabled) return result
  if (isDryRun()) return { ...result, enabled: false, dryRun: true }

  const supabase = createSupabaseAdminClient()
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - HANDOFF_RETRY_AFTER_MS).toISOString()
  const { data, error } = await supabase
    .from(HANDOFF_TABLE)
    .select(HANDOFF_COLUMNS)
    .in("status", ["pending", "failed", "sending"])
    .lt("updated_at", cutoff)
    .is("payload->retry->gaveUpAt", null)
    .order("updated_at", { ascending: true })
    .limit(options.limit ?? RETRY_BATCH_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as ExistingHandoffRow[]
  result.scanned = rows.length
  const gaveUpRows: ExistingHandoffRow[] = []

  for (const row of rows) {
    try {
      if (hasGaveUpMark(row.payload)) {
        result.skipped += 1
        continue
      }
      if (row.status === "sending" || isSendingMarker(row.last_error)) {
        const marked = await markGaveUp(supabase, row, "unknown_delivery")
        if (marked) gaveUpRows.push(marked)
        continue
      }
      if ((row.attempt_count ?? 0) >= HANDOFF_MAX_SEND_ATTEMPTS) {
        const marked = await markGaveUp(supabase, row, "max_attempts")
        if (marked) gaveUpRows.push(marked)
        continue
      }

      const candidate = await buildRetryCandidate(supabase, row)
      if (!candidate) {
        result.skipped += 1
        continue
      }
      const storedReasons = Array.isArray(row.payload?.reasons)
        ? (row.payload?.reasons as unknown[]).filter((reason): reason is string => typeof reason === "string")
        : []
      const message =
        payloadString(row.payload, "message") ??
        formatHandoffMessage(candidate, storedReasons.length > 0 ? storedReasons : ["needs_handoff"])
      const claimed = await claimHandoff(supabase, row)
      if (!claimed) {
        result.skipped += 1
        continue
      }
      result.retried += 1
      try {
        await deliverClaimedHandoff(supabase, claimed, candidate, message)
        result.sent += 1
      } catch (sendError) {
        result.failed += 1
        console.warn("[chatbot] channel talk handoff retry failed:", errorMessage(sendError))
      }
    } catch (rowError) {
      result.failed += 1
      result.ok = false
      console.warn("[chatbot] channel talk handoff retry row error:", errorMessage(rowError))
    }
  }

  result.gaveUp = gaveUpRows.length
  if (gaveUpRows.length > 0) {
    const samples = gaveUpRows
      .slice(0, 3)
      .map((row) => `· ${compact(payloadString(row.payload, "question") ?? "(질문 없음)", 80)}`)
    try {
      await emitNotificationEvent({
        eventType: "chatbot.channel_talk_handoff_abandoned",
        notificationType: "action_required",
        categoryTag: "system",
        severity: "warning",
        scopeTag: "org_admin",
        title: `챗봇 상담 전환 ${gaveUpRows.length}건이 채널톡에 가지 못했어요`,
        message: [
          `다시 보내기를 ${HANDOFF_MAX_SEND_ATTEMPTS}회까지 하고도 못 보냈거나, 보냈는지 확인하지 못한 건이에요. 채널톡에서 확인하고 필요하면 고객에게 직접 연락해 주세요.`,
          ...samples,
        ].join("\n"),
        routeUrl: "/admin/channel-talk",
        source: "chatbot",
        sourceId: gaveUpRows[0]?.id,
        payload: {
          handoffIds: gaveUpRows.map((row) => row.id),
          answerEventIds: gaveUpRows.map((row) => row.answer_event_id),
        },
        channels: ["wecom_cs_webhook"],
      })
      result.notified = true
    } catch (notificationError) {
      console.warn(
        "[chatbot] channel talk handoff give-up notification failed:",
        errorMessage(notificationError)
      )
    }
  }

  return result
}
