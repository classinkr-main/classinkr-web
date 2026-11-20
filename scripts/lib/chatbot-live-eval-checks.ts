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

// ---------------------------------------------------------------------------
// 대화 입력·첫 시도·반복·가짜 Gemini·요약 비율(2026-11-20, 단위 U4). 모두 순수 함수이며 모델·DB 를 부르지 않는다.
// ---------------------------------------------------------------------------

export const ASKED_SLOTS = ["device", "size", "rooms", "mode", "timing", "choice"] as const
export type EvalAskedSlot = (typeof ASKED_SLOTS)[number]

/** 서버 대화 입력 계약(evaluateChatbotQuery 의 options.previousTurn)과 같은 꼴. 직전 한 턴만 넘긴다(DB 이력은 쓰지 않는다). */
export interface EvalPreviousTurn {
  question: string
  askedSlot?: EvalAskedSlot
  answerMode?: string
}

export const PREVIOUS_TURN_QUESTION_MAX = 200

/** 앞 턴의 질문·답으로 previousTurn 을 만든다. 질문은 200자로 자르고, 답 끝 질문의 종류는 askedSlotOf(answer) 로 구한다. */
export function buildPreviousTurn(
  question: string,
  answer: string | null | undefined,
  answerMode: string | null | undefined,
  askedSlotOf?: (answer: string) => EvalAskedSlot | null
): EvalPreviousTurn {
  const turn: EvalPreviousTurn = { question: question.slice(0, PREVIOUS_TURN_QUESTION_MAX) }
  const slot = answer && askedSlotOf ? askedSlotOf(answer) : null
  if (slot) turn.askedSlot = slot
  if (answerMode) turn.answerMode = answerMode
  return turn
}

export interface EvalTurnInput {
  question: string
}

/** 측정 단위. 한 줄 질문은 turns 가 하나다. */
export interface EvalCase {
  id: string
  group?: string
  expectTopic?: string | null
  /** 대화 입력이면 true(결과 줄 id 가 `<id>#t<n>` 이 된다). */
  conversation: boolean
  turns: EvalTurnInput[]
  pagePath?: string
}

export const PAGE_PATH_MAX = 300

function normalizeTurn(raw: unknown, where: string): EvalTurnInput {
  if (typeof raw === "string" && raw.trim()) return { question: raw }
  if (isRecord(raw) && typeof raw.question === "string" && raw.question.trim()) return { question: raw.question }
  throw new Error(`${where} 의 턴에 question 이 없습니다.`)
}

/**
 * 입력 배열(또는 {cases}) → EvalCase[].
 * 한 줄 형식 { id, question, group?, expectTopic?, pagePath? } 와 대화 형식 { id, turns:[문자열|{question}], pagePath? } 를 함께 받는다.
 * 둘 다 있으면 대화 형식을 쓴다. id 가 없으면 q001, 중복 id 는 오류다.
 */
export function parseEvalCases(raw: unknown): EvalCase[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw.cases : undefined
  if (!Array.isArray(list)) throw new Error("입력은 배열 또는 {cases:[...]} 형태여야 합니다.")
  const seen = new Set<string>()
  return list.map((item, index) => {
    const row = isRecord(item) ? item : {}
    const where = `${index + 1}번째 항목`
    const id = typeof row.id === "string" && row.id ? row.id : `q${String(index + 1).padStart(3, "0")}`
    if (seen.has(id)) throw new Error(`id 가 중복됩니다: ${id}`)
    seen.add(id)
    const pagePath = typeof row.pagePath === "string" && row.pagePath.trim() ? row.pagePath.trim().slice(0, PAGE_PATH_MAX) : undefined
    const base = {
      id,
      ...(typeof row.group === "string" ? { group: row.group } : {}),
      expectTopic: typeof row.expectTopic === "string" ? row.expectTopic : null,
      ...(pagePath ? { pagePath } : {}),
    }
    if (Array.isArray(row.turns)) {
      if (row.turns.length === 0) throw new Error(`${where} 의 turns 가 비었습니다.`)
      return { ...base, conversation: true, turns: row.turns.map((turn) => normalizeTurn(turn, where)) }
    }
    if (typeof row.question !== "string" || !row.question.trim()) throw new Error(`${where}에 question 이 없습니다.`)
    return { ...base, conversation: false, turns: [{ question: row.question }] }
  })
}

/** 결과 줄 id. 한 줄 질문은 그대로, 대화는 `<id>#t<순번(1부터)>`. */
export function turnRowId(item: Pick<EvalCase, "id" | "conversation">, turnIndex: number): string {
  return item.conversation ? `${item.id}#t${turnIndex + 1}` : item.id
}

export interface TurnRequest {
  question: string
  /** 첫 턴·한 줄 질문은 없다. */
  previousTurn?: EvalPreviousTurn
  pagePath?: string
}

/**
 * 대화를 턴 순서대로 돌린다. 앞 턴의 질문과 답으로 previousTurn 을 만들어 다음 턴에 넘긴다(DB 없음).
 * 앞 턴이 답을 못 냈으면(answer null) 다음 턴에는 previousTurn 을 넘기지 않는다. 결과는 턴마다 한 줄이다.
 */
export async function runConversationTurns<Row extends { answer: string | null; answerMode: string | null }>(options: {
  item: Pick<EvalCase, "turns" | "pagePath">
  runTurn: (request: TurnRequest, turnIndex: number) => Promise<Row>
  askedSlotOf?: (answer: string) => EvalAskedSlot | null
}): Promise<Row[]> {
  const rows: Row[] = []
  let previousTurn: EvalPreviousTurn | undefined
  for (let index = 0; index < options.item.turns.length; index += 1) {
    const question = options.item.turns[index].question
    const row = await options.runTurn(
      {
        question,
        ...(previousTurn ? { previousTurn } : {}),
        ...(options.item.pagePath ? { pagePath: options.item.pagePath } : {}),
      },
      index
    )
    rows.push(row)
    previousTurn = row.answer ? buildPreviousTurn(question, row.answer, row.answerMode, options.askedSlotOf) : undefined
  }
  return rows
}

export type ModelState = "ok" | "circuit_open" | "timeout" | "error"

/**
 * 한 시도의 모델 상태. 서비스가 modelState 흔적을 내면 그 값(알 수 없는 값은 무시)을, 없으면 호출 기록에서 가린다.
 * circuit_open: 차단기가 답에 쓰이는 호출을 막음 / timeout: 네트워크 오류·시간 초과(상태 0) / error: 4xx·5xx / ok: 그 밖.
 * 모델을 부르지 않았으면 ok. 임베딩은 답에 쓰이지 않으므로 세지 않는다.
 */
export function deriveModelState(input: {
  reported?: unknown
  calls: GeminiCallRecord[]
  blockedKinds: Record<string, number>
}): ModelState {
  if (input.reported === "ok" || input.reported === "circuit_open" || input.reported === "timeout" || input.reported === "error") {
    return input.reported
  }
  const blocked = Object.entries(input.blockedKinds).some(([kind, count]) => !ANSWER_UNUSED_GEMINI_KINDS.has(kind) && count > 0)
  if (blocked) return "circuit_open"
  const answerCalls = input.calls.filter((call) => !ANSWER_UNUSED_GEMINI_KINDS.has(call.kind))
  if (answerCalls.some((call) => call.status === 0)) return "timeout"
  if (answerCalls.some((call) => call.status >= 400)) return "error"
  return "ok"
}

/** 한 시도의 기록. 재시도 전에 지워지지 않게 시도마다 남긴다. */
export interface AttemptRecord {
  attempt: number
  answer: string | null
  decidedBy: string
  modelState: ModelState
  geminiStatuses: number[]
  error: string | null
}

export const SIMULATE_MODES = ["402", "hang", "429"] as const
export type SimulateMode = (typeof SIMULATE_MODES)[number]

export function parseSimulateMode(value: string | null | undefined): SimulateMode | null {
  const normalized = value?.trim().toLowerCase()
  return (SIMULATE_MODES as readonly string[]).includes(normalized ?? "") ? (normalized as SimulateMode) : null
}

/**
 * Gemini 호출을 대신하는 가짜 fetch. 네트워크로 나가지 않는다(실제 호출 0, 비용 0).
 * 402·429 는 그 상태의 JSON 응답, hang 은 응답하지 않다가 호출 쪽이 중단 신호(AbortSignal)를 보내면 AbortError 로 끝난다.
 * 중단 신호가 없으면 hangMs(기본 30초) 뒤에 오류로 끝나 측정이 멈춰 있지 않게 한다.
 */
export function simulateGeminiFetch(mode: SimulateMode, options: { hangMs?: number } = {}): typeof fetch {
  const hangMs = options.hangMs ?? 30_000
  return (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (mode === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        const abortError = () => Object.assign(new Error("simulated hang aborted"), { name: "AbortError" })
        const signal = init?.signal
        if (signal?.aborted) return reject(abortError())
        const timer = setTimeout(() => reject(new Error("simulated hang")), hangMs)
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer)
            reject(abortError())
          },
          { once: true }
        )
      })
    }
    const status = mode === "402" ? 402 : 429
    return new Response(JSON.stringify({ error: { code: status, message: `simulated ${status}`, status: "SIMULATED" } }), {
      status,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
}

/** 분자/분모 비율(분모 0 이면 0). 소수 셋째 자리까지 반올림한다. */
export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : 0
}

export interface RepeatDivergence {
  /** 반복 실행이 둘 이상인 질문(턴) 수. */
  groups: number
  /** 그 가운데 답이 서로 다른 것이 있었던 수. */
  diverged: number
  /** diverged / groups. */
  ratio: number
}

/** --repeat N 결과에서 같은 질문(키)을 여러 번 돌린 답이 갈린 비율. 답이 null(오류)인 실행은 '오류'라는 하나의 값으로 본다. */
export function answerDivergence(rows: Array<{ key: string; answer: string | null }>): RepeatDivergence {
  const byKey = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  for (const row of rows) {
    const set = byKey.get(row.key) ?? new Set<string>()
    set.add(row.answer ?? "\u0000error")
    byKey.set(row.key, set)
    counts.set(row.key, (counts.get(row.key) ?? 0) + 1)
  }
  let groups = 0
  let diverged = 0
  for (const [key, set] of byKey) {
    if ((counts.get(key) ?? 0) < 2) continue
    groups += 1
    if (set.size > 1) diverged += 1
  }
  return { groups, diverged, ratio: ratio(diverged, groups) }
}

export interface SummaryRow {
  gate: string | null
  modelState: string
  contextExpanded: boolean | null
  firstAttempt: { decidedBy: string; modelState: string; answerMode?: string | null } | null
}

export interface RowRatios {
  total: number
  gateSkipped: { count: number; ratio: number }
  modelState: Record<string, number>
  /** 서비스 흔적에 contextExpanded 가 있는 줄 가운데 참인 비율(흔적이 없는 줄은 분모에서 뺀다). */
  contextExpanded: { count: number; of: number; ratio: number }
  /** 첫 시도 기준 decidedBy 분포와 첫 시도가 모델 장애(ok 아님)였던 비율. */
  firstAttempt: { decidedBy: Record<string, number>; modelNotOk: { count: number; ratio: number } }
}

function tallyKeys(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
}

/** 요약에 찍는 비율들: gate skipped, modelState 분포, contextExpanded, 첫 시도 기준 decidedBy·모델 장애. */
export function summarizeRows(rows: SummaryRow[]): RowRatios {
  const total = rows.length
  const gateSkipped = rows.filter((row) => row.gate === "skipped").length
  const traced = rows.filter((row) => row.contextExpanded !== null)
  const expanded = traced.filter((row) => row.contextExpanded === true).length
  const first = rows.filter((row) => row.firstAttempt)
  const notOk = first.filter((row) => row.firstAttempt?.modelState !== "ok").length
  return {
    total,
    gateSkipped: { count: gateSkipped, ratio: ratio(gateSkipped, total) },
    modelState: tallyKeys(rows.map((row) => row.modelState)),
    contextExpanded: { count: expanded, of: traced.length, ratio: ratio(expanded, traced.length) },
    firstAttempt: {
      decidedBy: tallyKeys(first.map((row) => (row.firstAttempt?.decidedBy ?? "unknown").split(":")[0])),
      modelNotOk: { count: notOk, ratio: ratio(notOk, first.length) },
    },
  }
}
