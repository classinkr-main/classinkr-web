// 측정 스크립트(scripts/chatbot-live-eval.ts)의 순수 판정 함수. 모델·문서·네트워크를 부르지 않는다.
// 테스트: tests/chatbot/answer-index/live-eval-checks.test.ts
//
// - 답 라우터 값(--router)과 결과 줄의 router.
// - modelError: 그 줄의 답에 쓰이는 모델 호출이 결제·인증 실패(401·402·403)를 받았거나 차단기가 그 호출을 막았는지.
//   모델 단계(--mode·--gate·--second-chance)를 모두 끈 측정에서는 모델을 일부러 끈 것이라 늘 false 다.
//   임베딩(embedContent)은 세지 않는다. 측정 스크립트는 Supabase 값을 지워 벡터 검색이 늘 빈 결과라,
//   임베딩이 실패해도 답이 바뀌지 않는다(lib/chatbot/service.ts searchSupabaseSources).
// - 모델 없는 측정(모든 모델 단계 끔)에서 Gemini 호출이 나간 줄 확인: compiled 면 측정 무효(종료 코드 3), 그 밖은 경고.
// - 답 색인 흔적(answerIndex, 사양 §3.7) → decidedBy 의 index:* 값.

export const ANSWER_ROUTERS = ["legacy", "shadow", "compiled"] as const
export type AnswerRouter = (typeof ANSWER_ROUTERS)[number]

/** 알 수 없는 값이면 null. 대소문자·앞뒤 공백은 무시한다. */
export function parseAnswerRouter(value: string | null | undefined): AnswerRouter | null {
  const normalized = value?.trim().toLowerCase()
  return (ANSWER_ROUTERS as readonly string[]).includes(normalized ?? "") ? (normalized as AnswerRouter) : null
}

// 결제·인증 실패. 이 상태를 받은 호출은 모델이 죽은 상태에서 나간 것이다(lib/chatbot/llm.ts 차단기와 같은 집합).
export const MODEL_ACCESS_DENIED_STATUSES: ReadonlySet<number> = new Set([401, 402, 403])

/** 답에 쓰이지 않는 Gemini 호출 종류. 측정 스크립트에는 벡터 검색이 없어 임베딩 결과를 쓰지 않는다. */
export const ANSWER_UNUSED_GEMINI_KINDS: ReadonlySet<string> = new Set(["embedContent", "batchEmbedContents"])

export interface GeminiCallRecord {
  /** URL 의 메서드 이름(generateContent·streamGenerateContent·embedContent). */
  kind: string
  /** HTTP 상태. 네트워크 오류·시간 초과는 0. */
  status: number
}

export interface ModelErrorInput {
  /** 이 측정에서 모델 단계(답 모델·관문·두 번째 검색) 가운데 하나라도 켜져 있는지. */
  modelStagesEnabled: boolean
  /** 그 줄에서 실제로 나간 Gemini 호출. */
  calls: GeminiCallRecord[]
  /** 차단기 때문에 보내지 않은 호출 수(종류별). */
  blockedKinds: Record<string, number>
  /** 관문(answerGate.skipReason)·두 번째 검색(secondChance.reason)의 이유. */
  skipReasons?: Array<string | null | undefined>
}

/**
 * 그 줄이 모델이 죽은 상태에서 잰 줄인지.
 * 참: 답에 쓰이는 호출이 401·402·403 을 받음 / 차단기가 답에 쓰이는 호출을 막음 / 관문·두 번째 검색이 차단기 때문에 넘어감(model_unavailable).
 * 거짓: 모델 단계를 모두 끈 측정, 임베딩만 실패·차단된 줄, 답 글에 고정 문구(MODEL_UNAVAILABLE_ANSWER)가 있어도 위 신호가 없는 줄.
 */
export function hasModelError(input: ModelErrorInput): boolean {
  if (!input.modelStagesEnabled) return false
  const deniedCall = input.calls.some(
    (call) => !ANSWER_UNUSED_GEMINI_KINDS.has(call.kind) && MODEL_ACCESS_DENIED_STATUSES.has(call.status)
  )
  const blockedCall = Object.entries(input.blockedKinds).some(
    ([kind, count]) => !ANSWER_UNUSED_GEMINI_KINDS.has(kind) && count > 0
  )
  return deniedCall || blockedCall || (input.skipReasons ?? []).includes("model_unavailable")
}

/**
 * 답에 쓰이는 호출(임베딩 제외)이 있었고 모두 일시 오류(429·5xx·네트워크 0)로 끝났는지. 측정 스크립트는 이런 줄을 다시 돌린다.
 * 임베딩만 실패한 줄은 답이 같으므로 다시 돌리지 않는다.
 */
export function isTransientGeminiFailure(calls: GeminiCallRecord[]) {
  const answerCalls = calls.filter((call) => !ANSWER_UNUSED_GEMINI_KINDS.has(call.kind))
  return answerCalls.length > 0 && answerCalls.every((call) => call.status === 0 || call.status === 429 || call.status >= 500)
}

/** 답에 쓰이는 호출(임베딩 제외) 가운데 나간 것과 막힌 것의 수. 조기 중단·decidedBy 가 '모델을 부른 줄'을 가릴 때 쓴다. */
export function countAnswerModelCalls(kinds: Record<string, number>, blockedKinds: Record<string, number>) {
  const sum = (record: Record<string, number>) =>
    Object.entries(record).reduce((total, [kind, count]) => total + (ANSWER_UNUSED_GEMINI_KINDS.has(kind) ? 0 : count), 0)
  return { calls: sum(kinds), blocked: sum(blockedKinds) }
}

/**
 * 차단기가 막은 호출의 종류를 호출 스택으로 가린다. 차단기 알림(notifyModelCircuitBlocked)은 URL 을 넘기지 않는다.
 * 임베딩(lib/chatbot/llm.ts embedText)은 첫 await 전에 차단기를 거치므로 동기 스택에 embedText 가 남는다.
 * 그 밖(관문·근거 선별·목차 고르기·답 생성)은 모두 generateContent 로 센다.
 */
export function classifyBlockedGeminiCall(stack: string | undefined): "embedContent" | "generateContent" {
  return /\bembedText\b/.test(stack ?? "") ? "embedContent" : "generateContent"
}

export interface ModelFreeRow {
  geminiCalls: number
  geminiBlocked: number
  geminiKinds: Record<string, number>
  geminiBlockedKinds?: Record<string, number>
}

export interface ModelFreeCheck {
  status: "ok" | "warn" | "invalid"
  /** Gemini 호출이 나갔거나 차단기에 막힌(= 부르려 한) 줄 수. */
  rows: number
  /** 그 줄들의 호출 종류별 합(나간 것 + 막힌 것). */
  kinds: Record<string, number>
}

/**
 * 모델 단계를 모두 끈 측정(--mode off --gate off --second-chance off)은 질문당 Gemini 호출이 0 이어야 한다(사양 §2.2).
 * 차단기에 막힌 호출도 부르려 한 것이라 함께 센다. compiled 측정이면 invalid(종료 코드 3), 그 밖은 warn(줄 수만 알림).
 */
export function checkModelFreeRun(options: { modelFree: boolean; router: AnswerRouter; rows: ModelFreeRow[] }): ModelFreeCheck {
  if (!options.modelFree) return { status: "ok", rows: 0, kinds: {} }
  const offending = options.rows.filter((row) => row.geminiCalls + row.geminiBlocked > 0)
  const kinds: Record<string, number> = {}
  for (const row of offending) {
    for (const record of [row.geminiKinds, row.geminiBlockedKinds ?? {}]) {
      for (const [kind, count] of Object.entries(record)) kinds[kind] = (kinds[kind] ?? 0) + count
    }
  }
  if (offending.length === 0) return { status: "ok", rows: 0, kinds }
  return { status: options.router === "compiled" ? "invalid" : "warn", rows: offending.length, kinds }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function firstTopId(trace: Record<string, unknown>): string | null {
  const top = Array.isArray(trace.top) ? trace.top : []
  const first = top[0]
  return isRecord(first) && typeof first.id === "string" && first.id ? first.id : null
}

/** 조각 판정의 결정 값(lib/chatbot/answer-index/types.ts 는 kind, 사양 §3.7 은 decision). */
export function segmentDecision(segment: Record<string, unknown>): unknown {
  return segment.kind ?? segment.decision
}

/** 조각 판정이 고른 카드(card·cardId·top[0].id 순서). */
export function segmentCard(segment: Record<string, unknown>): string | null {
  for (const value of [segment.card, segment.cardId]) if (typeof value === "string" && value) return value
  return firstTopId(segment)
}

/** 조각(segments 배열)이 둘 이상인데 일부만 답했으면 '나머지 조각 못 찾음' 한 줄이 붙은 답이다(사양 §3.5). 조각 수만 있으면 알 수 없다. */
function hasUnansweredSegment(trace: Record<string, unknown>) {
  const segments = Array.isArray(trace.segments) ? trace.segments.filter(isRecord) : []
  if (segments.length < 2) return false
  const decisions = segments.map(segmentDecision)
  return decisions.includes("answer") && decisions.some((decision) => decision !== "answer")
}

const nonEmptyString = (value: unknown) => (typeof value === "string" && value ? value : null)

/**
 * 답 색인 흔적(ChatbotCore.answerIndex, 사양 §3.7) → decidedBy.
 * index:<cardId> · index-partial:<cardId>(꼬리 붙음) · index-gap:<cardId> · index-abstain · index-clarify.
 * 색인이 답을 정하지 않은 줄(흔적 없음, shadow·legacy 라우터, 범위 밖 scope="out")은 null — 기존 decidedBy 를 쓴다.
 *
 * 읽는 필드: router, scope, decision, top[0].id, 그리고 있으면 card·cardId(고른 카드, top[0] 보다 먼저),
 * partial·tail(꼬리를 붙였는지), absentTail(꼬리를 붙일 없는 개념), absentHit(걸린 없는 개념, gap: 으로 시작하면 공백 카드 id),
 * segments[](조각 판정 배열: kind·decision, card). partial·tail 이 없으면 absentTail·absentHit 가 있는 answer 와
 * 일부 조각만 답한 answer 를 꼬리 붙은 답으로 본다.
 */
export function decidedByFromAnswerIndex(answerIndex: unknown): string | null {
  if (!isRecord(answerIndex)) return null
  if (typeof answerIndex.router === "string" && answerIndex.router !== "compiled") return null
  if (answerIndex.scope === "out") return null
  const cardId = nonEmptyString(answerIndex.card) ?? nonEmptyString(answerIndex.cardId)
  switch (answerIndex.decision) {
    case "abstain":
      return "index-abstain"
    case "clarify":
      return "index-clarify"
    case "gap": {
      const absentHit = nonEmptyString(answerIndex.absentHit)
      const absentCard = absentHit?.startsWith("gap:") ? absentHit : null
      const id = cardId ?? absentCard ?? firstTopId(answerIndex)
      return id ? `index-gap:${id}` : "index-gap"
    }
    case "answer": {
      const id = cardId ?? firstTopId(answerIndex) ?? "unknown"
      const explicit =
        typeof answerIndex.partial === "boolean"
          ? answerIndex.partial
          : typeof answerIndex.tail === "boolean"
            ? answerIndex.tail
            : null
      const partial =
        explicit ?? (Boolean(answerIndex.absentTail) || Boolean(answerIndex.absentHit) || hasUnansweredSegment(answerIndex))
      return `${partial ? "index-partial" : "index"}:${id}`
    }
    default:
      return null
  }
}
