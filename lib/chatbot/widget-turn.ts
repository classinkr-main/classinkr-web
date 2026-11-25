/**
 * 챗봇 위젯(components/ui/chatbot/useChatbotConversation.ts)이 쓰는 대화 맥락 도우미. 클라이언트에서 돌므로 서버 전용 모듈을 가져오지 않는다.
 *
 * - buildPreviousTurnPayload: 위젯 자기 메시지 상태에서 직전 한 턴(질문·그 질문의 답 끝 질문 종류·답 모드)을 만든다.
 *   서버 계약(lib/chatbot/conversation-context.ts, context.previousTurn)은 '질문 하나와 그 질문에 서버가 준 답'의 한 쌍이다.
 *   측정 스크립트(scripts/lib/chatbot-live-eval-checks.ts buildPreviousTurn)도 같은 쌍을 같은 방법(detectAskedSlot)으로 만든다.
 *   다른 점 하나: 위젯은 답을 받지 못한 질문(오류·시간 초과·중간에 끊김)을 건너뛰고 답을 받은 가장 최근 질문을 쓴다 — 고객은 다시 시도하거나
 *   다른 말로 이어 묻기 때문이다(CX-01). 측정 스크립트는 다시 시도하는 사람이 없어 앞 턴이 답을 못 냈으면 보내지 않는다. DB 이력은 둘 다 쓰지 않는다.
 * - shouldShowUnresolvedNudge: '못 풀림 3번' 재촉 말풍선을 붙일지. 서버가 이미 되묻거나 안내한 답(clarifying_question·fallback)
 *   뒤에는 붙이지 않는다(2026-11-20 조사 G17: 거의 같은 보기 목록을 두 번 연달아 보였다).
 * - shouldOfferHandoffChip: 같은 되묻기가 두 번 이어지면 사람 연결 칩을 붙일지(CX-22). 문구 자체는 엔진 라운드에서 고친다.
 * - 오류 종류(WidgetTurnErrorKind)와 한국어 문구 표: 브라우저 오류 글('Failed to fetch')은 화면에 내지 않는다(CX-01).
 */
import { detectAskedSlot, type AskedSlot } from "@/lib/chatbot/follow-up"

/** 서버가 받는 직전 질문 길이 상한(conversation-context.ts PREVIOUS_TURN_QUESTION_MAX 와 같다). */
export const WIDGET_PREVIOUS_TURN_QUESTION_MAX = 200

export interface WidgetTurnMessage {
  role: "assistant" | "user"
  content: string
  /** 서버 답(meta)에서 받은 답 모드. 위젯이 붙인 재촉·오류 말풍선에는 없다. */
  answerMode?: string
}

export interface PreviousTurnPayload {
  question: string
  askedSlot?: AskedSlot
  answerMode?: string
}

/**
 * 답을 받은 가장 최근 사용자 질문과 그 질문에 서버가 준 답으로 직전 턴을 만든다. 질문의 답은 그 질문과 다음 질문 사이에 있는
 * 서버 답(answerMode 있음)이다. 답을 받지 못한 질문(오류·시간 초과·중간에 끊김)과 위젯이 붙인 재촉·오류 말풍선(answerMode 없음)은 건너뛴다.
 */
export function buildPreviousTurnPayload(messages: readonly WidgetTurnMessage[]): PreviousTurnPayload | undefined {
  let segmentEnd = messages.length
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== "user") continue
    const answer = messages
      .slice(index + 1, segmentEnd)
      .find((message) => message.role === "assistant" && Boolean(message.answerMode))
    segmentEnd = index
    const question = messages[index].content.replace(/\s+/g, " ").trim().slice(0, WIDGET_PREVIOUS_TURN_QUESTION_MAX)
    if (!answer || !question) continue
    const askedSlot = detectAskedSlot(answer.content)
    return { question, ...(askedSlot ? { askedSlot } : {}), answerMode: answer.answerMode }
  }
  return undefined
}

/** 못 풀림이 이어질 때 위젯이 재촉 말풍선을 붙일지. 서버가 되묻거나(clarifying_question) 안내 답(fallback)을 냈으면 붙이지 않는다. */
export function shouldShowUnresolvedNudge(input: {
  streak: number
  threshold: number
  needsHandoff?: boolean
  answerMode?: string
}) {
  if (input.streak < input.threshold || input.needsHandoff) return false
  return input.answerMode !== "clarifying_question" && input.answerMode !== "fallback"
}

/** 같은 되묻기가 두 번 이어질 때 붙이는 사람 연결 칩. 누르면 서버로 보내지 않고 그 답 아래에 상담 연결 카드를 연다. */
export const WIDGET_HANDOFF_CHIP = "담당자에게 바로 물어보기"

const REPEAT_ANSWER_MODES = new Set(["clarifying_question", "fallback"])

function normalizeAnswerText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * 직전 서버 답과 글이 같은 되묻기(clarifying_question)·안내 답(fallback)이 또 왔으면 사람 연결 칩을 붙인다(CX-22).
 * 이미 상담 연결 답(needsHandoff)이면 카드가 따로 나오므로 붙이지 않는다.
 */
export function shouldOfferHandoffChip(input: {
  previousAnswer?: Pick<WidgetTurnMessage, "content" | "answerMode">
  answer: Pick<WidgetTurnMessage, "content" | "answerMode">
  needsHandoff?: boolean
}) {
  if (input.needsHandoff || !input.previousAnswer) return false
  if (!input.answer.answerMode || !REPEAT_ANSWER_MODES.has(input.answer.answerMode)) return false
  if (input.previousAnswer.answerMode !== input.answer.answerMode) return false
  const current = normalizeAnswerText(input.answer.content)
  return current.length > 0 && current === normalizeAnswerText(input.previousAnswer.content)
}

/** 마지막 서버 답(answerMode 있음). 위젯이 붙인 재촉·오류 말풍선은 건너뛴다. */
export function findLastServerAnswer<T extends WidgetTurnMessage>(messages: readonly T[]): T | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "assistant" && message.answerMode) return message
  }
  return undefined
}

/*
 * 오류 종류와 문구(CX-01). 문구는 말풍선 한 곳에만 보이고 스크린 리더에도 같은 문구를 한 번 알린다.
 * 브라우저·서버의 원래 오류 글은 콘솔에만 남긴다.
 */
export type WidgetTurnErrorKind = "network" | "server" | "rate_limited" | "timeout" | "interrupted" | "rejected"

export const WIDGET_TURN_ERROR_COPY: Record<WidgetTurnErrorKind, string> = {
  network: "인터넷 연결이 잠깐 끊긴 것 같아요. 연결을 확인한 뒤 다시 시도해 주세요.",
  server: "지금은 답변을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  rate_limited: "질문이 잠시 많이 들어왔어요. 잠깐 기다렸다가 다시 시도해 주세요.",
  timeout: "답변이 오래 걸려 멈췄어요. 다시 시도하거나 질문을 조금 짧게 보내 주세요.",
  interrupted: "답변을 받지 못했어요. 다시 시도해 주세요.",
  rejected: "이 질문은 보내지 못했어요. 질문을 조금 바꿔 다시 보내 주세요.",
}

/** 부분 답 아래에 붙이는 안내(CX-08). 받은 데까지는 지우지 않는다. */
export const WIDGET_INTERRUPTED_NOTICE = "답변이 중간에 끊겼어요"

/** 다시 시도해도 같은 결과일 오류에는 다시 시도 버튼을 두지 않는다. */
export function isRetryableWidgetError(kind: WidgetTurnErrorKind) {
  return kind !== "rejected"
}

/** 위젯이 던지는 오류. kind 로 문구를 고르고, 원래 사정(detail)은 콘솔에만 쓴다. */
export class WidgetTurnError extends Error {
  readonly kind: WidgetTurnErrorKind
  readonly retryAfterSeconds?: number

  constructor(kind: WidgetTurnErrorKind, options: { detail?: string; retryAfterSeconds?: number } = {}) {
    super(options.detail ?? kind)
    this.name = "WidgetTurnError"
    this.kind = kind
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

/**
 * 잡힌 오류를 종류로 나눈다. timedOut 은 위젯의 유휴 타이머가 요청을 끊었는지다(새 대화로 끊긴 요청은 부르는 쪽이 먼저 버린다).
 * fetch 가 TypeError 로 실패하거나 브라우저가 오프라인이면 네트워크, 나머지는 서버 오류로 본다.
 */
export function classifyWidgetTurnError(error: unknown, options: { timedOut?: boolean; online?: boolean } = {}): WidgetTurnErrorKind {
  if (error instanceof WidgetTurnError) return error.kind
  if (options.timedOut) return "timeout"
  if (options.online === false) return "network"
  if (error instanceof TypeError) return "network"
  return "server"
}

/** 429 대기 시간(초). Retry-After 가 초 수나 날짜면 따르고(1~60초로 자름), 없거나 읽지 못하면 10초. */
export const WIDGET_RATE_LIMIT_DEFAULT_SECONDS = 10

export function parseRetryAfterSeconds(value: string | null | undefined, now = Date.now()) {
  const raw = value?.trim()
  if (raw) {
    const seconds = /^\d+$/.test(raw) ? Number(raw) : Math.ceil((Date.parse(raw) - now) / 1000)
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(60, Math.max(1, seconds))
  }
  return WIDGET_RATE_LIMIT_DEFAULT_SECONDS
}

/** 다시 시도 버튼의 이름: '다시 시도: <질문 앞부분>'. 같은 화면에 버튼이 여럿이어도 어느 질문인지 들린다. */
export function buildRetryLabel(question: string, maxLength = 24) {
  const compact = question.replace(/\s+/g, " ").trim()
  const preview = compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact
  return preview ? `다시 시도: ${preview}` : "다시 시도"
}
