import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __clearAnswerGateCacheForTests, checkPreparedAnswer } from "@/lib/chatbot/answer-gate"
import {
  embedText,
  isModelCircuitOpen,
  MODEL_CIRCUIT_OPEN_MS,
  selectAnsweringSentenceIds,
  setModelCircuitBlockedListener,
} from "@/lib/chatbot/llm"
import {
  __clearAnswerCacheForTests,
  evaluateChatbotQuery,
  MODEL_UNAVAILABLE_ANSWER,
  MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER,
  NO_SOURCE_FACT_ANSWER,
  streamChatbotQuery,
  type ChatbotStreamEvent,
  type ChatbotStreamMeta,
} from "@/lib/chatbot/service"
import {
  answerGateResponse,
  evidenceSelectionResponse,
  isAnswerGateCall,
  isEvidenceSelectionCall,
  isOutlinePickCall,
  outlinePickResponse,
} from "./helpers/final-answer-llm"
import { __resetModelCircuitForTests as __resetCircuit } from "@/lib/chatbot/llm"

// 모델(근거 선별) 호출이 실패했을 때 확인되지 않은 검색 조각을 답으로 내지 않는다(lib/chatbot/service.ts withholdUnverifiedDraft).
// 2026-11-18 Gemini 크레딧 소진(모든 호출 402) 상태에서 처음 보는 질문 90개 중 46건이 검색 조각 초안을 그대로 냈다.

function disableSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
}

// 낱말 목록 안의 질문. 모델이 죽은 상태에서 검색 조각 초안("재원생을 클래스인에 처음 올릴 때는…")이 그대로 나가던 질문이다.
const IN_VOCAB_QUESTION = "학생 계정은 따로 만들어 줘야 하나요"
const MODEL_UNAVAILABLE_HEAD = MODEL_UNAVAILABLE_ANSWER.split("\n\n")[0]

type Failure = "402" | "500" | "timeout" | "parse"

function failingResponse(failure: Failure) {
  if (failure === "timeout") {
    // AbortController 가 시간 초과로 끊은 것과 같은 오류를 낸다.
    return Promise.reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }))
  }
  if (failure === "parse") {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }) })
  }
  const status = failure === "402" ? 402 : 500
  return Promise.resolve({ ok: false, status, json: async () => ({}), text: async () => `error ${status}` })
}

interface StubOptions {
  /** 근거 선별 호출의 결과. 실패 종류나 고를 번호. */
  selection?: Failure | number[]
  verdict?: "answers" | "off_target"
  /** 관문 호출도 실패시킨다. */
  gate?: Failure
}

function stubModel({ selection = "402", verdict = "answers", gate }: StubOptions = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (isAnswerGateCall(init)) {
      calls.push("gate")
      return gate ? failingResponse(gate) : answerGateResponse(verdict)
    }
    if (isOutlinePickCall(init)) {
      calls.push("outline")
      return outlinePickResponse([])
    }
    if (isEvidenceSelectionCall(init)) {
      calls.push("selection")
      return Array.isArray(selection) ? evidenceSelectionResponse(selection) : failingResponse(selection)
    }
    calls.push("other")
    return { ok: true, status: 200, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return { calls, fetchMock }
}

async function collectStream(message: string) {
  const events: ChatbotStreamEvent[] = []
  await streamChatbotQuery({ message }, {}, (event) => events.push(event))
  const replaces = events.filter((event): event is { type: "replace"; answer: string } => event.type === "replace")
  const meta = events.find((event): event is { type: "meta"; meta: ChatbotStreamMeta } => event.type === "meta")?.meta
  const deltas = events.filter((event) => event.type === "delta")
  return { answer: replaces.at(-1)?.answer ?? "", meta, deltas }
}

describe("모델 호출 실패 시 확인 안 된 조각을 내지 않는다", () => {
  beforeEach(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_ANSWER_GATE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    __clearAnswerGateCacheForTests()
    __clearAnswerCacheForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("기준: 모델 없이 만든 초안은 검색 조각이다(이 질문은 낱말 목록 안이라 기존에는 보류되지 않았다)", async () => {
    const draft = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { generateAnswer: false })
    expect(draft.answerMode).toBe("direct_answer")
    expect(draft.sources.length).toBeGreaterThan(0)
    expect(draft.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })

  for (const failure of ["402", "500", "timeout", "parse"] as const) {
    it(`선별 호출이 실패(${failure})하면 낱말 목록 안 질문도 조각 대신 고정 문구와 상담 버튼을 낸다`, async () => {
      const draft = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { generateAnswer: false })
      const { calls } = stubModel({ selection: failure })

      const result = await evaluateChatbotQuery(IN_VOCAB_QUESTION)

      expect(calls).toContain("selection")
      // 402 는 차단기를 연다: 곧바로 다시 물어도 같으므로 '잠시 뒤 다시'를 뺀 변형을 낸다(첫 문단은 같다).
      expect(result.answer).toBe(failure === "402" ? MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER : MODEL_UNAVAILABLE_ANSWER)
      // 측정 흔적: 차단기는 circuit_open. 시간 초과는 예산을 다 쓴 경우만 timeout 으로 세므로, 곧바로 끊긴 흉내(AbortError)는 error 다.
      expect(result.modelState).toBe(failure === "402" ? "circuit_open" : "error")
      expect(result.answer).not.toContain(draft.answer.split("\n\n")[0])
      expect(result.answerMode).toBe("handoff")
      expect(result.needsHandoff).toBe(true)
      expect(result.handoffIntent).toBeTruthy()
      expect(result.unresolved).toBe(true)
      expect(result.sources).toHaveLength(0)
      expect(result.confidence).toBeLessThanOrEqual(0.2)
      // '못 찾음'이 아니다: 두 번째 검색(목차 고르기)을 부르지 않는다.
      expect(result.answer).not.toContain(NO_SOURCE_FACT_ANSWER.split("\n\n")[0])
      expect(calls).not.toContain("outline")
      expect(result.secondChance.secondChance).toBe("none")
    })
  }

  it("고정 문구 답은 답 캐시에 넣지 않아, 모델이 살아나면 다음 요청에서 다시 고른다", async () => {
    stubModel({ selection: "500" })
    const first = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(first.answer).toBe(MODEL_UNAVAILABLE_ANSWER)

    const healthy = stubModel({ selection: [1] })
    const second = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(healthy.calls).toContain("selection")
    expect(second.answerMode).toBe("direct_answer")
    expect(second.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })

  it("스트림 경로도 같은 답·같은 연결 표시를 내고, 확인 전에 조각을 delta 로 흘리지 않는다", async () => {
    for (const question of [IN_VOCAB_QUESTION, "급해요 ㅠㅠ 학생 계정은 따로 만들어 줘야 하나요", "학생 계정 따로 만들어야 하냐고요!!"]) {
      // 스트림을 먼저 돌린다(일반 경로가 캐시를 남기면 차이가 가려진다. 이 답은 캐시되지 않지만 순서를 지킨다).
      stubModel({ selection: "500" })
      const stream = await collectStream(question)
      stubModel({ selection: "500" })
      const normal = await evaluateChatbotQuery(question)

      expect(normal.answer, question).toContain(MODEL_UNAVAILABLE_HEAD)
      expect(stream.answer, question).toBe(normal.answer)
      expect(stream.deltas, question).toHaveLength(0)
      expect(stream.meta?.answerMode, question).toBe(normal.answerMode)
      expect(stream.meta?.needsHandoff, question).toBe(true)
      expect(stream.meta?.unresolved, question).toBe(true)
      expect(stream.meta?.handoffIntent, question).toBe(normal.handoffIntent)
    }
  })

  it("스트림 경로의 고정 문구 답도 캐시하지 않는다", async () => {
    stubModel({ selection: "500" })
    await collectStream(IN_VOCAB_QUESTION)
    const healthy = stubModel({ selection: [1] })
    const again = await collectStream(IN_VOCAB_QUESTION)
    expect(healthy.calls).toContain("selection")
    expect(again.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })

  it("선별이 설정으로 꺼진 경우(키 없음·CHATBOT_FINAL_ANSWER_LLM=off)는 기존 동작 그대로다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    const baseline = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { generateAnswer: false })
    const { calls } = stubModel({ selection: "500" })
    const noKey = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(noKey.answer).toBe(baseline.answer)
    expect(calls).toHaveLength(0)

    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "off")
    __clearAnswerCacheForTests()
    const off = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(off.answer).toBe(baseline.answer)
  })

  it("큐레이션 출처(점수 240 이상) 틀 답은 선별이 실패해도 그대로 낸다", async () => {
    const question = "세금계산서 발행 어떻게 받아요"
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(baseline.sources[0]?.score ?? 0).toBeGreaterThanOrEqual(240)
    stubModel({ selection: "500", verdict: "answers" })
    const result = await evaluateChatbotQuery(question)
    expect(result.answer).toBe(baseline.answer)
  })

  it("정해 둔 답은 관문 호출이 실패해도(건너뜀) 기존 답 그대로다", async () => {
    const question = "전자칠판 꼭 사야하나요?"
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    stubModel({ selection: "500", gate: "500" })
    const result = await evaluateChatbotQuery(question)
    expect(result.answerGate.gate).toBe("skipped")
    expect(result.answer).toBe(baseline.answer)
  })

  it("관문이 버린 뒤 문서 경로의 선별 호출이 실패하면 '못 찾음'을 단정하지 않고 고정 문구를 낸다", async () => {
    const question = "전자칠판 꼭 사야하나요?"
    const { calls } = stubModel({ verdict: "off_target", selection: "500" })
    const result = await evaluateChatbotQuery(question)
    expect(result.answerGate.gate).toBe("rejected")
    expect(calls).toContain("selection")
    expect(result.answer).toContain(MODEL_UNAVAILABLE_HEAD)
    expect(result.answer).not.toContain(NO_SOURCE_FACT_ANSWER.split("\n\n")[0])
    expect(result.needsHandoff).toBe(true)
    expect(result.unresolved).toBe(true)
    expect(result.sources).toHaveLength(0)
    expect(calls).not.toContain("outline")
  })

  it("내부 CS 경로(includeInternalDocs)는 바꾸지 않는다", async () => {
    stubModel({ selection: "500" })
    const result = await evaluateChatbotQuery(IN_VOCAB_QUESTION, { includeInternalDocs: true })
    expect(result.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })
})

describe("결제·인증 실패(401·402·403) 차단기", () => {
  beforeEach(() => {
    disableSupabase()
    vi.stubEnv("GEMINI_API_KEY", "test-secret-key-value")
    vi.stubEnv("CHATBOT_ANSWER_GATE", "")
    vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", "")
    vi.stubEnv("CHATBOT_SECOND_CHANCE", "")
    __clearAnswerGateCacheForTests()
    __clearAnswerCacheForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const generateCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes("generativelanguage.googleapis.com")).length

  it("402 한 번이면 같은 요청에서 체인의 다음 모델로 넘어가지 않고, 다음 요청은 fetch 없이 같은 고정 문구를 낸다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const { fetchMock, calls } = stubModel({ selection: "402" })

    const first = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(first.answer).toBe(MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER)
    expect(first.answer).not.toContain("잠시 뒤 다시")
    expect(first.modelState).toBe("circuit_open")
    // 선별 호출 한 번(첫 모델)만 나가고 폴백 모델로 넘어가지 않는다.
    expect(calls.filter((call) => call === "selection")).toHaveLength(1)
    expect(isModelCircuitOpen()).toBe(true)

    const before = generateCalls(fetchMock)
    __clearAnswerCacheForTests()
    const second = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(generateCalls(fetchMock)).toBe(before)
    expect(second.answer).toBe(MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER)
    expect(second.needsHandoff).toBe(true)

    // 열릴 때 한 번만 운영자용 문장을 남기고, 키 값은 찍지 않는다.
    expect(errorLog).toHaveBeenCalledTimes(1)
    const message = String(errorLog.mock.calls[0][0])
    expect(message).toContain("402")
    expect(message).toContain("Gemini 결제 크레딧 소진 또는 키 인증 실패로 보임")
    expect(message).toContain("60초")
    expect(message).not.toContain("test-secret-key-value")
  })

  it("401·403 도 차단기를 연다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    for (const status of [401, 403]) {
      __resetCircuit()
      const fetchMock = vi.fn(async () => ({ ok: false, status, json: async () => ({}), text: async () => "denied" }))
      vi.stubGlobal("fetch", fetchMock)
      const ids = await selectAnsweringSentenceIds({ question: "질문", sentences: [{ id: 1, text: "문장", sourceIndex: 0, label: "문서 / 절" }] })
      expect(ids).toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(isModelCircuitOpen(), String(status)).toBe(true)
    }
  })

  it("60초가 지나면 한 번만 다시 시도하고, 성공하면 닫힌다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"))
    stubModel({ selection: "402" })
    await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(isModelCircuitOpen()).toBe(true)

    vi.setSystemTime(new Date(Date.now() + MODEL_CIRCUIT_OPEN_MS - 1_000))
    expect(isModelCircuitOpen()).toBe(true)
    vi.setSystemTime(new Date(Date.now() + 1_001))
    expect(isModelCircuitOpen()).toBe(false)

    const healthy = stubModel({ selection: [1] })
    __clearAnswerCacheForTests()
    const result = await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    expect(healthy.calls.filter((call) => call === "selection")).toHaveLength(1)
    expect(result.answerMode).toBe("direct_answer")
    expect(isModelCircuitOpen()).toBe(false)
  })

  it("60초 뒤 시험 호출이 다시 402 면 60초 더 닫아 두고, 다시 열릴 때 로그를 한 번 더 남긴다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"))
    const { calls } = stubModel({ selection: "402" })
    await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    vi.setSystemTime(new Date(Date.now() + MODEL_CIRCUIT_OPEN_MS + 1))
    __clearAnswerCacheForTests()
    await evaluateChatbotQuery(IN_VOCAB_QUESTION)
    // 시험 호출 한 번만 더 나갔다.
    expect(calls.filter((call) => call === "selection")).toHaveLength(2)
    expect(isModelCircuitOpen()).toBe(true)
    expect(errorLog).toHaveBeenCalledTimes(2)
  })

  it("시험 호출이 나가 있는 동안 다른 호출은 보내지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"))
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 402, json: async () => ({}), text: async () => "" })))
    const sentences = [{ id: 1, text: "문장", sourceIndex: 0, label: "문서 / 절" }]
    await selectAnsweringSentenceIds({ question: "질문", sentences })
    vi.setSystemTime(new Date(Date.now() + MODEL_CIRCUIT_OPEN_MS + 1))

    let release: (value: unknown) => void = () => {}
    const fetchMock = vi.fn(
      () => new Promise((resolve) => (release = () => resolve(evidenceSelectionResponse([1]))))
    )
    vi.stubGlobal("fetch", fetchMock)
    const probe = selectAnsweringSentenceIds({ question: "질문", sentences })
    const other = await selectAnsweringSentenceIds({ question: "다른 질문", sentences })
    expect(other).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(undefined)
    expect(await probe).toEqual([1])
    expect(isModelCircuitOpen()).toBe(false)
  })

  it("429·500·시간 초과·404 는 차단기를 열지 않는다(기존 재시도·폴백 유지)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const sentences = [{ id: 1, text: "문장", sourceIndex: 0, label: "문서 / 절" }]
    for (const status of [429, 500, 503, 404]) {
      const fetchMock = vi.fn(async () => ({ ok: false, status, json: async () => ({}), text: async () => "" }))
      vi.stubGlobal("fetch", fetchMock)
      expect(await selectAnsweringSentenceIds({ question: "질문", sentences })).toBeNull()
      // 체인의 다음 모델까지 시도한다.
      expect(fetchMock.mock.calls.length, String(status)).toBeGreaterThan(1)
      expect(isModelCircuitOpen(), String(status)).toBe(false)
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
    )
    expect(await selectAnsweringSentenceIds({ question: "질문", sentences })).toBeNull()
    expect(isModelCircuitOpen()).toBe(false)
    expect(errorLog).not.toHaveBeenCalled()
  })

  it("차단기가 열린 동안 관문은 부르지 않고 건너뛰어(model_unavailable) 정해 둔 답을 유지한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const question = "전자칠판 꼭 사야하나요?"
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    stubModel({ selection: "402" })
    await selectAnsweringSentenceIds({ question: "질문", sentences: [{ id: 1, text: "문장", sourceIndex: 0, label: "문서 / 절" }] })
    expect(isModelCircuitOpen()).toBe(true)

    const { calls } = stubModel({ verdict: "off_target" })
    const result = await evaluateChatbotQuery(question)
    expect(calls).toHaveLength(0)
    expect(result.answerGate).toMatchObject({ gate: "skipped", skipReason: "model_unavailable" })
    expect(result.answer).toBe(baseline.answer)
  })

  it("관문 호출이 402 를 받으면 그 판정도 model_unavailable 로 건너뛰고 기존 답을 낸다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const question = "전자칠판 꼭 사야하나요?"
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    const { calls } = stubModel({ gate: "402" })
    const result = await evaluateChatbotQuery(question)
    expect(calls.filter((call) => call === "gate")).toHaveLength(1)
    expect(result.answerGate).toMatchObject({ gate: "skipped", skipReason: "model_unavailable" })
    expect(result.answer).toBe(baseline.answer)
  })

  it("차단기 때문에 관문이 판정 없이 건너뛴 것도 차단 알림(측정 스크립트의 geminiBlocked)으로 센다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    let blocked = 0
    setModelCircuitBlockedListener(() => {
      blocked += 1
    })
    try {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 402, json: async () => ({}), text: async () => "" }))
      vi.stubGlobal("fetch", fetchMock)
      const first = await checkPreparedAnswer({ question: "녹화 기능 있나요", answer: "녹화 기능이 있어요.", original: "basics:x" })
      expect(first).toMatchObject({ gate: "skipped", skipReason: "model_unavailable" })
      expect(isModelCircuitOpen()).toBe(true)
      const sent = fetchMock.mock.calls.length
      expect(blocked).toBe(0)

      const second = await checkPreparedAnswer({ question: "숙제 내는 방법", answer: "숙제는 이렇게 내요.", original: "guide:y" })
      expect(second).toMatchObject({ gate: "skipped", skipReason: "model_unavailable" })
      expect(fetchMock.mock.calls.length).toBe(sent)
      expect(blocked).toBe(1)
    } finally {
      setModelCircuitBlockedListener(null)
    }
  })

  it("차단기 때문에 두 번째 검색을 못 돌렸으면 '못 찾음'을 단정하지 않고 고정 문구와 상담 버튼을 낸다(일반·스트림)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const question = "양자암호 지원하나요"
    // 모델 없이도 '못 찾음'으로 끝나는 질문(두 번째 검색 대상)이다.
    const baseline = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(baseline.answer).toContain(NO_SOURCE_FACT_ANSWER.split("\n\n")[0])

    for (const path of ["normal", "stream"] as const) {
      __resetCircuit()
      __clearAnswerCacheForTests()
      stubModel({ selection: "402" })
      await selectAnsweringSentenceIds({ question: "질문", sentences: [{ id: 1, text: "문장", sourceIndex: 0, label: "문서 / 절" }] })
      expect(isModelCircuitOpen()).toBe(true)
      const { calls } = stubModel({ selection: [1] })

      if (path === "normal") {
        const result = await evaluateChatbotQuery(question)
        expect(calls, path).toHaveLength(0)
        expect(result.secondChance).toMatchObject({ secondChance: "miss", reason: "model_unavailable" })
        expect(result.answer, path).toContain(MODEL_UNAVAILABLE_HEAD)
        expect(result.answer, path).not.toContain(NO_SOURCE_FACT_ANSWER.split("\n\n")[0])
        expect(result.answerMode, path).toBe("handoff")
        expect(result.needsHandoff, path).toBe(true)
        expect(result.unresolved, path).toBe(true)
      } else {
        const stream = await collectStream(question)
        __resetCircuit()
        __clearAnswerCacheForTests()
        stubModel({ selection: "402" })
        await selectAnsweringSentenceIds({ question: "질문", sentences: [{ id: 1, text: "문장", sourceIndex: 0, label: "문서 / 절" }] })
        const normal = await evaluateChatbotQuery(question)
        expect(stream.answer, path).toBe(normal.answer)
        expect(stream.meta?.answerMode, path).toBe("handoff")
        expect(stream.meta?.needsHandoff, path).toBe(true)
        expect(stream.meta?.handoffIntent, path).toBe(normal.handoffIntent)
      }
    }

    // 이 답은 캐시하지 않아, 차단기가 닫히면 다음 요청에서 두 번째 검색을 다시 돌린다.
    __resetCircuit()
    const healthy = stubModel({ selection: [1] })
    const again = await evaluateChatbotQuery(question)
    expect(healthy.calls).toContain("outline")
    expect(again.answer).not.toContain(MODEL_UNAVAILABLE_HEAD)
  })

  it("차단기가 닫힌 상태의 일시 실패(500)로 두 번째 검색을 끝내지 못하면 '못 찾음' 대신 '지금 확인하지 못함'(잠시 뒤 다시)을 낸다", async () => {
    // 2026-11-20 조사 G4: 시간 초과·오류 뒤의 '찾지 못했어요'가 진짜 못 찾음과 구별되지 않았다.
    const question = "양자암호 지원하나요"
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "" }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await evaluateChatbotQuery(question)
    expect(isModelCircuitOpen()).toBe(false)
    expect(result.secondChance).toMatchObject({ secondChance: "miss", reason: "error" })
    expect(result.answer).toBe(MODEL_UNAVAILABLE_ANSWER)
    expect(result.answer).not.toContain(NO_SOURCE_FACT_ANSWER.split("\n\n")[0])
    expect(result.needsHandoff).toBe(true)
    expect(result.modelState).toBe("error")
  })

  it("임베딩도 차단 중에는 네트워크 없이 null 을 돌려준다(호출부는 낱말 검색으로 이어 간다)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const denied = vi.fn(async () => ({ ok: false, status: 402, json: async () => ({}), text: async () => "" }))
    vi.stubGlobal("fetch", denied)
    expect(await embedText("질문", "RETRIEVAL_QUERY")).toBeNull()
    expect(isModelCircuitOpen()).toBe(true)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await embedText("질문", "RETRIEVAL_QUERY")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
