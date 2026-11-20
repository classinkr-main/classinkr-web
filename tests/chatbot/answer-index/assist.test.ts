import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { __setRouterAnswerIndexForTests, answerIndexDataDir, resetRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import {
  ANSWER_CARD_PICK_INSTRUCTION,
  answerAssistMode,
  assistCandidateBody,
  assistCandidates,
  assistTimeoutMs,
  buildAnswerCardPickInput,
  maybeAssistWithModel,
  resolveAssistPick,
  type AnswerCardPickRequest,
} from "@/lib/chatbot/answer-index/assist"
import { resolveAssistCalibration, type CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { decideWithAnalysis, type QuestionAnalysis } from "@/lib/chatbot/answer-index/decide"
import type { AnswerCard, AnswerIndexAssistTrace } from "@/lib/chatbot/answer-index/types"
import {
  __resetModelCircuitForTests,
  buildAnswerCardPickGenerationConfig,
  isAnswerCardPickRequestBody,
  parseAnswerCardPick,
  requestAnswerCardPick,
} from "@/lib/chatbot/llm"
import {
  __clearAnswerCacheForTests,
  evaluateChatbotQuery,
  MODEL_UNAVAILABLE_ANSWER,
  MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER,
  NO_SOURCE_FACT_ANSWER,
  streamChatbotQuery,
  type ChatbotStreamEvent,
} from "@/lib/chatbot/service"
import { decidedByFromAnswerIndex, summarizeAssistRows } from "@/scripts/lib/chatbot-live-eval-checks"
import { assistTransition, compareJudgedAssist, diffAssistRuns, toAssistEvalRow } from "@/scripts/answer-index/lib/assist-check-core"

import { CARDS, compileFixture } from "./index-fixture"
import { equivalenceHash, legacyEquivalenceCases, readLegacyEquivalence } from "./legacy-equivalence-lib"

/**
 * 답 색인 모델 선택 층(사양 §10, I11). 모델은 가짜 fetch 다(실제 Gemini·Vertex 호출 없음).
 * - 지시문은 글자 그대로, 후보 줄 꼴, 켜는 범위(off·band·always)와 calibration assist.
 * - 가짜 모델: pick 정상(다른 카드)·같은 카드·0·-1·범위 밖 번호·파싱 실패·시간 초과·402(차단기)·정책 주제·반례·없는 개념.
 * - off 면 흔적·호출·답이 그대로이고 legacy 동등성이 그대로다. stream 과 일반 경로 답이 같다. 질문당 모델 호출 1회.
 */

const firstParagraph = (text: string) => text.split("\n\n")[0]

interface RecordedCall {
  url: string
  body: {
    systemInstruction?: { parts?: { text?: string }[] }
    contents?: { parts?: { text?: string }[] }[]
    generationConfig?: Record<string, unknown>
  }
}

type Behavior = (call: RecordedCall, signal: AbortSignal | undefined) => Promise<Response> | Response

const calls: RecordedCall[] = []
let behavior: Behavior = () => {
  throw new Error("no fake model behavior")
}

const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const call: RecordedCall = { url, body: JSON.parse(String(init?.body ?? "{}")) as RecordedCall["body"] }
  calls.push(call)
  return behavior(call, init?.signal ?? undefined)
})

function geminiText(text: string, status = 200) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function geminiError(status: number) {
  return new Response(JSON.stringify({ error: { code: status, status: "SIMULATED" } }), { status, headers: { "content-type": "application/json" } })
}

const inputOf = (call: RecordedCall) => call.body.contents?.[0]?.parts?.[0]?.text ?? ""

/** 후보 줄에서 주제로 번호를 찾는다("[n] (종류) 주제 | …"). */
function numberOfTopic(input: string, topic: string) {
  for (const line of input.split("\n")) {
    const match = line.match(/^\[(\d+)\] \([a-z]+\) (.+?) \| /)
    if (match && match[2] === topic) return Number(match[1])
  }
  throw new Error(`후보에 없는 주제: ${topic}\n${input}`)
}

const pickTopic = (topic: string): Behavior => (call) => geminiText(JSON.stringify({ pick: numberOfTopic(inputOf(call), topic) }))
const pickNumber = (pick: number): Behavior => () => geminiText(JSON.stringify({ pick }))

function assistOf(result: { answerIndex?: { assist?: AnswerIndexAssistTrace } }) {
  return result.answerIndex?.assist
}

function stubModelEnv(assist: string | null) {
  vi.stubEnv("GEMINI_API_KEY", "test-model-key")
  vi.stubEnv("CHATBOT_GEMINI_PROVIDER", "developer")
  vi.stubEnv("GEMINI_FAST_MODEL", "")
  vi.stubEnv("GEMINI_REASONING_MODEL", "")
  vi.stubEnv("GEMINI_MODEL", "")
  vi.stubEnv("ANSWER_INDEX_DATA_DIR", undefined)
  vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
  vi.stubEnv("CHATBOT_ANSWER_ASSIST", assist ?? undefined)
  vi.stubEnv("CHATBOT_ASSIST_TIMEOUT_MS", undefined)
}

async function collectStream(message: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message, context: { showSources: true } }, {}, (event) => events.push(event))
  const replace = [...events].reverse().find((event) => event.type === "replace")
  const meta = events.find((event) => event.type === "meta")
  return {
    answer: replace && replace.type === "replace" ? replace.answer : undefined,
    needsHandoff: meta && meta.type === "meta" ? meta.meta.needsHandoff : undefined,
  }
}

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

beforeEach(() => {
  __clearAnswerCacheForTests()
  __resetModelCircuitForTests()
  calls.length = 0
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  __setRouterAnswerIndexForTests(null)
  __resetModelCircuitForTests()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  resetRouterAnswerIndex()
  vi.restoreAllMocks()
})

// ─── 설정·지시문·후보 줄 ─────────────────────────────────────────────────

describe("assist settings and prompt", () => {
  it("reads CHATBOT_ANSWER_ASSIST (off by default) and CHATBOT_ASSIST_TIMEOUT_MS (2,500ms by default)", () => {
    expect(answerAssistMode({})).toBe("off")
    expect(answerAssistMode({ CHATBOT_ANSWER_ASSIST: " Band " })).toBe("band")
    expect(answerAssistMode({ CHATBOT_ANSWER_ASSIST: "always" })).toBe("always")
    expect(answerAssistMode({ CHATBOT_ANSWER_ASSIST: "borderline" })).toBe("off")
    expect(assistTimeoutMs({})).toBe(2500)
    expect(assistTimeoutMs({ CHATBOT_ASSIST_TIMEOUT_MS: "1200" })).toBe(1200)
    expect(assistTimeoutMs({ CHATBOT_ASSIST_TIMEOUT_MS: "abc" })).toBe(2500)
    expect(assistTimeoutMs({ CHATBOT_ASSIST_TIMEOUT_MS: "5" })).toBe(200)
  })

  it("keeps the instruction text exactly (same as the band estimate)", () => {
    expect(ANSWER_CARD_PICK_INSTRUCTION).toBe(
      [
        "너는 ClassIn 한국 홈페이지 공개 챗봇의 '답 카드 고르기' 담당이다. 방문자 질문 하나와, 미리 검수해 둔 답 카드 후보가 번호와 함께 주어진다.",
        "규칙:",
        "1. 질문의 핵심 물음에 답하는 카드 번호 하나를 고른다. 세부가 조금 빠져도 핵심에 답하면 고른다. 여러 장이 맞으면 가장 구체적으로 맞는 카드.",
        "2. 어느 카드도 핵심 물음에 답하지 않으면 0. 공개 안내에 없다고 정직하게 알리는 카드(종류 gap 또는 '공개 안내에 없음'을 말하는 카드)가 질문 주제와 맞으면 그 카드를 고른다.",
        "3. 무엇을 묻는지 정말 알 수 없으면 -1.",
        "4. 카드 내용(주제·다루는 것·다루지 않음·답 앞부분) 밖의 지식으로 판단하지 않는다. '다루지 않음'에 질문이 걸리면 그 카드를 고르지 않는다.",
        '출력은 JSON 한 줄: {"pick": 번호}',
      ].join("\n")
    )
  })

  it("writes candidate lines as [n] (kind) topic | covers | not covered (max 3, no route) | answer head (200 chars)", () => {
    const index = compileFixture()
    const { analysis } = decideWithAnalysis(index, "수업 중 학생 채팅 막을 수 있나요?", { env: {} })
    const candidates = assistCandidates(index, analysis, {})
    expect(candidates[0].line).toBe(
      "[1] (doc) 수업 중 학생 채팅 막기 | 다루는 것: 수업 중 학생 채팅을 막는 방법 | 다루지 않음: - | 답 앞부분: 수업 중에 [채팅 금지] 버튼을 누르면 학생 채팅을 막을 수 있습니다. 경로: 교실 > [도구] > [채팅 금지]"
    )
    expect(candidates.map((candidate) => candidate.n)).toEqual(candidates.map((_, at) => at + 1))
    expect(candidates.length).toBeLessThanOrEqual(10)
    const input = buildAnswerCardPickInput("수업 중 학생 채팅 막을 수 있나요?", candidates)
    expect(input.startsWith("방문자 질문: 수업 중 학생 채팅 막을 수 있나요?\n\n답 카드 후보:\n[1] (doc) ")).toBe(true)

    const card = {
      ...index.cards[index.cardById.get(CARDS.replay)!].card,
      notCovers: ["녹화 파일 내려받기 → doc:/docs/fake/recording#1/download", "녹화 | 편집 → gap:x/y", "자막", "넷째"],
    } as AnswerCard
    expect(assistCandidateBody(card, index.currentUnits)).toContain("| 다루지 않음: 녹화 파일 내려받기 / 녹화 / 편집 / 자막 | 답 앞부분: ")
    const long = { ...card, kind: "policy", answer: { text: "가".repeat(300), textHash: "x", policyRef: "HQ-1" } } as AnswerCard
    expect(assistCandidateBody(long, index.currentUnits).endsWith(`답 앞부분: ${"가".repeat(200)}`)).toBe(true)
  })

  it("leaves out none slots, handoff cards and switched-off cards from the candidates", () => {
    const index = compileFixture()
    const { analysis } = decideWithAnalysis(index, "녹화 영상 다시보기 어디서 봐요", { env: {} })
    const all = assistCandidates(index, analysis, {}).map((candidate) => candidate.id)
    expect(all).toContain(CARDS.download)
    const off = assistCandidates(index, analysis, { CHATBOT_COMPILED_DISABLED_CARDS: CARDS.download }).map((candidate) => candidate.id)
    expect(off).not.toContain(CARDS.download)
    for (const id of all) expect(id.startsWith("handoff:")).toBe(false)
  })

  it("resolves calibration assist (invalid band → off)", () => {
    expect(resolveAssistCalibration(null)).toEqual({ enabled: false, band: [0.45, 0.62] })
    const file = (assist: unknown) => ({ assist }) as never
    expect(resolveAssistCalibration(file({ enabled: true, band: [0.4, 0.7], checkedOn: [] }))).toEqual({ enabled: true, band: [0.4, 0.7] })
    expect(resolveAssistCalibration(file({ enabled: true, band: [0.7, 0.4], checkedOn: [] })).enabled).toBe(false)
    expect(resolveAssistCalibration(file({ enabled: true, band: [0.4], checkedOn: [] })).enabled).toBe(false)
    expect(compileFixture().assist).toEqual({ enabled: false, band: [0.45, 0.62] })
  })
})

// ─── 모델 호출(llm.ts) ────────────────────────────────────────────────────

describe("requestAnswerCardPick (llm.ts)", () => {
  it("parses {\"pick\": n} and nothing else", () => {
    expect(parseAnswerCardPick('{"pick": 3}')).toBe(3)
    expect(parseAnswerCardPick('```json\n{"pick": -1}\n```')).toBe(-1)
    expect(parseAnswerCardPick('{"pick": 0}')).toBe(0)
    expect(parseAnswerCardPick('{"pick": "2"}')).toBeNull()
    expect(parseAnswerCardPick('{"pick": 1.5}')).toBeNull()
    expect(parseAnswerCardPick("2번이요")).toBeNull()
    expect(parseAnswerCardPick(undefined)).toBeNull()
  })

  it("asks with thinking low, a roomy output limit and a {pick: integer} schema", () => {
    for (const model of ["gemini-4-hydrogen", "gemini-3.5-flash-lite", "gemini-3.5-flash"]) {
      const config = buildAnswerCardPickGenerationConfig(model)
      expect(config.thinkingConfig, model).toEqual({ thinkingLevel: "low" })
      expect(config.maxOutputTokens, model).toBeGreaterThanOrEqual(1024)
      expect(config.temperature, model).toBe(0)
      expect(config.responseMimeType).toBe("application/json")
      expect(config.responseSchema).toEqual({ type: "object", properties: { pick: { type: "integer" } }, required: ["pick"] })
    }
  })

  it("uses the basic chain (gemini-4-hydrogen first) and moves on when that model alone fails", async () => {
    stubModelEnv("always")
    behavior = (call) => (call.url.includes("gemini-4-hydrogen") ? geminiError(404) : geminiText('{"pick": 2}'))
    const outcome = await requestAnswerCardPick({ instruction: ANSWER_CARD_PICK_INSTRUCTION, input: "방문자 질문: x\n\n답 카드 후보:\n[1] …", timeoutMs: 2000 })
    expect(outcome).toEqual({ ok: true, pick: 2, model: "gemini-3.5-flash" })
    expect(calls.map((call) => call.url.match(/models\/([^:]+):/)?.[1])).toEqual(["gemini-4-hydrogen", "gemini-3.5-flash"])
    expect(isAnswerCardPickRequestBody(JSON.stringify(calls[0].body))).toBe(true)
  })

  it("returns no_connection without a model key and never calls the network", async () => {
    stubModelEnv("always")
    vi.stubEnv("GEMINI_API_KEY", "")
    const outcome = await requestAnswerCardPick({ instruction: ANSWER_CARD_PICK_INSTRUCTION, input: "x", timeoutMs: 2000 })
    expect(outcome).toEqual({ ok: false, reason: "no_connection", model: null })
    expect(calls).toHaveLength(0)
  })
})

// ─── 받아들이는 조건(순수 함수) ──────────────────────────────────────────

/** 상위 5 밖이라 결정형이 검사하지 않은 자리에 카드를 하나 덧붙인 분석(반례 다시 검사 시험용). */
function withUncheckedRank(index: CompiledAnswerIndex, analysis: QuestionAnalysis, cardId: string): { analysis: QuestionAnalysis; at: number } {
  const card = index.cardById.get(cardId)!
  const ranked = [...analysis.whole.ranked, { card, id: cardId, kind: index.cards[card].kind, s: 0.01, components: null, check: null }]
  return {
    analysis: { ...analysis, whole: { ...analysis.whole, ranked, confs: [...analysis.whole.confs, 0.1] } },
    at: ranked.length - 1,
  }
}

describe("resolveAssistPick (acceptance rules)", () => {
  it("rejects a picked card whose negative matches the question (re-checked outside the top 5)", () => {
    const index = compileFixture()
    const question = "코스 명단에서 그만둔 학생 빼고 싶어요"
    const { decision, analysis } = decideWithAnalysis(index, question, { env: {} })
    // 결정형은 반례로 교실 내보내기 카드를 탈락시켰다.
    expect(analysis.whole.ranked.map((candidate) => candidate.id)).not.toContain(CARDS.kick)
    const patched = withUncheckedRank(index, analysis, CARDS.kick)
    const result = resolveAssistPick(index, patched.analysis, decision, [{ card: index.cardById.get(CARDS.kick)!, id: CARDS.kick, at: patched.at }], 1, { env: {} })
    expect(result).toMatchObject({ accepted: false, rejectReason: "negative", pickCard: CARDS.kick })
    expect(result.decision).toBe(decision)
  })

  it("rejects a card that does not cover an absent concept, and keeps the absent gap on 0 and -1", () => {
    const index = compileFixture()
    const { decision, analysis } = decideWithAnalysis(index, "ISMS 인증 받았나요?", { env: {} })
    expect(decision).toMatchObject({ kind: "gap", card: CARDS.gapCert })
    const patched = withUncheckedRank(index, analysis, CARDS.chat)
    const candidate = { card: index.cardById.get(CARDS.chat)!, id: CARDS.chat, at: patched.at }
    expect(resolveAssistPick(index, patched.analysis, decision, [candidate], 1, { env: {} })).toMatchObject({ accepted: false, rejectReason: "absent" })
    expect(resolveAssistPick(index, analysis, decision, [], 0, { env: {} })).toMatchObject({ accepted: true, decision })
    expect(resolveAssistPick(index, analysis, decision, [], -1, { env: {} })).toMatchObject({ accepted: false, rejectReason: "absent" })
  })

  it("rejects numbers outside -1..candidates", () => {
    const index = compileFixture()
    const { decision, analysis } = decideWithAnalysis(index, "수업 중 학생 채팅 막을 수 있나요?", { env: {} })
    const candidates = assistCandidates(index, analysis, {})
    for (const pick of [candidates.length + 1, -2, 1.5]) {
      expect(resolveAssistPick(index, analysis, decision, candidates, pick, { env: {} }), String(pick)).toMatchObject({
        accepted: false,
        rejectReason: "out_of_range",
        decision,
      })
    }
  })

  it("keeps policy topics on policy cards", () => {
    const index = compileFixture()
    const { decision, analysis } = decideWithAnalysis(index, "녹화 영상 다시보기 어디서 봐요", { env: {} })
    const candidates = assistCandidates(index, analysis, {})
    const download = candidates.find((candidate) => candidate.id === CARDS.download)!
    expect(resolveAssistPick(index, analysis, decision, candidates, download.n, { env: {}, isPolicyTopic: () => true })).toMatchObject({
      accepted: false,
      rejectReason: "policy_topic",
    })
    expect(resolveAssistPick(index, analysis, decision, candidates, download.n, { env: {}, isPolicyTopic: () => false })).toMatchObject({
      accepted: true,
      decision: { kind: "answer", card: CARDS.download },
    })
  })

  it("does not call the model in off mode and never throws when the request throws", async () => {
    const index = compileFixture()
    const { decision, analysis } = decideWithAnalysis(index, "수업 중 학생 채팅 막을 수 있나요?", { env: {} })
    const request = vi.fn<AnswerCardPickRequest>(async () => {
      throw new Error("boom")
    })
    const off = await maybeAssistWithModel({ index, analysis, decision, question: "q", mode: "off", request, env: {} })
    expect(off).toEqual({ decision, trace: null, modelFailure: null })
    expect(request).not.toHaveBeenCalled()
    const failed = await maybeAssistWithModel({ index, analysis, decision, question: "q", mode: "always", request, env: {} })
    expect(failed.decision).toBe(decision)
    expect(failed.trace).toMatchObject({ used: true, rejectReason: "error", accepted: false })
    expect(request).toHaveBeenCalledTimes(1)
  })
})

// ─── 서비스 경로(가짜 모델) ──────────────────────────────────────────────

describe("compiled route with the assist layer (fake model)", () => {
  beforeEach(() => {
    __setRouterAnswerIndexForTests(compileFixture())
  })

  it("follows a valid pick to another card with one model call and records the deterministic decision", async () => {
    stubModelEnv("always")
    behavior = pickTopic("녹화 파일 내려받기")
    const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.download })
    expect(assistOf(result)).toMatchObject({
      mode: "always",
      used: true,
      pick: 2,
      pickCard: CARDS.download,
      model: "gemini-4-hydrogen",
      accepted: true,
      rejectReason: null,
      original: { kind: "answer", card: CARDS.replay },
    })
    expect(assistOf(result)?.ms).toEqual(expect.any(Number))
    expect(result.answer).toContain("녹화 파일은 [다운로드] 버튼으로 내 컴퓨터에 저장할 수 있습니다.")
    expect(decidedByFromAnswerIndex(result.answerIndex)).toBe(`index:${CARDS.download}`)
    // 질문당 모델 호출 1회, 지시문 그대로, 가린 질문과 후보 줄.
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("models/gemini-4-hydrogen:generateContent")
    expect(calls[0].body.systemInstruction?.parts?.[0]?.text).toBe(ANSWER_CARD_PICK_INSTRUCTION)
    expect(inputOf(calls[0])).toContain("방문자 질문: 녹화 영상 다시보기 어디서 봐요")
    expect(inputOf(calls[0])).toContain("[2] (doc) 녹화 파일 내려받기 | ")
    expect(calls[0].body.generationConfig).toMatchObject({ thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json" })
    expect(result.modelState).toBe("ok")
  })

  it("keeps the deterministic decision when the model picks the same card", async () => {
    stubModelEnv("always")
    behavior = pickTopic("수업 녹화와 다시보기")
    const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.replay })
    expect(assistOf(result)).toMatchObject({ accepted: true, pick: 1, rejectReason: null })
  })

  it("turns pick 0 into the honest not-found answer, and keeps a deterministic gap card", async () => {
    stubModelEnv("always")
    behavior = pickNumber(0)
    const chat = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(chat.answerIndex).toMatchObject({ decision: "abstain", card: null })
    expect(chat.answer).toContain(firstParagraph(NO_SOURCE_FACT_ANSWER))
    expect(assistOf(chat)).toMatchObject({ pick: 0, accepted: true, original: { kind: "answer", card: CARDS.chat } })
    const gap = await evaluateChatbotQuery("ISMS 인증 받았나요?")
    expect(gap.answerIndex).toMatchObject({ decision: "gap", card: CARDS.gapCert })
    expect(assistOf(gap)).toMatchObject({ pick: 0, accepted: true })
  })

  it("turns pick -1 into the deterministic clarifying answer", async () => {
    stubModelEnv("always")
    behavior = pickNumber(-1)
    const result = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(result.answerIndex).toMatchObject({ decision: "clarify", card: null })
    expect(decidedByFromAnswerIndex(result.answerIndex)).toBe("index-clarify")
    expect(assistOf(result)).toMatchObject({ pick: -1, accepted: true })
  })

  it("keeps the deterministic answer for an out-of-range number", async () => {
    stubModelEnv("always")
    behavior = pickNumber(99)
    const result = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.chat })
    expect(assistOf(result)).toMatchObject({ pick: 99, pickCard: null, accepted: false, rejectReason: "out_of_range" })
    expect(result.answer).toContain("[채팅 금지]")
  })

  it("keeps the deterministic answer when the output does not parse (no MODEL_UNAVAILABLE_ANSWER)", async () => {
    stubModelEnv("always")
    behavior = () => geminiText("2번 카드가 맞아요")
    const result = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.chat })
    expect(assistOf(result)).toMatchObject({ used: true, pick: null, accepted: false, rejectReason: "parse_error", model: "gemini-4-hydrogen" })
    expect(result.answer).toContain("[채팅 금지]")
    expect(result.answer).not.toContain(firstParagraph(MODEL_UNAVAILABLE_ANSWER))
    expect(calls).toHaveLength(1)
    expect(result.modelState).toBe("error")
  })

  it("keeps the deterministic answer on a timeout (CHATBOT_ASSIST_TIMEOUT_MS)", async () => {
    stubModelEnv("always")
    vi.stubEnv("CHATBOT_ASSIST_TIMEOUT_MS", "300")
    behavior = (_call, signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true })
      })
    const started = Date.now()
    const result = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(Date.now() - started).toBeLessThan(2000)
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.chat })
    expect(assistOf(result)).toMatchObject({ used: true, accepted: false, rejectReason: "timeout" })
    expect(result.answer).not.toContain(firstParagraph(MODEL_UNAVAILABLE_ANSWER))
    expect(result.modelState).toBe("timeout")
    expect(calls).toHaveLength(1)
  })

  it("keeps the deterministic answer on 402 and then skips the network while the circuit is open", async () => {
    stubModelEnv("always")
    behavior = () => geminiError(402)
    const first = await evaluateChatbotQuery("수업 중 학생 채팅 막을 수 있나요?")
    expect(first.answerIndex).toMatchObject({ decision: "answer", card: CARDS.chat })
    expect(assistOf(first)).toMatchObject({ used: true, accepted: false, rejectReason: "access_denied" })
    expect(calls).toHaveLength(1)
    const second = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(second.answerIndex).toMatchObject({ decision: "answer", card: CARDS.replay })
    expect(assistOf(second)).toMatchObject({ rejectReason: "circuit_open", accepted: false })
    expect(calls).toHaveLength(1)
    for (const result of [first, second]) {
      expect(result.answer).not.toContain(firstParagraph(MODEL_UNAVAILABLE_ANSWER))
      expect(result.answer).not.toContain(firstParagraph(MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER))
      expect(result.modelState).toBe("circuit_open")
    }
  })

  it("falls back to the deterministic answer when the picked card cannot be rendered", async () => {
    stubModelEnv("always")
    const base = compileFixture()
    const at = base.cardById.get(CARDS.download)!
    const compiled = base.cards[at]
    if (compiled.card.kind !== "doc") throw new Error("download card should be a doc card")
    const broken = {
      ...compiled.card,
      answer: { ...compiled.card.answer, sentences: compiled.card.answer.sentences.map((ref) => ({ ...ref, hashes: ref.hashes.map(() => "0000000000000000") })) },
    }
    const cards = base.cards.map((card, position) => (position === at ? { ...card, card: broken } : card))
    __setRouterAnswerIndexForTests({ ...base, cards })
    behavior = pickTopic("녹화 파일 내려받기")
    const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.replay })
    expect(result.answerIndex?.unavailable ?? null).toBeNull()
    expect(assistOf(result)).toMatchObject({ used: true, pick: 2, pickCard: CARDS.download, accepted: false, rejectReason: "card_unavailable" })
    expect(result.answer).toContain("[다시보기]")
  })

  it("does not move a policy-topic question to a document card", async () => {
    stubModelEnv("always")
    behavior = pickTopic("한 교실 학생 수")
    const result = await evaluateChatbotQuery("요금이 어떻게 돼요?")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.price })
    expect(assistOf(result)).toMatchObject({ accepted: false, rejectReason: "policy_topic", pickCard: CARDS.count })
  })

  it("asks once per index-decided question and not at all for pre-index answers or empty candidate lists", async () => {
    stubModelEnv("always")
    behavior = pickNumber(1)
    const asked = ["수업 중 학생 채팅 막을 수 있나요?", "녹화 영상 다시보기 어디서 봐요", "요금이 어떻게 돼요?", "ISMS 인증 받았나요?"]
    for (const [at, question] of asked.entries()) {
      const result = await evaluateChatbotQuery(question)
      expect(assistOf(result)?.used, question).toBe(true)
      expect(calls, question).toHaveLength(at + 1)
    }
    const before = calls.length
    for (const question of ["안녕하세요", "상담원 연결해 주세요", "에러나요"]) {
      const result = await evaluateChatbotQuery(question)
      expect(assistOf(result)?.used ?? false, question).toBe(false)
    }
    expect(calls).toHaveLength(before)
  })

  it("gives the same answer on the stream and non-stream paths", async () => {
    stubModelEnv("always")
    behavior = pickTopic("녹화 파일 내려받기")
    const question = "녹화 영상 다시보기 어디서 봐요"
    const nonStream = await evaluateChatbotQuery(question)
    expect(calls).toHaveLength(1)
    __clearAnswerCacheForTests()
    const stream = await collectStream(question)
    expect(calls).toHaveLength(2)
    expect(stream.answer).toBe(nonStream.answer)
    expect(stream.needsHandoff).toBe(nonStream.needsHandoff)
    expect(stream.answer).toContain("[다운로드]")
  })

  it("does not cache an answer made after a failed model call on the stream path", async () => {
    stubModelEnv("always")
    behavior = () => geminiText("not json")
    const question = "녹화 영상 다시보기 어디서 봐요"
    await collectStream(question)
    behavior = pickTopic("녹화 파일 내려받기")
    const second = await collectStream(question)
    expect(second.answer).toContain("[다운로드]")
    expect(calls).toHaveLength(2)
  })

  describe("band mode", () => {
    it("does nothing while calibration assist.enabled is false", async () => {
      stubModelEnv("band")
      behavior = pickTopic("녹화 파일 내려받기")
      const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
      expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.replay })
      expect(assistOf(result)).toMatchObject({ mode: "band", used: false, rejectReason: "calibration_disabled", accepted: false })
      expect(calls).toHaveLength(0)
    })

    it("asks only inside [θ_lo, θ_hi) and leaves gap/absent decisions and confident answers alone", async () => {
      stubModelEnv("band")
      const base = compileFixture()
      __setRouterAnswerIndexForTests({ ...base, assist: { enabled: true, band: [0.5, 0.99] } })
      behavior = pickTopic("녹화 파일 내려받기")
      const inBand = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
      expect(assistOf(inBand)).toMatchObject({ used: true, accepted: true })
      expect(inBand.answerIndex).toMatchObject({ card: CARDS.download })
      expect(calls).toHaveLength(1)

      const gap = await evaluateChatbotQuery("ISMS 인증 받았나요?")
      expect(assistOf(gap)).toMatchObject({ used: false, rejectReason: "gap" })
      expect(gap.answerIndex).toMatchObject({ decision: "gap", card: CARDS.gapCert })

      __clearAnswerCacheForTests()
      __setRouterAnswerIndexForTests({ ...base, assist: { enabled: true, band: [0.3, 0.9] } })
      const confident = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
      expect(assistOf(confident)).toMatchObject({ used: false, rejectReason: "out_of_band" })
      expect(confident.answerIndex).toMatchObject({ card: CARDS.replay })
      expect(calls).toHaveLength(1)
    })
  })

  it("off (default) adds no trace, no model call and the same answers", async () => {
    const questions = ["수업 중 학생 채팅 막을 수 있나요?", "녹화 영상 다시보기 어디서 봐요", "요금이 어떻게 돼요?", "ISMS 인증 받았나요?", "에러나요"]
    behavior = pickTopic("녹화 파일 내려받기")
    const answers: Record<string, string[]> = {}
    for (const assist of [null, "off"]) {
      stubModelEnv(assist)
      __clearAnswerCacheForTests()
      answers[String(assist)] = []
      for (const question of questions) {
        const result = await evaluateChatbotQuery(question)
        expect(result.answerIndex && "assist" in result.answerIndex, question).toBe(false)
        answers[String(assist)].push(`${result.answerMode}|${result.answer}`)
      }
    }
    expect(answers.off).toEqual(answers.null)
    expect(calls).toHaveLength(0)
  })
})

describe("legacy equivalence with the assist switch set", () => {
  it("keeps every legacy answer when CHATBOT_ANSWER_ASSIST is set but the router is legacy or unset", async () => {
    const expected = readLegacyEquivalence().hashes
    const cases = legacyEquivalenceCases()
    for (const [router, assist] of [
      [null, "off"],
      ["legacy", "always"],
    ] as const) {
      vi.stubEnv("ANSWER_INDEX_DATA_DIR", undefined)
      vi.stubEnv("GEMINI_API_KEY", "")
      vi.stubEnv("CHATBOT_ANSWER_ROUTER", router ?? undefined)
      vi.stubEnv("CHATBOT_ANSWER_ASSIST", assist)
      expect(answerIndexDataDir()).toBe(`${process.cwd()}/data/answer-index`)
      const differing: string[] = []
      for (const item of cases) {
        __clearAnswerCacheForTests()
        const hash = equivalenceHash(await evaluateChatbotQuery(item.question, { generateAnswer: false }))
        if (hash !== expected[item.key]) differing.push(item.key)
      }
      expect(differing, `${String(router)}/${assist}`).toEqual([])
      vi.unstubAllEnvs()
    }
    expect(calls).toHaveLength(0)
  }, 600_000)
})

// ─── 측정 도구 ───────────────────────────────────────────────────────────

describe("live-eval and assist-check helpers", () => {
  const trace = (assist: Partial<AnswerIndexAssistTrace> | null, decision = "answer", card: string | null = "c2") => ({
    router: "compiled",
    scope: "in",
    decision,
    card,
    ...(assist
      ? {
          assist: {
            mode: "always",
            used: true,
            pick: 2,
            pickCard: "c2",
            model: "m",
            ms: 10,
            accepted: true,
            rejectReason: null,
            original: { kind: "answer", card: "c1", conf: 0.5 },
            ...assist,
          },
        }
      : {}),
  })

  it("summarizes assist traces", () => {
    const summary = summarizeAssistRows([
      trace({}),
      trace({ pick: 0, accepted: true, original: { kind: "abstain", card: null, conf: 0.2 } }, "abstain", null),
      trace({ used: false, pick: null, accepted: false, rejectReason: "out_of_band", ms: null, original: { kind: "answer", card: "c2", conf: 0.9 } }),
      trace(null),
      undefined,
    ])
    expect(summary).toMatchObject({ traced: 3, used: 2, accepted: 2, changed: 1, rejectReasons: { out_of_band: 1 }, picks: { card: 1, "0": 1 } })
    expect(summary.ms).toEqual([10, 10])
  })

  it("diffs off/on runs and compares judged results against the §10 switch-on rule", () => {
    const row = (id: string, answer: string, decidedBy: string) => toAssistEvalRow({ id, question: `q-${id}`, answer, answerMode: "direct_answer", needsHandoff: false, decidedBy, sources: [] })
    const off = [row("a", "A", "index:c1"), row("b", "B", "index:c1"), row("c", "C", "index-abstain")]
    const on = [row("a", "A", "index:c1"), row("b", "B2", "index:c2"), row("c", "C2", "index:c3")]
    const diff = diffAssistRuns(off, on)
    expect(diff.matched).toBe(3)
    expect(diff.changed.map((item) => item.id)).toEqual(["b", "c"])
    expect(diff.transitions).toEqual({ "index → index(다른 카드)": 1, "index-abstain → index": 1 })
    expect(assistTransition("index:c1", "index:c1")).toBe("index (같음)")

    const judged = (verdicts: Record<string, string>) => ({ rows: Object.entries(verdicts).map(([id, verdict]) => ({ id, verdict })) })
    const pass = compareJudgedAssist(judged({ b: "wrong", c: "nf_doc_has" }), judged({ b: "good", c: "good" }), 200)
    expect(pass).toMatchObject({ n: 2, netGain: 2, goodToBad: 0, badToGood: 2, pass: true })
    const fail = compareJudgedAssist(judged({ b: "good", c: "nf_doc_has" }), judged({ b: "wrong", c: "good" }), 50)
    expect(fail.pass).toBe(false)
    expect(fail.netGain).toBe(0)
  })
})
